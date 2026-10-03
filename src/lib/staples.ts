import type { FormatConfig, ScryfallCard } from "./types";
import { evaluateDeck, unionIdentity, type BuildMode, type BuiltDeck, type CardFeatures } from "./competitive-builder";
import { CATEGORY_LABELS } from "./deck-score";
import { duelPresenceForIdentity } from "./duel-profiles";
import { referenceShare } from "./duel-reference";
import type { ComboDef } from "./combos";
import { GAME_CHANGER_NAMES } from "@/data/game-changers";
import { STAPLES_BY_ROLE } from "@/data/competitive-staples";

/**
 * STAPLES MANQUANTS (03/10/2026, demande de Ben : « indiquer s'il y a des
 * staples qui manquent dans le deck pour le rendre encore plus puissant »).
 *
 * Une « staple » ici = une carte de référence pour le format, d'après une de
 * ces sources (chacune avec ses limites, rappelées dans l'UI) :
 * - la liste officielle des Game Changers (src/data/game-changers.ts) ;
 * - la liste curatée de staples par rôle (src/data/competitive-staples.ts —
 *   rédigée de mémoire, pas tirée d'une statistique) ;
 * - en Duel : les cartes jouées par au moins 30% des decks de tournoi des
 *   mêmes couleurs, ou par au moins 50% des decks de tournoi de CE
 *   commandant (données mtgtop8) ;
 * - en multi : les 300 cartes les plus jouées selon le rang EDHREC renvoyé
 *   par Scryfall.
 *
 * Pour chaque staple absente du deck — possédée ou non — on calcule ce que
 * donnerait l'ÉCHANGE avec la carte la plus faible du deck (un terrain de
 * base pour une staple-terrain), avec la même formule de tier que partout :
 * le gain affiché est exact pour cette formule, pas une estimation à part.
 * Une staple sans gain d'indice reste listée si les decks de tournoi la
 * jouent massivement (le tier ne voit pas tout), mais après les autres.
 */

export interface MissingStaple {
  name: string;
  card: ScryfallCard;
  owned: boolean;
  /** Pourquoi c'est une staple, en clair. */
  reasons: string[];
  /** Variation de l'indice de puissance si on l'échange avec `replaces`. */
  tierGain: number;
  /** Variation du score de complétude pour le même échange. */
  scoreGain: number;
  /** Carte du deck qu'elle remplacerait. */
  replaces: string | null;
  /** Part des decks de tournoi de ces couleurs qui la jouent (Duel), 0 sinon. */
  presence: number;
}

const CURATED = new Map<string, string>();
const ROLE_LABEL: Record<string, string> = {
  fastMana: "mana rapide",
  tutor: "tutor",
  interaction: "interaction",
  draw: "pioche",
  winCondition: "condition de victoire",
};
for (const [role, names] of Object.entries(STAPLES_BY_ROLE)) for (const n of names) if (!CURATED.has(n.toLowerCase())) CURATED.set(n.toLowerCase(), role);
const GAME_CHANGERS = new Set(GAME_CHANGER_NAMES.map((n) => n.toLowerCase()));

const BASIC_NAMES = ["plains", "island", "swamp", "mountain", "forest", "wastes"];

export function missingStaples(input: {
  deck: BuiltDeck;
  features: Map<string, CardFeatures>;
  owned: Map<string, number>;
  basics: Map<string, ScryfallCard>;
  format: FormatConfig;
  mode: BuildMode;
  combos: readonly ComboDef[];
  max?: number;
}): MissingStaple[] {
  const { deck, features, owned, basics, format, mode, combos } = input;
  const max = input.max ?? 8;
  const identity = unionIdentity(deck.commanders);
  const inDeck = new Set(deck.cards.map((c) => c.name.toLowerCase()));
  const commanderKeys = new Set(deck.commanders.map((c) => c.name.toLowerCase()));
  const duel = mode === "duel";

  interface Candidate {
    f: CardFeatures;
    reasons: string[];
    presence: number;
    prior: number;
  }
  const candidates: Candidate[] = [];
  for (const f of features.values()) {
    if (f.isBasic || inDeck.has(f.key) || commanderKeys.has(f.key)) continue;
    if (!f.card.color_identity.every((c) => identity.includes(c))) continue;
    const reasons: string[] = [];
    let prior = 0;
    if (GAME_CHANGERS.has(f.key) || f.tier.gameChanger) {
      reasons.push("Game Changer (liste officielle)");
      prior += duel ? 0.5 : 3;
    }
    const role = CURATED.get(f.key);
    if (role) {
      reasons.push(`Staple « ${ROLE_LABEL[role] ?? role} » (liste curatée du site)`);
      prior += 1.5;
    }
    let presence = 0;
    if (duel) {
      presence = duelPresenceForIdentity(f.card.name, f.card.color_identity, identity);
      if (presence >= 0.3) {
        reasons.push(`Jouée par ${Math.round(presence * 100)} % des decks de tournoi Duel de ces couleurs`);
        prior += presence * 4;
      }
      const share = referenceShare(deck.reference, f.card.name);
      if (share >= 0.5 && deck.reference) {
        reasons.push(`Dans ${Math.round(share * 100)} % des decks de tournoi de ce commandant`);
        prior += share * 3;
      }
    } else if (typeof f.card.edhrec_rank === "number" && f.card.edhrec_rank > 0 && f.card.edhrec_rank <= 300) {
      reasons.push(`Parmi les 300 cartes les plus jouées en Commander (rang EDHREC ${f.card.edhrec_rank})`);
      prior += 1;
    }
    if (reasons.length === 0) continue;
    candidates.push({ f, reasons, presence, prior });
  }
  // L'échange coûte un recalcul complet du deck : on ne l'évalue que pour les 40 plus plausibles.
  candidates.sort((a, b) => b.prior - a.prior || a.f.card.name.localeCompare(b.f.card.name));

  // Carte qui sortirait : la dernière choisie par le moteur (hors pièces verrouillées) ; un terrain de base pour un terrain.
  const weakest = [...deck.picks].reverse().find((p) => !p.locked && inDeck.has(p.key)) ?? null;
  const basicInDeck = deck.cards.find((c) => BASIC_NAMES.includes(c.name.toLowerCase()) && c.count > 0) ?? null;
  const baseIndex = deck.tier.powerIndex;
  const baseScore = deck.stats.score;

  const out: MissingStaple[] = [];
  for (const c of candidates.slice(0, 40)) {
    const replaces = c.f.isLand ? basicInDeck?.name ?? null : weakest?.name ?? null;
    let tierGain = 0;
    let scoreGain = 0;
    if (replaces) {
      const list = deck.cards.map((x) => ({ ...x }));
      const r = list.findIndex((x) => x.name === replaces);
      if (r >= 0) {
        list[r].count--;
        if (list[r].count <= 0) list.splice(r, 1);
        list.push({ name: c.f.card.name, count: 1 });
        const ev = evaluateDeck(list, deck.commanders, features, basics, format, combos);
        tierGain = Math.round((ev.tier.powerIndex - baseIndex) * 10) / 10;
        scoreGain = Math.round((ev.stats.score - baseScore) * 10) / 10;
      }
    }
    const roles = c.f.categories.map((cat) => CATEGORY_LABELS[cat]);
    out.push({
      name: c.f.card.name,
      card: c.f.card,
      owned: (owned.get(c.f.key) ?? 0) > 0,
      reasons: roles.length ? [...c.reasons, `Rôle : ${roles.join(", ")}`] : c.reasons,
      tierGain,
      scoreGain,
      replaces,
      presence: Math.round(c.presence * 100) / 100,
    });
  }
  // Ce qui améliore le tier d'abord ; ensuite ce que les tournois jouent le plus ; les échanges perdants en dernier.
  out.sort((a, b) => b.tierGain - a.tierGain || b.presence - a.presence || b.scoreGain - a.scoreGain || a.name.localeCompare(b.name));
  // Un échange qui fait BAISSER l'indice n'est pas une amélioration : écarté, sauf carte massivement jouée en tournoi.
  return out.filter((s) => s.tierGain > 0 || (s.tierGain >= 0 && s.scoreGain > 0) || s.presence >= 0.3).slice(0, max);
}

import { foldName } from "./card-name";
import type { CardSuggestion, EnrichedCard, FormatConfig, ScryfallCard } from "./types";
import { classifyCard } from "./deck-score";
import { getCardsByNames } from "./scryfall";
import { isLegalInFormat } from "./collection-builder";
import { duelCardsForIdentity } from "./duel-profiles";
import { referenceFor } from "./duel-reference";
import { auditDeckFromCards, auditItem, functionalGroup, multiplayerOnly, ROLE_GROUP_LABELS, structureNeed, type DeckAudit } from "./deck-audit";
import { ownShape, RECIPES, ROLE_LABELS, type Recipe } from "./deck-trends";
import { unmetDependencies } from "./dependencies";

/**
 * SUGGESTIONS DE LA PAGE DE DECK EN DUEL (04/10/2026, retour de Ben : « il y a
 * encore des cartes contre-productives dans tes suggestions »).
 *
 * Le moteur de suggestions d'origine (recommend.ts) cherche des cartes pour le
 * PILIER le plus faible du deck (rampe, tutor, protection...) et les classe
 * par puissance générale. En Duel, cela proposait des cartes qui cochent une
 * case sans avoir leur place dans le deck — et, appliqué en boucle par
 * « Super Opti », défaisait la cohérence du deck.
 *
 * Ici, une suggestion doit satisfaire trois conditions :
 * 1. être une carte que les decks de TOURNOI jouent — ceux de ce commandant
 *    (duel-reference.ts) ou de ces couleurs (duel-profiles.ts) ;
 * 2. ne pas être contre-productive dans CE deck (mécanique multijoueur,
 *    recherche sans cible : mêmes contrôles que deck-audit.ts) ;
 * 3. valoir nettement mieux que la carte qu'elle remplace. La carte à sortir
 *    est choisie dans le MÊME rôle quand c'est possible (une réponse contre
 *    une réponse), en commençant par les cartes que la lecture du deck juge
 *    à revoir, pour ne pas déformer le deck.
 *
 * Valeur d'une carte = qualité (card-quality.ts) + 12 × part des decks de
 * tournoi de ce commandant qui la jouent + ce que la forme du deck demande
 * encore (structureNeed). Même base que le constructeur (duelCardScore).
 *
 * Limites : les candidates viennent des decks de tournoi connus, donc une
 * bonne carte que personne ne joue en tournoi n'est jamais suggérée ; et la
 * liste dépend de Scryfall pour le texte des cartes (≤ 2 requêtes groupées).
 */

const REFERENCE_WEIGHT = 12;
/** Écart de valeur minimal pour proposer un échange. */
const MIN_GAIN = 1;
const MAX_CANDIDATE_NAMES = 150;
const MAX_LAND_SUGGESTIONS = 3;

function recipeFor(commanders: ScryfallCard[], audit: DeckAudit): Recipe | null {
  const own = ownShape(commanders.map((c) => c.name));
  if (own) return own;
  return RECIPES.find((r) => r.label === audit.line.style) ?? null;
}

export async function suggestDuelImprovements(
  currentCards: EnrichedCard[],
  colorIdentity: string[],
  format: FormatConfig,
  commanders: ScryfallCard[],
  maxSuggestions: number
): Promise<{ suggestions: CardSuggestion[]; audit: DeckAudit }> {
  const resolved = currentCards.filter((c): c is EnrichedCard & { card: ScryfallCard } => c.card !== null);
  const audit = auditDeckFromCards(resolved.map((c) => ({ card: c.card, count: c.count })), commanders, "duel");
  const reference = referenceFor(commanders.map((c) => c.name));
  const recipe = recipeFor(commanders, audit);
  const inDeck = new Set(currentCards.map((c) => foldName(c.name).split(" // ")[0]));
  const commanderKeys = new Set(commanders.map((c) => foldName(c.name).split(" // ")[0]));

  // --- Candidates : cartes des decks de tournoi absentes du deck ---
  const prior = new Map<string, number>();
  if (reference) {
    for (const [key, v] of reference.shares) if (v.share >= 0.25) prior.set(key, v.share * 2);
  }
  for (const c of duelCardsForIdentity(colorIdentity, 0.15)) prior.set(c.name, Math.max(prior.get(c.name) ?? 0, c.presence));
  const names = Array.from(prior.entries())
    .filter(([n]) => !inDeck.has(n) && !commanderKeys.has(n))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CANDIDATE_NAMES)
    .map(([n]) => n);
  if (names.length === 0) return { suggestions: [], audit };

  let cards: ScryfallCard[] = [];
  try {
    const got = await getCardsByNames(names, { fuzzyFallback: false });
    const byName = new Map<string, ScryfallCard>();
    for (const c of got.values()) byName.set(c.name, c);
    cards = Array.from(byName.values());
  } catch {
    return { suggestions: [], audit };
  }

  // --- Valeur des cartes du deck (pour choisir ce qui sort) ---
  const deckCards = resolved.map((c) => c.card);
  interface Held {
    entry: EnrichedCard & { card: ScryfallCard };
    value: number;
    /** Rôle fonctionnel (hors plan) : on échange une réponse contre une réponse. */
    fn: string;
    isLand: boolean;
    basic: boolean;
  }
  const held: Held[] = resolved.map((entry) => {
    const it = auditItem(entry.card, entry.count, "duel", colorIdentity, reference);
    const v = audit.verdicts[entry.card.name.toLowerCase()];
    const flag = v?.level === "contre-productif" ? 10 : v?.level === "discutable" ? 4 : 0;
    return {
      entry,
      value: it.quality.score + it.refShare * REFERENCE_WEIGHT - flag,
      fn: functionalGroup(it),
      isLand: it.isLand,
      basic: Boolean(entry.card.type_line?.includes("Basic")),
    };
  });
  const roles = audit.counts.roles;

  // --- Classement des candidates ---
  const scored = cards
    .filter((card) => isLegalInFormat(card, format) && card.color_identity.every((c) => colorIdentity.includes(c)))
    .filter((card) => !inDeck.has(foldName(card.name).split(" // ")[0]) && !commanderKeys.has(foldName(card.name).split(" // ")[0]))
    .filter((card) => (multiplayerOnly(card)?.severity ?? 0) < 0.5)
    .filter((card) => !unmetDependencies([...deckCards, card], commanders).some((u) => u.name === card.name && u.dependency.kind !== "tribe"))
    .map((card) => {
      const it = auditItem(card, 1, "duel", colorIdentity, reference);
      const need = !it.isLand && recipe ? structureNeed(it.roles, recipe, roles, it.quality.score) : { score: 0, fills: null };
      return { card, it, need, value: it.quality.score + it.refShare * REFERENCE_WEIGHT + need.score };
    })
    .sort((a, b) => b.value - a.value);

  const used = new Set<string>();
  const suggestions: CardSuggestion[] = [];
  let lands = 0;
  for (const s of scored) {
    if (suggestions.length >= maxSuggestions) break;
    if (s.it.isLand && lands >= MAX_LAND_SUGGESTIONS) continue;
    // Ce qui sort : un terrain contre un terrain (de base d'abord s'il y en a beaucoup) ; sinon même rôle, puis la carte la plus faible.
    const pool = held.filter((h) => !used.has(h.entry.name.toLowerCase()) && h.isLand === s.it.isLand);
    const sameRole = s.it.isLand
      ? pool.filter((h) => !h.basic || pool.filter((x) => x.basic).reduce((n, x) => n + x.entry.count, 0) > 6)
      : pool.filter((h) => h.fn === functionalGroup(s.it));
    const pick = (list: Held[]) => [...list].sort((a, b) => a.value - b.value)[0];
    let out = pick(sameRole.length ? sameRole : pool);
    if (out && s.value - out.value < MIN_GAIN && sameRole.length) out = pick(pool);
    if (!out || s.value - out.value < MIN_GAIN) continue;
    used.add(out.entry.name.toLowerCase());
    if (s.it.isLand) lands++;

    const why: string[] = [];
    if (s.it.refShare >= 0.25 && reference) why.push(`Dans ${Math.round(s.it.refShare * 100)} % des ${reference.deckCount} decks de tournoi de ce commandant`);
    if (s.it.presence >= 0.1) why.push(`jouée par ${Math.round(s.it.presence * 100)} % des decks de tournoi de ces couleurs`);
    if (s.need.fills) why.push(`comble un manque de la forme du deck (${ROLE_LABELS[s.need.fills] ?? s.need.fills})`);
    const outVerdict = audit.verdicts[out.entry.card.name.toLowerCase()];
    const outWhy =
      outVerdict && outVerdict.level !== "ok" && outVerdict.level !== "contre-intuitif" && outVerdict.note
        ? outVerdict.note
        : out.basic
          ? "Un terrain de base cède sa place : le deck en garde assez."
          : `La carte la moins solide ${s.it.isLand ? "parmi les terrains" : `du groupe « ${ROLE_GROUP_LABELS[outVerdict?.group ?? "autre"]} »`} (qualité ${outVerdict?.quality ?? "?"}/10${outVerdict && outVerdict.basis === "texte" ? ", jamais vue en tournoi" : ""}).`;
    const sentence = why.join(" ; ");
    suggestions.push({
      card: s.card,
      categories: classifyCard(s.card),
      reason: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`,
      impact: Math.round((s.value - out.value) * 10) / 10,
      swapOut: { name: out.entry.name, reason: outWhy },
    });
  }
  return { suggestions, audit };
}

/**
 * Indice simple d'un deck Duel pour « Super Opti » (0-100) : qualité moyenne
 * des cartes, forme, cohérence — les trois mesures de deck-audit.ts, sans
 * parties simulées. Un échange n'est gardé que s'il fait monter cet indice.
 */
export function duelAuditIndex(audit: DeckAudit): number {
  const quality = Math.max(0, Math.min(100, ((audit.avgQuality - 3.5) / 5) * 100));
  return Math.round((0.5 * quality + 0.25 * audit.structure + 0.25 * audit.coherence) * 10) / 10;
}

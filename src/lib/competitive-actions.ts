"use server";

import type { ScryfallCard } from "./types";
import { getFormat } from "./formats";
import { BASIC_LAND_BY_COLOR, isCommanderEligible, isLegalInFormat } from "./collection-builder";
import {
  buildDeckForCommander,
  buildFeatureIndex,
  modeForFormat,
  rankProposals,
  TIER4_THRESHOLD,
  type BuiltDeck,
  type CommanderCandidate,
  type DeckProposal,
} from "./competitive-builder";
import type { DeckTierResult } from "./deck-tier";
import { getCardsByNames, getDisplayImageUrl, searchCards } from "./scryfall";
import { synergySearchQueries } from "./synergy";
import { allComboPieceNames } from "./combos";
import { duelMetaCardNames, duelMetaCommanderNames, DUEL_META_INFO } from "./duel-meta";
import { GAME_CHANGER_NAMES } from "@/data/game-changers";
import { HIGH_POWER_COMMANDERS, STAPLES_BY_ROLE } from "@/data/competitive-staples";
import { analyzeDeck, type DeckAnalysisResult } from "./actions";

/**
 * Server Actions du constructeur compétitif (25/09/2026, demande de Ben —
 * voir competitive-builder.ts pour le moteur, et le README pour le
 * parcours complet). Fichier séparé d'actions.ts (déjà ~1300 lignes) :
 * même conventions (fonctions "use server", erreurs Scryfall rattrapées en
 * message lisible), mais une fonctionnalité autonome.
 */

export type AcquisitionOption = 0 | 5 | 10 | 15 | 25;

export interface ProposalCard {
  name: string;
  reasons: string[];
  tierGain: number;
  gameChanger: boolean;
  priceEur: number | null;
  imageUrl: string | null;
  typeLine: string;
}

export interface ProposalSummary {
  commander: string;
  commanderOwned: boolean;
  source: CommanderCandidate["source"];
  colorIdentity: string[];
  imageUrl: string | null;
  commanderPriceEur: number | null;
  themes: string[];
  tribes: string[];
  /** Deck avec les seules cartes possédées (+ commandant). */
  owned: DeckVariant;
  /** Deck avec le pool recommandé. */
  upgraded: DeckVariant;
  /** Cartes à acquérir pour passer de `owned` à `upgraded`, de la plus impactante à la moins impactante. */
  acquisitions: ProposalCard[];
  acquisitionCostEur: number;
  acquisitionPriceUnknown: number;
  /** Pistes concrètes pour atteindre le Tier 4 (seuil d'indice TIER4_THRESHOLD). */
  pathToTier4: string[];
}

export interface DeckVariant {
  tier: DeckTierResult;
  score: number;
  cards: { name: string; count: number }[];
  ownedCount: number;
}

export interface CompetitiveBuildResult {
  ok: boolean;
  error: string | null;
  formatKey: "commander" | "duelcommander";
  maxAcquisitions: AcquisitionOption;
  collectionCards: { name: string; count: number }[];
  unresolvedNames: string[];
  proposals: ProposalSummary[];
  /** Nombre de commandants considérés / évalués en détail — transparence sur l'étendue de la recherche. */
  candidateCount: number;
  evaluatedCount: number;
  notes: string[];
}

const EMPTY: CompetitiveBuildResult = {
  ok: false,
  error: null,
  formatKey: "commander",
  maxAcquisitions: 15,
  collectionCards: [],
  unresolvedNames: [],
  proposals: [],
  candidateCount: 0,
  evaluatedCount: 0,
  notes: [],
};

function fail(error: string, partial: Partial<CompetitiveBuildResult> = {}): CompetitiveBuildResult {
  return { ...EMPTY, ...partial, ok: false, error };
}

function priceEur(card: ScryfallCard): number | null {
  const v = card.prices?.eur ?? null;
  const n = v ? Number.parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Nombre de propositions renvoyées à l'UI. */
const PROPOSALS_LIMIT = 8;
/** Propositions dont le pool recommandé est élargi par des recherches de synergie (requêtes Scryfall supplémentaires). */
const SYNERGY_SEARCH_TOP = 3;
/** Pages Scryfall de commandants populaires (175 cartes/page). */
const POPULAR_COMMANDER_PAGES = 2;

/**
 * Pistes pour atteindre le Tier 4 à partir des composantes de l'indice
 * (deck-tier.ts) : pour chaque composante loin de son maximum, ce qu'on
 * y gagnerait et comment. Formulé à partir de la formule réelle, pas
 * d'une règle générique.
 */
function pathToTier4(tier: DeckTierResult, isDuel: boolean): string[] {
  // Tier 4 atteint : on montre la marche suivante (Tier 5, indice 80)
  // plutôt qu'une liste vide — même calcul, autre seuil.
  const reached = tier.powerIndex >= TIER4_THRESHOLD;
  const threshold = reached ? 80 : TIER4_THRESHOLD;
  const gap = threshold - tier.powerIndex;
  if (gap <= 0) return [`Indice ${tier.powerIndex}/100 : niveau Tier 5 atteint selon l'heuristique.`];
  const c = tier.components;
  const s = tier.signals;
  const tips: { gain: number; text: string }[] = [];
  if (c.gameChanger < 40) {
    const next = s.gameChangerCount === 0 ? 10 : 6;
    tips.push({ gain: next, text: `Game Changers : ${s.gameChangerCount} dans le deck. Chaque Game Changer supplémentaire rapporte +${next} (plafond 40, atteint à 6).` });
  }
  if (c.fastMana < 15) tips.push({ gain: 3, text: `Mana rapide (rampe à coût ≤ 2) : ${s.fastManaCount}/5 — +3 par source jusqu'à 5.` });
  if (c.combo < 12) tips.push({ gain: c.combo === 0 ? 8 : 4, text: s.combos.length === 0 ? "Aucune combo connue : en assembler une rapporte +8 (+12 pour deux)." : "Une 2e combo rapporterait +4." });
  if (c.tutor < 10) tips.push({ gain: 10 - c.tutor, text: `Tutors : ${s.tutorCount} — jusqu'à +${Math.round((10 - c.tutor) * 10) / 10} en atteignant la cible du format.` });
  if (c.interaction < 10) tips.push({ gain: 10 - c.interaction, text: `Interaction (removal + disruption) : jusqu'à +${Math.round((10 - c.interaction) * 10) / 10}.` });
  if (c.curve < 5) tips.push({ gain: 5 - c.curve, text: `Courbe : coût moyen ${s.avgCmc} — baisser la courbe rapporte jusqu'à +${Math.round((5 - c.curve) * 10) / 10}.` });
  if (isDuel && c.duelMeta < 25) tips.push({ gain: 25 - c.duelMeta, text: `Cartes du méta Duel : présence cumulée ${s.duelMetaSum} — jusqu'à +${Math.round((25 - c.duelMeta) * 10) / 10} en jouant les cartes les plus présentes en tournoi.` });
  tips.sort((a, b) => b.gain - a.gain);
  const head = reached
    ? `Tier 4 atteint (indice ${tier.powerIndex} ≥ ${TIER4_THRESHOLD}). Pour viser le Tier 5 (80), il manque ${Math.round(gap * 10) / 10} points :`
    : `Il manque ${Math.round(gap * 10) / 10} points d'indice pour le Tier 4 (${TIER4_THRESHOLD}/100) :`;
  return [head, ...tips.slice(0, 4).map((t) => t.text)];
}

function variantOf(deck: BuiltDeck, owned: Map<string, number>): DeckVariant {
  return {
    tier: deck.tier,
    score: deck.stats.score,
    cards: deck.cards,
    ownedCount: deck.cards.filter((c) => (owned.get(c.name.toLowerCase()) ?? 0) > 0).reduce((s, c) => s + c.count, 0),
  };
}

function summarize(p: DeckProposal, owned: Map<string, number>, isDuel: boolean): ProposalSummary {
  const acquisitions: ProposalCard[] = p.upgradedDeck.acquisitions.map((a) => ({
    name: a.name,
    reasons: a.reasons,
    tierGain: a.tierGain,
    gameChanger: a.card.game_changer === true,
    priceEur: priceEur(a.card),
    imageUrl: getDisplayImageUrl(a.card, "normal"),
    typeLine: a.card.type_line,
  }));
  const known = acquisitions.filter((a) => a.priceEur !== null);
  const commander = p.candidate.card;
  return {
    commander: commander.name,
    commanderOwned: p.candidate.owned,
    source: p.candidate.source,
    colorIdentity: commander.color_identity,
    imageUrl: getDisplayImageUrl(commander, "normal"),
    commanderPriceEur: p.candidate.owned ? null : priceEur(commander),
    themes: p.ownedDeck.profile.themes.map((t) => t.label),
    tribes: p.ownedDeck.profile.tribes,
    owned: variantOf(p.ownedDeck, owned),
    upgraded: variantOf(p.upgradedDeck, owned),
    acquisitions,
    acquisitionCostEur: Math.round(known.reduce((s, a) => s + (a.priceEur ?? 0), 0) * 100) / 100,
    acquisitionPriceUnknown: acquisitions.length - known.length,
    pathToTier4: pathToTier4(p.upgradedDeck.tier, isDuel),
  };
}

/**
 * Cœur de la fonctionnalité : de la liste importée aux decks proposés.
 * Étapes (requêtes Scryfall entre crochets) :
 * 1. [collection] résolution des cartes importées ;
 * 2. [2 pages + ~2 lots] commandants candidats : ceux de la collection,
 *    les plus populaires du format (`is:commander legal:<format>`), une
 *    liste curatée haute puissance (multi) et les commandants réellement
 *    joués en tournoi (Duel, duel-meta.ts) ;
 * 3. [~8 lots] pool recommandé hors collection : Game Changers, staples par
 *    rôle, pièces de combo, cartes du méta Duel (Duel) ;
 * 4. calcul pur : index des cartes, classement des commandants
 *    (rankProposals, tier d'abord) ;
 * 5. [≤ 3×3 requêtes] pour les 3 meilleures propositions, recherche de
 *    cartes en synergie avec le commandant, et reconstruction du deck
 *    optimisé avec ce pool élargi.
 */
export async function runCompetitiveBuild(input: {
  formatKey: string;
  collectionCards: { name: string; count: number }[];
  maxAcquisitions: AcquisitionOption;
}): Promise<CompetitiveBuildResult> {
  // Entrées venant du client : revalidées ici (une Server Action est un
  // point d'entrée public, quel que soit le formulaire qui l'appelle).
  const allowed: AcquisitionOption[] = [0, 5, 10, 15, 25];
  const maxAcquisitions: AcquisitionOption = allowed.includes(input.maxAcquisitions) ? input.maxAcquisitions : 15;
  input = {
    ...input,
    maxAcquisitions,
    collectionCards: input.collectionCards
      .filter((c) => typeof c?.name === "string" && c.name.trim() && Number.isFinite(c.count) && c.count > 0)
      .slice(0, 5000),
  };
  const format = getFormat(input.formatKey === "duelcommander" ? "duelcommander" : "commander");
  const formatKey = format.key === "duelcommander" ? "duelcommander" : "commander";
  const isDuel = formatKey === "duelcommander";
  const mode = modeForFormat(format);
  const base = { formatKey, maxAcquisitions: input.maxAcquisitions, collectionCards: input.collectionCards } as const;

  if (input.collectionCards.length === 0) return fail("Aucune carte reconnue dans ta liste.", base);

  try {
    // 1. Collection
    const resolved = await getCardsByNames(input.collectionCards.map((c) => c.name));
    if (resolved.size === 0) {
      return fail("Aucune carte de ta liste n'a pu être résolue auprès de Scryfall (service indisponible ?). Réessaie dans quelques instants.", base);
    }
    const unresolvedNames = input.collectionCards.filter((c) => !resolved.has(c.name.toLowerCase())).map((c) => c.name);
    const owned = new Map<string, number>();
    for (const c of input.collectionCards) {
      const card = resolved.get(c.name.toLowerCase());
      if (!card) continue;
      // Clé = nom Scryfall canonique (une saisie approchée a pu être corrigée par la recherche fuzzy).
      const key = card.name.toLowerCase();
      owned.set(key, (owned.get(key) ?? 0) + c.count);
    }
    const ownedCards = Array.from(new Map(Array.from(resolved.values()).map((c) => [c.name.toLowerCase(), c])).values());

    // 2. Commandants candidats
    const [popular, curatedCommanders] = await Promise.all([
      searchCards(`is:commander legal:${format.scryfallLegality}`, POPULAR_COMMANDER_PAGES, "edhrec", "cards"),
      getCardsByNames(isDuel ? duelMetaCommanderNames() : [...HIGH_POWER_COMMANDERS], { fuzzyFallback: false }),
    ]);

    // 3. Pool recommandé
    const poolNames = new Set<string>([
      ...GAME_CHANGER_NAMES,
      ...Object.values(STAPLES_BY_ROLE).flat(),
      ...allComboPieceNames(),
      ...(isDuel ? duelMetaCardNames(0.05) : []),
    ]);
    const [poolCards, basics] = await Promise.all([
      getCardsByNames(Array.from(poolNames), { fuzzyFallback: false }),
      getCardsByNames(Array.from(new Set([...Object.values(BASIC_LAND_BY_COLOR), "Wastes"])), { fuzzyFallback: false }),
    ]);

    const candidatesByName = new Map<string, CommanderCandidate>();
    const addCandidate = (card: ScryfallCard, source: CommanderCandidate["source"]) => {
      const key = card.name.toLowerCase();
      if (candidatesByName.has(key)) return;
      if (!isCommanderEligible(card) || !isLegalInFormat(card, format)) return;
      candidatesByName.set(key, { card, owned: (owned.get(key) ?? 0) > 0, source: (owned.get(key) ?? 0) > 0 ? "collection" : source });
    };
    for (const card of ownedCards) addCandidate(card, "collection");
    for (const card of curatedCommanders.values()) addCandidate(card, isDuel ? "duel-meta" : "high-power");
    for (const card of popular) addCandidate(card, "popular");
    const candidates = Array.from(candidatesByName.values());
    if (candidates.length === 0) {
      return fail("Impossible de trouver un commandant légal pour ce format (service Scryfall indisponible ?).", { ...base, unresolvedNames });
    }

    // 4. Index + classement
    const allCards = [...ownedCards, ...poolCards.values(), ...candidates.map((c) => c.card)];
    const features = buildFeatureIndex(allCards, format);
    const acquirable = new Set<string>();
    for (const card of poolCards.values()) {
      const key = card.name.toLowerCase();
      if ((owned.get(key) ?? 0) <= 0 && features.has(key)) acquirable.add(key);
    }

    const ranked = rankProposals({
      candidates,
      features,
      owned,
      acquirable,
      maxAcquisitions: input.maxAcquisitions,
      format,
      basics,
      maxTrials: 30,
      minOwnedTrials: 8,
    });
    const top = ranked.slice(0, PROPOSALS_LIMIT);

    // 5. Élargissement du pool par la synergie pour les meilleures propositions
    if (input.maxAcquisitions > 0) {
      for (const p of top.slice(0, SYNERGY_SEARCH_TOP)) {
        const queries = synergySearchQueries(p.ownedDeck.profile);
        if (queries.length === 0) continue;
        const id = p.candidate.card.color_identity.join("").toLowerCase() || "c";
        const results = await Promise.all(
          queries.map((q) => searchCards(`${q} id<=${id} legal:${format.scryfallLegality}`, 1, "edhrec", "cards"))
        );
        const extra = results.flat().filter((card) => !features.has(card.name.toLowerCase()));
        if (extra.length === 0) continue;
        for (const [k, f] of buildFeatureIndex(extra, format)) features.set(k, f);
        const extended = new Set(acquirable);
        for (const card of results.flat()) {
          const key = card.name.toLowerCase();
          if ((owned.get(key) ?? 0) <= 0 && features.has(key)) extended.add(key);
        }
        const upgraded = buildDeckForCommander({
          commander: p.candidate.card,
          format,
          mode,
          features,
          owned,
          acquirable: extended,
          maxAcquisitions: input.maxAcquisitions,
          basics,
          profile: p.ownedDeck.profile,
        });
        // On ne garde la version élargie que si elle est au moins aussi forte (tier d'abord, score ensuite).
        if (
          upgraded.tier.powerIndex > p.upgradedDeck.tier.powerIndex ||
          (upgraded.tier.powerIndex === p.upgradedDeck.tier.powerIndex && upgraded.stats.score >= p.upgradedDeck.stats.score)
        ) {
          p.upgradedDeck = upgraded;
        }
      }
    }

    const notes: string[] = [];
    if (isDuel) {
      notes.push(
        `Duel : le tier intègre la présence des cartes dans ${DUEL_META_INFO.deckCount} decks de tournoi mtgtop8 (${DUEL_META_INFO.period ?? "septembre 2026"}) — un échantillon court, à prendre comme un repère.`
      );
    }
    notes.push(
      "Commandant unique seulement : les duos de partenaires / Background ne sont pas encore construits automatiquement."
    );

    return {
      ok: true,
      error: null,
      formatKey,
      maxAcquisitions: input.maxAcquisitions,
      collectionCards: input.collectionCards,
      unresolvedNames,
      proposals: top.map((p) => summarize(p, owned, isDuel)),
      candidateCount: candidates.length,
      evaluatedCount: ranked.length,
      notes,
    };
  } catch (err) {
    console.error("[competitive] échec de construction :", err);
    return fail("Erreur pendant la construction (service Scryfall indisponible ?). Réessaie dans quelques instants.", base);
  }
}

/**
 * Ouvre un deck proposé dans le simulateur (DeckBuilder) : simple délégation
 * à `analyzeDeck` avec la liste déjà construite — aucune reconstruction,
 * donc exactement le deck affiché dans la carte de proposition.
 * `addedNames` : cartes non possédées (en minuscules), pour que le
 * simulateur les marque « ajoutées » (même mécanisme que la reprise CSV).
 */
export async function openProposedDeck(input: {
  formatKey: string;
  commander: string;
  cards: { name: string; count: number }[];
  acquisitionNames: string[];
  label: string;
}): Promise<DeckAnalysisResult & { addedNames: string[] }> {
  const result = await analyzeDeck({
    formatKey: input.formatKey,
    deckName: input.label,
    commanders: [input.commander],
    cards: input.cards,
  });
  return { ...result, addedNames: input.acquisitionNames.map((n) => n.toLowerCase()) };
}

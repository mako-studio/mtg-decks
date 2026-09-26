"use server";

import type { ScryfallCard } from "./types";
import { getFormat } from "./formats";
import { BASIC_LAND_BY_COLOR, isCommanderEligible, isLegalInFormat } from "./collection-builder";
import { hasDeadSingletonSynergy } from "./deck-score";
import {
  buildDeckForCommander,
  buildFeatureIndex,
  candidateKey,
  modeForFormat,
  rankProposals,
  rescoreWithSpellbook,
  sortProposals,
  TIER4_THRESHOLD,
  unionIdentity,
  MAX_DECK_COLORS,
  type BuiltDeck,
  type CandidateSource,
  type CardFeatures,
  type CommanderCandidate,
  type DeckProposal,
} from "./competitive-builder";
import type { DeckTierResult } from "./deck-tier";
import { DUEL_PROFILES_AVAILABLE, DUEL_PROFILES_INFO } from "./duel-profiles";
import {
  getCardsByNames,
  getDisplayImageUrl,
  scryfallRateLimitHits,
  scryfallRateLimitStatus,
  searchCards,
} from "./scryfall";
import { commanderProfile, mergeProfiles, synergySearchQueries } from "./synergy";
import { allComboPieceNames, CURATED_COMBOS, mergeCombos, type ComboDef } from "./combos";
import { duelMetaCardNames, duelMetaCommanderNames, DUEL_META_INFO } from "./duel-meta";
import { canHavePartner, pairLabel } from "./partners";
import { referenceCardNames, type CommanderReference } from "./duel-reference";
import { distinctCombos, estimateBracket, findMyCombos } from "./spellbook";
import { resolveCardNames, type NameCorrection } from "./name-resolution";
import { GAME_CHANGER_NAMES } from "@/data/game-changers";
import { HIGH_POWER_COMMANDERS, STAPLES_BY_ROLE } from "@/data/competitive-staples";
import { analyzeDeck, type DeckAnalysisResult } from "./actions";

/**
 * Server Actions du constructeur compétitif (25/09/2026, demande de Ben —
 * voir competitive-builder.ts pour le moteur, et le README pour le
 * parcours complet). Fichier séparé d'actions.ts : mêmes conventions
 * (fonctions "use server", erreurs rattrapées en message lisible).
 *
 * 2e passage du 25/09/2026 : duos de commandants (partners.ts), résolution
 * tolérante des noms (name-resolution.ts), combos et estimation de bracket
 * Commander Spellbook en direct (spellbook.ts).
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

export interface ProposalCommander {
  name: string;
  owned: boolean;
  priceEur: number | null;
  imageUrl: string | null;
}

export interface ComboOpportunity {
  missing: string[];
  pieces: string[];
  result: string;
  bracketTag?: string;
}

/** Comparaison avec les decks de tournoi de ce commandant (Duel, duel-reference.ts). */
export interface ReferenceSummary {
  label: string;
  deckCount: number;
  /** Part du « cœur » (cartes dans ≥ 50% des decks de tournoi) présente dans chaque version du deck. */
  coverageOwned: number;
  coverageUpgraded: number;
  coreSize: number;
  /** Cartes du cœur absentes du deck optimisé, de la plus jouée à la moins jouée. */
  missingCore: { name: string; share: number; owned: boolean }[];
  samples: { url: string; date: string | null }[];
}

export interface ProposalSummary {
  /** Libellé : « A » ou « A + B » pour un duo. */
  commander: string;
  commanders: ProposalCommander[];
  /** Type de duo (« Partner », « Background »...), null pour un commandant seul. */
  pairLabel: string | null;
  source: CandidateSource;
  colorIdentity: string[];
  themes: string[];
  tribes: string[];
  /** Deck avec les seules cartes possédées (+ commandants). */
  owned: DeckVariant;
  /** Deck avec le pool recommandé. */
  upgraded: DeckVariant;
  /** Cartes à acquérir pour passer de `owned` à `upgraded`, de la plus impactante à la moins impactante. */
  acquisitions: ProposalCard[];
  acquisitionCostEur: number;
  acquisitionPriceUnknown: number;
  /** Combos à une carte près (Commander Spellbook), hors celles déjà complétées par le deck optimisé. */
  comboOpportunities: ComboOpportunity[];
  /** Pistes concrètes pour atteindre le Tier 4 (seuil d'indice TIER4_THRESHOLD). */
  pathToTier4: string[];
  /** Comparaison avec les decks de tournoi de ce commandant, si disponible (Duel). */
  reference: ReferenceSummary | null;
}

export interface DeckVariant {
  tier: DeckTierResult;
  score: number;
  cards: { name: string; count: number }[];
  ownedCount: number;
  deckSize: number;
  /** Terrains du deck (26/09/2026 : affichés pour montrer la base de mana). */
  landCount: number;
  /** Dont terrains de base ajoutés par le constructeur. */
  basicCount: number;
}

export interface CompetitiveBuildResult {
  ok: boolean;
  error: string | null;
  formatKey: "commander" | "duelcommander";
  maxAcquisitions: AcquisitionOption;
  collectionCards: { name: string; count: number }[];
  unresolvedNames: string[];
  /** Noms corrigés automatiquement (orthographe proche, nom français...). */
  corrections: NameCorrection[];
  proposals: ProposalSummary[];
  /** Nombre de commandants considérés / évalués en détail — transparence sur l'étendue de la recherche. */
  candidateCount: number;
  evaluatedCount: number;
  /** Commander Spellbook a-t-il répondu pour au moins une proposition ? */
  spellbookUsed: boolean;
  notes: string[];
}

const EMPTY: CompetitiveBuildResult = {
  ok: false,
  error: null,
  formatKey: "commander",
  maxAcquisitions: 15,
  collectionCards: [],
  unresolvedNames: [],
  corrections: [],
  proposals: [],
  candidateCount: 0,
  evaluatedCount: 0,
  spellbookUsed: false,
  notes: [],
};

/** Message quand Scryfall ne répond pas (26/09/2026) : limitation 429 ou panne. */
function scryfallDownMessage(): string {
  const status = scryfallRateLimitStatus();
  return status.limited
    ? `Scryfall (la base de cartes) limite temporairement les requêtes du site. Réessaie dans environ ${Math.max(30, status.retryInSeconds)} secondes — ta liste n'est pas en cause.`
    : "Aucune carte de ta liste n'a pu être récupérée auprès de Scryfall (service injoignable ou limité). Réessaie dans une minute — ta liste n'est pas en cause.";
}

function fail(error: string, partial: Partial<CompetitiveBuildResult> = {}): CompetitiveBuildResult {
  return { ...EMPTY, ...partial, ok: false, error };
}

function priceEur(card: ScryfallCard): number | null {
  const v = card.prices?.eur ?? null;
  const n = v ? Number.parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Propositions renvoyées à l'UI, PAR GROUPE (26/09/2026, demande de Ben :
 * « je veux le choix entre des decks avec des commanders que j'ai OU des
 * commanders que je n'ai pas ») : les N meilleurs decks avec un commandant
 * de la liste, et les N meilleurs avec un commandant à acquérir. Avant, un
 * seul classement par tier laissait souvent 8 commandants à acquérir.
 */
const PROPOSALS_PER_GROUP = 5;
/** Propositions dont le pool recommandé est élargi par des recherches de synergie (requêtes Scryfall supplémentaires). */
const SYNERGY_SEARCH_TOP = 4;
/** Propositions enrichies par Commander Spellbook (1 find-my-combos + 2 estimate-bracket chacune). */
const SPELLBOOK_TOP = 6;
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
    deckSize: deck.cards.reduce((s, c) => s + c.count, 0),
    landCount: deck.stats.landCount,
    basicCount: deck.cards
      .filter((c) => BASIC_NAMES.has(c.name.toLowerCase()))
      .reduce((s, c) => s + c.count, 0),
  };
}

const BASIC_NAMES = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);

function referenceSummary(
  ref: CommanderReference | null,
  ownedDeck: BuiltDeck,
  upgradedDeck: BuiltDeck,
  owned: Map<string, number>
): ReferenceSummary | null {
  if (!ref) return null;
  const core = Array.from(ref.shares.values()).filter((v) => v.share >= 0.5);
  if (core.length === 0) return null;
  const front = (n: string) => n.toLowerCase().split(" // ")[0];
  const setOf = (d: BuiltDeck) => new Set(d.cards.map((c) => front(c.name)));
  const inOwned = setOf(ownedDeck);
  const inUp = setOf(upgradedDeck);
  const ownedFront = new Set(Array.from(owned.keys()).map(front));
  const cov = (set: Set<string>) => Math.round((core.filter((c) => set.has(front(c.name))).length / core.length) * 100);
  return {
    label: ref.label,
    deckCount: ref.deckCount,
    coverageOwned: cov(inOwned),
    coverageUpgraded: cov(inUp),
    coreSize: core.length,
    missingCore: core
      .filter((c) => !inUp.has(front(c.name)))
      .sort((a, b) => b.share - a.share)
      .slice(0, 15)
      .map((c) => ({ name: c.name, share: Math.round(c.share * 100) / 100, owned: ownedFront.has(front(c.name)) })),
    samples: ref.samples,
  };
}

function summarize(
  p: DeckProposal,
  owned: Map<string, number>,
  isDuel: boolean,
  opportunities: ComboOpportunity[]
): ProposalSummary {
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
  const cards = p.candidate.cards;
  const inUpgraded = new Set(p.upgradedDeck.cards.map((c) => c.name.toLowerCase()));
  return {
    commander: candidateKey(p.candidate),
    commanders: cards.map((c, i) => ({
      name: c.name,
      owned: p.candidate.owned[i],
      priceEur: p.candidate.owned[i] ? null : priceEur(c),
      imageUrl: getDisplayImageUrl(c, "normal"),
    })),
    pairLabel: cards.length === 2 ? pairLabel(cards[0], cards[1]) : null,
    source: p.candidate.source,
    colorIdentity: unionIdentity(cards),
    themes: p.ownedDeck.profile.themes.map((t) => t.label),
    tribes: p.ownedDeck.profile.tribes,
    owned: variantOf(p.ownedDeck, owned),
    upgraded: variantOf(p.upgradedDeck, owned),
    acquisitions,
    acquisitionCostEur: Math.round(known.reduce((s, a) => s + (a.priceEur ?? 0), 0) * 100) / 100,
    acquisitionPriceUnknown: acquisitions.length - known.length,
    comboOpportunities: opportunities.filter((o) => !o.missing.every((m) => inUpgraded.has(m.toLowerCase()))).slice(0, 6),
    pathToTier4: pathToTier4(p.upgradedDeck.tier, isDuel),
    reference: referenceSummary(p.upgradedDeck.reference, p.ownedDeck, p.upgradedDeck, owned),
  };
}

/** Exécute `fn` sur chaque élément avec au plus `n` appels simultanés. */
async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

/**
 * Cœur de la fonctionnalité : de la liste importée aux decks proposés.
 * Étapes (requêtes réseau entre crochets) :
 * 1. [lots + ≤60 requêtes] résolution tolérante des noms importés ;
 * 2. [2 pages + ~3 lots] candidats : commandants de la liste, populaires du
 *    format (`is:commander`), liste curatée haute puissance (multi) ou
 *    commandants joués en tournoi (Duel), Backgrounds (pour les duos) ;
 * 3. [~8 lots] pool recommandé hors liste : Game Changers, staples par
 *    rôle, pièces de combo curatées, cartes du méta Duel (Duel) ;
 * 4. calcul pur : index, classement des commandants seuls ET des duos ;
 * 5. [≤ 3×3] recherches de synergie Scryfall pour les 3 meilleurs ;
 * 6. [≤ 6×3 Commander Spellbook] pour les 6 meilleurs : combos disponibles
 *    et à une carte près (find-my-combos) → nouvelle construction qui les
 *    vise, puis estimation de bracket et combos confirmées sur les deux
 *    decks (estimate-bracket) → tier recalculé ; repli sur la base curatée
 *    si Commander Spellbook ne répond pas.
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
  const collectionCards = input.collectionCards
    .filter((c) => typeof c?.name === "string" && c.name.trim() && Number.isFinite(c.count) && c.count > 0)
    .slice(0, 5000);
  const format = getFormat(input.formatKey === "duelcommander" ? "duelcommander" : "commander");
  const formatKey = format.key === "duelcommander" ? "duelcommander" : "commander";
  const isDuel = formatKey === "duelcommander";
  const mode = modeForFormat(format);
  const base = { formatKey, maxAcquisitions, collectionCards } as const;

  if (collectionCards.length === 0) return fail("Aucune carte reconnue dans ta liste.", base);
  // 26/09/2026 : 429 subis PENDANT cette construction → pool incomplet, à signaler.
  const rateLimitHitsAtStart = scryfallRateLimitHits();

  try {
    // 1. Collection (résolution tolérante)
    const resolution = await resolveCardNames(collectionCards.map((c) => c.name));
    if (resolution.byInput.size === 0) {
      return fail(scryfallDownMessage(), base);
    }
    const owned = new Map<string, number>();
    const ownedByName = new Map<string, ScryfallCard>();
    for (const c of collectionCards) {
      const card = resolution.byInput.get(c.name.trim().toLowerCase());
      if (!card) continue;
      const key = card.name.toLowerCase();
      owned.set(key, (owned.get(key) ?? 0) + c.count);
      ownedByName.set(key, card);
    }
    const ownedCards = Array.from(ownedByName.values());

    // 2. Candidats
    const [popular, curatedCommanders, backgrounds] = await Promise.all([
      searchCards(`is:commander legal:${format.scryfallLegality}`, POPULAR_COMMANDER_PAGES, "edhrec", "cards"),
      getCardsByNames(isDuel ? duelMetaCommanderNames() : [...HIGH_POWER_COMMANDERS], { fuzzyFallback: false }),
      searchCards(`t:background legal:${format.scryfallLegality}`, 1, "edhrec", "cards"),
    ]);

    // 3. Pool recommandé
    const poolNames = new Set<string>([
      ...GAME_CHANGER_NAMES,
      ...Object.values(STAPLES_BY_ROLE).flat(),
      ...allComboPieceNames(),
      ...(isDuel ? duelMetaCardNames(0.05) : []),
      // Cœur des decks de tournoi de chaque commandant (≥ 50% de ses decks).
      ...(isDuel ? referenceCardNames(0.5) : []),
    ]);
    const [poolCards, basics] = await Promise.all([
      getCardsByNames(Array.from(poolNames), { fuzzyFallback: false }),
      getCardsByNames(Array.from(new Set([...Object.values(BASIC_LAND_BY_COLOR), "Wastes"])), { fuzzyFallback: false }),
    ]);

    const candidatesByName = new Map<string, CommanderCandidate>();
    const mates: CommanderCandidate[] = [];
    const isOwned = (card: ScryfallCard) => (owned.get(card.name.toLowerCase()) ?? 0) > 0;
    const addCandidate = (card: ScryfallCard, source: CandidateSource) => {
      const key = card.name.toLowerCase();
      if (candidatesByName.has(key) || !isLegalInFormat(card, format)) return;
      if (card.type_line?.includes("Background")) {
        if (!mates.some((m) => m.cards[0].name === card.name)) {
          mates.push({ cards: [card], owned: [isOwned(card)], source: isOwned(card) ? "collection" : source });
        }
        return;
      }
      if (!isCommanderEligible(card)) return;
      // 26/09/2026 (retour de Ben : Mishra, Artificer Prodigy proposé) : un
      // commandant dont la capacité repose sur plusieurs exemplaires d'une
      // même carte ne fait rien en singleton (Commander et Duel).
      if (format.maxCopies <= 1 && hasDeadSingletonSynergy(card)) return;
      candidatesByName.set(key, { cards: [card], owned: [isOwned(card)], source: isOwned(card) ? "collection" : source });
    };
    for (const card of ownedCards) addCandidate(card, "collection");
    for (const card of curatedCommanders.values()) addCandidate(card, isDuel ? "duel-meta" : "high-power");
    for (const card of popular) addCandidate(card, "popular");
    for (const card of backgrounds) addCandidate(card, "popular");
    // Backgrounds possédés d'abord.
    mates.sort((a, b) => Number(b.owned[0]) - Number(a.owned[0]));
    const candidates = Array.from(candidatesByName.values());
    if (candidates.length === 0) {
      return fail(scryfallRateLimitStatus().limited ? scryfallDownMessage() : "Impossible de trouver un commandant légal pour ce format (service Scryfall indisponible ?).", {
        ...base,
        unresolvedNames: resolution.unresolved,
        corrections: resolution.corrections,
      });
    }

    // 4. Index + classement (seuls et duos)
    const allCards = [
      ...ownedCards,
      ...poolCards.values(),
      ...candidates.flatMap((c) => c.cards),
      ...mates.flatMap((c) => c.cards),
    ];
    const features = buildFeatureIndex(allCards, format);
    const acquirable = new Set<string>();
    const addAcquirable = (card: ScryfallCard) => {
      const key = card.name.toLowerCase();
      if ((owned.get(key) ?? 0) <= 0 && features.has(key)) acquirable.add(key);
    };
    for (const card of poolCards.values()) addAcquirable(card);

    const ranked = rankProposals({
      candidates,
      mates,
      features,
      owned,
      acquirable,
      maxAcquisitions,
      format,
      basics,
      maxTrials: 30,
      minOwnedTrials: 12,
      maxPairTrials: 10,
    });
    const isOwnedCandidate = (p: DeckProposal) => p.candidate.owned.every(Boolean);
    const ownedTop = ranked.filter(isOwnedCandidate).slice(0, PROPOSALS_PER_GROUP);
    const otherTop = ranked.filter((p) => !isOwnedCandidate(p)).slice(0, PROPOSALS_PER_GROUP);
    const top = [...ownedTop, ...otherTop];
    // Ordre d'enrichissement (synergie, Commander Spellbook) : alterné entre
    // les deux groupes, pour que chacun ait ses meilleurs decks enrichis.
    const enrichOrder: DeckProposal[] = [];
    for (let i = 0; i < PROPOSALS_PER_GROUP; i++) {
      if (ownedTop[i]) enrichOrder.push(ownedTop[i]);
      if (otherTop[i]) enrichOrder.push(otherTop[i]);
    }

    const rebuild = (p: DeckProposal, combos: readonly ComboDef[], acq: Set<string>) => {
      const profile = mergeProfiles(p.candidate.cards.map(commanderProfile));
      const ctx = { commanders: p.candidate.cards, format, mode, features, owned, basics, profile, combos };
      const ownedDeck = buildDeckForCommander({ ...ctx, acquirable: new Set(), maxAcquisitions: 0 });
      const upgradedDeck =
        acq.size > 0 && maxAcquisitions > 0 ? buildDeckForCommander({ ...ctx, acquirable: acq, maxAcquisitions }) : ownedDeck;
      return { ownedDeck, upgradedDeck };
    };
    const better = (a: BuiltDeck, b: BuiltDeck) =>
      a.tier.powerIndex > b.tier.powerIndex || (a.tier.powerIndex === b.tier.powerIndex && a.stats.score >= b.stats.score);

    // 5. Élargissement du pool par la synergie pour les meilleures propositions
    const acquirableByProposal = new Map<string, Set<string>>();
    if (maxAcquisitions > 0) {
      for (const p of enrichOrder.slice(0, SYNERGY_SEARCH_TOP)) {
        const queries = synergySearchQueries(p.ownedDeck.profile);
        if (queries.length === 0) continue;
        const id = unionIdentity(p.candidate.cards).join("").toLowerCase() || "c";
        const results = await Promise.all(
          queries.map((q) => searchCards(`${q} id<=${id} legal:${format.scryfallLegality}`, 1, "edhrec", "cards"))
        );
        const extra = results.flat().filter((card) => !features.has(card.name.toLowerCase()));
        for (const [k, f] of buildFeatureIndex(extra, format)) features.set(k, f);
        const extended = new Set(acquirable);
        for (const card of results.flat()) {
          const key = card.name.toLowerCase();
          if ((owned.get(key) ?? 0) <= 0 && features.has(key)) extended.add(key);
        }
        acquirableByProposal.set(candidateKey(p.candidate), extended);
        const { upgradedDeck } = rebuild(p, CURATED_COMBOS, extended);
        if (better(upgradedDeck, p.upgradedDeck)) p.upgradedDeck = upgradedDeck;
      }
    }

    // 6. Commander Spellbook
    let spellbookUsed = false;
    const opportunitiesByKey = new Map<string, ComboOpportunity[]>();
    await mapLimit(enrichOrder.slice(0, SPELLBOOK_TOP), 3, async (p) => {
      const key = candidateKey(p.candidate);
      const identity = unionIdentity(p.candidate.cards);
      const commanderNames = p.candidate.cards.map((c) => c.name);
      const acq = acquirableByProposal.get(key) ?? acquirable;
      // Liste envoyée : cartes possédées jouables d'abord, puis le pool recommandé (600 lignes max côté CSB).
      const inId = (f: CardFeatures) => f.card.color_identity.every((c) => identity.includes(c)) && !f.isBasic;
      const ownedList: string[] = [];
      const acqList: string[] = [];
      for (const f of features.values()) {
        if (!inId(f) || commanderNames.includes(f.card.name)) continue;
        if ((owned.get(f.key) ?? 0) > 0) ownedList.push(f.card.name);
        else if (acq.has(f.key)) acqList.push(f.card.name);
      }
      const found = await findMyCombos([...ownedList, ...acqList].slice(0, 600), commanderNames);
      if (!found) return;
      spellbookUsed = true;

      // Pièces manquantes des combos « à une carte près » : résolues pour pouvoir les proposer.
      const almost = distinctCombos(found.almostIncluded).filter((c) => !c.templates?.length && c.pieces.length <= 3);
      const missingNames = new Set<string>();
      const opportunities: ComboOpportunity[] = [];
      const known = new Set([...ownedList, ...acqList, ...commanderNames].map((n) => n.toLowerCase()));
      for (const c of almost.slice(0, 40)) {
        const missing = c.pieces.filter((x) => !known.has(x.toLowerCase()));
        if (missing.length === 0) continue;
        missing.forEach((m) => missingNames.add(m));
        opportunities.push({ missing, pieces: [...c.pieces], result: c.result, bracketTag: c.bracketTag });
      }
      opportunitiesByKey.set(key, opportunities);
      const extendedAcq = new Set(acq);
      if (missingNames.size && maxAcquisitions > 0) {
        const resolved = await getCardsByNames(Array.from(missingNames), { fuzzyFallback: false });
        const fresh = Array.from(resolved.values()).filter((c) => !features.has(c.name.toLowerCase()));
        for (const [k, f] of buildFeatureIndex(fresh, format)) features.set(k, f);
        for (const card of resolved.values()) {
          const k = card.name.toLowerCase();
          if ((owned.get(k) ?? 0) <= 0 && features.has(k)) extendedAcq.add(k);
        }
      }

      const combos = mergeCombos(CURATED_COMBOS, distinctCombos(found.included), almost);
      const rebuilt = rebuild(p, combos, extendedAcq);
      if (better(rebuilt.ownedDeck, p.ownedDeck)) p.ownedDeck = rebuilt.ownedDeck;
      if (better(rebuilt.upgradedDeck, p.upgradedDeck)) p.upgradedDeck = rebuilt.upgradedDeck;

      // Estimation de bracket + combos confirmées sur les deux decks finaux.
      const [eo, eu] = await Promise.all([
        estimateBracket(p.ownedDeck.cards.map((c) => c.name), commanderNames),
        p.upgradedDeck === p.ownedDeck
          ? Promise.resolve(null)
          : estimateBracket(p.upgradedDeck.cards.map((c) => c.name), commanderNames),
      ]);
      const sameDeck = p.upgradedDeck === p.ownedDeck;
      if (eo) p.ownedDeck = rescoreWithSpellbook(p.ownedDeck, features, basics, format, eo);
      if (sameDeck) p.upgradedDeck = p.ownedDeck;
      else if (eu) p.upgradedDeck = rescoreWithSpellbook(p.upgradedDeck, features, basics, format, eu);
    });
    // Tri tier d'abord DANS chaque groupe ; commandants de la liste en premier.
    sortProposals(ownedTop);
    sortProposals(otherTop);
    top.splice(0, top.length, ...ownedTop, ...otherTop);

    const notes: string[] = [];
    notes.push(
      spellbookUsed
        ? "Combos : Commander Spellbook consulté en direct (combos présentes, à une carte près, et estimation de bracket)."
        : "Commander Spellbook n'a pas répondu : combos détectées avec la base curatée hors ligne (~35 combos seulement)."
    );
    if (isDuel) {
      notes.push(
        `Duel : le tier intègre la présence des cartes dans ${DUEL_META_INFO.deckCount} decks de tournoi mtgtop8 (${DUEL_META_INFO.period ?? "septembre 2026"}) — pour l'élargir : node scripts/fetch-duel-meta.mjs sur ton Mac (ou la mise à jour hebdomadaire automatique).`
      );
    }
    const pairs = top.filter((p) => p.candidate.cards.length === 2).length;
    if (ownedTop.length === 0) {
      notes.push(
        "Aucun commandant jouable n'a été trouvé dans ta liste (créature légendaire ou carte « peut être votre commandant », 3 couleurs max) : seuls des commandants à acquérir sont proposés."
      );
    }
    if (isDuel && DUEL_PROFILES_AVAILABLE) {
      notes.push(
        `Duel : nombre de terrains, de terrains de base et choix des cartes calés sur les decks de tournoi de mêmes couleurs (${DUEL_PROFILES_INFO.decks} decks mtgtop8, ${DUEL_PROFILES_INFO.period ?? "période inconnue"}). Les Game Changers ne guident pas le choix en Duel (notion du Commander multijoueur).`
      );
    }
    const tooManyColors = candidates.filter((c) => unionIdentity(c.cards).length > MAX_DECK_COLORS).length;
    if (tooManyColors > 0) {
      notes.push(
        `${tooManyColors} commandant${tooManyColors > 1 ? "s" : ""} à 4 ou 5 couleurs écarté${tooManyColors > 1 ? "s" : ""} : les decks proposés ont ${MAX_DECK_COLORS} couleurs au plus, pour une base de mana rapide et fiable.`
      );
    }
    if (scryfallRateLimitHits() > rateLimitHitsAtStart) {
      notes.unshift(
        "⚠️ Scryfall a limité les requêtes du site pendant cette construction : une partie du pool recommandé n'a pas pu être chargée, les decks proposés sont probablement en dessous de ce qui est possible. Relance dans une minute."
      );
    }
    if (!top.some((p) => p.candidate.cards.some(canHavePartner)) && pairs === 0) {
      notes.push("Aucun duo de partenaires / Background n'est ressorti parmi les meilleurs decks pour cette liste.");
    }

    return {
      ok: true,
      error: null,
      formatKey,
      maxAcquisitions,
      collectionCards,
      unresolvedNames: resolution.unresolved,
      corrections: resolution.corrections,
      proposals: top.map((p) => summarize(p, owned, isDuel, opportunitiesByKey.get(candidateKey(p.candidate)) ?? [])),
      candidateCount: candidates.length,
      evaluatedCount: ranked.length,
      spellbookUsed,
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
  commanders: string[];
  cards: { name: string; count: number }[];
  acquisitionNames: string[];
  label: string;
}): Promise<DeckAnalysisResult & { addedNames: string[] }> {
  const result = await analyzeDeck({
    formatKey: input.formatKey,
    deckName: input.label,
    commanders: input.commanders.slice(0, 2),
    cards: input.cards,
  });
  return { ...result, addedNames: input.acquisitionNames.map((n) => n.toLowerCase()) };
}

import type { ScryfallCard } from "./types";
import { getFormat } from "./formats";
import { BASIC_LAND_BY_COLOR, canBeCommanderInFormat, isCommanderEligible } from "./collection-builder";
import { hasDeadSingletonSynergy } from "./deck-score";
import {
  buildDeckForCommander,
  buildFeatureIndex,
  buildWithEuroBudget,
  commanderCostEur,
  candidateKey,
  modeForFormat,
  rankProposalsAsync,
  rescoreWithSpellbook,
  sortProposals,
  TIER4_THRESHOLD,
  unionIdentity,
  MAX_DECK_COLORS,
  type BudgetOutcome,
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
import { AXES } from "./mechanics";
import { allComboPieceNames, CURATED_COMBOS, mergeCombos, type ComboDef } from "./combos";
import { duelMetaCardNames, duelMetaCommanderNames, DUEL_META_INFO } from "./duel-meta";
import { canHavePartner, pairLabel } from "./partners";
import { referenceCardNames, referenceFor, type CommanderReference } from "./duel-reference";
import { distinctCombos, estimateBracket, findMyCombos } from "./spellbook";
import { resolveCardNames, type NameCorrection } from "./name-resolution";
import { recentCommanderNames, recentPoolNames } from "./recent-sets";
import { GAME_CHANGER_NAMES } from "@/data/game-changers";
import { HIGH_POWER_COMMANDERS, STAPLES_BY_ROLE } from "@/data/competitive-staples";
import { deckSolidity, optimizeDeck, quickPlaytest, rankScore, type OptimizedDeck, type Solidity } from "./deck-optimizer";
import { commanderRating, type CommanderRating, type DeckAudit } from "./deck-audit";
import { describeGamePlan, type GamePlanSummary } from "./game-plan-summary";
import { missingStaples } from "./staples";
import { BUILD_STEPS, type BuildProgress } from "./build-steps";
import { cardPriceEur, normalizeBudget } from "./budget";

/**
 * Déroulé complet du constructeur compétitif (25/09/2026, demande de Ben —
 * voir competitive-builder.ts pour le moteur, et le README pour le
 * parcours complet).
 *
 * 03/10/2026 : ce fichier n'est plus un fichier "use server". Le déroulé
 * accepte une fonction `onProgress` (les étapes en direct pour le chargeur
 * de l'interface), ce qu'une Server Action ne peut pas recevoir. Il est
 * appelé par deux points d'entrée : la route de flux
 * src/app/api/competitive-build/route.ts (avec progression) et la Server
 * Action runCompetitiveBuild de competitive-actions.ts (sans, en repli).
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
  /**
   * Commandant « hors méta » (03/10/2026) : absent des decks de tournoi
   * connus (Duel) ou peu joué selon le rang EDHREC (multi). Affiché comme
   * une piste originale, pas comme un défaut.
   */
  offMeta: boolean;
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
  /**
   * Classement (04/10/2026, Duel) : score = solidité du deck « avec mes
   * cartes » + ce que vaut le commandant. null en multijoueur (classement au
   * tier, comme avant).
   */
  ranking: { score: number; commander: CommanderRating } | null;
  /** Autres commandants évalués de MÊMES couleurs, non affichés : même deck à ≥ 75 % ou troisième proposition de ces couleurs. */
  alternatives: { commander: string; owned: boolean; score: number | null }[];
  /** Mode budget (04/10/2026) : ce qui a été dépensé et ce que quelques euros de plus apporteraient. null hors mode budget. */
  budget: BudgetSummary | null;
}

/** Une carte hors budget qui améliorerait le deck (section « pour quelques euros de plus »). */
export interface BudgetExtraCard {
  name: string;
  priceEur: number;
  /** Apport estimé par le moteur (note de la carte moins celle de la carte possédée qu'elle remplacerait). Pas un taux de victoire. */
  gain: number;
  /** Dépassement cumulé du budget si l'on achète cette carte et toutes celles qui la précèdent dans la liste. */
  overBudgetEur: number;
  reasons: string[];
  imageUrl: string | null;
  typeLine: string;
}

export interface BudgetSummary {
  /** Budget saisi, commandant compris. */
  budgetEur: number;
  /** Prix du ou des commandants à acquérir (0 s'ils sont possédés). */
  commanderCostEur: number;
  /** Prix des cartes à acquérir du deck optimisé. */
  cardsCostEur: number;
  /** Budget non dépensé. */
  remainingEur: number;
  /** Cartes du pool jouables dans ces couleurs mais sans prix en euros : non proposées. */
  unpriced: number;
  more: BudgetExtraCard[];
}

/** Une staple absente du deck (staples.ts), prête pour l'interface. */
export interface StapleCard {
  name: string;
  owned: boolean;
  reasons: string[];
  tierGain: number;
  scoreGain: number;
  replaces: string | null;
  priceEur: number | null;
  imageUrl: string | null;
}

export interface DeckVariant {
  /** Lecture du deck (deck-audit.ts) : ligne directrice, cartes à revoir, indices. Les verdicts carte par carte sont recalculés sur la page du deck. */
  reading: { line: DeckAudit["line"]; flagged: DeckAudit["flagged"]; coherence: number; structure: number; avgQuality: number } | null;
  /** Indice de solidité et ses composantes (deck-optimizer.ts) — null si l'optimisation n'a pas tourné pour ce deck. */
  solidity: Solidity | null;
  /** Plan suivi par le constructeur, transmis à la page du deck pour qu'elle lise le deck avec la même ligne directrice. */
  planHint: { axes: string[]; recipeId: string | null } | null;
  /** Plan de jeu, parties simulées, variantes essayées (03/10/2026). null si l'optimisation n'a pas tourné pour ce deck. */
  gamePlan: GamePlanSummary | null;
  /** Staples absentes de CE deck, possédées ou non, de la plus utile à la moins utile. */
  missingStaples: StapleCard[];
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
  /** Budget en euros appliqué (Duel uniquement), null si la limite est un nombre de cartes. */
  budgetEur: number | null;
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
  budgetEur: null,
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

const priceEur = cardPriceEur;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Cartes affichées dans « pour quelques euros de plus ». */
const BUDGET_EXTRAS_SHOWN = 8;

function budgetSummary(outcome: BudgetOutcome | undefined, upgradedDeck: BuiltDeck): BudgetSummary | null {
  if (!outcome) return null;
  const cardsCost = upgradedDeck.acquisitions.reduce((s, a) => s + (priceEur(a.card) ?? 0), 0);
  const remaining = Math.max(0, outcome.budgetEur - outcome.commanderCostEur - cardsCost);
  const inDeck = new Set(upgradedDeck.cards.map((c) => c.name.toLowerCase()));
  let cumulated = 0;
  const more: BudgetExtraCard[] = [];
  for (const m of outcome.more) {
    // Déjà dans le deck, ou abordable avec ce qui reste : le moteur l'avait sous la main et ne l'a pas retenue.
    if (inDeck.has(m.name.toLowerCase()) || m.priceEur <= remaining + 1e-9) continue;
    cumulated += m.priceEur;
    more.push({
      name: m.name,
      priceEur: m.priceEur,
      gain: m.gain,
      overBudgetEur: round2(Math.max(0, cumulated - remaining)),
      reasons: m.reasons,
      imageUrl: getDisplayImageUrl(m.card, "normal"),
      typeLine: m.card.type_line,
    });
    if (more.length >= BUDGET_EXTRAS_SHOWN) break;
  }
  return {
    budgetEur: outcome.budgetEur,
    commanderCostEur: round2(outcome.commanderCostEur),
    cardsCostEur: round2(cardsCost),
    remainingEur: round2(remaining),
    unpriced: outcome.unpriced,
    more,
  };
}

/**
 * Propositions renvoyées à l'UI, PAR GROUPE (26/09/2026, demande de Ben :
 * « je veux le choix entre des decks avec des commanders que j'ai OU des
 * commanders que je n'ai pas ») : les N meilleurs decks avec un commandant
 * de la liste, et les N meilleurs avec un commandant à acquérir. Avant, un
 * seul classement par tier laissait souvent 8 commandants à acquérir.
 */
const PROPOSALS_PER_GROUP = 5;
/** Duel : au plus deux propositions par identité couleur dans un groupe (les suivantes sont citées comme variantes). */
const MAX_PER_IDENTITY = 2;
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
  // Duel : les Game Changers comptent dans l'indice (formule commune au site) mais le constructeur ne les recherche pas — la piste n'est pas proposée.
  if (c.gameChanger < 40 && !isDuel) {
    const next = s.gameChangerCount === 0 ? 10 : 6;
    tips.push({ gain: next, text: `Game Changers : ${s.gameChangerCount} dans le deck. Chaque Game Changer supplémentaire rapporte +${next} (plafond 40, atteint à 6).` });
  }
  if (c.fastMana < 15) tips.push({ gain: 3, text: `Mana rapide (rampe à coût ≤ 2) : ${s.fastManaCount}/5 — +3 par source jusqu'à 5.` });
  if (c.combo < 12) tips.push({ gain: c.combo === 0 ? 8 : 4, text: s.combos.length === 0 ? "Aucune combo connue : en assembler une rapporte +8 (+12 pour deux)." : "Une 2e combo rapporterait +4." });
  if (c.tutor < 10) tips.push({ gain: 10 - c.tutor, text: `Tutors : ${s.tutorCount} — jusqu'à +${Math.round((10 - c.tutor) * 10) / 10} en atteignant la cible du format.` });
  if (c.interaction < 10) tips.push({ gain: 10 - c.interaction, text: `Interaction (removal + disruption${isDuel ? " + contresorts" : ""}) : jusqu'à +${Math.round((10 - c.interaction) * 10) / 10}.` });
  if (c.curve < 5) tips.push({ gain: 5 - c.curve, text: `Courbe : coût moyen ${s.avgCmc} — baisser la courbe rapporte jusqu'à +${Math.round((5 - c.curve) * 10) / 10}.` });
  if (isDuel && c.duelMeta < 25) tips.push({ gain: 25 - c.duelMeta, text: `Cartes du méta Duel : présence cumulée ${s.duelMetaSum} — jusqu'à +${Math.round((25 - c.duelMeta) * 10) / 10} en jouant les cartes les plus présentes en tournoi.` });
  tips.sort((a, b) => b.gain - a.gain);
  const head = reached
    ? `Tier 4 atteint (indice ${tier.powerIndex} ≥ ${TIER4_THRESHOLD}). Pour viser le Tier 5 (80), il manque ${Math.round(gap * 10) / 10} points :`
    : `Il manque ${Math.round(gap * 10) / 10} points d'indice pour le Tier 4 (${TIER4_THRESHOLD}/100) :`;
  return [head, ...tips.slice(0, 4).map((t) => t.text)];
}

function variantOf(deck: BuiltDeck, owned: Map<string, number>, extras?: VariantExtras): DeckVariant {
  const a = deck.audit;
  return {
    reading: a.line.text ? { line: a.line, flagged: a.flagged, coherence: a.coherence, structure: a.structure, avgQuality: a.avgQuality } : null,
    solidity: extras?.solidity ?? null,
    planHint: deck.plan ? { axes: deck.plan.axes.map((x) => AXES[x.axis].id), recipeId: deck.plan.recipe?.id ?? null } : null,
    gamePlan: extras?.gamePlan ?? null,
    missingStaples: extras?.staples ?? [],
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

interface VariantExtras {
  gamePlan: GamePlanSummary | null;
  staples: StapleCard[];
  solidity: Solidity | null;
}
/** Extras des deux decks d'une proposition (clé : candidateKey). */
interface ProposalExtras {
  owned?: VariantExtras;
  upgraded?: VariantExtras;
}

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
  opportunities: ComboOpportunity[],
  extras: ProposalExtras = {},
  alternatives: ProposalSummary["alternatives"] = []
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
    owned: variantOf(p.ownedDeck, owned, extras.owned),
    upgraded: variantOf(p.upgradedDeck, owned, extras.upgraded ?? (p.upgradedDeck === p.ownedDeck ? extras.owned : undefined)),
    offMeta: isOffMeta(cards, isDuel),
    acquisitions,
    acquisitionCostEur: Math.round(known.reduce((s, a) => s + (a.priceEur ?? 0), 0) * 100) / 100,
    acquisitionPriceUnknown: acquisitions.length - known.length,
    comboOpportunities: opportunities.filter((o) => !o.missing.every((m) => inUpgraded.has(m.toLowerCase()))).slice(0, 6),
    pathToTier4: pathToTier4(p.upgradedDeck.tier, isDuel),
    reference: referenceSummary(p.upgradedDeck.reference, p.ownedDeck, p.upgradedDeck, owned),
    ranking: isDuel && p.rankScore !== undefined ? { score: p.rankScore, commander: commanderRating(cards, "duel") } : null,
    alternatives,
    budget: budgetSummary(p.budget, p.upgradedDeck),
  };
}

/** Commandant peu ou pas joué dans les sources connues (voir ProposalSummary.offMeta). */
function isOffMeta(commanders: ScryfallCard[], isDuel: boolean): boolean {
  if (isDuel) return referenceFor(commanders.map((c) => c.name)) === null;
  return commanders.every((c) => typeof c.edhrec_rank !== "number" || c.edhrec_rank <= 0 || c.edhrec_rank > 3000);
}

/** Laisse la main à la boucle d'événements : le flux de progression part avant le calcul suivant. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

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
export async function runCompetitiveBuildCore(
  input: {
    formatKey: string;
    collectionCards: { name: string; count: number }[];
    maxAcquisitions: AcquisitionOption;
    /** Budget en euros, commandant compris (Duel uniquement). Défini : remplace `maxAcquisitions`. */
    budgetEur?: number | null;
  },
  onProgress?: (p: BuildProgress) => void
): Promise<CompetitiveBuildResult> {
  // Progression (03/10/2026) : `step` = indice dans BUILD_STEPS, `fraction` =
  // avancement DANS l'étape (0-1). Sans `onProgress`, rien n'est émis.
  const emit = async (key: (typeof BUILD_STEPS)[number]["key"], fraction: number, detail?: string) => {
    if (!onProgress) return;
    const step = BUILD_STEPS.findIndex((s) => s.key === key);
    onProgress({ step, total: BUILD_STEPS.length, key, label: BUILD_STEPS[step].label, detail, fraction: Math.max(0, Math.min(1, fraction)) });
    await tick();
  };
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
  // Budget en euros : Duel uniquement (le format de Ben ; non essayé en multijoueur).
  const budgetEur = isDuel && input.budgetEur !== undefined && input.budgetEur !== null ? normalizeBudget(input.budgetEur) : null;
  const budgetMode = budgetEur !== null;
  /** Le deck « optimisé » peut-il contenir des cartes hors liste ? */
  const buying = budgetMode ? budgetEur > 0 : maxAcquisitions > 0;
  const base = { formatKey, maxAcquisitions, budgetEur, collectionCards } as const;

  if (collectionCards.length === 0) return fail("Aucune carte reconnue dans ta liste.", base);
  // 26/09/2026 : 429 subis PENDANT cette construction → pool incomplet, à signaler.
  const rateLimitHitsAtStart = scryfallRateLimitHits();

  try {
    // 1. Collection (résolution tolérante)
    await emit("resolve", 0, `${collectionCards.length} cartes à reconnaître`);
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
    await emit("commanders", 0, `${ownedCards.length} cartes reconnues`);
    const [popular, curatedCommanders, backgrounds] = await Promise.all([
      searchCards(`is:commander legal:${format.scryfallLegality}`, POPULAR_COMMANDER_PAGES, "edhrec", "cards"),
      getCardsByNames(isDuel ? duelMetaCommanderNames() : [...HIGH_POWER_COMMANDERS], { fuzzyFallback: false }),
      searchCards(`t:background legal:${format.scryfallLegality}`, 1, "edhrec", "cards"),
    ]);

    // 3. Pool recommandé
    await emit("pool", 0);
    const poolNames = new Set<string>([
      ...GAME_CHANGER_NAMES,
      ...Object.values(STAPLES_BY_ROLE).flat(),
      ...allComboPieceNames(),
      ...(isDuel ? duelMetaCardNames(0.05) : []),
      // Cœur des decks de tournoi de chaque commandant (≥ 50% de ses decks).
      ...(isDuel ? referenceCardNames(0.5) : []),
      // 03/10/2026 : cartes des dernières extensions, trop récentes pour
      // sortir des recherches triées par popularité (voir recent-sets.ts).
      // Des noms à évaluer comme les autres : légalité vérifiée par
      // Scryfall, retenues seulement si le moteur les classe devant.
      ...recentPoolNames(),
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
      if (candidatesByName.has(key) || !canBeCommanderInFormat(card, format)) return;
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
    // 03/10/2026 : les commandants des dernières extensions ne figurent pas
    // encore parmi les « populaires » (pas de rang EDHREC) — ajoutés comme
    // candidats, puis départagés comme les autres par commanderAffinity.
    const recentCommanders = recentCommanderNames();
    for (const card of poolCards.values()) {
      if (recentCommanders.has(card.name.toLowerCase())) addCandidate(card, "recent");
    }
    for (const card of backgrounds) addCandidate(card, "popular");
    // Backgrounds possédés d'abord.
    mates.sort((a, b) => Number(b.owned[0]) - Number(a.owned[0]));
    // Mode budget : un commandant à acquérir compte dans le budget ; trop cher ou sans prix connu, il est écarté.
    const affordable = (c: CommanderCandidate) => {
      if (!budgetMode) return true;
      const cost = commanderCostEur(c);
      return cost !== null && cost <= budgetEur;
    };
    const unaffordable = Array.from(candidatesByName.values()).filter((c) => !affordable(c)).length;
    for (let i = mates.length - 1; i >= 0; i--) if (!affordable(mates[i])) mates.splice(i, 1);
    const candidates = Array.from(candidatesByName.values()).filter(affordable);
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

    await emit("rank", 0, `${candidates.length} commandants possibles`);
    const ranked = await rankProposalsAsync(
      {
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
        // Duel (04/10/2026) : classement par solidité du deck + note du
        // commandant (deck-optimizer.ts), plus par l'indice de tier.
        evaluate: isDuel ? (deck) => rankScore(deck, quickPlaytest(deck, { features, basics, mode }), mode) : undefined,
        budgetEur: budgetMode ? budgetEur : undefined,
      },
      (done, total, label) => emit("rank", done / total, `Deck ${done}/${total} : ${label}`)
    );
    // Mode budget : un duo dont les deux commandants à acquérir dépassent ensemble le budget n'est pas proposé.
    if (budgetMode) {
      for (let i = ranked.length - 1; i >= 0; i--) {
        const cost = commanderCostEur(ranked[i].candidate);
        if (cost === null || cost > budgetEur) ranked.splice(i, 1);
      }
    }
    const isOwnedCandidate = (p: DeckProposal) => p.candidate.owned.every(Boolean);
    // Duel (04/10/2026, retour de Ben : « l'algo s'enferme dans des schémas ») :
    // plusieurs commandants de mêmes couleurs mènent au même deck à quelques
    // cartes près. On n'en garde qu'UN par deck — le mieux classé — et on cite
    // les autres comme variantes, pour que les cinq propositions soient cinq
    // decks différents.
    const alternativesByKey = new Map<string, ProposalSummary["alternatives"]>();
    const nonLandKeys = (d: BuiltDeck) => new Set(d.picks.map((x) => x.key));
    const pickDistinct = (list: DeckProposal[]): DeckProposal[] => {
      if (!isDuel) return list.slice(0, PROPOSALS_PER_GROUP);
      const kept: { p: DeckProposal; id: string; keys: Set<string> }[] = [];
      for (const p of list) {
        const id = unionIdentity(p.candidate.cards).join("");
        const keys = nonLandKeys(p.ownedDeck);
        const sameColors = kept.filter((k) => k.id === id);
        // Même deck (≥ 75 % de cartes communes), ou déjà deux propositions de ces couleurs : variante de la mieux classée.
        const twin =
          sameColors.find((k) => {
            let common = 0;
            for (const key of keys) if (k.keys.has(key)) common++;
            return common / Math.max(1, Math.min(keys.size, k.keys.size)) >= 0.75;
          }) ?? (sameColors.length >= MAX_PER_IDENTITY ? sameColors[0] : undefined);
        if (twin) {
          const alts = alternativesByKey.get(candidateKey(twin.p.candidate)) ?? [];
          if (alts.length < 6) alts.push({ commander: candidateKey(p.candidate), owned: isOwnedCandidate(p), score: p.rankScore ?? null });
          alternativesByKey.set(candidateKey(twin.p.candidate), alts);
          continue;
        }
        if (kept.length < PROPOSALS_PER_GROUP) kept.push({ p, id, keys });
      }
      return kept.map((k) => k.p);
    };
    const ownedTop = pickDistinct(ranked.filter(isOwnedCandidate));
    const otherTop = pickDistinct(ranked.filter((p) => !isOwnedCandidate(p)));
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
      if (budgetMode) {
        const { deck, outcome } = buildWithEuroBudget(ctx, acq, ownedDeck, budgetEur, commanderCostEur(p.candidate) ?? budgetEur);
        return { ownedDeck, upgradedDeck: deck, budget: outcome as BudgetOutcome | undefined };
      }
      const upgradedDeck =
        acq.size > 0 && maxAcquisitions > 0 ? buildDeckForCommander({ ...ctx, acquirable: acq, maxAcquisitions }) : ownedDeck;
      return { ownedDeck, upgradedDeck, budget: undefined as BudgetOutcome | undefined };
    };
    /** Adopte le deck amélioré reconstruit s'il est meilleur (et, en mode budget, la liste d'achats qui va avec). */
    const adoptUpgraded = (p: DeckProposal, r: { upgradedDeck: BuiltDeck; budget: BudgetOutcome | undefined }) => {
      if (!better(r.upgradedDeck, p.upgradedDeck)) return;
      p.upgradedDeck = r.upgradedDeck;
      if (r.budget) p.budget = r.budget;
    };
    // Duel : « meilleur » = indice de solidité plus haut ; multijoueur : tier, puis score (règle d'avant).
    const solidityOf = (d: BuiltDeck) => deckSolidity(d, quickPlaytest(d, { features, basics, mode })).score;
    const better = (a: BuiltDeck, b: BuiltDeck) =>
      isDuel
        ? solidityOf(a) >= solidityOf(b)
        : a.tier.powerIndex > b.tier.powerIndex || (a.tier.powerIndex === b.tier.powerIndex && a.stats.score >= b.stats.score);

    // 5. Élargissement du pool par la synergie pour les meilleures propositions
    const acquirableByProposal = new Map<string, Set<string>>();
    await emit("synergy", 0);
    // Mode budget : le classement n'a fait qu'une passe rapide ; passe complète pour chaque deck affiché.
    if (budgetMode && buying) {
      for (const p of top) adoptUpgraded(p, rebuild(p, CURATED_COMBOS, acquirable));
    }
    if (buying) {
      const synergyTargets = enrichOrder.slice(0, SYNERGY_SEARCH_TOP);
      for (const [si, p] of synergyTargets.entries()) {
        await emit("synergy", si / synergyTargets.length, candidateKey(p.candidate));
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
        adoptUpgraded(p, rebuild(p, CURATED_COMBOS, extended));
      }
    }

    // 6. Commander Spellbook
    let spellbookUsed = false;
    const opportunitiesByKey = new Map<string, ComboOpportunity[]>();
    // Combos et pool élargi retenus pour chaque proposition (réutilisés par l'optimisation, étape 7).
    const combosByKey = new Map<string, ComboDef[]>();
    const spellbookTargets = enrichOrder.slice(0, SPELLBOOK_TOP);
    let spellbookDone = 0;
    await emit("combos", 0);
    await mapLimit(spellbookTargets, 3, async (p) => {
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
      spellbookDone++;
      await emit("combos", spellbookDone / spellbookTargets.length, key);
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
      if (missingNames.size && buying) {
        const resolved = await getCardsByNames(Array.from(missingNames), { fuzzyFallback: false });
        const fresh = Array.from(resolved.values()).filter((c) => !features.has(c.name.toLowerCase()));
        for (const [k, f] of buildFeatureIndex(fresh, format)) features.set(k, f);
        for (const card of resolved.values()) {
          const k = card.name.toLowerCase();
          if ((owned.get(k) ?? 0) <= 0 && features.has(k)) extendedAcq.add(k);
        }
      }

      const combos = mergeCombos(CURATED_COMBOS, distinctCombos(found.included), almost);
      combosByKey.set(key, combos);
      acquirableByProposal.set(key, extendedAcq);
      const rebuilt = rebuild(p, combos, extendedAcq);
      if (better(rebuilt.ownedDeck, p.ownedDeck)) p.ownedDeck = rebuilt.ownedDeck;
      adoptUpgraded(p, rebuilt);
    });

    // 7. Plans de jeu, parties simulées, ajustements (03/10/2026 — voir
    // deck-optimizer.ts). Pour CHAQUE proposition affichée, et pour ses deux
    // decks : variantes par plan, choix, réparations ciblées. Calcul pur
    // (aucune requête), mais le plus long : progression deck par deck.
    const optimized = new Map<string, { owned: OptimizedDeck; upgraded: OptimizedDeck | null }>();
    let gamesPlayed = 0;
    for (const [oi, p] of top.entries()) {
      const key = candidateKey(p.candidate);
      await emit("playtest", oi / top.length, `${key} — variantes et parties simulées (${oi + 1}/${top.length})`);
      const combos = combosByKey.get(key) ?? CURATED_COMBOS;
      const profile = mergeProfiles(p.candidate.cards.map(commanderProfile));
      const base = { commanders: p.candidate.cards, format, mode, features, owned, basics, profile, combos };
      const sameDeck = p.upgradedDeck === p.ownedDeck;
      const ownedOpt = optimizeDeck({ ...base, acquirable: new Set<string>(), maxAcquisitions: 0 }, p.ownedDeck);
      gamesPlayed += ownedOpt.gamesPlayed;
      p.ownedDeck = ownedOpt.deck;
      let upgradedOpt: OptimizedDeck | null = null;
      if (!sameDeck) {
        await tick();
        const acq = acquirableByProposal.get(key) ?? acquirable;
        // Mode budget : les ajustements ne puisent que dans les achats déjà retenus — le budget reste tenu.
        const purchasable = p.budget?.purchasable;
        upgradedOpt = purchasable
          ? optimizeDeck({ ...base, acquirable: purchasable, maxAcquisitions: purchasable.size, euroBudget: true }, p.upgradedDeck)
          : optimizeDeck({ ...base, acquirable: acq, maxAcquisitions }, p.upgradedDeck);
        gamesPlayed += upgradedOpt.gamesPlayed;
        // Le deck amélioré ne doit jamais passer sous le deck possédé.
        if (isDuel ? upgradedOpt.solidity.score >= ownedOpt.solidity.score : better(upgradedOpt.deck, ownedOpt.deck)) p.upgradedDeck = upgradedOpt.deck;
        else {
          p.upgradedDeck = p.ownedDeck;
          upgradedOpt = null;
          // Mode budget : aucun achat essayé ne rend le deck plus solide — rien à proposer « pour quelques euros de plus ».
          if (p.budget) p.budget = { ...p.budget, purchasable: new Set(), more: [] };
        }
      } else {
        p.upgradedDeck = p.ownedDeck;
      }
      optimized.set(key, { owned: ownedOpt, upgraded: upgradedOpt });
      // Classement final sur le deck optimisé (400 parties simulées au lieu de 120).
      // Mode budget : le classement porte sur le deck que le budget permet, pas sur le deck possédé.
      if (isDuel) {
        p.rankScore =
          budgetMode && upgradedOpt ? rankScore(p.upgradedDeck, upgradedOpt.playtest.score, mode) : rankScore(p.ownedDeck, ownedOpt.playtest.score, mode);
      }
    }

    // 8. Estimation de bracket + combos confirmées (Commander Spellbook) sur
    // les decks FINAUX, puis plan de jeu et staples manquants.
    await emit("finalize", 0);
    let estimated = 0;
    await mapLimit(spellbookTargets, 3, async (p) => {
      if (!spellbookUsed) return;
      const commanderNames = p.candidate.cards.map((c) => c.name);
      const sameDeck = p.upgradedDeck === p.ownedDeck;
      const [eo, eu] = await Promise.all([
        estimateBracket(p.ownedDeck.cards.map((c) => c.name), commanderNames),
        sameDeck ? Promise.resolve(null) : estimateBracket(p.upgradedDeck.cards.map((c) => c.name), commanderNames),
      ]);
      if (eo) p.ownedDeck = rescoreWithSpellbook(p.ownedDeck, features, basics, format, eo);
      if (sameDeck) p.upgradedDeck = p.ownedDeck;
      else if (eu) p.upgradedDeck = rescoreWithSpellbook(p.upgradedDeck, features, basics, format, eu);
      estimated++;
      await emit("finalize", (estimated / spellbookTargets.length) * 0.6, candidateKey(p.candidate));
    });

    const extrasByKey = new Map<string, ProposalExtras>();
    const toStaple = (st: ReturnType<typeof missingStaples>[number]): StapleCard => ({
      name: st.name,
      owned: st.owned,
      reasons: st.reasons,
      tierGain: st.tierGain,
      scoreGain: st.scoreGain,
      replaces: st.replaces,
      priceEur: priceEur(st.card),
      imageUrl: getDisplayImageUrl(st.card, "normal"),
    });
    for (const [ei, p] of top.entries()) {
      const key = candidateKey(p.candidate);
      const opt = optimized.get(key);
      if (!opt) continue;
      const combos = combosByKey.get(key) ?? CURATED_COMBOS;
      const extrasFor = (deck: BuiltDeck, o: OptimizedDeck): VariantExtras => ({
        gamePlan: describeGamePlan({
          deck,
          features,
          format,
          mode,
          plan: o.plan,
          playtest: o.playtest,
          synergy: o.synergy,
          variants: o.variants,
          adjustments: o.adjustments,
          gamesPlayed: o.gamesPlayed,
        }),
        staples: missingStaples({ deck, features, owned, basics, format, mode, combos }).map(toStaple),
        solidity: o.solidity,
      });
      extrasByKey.set(key, {
        owned: extrasFor(p.ownedDeck, opt.owned),
        upgraded: opt.upgraded && p.upgradedDeck !== p.ownedDeck ? extrasFor(p.upgradedDeck, opt.upgraded) : undefined,
      });
      await emit("finalize", 0.6 + ((ei + 1) / top.length) * 0.4, key);
    }
    // Tri tier d'abord DANS chaque groupe ; commandants de la liste en premier.
    sortProposals(ownedTop);
    sortProposals(otherTop);
    top.splice(0, top.length, ...ownedTop, ...otherTop);

    const notes: string[] = [];
    notes.push(
      `Plans de jeu : pour chaque deck proposé, plusieurs variantes ont été construites puis départagées par ${gamesPlayed.toLocaleString("fr-FR")} parties simulées en solitaire au total. Ces parties mesurent la régularité et la vitesse à vide, pas un taux de victoire contre un adversaire.`
    );
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
    if (budgetMode) {
      notes.unshift(
        `Budget : ${budgetEur.toLocaleString("fr-FR")} € au plus par deck, commandant à acquérir compris. Prix Scryfall en euros de l'impression renvoyée (une autre impression peut coûter moins), sans frais de port ni état de la carte ; une carte sans prix connu n'est jamais proposée à l'achat. Le classement porte sur le deck que ce budget permet.${unaffordable > 0 ? ` ${unaffordable} commandant${unaffordable > 1 ? "s" : ""} à acquérir écarté${unaffordable > 1 ? "s" : ""} (plus cher${unaffordable > 1 ? "s" : ""} que le budget, ou sans prix).` : ""}`
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
      budgetEur,
      collectionCards,
      unresolvedNames: resolution.unresolved,
      corrections: resolution.corrections,
      proposals: top.map((p) =>
        summarize(
          p,
          owned,
          isDuel,
          opportunitiesByKey.get(candidateKey(p.candidate)) ?? [],
          extrasByKey.get(candidateKey(p.candidate)),
          alternativesByKey.get(candidateKey(p.candidate)) ?? []
        )
      ),
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

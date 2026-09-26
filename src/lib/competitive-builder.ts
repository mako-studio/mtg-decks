import type { DeckCategory, DeckStats, EnrichedCard, FormatConfig, ScryfallCard } from "./types";
import { classifyCard, computeDeckStats, EMPTY_CATEGORY_COUNTS, hasDeadSingletonSynergy } from "./deck-score";
import {
  cardTierSignals,
  computeDeckTier,
  tierWithSpellbook,
  EMPTY_TIER_COUNTS,
  powerIndexFromComponents,
  tierComponentsFromCounts,
  type CardTierSignals,
  type DeckTierResult,
  type TierCounts,
} from "./deck-tier";
import {
  cardSynergyFeatures,
  commanderProfile,
  mergeProfiles,
  sharedThemeLabels,
  synergyScore,
  type CardSynergyFeatures,
  type CommanderProfile,
} from "./synergy";
import { comboPieceSet, CURATED_COMBOS, findCompleteCombos, type ComboDef } from "./combos";
import { canHavePartner, canPair } from "./partners";
import { cooccurrenceKey, learnedPartners, referenceFor, referenceShare, type CommanderReference } from "./duel-reference";
import { BASIC_LAND_BY_COLOR, isLegalInFormat } from "./collection-builder";
import { getDisplayOracleText } from "./scryfall";
import { duelMetaPresence, duelMetaPresenceInColors } from "./duel-meta";
import { DUEL_PROFILES_AVAILABLE, duelPresenceForIdentity, duelStatsForIdentity } from "./duel-profiles";

/**
 * Constructeur de decks COMPÉTITIF (25/09/2026, demande de Ben) :
 *
 * « j'importe une liste de cartes ; je sélectionne commander multi ou
 * commander duel [...] ; le système suggère des decks avec les cartes de
 * la liste et un commander (dans la liste ou en dehors) [...] ; l'objectif
 * est de créer des decks les plus compétitifs possible (tier 4 est
 * l'objectif et s'en rapprocher doit être la priorité absolue) [...] ; un
 * pool de cartes recommandées en dehors de la liste importée pour rendre
 * le deck encore plus performant. »
 *
 * Différences de fond avec collection-builder.ts (qui reste en place pour
 * ses fonctions utilitaires — légalité, éligibilité, terrains de base) :
 *
 * 1. Le tier n'est plus approximé carte par carte (`cardPowerScore`) : à
 *    chaque créneau, le gain de CHAQUE carte candidate est son GAIN
 *    MARGINAL EXACT sur l'indice de puissance, calculé avec la même
 *    formule que le badge affiché (`tierComponentsFromCounts`,
 *    deck-tier.ts) à partir de compteurs incrémentaux. Conséquences
 *    automatiques : le 1er Game Changer vaut 10 points, les suivants 6,
 *    plus rien au-delà du plafond ; un tutor vaut plus tant que la cible de
 *    tutors n'est pas atteinte ; une carte chère fait baisser la
 *    composante « courbe »... sans règle ad hoc.
 * 2. Synergie avec le commandant (synergy.ts) dès la première carte, au
 *    lieu d'une détection d'archétype a posteriori sur une sélection
 *    « seed ».
 * 3. Combos connues (combos.ts) : bonus aux pièces d'une combo réalisable
 *    avec les cartes disponibles, et gain de tier exact quand la combo se
 *    complète.
 * 4. Profil de jeu Multi vs Duel (`MODE_PROFILES`) : le Duel est un format
 *    plus court et plus interactif (1 seul adversaire, 20 points de vie) —
 *    courbe plus basse, interaction à bas coût, et signal « joué en
 *    tournoi » (duel-meta.ts).
 * 5. Pool d'acquisition : des cartes NON possédées peuvent être autorisées
 *    (`acquirable`) avec une petite pénalité ; elles n'entrent que si elles
 *    battent une carte possédée, et leur nombre est plafonné.
 *
 * Tout ici est PUR (aucun appel réseau) : les cartes sont résolues par
 * l'appelant (actions.ts), comme dans collection-builder.ts.
 */

export type BuildMode = "multi" | "duel";

/**
 * Réglages par mode. Tous des repères de deckbuilding, pas des données
 * officielles (même statut que idealAvgCmc/idealLandRatio de formats.ts) :
 * - `curveSoftCap`/`curvePenalty` : pénalité par point de coût au-dessus du
 *   seuil. En Duel, une carte à 5+ manas doit vraiment le mériter (parties
 *   de 10-20 min selon mtgtop8, voir formats.ts) ; en multi le seuil est
 *   plus haut, les parties sont plus longues.
 * - `cheapInteractionBonus` : removal/disruption/contresort à ≤2 manas. En
 *   1v1, chaque interaction répond au SEUL adversaire, et le tempo prime.
 * - `metaWeight` : poids de la présence en tournoi (duel-meta.ts) dans le
 *   choix d'une carte — seulement en Duel (pas de données équivalentes
 *   pour le multi).
 * - `maxLandCut` : nombre max de terrains retirés de la cible quand le deck
 *   contient beaucoup de mana rapide (1 terrain retiré par 2 sources de
 *   mana rapide). Pratique courante des decks haute puissance.
 * - `tappedLandPenalty` (26/09/2026, retour de Ben) : malus d'un terrain qui
 *   arrive TOUJOURS engagé (temple, « thriving », karoo, campus…). Un tour
 *   de retard coûte bien plus en Duel (parties courtes) qu'en multi.
 */
export interface ModeProfile {
  /** Poids de la part d'une carte dans les decks de tournoi de CE commandant (duel-reference.ts). */
  referenceWeight: number;
  /** Poids des synergies apprises (co-occurrence entre commandants, duel-reference.ts). */
  learnedSynergyWeight: number;
  curveSoftCap: number;
  curvePenalty: number;
  cheapInteractionBonus: number;
  metaWeight: number;
  maxLandCut: number;
  tappedLandPenalty: number;
  /**
   * Poids du statut « Game Changer » dans le choix (26/09/2026). Les Game
   * Changers sont une notion des brackets du Commander MULTIJOUEUR : en Duel,
   * l'analyse de 1500 decks de tournoi montre qu'ils n'y sont pas un bon
   * guide (ex. Glacial Chasm, Game Changer, jamais jouée en Duel, alors que
   * le constructeur la mettait partout). 0 = ignoré dans le choix des cartes
   * (le tier affiché, lui, ne change pas).
   */
  gameChangerWeight: number;
  /** Suivre les profils par identité couleur des decks de tournoi (terrains, cartes). */
  useColorProfiles: boolean;
}

export const MODE_PROFILES: Record<BuildMode, ModeProfile> = {
  // referenceWeight 6 : une carte jouée par 100% des decks de tournoi de ce
  // commandant gagne 6 points — l'équivalent d'un Game Changer suivant ;
  // la référence oriente fortement, sans écraser le 1er Game Changer (+10).
  // learnedSynergyWeight : appliqué à chaque partenaire déjà choisi (lift
  // plafonné à 6, voir greedyPick) ; moitié moins en multi, les données
  // venant du Duel.
  multi: { referenceWeight: 0, learnedSynergyWeight: 0.5, curveSoftCap: 5, curvePenalty: 0.4, cheapInteractionBonus: 0.5, metaWeight: 0, maxLandCut: 3, tappedLandPenalty: 0.75, gameChangerWeight: 1, useColorProfiles: false },
  // 26/09/2026 — poids recalés sur 1500 decks de tournoi (juillet-septembre
  // 2026), en mesurant la part du « cœur » réel (cartes jouées par ≥ 50% des
  // decks d'un commandant) que retrouve le constructeur quand toutes les
  // cartes du méta sont disponibles (script d'évaluation décrit dans le
  // README) : metaWeight 5 → 16 et referenceWeight 6 → 12 font passer ce
  // recouvrement de 43% à 74% sans données propres au commandant, et à 91%
  // avec (test sur des decks postérieurs à ceux qui servent de référence).
  duel: { referenceWeight: 12, learnedSynergyWeight: 1, curveSoftCap: 4, curvePenalty: 0.9, cheapInteractionBonus: 1.3, metaWeight: 16, maxLandCut: 0, tappedLandPenalty: 1.5, gameChangerWeight: 0, useColorProfiles: true },
};

export function modeForFormat(format: FormatConfig): BuildMode {
  return format.key === "duelcommander" ? "duel" : "multi";
}

/**
 * Poids du gain marginal de tier dans le score d'une carte — le levier de
 * la « priorité absolue » demandée par Ben. 1 point d'indice = 1 point de
 * score : le 1er Game Changer (+10 d'indice) écrase donc toute autre
 * considération (un pilier vaut ~1.5-2.5), un tutor (+3.3 d'indice en
 * multi) pèse plus qu'un pilier, et quand plus aucune composante du tier
 * ne peut progresser, ce sont les piliers/la synergie qui départagent —
 * ce qui garde un deck fonctionnel.
 */
const TIER_WEIGHT = 1;
/** Voir WEAKEST_CATEGORY_BONUS dans collection-builder.ts — même rôle, même valeur. */
const WEAKEST_CATEGORY_BONUS = 2.5;

/**
 * Nombre maximal de couleurs d'un deck proposé (26/09/2026, règle fixée par
 * Ben : « 1, 2 ou 3 couleurs max »). Au-delà, la base de mana devient
 * lente et fragile (terrains engagés, sorts bloqués faute de la bonne
 * couleur) : les commandants 4-5 couleurs n'étaient favorisés que parce
 * qu'ils donnent accès à TOUTES les cartes de la liste, sans que la
 * formule de tier ne compte ce coût.
 */
export const MAX_DECK_COLORS = 3;

/**
 * Terrains de base minimum selon le nombre de couleurs (26/09/2026, retour
 * de Ben : « tu ne suggères que des terrains spéciaux et pas de base »).
 * Avec une grande collection, presque chaque terrain non-base de la liste
 * valait « un peu plus » qu'un terrain de base (fixing, présence en
 * tournoi…) et prenait les ~35 places. Des terrains de base restent
 * indispensables : cibles des fetchlands, résistance à Blood Moon / Back to
 * Basics (joués en Duel), et une base de mana qui arrive dégagée.
 * Valeurs = choix de conception (ordre de grandeur des listes que je
 * connais, pas une statistique mesurée) : ~2/3 des terrains en monocolore,
 * ~40% en bicolore, ~25% en tricolore. Index = nombre de couleurs.
 */
export const MIN_BASICS_BY_COLORS = [0, 24, 14, 9] as const;

export function minBasicsFor(colorCount: number): number {
  return MIN_BASICS_BY_COLORS[Math.min(colorCount, MIN_BASICS_BY_COLORS.length - 1)] ?? 0;
}

/**
 * Terrain qui arrive toujours engagé. Les formulations conditionnelles
 * (« unless you control… », terrains de choc « you may pay 2 life… ») ne
 * comptent pas. Heuristique sur le texte oracle, pas une donnée Scryfall.
 */
const ENTERS_TAPPED = /enters (the battlefield )?tapped/i;
const CONDITIONAL_TAPPED = /unless|you may pay|if you control|if it's not your turn|as .* enters, you may/i;
const BASIC_TYPE_BY_COLOR: Record<string, string> = { W: "plains", U: "island", B: "swamp", R: "mountain", G: "forest" };
/**
 * Un fetchland ne sert que s'il trouve un terrain de base / un type de base
 * des couleurs du deck (26/09/2026 : Scalding Tarn — île ou montagne — était
 * choisie pour des decks mono-blancs).
 */
export function fetchFindsIdentity(card: ScryfallCard, identity: string[]): boolean {
  const text = getDisplayOracleText(card).toLowerCase();
  if (/basic land card/.test(text)) return true;
  return identity.some((c) => text.includes(BASIC_TYPE_BY_COLOR[c]));
}

export function entersTappedAlways(card: ScryfallCard): boolean {
  const text = getDisplayOracleText(card).split("\n//\n")[0];
  return ENTERS_TAPPED.test(text) && !CONDITIONAL_TAPPED.test(text);
}
/** Bonus d'une pièce de combo réalisable avec les cartes disponibles (s'ajoute au gain de tier exact quand elle COMPLÈTE la combo). */
const COMBO_PIECE_BONUS = 3;
/** Pénalité d'une carte non possédée : à valeur égale, une carte possédée passe devant. Faible devant un gain de tier réel (≥3). */
const ACQUISITION_PENALTY = 1.5;
/** Nombre max de cartes non-terrain considérées par commandant (présélection statique) — borne le coût de la sélection gloutonne. */
const NONLAND_SHORTLIST = 260;
/** Voir `withPrior` dans greedyPick. */
const CURVE_PRIOR_CARDS = 10;
const LAND_SHORTLIST = 120;

/** Tout ce qu'on sait d'une carte, calculé UNE fois (voir buildFeatureIndex). */
export interface CardFeatures {
  card: ScryfallCard;
  key: string;
  categories: DeckCategory[];
  tier: CardTierSignals;
  synergy: CardSynergyFeatures;
  isLand: boolean;
  isBasic: boolean;
  /** Pièce d'une combo de la base CURATÉE (les combos Commander Spellbook sont gérées par build, voir BuildContext.combos). */
  comboPiece: boolean;
  /** Terrain qui cherche un terrain d'un type de base (fetchland) — compte comme fixing. */
  fetchesBasicType: boolean;
  /** Part des decks de tournoi Duel qui la jouent, à couleurs égales si disponible (duel-meta.ts) — signal de CHOIX ; le tier utilise `tier.duelMeta`. */
  duelMetaChoice: number;
  /** Part globale (pour l'affichage si pas de part à couleurs égales). */
  duelMetaGlobal: number;
}

const CURATED_PIECES = comboPieceSet(CURATED_COMBOS);

const BASIC_TYPE_FETCH = /search your library for an? [^.]*(plains|island|swamp|mountain|forest)/i;

/**
 * Index des cartes légales dans le format (hors synergie singleton morte),
 * clé = nom en minuscules. À construire une fois pour l'ensemble
 * possédé + acquérable, puis réutilisé pour chaque commandant évalué
 * (même leçon que le correctif de performance du 24/09/2026 : ne jamais
 * refaire le travail regex par candidat).
 */
export function buildFeatureIndex(cards: Iterable<ScryfallCard>, format: FormatConfig): Map<string, CardFeatures> {
  const index = new Map<string, CardFeatures>();
  for (const card of cards) {
    const key = card.name.toLowerCase();
    if (index.has(key)) continue;
    if (!isLegalInFormat(card, format)) continue;
    if (format.maxCopies <= 1 && hasDeadSingletonSynergy(card)) continue;
    const categories = classifyCard(card);
    // Face AVANT uniquement (26/09/2026) : une carte modale « sort // terrain »
    // (Sink into Stupor // Soporific Springs…) prenait une place de terrain ;
    // les decks de tournoi la comptent comme un sort (qui peut dépanner en terrain).
    const isLand = Boolean(card.type_line?.split(" // ")[0].includes("Land"));
    index.set(key, {
      card,
      key,
      categories,
      tier: cardTierSignals(card, categories),
      synergy: cardSynergyFeatures(card),
      isLand,
      isBasic: Boolean(card.type_line?.includes("Basic Land")),
      comboPiece: CURATED_PIECES.has(key),
      fetchesBasicType: isLand && BASIC_TYPE_FETCH.test(getDisplayOracleText(card)),
      duelMetaChoice: duelMetaPresenceInColors(card.name),
      duelMetaGlobal: duelMetaPresence(card.name),
    });
  }
  return index;
}

function inIdentity(card: ScryfallCard, identity: string[]): boolean {
  return card.color_identity.every((c) => identity.includes(c));
}

interface PickState {
  /** Pièces de combo (minuscules) des combos utilisées pour ce build. */
  pieceSet: Set<string>;
  combos: readonly ComboDef[];
  categoryCounts: Record<DeckCategory, number>;
  tierCounts: TierCounts;
  pickedKeys: Set<string>;
  comboPiecesPicked: Set<string>;
  /** Clés de co-occurrence (face avant, minuscules) des cartes déjà choisies. */
  pickedCoKeys: Set<string>;
  /** Référence tournoi du/des commandant(s), si disponible (Duel). */
  reference: CommanderReference | null;
}

interface PickedEntry {
  f: CardFeatures;
  count: number;
  acquired: boolean;
  score: number;
  tierGain: number;
  reasons: string[];
}

function addToTierCounts(counts: TierCounts, f: CardFeatures, count: number): TierCounts {
  const t = f.tier;
  return {
    gameChangers: counts.gameChangers + (t.gameChanger ? count : 0),
    fastMana: counts.fastMana + (t.fastMana ? count : 0),
    tutor: counts.tutor + (t.tutor ? count : 0),
    interaction:
      counts.interaction +
      (f.categories.includes("removal") ? count : 0) +
      (f.categories.includes("disruption") ? count : 0),
    extraTurns: counts.extraTurns + (t.extraTurn ? count : 0),
    massLandDenial: counts.massLandDenial + (t.massLandDenial ? count : 0),
    combos: counts.combos,
    duelMetaSum: counts.duelMetaSum + t.duelMeta,
    nonLandCount: counts.nonLandCount + (f.isLand ? 0 : count),
    nonLandCmcSum: counts.nonLandCmcSum + (f.isLand ? 0 : f.card.cmc * count),
  };
}

export interface BuildContext {
  /** 1 commandant, ou 2 pour un duo (partenaires, Background... voir partners.ts). */
  commanders: ScryfallCard[];
  format: FormatConfig;
  mode: BuildMode;
  features: Map<string, CardFeatures>;
  /** Nombre d'exemplaires possédés (clé : nom en minuscules). */
  owned: Map<string, number>;
  /** Cartes non possédées que le constructeur a le droit de proposer (clés minuscules). Vide = deck 100% possédé (hors commandant). */
  acquirable: Set<string>;
  /** Plafond de cartes non possédées retenues (hors commandant). */
  maxAcquisitions: number;
  /** Terrains de base résolus (clé minuscule). Supposés toujours disponibles. */
  basics: Map<string, ScryfallCard>;
  /** Profil de synergie précalculé du/des commandant(s) (sinon calculé). */
  profile?: CommanderProfile;
  /** Combos à viser (défaut : base curatée ; en production, enrichies par Commander Spellbook). */
  combos?: readonly ComboDef[];
  /** Référence tournoi ; par défaut recherchée automatiquement en Duel (duel-reference.ts). */
  reference?: CommanderReference | null;
}

export interface BuiltDeck {
  commanders: ScryfallCard[];
  /** Chaque commandant est-il possédé ? (même ordre que `commanders`) */
  commandersOwned: boolean[];
  cards: { name: string; count: number }[];
  /** Cartes du deck qui ne sont PAS dans la collection (hors commandant), de la plus impactante à la moins impactante. */
  acquisitions: { name: string; card: ScryfallCard; reasons: string[]; tierGain: number; score: number }[];
  /** Pour toutes les cartes non-terrain choisies : raisons principales (pour l'UI). */
  reasonsByName: Record<string, string[]>;
  stats: DeckStats;
  tier: DeckTierResult;
  profile: CommanderProfile;
  reference: CommanderReference | null;
}

/**
 * Score « statique » d'une carte pour un commandant (sans état de deck) :
 * sert à la présélection des candidats (shortlist) et à l'estimation
 * d'affinité commandant ↔ collection. Approximation volontaire du gain de
 * tier (valeurs typiques du gain marginal, voir TIER_WEIGHT).
 */
function staticScore(
  f: CardFeatures,
  profile: CommanderProfile,
  format: FormatConfig,
  mode: BuildMode,
  pieceSet: Set<string> = CURATED_PIECES,
  reference: CommanderReference | null = null
): number {
  const { weights, targets } = format.categories;
  const p = MODE_PROFILES[mode];
  let s = 0;
  for (const cat of f.categories) s += weights[cat] / targets[cat];
  if (f.tier.gameChanger) s += 8 * p.gameChangerWeight;
  if (f.tier.fastMana) s += 3;
  if (f.tier.tutor) s += 10 / Math.max(1, targets.tutor);
  if (f.tier.extraTurn) s += 1.5;
  if (pieceSet.has(f.key)) s += 1;
  s += f.duelMetaChoice * p.metaWeight;
  s += referenceShare(reference, f.card.name) * p.referenceWeight;
  s += synergyScore(f.synergy, profile);
  if (!f.isLand && f.card.cmc > p.curveSoftCap) s -= (f.card.cmc - p.curveSoftCap) * p.curvePenalty;
  if (typeof f.card.edhrec_rank === "number" && f.card.edhrec_rank > 0) {
    if (f.card.edhrec_rank <= 300) s += 0.4;
    else if (f.card.edhrec_rank <= 1500) s += 0.15;
  }
  return s;
}

function isCheapInteraction(f: CardFeatures): boolean {
  if (f.isLand || f.card.cmc > 2) return false;
  if (f.categories.includes("removal") || f.categories.includes("disruption")) return true;
  return f.categories.includes("protection") && /counter target/i.test(getDisplayOracleText(f.card));
}

/**
 * Sélection gloutonne « meilleur gain d'abord » (généralise pickBestCards
 * de collection-builder.ts, voir la doc en tête de fichier pour ce qui
 * change). `combosAvailable` : combos dont toutes les pièces sont dans
 * l'ensemble disponible (commandant + candidats) — leurs pièces reçoivent
 * COMBO_PIECE_BONUS, et quand une pièce COMPLÈTE une combo avec des
 * pièces déjà choisies (ou le commandant), le gain de tier exact de la
 * composante « combo » s'ajoute.
 */
function greedyPick(
  candidates: CardFeatures[],
  slots: number,
  ctx: BuildContext,
  profile: CommanderProfile,
  state: PickState,
  combosAvailable: ComboDef[],
  identity: string[],
  /**
   * Score minimal pour être pris (26/09/2026, passe terrains uniquement) :
   * un terrain qui ne vaut pas mieux qu'un terrain de base (0) n'est pas
   * pris — la place revient à un terrain de base de la bonne couleur.
   */
  minScore = Number.NEGATIVE_INFINITY
): PickedEntry[] {
  const { format, mode } = ctx;
  const { weights, targets } = format.categories;
  const p = MODE_PROFILES[mode];
  const picked: PickedEntry[] = [];
  const remaining = new Map(candidates.map((f) => [f.key, f] as const));
  let slotsLeft = slots;
  let acquiredCount = 0;

  const comboPiecesLower = combosAvailable.map((c) => c.pieces.map((x) => x.toLowerCase()));

  while (slotsLeft > 0 && remaining.size > 0) {
    let weakest: DeckCategory | null = null;
    let weakestRatio = Infinity;
    for (const cat of Object.keys(targets) as DeckCategory[]) {
      if (targets[cat] <= 0) continue;
      const ratio = state.categoryCounts[cat] / targets[cat];
      if (ratio < weakestRatio) {
        weakestRatio = ratio;
        weakest = cat;
      }
    }
    if (weakestRatio >= 1) weakest = null;

    // A priori de courbe pour le calcul MARGINAL uniquement : sans lui, la
    // composante « courbe » (moyenne des coûts) oscille fortement tant que
    // peu de cartes sont choisies (la 1re carte à 1 mana vaudrait +5 à elle
    // seule). On ajoute 10 cartes virtuelles au coût idéal du format — le
    // tier AFFICHÉ reste calculé sans cet a priori (computeDeckTier).
    const withPrior = (c: TierCounts): TierCounts => ({
      ...c,
      nonLandCount: c.nonLandCount + CURVE_PRIOR_CARDS,
      nonLandCmcSum: c.nonLandCmcSum + CURVE_PRIOR_CARDS * format.categories.idealAvgCmc,
    });
    const baseIndex = powerIndexFromComponents(
      tierComponentsFromCounts(withPrior(state.tierCounts), format.categories, format.key)
    );

    let best: { f: CardFeatures; score: number; tierGain: number; reasons: string[] } | null = null;
    for (const f of remaining.values()) {
      const acquired = (ctx.owned.get(f.key) ?? 0) <= 0;
      if (acquired && acquiredCount >= ctx.maxAcquisitions) continue;

      const reasons: string[] = [];
      const nextCounts = addToTierCounts(state.tierCounts, f, 1);

      // Combo complétée par cette carte ?
      let completes = 0;
      if (state.pieceSet.has(f.key)) {
        comboPiecesLower.forEach((pieces) => {
          if (!pieces.includes(f.key)) return;
          const others = pieces.filter((x) => x !== f.key);
          if (others.every((o) => state.comboPiecesPicked.has(o))) completes++;
        });
      }
      nextCounts.combos = state.tierCounts.combos + completes;
      // Duel : le statut Game Changer ne guide pas le choix (voir gameChangerWeight).
      if (p.gameChangerWeight === 0) nextCounts.gameChangers = state.tierCounts.gameChangers;

      const tierGain =
        powerIndexFromComponents(tierComponentsFromCounts(withPrior(nextCounts), format.categories, format.key)) -
        baseIndex;
      let score = tierGain * TIER_WEIGHT;
      if (f.tier.gameChanger && p.gameChangerWeight > 0) reasons.push("Game Changer");
      if (f.tier.fastMana) reasons.push("Mana rapide");
      if (f.tier.tutor) reasons.push("Tutor");
      if (f.tier.extraTurn) reasons.push("Tour supplémentaire");
      if (completes > 0) reasons.push("Complète une combo");

      // Piliers : valeur pleine sous la cible, réduite au-delà (un 14e
      // removal n'apporte presque plus rien au score de complétude).
      for (const cat of f.categories) {
        const base = weights[cat] / targets[cat];
        score += state.categoryCounts[cat] < targets[cat] ? base : base * 0.3;
      }
      if (weakest && f.categories.includes(weakest)) score += WEAKEST_CATEGORY_BONUS;

      const syn = synergyScore(f.synergy, profile);
      if (syn > 0) {
        score += syn;
        const labels = sharedThemeLabels(f.synergy, profile);
        if (labels.length) reasons.push(`Synergie : ${labels.join(", ")}`);
      }

      if (state.pieceSet.has(f.key) && comboPiecesLower.some((pieces) => pieces.includes(f.key))) {
        score += COMBO_PIECE_BONUS;
        if (completes === 0) reasons.push("Pièce de combo");
      }

      if (p.metaWeight > 0 && f.duelMetaChoice > 0) {
        score += f.duelMetaChoice * p.metaWeight;
        if (f.duelMetaChoice >= 0.1) {
          reasons.push(
            f.duelMetaChoice !== f.duelMetaGlobal
              ? p.useColorProfiles && DUEL_PROFILES_AVAILABLE
                ? `Jouée dans ${Math.round(f.duelMetaChoice * 100)}% des decks de tournoi Duel de ces couleurs`
                : `Jouée dans ${Math.round(f.duelMetaChoice * 100)}% des decks de tournoi Duel de ses couleurs`
              : `Jouée dans ${Math.round(f.duelMetaChoice * 100)}% des decks de tournoi Duel`
          );
        }
      }

      if (p.referenceWeight > 0 && state.reference) {
        const share = referenceShare(state.reference, f.card.name);
        if (share > 0) {
          score += share * p.referenceWeight;
          if (share >= 0.4) {
            reasons.push(
              `Dans ${Math.round(share * 100)}% des decks de tournoi de ce commandant (${state.reference.deckCount} decks)`
            );
          }
        }
      }

      if (p.learnedSynergyWeight > 0) {
        let learned = 0;
        let bestMate: string | null = null;
        for (const mate of learnedPartners(f.card.name)) {
          if (!state.pickedCoKeys.has(mate.key)) continue;
          learned += (Math.min(mate.lift, 6) / 6) * p.learnedSynergyWeight;
          bestMate ??= mate.name;
        }
        if (learned > 0) {
          score += Math.min(2.5, learned);
          reasons.push(`Souvent jouée avec ${bestMate} en tournoi`);
        }
      }

      if (f.isLand) {
        const produced = (f.card.produced_mana ?? []).filter((m) => identity.includes(m));
        if (f.fetchesBasicType) score += fetchFindsIdentity(f.card, identity) ? 1 : -1;
        if (identity.length >= 2 && produced.length === 0 && !f.fetchesBasicType) score -= 1;
        // Deck monocolore : un terrain « bicolore » ne corrige rien, son
        // crédit « fixing » est annulé (un terrain de base fait aussi bien).
        if (identity.length <= 1 && f.categories.includes("landfix")) {
          const base = weights.landfix / targets.landfix;
          score -= state.categoryCounts.landfix < targets.landfix ? base : base * 0.3;
          if (weakest === "landfix") score -= WEAKEST_CATEGORY_BONUS;
        }
        if (entersTappedAlways(f.card)) {
          score -= p.tappedLandPenalty;
        }
      } else {
        if (f.card.cmc > p.curveSoftCap && !f.tier.fastMana) score -= (f.card.cmc - p.curveSoftCap) * p.curvePenalty;
        if (isCheapInteraction(f)) {
          score += p.cheapInteractionBonus;
          if (mode === "duel") reasons.push("Interaction à bas coût");
        }
      }

      if (typeof f.card.edhrec_rank === "number" && f.card.edhrec_rank > 0) {
        if (f.card.edhrec_rank <= 300) score += 0.4;
        else if (f.card.edhrec_rank <= 1500) score += 0.15;
      }

      if (acquired) score -= ACQUISITION_PENALTY;

      if (score <= minScore) continue;
      const better =
        !best || score > best.score || (score === best.score && f.card.name.localeCompare(best.f.card.name) < 0);
      if (better) best = { f, score, tierGain, reasons };
    }
    if (!best) break;

    const { f } = best;
    remaining.delete(f.key);
    const acquired = (ctx.owned.get(f.key) ?? 0) <= 0;
    const ownedCount = ctx.owned.get(f.key) ?? 0;
    const count = f.isBasic ? Math.min(Math.max(ownedCount, 1), slotsLeft) : Math.min(format.maxCopies, slotsLeft);
    if (count <= 0) continue;

    // Mise à jour de l'état partagé (piliers, compteurs de tier, combos).
    for (const cat of f.categories) state.categoryCounts[cat] += count;
    const next = addToTierCounts(state.tierCounts, f, count);
    if (state.pieceSet.has(f.key)) state.comboPiecesPicked.add(f.key);
    next.combos = findCompleteCombos([...state.comboPiecesPicked], state.combos).filter((c) => !c.minor).length;
    state.tierCounts = next;
    state.pickedKeys.add(f.key);
    state.pickedCoKeys.add(cooccurrenceKey(f.card.name));

    picked.push({ f, count, acquired, score: best.score, tierGain: best.tierGain, reasons: best.reasons });
    if (acquired) acquiredCount++;
    slotsLeft -= count;
  }
  return picked;
}

/**
 * Répartit `n` terrains de base selon le poids des symboles de mana de
 * chaque couleur dans les cartes non-terrain choisies (au lieu d'un
 * simple cycle W/U/B/R/G) — un deck qui joue 30 symboles noirs et 5
 * rouges n'a pas besoin d'autant de Montagnes que de Marais. Au moins 1
 * base par couleur de l'identité qui a au moins un symbole.
 */
function distributeBasics(
  n: number,
  identity: string[],
  nonLands: CardFeatures[],
  basics: Map<string, ScryfallCard>
): { name: string; count: number }[] {
  if (n <= 0) return [];
  if (identity.length === 0) return basics.has("wastes") ? [{ name: "Wastes", count: n }] : [];
  const pips: Record<string, number> = {};
  for (const c of identity) pips[c] = 0;
  for (const f of nonLands) {
    const cost = f.card.mana_cost ?? f.card.card_faces?.map((x) => x.mana_cost ?? "").join("") ?? "";
    for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
      for (const c of identity) if (m[1].includes(c)) pips[c] += 1;
    }
  }
  const available = identity.filter((c) => basics.has(BASIC_LAND_BY_COLOR[c]?.toLowerCase() ?? ""));
  if (available.length === 0) return [];
  const total = available.reduce((s, c) => s + pips[c], 0);
  const counts: Record<string, number> = {};
  if (total === 0) {
    available.forEach((c, i) => (counts[c] = Math.floor(n / available.length) + (i < n % available.length ? 1 : 0)));
  } else {
    let assigned = 0;
    for (const c of available) {
      counts[c] = pips[c] > 0 ? Math.max(1, Math.floor((n * pips[c]) / total)) : 0;
      assigned += counts[c];
    }
    // Ajuste l'arrondi : ajoute/retire sur la couleur la plus demandée.
    const byDemand = [...available].sort((a, b) => pips[b] - pips[a]);
    let i = 0;
    while (assigned < n) {
      counts[byDemand[i % byDemand.length]]++;
      assigned++;
      i++;
    }
    while (assigned > n) {
      const c = byDemand.find((x) => counts[x] > 1) ?? byDemand[0];
      counts[c]--;
      assigned--;
    }
  }
  return available
    .filter((c) => counts[c] > 0)
    .map((c) => ({ name: BASIC_LAND_BY_COLOR[c], count: counts[c] }));
}

/** Identité couleur d'un ou deux commandants (union, ordre WUBRG). */
export function unionIdentity(commanders: ScryfallCard[]): string[] {
  const set = new Set(commanders.flatMap((c) => c.color_identity));
  return ["W", "U", "B", "R", "G"].filter((c) => set.has(c));
}

/** Nombre de cartes hors commandant(s) : 99 avec un commandant, 98 avec un duo (deck de 100 cartes au total). */
export function mainDeckSize(format: FormatConfig, commanderCount: number): number {
  return format.deckSize + 1 - commanderCount;
}

/**
 * Construit le meilleur deck possible pour UN commandant ou UN DUO. Étapes :
 * 1. candidats = cartes de l'index dans l'identité (union en duo),
 *    possédées OU acquérables (hors commandants et terrains de base) ;
 * 2. présélection statique (NONLAND_SHORTLIST/LAND_SHORTLIST), pièces de
 *    combo réalisables toujours gardées ;
 * 3. terrains d'abord (leur fixing alimente le pilier « landfix »), puis
 *    non-terrains, par sélection gloutonne au gain marginal (greedyPick) ;
 *    la passe non-terrains prend `maxLandCut` créneaux de plus en réserve ;
 * 4. si le deck contient beaucoup de mana rapide, jusqu'à `maxLandCut`
 *    terrains (les derniers choisis, donc les moins utiles) cèdent leur
 *    place aux non-terrains en réserve ;
 * 5. complément en terrains de base répartis selon les symboles de mana ;
 * 6. si trop de cartes non possédées ont été retenues, on garde les plus
 *    impactantes et on reconstruit avec seulement celles-là autorisées.
 */
export function buildDeckForCommander(ctx: BuildContext): BuiltDeck {
  const first = buildOnce(ctx);
  if (first.acquisitions.length <= ctx.maxAcquisitions) return first;
  const keep = new Set(
    first.acquisitions
      .slice(0, ctx.maxAcquisitions)
      .map((a) => a.name.toLowerCase())
  );
  return buildOnce({ ...ctx, acquirable: keep });
}

function buildOnce(ctx: BuildContext): BuiltDeck {
  const { commanders, format, mode, features, owned, acquirable, basics } = ctx;
  const profile = ctx.profile ?? mergeProfiles(commanders.map(commanderProfile));
  const identity = unionIdentity(commanders);
  const commanderKeys = new Set(commanders.map((c) => c.name.toLowerCase()));
  const p = MODE_PROFILES[mode];
  const deckSize = mainDeckSize(format, commanders.length);
  const comboDefs = ctx.combos ?? CURATED_COMBOS;
  const reference = ctx.reference !== undefined ? ctx.reference : mode === "duel" ? referenceFor(commanders.map((c) => c.name)) : null;

  const available: CardFeatures[] = [];
  for (const f of features.values()) {
    if (commanderKeys.has(f.key) || f.isBasic) continue;
    if (!inIdentity(f.card, identity)) continue;
    const isOwned = (owned.get(f.key) ?? 0) > 0;
    if (!isOwned && !acquirable.has(f.key)) continue;
    available.push(f);
  }
  // Duel (26/09/2026) : présence mesurée dans les decks de tournoi de CETTE
  // identité couleur (duel-profiles.ts) plutôt que dans tous les decks qui
  // peuvent jouer la carte.
  const duelStats = p.useColorProfiles ? duelStatsForIdentity(identity) : null;
  if (p.useColorProfiles && DUEL_PROFILES_AVAILABLE) {
    for (let i = 0; i < available.length; i++) {
      const f = available[i];
      available[i] = { ...f, duelMetaChoice: duelPresenceForIdentity(f.card.name, f.card.color_identity, identity) };
    }
  }

  // Combos réalisables avec ce qui est disponible (commandants compris). Les
  // combos à « modèle » générique (Commander Spellbook : « un outil de
  // sacrifice »...) ne sont pas visées carte par carte : on ne sait pas quelle
  // carte remplit le modèle — elles restent détectées sur le deck final.
  const combosAvailable = findCompleteCombos(
    [...commanders.map((c) => c.name), ...available.map((f) => f.card.name)],
    comboDefs
  ).filter((c) => !c.templates?.length && !c.minor);
  const pieceSet = comboPieceSet(combosAvailable);

  const byStatic = (list: CardFeatures[], limit: number) =>
    list
      .map((f) => ({
        f,
        s:
          staticScore(f, profile, format, mode, pieceSet, reference) -
          ((owned.get(f.key) ?? 0) > 0 ? 0 : ACQUISITION_PENALTY),
      }))
      .sort((a, b) => b.s - a.s || a.f.card.name.localeCompare(b.f.card.name))
      .slice(0, limit)
      .map((x) => x.f);

  const withCombos = (short: CardFeatures[], all: CardFeatures[]) => {
    const inShort = new Set(short.map((f) => f.key));
    return [...short, ...all.filter((f) => pieceSet.has(f.key) && !inShort.has(f.key))];
  };

  const landsAll = available.filter((f) => f.isLand);
  const nonLandsAll = available.filter((f) => !f.isLand);
  const lands = withCombos(byStatic(landsAll, LAND_SHORTLIST), landsAll);
  const nonLands = withCombos(byStatic(nonLandsAll, NONLAND_SHORTLIST), nonLandsAll);

  // Duel : nombre de terrains et de terrains de base = médianes des decks de
  // tournoi de cette identité (duel-profiles.ts) ; multi : ratio du format
  // et plancher MIN_BASICS_BY_COLORS.
  const landTarget = duelStats
    ? Math.max(34, Math.min(40, Math.round(duelStats.lands)))
    : Math.round(format.categories.idealLandRatio * deckSize);
  const basicsTarget = duelStats ? Math.round(duelStats.basics) : minBasicsFor(identity.length);
  const nonLandTarget = deckSize - landTarget;

  const state: PickState = {
    pieceSet,
    combos: combosAvailable,
    categoryCounts: { ...EMPTY_CATEGORY_COUNTS },
    tierCounts: { ...EMPTY_TIER_COUNTS },
    pickedKeys: new Set(),
    comboPiecesPicked: new Set(),
    pickedCoKeys: new Set(commanders.map((c) => cooccurrenceKey(c.name))),
    reference,
  };
  // Les commandants comptent pour les combos et les Game Changers — pas pour
  // les piliers/la courbe (même convention que computeDeckStats).
  for (const c of commanders) {
    const key = c.name.toLowerCase();
    if (pieceSet.has(key)) state.comboPiecesPicked.add(key);
    if (c.game_changer) state.tierCounts.gameChangers += 1;
  }
  state.tierCounts.combos = findCompleteCombos([...state.comboPiecesPicked], combosAvailable).length;

  const commandersOwned = commanders.map((c) => (owned.get(c.name.toLowerCase()) ?? 0) > 0);

  // Terrains non-base : seulement ceux qui valent mieux qu'un terrain de base
  // (minScore 0), et jamais au-delà de ce que laisse le plancher de terrains
  // de base (minBasicsFor).
  const poolLandSlots = Math.max(0, landTarget - basicsTarget);
  const landPicks = greedyPick(lands, poolLandSlots, ctx, profile, state, combosAvailable, identity, 0);
  const landAcq = landPicks.filter((x) => x.acquired).length;
  const nonLandPicks = greedyPick(
    nonLands,
    nonLandTarget + p.maxLandCut,
    { ...ctx, maxAcquisitions: Math.max(0, ctx.maxAcquisitions - landAcq) },
    profile,
    state,
    combosAvailable,
    identity
  );

  // Coupe de terrains selon le mana rapide RÉELLEMENT retenu dans la
  // partie « normale » de la sélection non-terrain.
  const coreNonLands = nonLandPicks.slice(0, nonLandTarget);
  const fastManaCount = coreNonLands.filter((x) => x.f.tier.fastMana).reduce((s, x) => s + x.count, 0);
  const landsFromPool = landPicks.reduce((s, x) => s + x.count, 0);
  const basicsNeeded = Math.max(0, landTarget - landsFromPool);
  const cut = Math.min(p.maxLandCut, Math.floor(fastManaCount / 2));

  let finalLandPicks = landPicks;
  let basicsCount = basicsNeeded;
  // 26/09/2026 : on coupe d'abord les derniers terrains non-base choisis
  // (les moins utiles), puis des terrains de base — pour garder le plancher
  // de terrains de base autant que possible.
  let toCut = cut;
  const fromPool = Math.min(toCut, landPicks.length);
  if (fromPool > 0) finalLandPicks = landPicks.slice(0, landPicks.length - fromPool);
  toCut -= fromPool;
  const fromBasics = Math.min(toCut, basicsCount);
  basicsCount -= fromBasics;

  const finalNonLands = nonLandPicks.slice(0, nonLandTarget + cut);
  // Si le pool est trop petit, les créneaux non-terrain manquants deviennent
  // des terrains de base (deck toujours jouable à exactement deckSize cartes).
  const nonLandCount = finalNonLands.reduce((s, x) => s + x.count, 0);
  const landCount = finalLandPicks.reduce((s, x) => s + x.count, 0);
  basicsCount += Math.max(0, deckSize - nonLandCount - landCount - basicsCount);

  const basicsList = distributeBasics(basicsCount, identity, finalNonLands.map((x) => x.f), basics);

  const cards = new Map<string, { name: string; count: number }>();
  const add = (name: string, count: number) => {
    const key = name.toLowerCase();
    const cur = cards.get(key);
    if (cur) cur.count += count;
    else cards.set(key, { name, count });
  };
  for (const x of finalLandPicks) add(x.f.card.name, x.count);
  for (const x of finalNonLands) add(x.f.card.name, x.count);
  for (const b of basicsList) add(b.name, b.count);
  // Ajustement final exact à deckSize (arrondis de répartition).
  let total = Array.from(cards.values()).reduce((s, c) => s + c.count, 0);
  if (total > deckSize) {
    for (const b of [...basicsList].reverse()) {
      const e = cards.get(b.name.toLowerCase());
      while (e && e.count > 0 && total > deckSize) {
        e.count--;
        total--;
      }
      if (e && e.count === 0) cards.delete(b.name.toLowerCase());
    }
  }

  const allPicks = [...finalLandPicks, ...finalNonLands];
  const acquisitions = allPicks
    .filter((x) => x.acquired)
    .sort((a, b) => b.tierGain - a.tierGain || b.score - a.score)
    .map((x) => ({ name: x.f.card.name, card: x.f.card, reasons: x.reasons, tierGain: Math.round(x.tierGain * 10) / 10, score: x.score }));

  const reasonsByName: Record<string, string[]> = {};
  for (const x of allPicks) if (x.reasons.length) reasonsByName[x.f.card.name] = x.reasons;

  const deckList = Array.from(cards.values());
  const { stats, tier } = evaluateDeck(deckList, commanders, features, basics, format, comboDefs);

  return { commanders, commandersOwned, cards: deckList, acquisitions, reasonsByName, stats, tier, profile, reference };
}

/** Score + tier d'une liste, avec les mêmes fonctions que le tableau de bord (computeDeckStats/computeDeckTier). */
export function evaluateDeck(
  list: { name: string; count: number }[],
  commanders: ScryfallCard[],
  features: Map<string, CardFeatures>,
  basics: Map<string, ScryfallCard>,
  format: FormatConfig,
  comboDefs: readonly ComboDef[] = CURATED_COMBOS
): { stats: DeckStats; tier: DeckTierResult } {
  const enriched: EnrichedCard[] = list.map((e) => ({
    name: e.name,
    count: e.count,
    isCommander: false,
    card: features.get(e.name.toLowerCase())?.card ?? basics.get(e.name.toLowerCase()) ?? null,
  }));
  const stats = computeDeckStats(enriched, format.categories);
  const tier = computeDeckTier(enriched, commanders, stats, format.categories, format.key, comboDefs);
  return { stats, tier };
}

/**
 * Remplace le tier d'un deck construit par celui calculé avec l'estimation
 * Commander Spellbook (combos confirmées + bracket), même formule
 * (tierWithSpellbook, deck-tier.ts). Le deck lui-même ne change pas.
 */
export function rescoreWithSpellbook(
  deck: BuiltDeck,
  features: Map<string, CardFeatures>,
  basics: Map<string, ScryfallCard>,
  format: FormatConfig,
  estimate: { bracketTag: string; label: string; combos: ComboDef[] }
): BuiltDeck {
  const enriched: EnrichedCard[] = deck.cards.map((e) => ({
    name: e.name,
    count: e.count,
    isCommander: false,
    card: features.get(e.name.toLowerCase())?.card ?? basics.get(e.name.toLowerCase()) ?? null,
  }));
  const tier = tierWithSpellbook(enriched, deck.commanders, deck.stats, format.categories, format.key, estimate);
  return { ...deck, tier };
}

export type CandidateSource = "collection" | "popular" | "high-power" | "duel-meta";

/** Un commandant seul OU un duo. */
export interface CommanderCandidate {
  cards: ScryfallCard[];
  /** Possession de chaque commandant (même ordre que `cards`). */
  owned: boolean[];
  /** D'où vient ce candidat (affiché dans l'UI) — pour un duo, la source du 1er commandant. */
  source: CandidateSource;
}

export function candidateKey(c: { cards: ScryfallCard[] }): string {
  return c.cards.map((x) => x.name).join(" + ");
}

export interface DeckProposal {
  candidate: CommanderCandidate;
  /** Deck avec UNIQUEMENT les cartes possédées (+ les commandants, possédés ou non). */
  ownedDeck: BuiltDeck;
  /** Deck avec le pool recommandé autorisé (jusqu'à maxAcquisitions cartes). */
  upgradedDeck: BuiltDeck;
  affinity: number;
}

/**
 * Affinité rapide commandant(s) ↔ collection (présélection avant la
 * construction complète, coûteuse) : somme des meilleurs scores statiques
 * des cartes POSSÉDÉES jouables dans l'identité, plus la puissance propre
 * des commandants. Un duo élargit l'identité : son affinité est
 * naturellement plus haute s'il ouvre des couleurs bien fournies dans la
 * collection.
 */
export function commanderAffinity(
  commanders: ScryfallCard[],
  features: Map<string, CardFeatures>,
  owned: Map<string, number>,
  format: FormatConfig,
  mode: BuildMode
): number {
  const profile = mergeProfiles(commanders.map(commanderProfile));
  const identity = unionIdentity(commanders);
  const keys = new Set(commanders.map((c) => c.name.toLowerCase()));
  const reference = mode === "duel" ? referenceFor(commanders.map((c) => c.name)) : null;
  const scores: number[] = [];
  for (const f of features.values()) {
    if (f.isBasic || f.isLand) continue;
    if ((owned.get(f.key) ?? 0) <= 0) continue;
    if (keys.has(f.key)) continue;
    if (!inIdentity(f.card, identity)) continue;
    scores.push(staticScore(f, profile, format, mode, CURATED_PIECES, reference));
  }
  scores.sort((a, b) => b - a);
  const top = scores.slice(0, 55).reduce((s, x) => s + Math.max(0, x), 0);
  const self = commanders.reduce(
    (s, c) => s + (c.game_changer ? 8 : 0) + (CURATED_PIECES.has(c.name.toLowerCase()) ? 2 : 0),
    0
  );
  return top + self;
}

/**
 * Duos possibles parmi les candidats (25/09/2026, voir partners.ts pour les
 * règles). Pour borner le coût : on ne considère que les `perSide`
 * meilleurs candidats « à partenaire » (par affinité seul), puis on évalue
 * l'affinité de chaque duo compatible et on garde les `limit` meilleurs.
 * `mates` : cartes qui ne peuvent être commandant QU'en duo (Background),
 * absentes de la liste des candidats seuls.
 */
export function generatePairs(
  singles: { c: CommanderCandidate; affinity: number }[],
  mates: CommanderCandidate[],
  features: Map<string, CardFeatures>,
  owned: Map<string, number>,
  format: FormatConfig,
  mode: BuildMode,
  perSide = 25,
  limit = 12,
  maxColors = MAX_DECK_COLORS
): { c: CommanderCandidate; affinity: number }[] {
  const partnerCapable = singles.filter((x) => canHavePartner(x.c.cards[0])).slice(0, perSide);
  const pool = [...partnerCapable.map((x) => x.c), ...mates.slice(0, perSide)];
  const out: { c: CommanderCandidate; affinity: number }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i].cards[0];
      const b = pool[j].cards[0];
      if (!canPair(a, b)) continue;
      if (unionIdentity([a, b]).length > maxColors) continue;
      // Ordre d'affichage : le Background en second, sinon ordre alphabétique.
      const isBg = (x: ScryfallCard) => Boolean(x.type_line?.includes("Background"));
      const cards = [a, b].sort((x, y) => Number(isBg(x)) - Number(isBg(y)) || x.name.localeCompare(y.name));
      const key = cards.map((x) => x.name).join(" + ");
      if (seen.has(key)) continue;
      seen.add(key);
      const byName = new Map([...pool].map((p) => [p.cards[0].name, p] as const));
      const cand: CommanderCandidate = {
        cards,
        owned: cards.map((x) => byName.get(x.name)?.owned[0] ?? false),
        source: byName.get(cards[0].name)?.source ?? "popular",
      };
      out.push({ c: cand, affinity: commanderAffinity(cards, features, owned, format, mode) });
    }
  }
  out.sort((x, y) => y.affinity - x.affinity || candidateKey(x.c).localeCompare(candidateKey(y.c)));
  return out.slice(0, limit);
}

export interface RankParams {
  candidates: CommanderCandidate[];
  /** Cartes qui ne peuvent être commandant qu'en duo (Background). */
  mates?: CommanderCandidate[];
  features: Map<string, CardFeatures>;
  owned: Map<string, number>;
  acquirable: Set<string>;
  maxAcquisitions: number;
  format: FormatConfig;
  basics: Map<string, ScryfallCard>;
  /** Nombre de commandants SEULS évalués en détail après présélection par affinité. */
  maxTrials?: number;
  /** Nombre minimal de commandants POSSÉDÉS évalués en détail (s'il y en a). */
  minOwnedTrials?: number;
  /** Nombre de DUOS évalués en détail. */
  maxPairTrials?: number;
  /** Couleurs max du deck (commandant·s compris) — MAX_DECK_COLORS par défaut. */
  maxColors?: number;
  combos?: readonly ComboDef[];
}

/**
 * Classe les candidats (possédés ET non possédés, seuls ET en duo — un
 * seul classement comme demandé par Ben) par TIER du deck constructible
 * avec les cartes possédées, puis tier potentiel (avec le pool recommandé),
 * puis score de complétude. Convention du projet (HANDOFF §11) : tier
 * d'abord, score en départage.
 */
export function rankProposals(params: RankParams): DeckProposal[] {
  const { candidates, features, owned, acquirable, maxAcquisitions, format, basics } = params;
  const mode = modeForFormat(format);
  const maxTrials = params.maxTrials ?? 30;
  const minOwned = params.minOwnedTrials ?? 8;
  const maxPairs = params.maxPairTrials ?? 10;

  const maxColors = params.maxColors ?? MAX_DECK_COLORS;
  const withAffinity = candidates.filter((c) => unionIdentity(c.cards).length <= maxColors).map((c) => ({
    c,
    affinity: commanderAffinity(c.cards, features, owned, format, mode),
  }));
  withAffinity.sort((a, b) => b.affinity - a.affinity || candidateKey(a.c).localeCompare(candidateKey(b.c)));

  const chosen = new Map<string, (typeof withAffinity)[number]>();
  for (const x of withAffinity.filter((x) => x.c.owned.every(Boolean)).slice(0, minOwned)) chosen.set(candidateKey(x.c), x);
  for (const x of withAffinity) {
    if (chosen.size >= maxTrials) break;
    if (!chosen.has(candidateKey(x.c))) chosen.set(candidateKey(x.c), x);
  }
  if (maxPairs > 0) {
    for (const x of generatePairs(withAffinity, params.mates ?? [], features, owned, format, mode, 25, maxPairs, maxColors)) {
      chosen.set(candidateKey(x.c), x);
    }
  }

  const proposals: DeckProposal[] = [];
  for (const { c, affinity } of chosen.values()) {
    const profile = mergeProfiles(c.cards.map(commanderProfile));
    const base = { commanders: c.cards, format, mode, features, owned, basics, profile, combos: params.combos };
    const ownedDeck = buildDeckForCommander({ ...base, acquirable: new Set(), maxAcquisitions: 0 });
    const upgradedDeck =
      acquirable.size > 0 && maxAcquisitions > 0
        ? buildDeckForCommander({ ...base, acquirable, maxAcquisitions })
        : ownedDeck;
    proposals.push({ candidate: c, ownedDeck, upgradedDeck, affinity });
  }

  sortProposals(proposals);
  return proposals;
}

/** Tri « tier d'abord » (partagé avec competitive-actions.ts après enrichissement Commander Spellbook). */
export function sortProposals(proposals: DeckProposal[]): void {
  proposals.sort(
    (a, b) =>
      b.ownedDeck.tier.powerIndex - a.ownedDeck.tier.powerIndex ||
      b.upgradedDeck.tier.powerIndex - a.upgradedDeck.tier.powerIndex ||
      b.ownedDeck.stats.score - a.ownedDeck.stats.score ||
      Number(b.candidate.owned.every(Boolean)) - Number(a.candidate.owned.every(Boolean)) ||
      candidateKey(a.candidate).localeCompare(candidateKey(b.candidate))
  );
}

/** Seuil d'indice du Tier 4 (tierFromPowerIndex : paliers de 20 points). */
export const TIER4_THRESHOLD = 60;

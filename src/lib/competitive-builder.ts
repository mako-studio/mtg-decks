import type { DeckCategory, DeckStats, EnrichedCard, FormatConfig, ScryfallCard } from "./types";
import { classifyCard, computeDeckStats, EMPTY_CATEGORY_COUNTS, hasDeadSingletonSynergy } from "./deck-score";
import {
  cardTierSignals,
  computeDeckTier,
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
  sharedThemeLabels,
  synergyScore,
  type CardSynergyFeatures,
  type CommanderProfile,
} from "./synergy";
import { ALL_COMBO_PIECES, findCompleteCombos, type ComboDef } from "./combos";
import { BASIC_LAND_BY_COLOR, isLegalInFormat } from "./collection-builder";
import { getDisplayOracleText } from "./scryfall";

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
 */
export interface ModeProfile {
  curveSoftCap: number;
  curvePenalty: number;
  cheapInteractionBonus: number;
  metaWeight: number;
  maxLandCut: number;
}

export const MODE_PROFILES: Record<BuildMode, ModeProfile> = {
  multi: { curveSoftCap: 5, curvePenalty: 0.4, cheapInteractionBonus: 0.5, metaWeight: 0, maxLandCut: 3 },
  duel: { curveSoftCap: 4, curvePenalty: 0.9, cheapInteractionBonus: 1.3, metaWeight: 5, maxLandCut: 3 },
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
  comboPiece: boolean;
  /** Terrain qui cherche un terrain d'un type de base (fetchland) — compte comme fixing. */
  fetchesBasicType: boolean;
}

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
    const isLand = Boolean(card.type_line?.includes("Land"));
    index.set(key, {
      card,
      key,
      categories,
      tier: cardTierSignals(card, categories),
      synergy: cardSynergyFeatures(card),
      isLand,
      isBasic: Boolean(card.type_line?.includes("Basic Land")),
      comboPiece: ALL_COMBO_PIECES.has(key),
      fetchesBasicType: isLand && BASIC_TYPE_FETCH.test(getDisplayOracleText(card)),
    });
  }
  return index;
}

function inIdentity(card: ScryfallCard, identity: string[]): boolean {
  return card.color_identity.every((c) => identity.includes(c));
}

interface PickState {
  categoryCounts: Record<DeckCategory, number>;
  tierCounts: TierCounts;
  pickedKeys: Set<string>;
  comboPiecesPicked: Set<string>;
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
  commander: ScryfallCard;
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
  /** Profil de synergie précalculé du commandant (sinon calculé). */
  profile?: CommanderProfile;
}

export interface BuiltDeck {
  commander: ScryfallCard;
  commanderOwned: boolean;
  cards: { name: string; count: number }[];
  /** Cartes du deck qui ne sont PAS dans la collection (hors commandant), de la plus impactante à la moins impactante. */
  acquisitions: { name: string; card: ScryfallCard; reasons: string[]; tierGain: number; score: number }[];
  /** Pour toutes les cartes non-terrain choisies : raisons principales (pour l'UI). */
  reasonsByName: Record<string, string[]>;
  stats: DeckStats;
  tier: DeckTierResult;
  profile: CommanderProfile;
}

/**
 * Score « statique » d'une carte pour un commandant (sans état de deck) :
 * sert à la présélection des candidats (shortlist) et à l'estimation
 * d'affinité commandant ↔ collection. Approximation volontaire du gain de
 * tier (valeurs typiques du gain marginal, voir TIER_WEIGHT).
 */
function staticScore(f: CardFeatures, profile: CommanderProfile, format: FormatConfig, mode: BuildMode): number {
  const { weights, targets } = format.categories;
  const p = MODE_PROFILES[mode];
  let s = 0;
  for (const cat of f.categories) s += weights[cat] / targets[cat];
  if (f.tier.gameChanger) s += 8;
  if (f.tier.fastMana) s += 3;
  if (f.tier.tutor) s += 10 / Math.max(1, targets.tutor);
  if (f.tier.extraTurn) s += 1.5;
  if (f.comboPiece) s += 1;
  s += f.tier.duelMeta * p.metaWeight;
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
  identity: string[]
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
      if (f.comboPiece) {
        comboPiecesLower.forEach((pieces) => {
          if (!pieces.includes(f.key)) return;
          const others = pieces.filter((x) => x !== f.key);
          if (others.every((o) => state.comboPiecesPicked.has(o))) completes++;
        });
      }
      nextCounts.combos = state.tierCounts.combos + completes;

      const tierGain =
        powerIndexFromComponents(tierComponentsFromCounts(withPrior(nextCounts), format.categories, format.key)) -
        baseIndex;
      let score = tierGain * TIER_WEIGHT;
      if (f.tier.gameChanger) reasons.push("Game Changer");
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

      if (f.comboPiece && comboPiecesLower.some((pieces) => pieces.includes(f.key))) {
        score += COMBO_PIECE_BONUS;
        if (completes === 0) reasons.push("Pièce de combo");
      }

      if (p.metaWeight > 0 && f.tier.duelMeta > 0) {
        score += f.tier.duelMeta * p.metaWeight;
        if (f.tier.duelMeta >= 0.1) reasons.push(`Jouée dans ${Math.round(f.tier.duelMeta * 100)}% des decks de tournoi Duel`);
      }

      if (f.isLand) {
        const produced = (f.card.produced_mana ?? []).filter((m) => identity.includes(m));
        if (f.fetchesBasicType) score += 1;
        if (identity.length >= 2 && produced.length === 0 && !f.fetchesBasicType) score -= 1;
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
    if (f.comboPiece) state.comboPiecesPicked.add(f.key);
    next.combos = findCompleteCombos([...state.comboPiecesPicked]).length;
    state.tierCounts = next;
    state.pickedKeys.add(f.key);

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

/**
 * Construit le meilleur deck possible pour UN commandant. Étapes :
 * 1. candidats = cartes de l'index dans l'identité du commandant,
 *    possédées OU acquérables (hors commandant et terrains de base) ;
 * 2. présélection statique (NONLAND_SHORTLIST/LAND_SHORTLIST) ;
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
  const { commander, format, mode, features, owned, acquirable, basics } = ctx;
  const profile = ctx.profile ?? commanderProfile(commander);
  const identity = commander.color_identity;
  const commanderKey = commander.name.toLowerCase();
  const p = MODE_PROFILES[mode];

  const available: CardFeatures[] = [];
  for (const f of features.values()) {
    if (f.key === commanderKey || f.isBasic) continue;
    if (!inIdentity(f.card, identity)) continue;
    const isOwned = (owned.get(f.key) ?? 0) > 0;
    if (!isOwned && !acquirable.has(f.key)) continue;
    available.push(f);
  }

  const combosAvailable = findCompleteCombos([commander.name, ...available.map((f) => f.card.name)]);

  const byStatic = (list: CardFeatures[], limit: number) =>
    list
      .map((f) => ({ f, s: staticScore(f, profile, format, mode) - ((owned.get(f.key) ?? 0) > 0 ? 0 : ACQUISITION_PENALTY) }))
      .sort((a, b) => b.s - a.s || a.f.card.name.localeCompare(b.f.card.name))
      .slice(0, limit)
      .map((x) => x.f);

  const comboKeys = new Set(combosAvailable.flatMap((c) => c.pieces.map((x) => x.toLowerCase())));
  const withCombos = (short: CardFeatures[], all: CardFeatures[]) => {
    const inShort = new Set(short.map((f) => f.key));
    return [...short, ...all.filter((f) => comboKeys.has(f.key) && !inShort.has(f.key))];
  };

  const landsAll = available.filter((f) => f.isLand);
  const nonLandsAll = available.filter((f) => !f.isLand);
  const lands = withCombos(byStatic(landsAll, LAND_SHORTLIST), landsAll);
  const nonLands = withCombos(byStatic(nonLandsAll, NONLAND_SHORTLIST), nonLandsAll);

  const landTarget = Math.round(format.categories.idealLandRatio * format.deckSize);
  const nonLandTarget = format.deckSize - landTarget;

  const state: PickState = {
    categoryCounts: { ...EMPTY_CATEGORY_COUNTS },
    tierCounts: { ...EMPTY_TIER_COUNTS },
    pickedKeys: new Set(),
    comboPiecesPicked: new Set(),
  };
  // Le commandant compte pour les combos, les Game Changers, la synergie —
  // mais pas pour les piliers/la courbe (même convention que computeDeckStats).
  if (ALL_COMBO_PIECES.has(commanderKey)) state.comboPiecesPicked.add(commanderKey);
  if (commander.game_changer) state.tierCounts.gameChangers += 1;

  const commanderOwned = (owned.get(commanderKey) ?? 0) > 0;

  const landPicks = greedyPick(lands, landTarget, ctx, profile, state, combosAvailable, identity);
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
  // On coupe d'abord des terrains de base (complément), puis les derniers terrains choisis.
  let toCut = cut;
  const fromBasics = Math.min(toCut, basicsCount);
  basicsCount -= fromBasics;
  toCut -= fromBasics;
  if (toCut > 0) finalLandPicks = landPicks.slice(0, Math.max(0, landPicks.length - toCut));
  const landsRemoved = cut;

  const finalNonLands = nonLandPicks.slice(0, nonLandTarget + landsRemoved);
  // Si le pool est trop petit, les créneaux non-terrain manquants deviennent
  // des terrains de base (deck toujours jouable à exactement deckSize cartes,
  // même convention que selectDeckFromPool).
  const nonLandCount = finalNonLands.reduce((s, x) => s + x.count, 0);
  const landCount = finalLandPicks.reduce((s, x) => s + x.count, 0);
  basicsCount += Math.max(0, format.deckSize - nonLandCount - landCount - basicsCount);

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
  if (total > format.deckSize) {
    for (const b of [...basicsList].reverse()) {
      const e = cards.get(b.name.toLowerCase());
      while (e && e.count > 0 && total > format.deckSize) {
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
  const { stats, tier } = evaluateDeck(deckList, commander, features, basics, format);

  return { commander, commanderOwned, cards: deckList, acquisitions, reasonsByName, stats, tier, profile };
}

/** Score + tier d'une liste, avec les mêmes fonctions que le tableau de bord (computeDeckStats/computeDeckTier). */
export function evaluateDeck(
  list: { name: string; count: number }[],
  commander: ScryfallCard,
  features: Map<string, CardFeatures>,
  basics: Map<string, ScryfallCard>,
  format: FormatConfig
): { stats: DeckStats; tier: DeckTierResult } {
  const enriched: EnrichedCard[] = list.map((e) => ({
    name: e.name,
    count: e.count,
    isCommander: false,
    card: features.get(e.name.toLowerCase())?.card ?? basics.get(e.name.toLowerCase()) ?? null,
  }));
  const stats = computeDeckStats(enriched, format.categories);
  const tier = computeDeckTier(enriched, [commander], stats, format.categories, format.key);
  return { stats, tier };
}

export interface CommanderCandidate {
  card: ScryfallCard;
  owned: boolean;
  /** D'où vient ce candidat (affiché dans l'UI). */
  source: "collection" | "popular" | "high-power" | "duel-meta";
}

export interface DeckProposal {
  candidate: CommanderCandidate;
  /** Deck avec UNIQUEMENT les cartes possédées (+ le commandant, possédé ou non). */
  ownedDeck: BuiltDeck;
  /** Deck avec le pool recommandé autorisé (jusqu'à maxAcquisitions cartes). */
  upgradedDeck: BuiltDeck;
  affinity: number;
}

/**
 * Affinité rapide commandant ↔ collection (présélection des commandants
 * avant la construction complète, coûteuse) : somme des meilleurs scores
 * statiques des cartes POSSÉDÉES jouables avec ce commandant, plus la
 * puissance propre du commandant. Un commandant dont l'identité ne couvre
 * presque rien de la collection a une affinité faible et n'est pas évalué
 * en détail.
 */
export function commanderAffinity(
  commander: ScryfallCard,
  features: Map<string, CardFeatures>,
  owned: Map<string, number>,
  format: FormatConfig,
  mode: BuildMode
): number {
  const profile = commanderProfile(commander);
  const identity = commander.color_identity;
  const scores: number[] = [];
  for (const f of features.values()) {
    if (f.isBasic || f.isLand) continue;
    if ((owned.get(f.key) ?? 0) <= 0) continue;
    if (f.key === commander.name.toLowerCase()) continue;
    if (!inIdentity(f.card, identity)) continue;
    scores.push(staticScore(f, profile, format, mode));
  }
  scores.sort((a, b) => b - a);
  const top = scores.slice(0, 55).reduce((s, x) => s + Math.max(0, x), 0);
  const self = (commander.game_changer ? 8 : 0) + (ALL_COMBO_PIECES.has(commander.name.toLowerCase()) ? 2 : 0);
  return top + self;
}

export interface RankParams {
  candidates: CommanderCandidate[];
  features: Map<string, CardFeatures>;
  owned: Map<string, number>;
  acquirable: Set<string>;
  maxAcquisitions: number;
  format: FormatConfig;
  basics: Map<string, ScryfallCard>;
  /** Nombre de commandants évalués en détail après présélection par affinité. */
  maxTrials?: number;
  /** Nombre minimal de commandants POSSÉDÉS évalués en détail (s'il y en a). */
  minOwnedTrials?: number;
}

/**
 * Classe les commandants candidats (possédés ET non possédés, un seul
 * classement comme demandé par Ben) par TIER du deck constructible avec
 * les cartes possédées, puis tier potentiel (avec le pool recommandé),
 * puis score de complétude. Convention du projet (HANDOFF §11) : tier
 * d'abord, score en départage.
 */
export function rankProposals(params: RankParams): DeckProposal[] {
  const { candidates, features, owned, acquirable, maxAcquisitions, format, basics } = params;
  const mode = modeForFormat(format);
  const maxTrials = params.maxTrials ?? 30;
  const minOwned = params.minOwnedTrials ?? 8;

  const withAffinity = candidates.map((c) => ({
    c,
    affinity: commanderAffinity(c.card, features, owned, format, mode),
  }));
  withAffinity.sort((a, b) => b.affinity - a.affinity || a.c.card.name.localeCompare(b.c.card.name));

  const chosen = new Map<string, (typeof withAffinity)[number]>();
  for (const x of withAffinity.filter((x) => x.c.owned).slice(0, minOwned)) chosen.set(x.c.card.name, x);
  for (const x of withAffinity) {
    if (chosen.size >= maxTrials) break;
    if (!chosen.has(x.c.card.name)) chosen.set(x.c.card.name, x);
  }

  const proposals: DeckProposal[] = [];
  for (const { c, affinity } of chosen.values()) {
    const profile = commanderProfile(c.card);
    const base = { commander: c.card, format, mode, features, owned, basics, profile };
    const ownedDeck = buildDeckForCommander({ ...base, acquirable: new Set(), maxAcquisitions: 0 });
    const upgradedDeck =
      acquirable.size > 0 && maxAcquisitions > 0
        ? buildDeckForCommander({ ...base, acquirable, maxAcquisitions })
        : ownedDeck;
    proposals.push({ candidate: c, ownedDeck, upgradedDeck, affinity });
  }

  proposals.sort(
    (a, b) =>
      b.ownedDeck.tier.powerIndex - a.ownedDeck.tier.powerIndex ||
      b.upgradedDeck.tier.powerIndex - a.upgradedDeck.tier.powerIndex ||
      b.ownedDeck.stats.score - a.ownedDeck.stats.score ||
      Number(b.candidate.owned) - Number(a.candidate.owned) ||
      a.candidate.card.name.localeCompare(b.candidate.card.name)
  );
  return proposals;
}

/** Seuil d'indice du Tier 4 (tierFromPowerIndex : paliers de 20 points). */
export const TIER4_THRESHOLD = 60;

import type { CategoryConfig, DeckCategory, DeckStats, EnrichedCard, FormatKey, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";
import { classifyCard } from "./deck-score";
import { findCompleteCombos, type ComboDef } from "./combos";
import { duelMetaPresence } from "./duel-meta";

/**
 * "Tier de puissance" d'un deck Commander/Duel Commander (24/09/2026,
 * demande de Ben : "je veux ajouter une indication sur la tier du deck (1
 * à 5 avec low, mid, top pour chaque niveau)"). C'est un AXE DIFFÉRENT du
 * score structurel 0-100 de `computeDeckStats` (deck-score.ts) : le score
 * mesure "ce deck remplit-il bien son rôle par rapport à SA PROPRE cible
 * de piliers" (un deck petit budget bien construit peut avoir un score
 * élevé), alors que le tier mesure "à quel niveau de puissance objectif ce
 * deck joue-t-il, comparé à l'écosystème Commander dans son ensemble"
 * (proximité combo/cEDH, vitesse, densité de cartes ultra-puissantes).
 *
 * Grounding volontaire dans une source réelle plutôt qu'une échelle
 * inventée de toutes pièces (convention du projet, HANDOFF.md §11, et
 * préférence de Ben pour des données vérifiées plutôt que fabriquées) : le
 * système officiel de "Commander Brackets" de Wizards of the Coast
 * (recherché le 24/09/2026 via magic.wizards.com/en/formats/commander et
 * commanderbrackets.com/faq — système explicitement encore en "beta" à
 * cette date, peut évoluer, à revérifier si ce module est retouché plus
 * tard) définit 5 paliers : 1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized,
 * 5 cEDH — Ben a demandé 5 tiers, ce qui correspond donc exactement au
 * nombre officiel de paliers (contrairement à une première ébauche à 4
 * tiers envisagée puis corrigée par Ben en cours de route). Le
 * discriminant quantifiable principal de WotC est le nombre de "Game
 * Changers" (leur liste officielle de cartes jugées à part) : 0 attendu
 * en brackets 1-2, ≤3 en bracket 3, illimité en 4-5 — ce champ existe déjà
 * dans l'app (`ScryfallCard.game_changer`, alimenté par Scryfall depuis
 * les mêmes données officielles) et est donc le signal dominant ci-dessous
 * (poids 40/100), pas une donnée inventée.
 *
 * ⚠️ Limitation assumée et documentée (voir `caveat` ci-dessous, à
 * afficher tel quel côté UI) : WotC le dit elle-même, "le tableau de
 * cartes est un plancher, pas toute la réponse — l'intention compte le
 * plus". Cette heuristique reste un PROXY textuel/structurel (regex sur le
 * texte oracle, champs Scryfall existants) : elle ne peut PAS détecter de
 * façon fiable une vraie ligne de combo à deux cartes, une pièce de
 * stax/verrou, ou un enchaînement de destruction de terrains — seulement
 * des motifs de surface. Un deck combo rapide mais avec peu de Game
 * Changers "visibles" peut être sous-évalué ; un deck avec plusieurs Game
 * Changers mais mal exécuté peut être surévalué. Aucun système
 * automatique de ce genre ne remplace un vrai jugement humain sur
 * l'intention du deck — c'est la position même de WotC sur son propre
 * système.
 */

export type PowerTierLevel = 1 | 2 | 3 | 4 | 5;
export type PowerSubTier = "low" | "mid" | "top";

export interface DeckTierResult {
  tier: PowerTierLevel;
  subTier: PowerSubTier;
  /** Ex. "Tier 3 — Top" — vocabulaire repris tel quel de la demande de Ben (et de WotC), pas de traduction française qui s'écarterait du terme communautaire habituel. */
  label: string;
  /** Indice de puissance 0-100 — axe séparé du score structurel de computeDeckStats, ne pas confondre les deux dans l'UI. */
  powerIndex: number;
  signals: {
    gameChangerCount: number;
    fastManaCount: number;
    tutorCount: number;
    extraTurnCount: number;
    massLandDenialCount: number;
    avgCmc: number;
    interactionRatio: number;
    /** Combos connues complètes dans le deck (commandant inclus) — voir src/data/combos.ts (25/09/2026). */
    combos: { id: string; pieces: string[]; result: string; note?: string }[];
    /** Somme des parts de présence en tournoi Duel des cartes du deck (Duel Commander uniquement, 0 sinon) — voir duel-meta.ts (25/09/2026). */
    duelMetaSum: number;
  };
  /** Points obtenus par composante (même somme que powerIndex avant arrondi/plafond) — sert au « chemin vers Tier 4 » de l'UI (25/09/2026). */
  components: TierComponents;
  caveat: string;
}

/**
 * Décomposition de l'indice de puissance par composante (25/09/2026,
 * constructeur compétitif). Exposée pour deux usages :
 * - l'UI « chemin vers Tier 4 » (quelles composantes sont loin de leur
 *   maximum et combien de points on gagnerait) ;
 * - le constructeur (competitive-builder.ts), qui calcule le GAIN
 *   MARGINAL EXACT d'une carte sur l'indice en recalculant ces
 *   composantes à partir de compteurs incrémentaux (`TierCounts`), plutôt
 *   qu'une approximation par carte comme `cardPowerScore`. Une seule
 *   formule (`tierComponentsFromCounts`) partagée par le badge affiché et
 *   par la sélection : impossible qu'ils divergent.
 */
export interface TierComponents {
  gameChanger: number;
  fastMana: number;
  tutor: number;
  interaction: number;
  extraTurn: number;
  massLandDenial: number;
  curve: number;
  combo: number;
  duelMeta: number;
}

/** Maximum atteignable par composante — pour l'UI (barres de progression, écart au max). */
export const TIER_COMPONENT_MAX: TierComponents = {
  gameChanger: 40,
  fastMana: 15,
  tutor: 10,
  interaction: 10,
  extraTurn: 10,
  massLandDenial: 10,
  curve: 5,
  combo: 12,
  duelMeta: 25,
};

/** Compteurs agrégés d'un deck, à partir desquels l'indice est calculé (voir TierComponents). */
export interface TierCounts {
  gameChangers: number;
  fastMana: number;
  tutor: number;
  /** removal + disruption (mêmes compteurs que DeckStats.categoryCounts). */
  interaction: number;
  extraTurns: number;
  massLandDenial: number;
  combos: number;
  duelMetaSum: number;
  nonLandCount: number;
  nonLandCmcSum: number;
}

export const EMPTY_TIER_COUNTS: TierCounts = {
  gameChangers: 0,
  fastMana: 0,
  tutor: 0,
  interaction: 0,
  extraTurns: 0,
  massLandDenial: 0,
  combos: 0,
  duelMetaSum: 0,
  nonLandCount: 0,
  nonLandCmcSum: 0,
};

/** Signaux de tier d'UNE carte (précalculables une fois par carte). */
export interface CardTierSignals {
  gameChanger: boolean;
  fastMana: boolean;
  extraTurn: boolean;
  massLandDenial: boolean;
  tutor: boolean;
  interaction: boolean;
  isLand: boolean;
  duelMeta: number;
}

export function cardTierSignals(card: ScryfallCard, categories: DeckCategory[] = classifyCard(card)): CardTierSignals {
  const text = getDisplayOracleText(card);
  return {
    gameChanger: card.game_changer === true,
    fastMana: categories.includes("ramp") && card.cmc <= 2,
    extraTurn: EXTRA_TURN_PATTERN.test(text),
    massLandDenial: MASS_LAND_DENIAL_PATTERNS.some((p) => p.test(text)),
    tutor: categories.includes("tutor"),
    interaction: categories.includes("removal") || categories.includes("disruption"),
    isLand: Boolean(card.type_line?.includes("Land")),
    duelMeta: duelMetaPresence(card.name),
  };
}

/**
 * La formule de l'indice, factorisée (25/09/2026) — mêmes poids que la
 * version du 24/09/2026 pour les 7 composantes historiques, plus deux
 * composantes nouvelles :
 * - `combo` : 8 points pour une combo connue complète, 12 pour deux ou
 *   plus. Les combos infinies à deux cartes sont LE marqueur des brackets
 *   hauts du système WotC (interdites en brackets 1-2, tolérées tard en 3,
 *   libres en 4-5) — un signal que la formule ignorait totalement.
 * - `duelMeta` (Duel Commander uniquement) : 1.5 point par unité de
 *   « présence en tournoi » cumulée, plafonné à 25. Calibré sur les
 *   données du repo : les 11 decks de tournoi Duel de
 *   src/data/duelcommander-decks.json cumulent 14 à 22.5 (2 exceptions à
 *   4.2 et 8.1), les 190 précons Commander papier 0.1 à 2.6 (médiane 1.3)
 *   — un deck de tournoi typique obtient donc le maximum, un précon ~2
 *   points. ⚠️ Ces 11 decks font probablement partie des 82 decks de
 *   l'échantillon (mêmes dates) : calibrage « dans l'échantillon », qui
 *   confirme l'échelle mais ne prouve pas la valeur prédictive.
 * Somme des maxima > 100 : l'indice final reste plafonné à 100.
 */
export function tierComponentsFromCounts(
  counts: TierCounts,
  config: CategoryConfig,
  formatKey?: FormatKey
): TierComponents {
  const avgCmc = counts.nonLandCount > 0 ? counts.nonLandCmcSum / counts.nonLandCount : 0;
  const interactionRatio = counts.interaction / Math.max(1, config.targets.removal + config.targets.disruption);
  return {
    gameChanger: counts.gameChangers === 0 ? 0 : Math.min(40, 10 + (counts.gameChangers - 1) * 6),
    fastMana: Math.min(15, counts.fastMana * 3),
    tutor: Math.min(10, (counts.tutor / Math.max(1, config.targets.tutor)) * 10),
    interaction: Math.min(10, interactionRatio * 10),
    // "A Time Warp or two is fine" (bracket 2 officiel) : faible pour 1-2
    // occurrences, saut au maximum à partir de 3.
    extraTurn: counts.extraTurns <= 2 ? counts.extraTurns * 1.5 : 10,
    // Binaire : WotC présente le mass land denial comme quasi absent sous
    // le bracket 4 et sans restriction au-delà — pas un signal graduel.
    massLandDenial: counts.massLandDenial > 0 ? 10 : 0,
    curve: counts.nonLandCount > 0 ? clamp(2.5 + (config.idealAvgCmc - avgCmc) * 2.5, 0, 5) : 0,
    combo: counts.combos === 0 ? 0 : counts.combos === 1 ? 8 : 12,
    duelMeta: formatKey === "duelcommander" ? Math.min(25, counts.duelMetaSum * 1.5) : 0,
  };
}

export function powerIndexFromComponents(c: TierComponents): number {
  const sum =
    c.gameChanger +
    c.fastMana +
    c.tutor +
    c.interaction +
    c.extraTurn +
    c.massLandDenial +
    c.curve +
    c.combo +
    c.duelMeta;
  return clamp(Math.round(sum * 10) / 10, 0, 100);
}

export type { ComboDef };

/** Cartes qui accordent un tour supplémentaire — signal dédié à ce module, volontairement PAS ajouté aux 9 piliers stables de deck-score.ts (ce n'est pas un rôle de deckbuilding au même sens que ramp/removal/etc., seulement un signal de puissance/vitesse). Formulation standard du templating Magic ("takes an extra turn"). */
const EXTRA_TURN_PATTERN = /takes? an extra turn/i;

/**
 * Destruction de terrains DE MASSE uniquement — délibérément étroit pour
 * ne pas confondre avec du removal de terrain ciblé et situationnel
 * (Wasteland, Strip Mine...), qui est un outil normal à tous les niveaux
 * de puissance et n'a rien à voir avec le "mass land denial" au sens où
 * WotC l'utilise (Armageddon-effects qui cassent la partie pour tout le
 * monde). Motifs : "destroy all lands", ou un sacrifice/destruction de
 * terrain qui vise explicitement chaque joueur/tous les joueurs.
 */
const MASS_LAND_DENIAL_PATTERNS = [
  /destroy all lands/i,
  /each player sacrifices? [^.]{0,40}lands?/i,
  /all players sacrifice[^.]{0,40}lands?/i,
  /each player'?s? lands? (?:are|is) destroyed/i,
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Score de puissance PAR CARTE (24/09/2026, 3e passage de la journée —
 * demande de Ben : "l'objectif principal du builder n'est pas d'avoir le
 * meilleur score de complétude mais le meilleur score de tier [...] je
 * veux que le builder créé des decks les plus puissants possibles").
 * Jusqu'ici, aucun module de sélection/suggestion de carte (
 * `collection-builder.ts`, `recommend.ts`) ne regardait les signaux de
 * puissance objective ci-dessus (`computeDeckTier`) — seulement les 9
 * piliers de `deck-score.ts`. Cette fonction factorise EN UN SEUL ENDROIT
 * les signaux qui pèsent le plus dans `computeDeckTier` (Game Changer :
 * 40/100 du poids total, mana rapide : 15/100) plus deux signaux rares
 * mais à fort impact qu'aucun des 9 piliers ne capture (tour
 * supplémentaire, destruction de terrains de masse — voir
 * `EXTRA_TURN_PATTERN`/`MASS_LAND_DENIAL_PATTERNS` ci-dessus), pour que
 * `collection-builder.ts` (sélection des cartes possédées) ET
 * `recommend.ts` (suggestions/Super Opti sur tous les types de deck du
 * site) appliquent la MÊME notion de "carte puissante" plutôt que
 * d'inventer chacun la leur.
 *
 * Volontairement un score PAR CARTE, additif et approximatif (pas un
 * recalcul de `computeDeckTier`, qui est un agrégat de DECK ENTIER,
 * beaucoup trop coûteux à recalculer à chaque carte candidate évaluée) :
 * un signal d'ordre de priorité pour la sélection/le tri, pas une
 * prédiction exacte de la contribution de cette carte au powerIndex
 * final. Removal/disruption (interactionScore) et tutor (tutorScore) ne
 * sont volontairement PAS dupliqués ici : ce sont déjà des piliers à part
 * entière dans `deck-score.ts`, déjà bien pris en compte par les moteurs
 * de sélection existants — le point de cette fonction est de représenter
 * les signaux de puissance MANQUANTS jusqu'ici, pas de tout réinventer.
 */
export function cardPowerScore(card: ScryfallCard): number {
  let score = 0;
  if (card.game_changer) score += 6;
  const text = getDisplayOracleText(card);
  const categories = classifyCard(card);
  if (categories.includes("ramp") && card.cmc <= 2) score += 3;
  if (EXTRA_TURN_PATTERN.test(text)) score += 4;
  if (MASS_LAND_DENIAL_PATTERNS.some((p) => p.test(text))) score += 4;
  return score;
}

function tierFromPowerIndex(powerIndex: number): { tier: PowerTierLevel; subTier: PowerSubTier } {
  const clamped = clamp(powerIndex, 0, 100);
  // 5 paliers de 20 points (0-19, 20-39, ..., 80-100) — bornes égales par
  // simplicité/transparence plutôt qu'une tentative de calage précis sur
  // les seuils WotC (la source elle-même dit que ce n'est pas purement
  // mécanique, voir la doc en tête de fichier).
  const tier = Math.min(5, Math.floor(clamped / 20) + 1) as PowerTierLevel;
  const bandStart = (tier - 1) * 20;
  const posInBand = clamped - bandStart;
  const subTier: PowerSubTier = posInBand < 20 / 3 ? "low" : posInBand < 40 / 3 ? "mid" : "top";
  return { tier, subTier };
}

const SUB_TIER_LABEL: Record<PowerSubTier, string> = { low: "Low", mid: "Mid", top: "Top" };

/**
 * Calcule le tier de puissance d'un deck — fonction pure, aucun appel
 * réseau, tous les signaux viennent de champs Scryfall déjà présents dans
 * l'app ou de sorties déjà calculées par le moteur existant (`stats`,
 * `classifyCard`). À n'appeler que pour un format à commandant
 * (`format.hasCommander`) : le système de Game Changers/brackets est une
 * notion Commander, elle ne s'applique pas aux formats constructed 60
 * cartes (Standard, Historic...) — voir l'appelant dans actions.ts.
 *
 * `cards` : mainboard hors commandant (mêmes `nonCommanderCards` que
 * `computeDeckStats`/`detectArchetypes` reçoivent déjà dans analyzeDeck).
 * `commanders` : le(s) commandant(s) (un Game Changer peut être un
 * commandant lui-même, ex. certains commandants signature d'un produit).
 */
export function computeDeckTier(
  cards: EnrichedCard[],
  commanders: ScryfallCard[],
  stats: DeckStats,
  config: CategoryConfig,
  formatKey?: FormatKey
): DeckTierResult {
  const counts: TierCounts = { ...EMPTY_TIER_COUNTS };
  counts.gameChangers = commanders.filter((c) => c.game_changer === true).length;

  for (const entry of cards) {
    if (!entry.card) continue;
    const sig = cardTierSignals(entry.card);
    if (sig.gameChanger) counts.gameChangers += entry.count;
    if (sig.fastMana) counts.fastMana += entry.count;
    if (sig.extraTurn) counts.extraTurns += entry.count;
    if (sig.massLandDenial) counts.massLandDenial += entry.count;
    // Une présence en tournoi compte une fois par NOM (pas par exemplaire).
    counts.duelMetaSum += sig.duelMeta;
  }

  // Tutors/interaction/courbe : repris de `stats` (computeDeckStats),
  // comme avant le 25/09/2026 — mêmes comptes que le tableau de bord.
  counts.tutor = stats.categoryCounts.tutor;
  counts.interaction = stats.categoryCounts.removal + stats.categoryCounts.disruption;
  counts.nonLandCount = stats.totalNonLandCards;
  counts.nonLandCmcSum = stats.avgCmc * stats.totalNonLandCards;

  const names = [
    ...commanders.map((c) => c.name),
    ...cards.filter((e) => e.card).map((e) => e.card!.name),
  ];
  const combos = findCompleteCombos(names);
  counts.combos = combos.length;

  const components = tierComponentsFromCounts(counts, config, formatKey);
  const powerIndex = powerIndexFromComponents(components);
  const interactionRatio = counts.interaction / Math.max(1, config.targets.removal + config.targets.disruption);
  const gameChangerCount = counts.gameChangers;
  const fastManaCount = counts.fastMana;
  const tutorCount = counts.tutor;
  const extraTurnCount = counts.extraTurns;
  const massLandDenialCount = counts.massLandDenial;

  const { tier, subTier } = tierFromPowerIndex(powerIndex);

  return {
    tier,
    subTier,
    label: `Tier ${tier} — ${SUB_TIER_LABEL[subTier]}`,
    powerIndex,
    signals: {
      gameChangerCount,
      fastManaCount,
      tutorCount,
      extraTurnCount,
      massLandDenialCount,
      avgCmc: stats.avgCmc,
      interactionRatio: Math.round(interactionRatio * 100) / 100,
      combos: combos.map((c) => ({ id: c.id, pieces: [...c.pieces], result: c.result, note: c.note })),
      duelMetaSum: Math.round(counts.duelMetaSum * 10) / 10,
    },
    components,
    caveat:
      "Indication inspirée du système officiel de Brackets Commander de Wizards of the Coast (5 paliers, encore en beta), " +
      "pas une application exacte de leurs règles : calculée uniquement à partir de motifs de texte et de champs Scryfall " +
      "(dont \"Game Changer\", le signal officiel dominant ici), d'une liste curatée de combos connues et, en Duel Commander, " +
      "de la présence des cartes dans un échantillon de decks de tournoi mtgtop8 (82 decks, septembre 2026). Une combo absente " +
      "de la liste, une pièce de stax/verrou ou un enchaînement de destruction de terrains restent invisibles. WotC le dit elle-même à propos de son propre " +
      "système : le tableau de cartes est un plancher, pas toute la réponse — l'intention du deck compte le plus. À prendre " +
      "comme un repère, pas un verdict.",
  };
}

import type { CategoryConfig, DeckStats, EnrichedCard, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";
import { classifyCard } from "./deck-score";

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
  };
  caveat: string;
}

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
  config: CategoryConfig
): DeckTierResult {
  let gameChangerCount = commanders.filter((c) => c.game_changer === true).length;
  let fastManaCount = 0;
  let extraTurnCount = 0;
  let massLandDenialCount = 0;

  for (const entry of cards) {
    if (!entry.card) continue;
    const { card } = entry;

    if (card.game_changer === true) gameChangerCount += entry.count;

    const categories = classifyCard(card);
    if (categories.includes("ramp") && card.cmc <= 2) fastManaCount += entry.count;

    const text = getDisplayOracleText(card);
    if (EXTRA_TURN_PATTERN.test(text)) extraTurnCount += entry.count;
    if (MASS_LAND_DENIAL_PATTERNS.some((p) => p.test(text))) massLandDenialCount += entry.count;
  }

  const tutorCount = stats.categoryCounts.tutor;
  const interactionRatio =
    (stats.categoryCounts.removal + stats.categoryCounts.disruption) /
    Math.max(1, config.targets.removal + config.targets.disruption);

  // Poids (somme = 100), voir la doc en tête de fichier pour la
  // justification de chacun par rapport aux critères officiels WotC
  // recherchés le 24/09/2026.
  const gameChangerScore = gameChangerCount === 0 ? 0 : Math.min(40, 10 + (gameChangerCount - 1) * 6);
  const fastManaScore = Math.min(15, fastManaCount * 3);
  const tutorScore = Math.min(10, (tutorCount / Math.max(1, config.targets.tutor)) * 10);
  const interactionScore = Math.min(10, interactionRatio * 10);
  // "A Time Warp or two is fine" (bracket 2 officiel) : faible pour 1-2
  // occurrences, saut au maximum à partir de 3 (l'enchaînement répété est
  // le vrai discriminant des brackets hauts, pas la simple présence).
  const extraTurnScore = extraTurnCount <= 2 ? extraTurnCount * 1.5 : 10;
  // Binaire : WotC présente le mass land denial comme quasi absent sous le
  // bracket 4 et sans restriction au-delà — pas un signal graduel.
  const mldScore = massLandDenialCount > 0 ? 10 : 0;
  const curveScore = clamp(2.5 + (config.idealAvgCmc - stats.avgCmc) * 2.5, 0, 5);

  const powerIndex =
    Math.round((gameChangerScore + fastManaScore + tutorScore + interactionScore + extraTurnScore + mldScore + curveScore) * 10) /
    10;

  const { tier, subTier } = tierFromPowerIndex(powerIndex);

  return {
    tier,
    subTier,
    label: `Tier ${tier} — ${SUB_TIER_LABEL[subTier]}`,
    powerIndex: clamp(powerIndex, 0, 100),
    signals: {
      gameChangerCount,
      fastManaCount,
      tutorCount,
      extraTurnCount,
      massLandDenialCount,
      avgCmc: stats.avgCmc,
      interactionRatio: Math.round(interactionRatio * 100) / 100,
    },
    caveat:
      "Indication inspirée du système officiel de Brackets Commander de Wizards of the Coast (5 paliers, encore en beta), " +
      "pas une application exacte de leurs règles : calculée uniquement à partir de motifs de texte et de champs Scryfall " +
      "(dont \"Game Changer\", le signal officiel dominant ici), sans capacité fiable de détecter une vraie ligne de combo, " +
      "une pièce de stax/verrou ou un enchaînement de destruction de terrains. WotC le dit elle-même à propos de son propre " +
      "système : le tableau de cartes est un plancher, pas toute la réponse — l'intention du deck compte le plus. À prendre " +
      "comme un repère, pas un verdict.",
  };
}

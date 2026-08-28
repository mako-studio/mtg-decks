import type { CategoryConfig, DeckCategory, FormatConfig, FormatKey } from "./types";

/**
 * Cibles/poids "façon Commander" : deck singleton d'environ 100 cartes
 * (99 + 1 commandant). Utilisé par commander (papier), brawl et
 * historicbrawl (Arena) — ces trois formats partagent la même philosophie
 * de deckbuilding (singleton, un commandant, ~10 ramp/removal/pioche).
 */
const COMMANDER_LIKE: CategoryConfig = {
  targets: {
    ramp: 10,
    removal: 10,
    wipe: 3,
    draw: 10,
    tutor: 3,
    protection: 5,
    landfix: 5,
    finisher: 6,
    disruption: 5,
  },
  // Poids rééquilibrés une 2e fois le 28/08/2026 pour faire de la place à
  // curveWeight/landWeight (16 points au total, voir CategoryConfig dans
  // types.ts) : les 9 poids ci-dessous (déjà rééquilibrés le 26/08/2026
  // pour "disruption") sont réduits d'environ 16% chacun, avec un
  // arrondi qui garde un total de 84 — même méthode que le
  // rééquilibrage précédent.
  weights: {
    ramp: 14,
    removal: 14,
    wipe: 6,
    draw: 14,
    tutor: 7,
    protection: 7,
    landfix: 7,
    finisher: 8,
    disruption: 7,
  },
  curveWeight: 8,
  landWeight: 8,
  // ≈2.9 : repère communautaire répandu pour un deck Commander "moteur
  // moyen" (ni aggro pur, ni contrôle/ramp pur) — voir le caveat sur
  // CategoryConfig.idealAvgCmc.
  idealAvgCmc: 2.9,
  // ≈37 terrains sur 99 cartes (hors commandant) — le repère le plus
  // couramment cité dans le deckbuilding Commander communautaire ; voir
  // le caveat sur CategoryConfig.idealLandRatio.
  idealLandRatio: 37 / 99,
};

/**
 * Cibles/poids pour un deck constructed 60 cartes classique (Standard,
 * Historic, Explorer, Alchemy, Timeless) : jusqu'à 4 exemplaires d'une
 * même carte, ramp/tutors moins centraux, removal/pioche/protection
 * pèsent davantage. Cibles indicatives inspirées des ratios habituels
 * du deckbuilding constructed, pas une donnée officielle.
 */
const CONSTRUCTED_60: CategoryConfig = {
  targets: {
    ramp: 4,
    removal: 8,
    wipe: 2,
    draw: 6,
    tutor: 2,
    protection: 4,
    landfix: 4,
    finisher: 4,
    disruption: 3,
  },
  // Même rééquilibrage du 28/08/2026 que COMMANDER_LIKE ci-dessus (voir
  // son commentaire) : removal reste le poste le plus lourd (cohérent
  // avec un format 60 cartes où l'interaction prime), total ramené à 84
  // pour laisser 16 points à curveWeight/landWeight.
  weights: {
    ramp: 8,
    removal: 16,
    wipe: 8,
    draw: 14,
    tutor: 4,
    protection: 11,
    landfix: 8,
    finisher: 8,
    disruption: 7,
  },
  curveWeight: 8,
  landWeight: 8,
  // ≈2.4 : un format 60 cartes vise en général une courbe plus basse
  // qu'en Commander (parties plus courtes, plus de pression directe) —
  // repère communautaire, pas une règle officielle.
  idealAvgCmc: 2.4,
  // ≈17 terrains sur 60 cartes — repère communautaire répandu pour un
  // deck 60 cartes classique (un peu en dessous du "40% de terrains"
  // parfois cité, plus proche de l'usage réel avec du fixing/ramp).
  idealLandRatio: 17 / 60,
};

export const FORMATS: Record<FormatKey, FormatConfig> = {
  commander: {
    key: "commander",
    label: "Commander (papier)",
    scryfallLegality: "commander",
    arenaOnly: false,
    singleton: true,
    hasCommander: true,
    deckSize: 99,
    maxCopies: 1,
    categories: COMMANDER_LIKE,
  },
  brawl: {
    key: "brawl",
    label: "Brawl (Arena)",
    scryfallLegality: "brawl",
    arenaOnly: true,
    singleton: true,
    hasCommander: true,
    deckSize: 59,
    maxCopies: 1,
    categories: COMMANDER_LIKE,
  },
  historicbrawl: {
    key: "historicbrawl",
    label: "Historic Brawl (Arena)",
    scryfallLegality: "historicbrawl",
    arenaOnly: true,
    singleton: true,
    hasCommander: true,
    deckSize: 99,
    maxCopies: 1,
    categories: COMMANDER_LIKE,
  },
  standard: {
    key: "standard",
    label: "Standard (Arena)",
    scryfallLegality: "standard",
    arenaOnly: true,
    singleton: false,
    hasCommander: false,
    deckSize: 60,
    maxCopies: 4,
    categories: CONSTRUCTED_60,
  },
  historic: {
    key: "historic",
    label: "Historic (Arena)",
    scryfallLegality: "historic",
    arenaOnly: true,
    singleton: false,
    hasCommander: false,
    deckSize: 60,
    maxCopies: 4,
    categories: CONSTRUCTED_60,
  },
  explorer: {
    key: "explorer",
    label: "Explorer (Arena)",
    scryfallLegality: "explorer",
    arenaOnly: true,
    singleton: false,
    hasCommander: false,
    deckSize: 60,
    maxCopies: 4,
    categories: CONSTRUCTED_60,
  },
  alchemy: {
    key: "alchemy",
    label: "Alchemy (Arena)",
    scryfallLegality: "alchemy",
    arenaOnly: true,
    singleton: false,
    hasCommander: false,
    deckSize: 60,
    maxCopies: 4,
    categories: CONSTRUCTED_60,
  },
  timeless: {
    key: "timeless",
    label: "Timeless (Arena)",
    scryfallLegality: "timeless",
    arenaOnly: true,
    singleton: false,
    hasCommander: false,
    deckSize: 60,
    maxCopies: 4,
    categories: CONSTRUCTED_60,
  },
};

export const ARENA_FORMATS: FormatKey[] = [
  "standard",
  "historic",
  "explorer",
  "alchemy",
  "timeless",
  "brawl",
  "historicbrawl",
];

export function isConstructedFormat(key: FormatKey): boolean {
  return !FORMATS[key].hasCommander;
}

export function getFormat(key: string): FormatConfig {
  const format = (FORMATS as Record<string, FormatConfig>)[key];
  return format ?? FORMATS.commander;
}

export const ALL_DECK_CATEGORIES: DeckCategory[] = [
  "ramp",
  "removal",
  "wipe",
  "draw",
  "tutor",
  "protection",
  "landfix",
  "finisher",
  "disruption",
];

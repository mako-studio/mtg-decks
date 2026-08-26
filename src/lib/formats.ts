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
  // Poids rééquilibrés pour ajouter "disruption" (9e pilier, 26/08/2026)
  // en gardant un total de 100 : les 8 poids précédents sont réduits
  // d'environ 8% chacun pour faire de la place à "disruption" (8).
  weights: {
    ramp: 17,
    removal: 17,
    wipe: 8,
    draw: 17,
    tutor: 8,
    protection: 8,
    landfix: 8,
    finisher: 9,
    disruption: 8,
  },
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
  // Poids rééquilibrés pour ajouter "disruption" (9e pilier, 26/08/2026)
  // en gardant un total de 100 (removal reste le poste le plus lourd,
  // cohérent avec un format 60 cartes où l'interaction prime).
  weights: {
    ramp: 9,
    removal: 19,
    wipe: 9,
    draw: 18,
    tutor: 5,
    protection: 14,
    landfix: 9,
    finisher: 9,
    disruption: 8,
  },
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

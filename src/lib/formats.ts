import type { CategoryConfig, DeckCategory, FormatConfig, FormatKey } from "./types";

/**
 * Cibles/poids "façon Commander" : deck singleton d'environ 100 cartes
 * (99 + 1 commandant). Utilisé par commander (papier), brawl et
 * historicbrawl (Arena) — ces trois formats partagent la même philosophie
 * de deckbuilding (singleton, un commandant, ~10 ramp/removal/pioche).
 */
const COMMANDER_LIKE: CategoryConfig = {
  targets: { ramp: 10, removal: 10, wipe: 3, draw: 10, tutor: 3, protection: 5, landfix: 5, finisher: 6 },
  // Poids rééquilibrés pour ajouter "finisher" en gardant un total de 100
  // (ramp/removal/draw restent le "gros 3" du moteur, à 18 plutôt que 20 ;
  // wipe/tutor/protection/landfix descendent de 10 à 9 ; finisher à 10).
  weights: { ramp: 18, removal: 18, wipe: 9, draw: 18, tutor: 9, protection: 9, landfix: 9, finisher: 10 },
};

/**
 * Cibles/poids pour un deck constructed 60 cartes classique (Standard,
 * Historic, Explorer, Alchemy, Timeless) : jusqu'à 4 exemplaires d'une
 * même carte, ramp/tutors moins centraux, removal/pioche/protection
 * pèsent davantage. Cibles indicatives inspirées des ratios habituels
 * du deckbuilding constructed, pas une donnée officielle.
 */
const CONSTRUCTED_60: CategoryConfig = {
  targets: { ramp: 4, removal: 8, wipe: 2, draw: 6, tutor: 2, protection: 4, landfix: 4, finisher: 4 },
  // Poids rééquilibrés pour ajouter "finisher" en gardant un total de 100
  // (removal/draw descendent de 25 à 20 pour faire de la place ; le reste
  // inchangé).
  weights: { ramp: 10, removal: 20, wipe: 10, draw: 20, tutor: 5, protection: 15, landfix: 10, finisher: 10 },
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
];

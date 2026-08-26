/**
 * Types partagés de l'application.
 */

/** Une carte telle que stockée dans un deck préconstruit (source: dataset GitHub taw). */
export interface PreconCardRef {
  name: string;
  count: number;
}

/** Un deck Commander préconstruit officiel. */
export interface PreconDeck {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  releaseDate: string;
  commanders: string[];
  cardCount: number;
  cards: PreconCardRef[];
  source: string | null;
}

/**
 * Sous-ensemble des champs Scryfall utilisés par l'app.
 * Référence complète : https://scryfall.com/docs/api/cards
 */
export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: ScryfallImageUris;
  /** Nom/texte/type imprimés sur CETTE impression si elle n'est pas en anglais. */
  printed_name?: string;
  printed_text?: string;
  printed_type_line?: string;
}

export interface ScryfallImageUris {
  small: string;
  normal: string;
  large: string;
  png: string;
  art_crop: string;
  border_crop: string;
}

export interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  legalities: Record<string, "legal" | "not_legal" | "restricted" | "banned">;
  /** Jeux dans lesquels cette impression existe : "paper" | "mtgo" | "arena" | ... */
  games: string[];
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    eur?: string | null;
  };
  scryfall_uri: string;
  layout: string;
  rarity: string;
  set: string;
  set_name: string;
  collector_number: string;
  /** Code langue de CETTE impression (ex: "en", "fr") — https://scryfall.com/docs/api/languages */
  lang?: string;
  /** Nom/texte/type imprimés sur CETTE impression si elle n'est pas en anglais. */
  printed_name?: string;
  printed_text?: string;
  printed_type_line?: string;
}

/** Carte enrichie utilisée dans l'UI : la ref du deck + les données Scryfall (si trouvées). */
export interface EnrichedCard {
  name: string;
  count: number;
  isCommander: boolean;
  card: ScryfallCard | null;
}

/** Catégories heuristiques utilisées pour scorer un deck Commander. */
export type DeckCategory =
  | "ramp"
  | "removal"
  | "wipe"
  | "draw"
  | "tutor"
  | "protection"
  | "landfix";

export interface DeckStats {
  totalNonLandCards: number;
  landCount: number;
  avgCmc: number;
  categoryCounts: Record<DeckCategory, number>;
  score: number; // 0-100
}

/**
 * Carte du deck actuel proposée comme candidate au retrait, pour former un
 * "swap" avec une suggestion d'ajout. Heuristique interne (voir
 * `pickSwapCandidate` dans recommend.ts) : pas une garantie que c'est LA
 * meilleure carte à retirer, juste une proposition raisonnable et
 * explicable (catégorie déjà bien couverte, ou carte sans rôle identifié).
 */
export interface SwapCandidate {
  name: string;
  reason: string;
}

export interface CardSuggestion {
  card: ScryfallCard;
  reason: string;
  categories: DeckCategory[];
  impact: number; // contribution estimée au score, arbitraire mais comparable
  /** Carte du deck actuel qu'on pourrait retirer pour faire de la place. `null` si aucune candidate trouvée. */
  swapOut?: SwapCandidate | null;
}

/**
 * Formats pris en charge. "commander" est le format papier existant.
 * Les autres sont des formats MTG Arena — voir src/lib/formats.ts.
 * Clés vérifiées contre le type officiel `ScryfallFormat`
 * (package @scryfall/api-types).
 */
export type FormatKey =
  | "commander"
  | "brawl"
  | "historicbrawl"
  | "standard"
  | "historic"
  | "explorer"
  | "alchemy"
  | "timeless";

export interface CategoryConfig {
  targets: Record<DeckCategory, number>;
  weights: Record<DeckCategory, number>;
}

export interface FormatConfig {
  key: FormatKey;
  label: string;
  /** Clé de légalité Scryfall (card.legalities[scryfallLegality] / "f:<scryfallLegality>"). */
  scryfallLegality: string;
  /** Si true, les recherches/enrichissements sont filtrés à game:arena. */
  arenaOnly: boolean;
  singleton: boolean;
  hasCommander: boolean;
  /** Nombre de cartes visé (hors commandant pour les formats singleton). */
  deckSize: number;
  /** Nombre d'exemplaires maximum d'une même carte (hors terrains de base). */
  maxCopies: number;
  categories: CategoryConfig;
}

/** Une carte telle que représentée dans un import/export au format texte MTG Arena. */
export interface ArenaCardLine {
  name: string;
  amount: number;
  set?: string;
  collector?: number;
}

export interface ParsedArenaDeck {
  valid: boolean;
  deck: ArenaCardLine[];
  sideboard: ArenaCardLine[];
  commander: ArenaCardLine | null;
  companion: ArenaCardLine | null;
}

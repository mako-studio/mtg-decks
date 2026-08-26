"use server";

import type { CardSuggestion, DeckStats, EnrichedCard, FormatKey, PreconDeck } from "./types";
import { parseArenaDeck, serializeArenaDeck } from "./arena-format";
import { arenaImportToPreconDeck } from "./arena-import";
import { loadEnrichedDeck } from "./deck-loader";
import { suggestImprovements } from "./recommend";
import { getFormat } from "./formats";
import {
  getDisplayLocalizedName,
  getDisplayLocalizedText,
  getDisplayLocalizedTypeLine,
  getDisplayOracleText,
  getLocalizedPrint,
} from "./scryfall";

export interface DeckAnalysisResult {
  ok: boolean;
  error: string | null;
  formatKey: FormatKey;
  deckName: string;
  commanderEntries: EnrichedCard[];
  cards: EnrichedCard[];
  currentStats: DeckStats | null;
  projectedStats: DeckStats | null;
  improvementPct: number;
  suggestions: CardSuggestion[];
  exportText: string;
}

function emptyResult(formatKey: FormatKey, deckName: string, error: string): DeckAnalysisResult {
  return {
    ok: false,
    error,
    formatKey,
    deckName,
    commanderEntries: [],
    cards: [],
    currentStats: null,
    projectedStats: null,
    improvementPct: 0,
    suggestions: [],
    exportText: "",
  };
}

/**
 * Server Action centrale : résout un deck (commandant + cartes) auprès de
 * Scryfall, calcule score/suggestions pour le format donné, et prépare
 * l'export texte Arena si pertinent. Réutilisée par :
 * - le rendu initial des pages deck (précon papier, galerie Arena) ;
 * - l'import d'un deck Arena collé (après parsing du texte) ;
 * - chaque ajout/retrait de carte dans le simulateur (DeckBuilder), pour
 *   recalculer le deck "en direct" avec la nouvelle liste de cartes.
 */
export async function analyzeDeck(input: {
  formatKey: string;
  deckName: string;
  /** Un ou plusieurs commandants (partenaires) — vide pour un deck sans commandant. */
  commanders: string[];
  cards: { name: string; count: number }[];
}): Promise<DeckAnalysisResult> {
  const format = getFormat(input.formatKey);
  const deck: PreconDeck = {
    id: "session",
    name: input.deckName,
    setCode: "",
    setName: "",
    releaseDate: "",
    commanders: input.commanders,
    cardCount: input.cards.reduce((sum, c) => sum + c.count, 0) + input.commanders.length,
    cards: input.cards,
    source: null,
  };

  try {
    const { commanderCards, cards, colorIdentity } = await loadEnrichedDeck(deck, format);
    const nonCommanderCards = cards.filter((c) => !c.isCommander);
    const commanderEntries = cards.filter((c) => c.isCommander);

    const { currentStats, projectedStats, improvementPct, suggestions } =
      await suggestImprovements(nonCommanderCards, colorIdentity, format, 10);

    const exportText = format.arenaOnly
      ? serializeArenaDeck({
          commander:
            commanderCards[0] && commanderEntries[0]
              ? { card: commanderCards[0], count: commanderEntries[0].count }
              : null,
          deck: nonCommanderCards
            .filter((c) => c.card)
            .map((c) => ({ card: c.card!, count: c.count })),
        })
      : "";

    return {
      ok: true,
      error: null,
      formatKey: format.key,
      deckName: input.deckName,
      commanderEntries,
      cards: nonCommanderCards,
      currentStats,
      projectedStats,
      improvementPct,
      suggestions,
      exportText,
    };
  } catch {
    return emptyResult(
      format.key,
      input.deckName,
      "Erreur pendant l'analyse (service Scryfall indisponible ?). Réessaie dans quelques instants."
    );
  }
}

/**
 * Server Action liée au formulaire d'import (voir ArenaImportForm.tsx) :
 * parse le texte collé puis délègue à `analyzeDeck`.
 */
export async function analyzeArenaImport(
  prevState: DeckAnalysisResult,
  formData: FormData
): Promise<DeckAnalysisResult> {
  const text = String(formData.get("decklist") ?? "");
  const formatKey = String(formData.get("format") ?? "historic") as FormatKey;

  const parsed = parseArenaDeck(text);
  if (!parsed.valid) {
    return emptyResult(
      formatKey,
      prevState.deckName || "Deck importé",
      "Impossible de lire ce texte comme un deck. Colle l'export tel quel depuis le bouton \"Export\" du client MTG Arena (menu du deck)."
    );
  }

  const deck = arenaImportToPreconDeck(parsed, "Deck importé");
  return analyzeDeck({
    formatKey,
    deckName: deck.name,
    commanders: deck.commanders,
    cards: deck.cards,
  });
}

export interface LocalizedText {
  name: string;
  typeLine: string;
  text: string;
}

/**
 * Server Action : cherche l'impression française d'une carte pour la
 * bascule FR/EN (voir LanguageProvider.tsx + getLocalizedPrint dans
 * scryfall.ts). Retourne `null` si aucune impression FR n'existe — un
 * cas normal (beaucoup de cartes n'ont pas été traduites), pas une erreur.
 */
export async function fetchLocalizedText(cardName: string): Promise<LocalizedText | null> {
  const localized = await getLocalizedPrint(cardName, "fr");
  if (!localized) return null;
  const text = getDisplayLocalizedText(localized);
  const typeLine = getDisplayLocalizedTypeLine(localized);
  // Si l'impression FR trouvée n'a en fait pas de texte imprimé localisé
  // (carte vierge de texte, ou champ absent malgré lang=fr), pas la peine
  // de la traiter comme une traduction utilisable.
  if (!text && !typeLine) return null;
  return {
    name: getDisplayLocalizedName(localized),
    typeLine: typeLine || localized.type_line,
    text: text || getDisplayOracleText(localized),
  };
}

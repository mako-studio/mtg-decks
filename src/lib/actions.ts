"use server";

import type { CardSuggestion, DeckStats, EnrichedCard } from "./types";
import { parseArenaDeck, serializeArenaDeck } from "./arena-format";
import { arenaImportToPreconDeck } from "./arena-import";
import { loadEnrichedDeck } from "./deck-loader";
import { suggestImprovements } from "./recommend";
import { getFormat } from "./formats";

export interface ArenaAnalysisResult {
  ok: boolean;
  error: string | null;
  deckName: string;
  commanderEntries: EnrichedCard[];
  cards: EnrichedCard[];
  currentStats: DeckStats | null;
  projectedStats: DeckStats | null;
  improvementPct: number;
  suggestions: CardSuggestion[];
  exportText: string;
}

const EMPTY_RESULT: ArenaAnalysisResult = {
  ok: false,
  error: null,
  deckName: "",
  commanderEntries: [],
  cards: [],
  currentStats: null,
  projectedStats: null,
  improvementPct: 0,
  suggestions: [],
  exportText: "",
};

/**
 * Server Action : parse un texte au format d'import Arena, résout les
 * cartes via Scryfall et calcule score + suggestions pour le format
 * choisi. Conçue pour `useActionState` (voir ArenaImportForm.tsx).
 */
export async function analyzeArenaImport(
  _prevState: ArenaAnalysisResult,
  formData: FormData
): Promise<ArenaAnalysisResult> {
  const text = String(formData.get("decklist") ?? "");
  const formatKey = String(formData.get("format") ?? "historic");
  const format = getFormat(formatKey);

  const parsed = parseArenaDeck(text);
  if (!parsed.valid) {
    return {
      ...EMPTY_RESULT,
      error:
        "Impossible de lire ce texte comme un deck. Colle l'export tel quel depuis le bouton \"Export\" du client MTG Arena (menu du deck).",
    };
  }

  const deck = arenaImportToPreconDeck(parsed, "Deck importé");

  try {
    const { commanderCards, cards, colorIdentity } = await loadEnrichedDeck(deck, format);
    const nonCommanderCards = cards.filter((c) => !c.isCommander);
    const commanderEntries = cards.filter((c) => c.isCommander);

    const { currentStats, projectedStats, improvementPct, suggestions } =
      await suggestImprovements(nonCommanderCards, colorIdentity, format, 10);

    const exportText = serializeArenaDeck({
      commander:
        commanderCards[0] && commanderEntries[0]
          ? { card: commanderCards[0], count: commanderEntries[0].count }
          : null,
      deck: nonCommanderCards.filter((c) => c.card).map((c) => ({ card: c.card!, count: c.count })),
    });

    return {
      ok: true,
      error: null,
      deckName: deck.name,
      commanderEntries,
      cards: nonCommanderCards,
      currentStats,
      projectedStats,
      improvementPct,
      suggestions,
      exportText,
    };
  } catch {
    return {
      ...EMPTY_RESULT,
      error:
        "Erreur pendant l'analyse (service Scryfall indisponible ?). Réessaie dans quelques instants.",
    };
  }
}

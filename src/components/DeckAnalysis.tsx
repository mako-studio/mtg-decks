import type { FormatConfig, PreconDeck } from "@/lib/types";
import { loadEnrichedDeck } from "@/lib/deck-loader";
import { suggestImprovements } from "@/lib/recommend";
import { serializeArenaDeck } from "@/lib/arena-format";
import { CardTile } from "@/components/CardTile";
import { SuggestionCard } from "@/components/SuggestionCard";
import { ImprovementGauge } from "@/components/ImprovementGauge";
import { ArenaExportButton } from "@/components/ArenaExportButton";

/**
 * Charge un deck (précon ou importé), calcule son score et ses
 * suggestions pour le format donné, et affiche le tout. Partagé entre la
 * page deck Commander papier et les pages Arena (galerie + import).
 */
export async function DeckAnalysis({
  deck,
  format,
  showArenaExport = false,
}: {
  deck: PreconDeck;
  format: FormatConfig;
  showArenaExport?: boolean;
}) {
  const { commanderCards, cards, colorIdentity } = await loadEnrichedDeck(deck, format);
  const nonCommanderCards = cards.filter((c) => !c.isCommander);
  const commanderEntries = cards.filter((c) => c.isCommander);

  const { currentStats, projectedStats, improvementPct, suggestions } =
    await suggestImprovements(nonCommanderCards, colorIdentity, format, 10);

  const sortedCards = [...nonCommanderCards].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const exportText = showArenaExport
    ? serializeArenaDeck({
        commander:
          commanderCards[0] && commanderEntries[0]
            ? { card: commanderCards[0], count: commanderEntries[0].count }
            : null,
        deck: nonCommanderCards
          .filter((c) => c.card)
          .map((c) => ({ card: c.card!, count: c.count })),
      })
    : null;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        {commanderEntries.length > 0 && (
          <>
            <h2 className="mb-3 text-sm font-medium text-muted">
              Commandant{commanderEntries.length > 1 ? "s" : ""}
            </h2>
            <div className="mb-6 space-y-2">
              {commanderEntries.map((entry) => (
                <CardTile key={entry.name} entry={entry} />
              ))}
            </div>
          </>
        )}

        <h2 className="mb-3 text-sm font-medium text-muted">Deck ({deck.cardCount} cartes)</h2>
        <div className="space-y-2">
          {sortedCards.map((entry, i) => (
            <CardTile key={`${entry.name}-${i}`} entry={entry} />
          ))}
        </div>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <ImprovementGauge
          currentScore={currentStats.score}
          projectedScore={projectedStats.score}
          improvementPct={improvementPct}
        />

        {showArenaExport && exportText && <ArenaExportButton text={exportText} />}

        <div>
          <h2 className="mb-3 text-sm font-medium text-muted">
            Cartes suggérées ({suggestions.length})
          </h2>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted">
              Aucune suggestion trouvée (ou service Scryfall indisponible pour la recherche).
            </p>
          ) : (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <SuggestionCard key={s.card.id} suggestion={s} />
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

import type { FormatConfig, PreconDeck } from "@/lib/types";
import { analyzeDeck } from "@/lib/actions";
import { DeckBuilder } from "@/components/DeckBuilder";

/**
 * Point d'entrée serveur pour une page deck (précon papier ou galerie
 * Arena) : lance l'analyse initiale via `analyzeDeck`, puis délègue tout
 * le reste (affichage, ajout/retrait de suggestions, export) au
 * simulateur interactif `DeckBuilder` (client).
 */
export async function DeckAnalysis({
  deck,
  format,
  deckSlug,
}: {
  deck: PreconDeck;
  format: FormatConfig;
  deckSlug: string;
}) {
  const result = await analyzeDeck({
    formatKey: format.key,
    deckName: deck.name,
    commanders: deck.commanders,
    cards: deck.cards,
  });

  if (!result.ok) {
    return (
      <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
        {result.error ?? "Erreur pendant l'analyse du deck."}
      </p>
    );
  }

  return <DeckBuilder initial={result} deckSlug={deckSlug} />;
}

import { notFound } from "next/navigation";
import { getPreconDeckById } from "@/lib/precon-decks";
import { FORMATS } from "@/lib/formats";
import { DeckAnalysis } from "@/components/DeckAnalysis";

// Rendu à la demande (pas de generateStaticParams) : avec 190 decks et
// plusieurs appels Scryfall par deck (cartes + recherches de suggestions),
// tout précalculer au build serait lent et fragile (dépendrait de la
// disponibilité de l'API Scryfall pendant le build). Le cache `fetch`
// (24h, voir lib/scryfall.ts) rend les visites suivantes rapides.
export default async function DeckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deck = getPreconDeckById(id);
  if (!deck) notFound();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {deck.setName} · {deck.releaseDate}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{deck.name}</h1>
        <p className="mt-1 text-sm text-foreground/80">
          Commandant{deck.commanders.length > 1 ? "s" : ""} : {deck.commanders.join(" / ")}
        </p>
        {deck.source && (
          <a
            href={deck.source}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs text-muted underline hover:text-foreground"
          >
            Decklist officielle
          </a>
        )}
      </div>

      <DeckAnalysis deck={deck} format={FORMATS.commander} deckSlug={deck.id} />
    </div>
  );
}

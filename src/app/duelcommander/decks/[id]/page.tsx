import { notFound } from "next/navigation";
import { getDuelCommanderDeckById } from "@/lib/duelcommander-decks";
import { FORMATS } from "@/lib/formats";
import { DeckAnalysis } from "@/components/DeckAnalysis";

// Même choix que /decks/[id] (rendu à la demande, pas de
// generateStaticParams) : peu de decks ici (11), mais même raison de fond
// — le cache fetch 24h de scryfall.ts rend les visites suivantes rapides
// sans dépendre de la disponibilité de Scryfall au moment du build.
export default async function DuelCommanderDeckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deck = getDuelCommanderDeckById(id);
  if (!deck) notFound();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {deck.setName} · {deck.releaseDate} · deck de tournoi réel
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
            Decklist d&apos;origine (mtgtop8)
          </a>
        )}
      </div>

      <DeckAnalysis deck={deck} format={FORMATS.duelcommander} deckSlug={`duelcommander-${deck.id}`} />
    </div>
  );
}

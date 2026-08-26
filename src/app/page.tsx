import { getAllPreconDecks } from "@/lib/precon-decks";
import { DeckBrowser } from "@/components/DeckBrowser";

export default function Home() {
  const decks = getAllPreconDecks();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Decks Commander préconstruits</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Choisissez un deck préconstruit officiel comme point de départ, puis laissez-nous
          suggérer les cartes qui l&apos;amélioreraient — avec le texte, le coût de mana et un
          score de puissance avant/après.
        </p>
      </div>
      <DeckBrowser decks={decks} />
    </div>
  );
}

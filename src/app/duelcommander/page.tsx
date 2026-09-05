import { getAllDuelCommanderDecks } from "@/lib/duelcommander-decks";
import { DeckBrowser } from "@/components/DeckBrowser";

export default function DuelCommanderPage() {
  const decks = getAllDuelCommanderDecks();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Duel Commander (1v1)</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Duel Commander n&apos;a pas de decks préconstruits officiels : partez d&apos;un vrai
          deck de tournoi récent (top classements, scrapés sur{" "}
          <a
            href="https://www.mtgtop8.com/format?f=EDH"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            mtgtop8.com
          </a>
          ) comme point de départ, puis laissez-nous suggérer les cartes qui l&apos;amélioreraient
          — avec un scoring adapté au 1v1 (vie 20, banlist Duel Commander via Scryfall).
        </p>
        <p className="mt-2 max-w-2xl text-xs text-muted">
          Snapshot de {decks.length} decks (tournois du 01 au 03/09/2026) assemblé manuellement —
          pas de précons pour ce format, voir la note dans le code source pour la méthode et ses
          limites.
        </p>
      </div>

      <DeckBrowser decks={decks} linkBase="/duelcommander/decks" />
    </div>
  );
}

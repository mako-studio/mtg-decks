import Link from "next/link";
import { getBrawlPreconDecks, getArenaStarterDecks } from "@/lib/arena-decks";
import { DeckCard } from "@/components/DeckCard";
import { ArenaImportForm } from "@/components/ArenaImportForm";
import type { FormatKey } from "@/lib/types";

const CONSTRUCTED_FORMATS: { key: FormatKey; label: string }[] = [
  { key: "historic", label: "Historic" },
  { key: "standard", label: "Standard" },
  { key: "explorer", label: "Explorer" },
  { key: "alchemy", label: "Alchemy" },
  { key: "timeless", label: "Timeless" },
];

const BRAWL_FORMATS: { key: FormatKey; label: string }[] = [
  { key: "historicbrawl", label: "Historic Brawl" },
  { key: "brawl", label: "Brawl" },
];

function FormatPills({
  options,
  current,
  paramName,
}: {
  options: { key: FormatKey; label: string }[];
  current: FormatKey;
  paramName: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {options.map((opt) => (
        <Link
          key={opt.key}
          href={`/arena?${paramName}=${opt.key}`}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            opt.key === current
              ? "border-accent bg-accent-soft text-accent"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}

export default async function ArenaPage({
  searchParams,
}: {
  searchParams: Promise<{ constructedFormat?: string; brawlFormat?: string }>;
}) {
  const sp = await searchParams;
  const constructedFormat = CONSTRUCTED_FORMATS.some((f) => f.key === sp.constructedFormat)
    ? (sp.constructedFormat as FormatKey)
    : "historic";
  const brawlFormat = BRAWL_FORMATS.some((f) => f.key === sp.brawlFormat)
    ? (sp.brawlFormat as FormatKey)
    : "historicbrawl";

  const brawlDecks = getBrawlPreconDecks();
  const starterDecks = getArenaStarterDecks();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">MTG Arena</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Importe un deck depuis le client Arena, ou pars d&apos;un deck d&apos;exemple
          ci-dessous, pour voir les cartes qui l&apos;amélioreraient dans le format de ton choix.
        </p>
      </div>

      <div className="mb-10">
        <ArenaImportForm />
      </div>

      <section className="mb-12">
        <h2 className="mb-1 text-lg font-medium">Brawl / Historic Brawl</h2>
        <p className="mb-4 text-xs text-muted">
          Seuls decks Brawl officiels jamais commercialisés (Throne of Eldraine, 2019) — leur
          légalité actuelle sur Arena est vérifiée à la volée, pas garantie par avance.
        </p>
        <FormatPills options={BRAWL_FORMATS} current={brawlFormat} paramName="brawlFormat" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brawlDecks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              href={`/arena/decks/${deck.id}?format=${brawlFormat}`}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium">Decks de démarrage Arena</h2>
        <p className="mb-4 text-xs text-muted">
          Decks de démarrage officiels (2018-2020, ~40 cartes) — un bon point de départ à
          compléter jusqu&apos;à 60 cartes plutôt que des decks compétitifs déjà optimisés.
        </p>
        <FormatPills
          options={CONSTRUCTED_FORMATS}
          current={constructedFormat}
          paramName="constructedFormat"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {starterDecks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              href={`/arena/decks/${deck.id}?format=${constructedFormat}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

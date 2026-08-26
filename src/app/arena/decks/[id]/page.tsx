import Link from "next/link";
import { notFound } from "next/navigation";
import { getArenaDeckById } from "@/lib/arena-decks";
import { FORMATS } from "@/lib/formats";
import { DeckAnalysis } from "@/components/DeckAnalysis";
import type { FormatKey } from "@/lib/types";

const BRAWL_KEYS: FormatKey[] = ["historicbrawl", "brawl"];
const CONSTRUCTED_KEYS: FormatKey[] = ["historic", "standard", "explorer", "alchemy", "timeless"];

export default async function ArenaDeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const { id } = await params;
  const { format: formatParam } = await searchParams;
  const deck = getArenaDeckById(id);
  if (!deck) notFound();

  const isBrawlKind = deck.commanders.length > 0;
  const allowedFormats = isBrawlKind ? BRAWL_KEYS : CONSTRUCTED_KEYS;
  const formatKey = allowedFormats.includes(formatParam as FormatKey)
    ? (formatParam as FormatKey)
    : allowedFormats[0];
  const format = FORMATS[formatKey];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {deck.setName} · {deck.releaseDate} · produit papier réutilisé comme base
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{deck.name}</h1>
        {deck.commanders.length > 0 && (
          <p className="mt-1 text-sm text-foreground/80">
            Commandant{deck.commanders.length > 1 ? "s" : ""} : {deck.commanders.join(" / ")}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {allowedFormats.map((key) => (
            <Link
              key={key}
              href={`/arena/decks/${deck.id}?format=${key}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                key === formatKey
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {FORMATS[key].label}
            </Link>
          ))}
        </div>
        {deck.source && (
          <a
            href={deck.source}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-muted underline hover:text-foreground"
          >
            Decklist officielle d&apos;origine
          </a>
        )}
      </div>

      <DeckAnalysis deck={deck} format={format} deckSlug={`${deck.id}-${formatKey}`} />
    </div>
  );
}

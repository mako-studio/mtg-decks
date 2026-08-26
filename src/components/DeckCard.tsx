import Link from "next/link";
import type { PreconDeck } from "@/lib/types";

export function DeckCard({ deck, href }: { deck: PreconDeck; href?: string }) {
  return (
    <Link
      href={href ?? `/decks/${deck.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug group-hover:text-accent">{deck.name}</h3>
        <span className="shrink-0 text-xs text-muted">{deck.releaseDate?.slice(0, 4)}</span>
      </div>
      <p className="text-xs text-muted">{deck.setName}</p>
      <div className="mt-auto flex items-center justify-between pt-2">
        <p className="truncate text-sm text-foreground/80">
          {deck.commanders.join(" / ") || "—"}
        </p>
      </div>
    </Link>
  );
}

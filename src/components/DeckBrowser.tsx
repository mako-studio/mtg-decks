"use client";

import { useMemo, useState } from "react";
import type { PreconDeck } from "@/lib/types";
import { DeckCard } from "./DeckCard";

export function DeckBrowser({ decks }: { decks: PreconDeck[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return decks;
    return decks.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.setName.toLowerCase().includes(q) ||
        d.commanders.some((c) => c.toLowerCase().includes(q))
    );
  }, [decks, query]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un deck, une extension ou un commandant…"
        className="mb-6 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
      <p className="mb-4 text-xs text-muted">
        {filtered.length} deck{filtered.length > 1 ? "s" : ""}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((deck) => (
          <DeckCard key={deck.id} deck={deck} />
        ))}
      </div>
    </div>
  );
}

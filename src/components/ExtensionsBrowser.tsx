"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TrackedSetSummary } from "@/lib/sets";
import { setTypeLabel } from "@/lib/sets";
import { normalizeSearch, formatFrenchDate } from "@/lib/text";

type SortMode = "recent" | "alpha";

/** Grille recherchable/triable des extensions suivies par le site — voir /extensions. */
export function ExtensionsBrowser({ sets }: { sets: TrackedSetSummary[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");

  const filtered = useMemo(() => {
    const q = normalizeSearch(query.trim());
    const list = q
      ? sets.filter(
          (s) => normalizeSearch(s.name).includes(q) || normalizeSearch(s.code).includes(q)
        )
      : sets;
    const sorted = [...list];
    if (sort === "recent") {
      sorted.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [sets, query, sort]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une extension ou un code (ex: cmr, dsc…)…"
          className="w-full flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <div className="inline-flex shrink-0 rounded-full border border-border p-0.5 text-xs">
          {([
            ["recent", "Plus récent"],
            ["alpha", "Nom (A→Z)"],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSort(mode)}
              className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                sort === mode ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
              }`}
              aria-pressed={sort === mode}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-muted">
        {filtered.length} extension{filtered.length > 1 ? "s" : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
          Aucune extension ne correspond à cette recherche.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((set) => (
            <Link
              key={set.code}
              href={`/extensions/${set.code}`}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3.5 transition-colors hover:border-accent"
            >
              {set.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={set.iconUrl}
                  alt=""
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 dark:invert"
                />
              ) : (
                <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-surface-muted" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="truncate text-sm font-medium">{set.name}</h3>
                  <span className="shrink-0 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                    {set.code}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {setTypeLabel(set.setType)} · {formatFrenchDate(set.releaseDate)}
                </p>
                {set.cardCount !== null && (
                  <p className="mt-0.5 text-[11px] text-muted">{set.cardCount} cartes</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

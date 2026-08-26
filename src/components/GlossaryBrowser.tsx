"use client";

import { useMemo, useState } from "react";
import type { GlossaryCategory, GlossaryTerm } from "@/lib/types";
import { GLOSSARY_CATEGORY_LABELS, GLOSSARY_CATEGORY_ORDER } from "@/data/glossary";
import { normalizeSearch, slugify } from "@/lib/text";

/**
 * Glossaire MTG (FR/EN) recherchable, filtrable par catégorie — voir
 * src/data/glossary.ts pour le contenu et sa méthodologie de sourcing.
 * `initialQuery` permet un lien direct depuis la section Extensions
 * (mot-clé d'une carte -> recherche pré-remplie ici), voir SetDetail.tsx.
 */
export function GlossaryBrowser({
  terms,
  initialQuery = "",
}: {
  terms: GlossaryTerm[];
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<GlossaryCategory | "all">("all");

  const filtered = useMemo(() => {
    const q = normalizeSearch(query.trim());
    return terms.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return (
        normalizeSearch(t.termFr).includes(q) ||
        normalizeSearch(t.termEn).includes(q) ||
        normalizeSearch(t.definitionFr).includes(q)
      );
    });
  }, [terms, query, category]);

  const grouped = useMemo(() => {
    const map = new Map<GlossaryCategory, GlossaryTerm[]>();
    for (const cat of GLOSSARY_CATEGORY_ORDER) map.set(cat, []);
    for (const t of filtered) map.get(t.category)?.push(t);
    return map;
  }, [filtered]);

  const visibleCategories = GLOSSARY_CATEGORY_ORDER.filter((cat) => (grouped.get(cat)?.length ?? 0) > 0);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un terme (français ou anglais)…"
        className="mb-4 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            category === "all"
              ? "border-accent bg-accent-soft text-accent"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          Tous
        </button>
        {GLOSSARY_CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              category === cat
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {GLOSSARY_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <p className="mb-4 text-xs text-muted">
        {filtered.length} terme{filtered.length > 1 ? "s" : ""}
      </p>

      {filtered.length === 0 && (
        <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
          Aucun terme ne correspond à cette recherche.
        </p>
      )}

      {visibleCategories.map((cat) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            {GLOSSARY_CATEGORY_LABELS[cat]}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.get(cat)!.map((term) => (
              <TermCard key={term.termEn} term={term} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TermCard({ term }: { term: GlossaryTerm }) {
  return (
    <div
      id={slugify(term.termEn)}
      className="scroll-mt-24 rounded-lg border border-border bg-surface p-3.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{term.termFr}</h3>
        <span className="shrink-0 text-[11px] text-muted">EN : {term.termEn}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{term.definitionFr}</p>
      <p className={`mt-2 text-[10px] ${term.confidence === "low" ? "text-warning" : "text-muted"}`}>
        {term.confidence === "low" ? "⚠ Traduction non officielle — " : "Source : "}
        {term.sourceNote}
      </p>
    </div>
  );
}

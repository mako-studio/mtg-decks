"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SetCardEntry, SetMechanic } from "@/lib/sets";
import { getDisplayImageUrl, getDisplayManaCost } from "@/lib/scryfall";
import { normalizeSearch } from "@/lib/text";
import { CardImageHover } from "./CardImageHover";
import { ManaCost } from "./ManaCost";

/**
 * Checklist interactive d'un set : mécaniques cliquables (filtrent la
 * liste ci-dessous, même pattern que le filtre par pilier du deck
 * builder — voir PillarCoverage.tsx) + recherche de carte (FR/EN) +
 * zoom au survol (CardImageHover, déjà utilisé partout ailleurs sur le
 * site). Demande de Ben du 26/08/2026.
 */
export function SetDetail({ mechanics, cards }: { mechanics: SetMechanic[]; cards: SetCardEntry[] }) {
  const [query, setQuery] = useState("");
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query.trim());
    return cards.filter(({ card, frName }) => {
      if (selectedKeyword && !(card.keywords ?? []).includes(selectedKeyword)) return false;
      if (!q) return true;
      return (
        normalizeSearch(card.name).includes(q) ||
        (frName ? normalizeSearch(frName).includes(q) : false) ||
        normalizeSearch(card.type_line ?? "").includes(q)
      );
    });
  }, [cards, query, selectedKeyword]);

  const selectedMechanic = mechanics.find((m) => m.keyword === selectedKeyword) ?? null;

  return (
    <div>
      {mechanics.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold">Mécaniques présentes dans ce set</h2>
          <p className="mb-3 text-xs text-muted">
            Mots-clés officiels détectés parmi les cartes de ce set (pas nécessairement introduits
            par lui — certains existaient déjà dans un set antérieur). Clique un mot-clé pour
            filtrer la liste de cartes ci-dessous.
          </p>
          <div className="flex flex-wrap gap-2">
            {mechanics.map((m) => {
              const isSelected = m.keyword === selectedKeyword;
              return (
                <button
                  key={m.keyword}
                  type="button"
                  onClick={() => setSelectedKeyword((prev) => (prev === m.keyword ? null : m.keyword))}
                  aria-pressed={isSelected}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {m.glossary ? m.glossary.termFr : m.keyword}
                  <span className="ml-1 text-[10px] opacity-70">×{m.cardCount}</span>
                </button>
              );
            })}
          </div>
          {selectedMechanic && (
            <p className="mt-2.5 rounded-lg border border-border bg-surface-muted p-3 text-xs text-foreground/80">
              {selectedMechanic.glossary ? (
                <>
                  {selectedMechanic.glossary.definitionFr}{" "}
                  <Link
                    href={`/glossaire?q=${encodeURIComponent(selectedMechanic.keyword)}`}
                    className="font-medium text-accent underline"
                  >
                    Voir au glossaire →
                  </Link>
                </>
              ) : (
                <>« {selectedMechanic.keyword} » n&apos;est pas encore dans le glossaire.</>
              )}
            </p>
          )}
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une carte (français ou anglais)…"
          className="w-full max-w-md flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <p className="shrink-0 text-xs text-muted">
          {filtered.length} / {cards.length} carte{cards.length > 1 ? "s" : ""}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
          Aucune carte ne correspond à cette recherche.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ card, frName }) => {
            const imgSmall = getDisplayImageUrl(card, "small");
            return (
              <div
                key={card.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface p-2.5"
              >
                {imgSmall && (
                  <CardImageHover
                    src={imgSmall}
                    zoomSrc={getDisplayImageUrl(card, "large")}
                    alt={card.name}
                    width={48}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{card.name}</span>
                    <ManaCost cost={getDisplayManaCost(card)} />
                  </div>
                  {frName && frName !== card.name && (
                    <p className="truncate text-xs italic text-muted">{frName}</p>
                  )}
                  <p className="mt-0.5 truncate text-[11px] text-muted">{card.type_line}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

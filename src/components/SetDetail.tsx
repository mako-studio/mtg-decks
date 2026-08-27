"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SetCardEntry, SetMechanic } from "@/lib/sets";
import type { SetNote } from "@/lib/types";
import { getDisplayImageUrl, getDisplayManaCost } from "@/lib/scryfall";
import { normalizeSearch } from "@/lib/text";
import { CardImageHover } from "./CardImageHover";
import { ManaCost } from "./ManaCost";

/**
 * Checklist interactive d'un set : contexte + mécaniques réellement
 * introduites (recherché, voir `note`/SetNote) en tête de page, puis les
 * mots-clés PRÉSENTS dans les cartes (`mechanics`, auto-dérivé de
 * Scryfall — voir computeMechanics dans sets.ts) comme outil de filtre
 * secondaire, cliquables pour filtrer la liste ci-dessous (même pattern
 * que le filtre par pilier du deck builder — voir PillarCoverage.tsx) +
 * recherche de carte (FR/EN) + zoom au survol (CardImageHover, déjà
 * utilisé partout ailleurs sur le site). Demande de Ben du 26/08/2026,
 * précisée le 27/08/2026 ("détail sur l'extension avec notamment les
 * mécaniques introduites... expliquées").
 */
export function SetDetail({
  mechanics,
  cards,
  note,
}: {
  mechanics: SetMechanic[];
  cards: SetCardEntry[];
  note: SetNote | null;
}) {
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
      {note && <SetNoteSection note={note} />}

      {mechanics.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold">Mots-clés présents dans les cartes</h2>
          <p className="mb-3 text-xs text-muted">
            Détectés automatiquement parmi les cartes de ce set (pas nécessairement introduits par
            lui — certains existaient déjà dans un set antérieur ; voir ci-dessus pour les
            mécaniques vraiment introduites par ce set précis). Clique un mot-clé pour filtrer la
            liste de cartes ci-dessous.
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

/**
 * Section "détail sur l'extension" (demande de Ben du 27/08/2026) :
 * contexte deckbuilding + mécaniques réellement introduites par CE set
 * précis (pas juste présentes dans ses cartes — voir la note sur
 * `mechanics` ci-dessus), avec sourcing et transparence sur le niveau de
 * confiance, même pattern que TermCard dans GlossaryBrowser.tsx
 * (`confidence: "low"` → ⚠ affiché plutôt que masqué).
 */
function SetNoteSection({ note }: { note: SetNote }) {
  const hasMechanics = note.mechanicsIntroduced.length > 0;
  const isLowConfidence = note.confidence === "low";

  return (
    <section className="mb-8 rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold">À propos de cette extension</h2>
      <p className="text-sm leading-relaxed text-foreground/80">{note.context}</p>

      <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        Mécaniques introduites par ce set
      </h3>
      {hasMechanics ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {note.mechanicsIntroduced.map((m) => (
            <div key={m.termEn} className="rounded-lg border border-border bg-surface-muted p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold">{m.termFr}</h4>
                <span className="shrink-0 text-[11px] text-muted">EN : {m.termEn}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{m.definitionFr}</p>
              <p className="mt-2 text-[10px] text-muted">Source : {m.sourceNote}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">
          Ce set n&apos;introduit aucune nouvelle mécanique — il s&apos;appuie sur des mécaniques déjà
          existantes (souvent celui d&apos;un set principal associé).
        </p>
      )}

      <p className={`mt-4 text-[10px] ${isLowConfidence ? "text-warning" : "text-muted"}`}>
        {isLowConfidence ? "⚠ Recherche incertaine sur ce point — " : "Sources : "}
        {note.sourceNotes.join(" · ")}
      </p>
    </section>
  );
}

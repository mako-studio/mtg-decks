"use client";

import { useState } from "react";
import type { CardSuggestion } from "@/lib/types";
import { getDisplayImageUrl, getDisplayManaCost, getDisplayOracleText } from "@/lib/scryfall";
import { ManaCost } from "./ManaCost";

const CATEGORY_LABELS: Record<string, string> = {
  ramp: "Rampe",
  removal: "Removal",
  wipe: "Board wipe",
  draw: "Pioche",
  tutor: "Tutor",
  protection: "Protection",
  landfix: "Fixing",
};

export function SuggestionCard({ suggestion }: { suggestion: CardSuggestion }) {
  const [open, setOpen] = useState(false);
  const { card } = suggestion;
  const img = getDisplayImageUrl(card, "small");

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-3 py-3 text-left"
      >
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={card.name} width={56} className="h-auto rounded shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{card.name}</span>
            <ManaCost cost={getDisplayManaCost(card)} />
          </div>
          <p className="mt-1 text-xs text-muted">{suggestion.reason}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {suggestion.categories.map((cat) => (
              <span
                key={cat}
                className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent"
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </span>
            ))}
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {card.type_line}
          </p>
          <p className="mt-1 whitespace-pre-line text-foreground/90">
            {getDisplayOracleText(card) || "—"}
          </p>
        </div>
      )}
    </div>
  );
}

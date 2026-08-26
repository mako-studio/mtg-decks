"use client";

import { useState } from "react";
import type { EnrichedCard } from "@/lib/types";
import { getDisplayImageUrl, getDisplayManaCost, getDisplayOracleText } from "@/lib/scryfall";
import { ManaCost } from "./ManaCost";

export function CardTile({ entry }: { entry: EnrichedCard }) {
  const [open, setOpen] = useState(false);
  const card = entry.card;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!card}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm disabled:cursor-default"
      >
        <span className="w-5 shrink-0 text-right text-muted tabular-nums">{entry.count}×</span>
        <span className="flex-1 truncate font-medium">
          {entry.name}
          {entry.isCommander && (
            <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Commandant
            </span>
          )}
        </span>
        {card ? (
          <ManaCost cost={getDisplayManaCost(card)} />
        ) : (
          <span className="text-xs text-muted italic">non trouvée</span>
        )}
      </button>

      {open && card && (
        <div className="flex gap-4 border-t border-border px-3 py-3">
          {getDisplayImageUrl(card, "small") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getDisplayImageUrl(card, "small") ?? undefined}
              alt={card.name}
              width={110}
              className="h-auto rounded-md shrink-0"
            />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {card.type_line}
            </p>
            <p className="mt-1 whitespace-pre-line text-foreground/90">
              {getDisplayOracleText(card) || "—"}
            </p>
            {(card.power || card.toughness) && (
              <p className="mt-2 text-xs text-muted">
                Force/Endurance : {card.power}/{card.toughness}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

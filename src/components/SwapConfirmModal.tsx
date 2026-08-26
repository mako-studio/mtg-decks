"use client";

import type { CardSuggestion } from "@/lib/types";

/**
 * Popup de confirmation affichée quand on clique "⇄ Swap" sur une
 * suggestion qui a une carte candidate au retrait (`suggestion.swapOut`).
 * Deux issues possibles plutôt qu'un simple oui/non : confirmer le swap
 * tout de suite (ajoute + retire en un seul recalcul), ou ajouter sans
 * retirer mais taguer la carte candidate "à retirer" pour y revenir plus
 * tard depuis la liste du deck.
 */
export function SwapConfirmModal({
  suggestion,
  onConfirmSwap,
  onTagOnly,
  onCancel,
}: {
  suggestion: CardSuggestion;
  onConfirmSwap: () => void;
  onTagOnly: () => void;
  onCancel: () => void;
}) {
  const swapOut = suggestion.swapOut;
  if (!swapOut) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="swap-modal-title"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="swap-modal-title" className="text-sm font-semibold">
          Suggestion de swap
        </h3>
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-success">
            <span aria-hidden="true">+</span>
            <span className="font-medium">{suggestion.card.name}</span>
          </p>
          <p className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-warning">
            <span aria-hidden="true">−</span>
            <span className="font-medium">{swapOut.name}</span>
          </p>
        </div>
        <p className="mt-3 text-xs text-muted">{swapOut.reason}</p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirmSwap}
            className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
          >
            Confirmer le swap
          </button>
          <button
            type="button"
            onClick={onTagOnly}
            className="w-full rounded-lg border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
          >
            Ajouter seulement, marquer « {swapOut.name} » à retirer
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

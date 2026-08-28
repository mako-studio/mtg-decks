"use client";

import type { EnrichedCard } from "@/lib/types";
import { getDisplayImageUrl, getDisplayManaCost } from "@/lib/scryfall";
import { ManaCost } from "./ManaCost";
import { CardImageHover } from "./CardImageHover";

/**
 * Liste des cartes retirées (dernier exemplaire) ou swappées pendant la
 * session en cours, affichée sous la liste du deck (28/08/2026, demande de
 * Ben) : un pense-bête pour remettre facilement une carte dans le deck sans
 * avoir à la rechercher à nouveau via "Tester une carte" — utile en
 * particulier après plusieurs swaps d'affilée, où se souvenir de tout ce
 * qui est sorti du deck devient vite pénible.
 *
 * Ne suit que les retraits COMPLETS (dernier exemplaire d'une carte quitte
 * le deck), pas les décréments partiels d'une carte présente en plusieurs
 * exemplaires (elle reste dans le deck, rien à "remettre") — voir
 * `willFullyRemove` dans DeckBuilder.tsx. Une carte remise dans le deck
 * (bouton ci-dessous, ou restaurée automatiquement quand on annule un swap
 * en retirant la carte ajoutée) disparaît de cette liste.
 *
 * Masqué entièrement tant qu'aucune carte n'a quitté le deck — pas la peine
 * d'occuper de l'espace pour une liste vide.
 */
export function RemovedCardsList({
  entries,
  onRestore,
  onClearAll,
  restoreDisabled = false,
}: {
  /** Plus récemment retirée en premier (voir DeckBuilder.tsx). */
  entries: EnrichedCard[];
  /** Remet la carte `name` dans le deck (1 exemplaire) et la retire de cette liste. */
  onRestore: (name: string) => void;
  /** Vide la liste sans rien remettre dans le deck (juste un pense-bête, pas un historique à garder indéfiniment). */
  onClearAll: () => void;
  restoreDisabled?: boolean;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="mt-8 border-t border-border pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted">
          Retirées pendant cette session ({entries.length})
        </h2>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-medium text-muted underline hover:text-foreground"
        >
          Tout effacer
        </button>
      </div>
      <div className="space-y-2">
        {entries.map((entry) => {
          const img = entry.card ? getDisplayImageUrl(entry.card, "small") : null;
          return (
            <div
              key={entry.name}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted/60 p-2.5"
            >
              {img ? (
                <CardImageHover
                  src={img}
                  zoomSrc={entry.card ? getDisplayImageUrl(entry.card, "large") : null}
                  alt={entry.name}
                  width={40}
                />
              ) : (
                <span className="h-[56px] w-10 shrink-0 rounded bg-surface" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground/80">{entry.name}</span>
                  {entry.card && <ManaCost cost={getDisplayManaCost(entry.card)} />}
                </div>
                <p className="truncate text-xs text-muted">{entry.card?.type_line ?? "Carte non résolue"}</p>
              </div>
              <button
                type="button"
                onClick={() => onRestore(entry.name)}
                disabled={restoreDisabled}
                className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
              >
                ↺ Remettre dans le deck
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

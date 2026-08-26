"use client";

import { useState } from "react";
import type { CardSuggestion, EnrichedCard } from "@/lib/types";
import { SuggestionCard } from "./SuggestionCard";
import { AddCardSearch } from "./AddCardSearch";

type Tab = "suggestions" | "test";

/**
 * Panneau "Améliorer ce deck", regroupant en un seul endroit à onglets ce
 * qui était auparavant deux zones déconnectées de la page (suggestions
 * automatiques en bas de colonne latérale, "Tester une carte" en haut de
 * la colonne principale) alors qu'elles répondent à la même question :
 * quelle carte ajouter, et pourquoi. Voir refonte UX du 26/08/2026.
 */
export function ImproveDeckPanel({
  suggestions,
  onAddClick,
  addDisabled,
  pending,
  openSuggestionId,
  onToggleSuggestion,
  formatKey,
  formatLabel,
  maxCopies,
  hasCommander,
  colorIdentity,
  currentCards,
  existingCounts,
}: {
  suggestions: CardSuggestion[];
  onAddClick: (s: CardSuggestion) => void;
  addDisabled: boolean;
  pending: boolean;
  openSuggestionId: string | null;
  onToggleSuggestion: (id: string) => void;
  formatKey: string;
  formatLabel: string;
  maxCopies: number;
  hasCommander: boolean;
  /** Identité de couleur du deck (commandant·s) — ignorée si `hasCommander` est faux. */
  colorIdentity: string[];
  /** Cartes actuelles du deck (hors commandant), pour évaluer la compatibilité de la carte cherchée. */
  currentCards: EnrichedCard[];
  /** Nombre d'exemplaires déjà dans le deck, par nom en minuscule. */
  existingCounts: Map<string, number>;
}) {
  const [tab, setTab] = useState<Tab>("suggestions");

  return (
    // Pas d'`overflow-hidden` ici : la liste d'autocomplétion de "Tester une
    // carte" (AddCardSearch) est positionnée en `absolute` sous le champ de
    // recherche et doit pouvoir dépasser la hauteur du panneau — un
    // `overflow-hidden` sur ce conteneur la coupait au ras du bord (bug
    // remonté par Ben le 26/08/2026).
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setTab("suggestions")}
          className={`flex-1 border-b-2 py-2.5 text-center text-xs font-semibold transition-colors ${
            tab === "suggestions"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Suggestions automatiques
        </button>
        <button
          type="button"
          onClick={() => setTab("test")}
          className={`flex-1 border-b-2 py-2.5 text-center text-xs font-semibold transition-colors ${
            tab === "test"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Tester une carte
        </button>
      </div>

      <div className="p-4">
        {tab === "suggestions" ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted">
                {suggestions.length} suggestion{suggestions.length > 1 ? "s" : ""}
              </h2>
              {pending && <span className="text-xs text-muted">Recalcul…</span>}
            </div>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted">
                Aucune suggestion trouvée (ou service Scryfall indisponible pour la recherche).
              </p>
            ) : (
              <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {suggestions.map((s) => (
                  <SuggestionCard
                    key={s.card.id}
                    suggestion={s}
                    onAddClick={() => onAddClick(s)}
                    addDisabled={addDisabled}
                    expanded={openSuggestionId === s.card.id}
                    onToggle={() => onToggleSuggestion(s.card.id)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <AddCardSearch
            formatKey={formatKey}
            formatLabel={formatLabel}
            maxCopies={maxCopies}
            hasCommander={hasCommander}
            colorIdentity={colorIdentity}
            currentCards={currentCards}
            existingCounts={existingCounts}
            onAddClick={onAddClick}
            addDisabled={addDisabled}
          />
        )}
      </div>
    </div>
  );
}

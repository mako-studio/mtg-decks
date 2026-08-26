"use client";

import type { DeckCategory, EnrichedCard } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/deck-score";
import { PillarCoverage } from "./PillarCoverage";

/**
 * Tableau de bord du deck builder : score (actuel → avec les cartes
 * suggérées) et couverture des 9 piliers, en tête de page plutôt qu'en bas
 * de la colonne latérale (voir refonte UX du 26/08/2026 — remplace
 * l'ancien ImprovementGauge, qui n'affichait que le score et obligeait à
 * scroller jusqu'en bas de la sidebar pour voir la couverture des piliers,
 * elle-même seulement disponible carte par carte via "Tester une carte").
 *
 * Cliquer sur un pilier (demande de Ben du 26/08/2026) affiche la liste
 * des cartes du deck qui matchent ce pilier juste en dessous, et filtre la
 * liste principale du deck (gérée par le parent, DeckBuilder) sur la même
 * catégorie.
 */
export function DeckDashboard({
  currentScore,
  projectedScore,
  improvementPct,
  categoryCounts,
  targets,
  selectedCategory,
  onSelectCategory,
  matchingCards,
}: {
  currentScore: number;
  projectedScore: number;
  improvementPct: number;
  categoryCounts: Record<DeckCategory, number>;
  targets: Record<DeckCategory, number>;
  selectedCategory: DeckCategory | null;
  onSelectCategory: (cat: DeckCategory) => void;
  /** Cartes du deck correspondant au pilier sélectionné — vide si aucun pilier sélectionné. */
  matchingCards: EnrichedCard[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-2xl font-semibold tracking-tight">{currentScore}</span>
          <span className="text-muted">→</span>
          <span className="text-2xl font-semibold tracking-tight text-accent">{projectedScore}</span>
          {improvementPct !== 0 && (
            <span
              className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                improvementPct > 0 ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
              }`}
            >
              {improvementPct > 0 ? "+" : ""}
              {improvementPct}%
            </span>
          )}
        </div>
        <p className="max-w-sm text-right text-xs text-muted">
          Score heuristique interne (0-100) basé sur la présence de rampe, removal, pioche, board
          wipes, tutors, protection, fixing de mana, finishers et disruption — pas une donnée
          EDHREC officielle. À droite : le score projeté si les cartes suggérées ci-dessous
          étaient ajoutées.
        </p>
      </div>

      <PillarCoverage
        categoryCounts={categoryCounts}
        targets={targets}
        selected={selectedCategory}
        onSelect={onSelectCategory}
      />

      {selectedCategory && (
        <div className="mt-4 rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-foreground">
              {CATEGORY_LABELS[selectedCategory]} — {matchingCards.length} carte
              {matchingCards.length > 1 ? "s" : ""} dans le deck
            </h3>
            <button
              type="button"
              onClick={() => onSelectCategory(selectedCategory)}
              className="shrink-0 text-xs font-medium text-muted underline hover:text-foreground"
            >
              ✕ Effacer le filtre
            </button>
          </div>
          {matchingCards.length === 0 ? (
            <p className="mt-2 text-xs text-muted">Aucune carte du deck ne correspond à ce pilier.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {matchingCards.map((entry) => (
                <span
                  key={entry.name}
                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium"
                >
                  {entry.count > 1 ? `${entry.count}× ` : ""}
                  {entry.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

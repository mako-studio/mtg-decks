import type { DeckCategory } from "@/lib/types";
import { PillarCoverage } from "./PillarCoverage";

/**
 * Tableau de bord du deck builder : score (actuel → avec les cartes
 * suggérées) et couverture des 9 piliers, en tête de page plutôt qu'en bas
 * de la colonne latérale (voir refonte UX du 26/08/2026 — remplace
 * l'ancien ImprovementGauge, qui n'affichait que le score et obligeait à
 * scroller jusqu'en bas de la sidebar pour voir la couverture des piliers,
 * elle-même seulement disponible carte par carte via "Tester une carte").
 */
export function DeckDashboard({
  currentScore,
  projectedScore,
  improvementPct,
  categoryCounts,
  targets,
}: {
  currentScore: number;
  projectedScore: number;
  improvementPct: number;
  categoryCounts: Record<DeckCategory, number>;
  targets: Record<DeckCategory, number>;
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

      <PillarCoverage categoryCounts={categoryCounts} targets={targets} />
    </div>
  );
}

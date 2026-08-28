"use client";

import type { ArchetypeSignal, DeckCategory, EnrichedCard, HealthSignal, ManaCurveBucket } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/deck-score";
import { PillarCoverage } from "./PillarCoverage";
import { ManaCurveChart } from "./ManaCurveChart";

const HEALTH_TEXT_CLASS: Record<HealthSignal["status"], string> = {
  good: "text-success",
  watch: "text-warning",
  off: "text-warning",
};

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
 *
 * Extension du 28/08/2026 : badges d'archétype détecté (voir
 * archetype.ts) juste sous le score — contexte utile pour comprendre les
 * suggestions ci-dessous avant même de voir la liste — puis, après les 9
 * piliers, une section "Courbe de mana & terrains" (ManaCurveChart +
 * signaux de santé courbe/terrains, voir HealthSignal dans types.ts) :
 * ces deux données étaient déjà calculées (avgCmc/landCount) mais
 * n'étaient affichées nulle part et n'entraient pas dans le score (voir
 * deck-score.ts).
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
  archetypes,
  manaCurve,
  avgCmc,
  totalNonLandCards,
  curveHealth,
  landHealth,
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
  archetypes: ArchetypeSignal[];
  manaCurve: ManaCurveBucket[];
  avgCmc: number;
  totalNonLandCards: number;
  curveHealth: HealthSignal;
  landHealth: HealthSignal;
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
          wipes, tutors, protection, fixing de mana, finishers, disruption, et la santé de la
          courbe de mana/du nombre de terrains — pas une donnée EDHREC officielle. À droite : le
          score projeté si les cartes suggérées ci-dessous étaient ajoutées.
        </p>
      </div>

      {archetypes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">Archétype détecté :</span>
          {archetypes.map((a) => (
            <span
              key={a.archetype}
              title={
                a.confidence === "high"
                  ? "Signal fort (confirmé par le commandant ou une large part du deck)"
                  : "Signal modéré — détecté d'après la composition du deck"
              }
              className="rounded-full bg-synergy-soft px-2.5 py-1 text-[11px] font-medium text-synergy"
            >
              ✦ {a.label}
              {a.confidence === "medium" ? " ?" : ""}
            </span>
          ))}
        </div>
      )}

      <PillarCoverage
        categoryCounts={categoryCounts}
        targets={targets}
        selected={selectedCategory}
        onSelect={onSelectCategory}
      />

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Courbe de mana &amp; terrains
          </h3>
          <span className="text-[11px] text-muted">
            Coût moyen {avgCmc} · {totalNonLandCards} carte{totalNonLandCards > 1 ? "s" : ""} hors
            terrains
          </span>
        </div>

        <div className="mt-3">
          <ManaCurveChart buckets={manaCurve} />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <p className={`text-[11px] ${HEALTH_TEXT_CLASS[curveHealth.status]}`}>{curveHealth.message}</p>
          <p className={`text-[11px] ${HEALTH_TEXT_CLASS[landHealth.status]}`}>{landHealth.message}</p>
        </div>
      </div>

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

import type { DeckCategory } from "@/lib/types";
import { ALL_DECK_CATEGORIES } from "@/lib/formats";
import { CATEGORY_LABELS } from "@/lib/deck-score";

/**
 * Sous ce ratio (compte / cible), un pilier est "signalé" (ambre) plutôt que
 * simplement "sous la cible" (neutre) : distingue un léger manque d'un vrai
 * trou dans le deck. Seuil choisi pour rester lisible en un coup d'œil, pas
 * une donnée scientifique — ajustable si l'usage réel montre trop/pas assez
 * de piliers signalés.
 */
const FLAG_THRESHOLD = 0.6;

type PillarStatus = "met" | "flagged" | "neutral";

function pillarStatus(count: number, target: number): PillarStatus {
  if (target <= 0) return "neutral";
  const ratio = count / target;
  if (ratio >= 1) return "met";
  if (ratio < FLAG_THRESHOLD) return "flagged";
  return "neutral";
}

const STATUS_STYLES: Record<
  PillarStatus,
  { card: string; count: string; track: string; fill: string }
> = {
  met: {
    card: "border-success-soft bg-success-soft",
    count: "text-success",
    track: "bg-success/20",
    fill: "bg-success",
  },
  flagged: {
    card: "border-warning-soft bg-warning-soft",
    count: "text-warning",
    track: "bg-warning/20",
    fill: "bg-warning",
  },
  neutral: {
    card: "border-border bg-surface",
    count: "text-muted",
    track: "bg-surface-muted",
    fill: "bg-muted/60",
  },
};

/**
 * Couverture des 9 piliers de deckbuilding (compte actuel / cible du
 * format), affichée en tête du deck builder plutôt qu'enterrée en bas de
 * la colonne latérale (voir refonte UX du 26/08/2026) : une grille de 9
 * cartes sur desktop, un bandeau compact défilable horizontalement sur
 * mobile — mêmes données, deux présentations.
 */
export function PillarCoverage({
  categoryCounts,
  targets,
}: {
  categoryCounts: Record<DeckCategory, number>;
  targets: Record<DeckCategory, number>;
}) {
  const pillars = ALL_DECK_CATEGORIES.map((cat) => {
    const count = categoryCounts[cat] ?? 0;
    const target = targets[cat] ?? 0;
    const status = pillarStatus(count, target);
    const pct = target > 0 ? Math.min((count / target) * 100, 100) : 0;
    return { cat, count, target, status, pct };
  });

  return (
    <>
      {/* Desktop : grille de 9 cartes avec mini barre de progression. */}
      <div className="mt-4 hidden gap-2 lg:grid lg:grid-cols-9">
        {pillars.map(({ cat, count, target, status, pct }) => {
          const s = STATUS_STYLES[status];
          return (
            <div key={cat} className={`rounded-lg border px-2.5 py-2 ${s.card}`}>
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[11px] font-medium">{CATEGORY_LABELS[cat]}</span>
                <span className={`text-[10px] ${s.count}`}>
                  {count}/{target}
                  {status === "met" ? " ✓" : ""}
                </span>
              </div>
              <div className={`mt-1.5 h-1 overflow-hidden rounded-full ${s.track}`}>
                <div className={`h-full rounded-full ${s.fill}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile/tablette : bandeau compact, défilement horizontal. */}
      <div className="relative mt-4 lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {pillars.map(({ cat, count, target, status }) => {
            const s = STATUS_STYLES[status];
            return (
              <span
                key={cat}
                className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium ${s.card} ${s.count}`}
              >
                {CATEGORY_LABELS[cat]} {count}/{target}
                {status === "met" ? " ✓" : ""}
              </span>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-surface" />
      </div>
    </>
  );
}

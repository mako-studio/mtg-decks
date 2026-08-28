"use client";

import type { ManaCurveBucket } from "@/lib/types";

/** Hauteur utile des barres en pixels (hors labels au-dessus/en-dessous) — calcul en JS plutôt qu'en % CSS pour ne pas dépendre d'un ancêtre à hauteur explicite. */
const CHART_HEIGHT = 88;
/** Hauteur minimale d'une barre non nulle, pour rester visible même avec un très petit compte face à un pic élevé ailleurs. */
const MIN_BAR_HEIGHT = 4;

/**
 * Histogramme de la courbe de mana (nombre de cartes hors terrains par
 * coût de mana converti, 0 à "7 et plus") — demande de Ben du 28/08/2026.
 * Une seule teinte (accent du site) : une seule série, la couleur ne
 * porte ici aucune identité à distinguer (voir le skill dataviz — une
 * palette catégorielle n'a de sens que pour plusieurs séries). Chaque
 * barre affiche son compte directement au-dessus plutôt que de forcer
 * une lecture au pixel près de la hauteur — les tranches sont peu
 * nombreuses (8), l'affichage direct reste lisible.
 *
 * Données déjà calculées par computeManaCurve (deck-score.ts), une seule
 * fois, en même temps que le reste des stats du deck — ce composant ne
 * fait que les afficher.
 */
export function ManaCurveChart({ buckets }: { buckets: ManaCurveBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const summary = buckets
    .map((b) => `${b.count} carte${b.count > 1 ? "s" : ""} à ${b.label} mana`)
    .join(", ");

  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={`Courbe de mana : ${summary}`}>
      {buckets.map((b) => {
        const barHeight = b.count > 0 ? Math.max(MIN_BAR_HEIGHT, (b.count / max) * CHART_HEIGHT) : 0;
        return (
          <div
            key={b.cmc}
            className="flex flex-1 flex-col items-center justify-end"
            style={{ height: CHART_HEIGHT + 18 }}
          >
            <span className="mb-1 text-[10px] font-medium tabular-nums text-muted">
              {b.count > 0 ? b.count : ""}
            </span>
            <div
              title={`${b.count} carte${b.count > 1 ? "s" : ""} à ${b.label} mana`}
              className="w-full rounded-t bg-accent transition-opacity hover:opacity-80"
              style={{ height: barHeight }}
            />
            <span className="mt-1 text-[10px] text-muted">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

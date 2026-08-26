export function ImprovementGauge({
  currentScore,
  projectedScore,
  improvementPct,
}: {
  currentScore: number;
  projectedScore: number;
  improvementPct: number;
}) {
  const max = 100;
  const currentPct = Math.min((currentScore / max) * 100, 100);
  const projectedPct = Math.min((projectedScore / max) * 100, 100);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-muted">Score de puissance structurelle</h3>
        <span className="text-2xl font-semibold text-success">
          {improvementPct > 0 ? "+" : ""}
          {improvementPct}%
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Deck actuel</span>
            <span>{currentScore} / 100</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-muted/60"
              style={{ width: `${currentPct}%` }}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Avec les cartes suggérées</span>
            <span>{projectedScore} / 100</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${projectedPct}%` }}
            />
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Score heuristique interne (0-100) basé sur la présence de rampe, removal, pioche,
        board wipes, tutors, protection et fixing de mana — pas une donnée EDHREC officielle
        (voir le README pour le détail de cette limite). En Commander (singleton, 100 cartes),
        ajouter ces cartes suppose de couper des cartes équivalentes ailleurs dans le deck.
      </p>
    </div>
  );
}

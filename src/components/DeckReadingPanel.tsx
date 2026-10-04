import type { DeckAudit } from "@/lib/deck-audit";

/**
 * « Lecture du deck » (04/10/2026, demandes de Ben : cohérence et homogénéité
 * du deck ; justification des cartes contre-intuitives sur la page de deck).
 * Résume ce que deck-audit.ts a lu : la ligne directrice, trois indices, et
 * les cartes qui appellent un commentaire — d'abord celles à revoir, puis
 * les choix qui surprennent mais se justifient. Le détail carte par carte
 * est dans la liste elle-même (une phrase sous chaque nom, voir CardTile).
 *
 * Composant sans état : il fonctionne dans la page de deck (client) comme
 * dans le panneau d'une proposition du constructeur.
 */
export function DeckReadingPanel({
  audit,
  duel,
  compact = false,
}: {
  audit: Pick<DeckAudit, "line" | "flagged" | "coherence" | "structure" | "avgQuality">;
  duel: boolean;
  /** Sans cadre ni marge basse : pour l'inclure dans un panneau existant. */
  compact?: boolean;
}) {
  const toReview = audit.flagged.filter((f) => f.level === "discutable" || f.level === "contre-productif");
  const surprising = audit.flagged.filter((f) => f.level === "contre-intuitif");
  return (
    <section className={compact ? "" : "mb-6 rounded-xl border border-border bg-surface p-4"} data-testid="deck-reading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold">Ligne directrice</h2>
        <p className="text-xs text-muted">
          <span title="Part des cartes qui ont un rôle clair dans le deck, moins les cartes à revoir, et réalisation du plan annoncé.">
            Cohérence <strong className="text-foreground">{audit.coherence}</strong>/100
          </span>
          {" · "}
          <span title="Écart de la forme du deck (créatures, contresorts, réponses, pioche, courbe) aux fourchettes des decks de tournoi Duel de la même famille.">
            Forme <strong className="text-foreground">{audit.structure}</strong>/100
          </span>
          {" · "}
          <span
            title={
              duel
                ? "Qualité moyenne des cartes hors terrains : présence dans les decks de tournoi Duel quand elle existe, sinon estimation d'après le texte."
                : "Qualité moyenne des cartes hors terrains : popularité en Commander (rang EDHREC) quand elle existe, sinon estimation d'après le texte."
            }
          >
            Qualité <strong className="text-foreground">{audit.avgQuality.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</strong>/10
          </span>
        </p>
      </div>
      <p className="mt-1 text-sm">{audit.line.text}</p>
      {!duel && (
        <p className="mt-1 text-xs text-muted">
          Les fourchettes de forme viennent de decks de tournoi Duel : en multijoueur, l&apos;indice « forme » est un repère, pas une cible.
        </p>
      )}

      {toReview.length > 0 && (
        <div className="mt-3 rounded-lg bg-warning-soft px-3 py-2">
          <h3 className="text-xs font-semibold text-warning">
            {toReview.length} carte{toReview.length > 1 ? "s" : ""} à revoir
          </h3>
          <ul className="mt-1 space-y-1 text-xs">
            {toReview.map((f) => (
              <li key={f.name}>
                <span className="font-medium">{f.name}</span>
                {f.level === "contre-productif" && <span className="font-medium text-warning"> (contre-productive ici)</span>}
                <span className="text-foreground/80"> — {f.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {surprising.length > 0 && (
        <details className="mt-3 rounded-lg bg-synergy-soft/60 px-3 py-2" open={surprising.length <= 4}>
          <summary className="cursor-pointer text-xs font-semibold text-synergy">
            {surprising.length} choix qui {surprising.length > 1 ? "peuvent" : "peut"} surprendre, et pourquoi {surprising.length > 1 ? "ils sont" : "il est"} là
          </summary>
          <ul className="mt-1 space-y-1 text-xs">
            {surprising.map((f) => (
              <li key={f.name}>
                <span className="font-medium">{f.name}</span>
                <span className="text-foreground/80"> — {f.note}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {toReview.length === 0 && surprising.length === 0 && (
        <p className="mt-2 text-xs text-muted">Aucune carte à revoir : chacune a un rôle dans le deck, indiqué sous son nom dans la liste.</p>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Lecture automatique par motifs sur le texte des cartes : elle peut se tromper sur une carte au texte inhabituel.
      </p>
    </section>
  );
}

/**
 * Écran de chargement pour "/extensions" : la page récupère les
 * métadonnées d'environ 58 sets auprès de Scryfall (mises en cache 24h
 * ensuite), ce qui peut prendre plusieurs secondes au tout premier
 * chargement — un squelette plutôt qu'un écran figé le temps de la
 * requête (voir page.tsx).
 */
export default function ExtensionsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <div className="h-7 w-40 animate-pulse rounded bg-surface-muted" />
        <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-surface-muted" />
        <div className="mt-2 h-4 w-2/3 max-w-xl animate-pulse rounded bg-surface-muted" />
      </div>
      <div className="mb-6 h-10 w-full animate-pulse rounded-lg bg-surface-muted" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-surface-muted" />
        ))}
      </div>
    </div>
  );
}

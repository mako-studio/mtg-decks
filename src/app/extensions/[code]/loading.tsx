/**
 * Écran de chargement pour "/extensions/[code]" : la checklist complète
 * (métadonnées + cartes EN + noms FR, potentiellement plusieurs centaines
 * de cartes paginées) peut prendre quelques secondes au premier chargement
 * (voir loadSetChecklist dans lib/sets.ts).
 */
export default function ExtensionDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-surface-muted" />
      <div className="mb-8">
        <div className="h-7 w-64 animate-pulse rounded bg-surface-muted" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded bg-surface-muted" />
      </div>
      <div className="mb-8 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-6 w-24 animate-pulse rounded-full bg-surface-muted" />
        ))}
      </div>
      <div className="mb-4 h-10 w-full max-w-md animate-pulse rounded-lg bg-surface-muted" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-surface-muted" />
        ))}
      </div>
    </div>
  );
}

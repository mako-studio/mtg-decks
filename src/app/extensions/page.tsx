import { TRACKED_SETS } from "@/data/tracked-sets";
import { getSetInfo } from "@/lib/scryfall";
import { buildSetSummary } from "@/lib/sets";
import { ExtensionsBrowser } from "@/components/ExtensionsBrowser";

// Forcé en rendu à la demande plutôt que statique : cette page (sans
// segment dynamique) serait sinon prérendue au build, ce qui déclencherait
// ~58 appels Scryfall pendant le build lui-même — fragile si Scryfall est
// injoignable à ce moment-là (voir le même raisonnement documenté sur
// /decks/[id]/page.tsx). Le cache `fetch` 24h (scryfall.ts) continue de
// s'appliquer normalement : seule la première requête après expiration du
// cache paie la latence réseau, pas chaque visite.
export const dynamic = "force-dynamic";

export default async function ExtensionsPage() {
  // Une requête Scryfall légère par set (métadonnées seules, pas la
  // checklist de cartes) — voir la note de throttle dans scryfall.ts :
  // correctement espacées même appelées "en parallèle" ici. Résultat mis
  // en cache 24h par set (next.revalidate) : seul le tout premier chargement
  // (ou après expiration du cache) paie la latence de ces N requêtes.
  const summaries = await Promise.all(
    TRACKED_SETS.map(async (ref) => buildSetSummary(ref, await getSetInfo(ref.code)))
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Extensions</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Les {summaries.length} sets déjà référencés par les decks du site — Commander papier et
          MTG Arena. Ouvre une extension pour voir sa checklist complète (cartes en français et
          anglais, zoom au survol) et ses mécaniques clés.
        </p>
      </div>
      <ExtensionsBrowser sets={summaries} />
    </div>
  );
}

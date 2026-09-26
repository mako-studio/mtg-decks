import type { Metadata } from "next";
import { CompetitiveBuilder } from "@/components/CompetitiveBuilder";

export const metadata: Metadata = {
  title: "Construire un deck compétitif — MTG Opti",
  description:
    "Importe une liste de cartes, choisis Commander multi ou Duel Commander : MTG Opti trouve le meilleur commandant (dans ta liste ou non), construit les decks les plus puissants possibles et te propose les cartes à acquérir pour viser le Tier 4.",
};

/**
 * 25/09/2026 : la construction évalue plusieurs dizaines de commandants et
 * fait une vingtaine de requêtes Scryfall (voir runCompetitiveBuild) — on
 * relève la durée max des Server Actions de cette page (route segment
 * config `maxDuration`, qui s'applique aux Server Actions de la page selon
 * la doc Next.js). La valeur réellement autorisée dépend du plan
 * d'hébergement (Vercel) : non vérifié depuis l'environnement de dev.
 *
 * 26/09/2026 (Ben : « This page couldn't load » fréquent en lançant une
 * liste ou un CSV) : 60 était une ERREUR. D'après la doc Vercel (page
 * « Configuring Maximum Duration », mise à jour du 24/08/2026), avec Fluid
 * compute — activé par défaut — la durée par défaut est déjà de 300 s sur
 * tous les plans, Hobby compris (max Hobby 300 s, Pro 800 s). `60`
 * ABAISSAIT donc la limite : une grosse liste (~900 cartes, file Scryfall
 * « stricte » à 550 ms par requête, pause de 35 s après un 429, puis
 * Commander Spellbook) pouvait la dépasser ; Vercel coupait la fonction et
 * le client plantait (voir le try/catch de CompetitiveBuilder.launch).
 * 300 = maximum Hobby. Si Fluid compute est désactivé sur le projet, la
 * limite Hobby est plus basse et ce réglage peut être refusé au déploiement
 * (non vérifié : pas d'accès au tableau de bord Vercel).
 */
export const maxDuration = 300;

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // « ?depuis=simulateur » : arrivée depuis le bouton « Trouver le meilleur
  // commandant » d'un deck analysé (26/09/2026).
  const { depuis } = await searchParams;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Construire un deck compétitif</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Importe tes cartes, choisis Commander multi ou Duel : on cherche le meilleur commandant — dans ta liste ou
          en dehors —, on construit pour chacun le deck le plus puissant possible (objectif : Tier 4), et on te
          propose les cartes à acquérir pour s&apos;en rapprocher encore.
        </p>
      </div>

      <CompetitiveBuilder fromSimulator={depuis === "simulateur"} />
    </div>
  );
}

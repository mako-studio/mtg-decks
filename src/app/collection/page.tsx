import type { Metadata } from "next";
import { CollectionImportForm } from "@/components/CollectionImportForm";

export const metadata: Metadata = {
  title: "Deck depuis ma collection — MTG Opti",
  description:
    "Importe les cartes que tu possèdes et laisse MTG Opti te suggérer le meilleur deck Commander ou Duel Commander constructible avec, avec son score de puissance.",
};

export default function CollectionPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Construire un deck avec ma collection</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Importe la liste des cartes que tu possèdes (collée ou en CSV), choisis Commander ou
          Duel Commander : on détecte le meilleur commandant disponible dans ta collection,
          complète avec des terrains de base pour un deck immédiatement jouable, calcule le score
          de puissance, et te propose les cartes à acquérir pour l&apos;améliorer encore.
        </p>
      </div>

      <CollectionImportForm />
    </div>
  );
}

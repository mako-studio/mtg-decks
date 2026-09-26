"use client";

import { useEffect } from "react";

/**
 * Frontière d'erreur du site (26/09/2026). Avant, aucune n'existait : toute
 * erreur non rattrapée affichait l'écran générique de Next.js en anglais
 * (« This page couldn't load »), sans indication ni retour possible sans
 * recharger. Les appels serveur connus sont désormais rattrapés dans les
 * composants (CompetitiveBuilder, DeckBuilder) ; ceci reste le filet pour
 * le reste. Next 16 : le prop de relance s'appelle `retry` (doc
 * node_modules/next/dist/docs/.../file-conventions/error.md), pas `reset`.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[erreur de page]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="rounded-xl border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold">Cette page a rencontré une erreur</h1>
        <p className="mt-2 text-sm text-muted">
          Souvent un appel au serveur trop long ou une connexion coupée. Réessaie ; si ça se
          reproduit, note l&apos;heure et le message ci-dessous.
        </p>
        {(error.message || error.digest) && (
          <p className="mt-3 break-words rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs text-muted">
            {error.message}
            {error.digest ? ` (réf. ${error.digest})` : ""}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-accent/50"
          >
            Recharger la page
          </button>
        </div>
      </div>
    </div>
  );
}

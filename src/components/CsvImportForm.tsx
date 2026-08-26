"use client";

import { useActionState } from "react";
import { analyzeCsvImport, type DeckAnalysisResult } from "@/lib/actions";
import { DeckBuilder } from "./DeckBuilder";

const INITIAL_STATE: DeckAnalysisResult = {
  ok: false,
  error: null,
  formatKey: "commander",
  deckName: "",
  commanderEntries: [],
  cards: [],
  currentStats: null,
  projectedStats: null,
  improvementPct: 0,
  suggestions: [],
  exportText: "",
};

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Reprend un deck Commander exporté en CSV depuis ce site (bouton
 * "Exporter en CSV" dans DeckBuilder.tsx) pour continuer une session
 * d'optimisation plus tard : la liste de cartes ET les cartes marquées
 * "ajoutée via suggestion" / "à retirer" sont restaurées (voir
 * analyzeCsvImport dans actions.ts), pas seulement la liste brute.
 */
export function CsvImportForm() {
  const [state, formAction, pending] = useActionState(analyzeCsvImport, INITIAL_STATE);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">Reprendre un deck exporté (CSV)</h2>
      <p className="mt-1 text-xs text-muted">
        Importe un fichier CSV précédemment exporté depuis ce site (bouton &quot;Exporter en
        CSV&quot;) pour continuer là où tu t&apos;étais arrêté — les cartes ajoutées via
        suggestion et celles marquées &quot;à retirer&quot; sont reprises aussi.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input
          type="file"
          name="csv"
          accept=".csv,text/csv"
          required
          className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent-foreground"
        />

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Import en cours…" : "Importer le CSV"}
        </button>
      </form>

      {state.error && (
        <p className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          {state.error}
        </p>
      )}

      {state.ok && (
        <div className="mt-6">
          {/* key forcé pour remonter le simulateur à zéro à chaque nouvel import */}
          <DeckBuilder
            key={`${state.formatKey}:${state.deckName}:${state.cards.map((c) => c.name).join("|")}`}
            initial={state}
            deckSlug={`csv-${slugify(state.commanderEntries[0]?.name || state.deckName || "deck")}`}
            initialAddedNames={state.restoredAddedNames}
            initialMarkedForRemoval={state.restoredMarkedForRemoval}
          />
        </div>
      )}
    </div>
  );
}

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
 *
 * Une fois l'import réussi, on affiche le DeckBuilder en pleine largeur
 * avec un en-tête façon page de deck précon (voir decks/[id]/page.tsx) —
 * pas dans la carte étroite du formulaire, qui casse la mise en page à
 * deux colonnes de DeckBuilder (grille lg:grid-cols-[1fr_360px] écrasée
 * dans un conteneur max-w-xl).
 */
export function CsvImportForm() {
  const [state, formAction, pending] = useActionState(analyzeCsvImport, INITIAL_STATE);

  if (state.ok) {
    const deckSlug = `csv-${slugify(state.commanderEntries[0]?.name || state.deckName || "deck")}`;
    return (
      <div className="mb-10">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mb-4 text-xs font-medium text-muted underline hover:text-foreground"
        >
          ← Importer un autre CSV
        </button>

        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Deck importé · CSV
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {state.deckName || "Deck importé"}
          </h1>
          {state.commanderEntries.length > 0 && (
            <p className="mt-1 text-sm text-foreground/80">
              Commandant{state.commanderEntries.length > 1 ? "s" : ""} :{" "}
              {state.commanderEntries.map((c) => c.name).join(" / ")}
            </p>
          )}
        </div>

        <DeckBuilder
          key={`${state.formatKey}:${state.deckName}:${state.cards.map((c) => c.name).join("|")}`}
          initial={state}
          deckSlug={deckSlug}
          initialAddedNames={state.restoredAddedNames}
          initialMarkedForRemoval={state.restoredMarkedForRemoval}
        />
      </div>
    );
  }

  return (
    <div className="mb-10 max-w-xl rounded-xl border border-border bg-surface p-5">
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
    </div>
  );
}

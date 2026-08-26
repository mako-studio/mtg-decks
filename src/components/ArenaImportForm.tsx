"use client";

import { useActionState } from "react";
import { analyzeArenaImport, type DeckAnalysisResult } from "@/lib/actions";
import { DeckBuilder } from "./DeckBuilder";

const INITIAL_STATE: DeckAnalysisResult = {
  ok: false,
  error: null,
  formatKey: "historic",
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

const FORMAT_OPTIONS: { group: string; options: { value: string; label: string }[] }[] = [
  {
    group: "Constructed (60 cartes)",
    options: [
      { value: "historic", label: "Historic" },
      { value: "standard", label: "Standard" },
      { value: "explorer", label: "Explorer" },
      { value: "alchemy", label: "Alchemy" },
      { value: "timeless", label: "Timeless" },
    ],
  },
  {
    group: "Singleton (commandant)",
    options: [
      { value: "historicbrawl", label: "Historic Brawl" },
      { value: "brawl", label: "Brawl" },
    ],
  },
];

export function ArenaImportForm() {
  const [state, formAction, pending] = useActionState(analyzeArenaImport, INITIAL_STATE);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">Importer un deck Arena</h2>
      <p className="mt-1 text-xs text-muted">
        Dans le client MTG Arena : ouvre ton deck → menu → Export → colle le texte ici.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <select
          name="format"
          defaultValue="historic"
          className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {FORMAT_OPTIONS.map((group) => (
            <optgroup key={group.group} label={group.group}>
              {group.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <textarea
          name="decklist"
          required
          rows={8}
          placeholder={"Deck\n4 Lightning Bolt (STA) 42\n...\n\nSideboard\n..."}
          className="w-full resize-y rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs outline-none focus:border-accent"
        />

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Analyse en cours…" : "Analyser le deck"}
        </button>
      </form>

      {state.error && (
        <p className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          {state.error}
        </p>
      )}

      {state.ok && (
        <div className="mt-6">
          {/* key forcé pour remonter le simulateur à zéro à chaque nouvel import
              (sinon son état interne survivrait à une resoumission du formulaire). */}
          <DeckBuilder
            key={`${state.formatKey}:${state.deckName}:${state.cards.map((c) => c.name).join("|")}`}
            initial={state}
            deckSlug={`import-${state.formatKey}-${slugify(
              state.commanderEntries[0]?.name || state.cards[0]?.name || "deck"
            )}`}
          />
        </div>
      )}
    </div>
  );
}

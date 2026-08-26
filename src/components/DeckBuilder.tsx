"use client";

import { useEffect, useState, useTransition } from "react";
import type { CardSuggestion, EnrichedCard } from "@/lib/types";
import { analyzeDeck, type DeckAnalysisResult } from "@/lib/actions";
import { getFormat } from "@/lib/formats";
import { CardTile } from "./CardTile";
import { SuggestionCard } from "./SuggestionCard";
import { ImprovementGauge } from "./ImprovementGauge";
import { ArenaExportButton } from "./ArenaExportButton";

interface SavedSession {
  savedAt: string;
  cards: { name: string; count: number }[];
  addedNames: string[];
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  // BOM UTF-8 pour qu'Excel affiche correctement les accents.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Simulateur interactif : à partir d'une analyse initiale (deck précon,
 * import Arena, ...), permet d'ajouter une carte suggérée ou d'en retirer
 * une, recalcule le score et les nouvelles suggestions à chaque geste
 * (via `analyzeDeck`), et permet d'exporter la liste finale en CSV.
 *
 * La session (liste de cartes + quelles cartes ont été ajoutées) est
 * sauvegardée dans le localStorage du navigateur sous `deckSlug` : pas de
 * compte ni de base de données (hors scope v1, voir README), donc la
 * sauvegarde est locale à cet appareil/navigateur et peut être vide en
 * navigation privée ou après nettoyage du site.
 */
export function DeckBuilder({
  initial,
  deckSlug,
}: {
  initial: DeckAnalysisResult;
  deckSlug: string;
}) {
  const [result, setResult] = useState(initial);
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [transientError, setTransientError] = useState<string | null>(null);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  // Un seul élément déplié à la fois par liste (accordéon), plutôt que
  // chaque carte gère son propre état local (tout pouvait s'ouvrir en
  // même temps, ce qui allongeait la page inutilement).
  const [openCardKey, setOpenCardKey] = useState<string | null>(null);
  const [openSuggestionId, setOpenSuggestionId] = useState<string | null>(null);

  const storageKey = `mtg-deck-builder:${deckSlug}`;
  const format = getFormat(result.formatKey);

  // Au montage : propose de reprendre une session sauvegardée précédemment
  // pour ce deck, sans l'appliquer automatiquement (l'utilisateur choisit).
  useEffect(() => {
    // Lecture ponctuelle d'un système externe (localStorage) indisponible
    // pendant le rendu serveur : ce n'est pas une cascade de re-renders
    // (un seul setState, une seule fois au montage), juste la façon dont
    // React documente lui-même la synchronisation avec le DOM/navigateur
    // (https://react.dev/learn/synchronizing-with-effects). D'où le
    // eslint-disable ciblé plutôt qu'un contournement plus alambiqué.
    try {
      const raw = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setSavedSession(JSON.parse(raw) as SavedSession);
    } catch {
      // localStorage indisponible (navigation privée, etc.) : pas grave,
      // on continue simplement sans sauvegarde.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(cards: EnrichedCard[], added: Set<string>) {
    try {
      const payload: SavedSession = {
        savedAt: new Date().toISOString(),
        cards: cards.map((c) => ({ name: c.name, count: c.count })),
        addedNames: Array.from(added),
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // idem : pas de sauvegarde possible, on continue sans.
    }
  }

  function recompute(cardList: { name: string; count: number }[], newAdded: Set<string>) {
    setTransientError(null);
    startTransition(async () => {
      const commanders = result.commanderEntries.map((c) => c.name);
      const res = await analyzeDeck({
        formatKey: result.formatKey,
        deckName: result.deckName,
        commanders,
        cards: cardList,
      });
      if (res.ok) {
        setResult(res);
        setAddedNames(newAdded);
        persist(res.cards, newAdded);
      } else {
        setTransientError(res.error ?? "Erreur inattendue pendant le recalcul.");
      }
    });
  }

  function handleAdd(s: CardSuggestion) {
    const key = s.card.name.toLowerCase();
    const already = result.cards.find((c) => c.name.toLowerCase() === key);
    const newList = already
      ? result.cards.map((c) =>
          c.name.toLowerCase() === key ? { name: c.name, count: c.count + 1 } : { name: c.name, count: c.count }
        )
      : [...result.cards.map((c) => ({ name: c.name, count: c.count })), { name: s.card.name, count: 1 }];
    recompute(newList, new Set(addedNames).add(key));
  }

  function handleRemove(entry: EnrichedCard) {
    const key = entry.name.toLowerCase();
    const newList =
      entry.count > 1
        ? result.cards.map((c) =>
            c.name.toLowerCase() === key ? { name: c.name, count: c.count - 1 } : { name: c.name, count: c.count }
          )
        : result.cards.filter((c) => c.name.toLowerCase() !== key).map((c) => ({ name: c.name, count: c.count }));
    const newAdded = new Set(addedNames);
    newAdded.delete(key);
    recompute(newList, newAdded);
  }

  function resumeSaved() {
    if (!savedSession) return;
    recompute(savedSession.cards, new Set(savedSession.addedNames));
    setSavedSession(null);
  }

  function discardSaved() {
    setSavedSession(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // rien à faire si localStorage est indisponible
    }
  }

  function resetToOriginal() {
    setResult(initial);
    setAddedNames(new Set());
    setTransientError(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // rien à faire si localStorage est indisponible
    }
  }

  function exportCsv() {
    const rows: string[][] = [
      ["Nombre", "Nom", "Coût de mana", "Type", "Ajoutée via suggestion"],
    ];
    for (const c of result.commanderEntries) {
      rows.push([String(c.count), c.name, c.card?.mana_cost ?? "", c.card?.type_line ?? "", "non (commandant)"]);
    }
    for (const c of [...result.cards].sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
      rows.push([
        String(c.count),
        c.name,
        c.card?.mana_cost ?? "",
        c.card?.type_line ?? "",
        addedNames.has(c.name.toLowerCase()) ? "oui" : "non",
      ]);
    }
    downloadCsv(`${deckSlug || "deck"}.csv`, rows);
  }

  const hasChanges = addedNames.size > 0 || result.cards.length !== initial.cards.length;
  const sortedCards = [...result.cards].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <div>
      {savedSession && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
          <span className="text-accent">
            Une session sauvegardée existe pour ce deck (
            {new Date(savedSession.savedAt).toLocaleString("fr-FR")}).
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resumeSaved}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90"
            >
              Reprendre
            </button>
            <button
              type="button"
              onClick={discardSaved}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
            >
              Ignorer
            </button>
          </div>
        </div>
      )}

      {transientError && (
        <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          {transientError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          {result.commanderEntries.length > 0 && (
            <>
              <h2 className="mb-3 text-sm font-medium text-muted">
                Commandant{result.commanderEntries.length > 1 ? "s" : ""}
              </h2>
              <div className="mb-6 space-y-2">
                {result.commanderEntries.map((entry) => (
                  <CardTile
                    key={entry.name}
                    entry={entry}
                    expanded={openCardKey === entry.name}
                    onToggle={() => setOpenCardKey(openCardKey === entry.name ? null : entry.name)}
                  />
                ))}
              </div>
            </>
          )}

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted">
              Deck ({result.cards.reduce((s, c) => s + c.count, 0)} cartes)
            </h2>
            {hasChanges && (
              <button
                type="button"
                onClick={resetToOriginal}
                className="text-xs font-medium text-muted underline hover:text-foreground"
              >
                Revenir au deck d&apos;origine
              </button>
            )}
          </div>
          <div className="space-y-2">
            {sortedCards.map((entry, i) => (
              <CardTile
                key={`${entry.name}-${i}`}
                entry={entry}
                added={addedNames.has(entry.name.toLowerCase())}
                onRemove={() => handleRemove(entry)}
                removeDisabled={pending}
                expanded={openCardKey === entry.name}
                onToggle={() => setOpenCardKey(openCardKey === entry.name ? null : entry.name)}
              />
            ))}
          </div>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <ImprovementGauge
            currentScore={result.currentStats?.score ?? 0}
            projectedScore={result.projectedStats?.score ?? 0}
            improvementPct={result.improvementPct}
          />

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-sm font-medium text-muted">Sauvegarder / exporter</h3>
            <p className="mt-1 text-xs text-muted">
              La sauvegarde reste dans ce navigateur (pas de compte). L&apos;export CSV
              fonctionne partout.
            </p>
            <button
              type="button"
              onClick={exportCsv}
              className="mt-3 w-full rounded-lg bg-accent py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
            >
              Exporter en CSV
            </button>
          </div>

          {format.arenaOnly && result.exportText && <ArenaExportButton text={result.exportText} />}

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted">
                Cartes suggérées ({result.suggestions.length})
              </h2>
              {pending && <span className="text-xs text-muted">Recalcul…</span>}
            </div>
            {result.suggestions.length === 0 ? (
              <p className="text-sm text-muted">
                Aucune suggestion trouvée (ou service Scryfall indisponible pour la recherche).
              </p>
            ) : (
              <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {result.suggestions.map((s) => (
                  <SuggestionCard
                    key={s.card.id}
                    suggestion={s}
                    onAdd={() => handleAdd(s)}
                    addDisabled={pending}
                    expanded={openSuggestionId === s.card.id}
                    onToggle={() =>
                      setOpenSuggestionId(openSuggestionId === s.card.id ? null : s.card.id)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import type { CardSuggestion, EnrichedCard } from "@/lib/types";
import { analyzeDeck, type DeckAnalysisResult } from "@/lib/actions";
import { getFormat } from "@/lib/formats";
import { CardTile } from "./CardTile";
import { SuggestionCard } from "./SuggestionCard";
import { SwapConfirmModal } from "./SwapConfirmModal";
import { AddCardSearch } from "./AddCardSearch";
import { ImprovementGauge } from "./ImprovementGauge";
import { ArenaExportButton } from "./ArenaExportButton";

interface SavedSession {
  savedAt: string;
  cards: { name: string; count: number }[];
  addedNames: string[];
  /** Cartes taguées "à retirer" suite à un swap non confirmé (voir SwapConfirmModal). */
  markedForRemoval?: string[];
  /** Carte ajoutée (clé minuscule) -> carte d'origine qu'elle a remplacée lors d'un swap confirmé. */
  swapHistory?: Record<string, string>;
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
 * Quand une suggestion a une candidate au retrait (`swapOut`, calculée
 * côté serveur dans recommend.ts), cliquer "Ajouter" ouvre une
 * confirmation de swap plutôt que d'ajouter directement : soit on
 * confirme (ajout + retrait en un recalcul), soit on ajoute quand même en
 * taguant seulement la candidate "à retirer" pour y revenir plus tard
 * depuis la liste du deck.
 *
 * Si on retire ensuite une carte ajoutée via un swap confirmé, la carte
 * d'origine qu'elle avait remplacée est automatiquement remise dans le
 * deck (voir `swapHistory`) — retirer un swap l'annule proprement plutôt
 * que de laisser un trou. Un ajout simple (sans swap) reste un simple
 * retrait, rien à restaurer.
 *
 * La session (liste de cartes + cartes ajoutées + cartes taguées) est
 * sauvegardée dans le localStorage du navigateur sous `deckSlug` : pas de
 * compte ni de base de données (hors scope v1, voir README), donc la
 * sauvegarde est locale à cet appareil/navigateur et peut être vide en
 * navigation privée ou après nettoyage du site.
 */
export function DeckBuilder({
  initial,
  deckSlug,
  initialAddedNames,
  initialMarkedForRemoval,
}: {
  initial: DeckAnalysisResult;
  deckSlug: string;
  /**
   * Pré-remplit les cartes "ajoutée via suggestion" / "à retirer" au
   * montage — utilisé par l'import CSV (CsvImportForm) pour reprendre une
   * session exportée précédemment, pas seulement la liste de cartes.
   * Noms attendus en minuscule (même convention que l'état interne).
   */
  initialAddedNames?: string[];
  initialMarkedForRemoval?: string[];
}) {
  const [result, setResult] = useState(initial);
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set(initialAddedNames ?? []));
  const [markedForRemoval, setMarkedForRemoval] = useState<Set<string>>(
    new Set(initialMarkedForRemoval ?? [])
  );
  // Carte ajoutée (clé minuscule) -> nom de la carte d'origine qu'elle a
  // remplacée, uniquement pour les swaps confirmés (pas les ajouts
  // simples). Permet de restaurer automatiquement l'originale si on
  // retire ensuite la carte ajoutée.
  const [swapHistory, setSwapHistory] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [transientError, setTransientError] = useState<string | null>(null);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  // Un seul élément déplié à la fois par liste (accordéon), plutôt que
  // chaque carte gère son propre état local (tout pouvait s'ouvrir en
  // même temps, ce qui allongeait la page inutilement).
  const [openCardKey, setOpenCardKey] = useState<string | null>(null);
  const [openSuggestionId, setOpenSuggestionId] = useState<string | null>(null);
  // Suggestion actuellement en attente de confirmation de swap (popup).
  const [swapPrompt, setSwapPrompt] = useState<CardSuggestion | null>(null);

  const storageKey = `mtg-deck-builder:${deckSlug}`;
  const format = getFormat(result.formatKey);
  const hasChanges =
    addedNames.size > 0 ||
    markedForRemoval.size > 0 ||
    result.cards.length !== initial.cards.length;

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

  // Sauvegarde automatique dès que l'état "vivant" du deck change, plutôt
  // que d'appeler persist() à la main à chaque site d'appel (add/remove/
  // swap/tag/reprise) : évite les incohérences si plusieurs mises à jour
  // d'état se chevauchent (ex. swap qui ajoute une carte ET tague une
  // autre dans le même geste). Synchronisation avec un système externe
  // (localStorage), pas une cascade de setState.
  useEffect(() => {
    if (!hasChanges) return;
    try {
      const payload: SavedSession = {
        savedAt: new Date().toISOString(),
        cards: result.cards.map((c) => ({ name: c.name, count: c.count })),
        addedNames: Array.from(addedNames),
        markedForRemoval: Array.from(markedForRemoval),
        swapHistory,
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // idem : pas de sauvegarde possible, on continue sans.
    }
  }, [result, addedNames, markedForRemoval, swapHistory, hasChanges, storageKey]);

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
        // Une carte taguée "à retirer" qui n'est plus dans le deck (retirée
        // entre-temps par ce recalcul ou un autre geste) n'a plus de sens à
        // tagger : on la retire du set. Forme fonctionnelle pour lire le
        // tag le plus à jour (ex. un tag ajouté par tagOnlySwap juste avant
        // que ce recalcul ne se termine).
        setMarkedForRemoval((prev) => {
          const next = new Set<string>();
          for (const n of prev) {
            if (res.cards.some((c) => c.name.toLowerCase() === n)) next.add(n);
          }
          return next;
        });
        // Idem pour l'historique de swap : une entrée dont la carte
        // ajoutée n'est plus dans le deck n'a plus de sens à garder.
        setSwapHistory((prev) => {
          const next: Record<string, string> = {};
          for (const [addedKey, originalName] of Object.entries(prev)) {
            if (res.cards.some((c) => c.name.toLowerCase() === addedKey)) {
              next[addedKey] = originalName;
            }
          }
          return next;
        });
      } else {
        setTransientError(res.error ?? "Erreur inattendue pendant le recalcul.");
      }
    });
  }

  /** Ajoute un exemplaire de `name` au deck (nouvelle entrée, ou +1 si déjà présente). */
  function addCardByName(name: string) {
    const key = name.toLowerCase();
    const already = result.cards.find((c) => c.name.toLowerCase() === key);
    const newList = already
      ? result.cards.map((c) =>
          c.name.toLowerCase() === key ? { name: c.name, count: c.count + 1 } : { name: c.name, count: c.count }
        )
      : [...result.cards.map((c) => ({ name: c.name, count: c.count })), { name, count: 1 }];
    recompute(newList, new Set(addedNames).add(key));
  }

  function handleAdd(s: CardSuggestion) {
    addCardByName(s.card.name);
  }

  function handleAddClick(s: CardSuggestion) {
    if (s.swapOut) {
      setSwapPrompt(s);
    } else {
      handleAdd(s);
    }
  }

  function confirmSwap() {
    if (!swapPrompt?.swapOut) return;
    const addKey = swapPrompt.card.name.toLowerCase();
    const originalName = swapPrompt.swapOut.name;
    const removeKey = originalName.toLowerCase();

    const already = result.cards.find((c) => c.name.toLowerCase() === addKey);
    let newList = already
      ? result.cards.map((c) =>
          c.name.toLowerCase() === addKey ? { name: c.name, count: c.count + 1 } : { name: c.name, count: c.count }
        )
      : [...result.cards.map((c) => ({ name: c.name, count: c.count })), { name: swapPrompt.card.name, count: 1 }];

    const toRemove = newList.find((c) => c.name.toLowerCase() === removeKey);
    if (toRemove) {
      newList =
        toRemove.count > 1
          ? newList.map((c) =>
              c.name.toLowerCase() === removeKey ? { name: c.name, count: c.count - 1 } : c
            )
          : newList.filter((c) => c.name.toLowerCase() !== removeKey);
    }

    recompute(newList, new Set(addedNames).add(addKey));
    setSwapHistory((prev) => ({ ...prev, [addKey]: originalName }));
    setSwapPrompt(null);
  }

  function tagOnlySwap() {
    if (!swapPrompt?.swapOut) return;
    const removeKey = swapPrompt.swapOut.name.toLowerCase();
    handleAdd(swapPrompt);
    setMarkedForRemoval((prev) => new Set(prev).add(removeKey));
    setSwapPrompt(null);
  }

  function handleRemove(entry: EnrichedCard) {
    const key = entry.name.toLowerCase();
    // On ne retire complètement (et donc on ne restaure l'originale) que si
    // c'est le dernier exemplaire : décrémenter un stock de plusieurs
    // copies n'annule pas le swap, il en reste encore en jeu.
    const willFullyRemove = entry.count <= 1;
    const restoreName = willFullyRemove ? swapHistory[key] : undefined;

    let newList = willFullyRemove
      ? result.cards.filter((c) => c.name.toLowerCase() !== key).map((c) => ({ name: c.name, count: c.count }))
      : result.cards.map((c) =>
          c.name.toLowerCase() === key ? { name: c.name, count: c.count - 1 } : { name: c.name, count: c.count }
        );

    const newAdded = new Set(addedNames);
    if (willFullyRemove) newAdded.delete(key);

    if (restoreName) {
      // Carte ajoutée via un swap confirmé : on remet la carte d'origine
      // qu'elle avait remplacée plutôt que de laisser un trou dans le deck.
      const restoreKey = restoreName.toLowerCase();
      const already = newList.find((c) => c.name.toLowerCase() === restoreKey);
      newList = already
        ? newList.map((c) => (c.name.toLowerCase() === restoreKey ? { name: c.name, count: c.count + 1 } : c))
        : [...newList, { name: restoreName, count: 1 }];
      newAdded.delete(restoreKey);
    }

    recompute(newList, newAdded);
  }

  function resumeSaved() {
    if (!savedSession) return;
    recompute(savedSession.cards, new Set(savedSession.addedNames));
    setMarkedForRemoval(new Set(savedSession.markedForRemoval ?? []));
    setSwapHistory(savedSession.swapHistory ?? {});
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
    setMarkedForRemoval(new Set());
    setSwapHistory({});
    setTransientError(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // rien à faire si localStorage est indisponible
    }
  }

  function exportCsv() {
    // Colonne "Commandant" dédiée (plutôt que de surcharger "Ajoutée via
    // suggestion" avec la valeur "non (commandant)") : plus lisible dans un
    // tableur, et exploitée telle quelle par l'import CSV (csv-import.ts)
    // pour reconnaître le(s) commandant(s) sans ambiguïté.
    const rows: string[][] = [
      ["Commandant", "Nombre", "Nom", "Coût de mana", "Type", "Ajoutée via suggestion", "Marquée à retirer"],
    ];
    for (const c of result.commanderEntries) {
      rows.push(["oui", String(c.count), c.name, c.card?.mana_cost ?? "", c.card?.type_line ?? "", "non", "non"]);
    }
    for (const c of [...result.cards].sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
      rows.push([
        "non",
        String(c.count),
        c.name,
        c.card?.mana_cost ?? "",
        c.card?.type_line ?? "",
        addedNames.has(c.name.toLowerCase()) ? "oui" : "non",
        markedForRemoval.has(c.name.toLowerCase()) ? "oui" : "non",
      ]);
    }
    downloadCsv(`${deckSlug || "deck"}.csv`, rows);
  }

  const sortedCards = [...result.cards].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const existingCounts = new Map<string, number>();
  for (const c of result.cards) existingCounts.set(c.name.toLowerCase(), c.count);

  // Identité de couleur du deck, pour avertir (sans bloquer) si une carte
  // cherchée manuellement est hors des couleurs du/des commandant(s).
  // Non pertinent pour les formats constructed sans commandant.
  const deckColorIdentity = Array.from(
    new Set(result.commanderEntries.flatMap((c) => c.card?.color_identity ?? []))
  );

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

          <div className="mb-6">
            <AddCardSearch
              formatKey={result.formatKey}
              formatLabel={format.label}
              maxCopies={format.maxCopies}
              hasCommander={format.hasCommander}
              colorIdentity={deckColorIdentity}
              currentCards={result.cards}
              existingCounts={existingCounts}
              onAddClick={handleAddClick}
              addDisabled={pending}
            />
          </div>

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
                markedForRemoval={markedForRemoval.has(entry.name.toLowerCase())}
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
            {hasChanges && (
              <button
                type="button"
                onClick={resetToOriginal}
                className="mt-2 w-full rounded-lg border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                ↺ Retour au deck initial
              </button>
            )}
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
                    onAddClick={() => handleAddClick(s)}
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

      {swapPrompt && (
        <SwapConfirmModal
          suggestion={swapPrompt}
          onConfirmSwap={confirmSwap}
          onTagOnly={tagOnlySwap}
          onCancel={() => setSwapPrompt(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import type { CardSuggestion, DeckCategory, EnrichedCard } from "@/lib/types";
import { analyzeDeck, resolveCardNames, type DeckAnalysisResult } from "@/lib/actions";
import { getFormat } from "@/lib/formats";
import { CATEGORY_LABELS, EMPTY_CATEGORY_COUNTS, classifyCard } from "@/lib/deck-score";
import { CardTile } from "./CardTile";
import { SwapConfirmModal } from "./SwapConfirmModal";
import { ImproveDeckPanel } from "./ImproveDeckPanel";
import { DeckDashboard } from "./DeckDashboard";
import { ArenaExportButton } from "./ArenaExportButton";
import { RemovedCardsList } from "./RemovedCardsList";

interface SavedSession {
  savedAt: string;
  cards: { name: string; count: number }[];
  addedNames: string[];
  /** Cartes taguées "à retirer" suite à un swap non confirmé (voir SwapConfirmModal). */
  markedForRemoval?: string[];
  /** Carte ajoutée (clé minuscule) -> carte d'origine qu'elle a remplacée lors d'un swap confirmé. */
  swapHistory?: Record<string, string>;
  /**
   * Cartes retirées (dernier exemplaire) ou swappées pendant la session,
   * pas encore remises dans le deck (28/08/2026, voir RemovedCardsList.tsx)
   * — nom + nombre seulement, comme `cards` ci-dessus : les données Scryfall
   * complètes sont re-résolues à la reprise (voir resumeSaved), pas stockées
   * ici pour ne pas alourdir le localStorage.
   */
  removedCards?: { name: string; count: number }[];
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
 * Toute carte qui quitte complètement le deck (dernier exemplaire, via le
 * bouton de retrait d'une carte ou via un swap confirmé) est aussi gardée
 * dans `removedCards`, affichée sous la liste du deck par
 * RemovedCardsList.tsx (28/08/2026, demande de Ben) : un pense-bête pour la
 * remettre en un clic sans avoir à la rechercher à nouveau. Une carte
 * automatiquement restaurée par l'annulation de swap ci-dessus en sort
 * aussitôt (elle est de nouveau dans le deck, plus la peine de la lister).
 *
 * La session (liste de cartes + cartes ajoutées + cartes taguées + cartes
 * retirées) est
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
  // Cartes retirées (dernier exemplaire) ou swappées pendant la session,
  // plus récente en premier — voir RemovedCardsList.tsx et le commentaire
  // de `SavedSession.removedCards` ci-dessus (28/08/2026, demande de Ben).
  const [removedCards, setRemovedCards] = useState<EnrichedCard[]>([]);
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
  // Pilier sélectionné dans le tableau de bord (DeckDashboard) pour filtrer
  // la liste du deck ci-dessous — `null` si aucun filtre actif. Cf. demande
  // de Ben du 26/08/2026 : cliquer un pilier montre les cartes concernées.
  const [categoryFilter, setCategoryFilter] = useState<DeckCategory | null>(null);

  const storageKey = `mtg-deck-builder:${deckSlug}`;
  const format = getFormat(result.formatKey);
  const hasChanges =
    addedNames.size > 0 ||
    markedForRemoval.size > 0 ||
    removedCards.length > 0 ||
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
        removedCards: removedCards.map((c) => ({ name: c.name, count: c.count })),
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // idem : pas de sauvegarde possible, on continue sans.
    }
  }, [result, addedNames, markedForRemoval, swapHistory, removedCards, hasChanges, storageKey]);

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

    // Capturé avant mutation, depuis `result.cards` (état, données Scryfall
    // complètes) plutôt que `newList`/`toRemove` (listes plates {name,count}
    // envoyées à `analyzeDeck`) : c'est ce qui permet à RemovedCardsList
    // d'afficher image/type/coût de mana sans requête supplémentaire.
    const removedOriginal = result.cards.find((c) => c.name.toLowerCase() === removeKey);
    const willFullyRemoveOriginal = (removedOriginal?.count ?? 0) <= 1;

    recompute(newList, new Set(addedNames).add(addKey));
    setSwapHistory((prev) => ({ ...prev, [addKey]: originalName }));
    if (willFullyRemoveOriginal && removedOriginal) {
      setRemovedCards((prev) => [
        { ...removedOriginal, count: 1 },
        ...prev.filter((e) => e.name.toLowerCase() !== removeKey),
      ]);
    }
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

    setRemovedCards((prev) => {
      let next = prev;
      // Retrait complet du dernier exemplaire : ajoute une entrée (en tête,
      // la plus récente) — voir RemovedCardsList.tsx. Un décrément partiel
      // (il en reste encore en jeu) ne quitte pas vraiment le deck, rien à
      // consigner.
      if (willFullyRemove) {
        next = [entry, ...next.filter((e) => e.name.toLowerCase() !== key)];
      }
      // La carte d'origine remplacée par un swap vient d'être remise
      // automatiquement dans le deck (annulation de swap, voir le
      // commentaire en tête de fichier) : si elle traînait dans cette
      // liste suite à un retrait antérieur, elle n'a plus sa place.
      if (restoreName) {
        const restoreKey = restoreName.toLowerCase();
        next = next.filter((e) => e.name.toLowerCase() !== restoreKey);
      }
      return next;
    });
  }

  /** Remet `name` dans le deck (1 exemplaire) et la retire de la liste "retirées" (RemovedCardsList). */
  function restoreRemovedCard(name: string) {
    addCardByName(name);
    setRemovedCards((prev) => prev.filter((e) => e.name.toLowerCase() !== name.toLowerCase()));
  }

  /** Vide la liste "retirées" sans rien remettre dans le deck — juste un pense-bête, pas un historique à garder de force. */
  function clearRemovedHistory() {
    setRemovedCards([]);
  }

  async function resumeSaved() {
    if (!savedSession) return;
    recompute(savedSession.cards, new Set(savedSession.addedNames));
    setMarkedForRemoval(new Set(savedSession.markedForRemoval ?? []));
    setSwapHistory(savedSession.swapHistory ?? {});
    // La liste "retirées" n'est sauvegardée qu'en nom + nombre (voir
    // SavedSession.removedCards) : il faut re-résoudre les données Scryfall
    // complètes (image/type/coût de mana) pour l'afficher correctement,
    // via une Server Action dédiée plutôt que le recalcul complet
    // d'`analyzeDeck` (inutile ici, pas de score à recalculer).
    const savedRemoved = savedSession.removedCards ?? [];
    if (savedRemoved.length > 0) {
      const resolved = await resolveCardNames(savedRemoved.map((c) => c.name));
      setRemovedCards(
        savedRemoved.map((c) => ({
          name: c.name,
          count: c.count,
          isCommander: false,
          card: resolved[c.name] ?? null,
        }))
      );
    } else {
      setRemovedCards([]);
    }
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
    setRemovedCards([]);
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

  // Cartes du deck qui matchent le pilier sélectionné dans le tableau de
  // bord (voir DeckDashboard) — affichées sous les piliers ET utilisées
  // pour filtrer la liste du deck ci-dessous. Une carte non résolue (card:
  // null) ne matche jamais de pilier (rien à classifier).
  const cardsForCategory = (cat: DeckCategory) =>
    sortedCards.filter((entry) => entry.card && classifyCard(entry.card).includes(cat));
  const matchingCards = categoryFilter ? cardsForCategory(categoryFilter) : [];
  const visibleCards = categoryFilter ? matchingCards : sortedCards;

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

      {/*
        Tableau de bord (score + couverture des 9 piliers) en tête de page,
        toujours visible sans scroller — plutôt qu'enterré en bas de la
        colonne latérale comme avant. Voir refonte UX du 26/08/2026.
      */}
      <div className="mb-6">
        <DeckDashboard
          currentScore={result.currentStats?.score ?? 0}
          projectedScore={result.projectedStats?.score ?? 0}
          improvementPct={result.improvementPct}
          categoryCounts={result.currentStats?.categoryCounts ?? EMPTY_CATEGORY_COUNTS}
          targets={format.categories.targets}
          selectedCategory={categoryFilter}
          onSelectCategory={(cat) => setCategoryFilter((prev) => (prev === cat ? null : cat))}
          matchingCards={matchingCards}
          archetypes={result.archetypes}
          manaCurve={result.currentStats?.manaCurve ?? []}
          avgCmc={result.currentStats?.avgCmc ?? 0}
          totalNonLandCards={result.currentStats?.totalNonLandCards ?? 0}
          curveHealth={
            result.currentStats?.curveHealth ?? { ratio: 1, status: "good", message: "" }
          }
          landHealth={result.currentStats?.landHealth ?? { ratio: 1, status: "good", message: "" }}
        />
      </div>

      {/*
        `order-*` place le panneau "Améliorer ce deck" juste après le
        tableau de bord sur mobile (un seul flux, colonne unique) — avant
        la liste de 99 cartes plutôt qu'après — et le renvoie dans sa
        colonne latérale habituelle à partir de `lg:`. Même logique pour la
        colonne principale (commandant·s + liste), simplement inversée.
      */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="order-2 lg:order-1">
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

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted">
              Deck ({result.cards.reduce((s, c) => s + c.count, 0)} cartes)
              {categoryFilter && (
                <>
                  {" "}
                  · filtré sur{" "}
                  <span className="font-semibold text-accent">
                    {CATEGORY_LABELS[categoryFilter]}
                  </span>{" "}
                  ({visibleCards.length})
                </>
              )}
            </h2>
            <div className="flex items-center gap-3">
              {categoryFilter && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  className="text-xs font-medium text-muted underline hover:text-foreground"
                >
                  ✕ Effacer le filtre
                </button>
              )}
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
          </div>
          {categoryFilter && visibleCards.length === 0 && (
            <p className="mb-3 text-sm text-muted">Aucune carte du deck ne correspond à ce pilier.</p>
          )}
          <div className="space-y-2">
            {visibleCards.map((entry, i) => (
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

          <RemovedCardsList
            entries={removedCards}
            onRestore={restoreRemovedCard}
            onClearAll={clearRemovedHistory}
            restoreDisabled={pending}
          />
        </div>

        <aside className="order-1 space-y-6 lg:order-2 lg:sticky lg:top-6 lg:self-start">
          <ImproveDeckPanel
            suggestions={result.suggestions}
            onAddClick={handleAddClick}
            addDisabled={pending}
            pending={pending}
            openSuggestionId={openSuggestionId}
            onToggleSuggestion={(id) => setOpenSuggestionId(openSuggestionId === id ? null : id)}
            formatKey={result.formatKey}
            formatLabel={format.label}
            maxCopies={format.maxCopies}
            hasCommander={format.hasCommander}
            colorIdentity={deckColorIdentity}
            currentCards={result.cards}
            commanderEntries={result.commanderEntries}
            existingCounts={existingCounts}
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

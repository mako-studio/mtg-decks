"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  analyzeCollectionCsv,
  analyzeCollectionText,
  buildDeckWithUnownedCommander,
  suggestUnownedCommanders,
  switchCollectionCommander,
  type CollectionBuildResult,
  type UnownedCommanderSuggestion,
} from "@/lib/actions";
import { FORMATS } from "@/lib/formats";
import { DeckBuilder } from "./DeckBuilder";

const INITIAL_STATE: CollectionBuildResult = {
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
  archetypes: [],
  tier: null,
  exportText: "",
  candidates: [],
  selectedCommander: null,
  collectionCards: [],
  unresolvedNames: [],
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
 * Indicateur de chargement visuel (24/09/2026, demande de Ben : "je veux
 * aussi avoir une notif visuel que les decks sont en train de charger car
 * lorsque je clique sur un deck suggéré dans le dropdown, le temps de
 * chargement laisse penser que le système freeze"). Avant ce correctif, le
 * changement de commandant (`switching`, `useTransition`) ne désactivait
 * que le `<select>` (`disabled` + `opacity-60`) sans aucun texte ni
 * animation — un recalcul de plusieurs centaines de millisecondes à
 * quelques secondes (nouvel appel Scryfall + reconstruction complète du
 * deck, voir buildDeckFromCollection) sans aucun signal visuel donnait
 * effectivement l'impression que la page ne répondait plus. Réutilisé tel
 * quel pour les deux nouvelles interactions asynchrones ci-dessous
 * (découverte de commandants non possédés, aperçu d'un deck avec l'un
 * d'eux) plutôt qu'un style différent par interaction.
 */
function LoadingIndicator({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent" role="status" aria-live="polite">
      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label}
    </span>
  );
}

/** Formats proposés ici : uniquement ceux à commandant que Ben a demandés ("commander duel ou multi") — pas Brawl/Historic Brawl (Arena), hors périmètre de cette fonctionnalité v1. */
const COLLECTION_FORMATS = [FORMATS.commander, FORMATS.duelcommander] as const;

/**
 * Formulaire "construire un deck avec ma collection" (05/09/2026, demande
 * de Ben) : importe une liste de cartes possédées — collée en texte libre
 * OU en CSV, les deux formats demandés — choisit Commander ou Duel
 * Commander, puis affiche le meilleur deck constructible avec cette
 * collection (commandant détecté automatiquement et présélectionné,
 * terrains de base ajoutés pour compléter si la collection est
 * incomplète), avec un sélecteur pour changer de commandant si Ben préfère
 * un autre candidat.
 *
 * Même stratégie de montage que CsvImportForm/ArenaImportForm une fois
 * l'analyse réussie : le DeckBuilder existant (score, suggestions
 * d'acquisition, swap, export CSV, Super Opti...) est réutilisé tel quel,
 * rien de nouveau à construire côté affichage du deck.
 *
 * Deux `useActionState` distincts (texte / CSV) plutôt qu'un seul : les
 * deux Server Actions ont une signature de FormData différente
 * (`collection` vs `csv`), comme le reste du site sépare déjà
 * analyzeArenaImport/analyzeCsvImport. `result` (l'état réellement affiché)
 * est dérivé au rendu de `lastMode` (quel formulaire a été soumis en
 * dernier — posé dans le `onSubmit` du `<form>`, PAS dans un effet : poser
 * un state depuis un effet à partir d'un autre state déclenche des rendus
 * en cascade, voir la règle react-hooks/set-state-in-effect) et
 * `override` (posé uniquement par `switchCollectionCommander`, un
 * changement de commandant explicite qui n'est pas soumis via un
 * `<form>`).
 */
export function CollectionImportForm() {
  const [mode, setMode] = useState<"text" | "csv">("text");
  const [format, setFormat] = useState<"commander" | "duelcommander">("commander");

  const [textState, textAction, textPending] = useActionState(analyzeCollectionText, INITIAL_STATE);
  const [csvState, csvAction, csvPending] = useActionState(analyzeCollectionCsv, INITIAL_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [lastMode, setLastMode] = useState<"text" | "csv" | null>(null);
  const [override, setOverride] = useState<CollectionBuildResult | null>(null);
  const [switching, startSwitch] = useTransition();

  /**
   * État de la fonctionnalité "commandants recommandés non possédés"
   * (24/09/2026, demande de Ben — voir suggestUnownedCommanders/
   * buildDeckWithUnownedCommander dans actions.ts). `unownedSuggestions`
   * reste `null` tant que Ben n'a pas ouvert cette section (appel à la
   * demande, pas à chaque analyse — voir la doc de l'action). `previewName`
   * mémorise le nom du commandant non possédé actuellement prévisualisé
   * (si non-null, `override` contient CE deck d'aperçu, pas le deck normal
   * de Ben) pour afficher le bandeau "aperçu" et permettre d'y revenir.
   */
  const [unownedSuggestions, setUnownedSuggestions] = useState<UnownedCommanderSuggestion[] | null>(null);
  const [unownedError, setUnownedError] = useState<string | null>(null);
  const [discovering, startDiscovering] = useTransition();
  const [previewName, setPreviewName] = useState<string | null>(null);
  /** Résultat affiché juste avant d'entrer en mode aperçu — capturé une seule fois (pas écrasé si Ben prévisualise un 2e commandant non possédé sans revenir entre les deux) pour que "Revenir à mon deck" retrouve exactement l'état d'avant, y compris un commandant possédé choisi manuellement au préalable. */
  const [beforePreview, setBeforePreview] = useState<CollectionBuildResult | null>(null);
  const [previewingName, setPreviewingName] = useState<string | null>(null);
  const [previewing, startPreviewing] = useTransition();

  const submitted = lastMode === "text" ? textState : lastMode === "csv" ? csvState : null;
  const result = override ?? (submitted?.ok ? submitted : null);

  const activeError = mode === "text" ? textState.error : csvState.error;

  if (result?.ok) {
    const deckSlug = `collection-${slugify(result.selectedCommander || result.deckName || "deck")}`;

    function handleCommanderChange(name: string) {
      if (!result || name === result.selectedCommander) return;
      startSwitch(async () => {
        const next = await switchCollectionCommander(
          result.formatKey,
          result.deckName,
          result.collectionCards,
          name
        );
        if (next.ok) {
          setOverride(next);
          setPreviewName(null);
          setBeforePreview(null);
        }
      });
    }

    function handleDiscoverUnowned() {
      if (!result) return;
      setUnownedError(null);
      startDiscovering(async () => {
        const res = await suggestUnownedCommanders(result.formatKey, result.collectionCards);
        if (res.ok) {
          setUnownedSuggestions(res.suggestions);
        } else {
          // On garde la liste précédente affichée (si "Actualiser" échoue après
          // un premier succès) plutôt que de l'effacer — seule l'erreur est
          // affichée en plus, Ben peut réessayer avec le même bouton.
          setUnownedError(res.error);
        }
      });
    }

    function handlePreviewUnowned(name: string) {
      if (!result || name === previewingName) return;
      const snapshot = previewName ? beforePreview : result;
      setPreviewingName(name);
      startPreviewing(async () => {
        const next = await buildDeckWithUnownedCommander(
          result.formatKey,
          result.deckName,
          result.collectionCards,
          name
        );
        if (next.ok) {
          setBeforePreview(snapshot);
          setPreviewName(name);
          setOverride(next);
        }
        setPreviewingName(null);
      });
    }

    function handleBackToOwned() {
      setOverride(beforePreview);
      setPreviewName(null);
      setBeforePreview(null);
    }

    return (
      <div className="mb-10">
        <button
          type="button"
          onClick={() => {
            setLastMode(null);
            setOverride(null);
            setFileName(null);
            setUnownedSuggestions(null);
            setUnownedError(null);
            setPreviewName(null);
            setBeforePreview(null);
          }}
          className="mb-4 text-xs font-medium text-muted underline hover:text-foreground"
        >
          ← Importer une autre collection
        </button>

        {previewName && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent">
            <span>
              Aperçu avec <strong>{previewName}</strong> — un commandant que tu ne possèdes pas encore, construit
              avec le reste de ta collection.
            </span>
            <button
              type="button"
              onClick={handleBackToOwned}
              className="shrink-0 rounded-md border border-accent/40 px-2.5 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
            >
              ← Revenir à mon deck
            </button>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Deck depuis ta collection · {COLLECTION_FORMATS.find((f) => f.key === result.formatKey)?.label}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {result.commanderEntries[0]?.name ?? result.deckName}
            </h1>
          </div>

          {result.candidates.length > 1 && (
            <label className="flex flex-col gap-1 text-xs text-muted">
              Commandant ({result.candidates.length} candidat{result.candidates.length > 1 ? "s" : ""} détecté
              {result.candidates.length > 1 ? "s" : ""} dans ta collection)
              <select
                value={result.selectedCommander ?? ""}
                disabled={switching}
                onChange={(e) => handleCommanderChange(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground disabled:opacity-60"
              >
                {result.candidates.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} — score d&apos;essai {c.trialScore}/100
                  </option>
                ))}
              </select>
              {switching && (
                <span className="mt-0.5">
                  <LoadingIndicator label="Recalcul du deck en cours…" />
                </span>
              )}
            </label>
          )}
        </div>

        {result.unresolvedNames.length > 0 && (
          <p className="mb-6 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
            {result.unresolvedNames.length} carte{result.unresolvedNames.length > 1 ? "s" : ""} de ta liste n&apos;
            {result.unresolvedNames.length > 1 ? "ont" : "a"} pas été reconnue
            {result.unresolvedNames.length > 1 ? "s" : ""} par Scryfall (nom mal orthographié ?) et n&apos;
            {result.unresolvedNames.length > 1 ? "ont" : "a"} pas pu être prise
            {result.unresolvedNames.length > 1 ? "s" : ""} en compte : {result.unresolvedNames.join(", ")}.
          </p>
        )}

        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Commandants que tu ne possèdes pas encore</h2>
              <p className="mt-0.5 text-xs text-muted">
                Classés par le score du deck qu&apos;on pourrait te construire avec eux, en utilisant uniquement les
                cartes déjà présentes dans ta collection.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDiscoverUnowned}
              disabled={discovering}
              className="shrink-0 rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
            >
              {discovering
                ? "Recherche en cours…"
                : unownedSuggestions === null
                  ? "Découvrir des commandants"
                  : "Actualiser la liste"}
            </button>
          </div>

          {discovering && (
            <p className="mt-3">
              <LoadingIndicator label="Recherche des commandants les plus populaires du format, puis évaluation avec ta collection…" />
            </p>
          )}

          {!discovering && unownedError && <p className="mt-3 text-sm text-accent">{unownedError}</p>}

          {!discovering && unownedSuggestions !== null && unownedSuggestions.length > 0 && (
            <ul className="mt-3 divide-y divide-border">
              {unownedSuggestions.map((s) => (
                <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {s.name}{" "}
                    <span className="text-xs text-muted">
                      ({s.colorIdentity.join("") || "incolore"}) — score d&apos;essai {s.trialScore}/100
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePreviewUnowned(s.name)}
                    disabled={previewing}
                    className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
                  >
                    {previewingName === s.name ? "Construction…" : "Prévisualiser ce deck"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DeckBuilder
          key={`${deckSlug}:${result.cards.map((c) => c.name).join("|")}`}
          initial={result}
          deckSlug={deckSlug}
        />
      </div>
    );
  }

  return (
    <div className="mb-10 max-w-xl rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">Construire un deck avec ma collection</h2>
      <p className="mt-1 text-xs text-muted">
        Importe les cartes que tu possèdes (collé ou CSV) : on détecte le meilleur commandant
        possible dans ta collection, on complète avec des terrains de base si besoin, puis on te
        montre le score du deck et ce qu&apos;il te manque pour l&apos;améliorer.
      </p>

      <div className="mt-4 flex items-center gap-4 text-xs">
        <label className="flex items-center gap-2">
          <span className="text-muted">Format :</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "commander" | "duelcommander")}
            className="rounded-lg border border-border bg-surface-muted px-2 py-1.5 text-foreground"
          >
            {COLLECTION_FORMATS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-1 rounded-lg border border-border bg-surface-muted p-0.5">
          <button
            type="button"
            onClick={() => setMode("text")}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              mode === "text" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Coller une liste
          </button>
          <button
            type="button"
            onClick={() => setMode("csv")}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              mode === "csv" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Importer un CSV
          </button>
        </div>
      </div>

      {mode === "text" ? (
        <form
          action={textAction}
          onSubmit={() => {
            setLastMode("text");
            setOverride(null);
          }}
          className="mt-4 space-y-3"
        >
          <input type="hidden" name="format" value={format} />
          <textarea
            name="collection"
            required
            rows={10}
            placeholder={"4 Sol Ring\n1 Arcane Signet\nAtraxa, Grand Unifier\n2x Swords to Plowshares\n…"}
            className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="text-xs text-muted">
            Une carte par ligne : &quot;4 Sol Ring&quot;, &quot;Sol Ring x4&quot; ou juste
            &quot;Sol Ring&quot; (1 exemplaire).
          </p>
          <button
            type="submit"
            disabled={textPending}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {textPending ? "Analyse en cours…" : "Construire mon deck"}
          </button>
        </form>
      ) : (
        <form
          action={csvAction}
          onSubmit={() => {
            setLastMode("csv");
            setOverride(null);
          }}
          className="mt-4 space-y-3"
        >
          <input type="hidden" name="format" value={format} />
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:opacity-90"
            >
              Choisir un fichier
            </button>
            <span className="truncate text-sm text-muted">{fileName ?? "Aucun fichier choisi"}</span>
            <input
              ref={fileInputRef}
              type="file"
              name="csv"
              accept=".csv,text/csv"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="sr-only"
            />
          </div>
          <p className="text-xs text-muted">
            Colonnes reconnues : &quot;Nom&quot; (obligatoire) et &quot;Nombre&quot; (optionnel, 1
            exemplaire par défaut).
          </p>
          <button
            type="submit"
            disabled={csvPending}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {csvPending ? "Analyse en cours…" : "Construire mon deck"}
          </button>
        </form>
      )}

      {activeError && (
        <p className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{activeError}</p>
      )}
    </div>
  );
}

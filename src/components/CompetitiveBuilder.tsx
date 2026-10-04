"use client";

import { useRef, useState, useTransition } from "react";
import { openProposedDeck, runCompetitiveBuild } from "@/lib/competitive-actions";
import type { AcquisitionOption, CompetitiveBuildResult, NearTournamentDeck, ProposalSummary } from "@/lib/competitive-run";
import type { BuildProgress } from "@/lib/build-steps";
import { MAX_BUDGET_EUR, normalizeBudget } from "@/lib/budget";
import { BuildProgressPanel, GamePlanPanel, MissingStaplesPanel, RankingPanel } from "./BuildPanels";
import type { DeckAnalysisResult } from "@/lib/actions";
import { parseCollectionCsv, parseCollectionText } from "@/lib/collection-import";
import type { PowerTierLevel } from "@/lib/deck-tier";
import { DeckBuilder, SIMULATOR_LIST_KEY } from "./DeckBuilder";
import { ManaCost } from "./ManaCost";
import { CardImageHover } from "./CardImageHover";

/**
 * Constructeur de decks compétitif (25/09/2026, demande de Ben — voir
 * competitive-builder.ts pour le moteur et competitive-actions.ts pour le
 * parcours serveur). Remplace l'ancien CollectionImportForm.tsx.
 *
 * Parcours en 3 temps, pensé pour aller vite :
 * 1. Formulaire : liste (collée ou CSV) → format (Multi / Duel, avec ce que
 *    ça change) → nombre de cartes hors liste autorisées.
 * 2. Résultats : les decks proposés, classés par tier, chacun avec son
 *    tier « avec tes cartes » et son tier « optimisé », une barre qui
 *    matérialise le seuil du Tier 4, et le coût estimé des acquisitions.
 *    Le meilleur deck s'ouvre automatiquement dans le simulateur.
 * 3. Détail + simulateur : bascule « mes cartes / optimisé », chemin vers
 *    le Tier 4, pool recommandé, puis le DeckBuilder habituel (score,
 *    suggestions, swaps, Super Opti, export).
 *
 * Aucun `useEffect` qui pose un état : l'ouverture automatique du premier
 * deck est enchaînée dans la même transition que la construction (voir
 * `launch`), conforme à la règle react-hooks/set-state-in-effect du projet.
 */

type FormatKey = "commander" | "duelcommander";
type Variant = "owned" | "upgraded";

const LAST_LIST_KEY = "mtg-opti:derniere-liste";

const TIER_CLASS: Record<PowerTierLevel, string> = {
  1: "bg-surface-muted text-muted",
  2: "bg-success-soft text-success",
  3: "bg-accent-soft text-accent",
  4: "bg-warning-soft text-warning",
  5: "bg-synergy-soft text-synergy",
};

const FORMAT_CHOICES: { key: FormatKey; title: string; subtitle: string; points: string[] }[] = [
  {
    key: "commander",
    title: "Commander multi",
    subtitle: "3 à 4 joueurs · 40 points de vie",
    points: [
      "Parties longues : moteurs de pioche et de valeur",
      "Board wipes utiles face à plusieurs adversaires",
      "Courbe repère ≈ 2,9",
    ],
  },
  {
    key: "duelcommander",
    title: "Duel Commander",
    subtitle: "1 contre 1 · 20 points de vie",
    points: [
      "Parties courtes : explosivité et tempo",
      "Interaction à 1-2 manas favorisée, 5+ manas pénalisés",
      "Bonus aux cartes jouées en tournoi (mtgtop8)",
    ],
  },
];

const ACQ_OPTIONS: { value: AcquisitionOption; label: string }[] = [
  { value: 0, label: "Aucune" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 15, label: "15" },
  { value: 25, label: "25" },
];

/**
 * Lance la construction par la route de flux et lit les étapes au fil de
 * l'eau (03/10/2026 — voir src/app/api/competitive-build/route.ts). Une ligne
 * = un message JSON. Lève une erreur si le flux ne s'établit pas ou se
 * termine sans résultat : l'appelant se replie alors sur la Server Action.
 */
async function buildWithProgress(
  input: { formatKey: FormatKey; collectionCards: { name: string; count: number }[]; maxAcquisitions: AcquisitionOption; budgetEur: number | null },
  onProgress: (p: BuildProgress) => void
): Promise<CompetitiveBuildResult> {
  const res = await fetch("/api/competitive-build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok || !res.body) throw new Error(`flux indisponible (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: CompetitiveBuildResult | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line) as ({ type: "progress" } & BuildProgress) | { type: "result"; result: CompetitiveBuildResult } | { type: "error"; message: string };
    if (msg.type === "progress") onProgress(msg);
    else if (msg.type === "result") result = msg.result;
    else throw new Error(msg.message);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
    }
    if (done) break;
  }
  handle(buffer);
  if (!result) throw new Error("flux terminé sans résultat");
  return result;
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-accent" role="status" aria-live="polite">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label}
    </span>
  );
}

function identityCost(identity: string[]): string {
  return identity.length ? identity.map((c) => `{${c}}`).join("") : "{C}";
}

function formatEur(n: number): string {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: n >= 100 ? 0 : 2 });
}

/** Barre d'indice 0-100 : plein = avec tes cartes, clair = gain potentiel, trait = seuil du Tier 4. */
function TierBar({ owned, potential, compact = false }: { owned: number; potential: number; compact?: boolean }) {
  return (
    <div className={`relative w-full rounded-full bg-surface-muted ${compact ? "h-1.5" : "h-2.5"}`} aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-full bg-accent/30" style={{ width: `${Math.max(owned, potential)}%` }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${owned}%` }} />
      <div className="absolute -inset-y-1 w-0.5 bg-warning" style={{ left: "60%" }} title="Seuil du Tier 4 (indice 60)" />
    </div>
  );
}

function TierBadge({ tier, label }: { tier: PowerTierLevel; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_CLASS[tier]}`}>{label}</span>;
}

/** Le deck « optimisé » peut-il contenir des cartes hors liste pour ce résultat ? */
function canBuy(res: CompetitiveBuildResult): boolean {
  return res.budgetEur !== null ? res.budgetEur > 0 : res.maxAcquisitions > 0;
}

/** Clé d'un deck ouvert : change avec la limite d'achats (nombre de cartes ou budget). */
function limitKey(res: CompetitiveBuildResult): string {
  return res.budgetEur !== null ? `b${res.budgetEur}` : `n${res.maxAcquisitions}`;
}

/**
 * Relance avec un autre budget depuis l'écran des résultats (04/10/2026).
 * Champ texte plutôt que curseur : Ben saisit un montant précis.
 */
function BudgetRelaunch({ current, disabled, onRelaunch }: { current: number; disabled: boolean; onRelaunch: (budget: number) => void }) {
  const [value, setValue] = useState(String(current));
  const parsed = normalizeBudget(value);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed !== null) onRelaunch(parsed);
      }}
    >
      <label className="flex items-center gap-1">
        <span className="text-muted">Budget</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          aria-label="Budget en euros"
          className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right disabled:opacity-60"
        />
        <span className="text-muted">€</span>
      </label>
      <button
        type="submit"
        disabled={disabled || parsed === null || parsed === current}
        className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
      >
        Relancer
      </button>
    </form>
  );
}

function allOwned(p: ProposalSummary): boolean {
  return p.commanders.every((c) => c.owned);
}

function sourceLabel(p: ProposalSummary): string {
  if (allOwned(p)) return p.commanders.length > 1 ? "Duo dans ta liste" : "Dans ta liste";
  const missing = p.commanders.filter((c) => !c.owned);
  const price = missing.reduce((s, c) => s + (c.priceEur ?? 0), 0);
  const who = p.commanders.length > 1 ? `${missing.map((c) => c.name.split(",")[0]).join(" et ")} à acquérir` : "Commandant à acquérir";
  return `${who}${price > 0 ? ` · ≈ ${formatEur(price)}` : ""}`;
}


/**
 * Message affiché quand une Server Action du constructeur échoue sans
 * réponse exploitable (26/09/2026, signalement de Ben : écran Next.js
 * « This page couldn't load » en lançant une liste ou un CSV). Une action
 * qui rejette dans un startTransition remonte jusqu'à la frontière d'erreur
 * et remplace TOUTE la page ; on la rattrape pour garder la liste saisie et
 * afficher un message dans la page. Cause la plus probable : durée max de
 * la fonction dépassée côté Vercel (voir maxDuration dans
 * app/collection/page.tsx), ou coupure réseau.
 */
function serverActionErrorMessage(step: "build" | "open", err: unknown): string {
  console.error(`[constructeur] échec de l'action (${step})`, err);
  return step === "build"
    ? "La construction n'a pas abouti : le serveur n'a pas répondu à temps ou la connexion a été coupée. Ta liste est conservée — relance dans une minute (si Scryfall limite le site, attendre un peu aide). Si ça se répète avec la même liste, dis-le moi avec l'heure de l'essai."
    : "L'ouverture de ce deck a échoué (serveur trop lent ou connexion coupée). Les propositions restent affichées : clique à nouveau sur le deck pour réessayer.";
}

export function CompetitiveBuilder({ fromSimulator = false }: { fromSimulator?: boolean } = {}) {
  const [inputMode, setInputMode] = useState<"text" | "csv">("text");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<FormatKey>("commander");
  const [maxAcq, setMaxAcq] = useState<AcquisitionOption>(15);
  // Limite des achats en Duel (04/10/2026) : un nombre de cartes, ou un budget strict en euros.
  const [limitMode, setLimitMode] = useState<"cards" | "budget">("budget");
  const [budgetText, setBudgetText] = useState("30");
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [result, setResult] = useState<CompetitiveBuildResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [variant, setVariant] = useState<Variant>("upgraded");
  const [opened, setOpened] = useState<(DeckAnalysisResult & { addedNames: string[] }) | null>(null);
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  // Deck de tournoi ouvert dans le simulateur à la place d'une proposition (04/10/2026) : son libellé, sinon null.
  const [tournamentOpen, setTournamentOpen] = useState<string | null>(null);

  const [building, startBuilding] = useTransition();
  const [opening, startOpening] = useTransition();
  // Progression en direct (03/10/2026) : dernier message du serveur, heure de
  // départ, et `live` = le flux d'étapes fonctionne-t-il pour cet essai.
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [live, setLive] = useState(true);
  const runId = useRef(0);

  async function openDeck(res: CompetitiveBuildResult, index: number, v: Variant) {
    const p = res.proposals[index];
    if (!p) return;
    const deck = v === "upgraded" ? p.upgraded : p.owned;
    const acquisitionNames = v === "upgraded" ? p.acquisitions.map((a) => a.name) : [];
    const opened = await openProposedDeck({
      formatKey: res.formatKey,
      commanders: p.commanders.map((c) => c.name),
      cards: deck.cards,
      acquisitionNames,
      label: `${p.commander} — ${v === "upgraded" ? "optimisé" : "avec mes cartes"}`,
      planHint: deck.planHint,
    });
    setOpened(opened);
    setOpenedKey(`${res.formatKey}:${p.commander}:${v}:${limitKey(res)}`);
  }

  /** `budget` : budget en euros (Duel uniquement) ; null = limite en nombre de cartes (`acq`). */
  function launch(cards: { name: string; count: number }[], fmt: FormatKey, acq: AcquisitionOption, budget: number | null) {
    setFormError(null);
    setProgress(null);
    setLive(true);
    setStartedAt(Date.now());
    // Un message d'un essai précédent (relance pendant un calcul) ne doit pas écraser l'affichage du nouveau.
    const id = ++runId.current;
    startBuilding(async () => {
      let res: CompetitiveBuildResult;
      const input = { formatKey: fmt, collectionCards: cards, maxAcquisitions: acq, budgetEur: fmt === "duelcommander" ? budget : null };
      try {
        res = await buildWithProgress(input, (p) => {
          if (runId.current === id) setProgress(p);
        });
      } catch (streamErr) {
        // Flux d'étapes indisponible : même calcul par la Server Action, sans le détail des étapes.
        console.warn("[constructeur] flux d'étapes indisponible, repli sur la Server Action", streamErr);
        setLive(false);
        try {
          res = await runCompetitiveBuild(input);
        } catch (err) {
          setStartedAt(null);
          setFormError(serverActionErrorMessage("build", err));
          return;
        }
      }
      setStartedAt(null);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      try {
        localStorage.setItem(LAST_LIST_KEY, JSON.stringify(cards));
      } catch {
        // Stockage indisponible (navigation privée...) : simple confort, on ignore.
      }
      const v: Variant = canBuy(res) ? "upgraded" : "owned";
      setResult(res);
      setSelected(0);
      setVariant(v);
      setOpened(null);
      setOpenedKey(null);
      setTournamentOpen(null);
      if (res.proposals.length > 0) {
        try {
          await openDeck(res, 0, v);
        } catch (err) {
          setFormError(serverActionErrorMessage("open", err));
        }
      }
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let parsed;
    if (inputMode === "csv") {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setFormError("Choisis un fichier CSV à importer.");
        return;
      }
      parsed = parseCollectionCsv(await file.text());
    } else {
      parsed = parseCollectionText(text);
    }
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    let budget: number | null = null;
    if (format === "duelcommander" && limitMode === "budget") {
      budget = normalizeBudget(budgetText);
      if (budget === null) {
        setFormError("Budget illisible : saisis un montant en euros (par exemple 30 ou 12,50).");
        return;
      }
    }
    launch(parsed.cards, format, maxAcq, budget);
  }

  /** Reprend la liste envoyée depuis le simulateur d'un deck (voir DeckBuilder.sendToBuilder). */
  function restoreSimulatorList() {
    try {
      const raw = localStorage.getItem(SIMULATOR_LIST_KEY);
      const cards = raw ? (JSON.parse(raw) as { name: string; count: number }[]) : null;
      if (!cards?.length) {
        setInfo("La liste du simulateur n'a pas été trouvée sur ce navigateur : colle-la ci-dessous.");
        return;
      }
      setInputMode("text");
      setText(cards.map((c) => `${c.count} ${c.name}`).join("\n"));
      setInfo(`Liste du simulateur reprise : ${cards.length} cartes. Choisis le format, puis lance la recherche.`);
    } catch {
      setInfo("Impossible de lire la liste du simulateur sur ce navigateur.");
    }
  }

  function restoreLastList() {
    try {
      const raw = localStorage.getItem(LAST_LIST_KEY);
      const cards = raw ? (JSON.parse(raw) as { name: string; count: number }[]) : null;
      if (!cards?.length) {
        setInfo("Aucune liste enregistrée sur ce navigateur pour l'instant.");
        return;
      }
      setInputMode("text");
      setText(cards.map((c) => `${c.count} ${c.name}`).join("\n"));
      setInfo(`Dernière liste reprise : ${cards.length} cartes.`);
    } catch {
      setInfo("Impossible de lire la liste enregistrée sur ce navigateur.");
    }
  }

  /** Ouvre dans le simulateur un deck de tournoi presque complet dans la collection (liste réelle, non construite par le moteur). */
  function openTournament(near: NearTournamentDeck) {
    if (!result) return;
    setFormError(null);
    const label = `${near.commander} — deck de tournoi${near.date ? ` du ${near.date}` : ""}`;
    startOpening(async () => {
      try {
        const deck = await openProposedDeck({
          formatKey: result.formatKey,
          commanders: near.commanders.map((c) => c.name),
          cards: near.cards,
          acquisitionNames: near.missing.map((m) => m.name),
          label,
        });
        setOpened(deck);
        setOpenedKey(`tournoi:${near.url}`);
        setTournamentOpen(label);
      } catch (err) {
        setFormError(serverActionErrorMessage("open", err));
      }
    });
  }

  function select(index: number, v: Variant) {
    if (!result) return;
    setTournamentOpen(null);
    setSelected(index);
    setVariant(v);
    setFormError(null);
    startOpening(async () => {
      try {
        await openDeck(result, index, v);
      } catch (err) {
        setFormError(serverActionErrorMessage("open", err));
      }
    });
  }

  // ---------- Formulaire ----------
  if (!result) {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        {fromSimulator && !text && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
            <span className="min-w-0 text-accent">La liste du deck que tu analysais est prête à être utilisée.</span>
            <button
              type="button"
              onClick={restoreSimulatorList}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90"
            >
              Utiliser cette liste
            </button>
          </div>
        )}
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground">1</span>
              Ta liste de cartes
            </h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={restoreLastList} className="text-xs text-muted underline hover:text-foreground">
                Reprendre ma dernière liste
              </button>
              <div className="flex gap-1 rounded-lg border border-border bg-surface-muted p-0.5 text-xs">
                {(["text", "csv"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setInputMode(m)}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${inputMode === m ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"}`}
                  >
                    {m === "text" ? "Coller une liste" : "Fichier CSV"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {inputMode === "text" ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder={"1 Sol Ring\n1 Rhystic Study\nKinnan, Bonder Prodigy\n2x Swords to Plowshares\n…"}
                className="mt-3 w-full rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-xs text-muted">
                Une carte par ligne : « 4 Sol Ring », « Sol Ring x4 » ou « Sol Ring ». Le commandant peut être dans la liste… ou pas.
              </p>
            </>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90"
              >
                Choisir un fichier
              </button>
              <span className="truncate text-sm text-muted">{fileName ?? "Aucun fichier choisi — colonnes « Nom » et « Nombre »"}</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                className="sr-only"
              />
            </div>
          )}
          {/*
            26/09/2026, demande de Ben : fichier exemple téléchargeable pour
            vérifier le format. Statique (public/exemples/), vérifié contre
            parseCollectionCsv (collection-import.ts) : colonne "Nom"
            obligatoire, "Nombre" optionnelle (1 par défaut), autres colonnes
            ignorées, séparateur virgule/point-virgule/tabulation. À garder synchronisé avec le parseur.
          */}
          {inputMode === "csv" && (
            <p className="mt-1 text-xs text-muted">
              Colonne « Nom » obligatoire, « Nombre » facultative (1 par défaut), séparateur virgule ou point-virgule ; les autres colonnes sont ignorées.{" "}
              <a
                href="/exemples/exemple-collection.csv"
                download="exemple-collection.csv"
                className="font-medium text-accent underline hover:opacity-80"
              >
                Télécharger un CSV exemple
              </a>
            </p>
          )}
          {info && <p className="mt-2 text-xs text-accent">{info}</p>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground">2</span>
            Format
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Format">
            {FORMAT_CHOICES.map((f) => (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={format === f.key}
                onClick={() => setFormat(f.key)}
                className={`rounded-xl border p-4 text-left transition-colors ${format === f.key ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-border hover:border-accent/50"}`}
              >
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-xs text-muted">{f.subtitle}</p>
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {f.points.map((pt) => (
                    <li key={pt}>· {pt}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground">3</span>
            Cartes recommandées hors de ta liste
          </h2>
          {format === "duelcommander" && (
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type de limite">
              {(
                [
                  ["budget", "Budget en euros"],
                  ["cards", "Nombre de cartes"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={limitMode === key}
                  onClick={() => setLimitMode(key)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${limitMode === key ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {format === "duelcommander" && limitMode === "budget" ? (
            <>
              <p className="mt-3 text-xs text-muted">
                Budget maximal par deck, commandant à acquérir compris. Le site cherche les achats qui apportent le plus
                sans jamais dépasser ce montant, puis te montre ce que quelques euros de plus apporteraient. Tu verras
                toujours aussi la version « avec mes cartes uniquement ». 0 = mes cartes seulement.
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="text"
                  inputMode="decimal"
                  value={budgetText}
                  onChange={(e) => setBudgetText(e.target.value)}
                  aria-label="Budget en euros"
                  className="w-28 rounded-lg border border-border bg-surface px-3 py-1.5 text-right text-sm"
                />
                <span>€</span>
                <span className="text-xs text-muted">(jusqu&apos;à {MAX_BUDGET_EUR} €)</span>
              </label>
              <p className="mt-2 text-[11px] text-muted">
                Prix Scryfall en euros, indicatifs : celui de l&apos;impression renvoyée (une autre peut coûter moins), sans
                frais de port. Une carte sans prix connu n&apos;est jamais proposée à l&apos;achat.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                Nombre maximum de cartes à acquérir que le système peut ajouter pour rapprocher chaque deck du Tier 4 (Game
                Changers, mana rapide, tutors, pièces de combo, cartes en synergie). Tu verras toujours aussi la version
                « avec mes cartes uniquement ».
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ACQ_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setMaxAcq(o.value)}
                    aria-pressed={maxAcq === o.value}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${maxAcq === o.value ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted hover:text-foreground"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="space-y-3">
          <button
            type="submit"
            disabled={building}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {building ? "Construction en cours…" : "Trouver mes decks les plus compétitifs"}
          </button>
          {building && <BuildProgressPanel progress={progress} startedAt={startedAt} live={live} />}
          {formError && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{formError}</p>}
        </div>
      </form>
    );
  }

  // ---------- Résultats ----------
  const p = result.proposals[selected];
  const formatLabel = FORMAT_CHOICES.find((f) => f.key === result.formatKey)?.title ?? "";
  const otherFormat: FormatKey = result.formatKey === "commander" ? "duelcommander" : "commander";
  const currentKey = p ? `${result.formatKey}:${p.commander}:${variant}:${limitKey(result)}` : null;
  const budgetMode = result.budgetEur !== null;
  const shownDeck = p ? (variant === "upgraded" ? p.upgraded : p.owned) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setOpened(null);
          }}
          className="text-xs font-medium text-muted underline hover:text-foreground"
        >
          ← Modifier ma liste
        </button>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">
            {formatLabel} · {budgetMode ? `budget ${formatEur(result.budgetEur ?? 0)} par deck` : `jusqu'à ${result.maxAcquisitions} cartes hors liste`}
          </span>
          <button
            type="button"
            disabled={building}
            onClick={() => launch(result.collectionCards, otherFormat, result.maxAcquisitions, null)}
            className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
          >
            Relancer en {otherFormat === "duelcommander" ? "Duel" : "Multi"}
          </button>
          {budgetMode ? (
            <BudgetRelaunch
              key={result.budgetEur}
              current={result.budgetEur ?? 0}
              disabled={building}
              onRelaunch={(b) => launch(result.collectionCards, result.formatKey, result.maxAcquisitions, b)}
            />
          ) : (
            <select
              value={result.maxAcquisitions}
              disabled={building}
              onChange={(e) => launch(result.collectionCards, result.formatKey, Number(e.target.value) as AcquisitionOption, null)}
              className="rounded-md border border-border bg-surface px-2 py-1 disabled:opacity-60"
              aria-label="Cartes hors liste"
            >
              {ACQ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value === 0 ? "Mes cartes uniquement" : `Jusqu'à ${o.value} cartes hors liste`}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {building && startedAt !== null && <BuildProgressPanel progress={progress} startedAt={startedAt} live={live} />}
      {formError && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{formError}</p>}

      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {result.proposals.length} deck{result.proposals.length > 1 ? "s" : ""} proposé{result.proposals.length > 1 ? "s" : ""}, classés par{" "}
          {result.formatKey === "duelcommander" ? "solidité du deck et valeur du commandant" : "tier"} dans chaque groupe
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {result.candidateCount} commandants considérés, {result.evaluatedCount} évalués avec un deck complet. Barre
          pleine : avec tes cartes · barre claire : avec les cartes recommandées · trait orange : seuil du Tier 4.
        </p>
        {result.corrections.length > 0 && (
          <details className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
            <summary className="cursor-pointer">
              {result.corrections.length} nom{result.corrections.length > 1 ? "s" : ""} corrigé
              {result.corrections.length > 1 ? "s" : ""} automatiquement — vérifie que c&apos;est bien la bonne carte
            </summary>
            <ul className="mt-1 space-y-0.5">
              {result.corrections.map((c) => (
                <li key={c.input}>
                  « {c.input} » → <strong>{c.resolved}</strong> <span className="opacity-70">({c.method})</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {result.unresolvedNames.length > 0 && (
          <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            Non reconnues par Scryfall (ignorées) : {result.unresolvedNames.join(", ")}.
          </p>
        )}
      </div>

      {result.nearTournamentDecks.length > 0 && (
        <section className="rounded-xl border border-accent/40 bg-accent-soft/30 p-4" data-testid="near-tournament-decks">
          <h3 className="text-sm font-semibold">Decks de tournoi presque complets dans ta liste</h3>
          <p className="mt-0.5 text-xs text-muted">
            Ta liste comparée carte par carte aux decks de tournoi Duel de l&apos;archive mtgtop8 (hors terrains de base,
            commandant non compté). Ce sont des listes réelles, telles qu&apos;elles ont été jouées — à distinguer des decks
            que le moteur construit plus bas. Prix Scryfall (EUR, indicatifs).
          </p>
          <ul className="mt-3 space-y-3">
            {result.nearTournamentDecks.map((n) => {
              const toBuy = n.commanders.filter((c) => !c.owned);
              return (
                <li key={n.url} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[240px] flex-1">
                      <p className="text-sm font-semibold">
                        {n.commander}{" "}
                        <span className="ml-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                          {n.ownedCount}/{n.total} cartes · {Math.round(n.share * 100)} %
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Deck de tournoi{n.date ? ` du ${n.date}` : ""} ·{" "}
                        <a href={n.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                          voir la liste sur mtgtop8
                        </a>{" "}
                        ·{" "}
                        {toBuy.length === 0
                          ? "commandant dans ta liste"
                          : `commandant à acquérir${toBuy.every((c) => c.priceEur !== null) ? ` (≈ ${formatEur(toBuy.reduce((s, c) => s + (c.priceEur ?? 0), 0))})` : " (prix inconnu)"}`}
                      </p>
                      <p className="mt-1 text-xs">
                        Il manque {n.missing.length} carte{n.missing.length > 1 ? "s" : ""} : ≈ {formatEur(n.totalCostEur)}
                        {toBuy.length > 0 ? " commandant compris" : ""}
                        {n.missingUnpriced > 0 ? ` (+${n.missingUnpriced} sans prix connu)` : ""}
                        {n.withinBudget === true && <span className="ml-1 font-medium text-success">— tient dans ton budget</span>}
                        {n.withinBudget === false && result.budgetEur !== null && (
                          <span className="ml-1 font-medium text-warning">
                            — dépasse ton budget de {formatEur(n.totalCostEur - result.budgetEur)}
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={opening || building}
                      onClick={() => openTournament(n)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
                    >
                      Ouvrir ce deck
                    </button>
                  </div>
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted hover:text-foreground">Cartes manquantes ({n.missing.length})</summary>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {[...n.missing]
                        .sort((a, b) => (b.priceEur ?? -1) - (a.priceEur ?? -1))
                        .map((m) => (
                          <li key={m.name} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-muted">
                            {m.name} · {m.priceEur !== null ? formatEur(m.priceEur) : "prix inconnu"}
                          </li>
                        ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/*
        Deux groupes (26/09/2026, demande de Ben) : commandants déjà dans sa
        liste d'un côté, commandants à acquérir de l'autre, chacun classé
        par tier. `i` reste l'index global dans result.proposals.
      */}
      {[
        {
          key: "owned",
          title: "Avec un commandant de ta liste",
          hint: "Tu as déjà le commandant : le deck « Avec mes cartes » est jouable tout de suite.",
          items: result.proposals.map((prop, i) => ({ prop, i })).filter(({ prop }) => allOwned(prop)),
          empty: "Aucun commandant jouable (3 couleurs max) dans ta liste.",
        },
        {
          key: "other",
          title: "Avec un commandant à acquérir",
          hint: "Commandant hors de ta liste, choisi pour tirer le meilleur de tes cartes.",
          items: result.proposals.map((prop, i) => ({ prop, i })).filter(({ prop }) => !allOwned(prop)),
          empty: "Aucun commandant hors liste ne fait mieux pour l'instant.",
        },
      ].map((group) => (
        <div key={group.key} className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">
              {group.title} <span className="font-normal text-muted">({group.items.length})</span>
            </h3>
            <p className="text-xs text-muted">{group.items.length ? group.hint : group.empty}</p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {group.items.map(({ prop, i }, rank) => (
          <li key={prop.commander} className="min-w-0">
            <button
              type="button"
              onClick={() => select(i, variant)}
              aria-pressed={i === selected}
              className={`flex h-full w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors ${i === selected ? "border-accent bg-accent-soft/40 ring-1 ring-accent" : "border-border bg-surface hover:border-accent/50"}`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-xs font-semibold text-muted">#{rank + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" title={prop.commander}>
                    {prop.commander}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <ManaCost cost={identityCost(prop.colorIdentity)} />
                    <span className={`text-[11px] ${allOwned(prop) ? "text-success" : "text-warning"}`}>{sourceLabel(prop)}</span>
                    {prop.pairLabel && (
                      <span className="rounded-full bg-synergy-soft px-1.5 text-[10px] font-medium text-synergy">{prop.pairLabel}</span>
                    )}
                    {prop.offMeta && (
                      <span
                        className="rounded-full bg-synergy-soft px-1.5 text-[10px] font-medium text-synergy"
                        title="Commandant absent des decks de tournoi connus (Duel) ou peu joué (multi) : une piste originale."
                      >
                        Hors méta
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <TierBadge tier={prop.owned.tier.tier} label={prop.owned.tier.label} />
                {prop.upgraded.tier.powerIndex > prop.owned.tier.powerIndex && (
                  <span className="text-[11px] text-muted">→ {prop.upgraded.tier.label}</span>
                )}
              </div>
              <TierBar owned={prop.owned.tier.powerIndex} potential={prop.upgraded.tier.powerIndex} compact />
              <p className="text-[11px] text-muted">
                Indice {prop.owned.tier.powerIndex}
                {prop.upgraded.tier.powerIndex !== prop.owned.tier.powerIndex ? ` → ${prop.upgraded.tier.powerIndex}` : ""}/100 · score{" "}
                {prop.owned.score}/100
                {prop.owned.tier.signals.combos.length > 0 ? ` · ${prop.owned.tier.signals.combos.length} combo` : ""}
              </p>
              {prop.ranking && (
                <p className="text-[11px]" title="Score de classement : solidité du deck avec tes cartes (qualité des cartes, forme, cohérence, parties simulées, tier) + valeur du commandant en Duel.">
                  <span className="font-semibold">Classement {prop.ranking.score}</span>
                  <span className="text-muted">
                    {" "}
                    · solidité {prop.owned.solidity?.score ?? "—"} ·{" "}
                    {prop.ranking.commander.tournamentDecks > 0
                      ? `commandant vu dans ${prop.ranking.commander.tournamentDecks} deck${prop.ranking.commander.tournamentDecks > 1 ? "s" : ""} de tournoi`
                      : "commandant jamais vu en tournoi"}
                  </span>
                </p>
              )}
              {prop.owned.reading && <p className="text-[11px] text-muted">{prop.owned.reading.line.style}{prop.owned.reading.line.axes.length ? ` · ${prop.owned.reading.line.axes.map((a) => a.label).join(" + ")}` : ""}</p>}
              {!prop.ranking && prop.owned.gamePlan && (
                <p className="text-[11px] text-muted" title="Indices du deck « avec mes cartes » : parties simulées en solitaire et densité de synergies.">
                  Parties simulées {prop.owned.gamePlan.playtest.score} · synergies {prop.owned.gamePlan.synergyIndex} · {prop.owned.gamePlan.archetype}
                </p>
              )}
            </button>
          </li>
        ))}
          </ol>
        </div>
      ))}

      {p && shownDeck && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap gap-5">
            <div className="flex shrink-0 gap-2">
              {p.commanders.map((c) =>
                c.imageUrl ? (
                  <CardImageHover
                    key={c.name}
                    src={c.imageUrl}
                    zoomSrc={c.imageUrl}
                    alt={c.name}
                    width={p.commanders.length > 1 ? 110 : 150}
                    className="shadow-md"
                  />
                ) : null
              )}
            </div>
            <div className="min-w-[260px] flex-1 space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {allOwned(p) ? "Commandant de ta liste" : "Commandant à acquérir"} #
                  {result.proposals.slice(0, selected + 1).filter((x) => allOwned(x) === allOwned(p)).length} · {formatLabel}
                </p>
                <h2 className="text-xl font-semibold tracking-tight">{p.commander}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <ManaCost cost={identityCost(p.colorIdentity)} size="md" />
                  <span className={allOwned(p) ? "text-success" : "text-warning"}>{sourceLabel(p)}</span>
                  {p.tournamentMatch && (
                    <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                      Tu as {p.tournamentMatch.ownedCount}/{p.tournamentMatch.total} cartes d&apos;un deck de tournoi de ce commandant
                    </span>
                  )}
                  {p.pairLabel && <span className="rounded-full bg-synergy-soft px-2 py-0.5 text-synergy">Duo · {p.pairLabel}</span>}
                  {[...p.themes, ...p.tribes.map((t) => `Tribu ${t}`)].map((t) => (
                    <span key={t} className="rounded-full bg-synergy-soft px-2 py-0.5 text-synergy">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Version du deck">
                {(["owned", "upgraded"] as const).map((v) => {
                  const d = v === "owned" ? p.owned : p.upgraded;
                  const disabled = v === "upgraded" && !canBuy(result);
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={variant === v}
                      disabled={disabled || opening}
                      onClick={() => select(selected, v)}
                      className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${variant === v ? "border-accent bg-accent-soft/50 ring-1 ring-accent" : "border-border hover:border-accent/50"}`}
                    >
                      <p className="text-xs font-semibold">{v === "owned" ? "Avec mes cartes" : "Optimisé"}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <TierBadge tier={d.tier.tier} label={d.tier.label} />
                        <span className="text-xs text-muted">indice {d.tier.powerIndex} · score {d.score}</span>
                      </div>
                      {!(v === "upgraded" && disabled) && (
                        <p className="mt-1 text-[11px] text-foreground/80">
                          {d.landCount} terrains (dont {d.basicCount} de base) · {d.deckSize - d.landCount} sorts
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted">
                        {v === "owned"
                          ? `${d.ownedCount}/${d.deckSize} cartes de ta liste (les terrains de base sont ajoutés d'office)`
                          : disabled
                            ? "Désactivé (aucune carte hors liste autorisée)"
                            : p.acquisitions.length === 0
                              ? p.budget
                                ? `Aucun achat sous ${formatEur(p.budget.budgetEur)} ne rend ce deck plus solide que tes cartes${p.budget.commanderCostEur > 0 ? ` (commandant : ${formatEur(p.budget.commanderCostEur)})` : ""}`
                                : "Aucune carte du pool recommandé ne fait mieux que tes cartes pour ce commandant"
                              : p.budget
                                ? `+${p.acquisitions.length} carte${p.acquisitions.length > 1 ? "s" : ""} à acquérir · ${formatEur(p.budget.cardsCostEur + p.budget.commanderCostEur)} sur ${formatEur(p.budget.budgetEur)} de budget${p.budget.commanderCostEur > 0 ? ` (dont commandant ${formatEur(p.budget.commanderCostEur)})` : ""}`
                                : `+${p.acquisitions.length} carte${p.acquisitions.length > 1 ? "s" : ""} à acquérir · ≈ ${formatEur(p.acquisitionCostEur)}${p.acquisitionPriceUnknown ? ` (+${p.acquisitionPriceUnknown} sans prix)` : ""}`}
                      </p>
                    </button>
                  );
                })}
              </div>

              <TierBar owned={p.owned.tier.powerIndex} potential={p.upgraded.tier.powerIndex} />
              {shownDeck.tier.spellbook && (
                <p className="text-xs text-muted">
                  2e avis Commander Spellbook pour cette version :{" "}
                  <strong className="text-foreground">{shownDeck.tier.spellbook.label}</strong> (leur estimation, calculée
                  par leur propre méthode ; la correspondance avec les brackets est approximative).
                </p>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Chemin vers le Tier 4</h3>
                  <ul className="mt-1 space-y-1 text-xs text-muted">
                    {p.pathToTier4.map((t) => (
                      <li key={t}>· {t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">
                    Combos détectées
                    <span className="ml-1 text-[11px] font-normal text-muted">
                      ({shownDeck.tier.signals.comboSource === "spellbook" ? "Commander Spellbook" : "base curatée"})
                    </span>
                  </h3>
                  {shownDeck.tier.signals.combos.length === 0 ? (
                    <p className="mt-1 text-xs text-muted">
                      Aucune combo détectée dans cette version du deck
                      {shownDeck.tier.signals.comboSource === "curated" ? " (base curatée hors ligne seulement)" : ""}.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-xs">
                      {shownDeck.tier.signals.combos.slice(0, 12).map((c) => (
                        <li key={c.id} className={c.minor ? "opacity-60" : ""}>
                          <span className="font-medium">{c.pieces.join(" + ")}</span>
                          <span className="text-muted"> — {c.result}</span>
                          {c.minor && <span className="text-muted"> (jugée mineure par Commander Spellbook, non comptée)</span>}
                          {c.note && <span className="block text-muted">⚠ {c.note}</span>}
                        </li>
                      ))}
                      {shownDeck.tier.signals.combos.length > 12 && (
                        <li className="text-muted">… et {shownDeck.tier.signals.combos.length - 12} autres.</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          {p.ranking && (
            <RankingPanel
              ranking={p.ranking}
              solidity={shownDeck.solidity}
              alternatives={p.alternatives}
              variantLabel={variant === "owned" ? "avec mes cartes" : "optimisé"}
            />
          )}

          {shownDeck.gamePlan && <GamePlanPanel plan={shownDeck.gamePlan} />}

          <MissingStaplesPanel
            staples={shownDeck.missingStaples}
            variantLabel={variant === "owned" ? "Avec mes cartes" : "Optimisé"}
            duel={result.formatKey === "duelcommander"}
            remainingEur={p.budget ? (variant === "upgraded" ? p.budget.remainingEur : p.budget.budgetEur - p.budget.commanderCostEur) : null}
          />

          {p.acquisitions.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">
                {p.budget ? `Achats retenus dans ton budget (${p.acquisitions.length})` : `Pool recommandé hors de ta liste (${p.acquisitions.length})`}
              </h3>
              <p className="text-xs text-muted">
                {p.budget
                  ? `${formatEur(p.budget.cardsCostEur)} de cartes${p.budget.commanderCostEur > 0 ? ` + ${formatEur(p.budget.commanderCostEur)} de commandant` : ""} sur ${formatEur(p.budget.budgetEur)} — reste ${formatEur(p.budget.remainingEur)}. Achats choisis pour apporter le plus au deck sans dépasser le budget.`
                  : result.formatKey === "duelcommander"
                  ? "De la mieux notée par le moteur à la moins bien notée (qualité, place dans la forme et le plan du deck). Au plus un tiers de terrains."
                  : "Classées par gain d'indice de tier au moment où le moteur les a choisies."}{" "}
                {p.budget ? "Prix Scryfall (EUR, indicatifs)." : "Prix Scryfall (EUR, indicatif, peut manquer)."}
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-muted">
                    <tr className="border-b border-border">
                      <th className="py-1.5 pr-2 font-medium">Carte</th>
                      <th className="py-1.5 pr-2 font-medium">Pourquoi</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Gain d&apos;indice</th>
                      <th className="py-1.5 text-right font-medium">Prix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.acquisitions.map((a) => (
                      <tr key={a.name} className="border-b border-border/60 align-top">
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-2">
                            {a.imageUrl && <CardImageHover src={a.imageUrl} zoomSrc={a.imageUrl} alt={a.name} width={28} />}
                            <div>
                              <p className="font-medium">
                                {a.name}
                                {a.gameChanger && (
                                  <span className="ml-1 rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning">GC</span>
                                )}
                              </p>
                              <p className="text-[11px] text-muted">{a.typeLine}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-1.5 pr-2 text-muted">{a.reasons.join(" · ") || "Rôle de deckbuilding (piliers)"}</td>
                        <td className="py-1.5 pr-2 text-right font-medium">{a.tierGain > 0 ? `+${a.tierGain}` : "—"}</td>
                        <td className="py-1.5 text-right">{a.priceEur !== null ? formatEur(a.priceEur) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {p.budget && p.budget.more.length > 0 && (
            <div className="mt-5 rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold">Pour quelques euros de plus</h3>
              <p className="mt-0.5 text-xs text-muted">
                Cartes non retenues faute de budget, de la plus rentable à la moins rentable (apport par euro).
                « Apport » : la note que le moteur donne à la carte, moins celle de la carte de ta liste qu&apos;elle
                remplacerait — un ordre de grandeur, pas un taux de victoire. « Dépassement » : ce qu&apos;il faudrait
                ajouter au budget pour acheter cette carte et toutes celles au-dessus.
                {p.budget.unpriced > 0 ? ` ${p.budget.unpriced} carte${p.budget.unpriced > 1 ? "s" : ""} du pool sans prix connu ne ${p.budget.unpriced > 1 ? "sont" : "est"} pas proposée${p.budget.unpriced > 1 ? "s" : ""}.` : ""}
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-muted">
                    <tr className="border-b border-border">
                      <th className="py-1.5 pr-2 font-medium">Carte</th>
                      <th className="py-1.5 pr-2 font-medium">Pourquoi</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Apport</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Prix</th>
                      <th className="py-1.5 text-right font-medium">Dépassement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.budget.more.map((m) => (
                      <tr key={m.name} className="border-b border-border/60 align-top">
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-2">
                            {m.imageUrl && <CardImageHover src={m.imageUrl} zoomSrc={m.imageUrl} alt={m.name} width={28} />}
                            <div>
                              <p className="font-medium">{m.name}</p>
                              <p className="text-[11px] text-muted">{m.typeLine}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-1.5 pr-2 text-muted">{m.reasons.join(" · ") || "Mieux notée que la carte qu'elle remplacerait"}</td>
                        <td className="py-1.5 pr-2 text-right font-medium">+{m.gain.toLocaleString("fr-FR")}</td>
                        <td className="py-1.5 pr-2 text-right">{formatEur(m.priceEur)}</td>
                        <td className="py-1.5 text-right">{m.overBudgetEur > 0 ? `+${formatEur(m.overBudgetEur)}` : "tient dans le reste"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {p.reference && (
            <div className="mt-5 rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold">
                Comparé aux decks de tournoi de ce commandant ({p.reference.deckCount} decks mtgtop8)
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                Cœur = cartes jouées dans au moins la moitié de ces decks ({p.reference.coreSize} cartes). Ton deck en
                contient {p.reference.coverageOwned}% avec tes cartes
                {p.reference.coverageUpgraded !== p.reference.coverageOwned
                  ? `, ${p.reference.coverageUpgraded}% en version optimisée`
                  : ""}
                .
              </p>
              {p.reference.missingCore.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {p.reference.missingCore.map((c) => (
                    <li
                      key={c.name}
                      className={`rounded-full px-2 py-0.5 ${c.owned ? "bg-success-soft text-success" : "bg-surface-muted text-muted"}`}
                      title={c.owned ? "Dans ta liste mais pas retenue par le moteur" : "À acquérir"}
                    >
                      {c.name} · {Math.round(c.share * 100)}%{c.owned ? " · possédée" : ""}
                    </li>
                  ))}
                </ul>
              )}
              {p.reference.samples.length > 0 && (
                <p className="mt-2 text-[11px] text-muted">
                  Exemples :{" "}
                  {p.reference.samples.map((s, i) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                      deck {i + 1}
                      {s.date ? ` (${s.date})` : ""}
                      {i < p.reference!.samples.length - 1 ? ", " : ""}
                    </a>
                  ))}
                </p>
              )}
            </div>
          )}

          {p.comboOpportunities.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Combos à une carte près (Commander Spellbook)</h3>
              <ul className="mt-1 space-y-1 text-xs">
                {p.comboOpportunities.map((o) => (
                  <li key={o.pieces.join("|")}>
                    Il manque <strong>{o.missing.join(" + ")}</strong> pour {o.pieces.join(" + ")}
                    <span className="text-muted"> — {o.result}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.notes.length > 0 && (
            <ul className="mt-4 space-y-0.5 text-[11px] text-muted">
              {result.notes.map((n) => (
                <li key={n}>ⓘ {n}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(opening || (building && !opened)) && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <Spinner label="Ouverture du deck dans le simulateur (score, suggestions)…" />
        </div>
      )}

      {tournamentOpen && opened && !opening && (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          Deck ouvert ci-dessous : <strong>{tournamentOpen}</strong> — une liste réelle de tournoi, pas un deck construit par le
          moteur. Les cartes que tu n&apos;as pas sont marquées « ajoutées ». Clique sur une proposition pour revenir à ses
          decks.
        </p>
      )}

      {opened && (tournamentOpen ? openedKey?.startsWith("tournoi:") : openedKey === currentKey) && !opening && (
        opened.ok ? (
          <DeckBuilder
            key={openedKey}
            initial={opened}
            deckSlug={`builder-${result.formatKey}-${tournamentOpen ?? `${p?.commander ?? "deck"}-${variant}`}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
            initialAddedNames={opened.addedNames}
            showBuildLink={false}
          />
        ) : (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{opened.error}</p>
        )
      )}
    </div>
  );
}

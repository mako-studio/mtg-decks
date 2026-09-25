"use client";

import { useRef, useState, useTransition } from "react";
import {
  openProposedDeck,
  runCompetitiveBuild,
  type AcquisitionOption,
  type CompetitiveBuildResult,
  type ProposalSummary,
} from "@/lib/competitive-actions";
import type { DeckAnalysisResult } from "@/lib/actions";
import { parseCollectionCsv, parseCollectionText } from "@/lib/collection-import";
import type { PowerTierLevel } from "@/lib/deck-tier";
import { DeckBuilder } from "./DeckBuilder";
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

const BUILD_STEPS = [
  "Lecture de ta liste auprès de Scryfall…",
  "Recherche des commandants possibles (ta liste, populaires, haute puissance)…",
  "Préparation du pool de cartes recommandées (Game Changers, staples, combos)…",
  "Construction et évaluation d'un deck par commandant…",
  "Recherche de cartes en synergie pour les meilleurs decks…",
];

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


export function CompetitiveBuilder() {
  const [inputMode, setInputMode] = useState<"text" | "csv">("text");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<FormatKey>("commander");
  const [maxAcq, setMaxAcq] = useState<AcquisitionOption>(15);
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [result, setResult] = useState<CompetitiveBuildResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [variant, setVariant] = useState<Variant>("upgraded");
  const [opened, setOpened] = useState<(DeckAnalysisResult & { addedNames: string[] }) | null>(null);
  const [openedKey, setOpenedKey] = useState<string | null>(null);

  const [building, startBuilding] = useTransition();
  const [opening, startOpening] = useTransition();
  const [stepIndex, setStepIndex] = useState(0);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function startSteps() {
    setStepIndex(0);
    if (stepTimer.current) clearInterval(stepTimer.current);
    stepTimer.current = setInterval(() => setStepIndex((i) => Math.min(i + 1, BUILD_STEPS.length - 1)), 2500);
  }
  function stopSteps() {
    if (stepTimer.current) clearInterval(stepTimer.current);
    stepTimer.current = null;
  }

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
    });
    setOpened(opened);
    setOpenedKey(`${res.formatKey}:${p.commander}:${v}:${res.maxAcquisitions}`);
  }

  function launch(cards: { name: string; count: number }[], fmt: FormatKey, acq: AcquisitionOption) {
    setFormError(null);
    startSteps();
    startBuilding(async () => {
      const res = await runCompetitiveBuild({ formatKey: fmt, collectionCards: cards, maxAcquisitions: acq });
      stopSteps();
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      try {
        localStorage.setItem(LAST_LIST_KEY, JSON.stringify(cards));
      } catch {
        // Stockage indisponible (navigation privée...) : simple confort, on ignore.
      }
      const v: Variant = res.maxAcquisitions > 0 ? "upgraded" : "owned";
      setResult(res);
      setSelected(0);
      setVariant(v);
      setOpened(null);
      setOpenedKey(null);
      if (res.proposals.length > 0) await openDeck(res, 0, v);
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
    launch(parsed.cards, format, maxAcq);
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

  function select(index: number, v: Variant) {
    if (!result) return;
    setSelected(index);
    setVariant(v);
    startOpening(async () => {
      await openDeck(result, index, v);
    });
  }

  // ---------- Formulaire ----------
  if (!result) {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
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
        </section>

        <div className="space-y-3">
          <button
            type="submit"
            disabled={building}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {building ? "Construction en cours…" : "Trouver mes decks les plus compétitifs"}
          </button>
          {building && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <Spinner label={BUILD_STEPS[stepIndex]} />
              <p className="mt-1 text-xs text-muted">
                Étapes indicatives — compter 5 à 20 secondes selon la taille de ta liste (plusieurs dizaines de
                commandants sont évalués, chacun avec un deck complet).
              </p>
            </div>
          )}
          {formError && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{formError}</p>}
        </div>
      </form>
    );
  }

  // ---------- Résultats ----------
  const p = result.proposals[selected];
  const formatLabel = FORMAT_CHOICES.find((f) => f.key === result.formatKey)?.title ?? "";
  const otherFormat: FormatKey = result.formatKey === "commander" ? "duelcommander" : "commander";
  const currentKey = p ? `${result.formatKey}:${p.commander}:${variant}:${result.maxAcquisitions}` : null;
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
          <span className="text-muted">{formatLabel} · jusqu&apos;à {result.maxAcquisitions} cartes hors liste</span>
          <button
            type="button"
            disabled={building}
            onClick={() => launch(result.collectionCards, otherFormat, result.maxAcquisitions)}
            className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
          >
            Relancer en {otherFormat === "duelcommander" ? "Duel" : "Multi"}
          </button>
          <select
            value={result.maxAcquisitions}
            disabled={building}
            onChange={(e) => launch(result.collectionCards, result.formatKey, Number(e.target.value) as AcquisitionOption)}
            className="rounded-md border border-border bg-surface px-2 py-1 disabled:opacity-60"
            aria-label="Cartes hors liste"
          >
            {ACQ_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value === 0 ? "Mes cartes uniquement" : `Jusqu'à ${o.value} cartes hors liste`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {building && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <Spinner label={BUILD_STEPS[stepIndex]} />
        </div>
      )}
      {formError && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{formError}</p>}

      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {result.proposals.length} deck{result.proposals.length > 1 ? "s" : ""} proposé{result.proposals.length > 1 ? "s" : ""}, classés par tier
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

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {result.proposals.map((prop, i) => (
          <li key={prop.commander} className="min-w-0">
            <button
              type="button"
              onClick={() => select(i, variant)}
              aria-pressed={i === selected}
              className={`flex h-full w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors ${i === selected ? "border-accent bg-accent-soft/40 ring-1 ring-accent" : "border-border bg-surface hover:border-accent/50"}`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-xs font-semibold text-muted">#{i + 1}</span>
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
            </button>
          </li>
        ))}
      </ol>

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
                  Deck #{selected + 1} · {formatLabel}
                </p>
                <h2 className="text-xl font-semibold tracking-tight">{p.commander}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <ManaCost cost={identityCost(p.colorIdentity)} size="md" />
                  <span className={allOwned(p) ? "text-success" : "text-warning"}>{sourceLabel(p)}</span>
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
                  const disabled = v === "upgraded" && result.maxAcquisitions === 0;
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
                      <p className="mt-1 text-[11px] text-muted">
                        {v === "owned"
                          ? `${d.ownedCount}/${d.deckSize} cartes de ta liste (le reste : terrains de base)`
                          : disabled
                            ? "Désactivé (aucune carte hors liste autorisée)"
                            : p.acquisitions.length === 0
                              ? "Aucune carte du pool recommandé ne fait mieux que tes cartes pour ce commandant"
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

          {p.acquisitions.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Pool recommandé hors de ta liste ({p.acquisitions.length})</h3>
              <p className="text-xs text-muted">
                Classées par gain d&apos;indice de tier au moment où le moteur les a choisies. Prix Scryfall (EUR, indicatif,
                peut manquer).
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

      {opened && openedKey === currentKey && !opening && (
        opened.ok ? (
          <DeckBuilder
            key={openedKey}
            initial={opened}
            deckSlug={`builder-${result.formatKey}-${p?.commander ?? "deck"}-${variant}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
            initialAddedNames={opened.addedNames}
          />
        ) : (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{opened.error}</p>
        )
      )}
    </div>
  );
}

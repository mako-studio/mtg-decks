"use client";

import { useEffect, useRef, useState } from "react";
import { BUILD_STEPS, overallProgress, type BuildProgress } from "@/lib/build-steps";
import type { GamePlanSummary } from "@/lib/game-plan-summary";
import type { StapleCard } from "@/lib/competitive-run";
import { CardImageHover } from "./CardImageHover";

/**
 * Panneaux du constructeur compétitif ajoutés le 03/10/2026 :
 * - BuildProgressPanel : le chargeur à étapes (demande de Ben : « de la
 *   visibilité sur la progression de la tâche et ses étapes ») ;
 * - GamePlanPanel : plan de jeu, parties simulées, synergies, variantes ;
 * - MissingStaplesPanel : staples absentes du deck affiché.
 * Sortis de CompetitiveBuilder.tsx pour ne pas le faire grossir encore.
 */

const pct = (x: number) => `${Math.round(x * 100)} %`;
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: n >= 100 ? 0 : 2 });

/** Secondes écoulées depuis `since`, rafraîchies chaque seconde. */
function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.round((now - since) / 1000));
}

function SmallSpinner() {
  return (
    <svg className="h-4 w-4 shrink-0 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/**
 * Chargeur à étapes. `progress` = dernier message reçu du serveur (null tant
 * que le premier n'est pas arrivé). `live` = false quand le flux d'étapes
 * n'a pas pu s'établir : le calcul tourne quand même (repli sur la Server
 * Action), on le dit au lieu d'afficher une fausse progression.
 */
export function BuildProgressPanel({ progress, startedAt, live }: { progress: BuildProgress | null; startedAt: number | null; live: boolean }) {
  const elapsed = useElapsed(startedAt);
  // Le chargeur apparaît sous un long formulaire : on l'amène à l'écran une fois, au départ.
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  const current = progress?.step ?? 0;
  const overall = progress ? overallProgress(progress) : 0;
  const percent = Math.round(overall * 100);
  const time = elapsed >= 60 ? `${Math.floor(elapsed / 60)} min ${String(elapsed % 60).padStart(2, "0")} s` : `${elapsed} s`;

  if (!live) {
    return (
      <div ref={box} className="rounded-xl border border-border bg-surface p-4" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-medium text-accent">
          <SmallSpinner /> Construction en cours… ({time})
        </p>
        <p className="mt-1 text-xs text-muted">
          Le suivi étape par étape n&apos;a pas pu s&apos;établir avec le serveur : le calcul continue, le résultat
          s&apos;affichera d&apos;un coup. Compter 30 secondes à 2 minutes selon la taille de la liste.
        </p>
      </div>
    );
  }

  return (
    <div ref={box} className="rounded-xl border border-border bg-surface p-4" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          Construction en cours — étape {current + 1}/{BUILD_STEPS.length}
        </p>
        <p className="text-xs tabular-nums text-muted">
          {percent} % · {time}
        </p>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Avancement de la construction"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(2, percent)}%` }} />
      </div>
      <ol className="mt-3 space-y-1.5">
        {BUILD_STEPS.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "pending";
          return (
            <li key={s.key} className="flex items-start gap-2 text-xs" data-step-state={state}>
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {state === "done" ? (
                  <span className="text-success" aria-label="Terminé">
                    ✓
                  </span>
                ) : state === "current" ? (
                  <SmallSpinner />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-border" aria-hidden="true" />
                )}
              </span>
              <span className={state === "pending" ? "text-muted" : state === "current" ? "font-medium text-foreground" : "text-foreground/80"}>
                {s.label}
                {state === "current" && progress?.detail && <span className="block font-normal text-muted">{progress.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11px] text-muted">
        Les étapes 1 à 3 dépendent de Scryfall (deux requêtes par seconde au plus) ; l&apos;étape 7 joue plusieurs
        milliers de parties simulées. Le pourcentage est une estimation, pas un compte à rebours.
      </p>
    </div>
  );
}

function Meter({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div title={hint}>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)}</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full rounded-full bg-surface-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border px-2.5 py-1.5" title={hint}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Chips({ cards }: { cards: string[] }) {
  if (cards.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1">
      {cards.map((c) => (
        <li key={c} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px]">
          {c}
        </li>
      ))}
    </ul>
  );
}

const ORIGIN_LABEL: Record<string, string> = {
  commandant: "Plan du commandant",
  collection: "Piste trouvée dans ta collection",
  base: "Moteur de base",
};

export function GamePlanPanel({ plan }: { plan: GamePlanSummary }) {
  const r = plan.playtest;
  return (
    <div className="mt-5 rounded-lg border border-border p-4" data-testid="game-plan">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Plan de jeu</h3>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">{plan.archetype}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${plan.plan?.origin === "collection" ? "bg-synergy-soft text-synergy" : "bg-surface-muted text-muted"}`}
        >
          {ORIGIN_LABEL[plan.plan?.origin ?? "base"]}
        </span>
      </div>
      <p className="mt-1 text-sm">{plan.headline}</p>
      {plan.plan && <p className="mt-1 text-xs text-muted">{plan.plan.why}</p>}

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Parties simulées" value={`${r.score}/100`} hint="Indice de régularité et de vitesse en solitaire — pas un taux de victoire." />
            <Stat label="Synergies" value={`${plan.synergyIndex}/100`} hint="Récompenses présentes dans le deck × mesure dans laquelle il les alimente." />
          </div>
          <Meter label="Régularité" value={r.parts.consistency} hint="Mains gardées, pannes de terrains, engorgements, couleurs." />
          <Meter label="Tempo" value={r.parts.tempo} hint="Part du mana utilisée, commandant sorti à son coût." />
          <Meter label="Horloge" value={r.parts.clock} hint="Vitesse à laquelle les blessures cumulées (ou une combo) terminent la partie, sans adversaire." />
          <Meter label="Réponses" value={r.parts.interaction} hint="Une interaction jouable dans les trois premiers tours." />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Mains de 7 gardées" value={pct(r.keep7)} />
          <Stat label="Pannes de terrains" value={pct(r.manaScrew)} hint="Moins de 3 terrains en jeu à la fin du tour 3." />
          <Stat label="Engorgements" value={pct(r.manaFlood)} hint="9 terrains ou plus parmi les cartes vues à la fin du tour 6." />
          <Stat label="Couleur manquante" value={pct(r.colorScrew)} hint="Part des tours 2 à 5 où un sort était payable en quantité mais pas en couleur." />
          <Stat label="Mana utilisé (T1-6)" value={pct(r.manaEfficiency)} />
          <Stat label="Commandant" value={r.commanderTurn !== null ? `tour ${r.commanderTurn}` : "—"} hint={`Sorti à son coût dans ${pct(r.commanderOnCurve)} des parties.`} />
          <Stat label="Blessures au tour 6" value={String(r.damageT6)} hint="Cumulées, sans bloqueur en face." />
          <Stat label={`${r.lifeTarget} blessures`} value={r.killTurn <= 10 ? `tour ${r.killTurn}` : "> 10 tours"} hint="Tour médian où les blessures cumulées atteignent ce total." />
          <Stat label="Réponse avant T4" value={pct(r.interactionByT3)} />
          {r.comboByEnd !== null && <Stat label="Combo réunie (T10)" value={pct(r.comboByEnd)} hint={`Dès le tour 6 : ${pct(r.comboByT6 ?? 0)}.`} />}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {plan.phases.map((ph) => (
          <div key={ph.title} className="rounded-lg bg-surface-muted/50 p-3">
            <h4 className="text-xs font-semibold">{ph.title}</h4>
            <p className="mt-1 text-xs text-muted">{ph.text}</p>
            <Chips cards={ph.cards} />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold">Comment ce deck gagne</h4>
          <ul className="mt-1 space-y-1 text-xs text-muted">
            {plan.winConditions.map((w) => (
              <li key={w}>· {w}</li>
            ))}
          </ul>
          <h4 className="mt-3 text-xs font-semibold">Mulligan</h4>
          <p className="mt-1 text-xs text-muted">{plan.mulligan}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold">Synergies clés</h4>
          {plan.keySynergies.length === 0 ? (
            <p className="mt-1 text-xs text-muted">Aucun axe de synergie net : le deck repose sur la qualité individuelle des cartes.</p>
          ) : (
            <ul className="mt-1 space-y-2 text-xs">
              {plan.keySynergies.map((s) => (
                <li key={s.label}>
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted"> — {s.text}</span>
                  <Chips cards={s.cards} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {plan.finds.length > 0 && (
        <div className="mt-4 rounded-lg bg-synergy-soft/60 p-3">
          <h4 className="text-xs font-semibold text-synergy">Trouvailles : peu jouées ailleurs, bien servies ici</h4>
          <ul className="mt-1 space-y-1 text-xs">
            {plan.finds.map((f) => (
              <li key={f.name}>
                <span className="font-medium">{f.name}</span> <span className="text-muted">— {f.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold">Points faibles relevés</h4>
          {plan.weaknesses.length === 0 ? (
            <p className="mt-1 text-xs text-muted">Rien de marquant dans les parties simulées ni dans les piliers.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-xs text-muted">
              {plan.weaknesses.map((w) => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="text-xs font-semibold">Ajustements gardés après les parties simulées</h4>
          {plan.adjustments.length === 0 ? (
            <p className="mt-1 text-xs text-muted">Aucun échange n&apos;a amélioré l&apos;indice d&apos;au moins 1 point : la liste est restée telle quelle.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-xs text-muted">
              {plan.adjustments.map((a) => (
                <li key={a}>· {a}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(plan.dependencies.dropped.length > 0 || plan.dependencies.weak.length > 0) && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold">Cartes qui dépendent d&apos;autres cartes</h4>
          <p className="mt-1 text-xs text-muted">
            Le moteur lit ce qu&apos;une carte va chercher ou récompense (un type, une tribu, une carte nommée) et compte ce que le deck
            fournit. Il compte les cibles, il ne juge pas leur qualité.
          </p>
          {plan.dependencies.dropped.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {plan.dependencies.dropped.map((d) => (
                <li key={d}>· Écartée : {d}</li>
              ))}
            </ul>
          )}
          {plan.dependencies.weak.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {plan.dependencies.weak.map((d) => (
                <li key={d}>· Gardée malgré tout : {d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <details className="mt-4 text-xs">
        <summary className="cursor-pointer font-semibold">
          {plan.variants.length} variante{plan.variants.length > 1 ? "s" : ""} essayée{plan.variants.length > 1 ? "s" : ""} pour ce deck
        </summary>
        <p className="mt-1 text-muted">
          {plan.choiceRule === "solidite"
            ? "Règle de choix : l'indice de solidité le plus haut — qualité des cartes (30 %), forme (20 %), cohérence (15 %), parties simulées (20 %), indice de tier (15 %). Deux variantes à moins de 2 points d'écart se valent."
            : "Règle de choix : le palier de tier le plus haut d'abord ; à palier égal, l'indice global (60 % parties simulées, 40 % synergies). Une variante qui perd plus de 3 points d'indice de puissance est écartée."}
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th className="py-1 pr-2 font-medium">Variante</th>
                <th className="py-1 pr-2 font-medium">Tier</th>
                <th className="py-1 pr-2 text-right font-medium">Puissance</th>
                <th className="py-1 pr-2 text-right font-medium">Parties</th>
                <th className="py-1 pr-2 text-right font-medium">Synergies</th>
                <th className="py-1 text-right font-medium">{plan.choiceRule === "solidite" ? "Solidité" : "Global"}</th>
              </tr>
            </thead>
            <tbody>
              {plan.variants.map((v) => (
                <tr key={`${v.label}-${v.origin}`} className={`border-b border-border/60 align-top ${v.chosen ? "bg-accent-soft/40" : ""}`}>
                  <td className="py-1 pr-2">
                    <span className="font-medium">{v.label}</span>
                    {v.chosen && <span className="ml-1 rounded bg-accent px-1 text-[10px] font-semibold text-accent-foreground">retenue</span>}
                    {v.rejected && <span className="ml-1 rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning">écartée</span>}
                    <span className="block text-[11px] text-muted">{v.why}</span>
                  </td>
                  <td className="py-1 pr-2 whitespace-nowrap">{v.tierLabel}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{v.powerIndex}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{v.playtest}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{v.synergy}</td>
                  <td className="py-1 text-right tabular-nums">{plan.choiceRule === "solidite" ? v.solidity : v.overall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {plan.recipe && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-semibold">Forme du deck comparée à la famille « {plan.recipe.label} » des decks de tournoi</summary>
          <p className="mt-1 text-muted">
            Famille apprise sur des decks de tournoi Duel ({plan.recipe.summary}). Exemples : {plan.recipe.examples.join(", ")}.
            La colonne « fourchette » donne le 1er quartile, la médiane et le 3e quartile de ces decks.
          </p>
          <table className="mt-2 w-full max-w-xl text-left">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th className="py-1 pr-2 font-medium">Rôle</th>
                <th className="py-1 pr-2 text-right font-medium">Ce deck</th>
                <th className="py-1 text-right font-medium">Fourchette</th>
              </tr>
            </thead>
            <tbody>
              {plan.recipe.rows.map((row) => (
                <tr key={row.role} className="border-b border-border/60">
                  <td className="py-1 pr-2">{row.role}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{row.count}</td>
                  <td className="py-1 text-right tabular-nums text-muted">
                    {row.p25} · <span className="text-foreground">{row.median}</span> · {row.p75}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <p className="mt-3 text-[11px] text-muted">
        ⓘ {plan.gamesPlayed.toLocaleString("fr-FR")} parties simulées pour ce deck, sans adversaire : pas de blocage, pas de
        removal subi. Ces chiffres comparent des variantes entre elles ; ce ne sont pas des chances de victoire. {plan.sources}
      </p>
    </div>
  );
}

export function MissingStaplesPanel({ staples, variantLabel }: { staples: StapleCard[]; variantLabel: string }) {
  if (staples.length === 0) {
    return (
      <div className="mt-5" data-testid="missing-staples">
        <h3 className="text-sm font-semibold">Staples manquants</h3>
        <p className="text-xs text-muted">
          Aucune staple connue du site (Game Changers, liste curatée, cartes les plus jouées) n&apos;améliorerait la version
          « {variantLabel} » par un échange simple.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-5" data-testid="missing-staples">
      <h3 className="text-sm font-semibold">Staples manquants ({staples.length})</h3>
      <p className="text-xs text-muted">
        Cartes de référence absentes de la version « {variantLabel} », de la plus utile à la moins utile. Le gain est celui
        de l&apos;échange indiqué, calculé avec la formule de tier du site. « Dans ta liste » : tu la possèdes, mais le
        moteur ne l&apos;a pas retenue.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="text-muted">
            <tr className="border-b border-border">
              <th className="py-1.5 pr-2 font-medium">Carte</th>
              <th className="py-1.5 pr-2 font-medium">Pourquoi</th>
              <th className="py-1.5 pr-2 font-medium">À la place de</th>
              <th className="py-1.5 pr-2 text-right font-medium">Indice</th>
              <th className="py-1.5 text-right font-medium">Prix</th>
            </tr>
          </thead>
          <tbody>
            {staples.map((s) => (
              <tr key={s.name} className="border-b border-border/60 align-top">
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-2">
                    {s.imageUrl && <CardImageHover src={s.imageUrl} zoomSrc={s.imageUrl} alt={s.name} width={28} />}
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className={`text-[11px] ${s.owned ? "text-success" : "text-muted"}`}>{s.owned ? "Dans ta liste" : "À acquérir"}</p>
                    </div>
                  </div>
                </td>
                <td className="py-1.5 pr-2 text-muted">{s.reasons.join(" · ")}</td>
                <td className="py-1.5 pr-2">{s.replaces ?? "—"}</td>
                <td className="py-1.5 pr-2 text-right font-medium tabular-nums">{s.tierGain > 0 ? `+${s.tierGain}` : s.tierGain < 0 ? String(s.tierGain) : "="}</td>
                <td className="py-1.5 text-right tabular-nums">{s.owned ? "—" : s.priceEur !== null ? eur(s.priceEur) : "?"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * « Pourquoi ce deck est classé là » (Duel, 04/10/2026, retour de Ben : « je
 * ne suis pas certain du choix ou de la decklist »). Montre ce que le
 * classement additionne : la solidité du deck « avec mes cartes » (cinq
 * mesures) et la note du commandant, avec les raisons en clair, puis les
 * autres commandants de la liste qui mènent pratiquement au même deck.
 */
export function RankingPanel({
  ranking,
  solidity,
  alternatives,
  variantLabel,
}: {
  ranking: { score: number; commander: { score: number; tournamentDecks: number; notes: string[] } };
  solidity: { score: number; parts: { quality: number; structure: number; coherence: number; playtest: number; tier: number } } | null;
  alternatives: { commander: string; owned: boolean; score: number | null }[];
  variantLabel: string;
}) {
  const bonus = Math.round((ranking.commander.score - 5) * 3 * 10) / 10;
  return (
    <div className="mt-5 rounded-lg border border-border p-4" data-testid="ranking-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Pourquoi ce deck est classé là</h3>
        <span className="text-xs text-muted">
          Score de classement <strong className="text-foreground">{ranking.score}</strong> = solidité du deck avec tes cartes{" "}
          {bonus >= 0 ? "+" : "−"} {Math.abs(bonus).toLocaleString("fr-FR")} pour le commandant
        </span>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold">
            Commandant : {ranking.commander.score.toLocaleString("fr-FR")}/10
            {ranking.commander.tournamentDecks > 0 ? ` · ${ranking.commander.tournamentDecks} deck${ranking.commander.tournamentDecks > 1 ? "s" : ""} de tournoi` : " · jamais vu en tournoi"}
          </p>
          <ul className="mt-1 space-y-1 text-xs text-muted">
            {ranking.commander.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
          {alternatives.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              <span className="font-medium text-foreground">Autres commandants de mêmes couleurs, pour un deck identique ou voisin :</span>{" "}
              {alternatives.map((a) => `${a.commander}${a.score !== null ? ` (${a.score})` : ""}`).join(", ")}. Deux propositions au plus par
              combinaison de couleurs, pour que la liste ne soit pas cinq fois le même deck ; à score proche (2 points ou moins), ces
              commandants se valent.
            </p>
          )}
        </div>
        {solidity ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold">
              Solidité ({variantLabel}) : {solidity.score.toLocaleString("fr-FR")}/100
            </p>
            <Meter label="Qualité des cartes (30 %)" value={solidity.parts.quality / 100} hint="Qualité moyenne des cartes hors terrains : présence dans les decks de tournoi Duel, sinon estimation d'après le texte." />
            <Meter label="Forme (20 %)" value={solidity.parts.structure / 100} hint="Créatures, contresorts, réponses, pioche, courbe : écart aux fourchettes des decks de tournoi." />
            <Meter label="Cohérence (15 %)" value={solidity.parts.coherence / 100} hint="Part des cartes qui ont un rôle clair, moins les cartes à revoir, et réalisation du plan annoncé." />
            <Meter label="Parties simulées (20 %)" value={solidity.parts.playtest / 100} hint="Régularité et vitesse en solitaire — pas un taux de victoire." />
            <Meter label="Indice de tier (15 %)" value={solidity.parts.tier / 100} hint="L'indice de puissance du badge de tier." />
          </div>
        ) : (
          <p className="text-xs text-muted">Solidité non calculée pour cette version.</p>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Les pondérations sont des choix de conception, pas des valeurs mesurées. Le tier affiché reste calculé comme partout sur le site ; il ne
        décide plus seul du classement, parce qu&apos;à tier égal il ne distingue pas un deck cohérent d&apos;un assemblage de cartes.
      </p>
    </div>
  );
}


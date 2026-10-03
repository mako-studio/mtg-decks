import { unmetDependencies } from "./dependencies";
import type { FormatConfig, ScryfallCard } from "./types";
import type { BuildMode, BuiltDeck, CardFeatures } from "./competitive-builder";
import type { BuildPlan, SynergyReport } from "./game-plan";
import type { PlaytestReport } from "./playtest";
import type { VariantSummary } from "./deck-optimizer";
import { RECIPES, ROLE_LABELS, TRENDS_INFO, type Recipe } from "./deck-trends";
import { ROLE_IDS, type RoleId } from "./mechanics";
import { CATEGORY_LABELS } from "./deck-score";

/**
 * Le PLAN DE JEU d'un deck proposé, en clair (03/10/2026). Rédigé à partir
 * de ce que le moteur a réellement mesuré — composition, parties simulées,
 * synergies — et non d'un texte générique par archétype : chaque phrase
 * renvoie à un chiffre ou à des cartes du deck.
 *
 * Tout est sérialisable (envoyé tel quel à l'interface).
 */

export interface PlanPhase {
  title: string;
  text: string;
  cards: string[];
}

export interface KeySynergy {
  label: string;
  text: string;
  cards: string[];
}

export interface RecipeFitRow {
  role: string;
  count: number;
  p25: number;
  median: number;
  p75: number;
}

export interface GamePlanSummary {
  /** Famille de decks de tournoi la plus proche (ou celle du plan suivi). */
  archetype: string;
  headline: string;
  /** Plan retenu : libellé + pourquoi il a été essayé. null = moteur de base. */
  plan: { label: string; origin: string; why: string } | null;
  winConditions: string[];
  phases: PlanPhase[];
  mulligan: string;
  keySynergies: KeySynergy[];
  /** Cartes peu jouées ailleurs mais bien servies par ce deck. */
  finds: { name: string; why: string }[];
  weaknesses: string[];
  adjustments: string[];
  /**
   * Dépendances entre cartes (dependencies.ts, 03/10/2026) : `dropped` =
   * cartes écartées faute de cible dans le deck ; `weak` = cartes gardées
   * alors que le deck sert mal ce dont elles dépendent.
   */
  dependencies: { dropped: string[]; weak: string[] };
  variants: VariantSummary[];
  playtest: PlaytestReport;
  synergyIndex: number;
  recipe: { label: string; summary: string; examples: string[]; rows: RecipeFitRow[] } | null;
  /** D'où viennent les tendances utilisées (affiché en pied de panneau). */
  sources: string;
  gamesPlayed: number;
}

const BROAD = new Set(["combat", "flash", "legends", "bigmana", "blink", "arrivals"]);
const pct = (x: number) => `${Math.round(x * 100)} %`;
const list = (names: string[], n: number) => names.slice(0, n);

function roleCounts(features: CardFeatures[]): Record<RoleId, number> {
  const counts = Object.fromEntries(ROLE_IDS.map((r) => [r, 0])) as Record<RoleId, number>;
  for (const f of features) for (const r of f.roles) counts[r]++;
  return counts;
}

/** Famille dont la forme est la plus proche (écart moyen, en parts de la médiane, sur les rôles qui la définissent). */
function nearestRecipe(counts: Record<RoleId, number>): Recipe | null {
  let best: Recipe | null = null;
  let bd = Infinity;
  for (const r of RECIPES) {
    let d = 0;
    for (const role of ROLE_IDS) {
      const range = r.roles[role];
      if (!range) continue;
      d += Math.abs(counts[role] - range.median) / Math.max(4, range.median);
    }
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

export function describeGamePlan(input: {
  deck: BuiltDeck;
  features: Map<string, CardFeatures>;
  format: FormatConfig;
  mode: BuildMode;
  plan: BuildPlan | null;
  playtest: PlaytestReport;
  synergy: SynergyReport;
  variants: VariantSummary[];
  adjustments: string[];
  gamesPlayed: number;
}): GamePlanSummary {
  const { deck, features, format, mode, plan, playtest: rep, synergy } = input;
  const duel = mode === "duel";
  const commanderName = deck.commanders.map((c: ScryfallCard) => c.name).join(" + ");
  // Cartes non-terrain dans l'ordre où le moteur les a choisies (les premières sont celles qu'il valorise le plus).
  const order = new Map(deck.picks.map((p, i) => [p.key, i] as const));
  const nonLands = deck.cards
    .map((c) => features.get(c.name.toLowerCase()))
    .filter((f): f is CardFeatures => !!f && !f.isLand)
    .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
  const inFinal = new Set(deck.cards.map((c) => c.name.toLowerCase()));
  const finalCards = deck.cards
    .map((c) => features.get(c.name.toLowerCase()))
    .filter((f): f is CardFeatures => !!f && !f.isBasic)
    .map((f) => f.card);
  const counts = roleCounts(nonLands);
  const recipe = plan?.recipe ?? nearestRecipe(counts);
  const names = (filter: (f: CardFeatures) => boolean, n: number) => list(nonLands.filter(filter).map((f) => f.card.name), n);
  const has = (f: CardFeatures, r: RoleId) => f.roles.includes(r);

  // --- Synergies clés (axes précis d'abord) ---
  const strong = synergy.axes.filter((a) => !BROAD.has(a.axis) && a.rewarders + (a.commanderRewards ? 3 : 0) >= 2 && a.producers >= 3);
  const keySynergies: KeySynergy[] = strong.slice(0, 3).map((a) => ({
    label: a.label,
    text: `${a.producers} cartes font que ${a.event}${
      a.validated ? ` (les decks connus construits sur cet axe en alignent environ ${Math.round(a.target)})` : ""
    } ; ${a.rewarders} carte${a.rewarders > 1 ? "s" : ""}${a.commanderRewards ? " et le commandant" : ""} en profite${a.rewarders + (a.commanderRewards ? 1 : 0) > 1 ? "nt" : ""}.`,
    cards: [...list(a.rewarderNames, 4), ...list(a.producerNames.filter((n) => !a.rewarderNames.includes(n)), 3)],
  }));

  // --- Trouvailles : récompenses peu jouées ailleurs, bien alimentées ici ---
  const finds: { name: string; why: string }[] = [];
  const seenFind = new Set<string>();
  for (const a of strong) {
    if (a.support < 0.7) continue;
    // Deux trouvailles au plus par axe : au-delà, la liste répète la même idée.
    let perAxis = 0;
    for (const name of a.rewarderNames) {
      if (perAxis >= 2) break;
      const f = features.get(name.toLowerCase());
      if (!f || seenFind.has(name)) continue;
      const rank = f.card.edhrec_rank;
      const offMeta = (typeof rank !== "number" || rank > 4000) && f.duelMetaGlobal < 0.02 && !f.tier.gameChanger;
      if (!offMeta) continue;
      seenFind.add(name);
      perAxis++;
      finds.push({ name, why: `Récompense « ${a.label} » : ${a.producers} cartes du deck la déclenchent. Peu jouée ailleurs, mais ce deck l'alimente.` });
      if (finds.length >= 5) break;
    }
    if (finds.length >= 5) break;
  }

  // --- Conditions de victoire ---
  const winConditions: string[] = [];
  for (const c of deck.tier.signals.combos.filter((x) => !x.minor).slice(0, 3)) {
    winConditions.push(`Combo : ${c.pieces.join(" + ")} — ${c.result}.`);
  }
  if (rep.comboByEnd !== null) {
    winConditions.push(`Au moins une combo est réunie avant le tour 10 dans ${pct(rep.comboByEnd)} des parties simulées (${pct(rep.comboByT6 ?? 0)} dès le tour 6).`);
  }
  const axis = (id: string) => synergy.axes.find((a) => a.axis === id);
  const tokens = axis("tokens");
  if (tokens && tokens.producers >= 6 && tokens.rewarders + (tokens.commanderRewards ? 1 : 0) >= 2) {
    winConditions.push(`Largeur : ${tokens.producers} sources de jetons, renforcées par ${list(tokens.rewarderNames, 3).join(", ") || "le commandant"}.`);
  }
  const voltron = axis("voltron");
  if (voltron && voltron.producers >= 8) winConditions.push(`Blessures de commandant : ${voltron.producers} équipements et auras à poser sur ${commanderName} (21 blessures de commandant suffisent).`);
  const drain = axis("drain");
  if (drain && drain.producers >= 8) winConditions.push(`Blessures directes : ${drain.producers} sources de pertes de points de vie hors combat.`);
  const threats = names((f) => has(f, "threat"), 4);
  if (threats.length) winConditions.push(`Menaces principales : ${threats.join(", ")}.`);
  winConditions.push(
    rep.killTurn <= 10
      ? `En solitaire, les ${rep.lifeTarget} blessures cumulées sont atteintes au tour ${rep.killTurn} (médiane, sans bloqueur en face : c'est un plancher).`
      : `En solitaire, les ${rep.lifeTarget} blessures cumulées ne sont pas atteintes en 10 tours : le deck gagne par autre chose que le combat, ou tard.`
  );

  // --- Phases ---
  const early = names((f) => f.card.cmc <= 2 && (has(f, "ramp") || has(f, "cheapCreature") || has(f, "cheapInteraction")), 6);
  const rampEarly = nonLands.filter((f) => f.card.cmc <= 2 && has(f, "ramp")).length;
  const cheapAnswers = counts.cheapInteraction;
  const engines = names((f) => f.card.cmc >= 3 && f.card.cmc <= 5 && (has(f, "draw") || strong.some((a) => a.rewarderNames.includes(f.card.name))), 6);
  const late = names((f) => f.card.cmc >= 5 || has(f, "wipe") || f.categories.includes("finisher"), 6);
  const phases: PlanPhase[] = [
    {
      title: "Tours 1 à 3",
      text:
        `${rampEarly >= 4 ? `Accélérer : ${rampEarly} sources de mana à 2 manas ou moins.` : counts.cheapCreature >= 14 ? `Poser des créatures dès le tour 1 : ${counts.cheapCreature} créatures à 1-2 manas.` : "Poser un terrain par tour et préparer la suite."}` +
        ` ${cheapAnswers} réponse${cheapAnswers > 1 ? "s" : ""} à 1-2 manas ; une est jouable dans les trois premiers tours dans ${pct(rep.interactionByT3)} des parties simulées.`,
      cards: early,
    },
    {
      title: "Tours 4 à 6",
      text:
        `${rep.commanderTurn !== null ? `${commanderName} sort en moyenne au tour ${rep.commanderTurn}.` : `${commanderName} ne sort pas dans les parties simulées.`}` +
        ` ${pct(rep.manaEfficiency)} du mana disponible est utilisé sur les six premiers tours ; ${rep.cardsSeenT6} cartes vues à la fin du tour 6.` +
        (engines.length ? " Installer les moteurs ci-dessous." : ""),
      cards: engines,
    },
    {
      title: "Fin de partie",
      text: late.length ? "Conclure avec les cartes ci-dessous, en gardant une réponse pour protéger le coup décisif." : "Pas de grosse carte de fin de partie : le deck doit avoir gagné du terrain avant.",
      cards: late,
    },
  ];

  // --- Mulligan ---
  const mulligan =
    `Garder une main de 7 avec 2 à 5 terrains (3 ou plus, sauf si elle contient deux cartes à 2 manas ou moins). ` +
    `Avec cette liste, ${pct(rep.keep7)} des mains de 7 sont gardées et ${pct(rep.manaScrew)} des parties ont moins de 3 terrains au tour 3` +
    `${duel ? "" : " (premier mulligan gratuit en multijoueur)"}.`;

  // --- Faiblesses ---
  const weaknesses: string[] = [];
  const t = format.categories.targets;
  const cc = deck.stats.categoryCounts;
  if (rep.manaScrew > 0.1) weaknesses.push(`Pannes de terrains dans ${pct(rep.manaScrew)} des parties simulées (${deck.stats.landCount} terrains).`);
  if (rep.keep7 < 0.7) weaknesses.push(`Seulement ${pct(rep.keep7)} des mains de 7 sont gardables.`);
  if (rep.colorScrew > 0.08) weaknesses.push(`Un sort reste bloqué faute de la bonne couleur dans ${pct(rep.colorScrew)} des tours 2 à 5.`);
  if (rep.interactionByT3 < (duel ? 0.5 : 0.3)) weaknesses.push(`Peu de réponses tôt : une interaction jouable avant le tour 4 dans ${pct(rep.interactionByT3)} des parties.`);
  for (const cat of ["draw", "removal", "wipe", "protection"] as const) {
    if (t[cat] > 0 && cc[cat] < t[cat] * 0.6) weaknesses.push(`${CATEGORY_LABELS[cat]} : ${cc[cat]} pour un repère de ${t[cat]} dans ce format.`);
  }
  if (deck.tier.signals.combos.filter((c) => !c.minor).length === 0) weaknesses.push("Aucune combo connue : pas de moyen de gagner d'un coup, la partie se joue au combat et à l'usure.");
  if (rep.killTurn > 10 && deck.tier.signals.combos.length === 0) weaknesses.push("Fin de partie lente en solitaire (voir conditions de victoire).");

  const headlineAxes = strong.slice(0, 2).map((a) => `« ${a.label} »`);
  const headline =
    `${recipe ? recipe.label : "Deck"}${headlineAxes.length ? ` autour de ${headlineAxes.join(" et ")}` : ""} : ` +
    `${rep.commanderTurn !== null ? `commandant au tour ${rep.commanderTurn}, ` : ""}` +
    `${pct(rep.manaEfficiency)} du mana utilisé, indice de parties simulées ${rep.score}/100.`;

  return {
    archetype: recipe?.label ?? "Forme libre",
    headline,
    plan: plan ? { label: plan.label, origin: plan.origin, why: plan.why } : null,
    winConditions,
    phases,
    mulligan,
    keySynergies,
    finds,
    weaknesses,
    adjustments: input.adjustments,
    dependencies: {
      dropped: (deck.dropped ?? []).filter((d) => !inFinal.has(d.name.toLowerCase())).map((d) => d.reason),
      // Recalculé sur la liste finale : les ajustements d'après parties simulées ont pu retirer une cible.
      weak: Array.from(new Set(unmetDependencies(finalCards, deck.commanders).map((u) => u.reason))),
    },
    variants: input.variants,
    playtest: rep,
    synergyIndex: synergy.index,
    recipe: recipe
      ? {
          label: recipe.label,
          summary: recipe.summary,
          examples: recipe.examples.slice(0, 4),
          rows: (["creature", "cheapCreature", "counterspell", "cheapInteraction", "removal", "draw", "ramp", "tutor", "cmc01", "cmc5plus"] as RoleId[]).map((r) => ({
            role: ROLE_LABELS[r] ?? r,
            count: counts[r],
            p25: recipe.roles[r]?.p25 ?? 0,
            median: recipe.roles[r]?.median ?? 0,
            p75: recipe.roles[r]?.p75 ?? 0,
          })),
        }
      : null,
    sources: `Tendances tirées de ${TRENDS_INFO.duel.decks} decks de tournoi Duel (${TRENDS_INFO.duel.commanders} commandants, ${TRENDS_INFO.duel.period ?? "période inconnue"}) et de ${TRENDS_INFO.multi.decks} précons Commander ; analyse du ${TRENDS_INFO.generatedAt}.`,
    gamesPlayed: input.gamesPlayed,
  };
}

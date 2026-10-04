import type { ScryfallCard } from "./types";
import type { CardFeatures } from "./competitive-builder";
import { AXES, ROLE_IDS, cardMechanics, type RoleId } from "./mechanics";
import { axisTargets, ownShape, pairLift, RECIPES, type AxisTarget, type Recipe, type TrendMode } from "./deck-trends";

/**
 * PLANS DE JEU (03/10/2026, demande de Ben : « ne pas forcément appliquer
 * les commandants standard ou des techniques vues et revues, mais dénicher
 * des synergies et game plans pouvant surprendre mais extrêmement efficaces,
 * en te basant sur une analyse des decks connus »).
 *
 * Un plan = quelques AXES de mécanique à servir (mechanics.ts) + une RECETTE
 * de forme (deck-trends.ts). Le constructeur ne bâtit plus un seul deck par
 * commandant mais plusieurs variantes, une par plan, puis les départage par
 * le tier, les parties simulées (playtest.ts) et la densité de synergies
 * (voir deck-optimizer.ts).
 *
 * D'où viennent les plans :
 * - « commandant » : les axes que le commandant récompense, complétés par
 *   l'axe que les decks connus lui associent le plus souvent ET que la
 *   collection sait servir ;
 * - « collection » : le meilleur axe que le commandant ne récompense PAS
 *   mais pour lequel la collection a à la fois les cartes qui le produisent
 *   et celles qui le récompensent — la piste « inattendue » ;
 * - chaque plan est décliné avec les recettes de forme qui lui vont le mieux
 *   (agression, contrôle, accélération...), choisies d'après le coût du
 *   commandant, le nombre de couleurs et ce que la collection permet.
 *
 * Tout est heuristique et pur (aucun appel réseau). Un plan n'est jamais
 * imposé : la variante « de base » (le moteur d'avant) reste candidate, et
 * un plan ne gagne que s'il fait au moins aussi bien au tier.
 */

export interface PlanAxis {
  /** Indice dans AXES. */
  axis: number;
  weight: number;
  /** Nombre de producteurs à viser (decks connus, ou valeur par défaut). */
  target: number;
  /** La cible vient-elle d'une tendance observée ? */
  validated: boolean;
  source: AxisTarget["source"];
  /** Ce que la collection (et le pool autorisé) offre dans l'identité du deck. */
  availProducers: number;
  availRewarders: number;
  commanderRewards: boolean;
}

export interface BuildPlan {
  id: string;
  label: string;
  origin: "commandant" | "collection";
  axes: PlanAxis[];
  recipe: Recipe | null;
  /**
   * Les recettes viennent des decks de tournoi DUEL. En multijoueur on les
   * applique à demi-poids et sans jamais pénaliser la rampe, la pioche ou
   * les nettoyages de table (une partie à quatre en demande plus qu'un 1v1).
   */
  mode: TrendMode;
  /** Pourquoi ce plan a été essayé — affiché à Ben. */
  why: string;
}

/** Compteurs tenus à jour pendant la sélection (voir PickState dans competitive-builder.ts). */
export interface PlanCounts {
  axisProd: number[];
  axisRew: number[];
  roleCounts: Record<RoleId, number>;
}

export function emptyPlanCounts(): PlanCounts {
  return {
    axisProd: AXES.map(() => 0),
    axisRew: AXES.map(() => 0),
    roleCounts: Object.fromEntries(ROLE_IDS.map((r) => [r, 0])) as Record<RoleId, number>,
  };
}

export function addToPlanCounts(counts: PlanCounts, f: Pick<CardFeatures, "mech" | "roles">, n: number): void {
  for (const i of f.mech.produces) counts.axisProd[i] += n;
  for (const i of f.mech.rewards) counts.axisRew[i] += n;
  for (const r of f.roles) counts.roleCounts[r] += n;
}

/** Rôles suivis par les recettes pour le choix des cartes (les tranches de coût sont traitées à part). */
const RECIPE_ROLES: RoleId[] = ["creature", "cheapCreature", "threat", "counterspell", "cheapInteraction", "removal", "wipe", "draw", "ramp", "tutor", "protection", "recursion"];
const CURVE_ROLES: RoleId[] = ["cmc01", "cmc2", "cmc3", "cmc4", "cmc5plus"];

/** Axes qu'une carte alimente par son seul type (voir planScore). */
export const TYPE_FED_AXES = new Set(AXES.map((a, i) => (a.producesTypes?.length ? i : -1)).filter((i) => i >= 0));

/** Plafonds : un plan oriente le choix entre cartes de valeur proche, il ne doit pas faire passer une carte faible devant un vrai gain de tier (≥ 3 points). */
const MULTI_NEVER_CAPPED = new Set<RoleId>(["ramp", "draw", "wipe"]);
const AXIS_SCORE_CAP = 3.5;
const RECIPE_SCORE_CAP = 2.5;

/**
 * Valeur d'une carte pour un plan, compte tenu de ce qui est DÉJÀ choisi.
 * - Un PRODUCTEUR vaut tant que la densité cible n'est pas atteinte, et à
 *   proportion de ce qui le récompensera (commandant, cartes déjà prises,
 *   et ce que la collection offre encore).
 * - Une RÉCOMPENSE vaut à proportion de la densité de producteurs atteinte
 *   ou atteignable ; au-delà de 8 récompenses, le rendement s'effondre.
 * - RECETTE : +0,6 par rôle encore sous la médiane des decks de la famille,
 *   −0,5 au-dessus du 3e quartile ; même logique pour la tranche de coût.
 */
export function planScore(
  f: Pick<CardFeatures, "mech" | "roles" | "isLand">,
  plan: BuildPlan,
  counts: PlanCounts,
  /** false : seulement les axes de mécanique (en Duel, la forme est notée par structureScore, competitive-builder.ts). */
  withRecipe = true
): { score: number; reasons: string[] } {
  if (f.isLand) return { score: 0, reasons: [] };
  const reasons: string[] = [];
  let axisScore = 0;
  for (const a of plan.axes) {
    const prod = counts.axisProd[a.axis];
    const rew = counts.axisRew[a.axis] + (a.commanderRewards ? 3 : 0);
    if (f.mech.produces.includes(a.axis)) {
      const need = prod < a.target ? 1 : 0.25;
      const payoff = Math.min(1, (rew + 0.5 * Math.min(a.availRewarders, 6)) / 3);
      // Axe alimenté par le TYPE de la carte (tout éphémère « produit » l'axe
      // des sorts, tout artefact celui des artefacts) : être du bon type n'est
      // pas un mérite, le crédit est réduit au quart (04/10/2026 — sinon un
      // rituel médiocre passait devant une bonne créature dans un deck de sorts).
      const byType = TYPE_FED_AXES.has(a.axis) ? 0.25 : 1;
      const s = a.weight * 1.2 * need * payoff * byType;
      if (s > 0.3) reasons.push(`Alimente « ${AXES[a.axis].label} »`);
      axisScore += s;
    }
    if (f.mech.rewards.includes(a.axis)) {
      const density = Math.min(1, (prod + 0.5 * Math.min(a.availProducers, a.target)) / Math.max(1, a.target));
      const s = a.weight * 1.5 * density * (counts.axisRew[a.axis] < 8 ? 1 : 0.3);
      if (s > 0.3) reasons.push(`Récompense « ${AXES[a.axis].label} »`);
      axisScore += s;
    }
  }
  axisScore = Math.min(AXIS_SCORE_CAP, axisScore);

  let recipeScore = 0;
  if (plan.recipe && withRecipe) {
    const multi = plan.mode === "multi";
    for (const r of RECIPE_ROLES) {
      if (!f.roles.includes(r)) continue;
      const range = plan.recipe.roles[r];
      if (!range) continue;
      if (counts.roleCounts[r] < range.median) recipeScore += 0.6;
      else if (counts.roleCounts[r] >= Math.max(range.p75, range.median + 1) && !(multi && MULTI_NEVER_CAPPED.has(r))) recipeScore -= 0.5;
    }
    for (const r of CURVE_ROLES) {
      if (!f.roles.includes(r)) continue;
      const range = plan.recipe.roles[r];
      if (!range) continue;
      if (counts.roleCounts[r] < range.median) recipeScore += 0.4;
      else if (counts.roleCounts[r] >= Math.max(range.p75, range.median + 1)) recipeScore -= 0.6;
    }
    recipeScore = Math.max(-RECIPE_SCORE_CAP, Math.min(RECIPE_SCORE_CAP, recipeScore));
    if (multi) recipeScore *= 0.5;
  }
  return { score: axisScore + recipeScore, reasons };
}

/** Nombre de terrains d'un plan : celui de la recette, borné autour de la cible du format. */
export function planLandTarget(plan: BuildPlan | undefined, formatTarget: number): number {
  if (!plan?.recipe) return formatTarget;
  // Un « deck de terrains » en joue 48-54 : on suit la recette jusqu'à +8 ;
  // les autres familles restent à ±2 de la cible du format.
  const span = plan.recipe.id.startsWith("lands") ? 8 : 2;
  return Math.max(formatTarget - 2, Math.min(formatTarget + span, Math.round(plan.recipe.lands.median)));
}

// ---------------------------------------------------------------------------
// Proposition des plans
// ---------------------------------------------------------------------------

interface PoolDepth {
  producers: number[];
  rewarders: number[];
}

/** Ce que les cartes disponibles (non-terrain, dans l'identité) offrent sur chaque axe. */
export function poolDepth(available: readonly Pick<CardFeatures, "mech" | "isLand">[]): PoolDepth {
  const producers = AXES.map(() => 0);
  const rewarders = AXES.map(() => 0);
  for (const f of available) {
    if (f.isLand) continue;
    for (const i of f.mech.produces) producers[i]++;
    for (const i of f.mech.rewards) rewarders[i]++;
  }
  return { producers, rewarders };
}

function planAxis(i: number, weight: number, targets: AxisTarget[], depth: PoolDepth, cmdRewards: boolean[]): PlanAxis {
  const t = targets[i];
  return {
    axis: i,
    weight,
    target: t.target,
    validated: t.validated,
    source: t.source,
    availProducers: depth.producers[i],
    availRewarders: depth.rewarders[i],
    commanderRewards: cmdRewards[i],
  };
}

/**
 * Adéquation d'une recette à ce commandant et à cette collection (0-1,5).
 * - a priori : part des commandants de la famille qui ont ce nombre de
 *   couleurs (deck-trends.json) ;
 * - coût du commandant : un commandant à 1-3 manas va aux familles à courbe
 *   basse, un commandant à 5+ aux familles à grosses cartes ;
 * - collection : pour les rôles qui DISTINGUENT la famille (très au-dessus
 *   de la moyenne), la part de la médiane que la collection peut fournir.
 */
function recipeFit(recipe: Recipe, commanders: ScryfallCard[], colors: number, roleAvail: Record<RoleId, number>): number {
  const prior = recipe.colors[String(colors)] ?? 0.05;
  const cmc = Math.max(...commanders.map((c) => c.cmc ?? 0));
  let cmdFit = 0.5;
  if (cmc <= 3 && recipe.avgCmc <= 2.4) cmdFit = 0.8;
  if (cmc >= 5 && recipe.avgCmc >= 2.7) cmdFit = 0.9;
  if (cmc >= 5 && recipe.avgCmc < 2) cmdFit = 0.3;
  let support = 0;
  let n = 0;
  for (const r of RECIPE_ROLES) {
    if ((recipe.z[r] ?? 0) < 0.5) continue;
    const need = recipe.roles[r]?.median ?? 0;
    if (need <= 0) continue;
    support += Math.min(1, roleAvail[r] / need);
    n++;
  }
  const supportShare = n ? support / n : 0.6;
  return prior * 0.6 + cmdFit * 0.4 + supportShare * 0.5;
}

/** Rôles qui portent la forme d'un deck, pour juger ce que la collection peut fournir. */
const SUPPORT_ROLES: RoleId[] = ["creature", "cheapCreature", "counterspell", "cheapInteraction", "removal", "draw", "ramp"];
/** Axes qui demandent beaucoup de créatures / beaucoup de sorts : une forme qui les contredit est moins adaptée. */
const CREATURE_AXES = new Set(["combat", "tokens", "counters", "voltron", "sacrifice", "arrivals", "blink"]);
const SPELL_AXES = new Set(["spells"]);

/**
 * Adéquation d'une recette en DUEL (04/10/2026). Trois questions :
 * 1. le commandant va-t-il avec cette forme ? Son coût, et ce qu'il
 *    récompense : un commandant qui paie pour chaque éphémère ne va pas dans
 *    un deck à 30 créatures, un commandant qui récompense l'attaque ne va pas
 *    dans un deck à 10 créatures ;
 * 2. les decks de tournoi de cette famille ont-ils ce nombre de couleurs ?
 * 3. la collection a-t-elle de BONNES cartes pour les rôles que cette forme
 *    demande ? Pour chaque rôle : qualité moyenne (card-quality.ts) des N
 *    meilleures cartes disponibles, N = la médiane de la famille ; une carte
 *    manquante compte 2,5. C'est ce qui fait choisir « contrôle » à une
 *    collection riche en contresorts et « agression » à une collection riche
 *    en petites créatures, au lieu d'une forme fixe par commandant.
 */
function recipeFitDuel(
  recipe: Recipe,
  commanders: ScryfallCard[],
  colors: number,
  byRole: Map<RoleId, number[]>,
  cmdRewards: boolean[]
): number {
  const prior = recipe.colors[String(colors)] ?? 0.05;
  const cmc = Math.max(...commanders.map((c) => c.cmc ?? 0));
  let cmdFit = 0.5;
  if (cmc <= 3 && recipe.avgCmc <= 2.4) cmdFit = 0.8;
  if (cmc >= 5 && recipe.avgCmc >= 2.7) cmdFit = 0.9;
  if (cmc >= 5 && recipe.avgCmc < 2) cmdFit = 0.3;
  const zCreature = recipe.z.creature ?? 0;
  let axisFit = 0;
  AXES.forEach((axis, i) => {
    if (!cmdRewards[i]) return;
    if (SPELL_AXES.has(axis.id)) axisFit += zCreature < -0.3 ? 0.4 : zCreature > 0.4 ? -0.3 : 0;
    if (CREATURE_AXES.has(axis.id)) axisFit += zCreature > 0 ? 0.3 : zCreature < -0.5 ? -0.3 : 0;
  });
  axisFit = Math.max(-0.4, Math.min(0.5, axisFit));
  let sum = 0;
  let weight = 0;
  for (const r of SUPPORT_ROLES) {
    const need = Math.round(recipe.roles[r]?.median ?? 0);
    if (need <= 0) continue;
    const best = byRole.get(r) ?? [];
    let q = 0;
    for (let i = 0; i < need; i++) q += best[i] ?? 2.5;
    sum += q;
    weight += need;
  }
  const support = weight ? Math.max(0, Math.min(1, (sum / weight - 4) / 3)) : 0.5;
  return prior * 0.5 + cmdFit * 0.4 + axisFit + support * 0.8;
}

/**
 * Plans à essayer pour un commandant (ou un duo), du plus au moins prometteur.
 * `available` : cartes non-terrain jouables dans l'identité (possédées +
 * pool autorisé). Au plus `max` plans — chacun coûte une construction
 * complète et plusieurs centaines de parties simulées.
 */
export function proposePlans(
  commanders: ScryfallCard[],
  available: readonly CardFeatures[],
  mode: TrendMode,
  max = 4
): BuildPlan[] {
  const targets = axisTargets(mode);
  // Duel (04/10/2026) : la profondeur de la collection sur un axe ne compte
  // que les cartes JOUABLES (qualité ≥ 4,3, card-quality.ts). Avant, 40
  // cartes de remplissage qui « produisent des jetons » faisaient du
  // sacrifice la « piste trouvée dans la collection » de tous les commandants.
  const depth = poolDepth(mode === "duel" ? available.filter((f) => f.quality.score >= 4.3) : available);
  const cmdRewards = AXES.map(() => false);
  const cmdProduces = AXES.map(() => false);
  for (const c of commanders) {
    const m = cardMechanics(c);
    for (const i of m.rewards) cmdRewards[i] = true;
    for (const i of m.produces) cmdProduces[i] = true;
  }
  const roleAvail = Object.fromEntries(ROLE_IDS.map((r) => [r, 0])) as Record<RoleId, number>;
  for (const f of available) for (const r of f.roles) roleAvail[r]++;
  const colors = new Set(commanders.flatMap((c) => c.color_identity)).size;

  // Force d'un axe POUR CE DECK : ce que la collection peut en faire.
  const supply = (i: number) => Math.min(1, depth.producers[i] / Math.max(1, targets[i].target));
  const payoffs = (i: number) => Math.min(1, depth.rewarders[i] / 4);
  // Axes trop généraux pour porter un plan à eux seuls (presque tout deck les « produit »).
  const TOO_BROAD = new Set(["combat", "flash", "legends", "bigmana", "blink", "arrivals", "draw", "untap"]);

  // --- Axes du commandant ---
  const commanderAxes = AXES.map((_, i) => i)
    .filter((i) => cmdRewards[i] && !(TOO_BROAD.has(AXES[i].id) && !targets[i].validated))
    .map((i) => ({ i, s: 2 + supply(i) * 2 + (targets[i].validated ? 0.5 : 0) + (TOO_BROAD.has(AXES[i].id) ? -1 : 0) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 2)
    .map((x) => x.i);

  // Axe compagnon : celui que les decks connus associent le plus au 1er axe du commandant, si la collection le sert.
  let companion = -1;
  if (commanderAxes.length) {
    let best = 0;
    AXES.forEach((axis, j) => {
      if (commanderAxes.includes(j) || TOO_BROAD.has(axis.id)) return;
      const lift = pairLift(AXES[commanderAxes[0]].id, axis.id, mode);
      const s = (lift - 1) * supply(j) * payoffs(j);
      if (lift >= 1.3 && supply(j) >= 0.6 && s > best) {
        best = s;
        companion = j;
      }
    });
  }

  // --- Axe « déniché » dans la collection : non récompensé par le commandant, mais servi des deux côtés ---
  let found = -1;
  let foundScore = 0;
  AXES.forEach((axis, j) => {
    if (cmdRewards[j] || j === companion || TOO_BROAD.has(axis.id)) return;
    if (depth.rewarders[j] < 3 || supply(j) < 0.8) return;
    const s = supply(j) * payoffs(j) * (targets[j].validated ? Math.min(2, targets[j].lift) : 0.8) * (cmdProduces[j] ? 1.3 : 1);
    if (s > foundScore) {
      foundScore = s;
      found = j;
    }
  });

  // Une famille construite sur un axe précis n'a de sens que si le deck vise
  // cet axe : 48 à 54 terrains sans rien qui récompense les terrains, c'est
  // juste un deck qui pioche trop de terrains (le simulateur, qui punit
  // surtout les pannes, s'y laisserait prendre).
  const landsAxis = AXES.findIndex((a) => a.id === "lands");
  const graveyardAxis = AXES.findIndex((a) => a.id === "graveyard");
  const allowed = (r: Recipe) => {
    if (r.id.startsWith("lands")) return cmdRewards[landsAxis] || found === landsAxis || companion === landsAxis;
    if (r.id.startsWith("reanimator")) return cmdRewards[graveyardAxis] || found === graveyardAxis || companion === graveyardAxis || depth.rewarders[graveyardAxis] >= 8;
    return true;
  };
  // Qualités des cartes disponibles par rôle, triées (pour recipeFitDuel).
  const byRole = new Map<RoleId, number[]>();
  if (mode === "duel") {
    for (const r of SUPPORT_ROLES) byRole.set(r, available.filter((f) => f.roles.includes(r)).map((f) => f.quality.score).sort((a, b) => b - a));
  }
  const recipes = [...RECIPES]
    .filter(allowed)
    .map((r) => ({ r, fit: mode === "duel" ? recipeFitDuel(r, commanders, colors, byRole, cmdRewards) : recipeFit(r, commanders, colors, roleAvail) }))
    .sort((a, b) => b.fit - a.fit);
  // Duel : si ce commandant a ses propres decks de tournoi (≥ 4), LEUR forme
  // passe devant celle des familles — c'est la mesure la plus directe de ce
  // qu'un deck de ce commandant doit contenir.
  const own = mode === "duel" ? ownShape(commanders.map((c) => c.name)) : null;
  const families = own ? recipes.filter((x) => x.r.label !== own.label.split(" — ")[0]) : recipes;
  const r1 = own ?? recipes[0]?.r ?? null;
  const r2 = (own ? families[0]?.r : recipes[1]?.r) ?? null;

  const plans: BuildPlan[] = [];
  const axisNames = (list: PlanAxis[]) => list.map((a) => AXES[a.axis].label).join(" + ");
  const commanderPlanAxes: PlanAxis[] = [
    ...commanderAxes.map((i, k) => planAxis(i, k === 0 ? 1 : 0.7, targets, depth, cmdRewards)),
    ...(companion >= 0 ? [planAxis(companion, 0.6, targets, depth, cmdRewards)] : []),
  ];
  const push = (origin: BuildPlan["origin"], axes: PlanAxis[], recipe: Recipe | null, why: string) => {
    if (plans.length >= max) return;
    const id = `${origin}:${axes.map((a) => AXES[a.axis].id).join("+") || "aucun"}:${recipe?.id ?? "sans"}`;
    if (plans.some((p) => p.id === id)) return;
    const label = [axes.length ? axisNames(axes) : null, recipe?.label ?? null].filter(Boolean).join(" · ") || "Plan du commandant";
    plans.push({ id, label, origin, axes, recipe, mode, why: mode === "multi" && recipe ? `${why} (Forme apprise sur des decks de Duel : appliquée à demi-poids en multijoueur.)` : why });
  };

  const companionNote =
    companion >= 0
      ? ` ; « ${AXES[companion].label} » y est ajouté parce que les decks connus l'associent ${pairLift(AXES[commanderAxes[0]].id, AXES[companion].id, mode).toFixed(1)} fois plus souvent que le hasard`
      : "";
  if (commanderPlanAxes.length || r1) {
    push(
      "commandant",
      commanderPlanAxes,
      r1,
      commanderPlanAxes.length
        ? `Axes que le commandant récompense${companionNote}. Forme « ${r1?.label ?? "libre"} » : ${own ? "mesurée sur les decks de tournoi de ce commandant" : "la famille de decks de tournoi la plus proche de ce commandant et de ta collection"}.`
        : `Le commandant ne récompense aucun axe précis : ${own ? `la forme de ses ${own.decks} decks de tournoi` : `seule la forme « ${r1?.label ?? "libre"} »`} guide le choix.`
    );
  }
  if (found >= 0) {
    const a = planAxis(found, 1, targets, depth, cmdRewards);
    const keep = commanderPlanAxes.slice(0, 1).map((x) => ({ ...x, weight: 0.6 }));
    push(
      "collection",
      [a, ...keep],
      r1,
      `Piste trouvée dans ta collection : ${a.availProducers} cartes produisent « ${AXES[found].label} » et ${a.availRewarders} le récompensent, alors que le commandant ne le demande pas${
        a.validated ? ` (les decks connus construits sur cet axe alignent ~${Math.round(a.target)} producteurs)` : " (axe peu représenté dans les decks connus : cible par défaut)"
      }.`
    );
  }
  if (r2 && (commanderPlanAxes.length || found < 0)) {
    push("commandant", commanderPlanAxes, r2, `Mêmes axes, autre forme : « ${r2.label} », la 2e famille la plus proche.`);
  }
  if (found >= 0 && r2) {
    const a = planAxis(found, 1, targets, depth, cmdRewards);
    push("collection", [a, ...commanderPlanAxes.slice(0, 1).map((x) => ({ ...x, weight: 0.6 }))], r2, `La piste de la collection, déclinée dans la forme « ${r2.label} ».`);
  }
  return plans;
}

// ---------------------------------------------------------------------------
// Densité de synergies d'un deck fini
// ---------------------------------------------------------------------------

export interface AxisSynergy {
  axis: string;
  label: string;
  event: string;
  producers: number;
  rewarders: number;
  commanderRewards: boolean;
  target: number;
  validated: boolean;
  /** min(1, producteurs / cible). */
  support: number;
  producerNames: string[];
  rewarderNames: string[];
}

export interface SynergyReport {
  /** 0-100 : récompenses présentes × mesure dans laquelle le deck les alimente. */
  index: number;
  axes: AxisSynergy[];
}

/**
 * Mesure combien de « récompenses » le deck contient et si elles sont
 * réellement alimentées. Pour chaque axe : poids = min(récompenses, 8),
 * soutien = min(1, producteurs / densité cible). Les unités (somme des
 * poids × soutien) sont ramenées sur 0-100 par une courbe qui sature :
 * 100 × (1 − e^(−unités/14)) — 10 unités ≈ 51, 20 ≈ 76, 30 ≈ 88. Choix
 * d'échelle, pas une mesure : il sert à comparer des variantes entre elles.
 * Les axes trop généraux (attaque, jeu au tour adverse...) comptent pour un
 * tiers : presque tout deck les sert sans le vouloir.
 */
export function synergyReport(
  cards: readonly { f: Pick<CardFeatures, "mech" | "isLand" | "card">; count: number }[],
  commanders: ScryfallCard[],
  mode: TrendMode
): SynergyReport {
  const targets = axisTargets(mode);
  const cmdRewards = AXES.map(() => false);
  for (const c of commanders) for (const i of cardMechanics(c).rewards) cmdRewards[i] = true;
  const prod: string[][] = AXES.map(() => []);
  const rew: string[][] = AXES.map(() => []);
  for (const { f } of cards) {
    if (f.isLand) continue;
    for (const i of f.mech.produces) prod[i].push(f.card.name);
    for (const i of f.mech.rewards) rew[i].push(f.card.name);
  }
  const BROAD = new Set(["combat", "flash", "legends", "bigmana", "blink", "arrivals"]);
  let units = 0;
  const axes: AxisSynergy[] = [];
  AXES.forEach((axis, i) => {
    const rewarders = rew[i].length + (cmdRewards[i] ? 3 : 0);
    if (rewarders === 0) return;
    const support = Math.min(1, prod[i].length / Math.max(1, targets[i].target));
    units += Math.min(rewarders, 8) * support * (BROAD.has(axis.id) ? 0.33 : 1);
    axes.push({
      axis: axis.id,
      label: axis.label,
      event: axis.event,
      producers: prod[i].length,
      rewarders: rew[i].length,
      commanderRewards: cmdRewards[i],
      target: targets[i].target,
      validated: targets[i].validated,
      support: Math.round(support * 100) / 100,
      producerNames: prod[i],
      rewarderNames: rew[i],
    });
  });
  axes.sort((a, b) => Math.min(b.rewarders + (b.commanderRewards ? 3 : 0), 8) * b.support - Math.min(a.rewarders + (a.commanderRewards ? 3 : 0), 8) * a.support);
  return { index: Math.round((1 - Math.exp(-units / 14)) * 100), axes };
}

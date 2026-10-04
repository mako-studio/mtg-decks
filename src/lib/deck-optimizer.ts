import type { ScryfallCard } from "./types";
import {
  auditBuiltDeck,
  buildDeckForCommander,
  evaluateDeck,
  unionIdentity,
  type BuildContext,
  type BuildMode,
  type BuiltDeck,
  type CardFeatures,
  type PickInfo,
} from "./competitive-builder";
import { commanderRating, type CommanderRating } from "./deck-audit";
import { BASIC_LAND_BY_COLOR } from "./collection-builder";
import { classifyCard } from "./deck-score";
import { proposePlans, synergyReport, type BuildPlan, type SynergyReport } from "./game-plan";
import { runPlaytest, toSimCard, type PlaytestDeck, type PlaytestReport, type SimCard } from "./playtest";
import type { ComboDef } from "./combos";

/**
 * OPTIMISATION D'UN DECK PROPOSÉ (03/10/2026) : variantes par plan de jeu,
 * parties simulées, choix, puis ajustements ciblés.
 *
 * 1. VARIANTES — le deck « de base » (moteur d'avant) + un deck par plan
 *    proposé (game-plan.ts : axes du commandant, piste trouvée dans la
 *    collection, deux recettes de forme).
 * 2. MESURES — chaque variante reçoit son tier (même formule que partout),
 *    son indice de parties simulées (playtest.ts) et son indice de synergies
 *    (game-plan.ts), avec la MÊME graine de tirage pour toutes.
 * 3. CHOIX — règle du projet « tier d'abord » conservée au niveau du PALIER
 *    (Tier N — Low/Mid/Top) : la variante au palier le plus haut gagne. À
 *    palier égal, celle dont l'indice global est le plus haut :
 *    0,6 × parties simulées + 0,4 × synergies (choix de conception : la
 *    régularité mesurée pèse plus que la synergie estimée). Une variante qui
 *    perd plus de 3 points d'indice de puissance sur la base est écartée,
 *    sauf si elle monte de palier.
 * 4. AJUSTEMENTS — on lit le rapport de la variante retenue et on essaie les
 *    réparations qui correspondent à ses faiblesses (un terrain de plus si
 *    les pannes sont fréquentes, un de moins si elle s'engorge, une carte
 *    moins chère si le mana n'est pas dépensé, une réponse à bas coût si
 *    elle en manque). Chaque essai est rejoué avec la même graine et n'est
 *    gardé que s'il gagne au moins 1 point sans baisser de palier.
 *
 * Limite de fond : les parties simulées se jouent sans adversaire (voir
 * playtest.ts). L'optimisation améliore ce que le simulateur mesure —
 * régularité, tempo, horloge à vide — pas un taux de victoire réel.
 */

const SUB_RANK = { low: 0, mid: 1, top: 2 } as const;
const palier = (d: BuiltDeck) => d.tier.tier * 3 + SUB_RANK[d.tier.subTier];
const COLOR_BIT: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16 };

export interface OptimizeContext extends Omit<BuildContext, "plan"> {
  combos: readonly ComboDef[];
}

export interface VariantSummary {
  label: string;
  origin: "base" | BuildPlan["origin"];
  why: string;
  tierLabel: string;
  powerIndex: number;
  playtest: number;
  synergy: number;
  /** 0,6 × parties simulées + 0,4 × synergies. */
  overall: number;
  /** Indice de solidité (Duel) : c'est lui qui départage les variantes. */
  solidity: number;
  chosen: boolean;
  /** Écartée : plus de 3 points d'indice de puissance perdus sans gain de palier. */
  rejected: boolean;
}

export interface OptimizedDeck {
  deck: BuiltDeck;
  playtest: PlaytestReport;
  synergy: SynergyReport;
  plan: BuildPlan | null;
  variants: VariantSummary[];
  /** Ajustements gardés après les parties simulées, en clair. */
  adjustments: string[];
  /** Parties simulées au total pour ce deck (transparence). */
  gamesPlayed: number;
  /** Indice de solidité du deck final et ses cinq composantes (deckSolidity). */
  solidity: Solidity;
  /** Note du commandant pour ce format (commanderRating). */
  commander: CommanderRating;
}

const simCache = new Map<string, SimCard>();

function simOf(card: ScryfallCard, mask: number): SimCard {
  const key = `${card.name}|${mask}`;
  let s = simCache.get(key);
  if (!s) {
    s = toSimCard(card, classifyCard(card), mask);
    if (simCache.size > 20000) simCache.clear();
    simCache.set(key, s);
  }
  return s;
}

/** Liste + commandants → deck jouable par le simulateur (pièces de combo marquées). */
export function toPlaytestDeck(
  list: readonly { name: string; count: number }[],
  commanders: ScryfallCard[],
  features: Map<string, CardFeatures>,
  basics: Map<string, ScryfallCard>,
  combos: readonly { pieces: readonly string[]; minor?: boolean }[]
): PlaytestDeck {
  const identity = unionIdentity(commanders);
  const mask = identity.reduce((m, c) => m | COLOR_BIT[c], 0) || 31;
  const real = combos.filter((c) => !c.minor);
  const comboOf = new Map<string, number[]>();
  real.forEach((c, k) => {
    for (const p of c.pieces) {
      const key = p.toLowerCase();
      const cur = comboOf.get(key);
      if (cur) cur.push(k);
      else comboOf.set(key, [k]);
    }
  });
  const withCombos = (s: SimCard, name: string): SimCard => {
    const ks = comboOf.get(name.toLowerCase());
    return ks ? { ...s, combos: ks } : s;
  };
  const cards: SimCard[] = [];
  for (const e of list) {
    const card = features.get(e.name.toLowerCase())?.card ?? basics.get(e.name.toLowerCase());
    if (!card) continue;
    const s = withCombos(simOf(card, mask), card.name);
    for (let i = 0; i < e.count; i++) cards.push(s);
  }
  return {
    cards,
    commanders: commanders.map((c) => withCombos(simOf(c, mask), c.name)),
    comboSizes: real.map((c) => c.pieces.length),
  };
}

const SEARCH_GAMES = 200;
const FINAL_GAMES = 400;
const SEARCH_SEED = 7919;
const FINAL_SEED = 104729;

function playtestOf(deck: BuiltDeck, ctx: OptimizeContext, games: number, seed: number): PlaytestReport {
  const pd = toPlaytestDeck(deck.cards, deck.commanders, ctx.features, ctx.basics, deck.tier.signals.combos);
  return runPlaytest(pd, { mode: ctx.mode, games, seed });
}

function synergyOf(deck: BuiltDeck, ctx: OptimizeContext): SynergyReport {
  const cards = deck.cards
    .map((c) => ({ f: ctx.features.get(c.name.toLowerCase()), count: c.count }))
    .filter((x): x is { f: CardFeatures; count: number } => !!x.f);
  return synergyReport(cards, deck.commanders, ctx.mode);
}

const overallOf = (playtest: number, synergy: number) => Math.round((0.6 * playtest + 0.4 * synergy) * 10) / 10;

// ---------------------------------------------------------------------------
// Indice de solidité d'un deck et note d'un commandant (Duel, 04/10/2026)
// ---------------------------------------------------------------------------

/**
 * INDICE DE SOLIDITÉ (0-100) d'un deck Duel. Il remplace, pour CHOISIR entre
 * deux decks, la règle « palier de tier d'abord » : l'indice de tier compte
 * des cases (mana rapide, tutors, interaction...) et, à cases égales, ne
 * distingue pas un deck cohérent d'une pile de cartes. Mesuré sur la
 * collection de Ben : classés au tier, les cinq premiers commandants
 * possédés étaient simplement ceux dont les COULEURS donnent accès au plus
 * de cartes, avec des listes presque identiques.
 *
 * Cinq mesures, toutes sur 0-100 :
 * - 30 % qualité moyenne des cartes (card-quality.ts : présence en tournoi,
 *   sinon modèle de texte) — 3,5/10 → 0, 8,5/10 → 100 ;
 * - 20 % forme : écart aux fourchettes des decks de tournoi (deck-audit.ts) ;
 * - 15 % cohérence : part des cartes qui ont un rôle clair, moins les cartes
 *   à revoir (deck-audit.ts) ;
 * - 20 % parties simulées en solitaire (playtest.ts) ;
 * - 15 % indice de puissance du tier (deck-tier.ts).
 * Les poids sont des choix de conception, pas des valeurs mesurées. Le tier
 * AFFICHÉ ne change pas : il reste calculé comme partout sur le site.
 */
export const SOLIDITY_WEIGHTS = { quality: 0.3, structure: 0.2, coherence: 0.15, playtest: 0.2, tier: 0.15 } as const;

export interface Solidity {
  score: number;
  parts: { quality: number; structure: number; coherence: number; playtest: number; tier: number };
}

export function deckSolidity(deck: BuiltDeck, playtestScore: number): Solidity {
  const quality = Math.max(0, Math.min(100, ((deck.audit.avgQuality - 3.5) / 5) * 100));
  const parts = { quality: Math.round(quality), structure: deck.audit.structure, coherence: deck.audit.coherence, playtest: Math.round(playtestScore), tier: Math.round(deck.tier.powerIndex) };
  const w = SOLIDITY_WEIGHTS;
  const score = w.quality * quality + w.structure * parts.structure + w.coherence * parts.coherence + w.playtest * playtestScore + w.tier * deck.tier.powerIndex;
  return { score: Math.round(score * 10) / 10, parts };
}

/** Poids de la note du commandant dans le classement : (note − 5) × 3, soit de −15 à +15 points. */
const COMMANDER_WEIGHT = 3;

/** Score de classement d'un deck proposé : solidité du deck + ce que vaut son commandant. */
export function rankScore(deck: BuiltDeck, playtestScore: number, mode: BuildMode): number {
  return Math.round((deckSolidity(deck, playtestScore).score + (commanderRating(deck.commanders, mode).score - 5) * COMMANDER_WEIGHT) * 10) / 10;
}

/** Parties simulées rapides pour classer un deck (120 parties, graine fixe). */
export function quickPlaytest(deck: BuiltDeck, ctx: Pick<BuildContext, "features" | "basics" | "mode">): number {
  const pd = toPlaytestDeck(deck.cards, deck.commanders, ctx.features, ctx.basics, deck.tier.signals.combos);
  return runPlaytest(pd, { mode: ctx.mode, games: 120, seed: SEARCH_SEED }).score;
}
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Remplace une carte par une autre dans une liste (quantités), sans muter l'originale. */
function swapCards(list: readonly { name: string; count: number }[], remove: string, add: string): { name: string; count: number }[] {
  const out = list.map((c) => ({ ...c }));
  const r = out.findIndex((c) => c.name.toLowerCase() === remove.toLowerCase());
  if (r < 0) return out;
  out[r].count--;
  if (out[r].count <= 0) out.splice(r, 1);
  const a = out.find((c) => c.name.toLowerCase() === add.toLowerCase());
  if (a) a.count++;
  else out.push({ name: add, count: 1 });
  return out;
}

/** Recalcule score et tier d'une liste modifiée, en gardant le reste du deck construit. */
function withList(deck: BuiltDeck, list: { name: string; count: number }[], ctx: OptimizeContext, picks: PickInfo[], bench: PickInfo[]): BuiltDeck {
  const { stats, tier } = evaluateDeck(list, deck.commanders, ctx.features, ctx.basics, ctx.format, ctx.combos);
  const names = new Set(list.map((c) => c.name.toLowerCase()));
  const next = { ...deck, cards: list, stats, tier, picks, bench, acquisitions: deck.acquisitions.filter((a) => names.has(a.name.toLowerCase())) };
  return { ...next, audit: auditBuiltDeck(next, ctx) };
}

/** Couleur dont le deck manque le plus : symboles demandés par source disponible. */
function neededBasic(deck: BuiltDeck, ctx: OptimizeContext, most: boolean): string | null {
  const identity = unionIdentity(deck.commanders);
  if (identity.length === 0) return most ? "Wastes" : deck.cards.some((c) => c.name === "Wastes") ? "Wastes" : null;
  const pips: Record<string, number> = {};
  const sources: Record<string, number> = {};
  for (const c of identity) {
    pips[c] = 0;
    sources[c] = 0;
  }
  for (const e of deck.cards) {
    const f = ctx.features.get(e.name.toLowerCase());
    const card = f?.card ?? ctx.basics.get(e.name.toLowerCase());
    if (!card) continue;
    if (card.type_line.split(" // ")[0].includes("Land")) {
      for (const c of identity) if ((card.produced_mana ?? []).includes(c)) sources[c] += e.count;
    } else {
      const cost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? "";
      for (const m of cost.matchAll(/\{([WUBRG])\}/g)) if (m[1] in pips) pips[m[1]] += e.count;
    }
  }
  const basicCount = (c: string) => deck.cards.find((x) => x.name === BASIC_LAND_BY_COLOR[c])?.count ?? 0;
  const ratio = (c: string) => pips[c] / Math.max(1, sources[c]);
  const pool = most ? identity : identity.filter((c) => basicCount(c) > 0);
  if (pool.length === 0) return null;
  const pick = [...pool].sort((a, b) => (most ? ratio(b) - ratio(a) : ratio(a) - ratio(b)))[0];
  return BASIC_LAND_BY_COLOR[pick] ?? null;
}

interface Trial {
  deck: BuiltDeck;
  report: PlaytestReport;
}

/**
 * Ajustements ciblés d'après le rapport. Chaque piste est essayée au plus
 * deux fois ; un essai est gardé s'il gagne ≥ 1 point d'indice de parties
 * simulées (même graine) sans baisser de palier ni perdre plus de 1,5 point
 * d'indice de puissance.
 */
function repair(start: Trial, ctx: OptimizeContext, counter: { games: number }): { trial: Trial; notes: string[] } {
  let cur = start;
  const notes: string[] = [];
  const duel = ctx.mode === "duel";

  const attempt = (remove: string | null, add: string | null, picks: PickInfo[], bench: PickInfo[], describe: (before: PlaytestReport, after: PlaytestReport) => string): boolean => {
    if (!remove || !add || remove.toLowerCase() === add.toLowerCase()) return false;
    const list = swapCards(cur.deck.cards, remove, add);
    const deck = withList(cur.deck, list, ctx, picks, bench);
    if (!duel && (palier(deck) < palier(cur.deck) || deck.tier.powerIndex < cur.deck.tier.powerIndex - 1.5)) return false;
    const report = playtestOf(deck, ctx, SEARCH_GAMES, SEARCH_SEED);
    counter.games += SEARCH_GAMES;
    if (report.score < cur.report.score + 1) return false;
    // Duel : un ajustement ne doit pas dégrader le deck dans son ensemble (qualité, forme, cohérence).
    if (duel && deckSolidity(deck, report.score).score < deckSolidity(cur.deck, cur.report.score).score) return false;
    // ... ni y faire entrer une carte que la lecture du deck juge à revoir.
    const review = (d: BuiltDeck) => d.audit.flagged.filter((f) => f.level === "discutable" || f.level === "contre-productif").length;
    if (duel && review(deck) > review(cur.deck)) return false;
    notes.push(describe(cur.report, report));
    cur = { deck, report };
    return true;
  };

  const weakest = (filter: (f: CardFeatures) => boolean = () => true): PickInfo | null => {
    for (let i = cur.deck.picks.length - 1; i >= 0; i--) {
      const p = cur.deck.picks[i];
      const f = ctx.features.get(p.key);
      if (!p.locked && f && filter(f)) return p;
    }
    return null;
  };
  const without = (p: PickInfo) => cur.deck.picks.filter((x) => x.key !== p.key);
  const inDeck = (key: string) => cur.deck.cards.some((c) => c.name.toLowerCase() === key);
  const benchBest = (filter: (f: CardFeatures) => boolean): PickInfo | null =>
    cur.deck.bench.find((b) => !inDeck(b.key) && filter(ctx.features.get(b.key) ?? ({} as CardFeatures))) ?? null;

  for (let round = 0; round < 2; round++) {
    let changed = false;
    const rep = cur.report;

    // Pannes de terrains : un terrain de base à la place de la carte la plus faible.
    if (rep.manaScrew > 0.12 || rep.keep7 < 0.72) {
      const out = weakest();
      const basic = neededBasic(cur.deck, ctx, true);
      if (out && basic) {
        changed =
          attempt(out.name, basic, without(out), cur.deck.bench, (b, a) =>
            `+1 terrain (${basic}) à la place de ${out.name} : pannes de terrains ${pct(b.manaScrew)} → ${pct(a.manaScrew)}, mains gardées ${pct(b.keep7)} → ${pct(a.keep7)}.`
          ) || changed;
      }
    }
    // Engorgement, ou aucune panne : un terrain de base en moins au profit de la meilleure carte du banc.
    if (rep.manaFlood > 0.14 || (rep.manaScrew < 0.04 && rep.keep7 > 0.85)) {
      const basic = neededBasic(cur.deck, ctx, false);
      const add = benchBest(() => true);
      if (basic && add) {
        changed =
          attempt(basic, add.name, [...cur.deck.picks, add], cur.deck.bench.filter((x) => x.key !== add.key), (b, a) =>
            `−1 terrain (${basic}) au profit de ${add.name} : la base de mana tenait largement (pannes ${pct(b.manaScrew)} → ${pct(a.manaScrew)}), indice ${b.score} → ${a.score}.`
          ) || changed;
      }
    }
    // Sorts bloqués par la couleur : un terrain de base de la couleur qui manque à la place de celle qui est en excès.
    if (rep.colorScrew > 0.08) {
      const add = neededBasic(cur.deck, ctx, true);
      const out = neededBasic(cur.deck, ctx, false);
      if (add && out && add !== out) {
        changed =
          attempt(out, add, cur.deck.picks, cur.deck.bench, (b, a) =>
            `1 ${out} remplacé par 1 ${add} : sorts bloqués faute de la bonne couleur ${pct(b.colorScrew)} → ${pct(a.colorScrew)} des tours.`
          ) || changed;
      }
    }
    // Mana mal dépensé : la carte chère la plus faible contre une carte du banc à 2 manas ou moins.
    if (rep.manaEfficiency < 0.72) {
      const out = weakest((f) => f.card.cmc >= 4);
      const add = benchBest((f) => !!f.card && f.card.cmc <= 2);
      if (out && add) {
        changed =
          attempt(out.name, add.name, [...without(out), add], cur.deck.bench.filter((x) => x.key !== add.key), (b, a) =>
            `${add.name} (${ctx.features.get(add.key)?.card.cmc ?? "?"} mana) à la place de ${out.name} : mana utilisé ${pct(b.manaEfficiency)} → ${pct(a.manaEfficiency)} sur les six premiers tours.`
          ) || changed;
      }
    }
    // Pas assez de réponses tôt : une interaction à 1-2 manas du banc.
    if (rep.interactionByT3 < (duel ? 0.5 : 0.3)) {
      const add = benchBest((f) => !!f.roles && f.roles.includes("cheapInteraction"));
      const out = weakest((f) => !f.roles.includes("cheapInteraction"));
      if (out && add) {
        changed =
          attempt(out.name, add.name, [...without(out), add], cur.deck.bench.filter((x) => x.key !== add.key), (b, a) =>
            `${add.name} à la place de ${out.name} : une réponse jouable dans les 3 premiers tours dans ${pct(b.interactionByT3)} → ${pct(a.interactionByT3)} des parties.`
          ) || changed;
      }
    }
    if (!changed) break;
  }
  return { trial: cur, notes };
}

/**
 * Optimise UN deck (possédé ou amélioré) : voir l'en-tête du fichier.
 * `base` : le deck déjà construit par le moteur d'avant pour ce contexte.
 */
export function optimizeDeck(ctx: OptimizeContext, base: BuiltDeck, maxPlans = 4): OptimizedDeck {
  const identity = unionIdentity(ctx.commanders);
  const commanderKeys = new Set(ctx.commanders.map((c) => c.name.toLowerCase()));
  const available: CardFeatures[] = [];
  for (const f of ctx.features.values()) {
    if (f.isLand || f.isBasic || commanderKeys.has(f.key)) continue;
    if (!f.card.color_identity.every((c) => identity.includes(c))) continue;
    if ((ctx.owned.get(f.key) ?? 0) <= 0 && !ctx.acquirable.has(f.key)) continue;
    available.push(f);
  }
  const duel = ctx.mode === "duel";
  // Duel : le deck de base suit déjà un plan (buildDeckForCommander) ; on n'essaie que les autres.
  const plans = proposePlans(ctx.commanders, available, ctx.mode, maxPlans).filter((p) => p.id !== base.plan?.id);
  const counter = { games: 0 };

  interface Variant {
    plan: BuildPlan | null;
    deck: BuiltDeck;
    report: PlaytestReport;
    synergy: SynergyReport;
    overall: number;
    solidity: number;
    rejected: boolean;
  }
  const measure = (plan: BuildPlan | null, deck: BuiltDeck): Variant => {
    const report = playtestOf(deck, ctx, SEARCH_GAMES, SEARCH_SEED);
    counter.games += SEARCH_GAMES;
    const synergy = synergyOf(deck, ctx);
    return { plan, deck, report, synergy, overall: overallOf(report.score, synergy.index), solidity: deckSolidity(deck, report.score).score, rejected: false };
  };
  const variants: Variant[] = [measure(base.plan, base)];
  for (const plan of plans) {
    const deck = buildDeckForCommander({ ...ctx, plan });
    const v = measure(plan, deck);
    v.rejected = !duel && palier(deck) <= palier(base) && deck.tier.powerIndex < base.tier.powerIndex - 3;
    variants.push(v);
  }
  const eligible = variants.filter((v) => !v.rejected);
  // Duel (04/10/2026) : l'indice de solidité départage les variantes — qualité
  // des cartes, forme, cohérence, parties simulées, tier. Multijoueur : règle
  // d'avant (palier de tier, puis parties simulées et synergies).
  if (duel) eligible.sort((a, b) => b.solidity - a.solidity || b.deck.tier.powerIndex - a.deck.tier.powerIndex);
  else eligible.sort((a, b) => palier(b.deck) - palier(a.deck) || b.overall - a.overall || b.deck.tier.powerIndex - a.deck.tier.powerIndex);
  const chosen = eligible[0];

  const repaired = repair({ deck: chosen.deck, report: chosen.report }, ctx, counter);
  const final = repaired.trial.deck;
  const playtest = playtestOf(final, ctx, FINAL_GAMES, FINAL_SEED);
  counter.games += FINAL_GAMES;

  return {
    deck: { ...final, plan: chosen.plan },
    playtest,
    synergy: synergyOf(final, ctx),
    plan: chosen.plan,
    variants: variants.map((v) => ({
      label: v.plan ? v.plan.label : "Moteur de base (tier, piliers, synergie avec le commandant)",
      origin: v.plan ? v.plan.origin : "base",
      why: v.plan ? v.plan.why : "La sélection d'avant les plans de jeu : sert de point de comparaison.",
      solidity: v.solidity,
      tierLabel: v.deck.tier.label,
      powerIndex: v.deck.tier.powerIndex,
      playtest: v.report.score,
      synergy: v.synergy.index,
      overall: v.overall,
      chosen: v === chosen,
      rejected: v.rejected,
    })),
    adjustments: repaired.notes,
    gamesPlayed: counter.games,
    solidity: deckSolidity(final, playtest.score),
    commander: commanderRating(final.commanders, ctx.mode),
  };
}

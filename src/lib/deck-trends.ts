import rawTrends from "@/data/deck-trends.json";
import { AXES, type RoleId } from "./mechanics";

/**
 * Lecture de src/data/deck-trends.json : ce que l'analyse des decks connus
 * a appris (scripts/learn-deck-trends.mts, 03/10/2026). Voir ce script pour
 * la méthode et ses limites ; ici, seulement l'accès typé et les règles de
 * prudence sur ce qu'on accepte d'en tirer.
 */

export interface Range {
  p25: number;
  median: number;
  p75: number;
}

export interface AxisTrend {
  baseProducers: number;
  builtProducers: Range;
  builtRewarders: number;
  lift: number;
  builtShare: number;
  support: number;
  examples: string[];
}

export interface Recipe {
  id: string;
  label: string;
  summary: string;
  share: number;
  commanders: number;
  decks: number;
  examples: string[];
  roles: Record<RoleId, Range>;
  lands: Range;
  avgCmc: number;
  colors: Record<string, number>;
  z: Record<string, number>;
}

interface TrendsFile {
  generatedAt: string;
  sources: { duel: { decks: number; commanders: number; period: string | null; origin: string }; multi: { decks: number; origin: string } };
  axes: Record<string, { duel: AxisTrend | null; multi: AxisTrend | null }>;
  axisPairs: { duel: { a: string; b: string; lift: number; support: number }[]; multi: { a: string; b: string; lift: number; support: number }[] };
  recipes: Recipe[];
  roleLabels: Record<string, string>;
}

const FILE = rawTrends as unknown as TrendsFile;

export const TRENDS_INFO = { generatedAt: FILE.generatedAt, ...FILE.sources };
export const RECIPES: readonly Recipe[] = FILE.recipes;
export const ROLE_LABELS: Record<string, string> = FILE.roleLabels;

export type TrendMode = "duel" | "multi";

export interface AxisTarget {
  /** Nombre de producteurs que les decks construits autour de l'axe alignent (médiane). */
  target: number;
  lift: number;
  /** D'où vient le chiffre : le mode demandé, l'autre mode (extrapolé), ou une valeur par défaut. */
  source: TrendMode | "default";
  /** Les decks connus construisent-ils vraiment autour de cet axe ? (assez de cas, densité nette) */
  validated: boolean;
}

/**
 * Une tendance n'est retenue que si elle repose sur au moins 5 cas, que la
 * densité observée est d'au moins 3 producteurs et que les decks construits
 * autour de l'axe en alignent au moins 30% de plus que les autres. Sinon
 * l'axe n'est pas « validé » : on peut encore l'essayer, mais avec une cible
 * par défaut et sans le présenter comme une pratique observée.
 */
function usable(t: AxisTrend | null): t is AxisTrend {
  return !!t && t.support >= 5 && t.builtProducers.median >= 3 && t.lift >= 1.3;
}

/** Cible par défaut quand aucun deck connu ne renseigne l'axe. */
const DEFAULT_TARGET = 8;

const TARGET_CACHE = new Map<string, AxisTarget>();

export function axisTarget(axisId: string, mode: TrendMode): AxisTarget {
  const key = `${axisId}:${mode}`;
  const hit = TARGET_CACHE.get(key);
  if (hit) return hit;
  const entry = FILE.axes[axisId];
  const own = entry?.[mode] ?? null;
  const other = entry?.[mode === "duel" ? "multi" : "duel"] ?? null;
  let out: AxisTarget;
  if (usable(own)) out = { target: own.builtProducers.median, lift: own.lift, source: mode, validated: true };
  else if (usable(other)) out = { target: other.builtProducers.median, lift: other.lift, source: mode === "duel" ? "multi" : "duel", validated: true };
  else out = { target: DEFAULT_TARGET, lift: 1, source: "default", validated: false };
  TARGET_CACHE.set(key, out);
  return out;
}

/** Cibles de tous les axes, dans l'ordre de AXES. */
export function axisTargets(mode: TrendMode): AxisTarget[] {
  return AXES.map((a) => axisTarget(a.id, mode));
}

/** Axes construits ensemble plus souvent que le hasard dans les decks connus (lift ≥ 1.3), 1 sinon. */
export function pairLift(a: string, b: string, mode: TrendMode): number {
  const find = (list: TrendsFile["axisPairs"]["duel"]) => list.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))?.lift;
  return find(FILE.axisPairs[mode]) ?? find(FILE.axisPairs[mode === "duel" ? "multi" : "duel"]) ?? 1;
}

export function recipeById(id: string): Recipe | null {
  return RECIPES.find((r) => r.id === id) ?? null;
}

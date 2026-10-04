import type { ScryfallCard } from "./types";

/**
 * Budget en euros (04/10/2026, demande de Ben : « une interface où on rentre
 * les cartes de sa collection et un budget, et le site retourne les decks
 * Duel les plus optimisés avec ce budget + les cartes possédées » ; budget
 * STRICT, avec une section « pour quelques euros de plus »).
 *
 * Ce fichier ne contient que le calcul pur, sans dépendance au moteur :
 * lecture du prix d'une carte et choix des achats sous un plafond.
 *
 * Limites, à garder en tête :
 * - le prix est celui que Scryfall renvoie pour L'IMPRESSION qu'il a choisie
 *   (`prices.eur`, tendance Cardmarket d'après la documentation Scryfall —
 *   non revérifié ici). Une autre impression de la même carte peut coûter
 *   moins cher ; le site ne cherche pas la moins chère ;
 * - sans prix en euros (carte trop récente, impression sans cote), la carte
 *   n'est PAS proposée à l'achat : un budget strict ne peut pas reposer sur
 *   un prix inconnu ;
 * - ni frais de port, ni état de la carte, ni disponibilité.
 */

/** Budget maximal accepté (au-delà, l'entrée est ramenée à cette valeur). */
export const MAX_BUDGET_EUR = 1000;

/** Prix en euros de la carte, null si Scryfall n'en donne pas. */
export function cardPriceEur(card: ScryfallCard): number | null {
  const v = card.prices?.eur ?? null;
  const n = v ? Number.parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Normalise un budget saisi : nombre fini, 0 à MAX_BUDGET_EUR, au centime. null si illisible. */
export function normalizeBudget(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(MAX_BUDGET_EUR, n) * 100) / 100;
}

export interface BudgetItem {
  key: string;
  /** Prix en euros (> 0). */
  price: number;
  /** Apport estimé (> 0), dans l'unité de la note du moteur. */
  gain: number;
}

/** Pas du calcul : 5 centimes. Les prix sont arrondis AU-DESSUS, le budget EN DESSOUS — le plafond n'est jamais dépassé. */
const STEP_EUR = 0.05;

/**
 * Choix des achats qui maximise la somme des apports sans dépasser `budget`
 * (problème du sac à dos, résolu exactement par programmation dynamique au
 * pas de 5 centimes). Renvoie les clés retenues.
 *
 * « Exactement » vaut pour les apports fournis : ceux-ci sont une estimation
 * du moteur (voir buildWithEuroBudget, competitive-builder.ts), pas une
 * mesure de taux de victoire.
 */
export function selectWithinBudget(items: readonly BudgetItem[], budget: number): Set<string> {
  const cap = Math.floor(budget / STEP_EUR + 1e-9);
  const usable = items
    .filter((it) => it.gain > 0 && it.price > 0)
    .map((it) => ({ ...it, w: Math.max(1, Math.ceil(it.price / STEP_EUR - 1e-9)) }))
    .filter((it) => it.w <= cap);
  if (cap <= 0 || usable.length === 0) return new Set();
  // best[c] = meilleur apport total pour un coût ≤ c ; take[i][c] = l'objet i est-il pris à ce coût ?
  const best = new Float64Array(cap + 1);
  const take: Uint8Array[] = [];
  for (const it of usable) {
    const row = new Uint8Array(cap + 1);
    for (let c = cap; c >= it.w; c--) {
      const v = best[c - it.w] + it.gain;
      if (v > best[c] + 1e-9) {
        best[c] = v;
        row[c] = 1;
      }
    }
    take.push(row);
  }
  const chosen = new Set<string>();
  let c = cap;
  for (let i = usable.length - 1; i >= 0; i--) {
    if (take[i][c]) {
      chosen.add(usable[i].key);
      c -= usable[i].w;
    }
  }
  return chosen;
}

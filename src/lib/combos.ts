import { COMBOS, type ComboDef } from "@/data/combos";

/**
 * Détection de combos par NOMS de cartes (25/09/2026). Fonctions pures.
 *
 * Deux sources possibles, même format `ComboDef` :
 * - la base curatée `src/data/combos.ts` (repli hors ligne, toujours
 *   disponible) ;
 * - les combos renvoyées EN DIRECT par Commander Spellbook
 *   (spellbook.ts, `find-my-combos`), converties par l'appelant — bien plus
 *   complètes (des dizaines de milliers de combos), utilisées dès que l'API
 *   répond.
 * Chaque fonction prend la liste à utiliser en paramètre (curatée par défaut).
 */

export type { ComboDef };
export { COMBOS as CURATED_COMBOS };

const lowerPieces = (defs: readonly ComboDef[]) => defs.map((c) => c.pieces.map((p) => p.toLowerCase()));
const CURATED_LOWER = lowerPieces(COMBOS);

/** Noms (minuscules) de toutes les pièces de la base curatée. */
export const ALL_COMBO_PIECES: ReadonlySet<string> = new Set(CURATED_LOWER.flat());

export function comboPieceSet(defs: readonly ComboDef[] = COMBOS): Set<string> {
  return new Set(defs.flatMap((c) => c.pieces.map((p) => p.toLowerCase())));
}

/** Noms exacts (casse Scryfall) de toutes les pièces curatées — pour les résoudre auprès de Scryfall. */
export function allComboPieceNames(): string[] {
  return Array.from(new Set(COMBOS.flatMap((c) => c.pieces)));
}

/** Combos dont TOUTES les pièces sont dans `names` (commandants inclus par l'appelant). */
export function findCompleteCombos(names: Iterable<string>, defs: readonly ComboDef[] = COMBOS): ComboDef[] {
  const set = new Set(Array.from(names, (n) => n.toLowerCase()));
  const lower = defs === COMBOS ? CURATED_LOWER : lowerPieces(defs);
  return defs.filter((_, i) => lower[i].every((p) => set.has(p)));
}

/** Fusionne des listes de combos en dédoublonnant par ensemble de pièces. */
export function mergeCombos(...lists: readonly (readonly ComboDef[])[]): ComboDef[] {
  const seen = new Set<string>();
  const out: ComboDef[] = [];
  for (const list of lists) {
    for (const c of list) {
      const key = c.pieces.map((p) => p.toLowerCase()).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

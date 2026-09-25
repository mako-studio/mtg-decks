import { COMBOS, type ComboDef } from "@/data/combos";

/**
 * Détection de combos connues (25/09/2026, constructeur compétitif — voir
 * src/data/combos.ts pour la provenance et les limites de la base).
 * Purement par NOMS de cartes : fonctions pures, aucun appel réseau.
 */

export type { ComboDef };

const COMBO_PIECES_LOWER = COMBOS.map((c) => c.pieces.map((p) => p.toLowerCase()));

/** Noms (minuscules) de toutes les pièces de combo connues. */
export const ALL_COMBO_PIECES: ReadonlySet<string> = new Set(COMBO_PIECES_LOWER.flat());

/** Noms exacts (casse Scryfall) de toutes les pièces — pour les résoudre auprès de Scryfall. */
export function allComboPieceNames(): string[] {
  return Array.from(new Set(COMBOS.flatMap((c) => c.pieces)));
}

/** Combos dont TOUTES les pièces sont dans `names` (commandant inclus par l'appelant). */
export function findCompleteCombos(names: Iterable<string>): ComboDef[] {
  const set = new Set(Array.from(names, (n) => n.toLowerCase()));
  return COMBOS.filter((_, i) => COMBO_PIECES_LOWER[i].every((p) => set.has(p)));
}

/**
 * Combos réalisables avec l'ensemble `available` (cartes que le
 * constructeur PEUT mettre dans le deck : commandant + pool éligible),
 * avec leurs pièces. Sert à donner un bonus de sélection aux deux pièces
 * d'une combo quand les deux sont disponibles — sans bonus, chaque pièce
 * évaluée isolément peut sembler médiocre (ex. Dramatic Reversal seul).
 */
export function achievableCombos(available: Iterable<string>): ComboDef[] {
  return findCompleteCombos(available);
}

/**
 * Combos auxquelles il ne manque que des pièces présentes dans
 * `acquirable` (cartes hors collection que le pool recommandé peut
 * proposer), sachant `owned` (commandant + cartes possédées éligibles).
 * Retourne seulement les combos dont au moins une pièce est déjà possédée
 * (sinon ce n'est pas "compléter une combo", c'est en acheter une entière).
 */
export function completableCombos(
  owned: Iterable<string>,
  acquirable: Iterable<string>
): { combo: ComboDef; missing: string[] }[] {
  const ownedSet = new Set(Array.from(owned, (n) => n.toLowerCase()));
  const acqSet = new Set(Array.from(acquirable, (n) => n.toLowerCase()));
  const out: { combo: ComboDef; missing: string[] }[] = [];
  COMBOS.forEach((combo, i) => {
    const pieces = COMBO_PIECES_LOWER[i];
    const ownedCount = pieces.filter((p) => ownedSet.has(p)).length;
    if (ownedCount === 0 || ownedCount === pieces.length) return;
    const missing = combo.pieces.filter((p) => !ownedSet.has(p.toLowerCase()));
    if (missing.every((m) => acqSet.has(m.toLowerCase()))) out.push({ combo, missing });
  });
  return out;
}

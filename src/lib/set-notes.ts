import rawSetNotes from "@/data/set-notes.json";
import type { SetNote } from "./types";

/**
 * Contenu recherché (pas rédigé de mémoire) pour chacun des ~58 sets
 * suivis par le site : mécaniques réellement introduites par ce set
 * précis (voir SetNote dans types.ts) + contexte utile au deckbuilding.
 * Produit le 26-27/08/2026 via des agents de recherche web indépendants
 * (un par lot de ~5 sets), avec consigne explicite de distinguer "ce
 * produit introduit X" de "ce produit utilise X, introduit ailleurs" —
 * voir README "Mécaniques introduites par set (26-27/08/2026)" pour la
 * méthodologie complète et ses limites.
 *
 * Même pattern d'import que commander-decks.json (précon-decks.ts) :
 * fichier JSON généré, importé directement et typé via une assertion
 * (`resolveJsonModule` activé dans tsconfig.json).
 */
const SET_NOTES = rawSetNotes as Record<string, SetNote>;

/** `null` si aucune recherche n'existe pour ce code (ne devrait pas arriver pour un set de TRACKED_SETS). */
export function getSetNote(code: string): SetNote | null {
  return SET_NOTES[code] ?? null;
}

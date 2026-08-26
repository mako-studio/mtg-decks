import type { PreconDeck } from "./types";
import rawDecks from "@/data/commander-decks.json";

/**
 * Liste des decks Commander préconstruits officiels.
 *
 * Source des données : dataset communautaire "magic-preconstructed-decks-data"
 * (https://github.com/taw/magic-preconstructed-decks-data), qui agrège les
 * decklists officielles publiées par Wizards of the Coast. Snapshot généré
 * localement via `npm run fetch-decks` -> src/data/commander-decks.json.
 *
 * Ce fichier est statique (pas d'appel réseau à l'exécution) : relancer le
 * script pour intégrer les nouveaux decks Commander à leur sortie.
 */
const decks = rawDecks as PreconDeck[];

export function getAllPreconDecks(): PreconDeck[] {
  return decks;
}

export function getPreconDeckById(id: string): PreconDeck | null {
  return decks.find((d) => d.id === id) ?? null;
}

export function getAllSetNames(): string[] {
  return Array.from(new Set(decks.map((d) => d.setName))).sort();
}

import type { LocalizedText } from "./actions";

/**
 * Cache mémoire partagé entre CardTile et SuggestionCard : évite de
 * redemander la traduction FR d'une même carte à chaque ouverture/
 * fermeture, ou si elle apparaît à la fois dans le deck et les
 * suggestions. Volatile (perdu au rechargement) — ce n'est qu'une
 * optimisation, pas une persistance.
 */
const cache = new Map<string, LocalizedText | null>();

export function hasCachedTranslation(name: string): boolean {
  return cache.has(name.toLowerCase());
}
export function getCachedTranslation(name: string): LocalizedText | null | undefined {
  return cache.get(name.toLowerCase());
}
export function setCachedTranslation(name: string, value: LocalizedText | null): void {
  cache.set(name.toLowerCase(), value);
}

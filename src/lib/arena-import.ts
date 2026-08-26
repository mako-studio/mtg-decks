import type { ParsedArenaDeck, PreconDeck } from "./types";

/**
 * Convertit un deck importé (texte Arena parsé) vers la même forme
 * `PreconDeck` que les decks préconstruits, pour réutiliser tel quel tout
 * le pipeline d'enrichissement/score/suggestions.
 *
 * Le commandant, quand il est présent, est retiré de la liste "cards"
 * générale : l'export Arena natif liste le commandant à la fois dans la
 * section "Commander" et dans la section "Deck" (vérifié sur un export
 * réel de deck Brawl), donc sans ce filtre il serait compté deux fois.
 */
export function arenaImportToPreconDeck(parsed: ParsedArenaDeck, name = "Deck importé"): PreconDeck {
  const commanderName = parsed.commander?.name ?? null;

  const cards = parsed.deck
    .filter((c) => c.name !== commanderName)
    .map((c) => ({ name: c.name, count: c.amount }));

  return {
    id: "imported",
    name,
    setCode: "",
    setName: "Deck importé",
    releaseDate: "",
    commanders: commanderName ? [commanderName] : [],
    cardCount: cards.reduce((sum, c) => sum + c.count, 0) + (commanderName ? 1 : 0),
    cards,
    source: null,
  };
}

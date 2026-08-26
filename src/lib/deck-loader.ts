import type { EnrichedCard, FormatConfig, PreconDeck, ScryfallCard } from "./types";
import { getCardsByNames } from "./scryfall";

const WUBRG_ORDER = ["W", "U", "B", "R", "G"];

function sortedColorIdentity(colors: Iterable<string>): string[] {
  const set = new Set(colors);
  return WUBRG_ORDER.filter((c) => set.has(c));
}

/**
 * Résout toutes les cartes d'un deck (commandant(s) + mainboard) auprès de
 * Scryfall en un minimum d'appels (`/cards/collection`).
 *
 * Pour les formats à commandant, l'identité couleur est celle du/des
 * commandant(s) (règle Commander/Brawl). Pour les formats constructed
 * sans commandant, elle est déduite de l'union des identités couleur des
 * cartes du deck (convention usuelle : "les couleurs du deck").
 */
export async function loadEnrichedDeck(
  deck: PreconDeck,
  format: FormatConfig
): Promise<{
  commanderCards: ScryfallCard[];
  cards: EnrichedCard[];
  colorIdentity: string[];
}> {
  const allNames = [...deck.commanders, ...deck.cards.map((c) => c.name)];
  const byName = await getCardsByNames(allNames);

  const commanderCards = deck.commanders
    .map((name) => byName.get(name.toLowerCase()))
    .filter((c): c is ScryfallCard => Boolean(c));

  const cards: EnrichedCard[] = [
    ...deck.commanders.map((name) => ({
      name,
      count: 1,
      isCommander: true,
      card: byName.get(name.toLowerCase()) ?? null,
    })),
    ...deck.cards.map((c) => ({
      name: c.name,
      count: c.count,
      isCommander: false,
      card: byName.get(c.name.toLowerCase()) ?? null,
    })),
  ];

  let colorIdentity: string[];
  if (format.hasCommander) {
    const colorIdentitySet = new Set<string>();
    for (const c of commanderCards) {
      for (const color of c.color_identity) colorIdentitySet.add(color);
    }
    colorIdentity = sortedColorIdentity(colorIdentitySet);
  } else {
    const colorSet = new Set<string>();
    for (const entry of cards) {
      if (!entry.card) continue;
      for (const color of entry.card.color_identity) colorSet.add(color);
    }
    colorIdentity = sortedColorIdentity(colorSet);
  }

  return { commanderCards, cards, colorIdentity };
}

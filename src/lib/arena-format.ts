import type { ArenaCardLine, ParsedArenaDeck, ScryfallCard } from "./types";

/**
 * Parsing/génération du format texte d'import-export de MTG Arena.
 *
 * Le client Arena n'a pas de spécification officielle publiée pour ce
 * format. La logique ci-dessous reproduit fidèlement le comportement de
 * la bibliothèque open-source `mtg-decklist-parser`
 * (https://github.com/im-sticky/mtg-decklist-parser, MIT), qui est
 * spécifiquement conçue pour parser des decklists MTGO & Arena et que
 * j'ai pu inspecter directement (src/decklist.js, src/cardModel.js) —
 * plutôt que de deviner le format, je m'appuie sur cette implémentation
 * de référence vérifiée.
 *
 * Règles :
 * - Une ligne de carte : `<quantité> <nom> (<SET>) <numéro de collection>`
 *   ex. "4 Lightning Bolt (STA) 42". Set et numéro sont optionnels.
 * - Sections marquées par une ligne exactement "Deck", "Sideboard",
 *   "Commander" ou "Companion" (insensible à la casse).
 * - Si le texte ne commence pas par un en-tête, on suppose "Deck".
 * - Une ligne vide alors qu'on est dans "Deck" bascule implicitement en
 *   "Sideboard" (comportement natif de l'export Arena : le deck principal
 *   et le sideboard sont séparés par une ligne vide, sans en-tête explicite).
 */

const HEADER = {
  deck: /^deck$/i,
  sideboard: /^sideboard$/i,
  commander: /^commander$/i,
  companion: /^companion$/i,
};

const AMOUNT_RE = /^\d+/;
const COLLECTOR_RE = /\d+\s*$/;
const SET_RE = /[([]([A-Za-z0-9]+)[)\]]/;

function parseCardLine(line: string): ArenaCardLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const amountMatch = trimmed.match(AMOUNT_RE);
  const setMatch = trimmed.match(SET_RE);
  const collectorMatch = trimmed.match(COLLECTOR_RE);

  const name = trimmed
    .replace(AMOUNT_RE, "")
    .replace(SET_RE, "")
    .replace(COLLECTOR_RE, "")
    .trim();

  if (!name) return null;

  return {
    name,
    amount: amountMatch ? parseInt(amountMatch[0], 10) : 1,
    set: setMatch ? setMatch[1].toUpperCase() : undefined,
    collector: collectorMatch ? parseInt(collectorMatch[0], 10) : undefined,
  };
}

type Section = "unstarted" | "commander" | "companion" | "deck" | "sideboard";

export function parseArenaDeck(rawInput: string): ParsedArenaDeck {
  const result: ParsedArenaDeck = {
    valid: false,
    deck: [],
    sideboard: [],
    commander: null,
    companion: null,
  };

  if (!rawInput || !rawInput.trim()) return result;

  let section: Section = "unstarted";

  try {
    for (const rawLine of rawInput.trim().split(/\r?\n/)) {
      const line = rawLine.trim();

      if (HEADER.commander.test(line)) {
        section = "commander";
        continue;
      }
      if (HEADER.companion.test(line)) {
        section = "companion";
        continue;
      }
      if (HEADER.deck.test(line)) {
        section = "deck";
        continue;
      }
      if (section === "unstarted" && line.length > 0) {
        section = "deck";
      } else if (HEADER.sideboard.test(line) || (section === "deck" && line.length === 0)) {
        section = "sideboard";
        continue;
      } else if (line.length === 0) {
        continue;
      }

      const card = parseCardLine(line);
      if (!card) continue;

      switch (section) {
        case "commander":
          result.commander = card;
          break;
        case "companion":
          result.companion = card;
          break;
        case "deck":
          result.deck.push(card);
          break;
        case "sideboard":
          result.sideboard.push(card);
          break;
      }
    }
    result.valid = result.deck.length > 0 || result.commander !== null;
  } catch {
    result.valid = false;
  }

  return result;
}

/**
 * Génère un texte au format d'import Arena à partir de cartes résolues
 * Scryfall (utilise set + numéro de collection réels de l'impression
 * retournée par l'API, donc reproductibles dans le client Arena).
 */
export function serializeArenaDeck(params: {
  commander?: { card: ScryfallCard; count: number } | null;
  deck: { card: ScryfallCard; count: number }[];
  sideboard?: { card: ScryfallCard; count: number }[];
}): string {
  const lines: string[] = [];
  const cardLine = (card: ScryfallCard, count: number) =>
    `${count} ${card.name} (${card.set.toUpperCase()}) ${card.collector_number}`;

  if (params.commander) {
    lines.push("Commander");
    lines.push(cardLine(params.commander.card, params.commander.count));
    lines.push("");
  }

  lines.push("Deck");
  for (const { card, count } of params.deck) {
    lines.push(cardLine(card, count));
  }

  if (params.sideboard && params.sideboard.length > 0) {
    lines.push("");
    lines.push("Sideboard");
    for (const { card, count } of params.sideboard) {
      lines.push(cardLine(card, count));
    }
  }

  return lines.join("\n");
}

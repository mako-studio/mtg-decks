import type { FormatKey, PreconDeck } from "./types";
import brawlDecksRaw from "@/data/arena-brawl-decks.json";
import starterDecksRaw from "@/data/arena-starter-decks.json";

/**
 * Decks "de départ" liés à Arena, issus du même dataset vérifié que les
 * precons Commander papier (voir src/lib/precon-decks.ts et
 * scripts/fetch-precon-decks.mjs).
 *
 * ⚠️ Ce ne sont pas des decks Arena "natifs" : ce sont des produits
 * papier officiels (Brawl Decks 2019, Arena Starter Decks/Kits) dont on
 * réutilise la liste de cartes comme point de départ. Leur légalité
 * actuelle sur Arena (format, rotation, disponibilité numérique) n'est
 * pas garantie par cette liste — elle est vérifiée à la volée via
 * Scryfall (`games` + `legalities`) au moment de l'analyse, avec le même
 * système de dégradation ("non trouvée" / "illégale") que le reste du site.
 */
const brawlDecks = brawlDecksRaw as PreconDeck[];
const starterDecks = starterDecksRaw as PreconDeck[];

export function getBrawlPreconDecks(): PreconDeck[] {
  return brawlDecks;
}

export function getArenaStarterDecks(): PreconDeck[] {
  return starterDecks;
}

export function getArenaGalleryDecks(format: FormatKey): PreconDeck[] {
  return format === "brawl" || format === "historicbrawl" ? brawlDecks : starterDecks;
}

export function getArenaDeckById(id: string): PreconDeck | null {
  return (
    brawlDecks.find((d) => d.id === id) ?? starterDecks.find((d) => d.id === id) ?? null
  );
}

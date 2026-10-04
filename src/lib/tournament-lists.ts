import listsData from "@/data/duel-tournament-lists.json";
import { foldName } from "./card-name";

/**
 * Decks de tournoi Duel Commander presque complets dans une collection
 * (04/10/2026, retour de Ben : « j'ai mis à jour ma liste avec des cartes
 * d'un deck gagnant Vivi […] l'algo ne reconnaît pas le deck »).
 *
 * Le moteur raisonne en PARTS (« jouée par 60 % des decks de ces
 * couleurs ») : une liste réelle mais atypique — celle de Ben contient Final
 * Fortune, Roaming Throne, Spark Double, jouées par 1 ou 2 des 13 decks Vivi
 * de l'archive — ne ressort donc jamais de ces moyennes. Ici on compare la
 * collection à CHAQUE liste de l'archive, carte par carte.
 *
 * Données : src/data/duel-tournament-lists.json (scripts/duel-lists.mjs).
 * Limites : noms tels que mtgtop8 les écrit, rapprochés par la face avant
 * sans accents (une carte renommée ou une erreur de saisie de mtgtop8 compte
 * comme manquante) ; les terrains de base sont supposés disponibles et ne
 * comptent pas ; le commandant n'est pas compté dans la part possédée.
 */

interface RawList {
  i: string;
  e: string;
  d: string | null;
  c: string[];
  k: number[];
  b: Record<string, number>;
}
const DATA = listsData as unknown as { period?: string | null; names?: string[]; decks?: RawList[] };
const NAMES = DATA.names ?? [];
const DECKS = DATA.decks ?? [];

/** Clé de rapprochement : face avant, minuscules, sans accents (« Fire/Ice » et « Fire // Ice » → « fire »). */
export function listCardKey(name: string): string {
  return foldName(name).split(/\s*\/\/?\s*/)[0].trim();
}
const NAME_KEYS = NAMES.map(listCardKey);

export const TOURNAMENT_LISTS_INFO = { decks: DECKS.length, period: DATA.period ?? null };

export interface TournamentMatch {
  commanders: string[];
  deckId: string;
  url: string;
  date: string | null;
  /** Cartes hors terrains de base. */
  total: number;
  ownedCount: number;
  /** ownedCount / total. */
  share: number;
  /** Cartes de la liste absentes de la collection (noms mtgtop8). */
  missing: string[];
  /** La liste entière, terrains de base compris. */
  cards: { name: string; count: number }[];
}

/**
 * Listes de tournoi les plus proches de la collection : la meilleure liste
 * de CHAQUE commandant (ou duo), de la plus complète à la moins complète.
 * `ownedNames` : noms des cartes possédées (toute orthographe Scryfall).
 * À part égale, la liste la plus récente passe devant.
 */
export function closestTournamentLists(ownedNames: Iterable<string>, options: { minShare?: number; limit?: number } = {}): TournamentMatch[] {
  const minShare = options.minShare ?? 0.4;
  const limit = options.limit ?? 12;
  const owned = new Set<string>();
  for (const n of ownedNames) owned.add(listCardKey(n));
  const best = new Map<string, { deck: RawList; ownedCount: number; share: number }>();
  for (const deck of DECKS) {
    if (deck.k.length === 0) continue;
    let ownedCount = 0;
    for (const idx of deck.k) if (owned.has(NAME_KEYS[idx])) ownedCount++;
    const share = ownedCount / deck.k.length;
    if (share < minShare) continue;
    const key = deck.c.map(listCardKey).sort().join(" + ");
    const known = best.get(key);
    if (!known || share > known.share || (share === known.share && (deck.d ?? "") > (known.deck.d ?? ""))) best.set(key, { deck, ownedCount, share });
  }
  return Array.from(best.values())
    .sort((a, b) => b.share - a.share || (b.deck.d ?? "").localeCompare(a.deck.d ?? ""))
    .slice(0, limit)
    .map(({ deck, ownedCount, share }) => ({
      commanders: deck.c,
      deckId: deck.i,
      url: `https://mtgtop8.com/event?e=${deck.e}&d=${deck.i}&f=EDH`,
      date: deck.d,
      total: deck.k.length,
      ownedCount,
      share,
      missing: deck.k.filter((idx) => !owned.has(NAME_KEYS[idx])).map((idx) => NAMES[idx]),
      cards: [...deck.k.map((idx) => ({ name: NAMES[idx], count: 1 })), ...Object.entries(deck.b).map(([name, count]) => ({ name, count }))],
    }));
}

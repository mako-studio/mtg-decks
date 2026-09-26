import profilesData from "@/data/duel-color-profiles.json";

/**
 * Profils des decks de tournoi Duel Commander PAR IDENTITÉ COULEUR
 * (26/09/2026, demande de Ben : « inspire-toi des decks mtgtop8 pour les
 * terrains de base et spéciaux et les patterns de deckbuilding »). Données
 * générées par scripts/fetch-duel-meta.mjs (computeColorProfiles).
 *
 * Pourquoi par identité exacte plutôt que « part des decks qui PEUVENT jouer
 * la carte » (cardsInColors de duel-meta.json) : Scalding Tarn (incolore) est
 * jouable par tous les decks et y figure à ~60%, mais un deck mono-blanc ne
 * la joue presque jamais — seule la part mesurée DANS les decks mono-blancs
 * le dit. Idem pour le nombre de terrains de base : ~25 en mono-blanc,
 * ~9 en bicolore, ~4 en tricolore (médianes de l'échantillon).
 *
 * Identités peu représentées : on mélange avec les identités voisines
 * (une couleur de différence : poids 0,3 ; deux : 0,08), pondérées par
 * leur nombre de decks. Ces poids sont un choix de conception.
 */

interface RawIdentity {
  decks: number;
  stats: Record<string, number>;
  cards: Record<string, number>;
}
const RAW = profilesData as { period?: string | null; identities?: Record<string, RawIdentity> };

const WUBRG = ["W", "U", "B", "R", "G"];

export function identityKey(colors: readonly string[]): string {
  return WUBRG.filter((c) => colors.includes(c)).join("") || "C";
}
function colorsOf(key: string): string[] {
  return key === "C" ? [] : key.split("");
}

interface Group {
  key: string;
  colors: string[];
  decks: number;
  stats: Record<string, number>;
  /** Part par carte, clé : face avant en minuscules. */
  cards: Map<string, number>;
}
const GROUPS: Group[] = Object.entries(RAW.identities ?? {}).map(([key, g]) => ({
  key,
  colors: colorsOf(key),
  decks: g.decks,
  stats: g.stats,
  cards: new Map(Object.entries(g.cards).map(([n, s]) => [n.toLowerCase().split(" // ")[0], s])),
}));

function similarity(a: string[], b: string[]): number {
  const diff = a.filter((c) => !b.includes(c)).length + b.filter((c) => !a.includes(c)).length;
  return diff === 0 ? 1 : diff === 1 ? 0.3 : diff === 2 ? 0.08 : 0;
}

export const DUEL_PROFILES_AVAILABLE = GROUPS.length > 0;
export const DUEL_PROFILES_INFO = {
  period: RAW.period ?? null,
  decks: GROUPS.reduce((s, g) => s + g.decks, 0),
};

const presenceCache = new Map<string, number>();

/**
 * Part des decks de tournoi d'identité `deckColors` (et voisines) qui jouent
 * la carte. Seules les identités qui PEUVENT jouer la carte (son identité
 * incluse dans la leur) comptent au dénominateur. 0 si inconnue.
 */
export function duelPresenceForIdentity(cardName: string, cardColors: readonly string[], deckColors: readonly string[]): number {
  const deckKey = identityKey(deckColors);
  const nameKey = cardName.toLowerCase().split(" // ")[0];
  const cacheKey = `${deckKey}|${nameKey}`;
  const hit = presenceCache.get(cacheKey);
  if (hit !== undefined) return hit;
  const target = colorsOf(deckKey);
  let num = 0;
  let den = 0;
  for (const g of GROUPS) {
    const w = similarity(target, g.colors);
    if (w === 0 || !cardColors.every((c) => g.colors.includes(c))) continue;
    num += w * g.decks * (g.cards.get(nameKey) ?? 0);
    den += w * g.decks;
  }
  const v = den > 0 ? num / den : 0;
  presenceCache.set(cacheKey, v);
  return v;
}

export interface DuelIdentityStats {
  /** Decks réellement comptés (identité exacte). */
  exactDecks: number;
  lands: number;
  basics: number;
  fetches: number;
  avgCmc: number;
}

/**
 * Médianes (mélangées avec les identités de MÊME nombre de couleurs quand
 * l'identité exacte a moins de 15 decks) : terrains, terrains de base,
 * fetchlands, coût moyen. null sans données.
 */
export function duelStatsForIdentity(deckColors: readonly string[]): DuelIdentityStats | null {
  if (!DUEL_PROFILES_AVAILABLE) return null;
  const key = identityKey(deckColors);
  const exact = GROUPS.find((g) => g.key === key);
  const n = colorsOf(key).length;
  const pool = exact && exact.decks >= 15 ? [exact] : GROUPS.filter((g) => g.colors.length === n);
  if (pool.length === 0) return null;
  const weight = (g: Group) => g.decks * (g.key === key ? 3 : 1);
  const total = pool.reduce((s, g) => s + weight(g), 0);
  const avg = (k: string) => pool.reduce((s, g) => s + (g.stats[k] ?? 0) * weight(g), 0) / total;
  return {
    exactDecks: exact?.decks ?? 0,
    lands: avg("lands"),
    basics: avg("basics"),
    fetches: avg("fetches"),
    avgCmc: avg("avgCmc"),
  };
}

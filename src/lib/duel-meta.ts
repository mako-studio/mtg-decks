import duelMeta from "@/data/duel-meta.json";

/**
 * Présence réelle des cartes dans les decks Duel Commander de tournoi
 * (25/09/2026, constructeur compétitif). Données : src/data/duel-meta.json,
 * généré par scripts/build-duel-meta.py depuis l'analyse mtgtop8 déjà
 * présente dans le repo (82 decks, 20 tournois, 01→04/09/2026).
 *
 * Utilisée comme signal de puissance OBJECTIF propre au Duel Commander, un
 * format pour lequel le système de Brackets/Game Changers de WotC (pensé
 * pour le multijoueur) est un repère imparfait : une carte jouée dans 40%
 * des decks de tournoi est, par construction, une carte que les joueurs
 * compétitifs jugent forte dans ce format.
 *
 * Limites assumées (à répéter dans l'UI/README) : échantillon court (4
 * jours, 82 decks) donc sensible aux archétypes du moment ; la part est
 * calculée sur TOUS les decks, donc une carte d'une couleur peu jouée dans
 * l'échantillon a mécaniquement une part plus faible qu'une carte incolore
 * ou d'une couleur dominante (le rouge et le blanc sont sur-représentés).
 * Les terrains de base sont ignorés (voir BASIC_NAMES) : leur présence ne
 * dit rien sur la puissance d'un deck.
 */

const CARDS: Record<string, number> = (duelMeta as { cards: Record<string, number> }).cards;
/**
 * Part parmi les decks dont l'identité couleur PERMET de jouer la carte
 * (25/09/2026 — produite par scripts/fetch-duel-meta.mjs ; absente du
 * fichier généré depuis l'ancien classeur xlsx). Sert au CHOIX des cartes
 * (competitive-builder.ts) ; le tier reste calibré sur `cards`.
 */
const CARDS_IN_COLORS: Record<string, number> =
  (duelMeta as { cardsInColors?: Record<string, number> }).cardsInColors ?? {};
const LOWER_IN_COLORS = new Map<string, number>(Object.entries(CARDS_IN_COLORS).map(([k, v]) => [k.toLowerCase(), v]));
const COMMANDERS: Record<string, number> = (duelMeta as { commanders: Record<string, number> }).commanders;

const LOWER_CARDS = new Map<string, number>(Object.entries(CARDS).map(([k, v]) => [k.toLowerCase(), v]));

const BASIC_NAMES = new Set(
  [
    "Plains",
    "Island",
    "Swamp",
    "Mountain",
    "Forest",
    "Wastes",
    "Snow-Covered Plains",
    "Snow-Covered Island",
    "Snow-Covered Swamp",
    "Snow-Covered Mountain",
    "Snow-Covered Forest",
    "Snow-Covered Wastes",
  ].map((n) => n.toLowerCase())
);

export const DUEL_META_INFO = {
  deckCount: (duelMeta as { deckCount: number }).deckCount,
  period: (duelMeta as { period: string | null }).period,
};

/** Part (0-1) des decks de tournoi de l'échantillon qui jouent cette carte. 0 si absente ou terrain de base. */
export function duelMetaPresence(name: string): number {
  const key = name.toLowerCase();
  if (BASIC_NAMES.has(key)) return 0;
  const direct = LOWER_CARDS.get(key);
  if (direct !== undefined) return direct;
  // Cartes recto-verso : l'échantillon peut n'avoir retenu que la face avant.
  const front = key.split(" // ")[0];
  return front !== key ? (LOWER_CARDS.get(front) ?? 0) : 0;
}

/**
 * Part « à couleurs égales » si disponible, sinon la part globale — pour
 * départager les cartes pendant la construction d'un deck Duel.
 */
export function duelMetaPresenceInColors(name: string): number {
  const key = name.toLowerCase();
  if (BASIC_NAMES.has(key)) return 0;
  const v = LOWER_IN_COLORS.get(key) ?? LOWER_IN_COLORS.get(key.split(" // ")[0]);
  return v ?? duelMetaPresence(name);
}

/** Noms des commandants joués dans l'échantillon (partenaires séparés), du plus joué au moins joué. */
export function duelMetaCommanderNames(): string[] {
  return Object.keys(COMMANDERS);
}

/** Toutes les cartes de l'échantillon joués dans au moins `minShare` des decks — source du pool recommandé en Duel. */
export function duelMetaCardNames(minShare = 0.05): string[] {
  return Object.entries(CARDS)
    .filter(([name, share]) => share >= minShare && !BASIC_NAMES.has(name.toLowerCase()))
    .map(([name]) => name);
}

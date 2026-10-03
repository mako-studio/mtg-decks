import rawRecent from "@/data/recent-set-cards.json";
import type { DeckCategory, ScryfallCard } from "./types";
import { classifyCard } from "./deck-score";
import { isCommanderEligible } from "./collection-builder";

/**
 * Cartes NOUVELLES des dernières extensions (03/10/2026, demande de Ben
 * pour Reality Fracture : « les ajouter à la DB des cartes et les
 * classifier pour pouvoir être utilisées dans tous les outils du site »).
 *
 * Le problème : le site n'a pas de base de cartes, tout vient de Scryfall en
 * direct — une carte sortie hier est donc déjà analysable dès qu'on la colle
 * dans un deck. Mais elle n'était jamais PROPOSÉE : les suggestions
 * (recommend.ts) et le pool du constructeur (competitive-actions.ts)
 * interrogent Scryfall trié par popularité EDHREC, première page seulement.
 * Une carte neuve n'a pas encore de rang : elle arrive en dernier et ne
 * passe jamais le filtre de la première page.
 *
 * La réponse : `src/data/recent-set-cards.json`, la liste des cartes
 * nouvelles avec leur coût, type, texte et identité couleur. Elle sert
 * uniquement à savoir QUELS NOMS demander à Scryfall, même logique que
 * competitive-staples.ts (« des noms à évaluer, jamais imposés ») :
 * 1. ce module choisit les noms pertinents (identité couleur, pilier) à
 *    partir des données locales, avec le même `classifyCard` que le reste
 *    du site (une seule formule) ;
 * 2. l'appelant les résout via `getCardsByNames` : légalité, prix, image et
 *    texte officiel viennent de Scryfall, pas d'ici ;
 * 3. la carte ne sort que si le moteur la juge meilleure que les autres.
 *
 * ⚠️ Provenance du fichier (champ `source`) : « forge » = généré par
 * scripts/build-set-cards-from-forge.py depuis le dépôt GitHub de Forge,
 * faute d'accès à Scryfall depuis l'environnement de dev ; « scryfall » =
 * régénéré par scripts/fetch-set-cards.mjs sur le Mac de Ben. Les noms des
 * cartes à préparation suivent la forme Scryfall « Recto // Sort » ; cette
 * forme n'a pas pu être vérifiée en direct pour Reality Fracture — un nom
 * que Scryfall ne reconnaît pas est simplement ignoré (fuzzyFallback: false).
 *
 * Quand retirer une extension d'ici : quand ses cartes ont un rang EDHREC
 * et sortent d'elles-mêmes dans les recherches (quelques mois). Il suffit
 * de régénérer le fichier avec les codes des extensions encore récentes.
 */

/** Sous-ensemble des champs Scryfall présents dans recent-set-cards.json. */
export type RecentCard = Pick<
  ScryfallCard,
  | "name"
  | "mana_cost"
  | "cmc"
  | "type_line"
  | "oracle_text"
  | "colors"
  | "color_identity"
  | "keywords"
  | "produced_mana"
  | "card_faces"
  | "layout"
  | "rarity"
  | "set"
  | "collector_number"
>;

interface RecentSetFile {
  generatedAt: string;
  source: "forge" | "scryfall";
  sourceDetail: string;
  sets: { code: string; name: string; releasedAt: string | null }[];
  cards: RecentCard[];
}

const FILE = rawRecent as unknown as RecentSetFile;

export const RECENT_SETS = FILE.sets;
export const RECENT_SET_SOURCE = { source: FILE.source, detail: FILE.sourceDetail, generatedAt: FILE.generatedAt };

interface Entry {
  card: RecentCard;
  categories: DeckCategory[];
  isLand: boolean;
  /** Peut être commandant (créature légendaire ou « can be your commander »). */
  commander: boolean;
  /** rare/mythique d'abord quand il faut plafonner une liste. */
  rank: number;
}

const RARITY_RANK: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3 };

// Classement fait une fois au chargement du module (286 cartes pour
// Reality Fracture : ~1 ms), avec le classifyCard du site.
const ENTRIES: Entry[] = FILE.cards.map((card) => ({
  card,
  categories: classifyCard(card as ScryfallCard),
  isLand: card.type_line.includes("Land"),
  commander: isCommanderEligible(card as ScryfallCard),
  rank: RARITY_RANK[card.rarity] ?? 3,
}));

function withinIdentity(card: RecentCard, identity: readonly string[]): boolean {
  return card.color_identity.every((c) => identity.includes(c));
}

/** Toutes les cartes nouvelles (lecture seule), avec leurs piliers. */
export function recentCards(): readonly { card: RecentCard; categories: DeckCategory[] }[] {
  return ENTRIES;
}

/**
 * Noms à demander à Scryfall pour un deck d'identité `identity`.
 * - `categories` : ne garder que les cartes qui remplissent au moins un de
 *   ces piliers (suggestions par pilier) ;
 * - `max` : plafond, rares/mythiques d'abord (une requête
 *   /cards/collection porte 75 noms et coûte ≥ 550 ms, voir scryfall.ts).
 */
export function recentCardNames(options: {
  identity?: readonly string[];
  categories?: readonly DeckCategory[];
  max?: number;
} = {}): string[] {
  const { identity, categories, max } = options;
  const picked = ENTRIES.filter((e) => {
    if (identity && !withinIdentity(e.card, identity)) return false;
    if (categories && !e.categories.some((c) => categories.includes(c))) return false;
    return true;
  }).sort((a, b) => a.rank - b.rank);
  return (max ? picked.slice(0, max) : picked).map((e) => e.card.name);
}

/**
 * Sélection pour le constructeur compétitif, où l'identité n'est pas encore
 * connue (des dizaines de commandants) : les cartes qui ont une chance
 * d'entrer dans un deck construit pour la puissance — commandants possibles
 * (ils deviennent des candidats), rares et mythiques, plus toute carte qui
 * remplit un pilier pour 3 manas ou moins. Les terrains non rares sont
 * exclus (le constructeur gère sa base de mana à part). Plafonné à `max`
 * noms : 225 = 3 requêtes /cards/collection, soit ~1,7 s de plus par
 * construction (mises en cache ensuite).
 */
export function recentPoolNames(max = 225): string[] {
  return ENTRIES.filter((e) => {
    if (e.commander || e.rank <= 1) return true;
    if (e.isLand) return false;
    return e.categories.length > 0 && e.card.cmc <= 3;
  })
    .sort((a, b) => Number(b.commander) - Number(a.commander) || a.rank - b.rank || b.categories.length - a.categories.length)
    .slice(0, max)
    .map((e) => e.card.name);
}

/** Noms des cartes nouvelles pouvant être commandant (pour les proposer comme candidats). */
export function recentCommanderNames(): Set<string> {
  return new Set(ENTRIES.filter((e) => e.commander).map((e) => e.card.name.toLowerCase()));
}

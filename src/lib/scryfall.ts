import type { ScryfallCard, ScryfallImageUris } from "./types";

/**
 * Client pour l'API Scryfall (https://scryfall.com/docs/api).
 *
 * Règles suivies (voir https://scryfall.com/docs/api/rate-limits) :
 * - throttle global à ~10 req/s (100ms d'écart minimum) sur tous les
 *   appels, y compris `/cards/collection` qui n'est pas listé parmi les
 *   endpoints "haut trafic" mais reste soumis à la même prudence ;
 * - utilisation de `/cards/collection` pour résoudre plusieurs cartes en
 *   un seul appel (75 identifiants max par requête) plutôt que N requêtes
 *   individuelles ;
 * - cache HTTP Next.js sur 24h (`next.revalidate`), conformément à la
 *   recommandation de Scryfall de mettre en cache au moins 24h les
 *   données de gameplay (texte, coût de mana), qui changent rarement.
 *
 * Scryfall ne documente pas d'exigence d'attribution formelle pour l'API,
 * mais les données de cartes appartiennent à Wizards of the Coast : on
 * affiche un crédit "Données fournies par Scryfall" dans le footer par
 * précaution (voir README pour le détail de cette limite).
 *
 * ⚠️ Header User-Agent obligatoire (bug corrigé le 26/08/2026) : Scryfall
 * exige désormais un header `User-Agent` explicite et personnalisé sur
 * toutes les requêtes — celui généré par défaut par le client HTTP
 * (undici/Next.js sur Vercel, curl, etc.) est traité comme du trafic
 * indésirable et bloqué. Voir
 * https://scryfall.com/blog/user-agent-and-accept-header-now-required-on-the-api-225
 * C'est ce qui causait un "non trouvée" sur 100% des cartes une fois le
 * site déployé (accès non testable depuis mon sandbox de dev, dont le
 * pare-feu sortant bloque api.scryfall.com — voir README).
 */

const SCRYFALL_API = "https://api.scryfall.com";
const REVALIDATE_SECONDS = 60 * 60 * 24; // 24h, cf. recommandation Scryfall

/** Headers requis par Scryfall sur toute requête (voir note ci-dessus). */
const REQUIRED_HEADERS = {
  "User-Agent": "CommanderBooster/1.0 (+https://github.com/mako-studio/mtg-decks)",
  Accept: "application/json;q=0.9,*/*;q=0.8",
};

let lastRequestAt = 0;
const MIN_INTERVAL_MS = 110; // ~9 req/s, sous la limite de 10 req/s

async function throttle() {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

/**
 * Enveloppe `fetch` en avalant les erreurs réseau (timeout, DNS, hôte
 * injoignable) pour renvoyer `null` plutôt que de faire planter la page :
 * une indisponibilité ponctuelle de Scryfall ne doit pas empêcher
 * d'afficher le reste du deck (les cartes non résolues s'affichent comme
 * "non trouvée" dans l'UI, voir CardTile.tsx).
 */
async function scryfallFetch(path: string, init?: RequestInit): Promise<Response | null> {
  await throttle();
  try {
    return await fetch(`${SCRYFALL_API}${path}`, {
      ...init,
      headers: {
        ...REQUIRED_HEADERS,
        ...(init?.headers ?? {}),
      },
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch (err) {
    // Erreur réseau (DNS, timeout, hôte injoignable) : on logue pour
    // pouvoir diagnostiquer depuis les logs de la plateforme d'hébergement
    // (les erreurs silencieuses sont ce qui a rendu le bug de header
    // User-Agent manquant difficile à repérer, voir note en haut du fichier).
    console.error(`[scryfall] échec réseau sur ${path}:`, err);
    return null;
  }
}

/** Recherche une carte par nom exact ou approché (fuzzy). */
export async function getCardByName(
  name: string,
  mode: "exact" | "fuzzy" = "exact"
): Promise<ScryfallCard | null> {
  const res = await scryfallFetch(`/cards/named?${mode}=${encodeURIComponent(name)}`);
  if (!res) return null;
  if (!res.ok) {
    if (res.status !== 404) console.error(`[scryfall] HTTP ${res.status} sur /cards/named (${name})`);
    return null;
  }
  return (await res.json()) as ScryfallCard;
}

/**
 * Résout un lot de noms de cartes via `/cards/collection` (max 75 par appel).
 * Retourne une Map name(lowercase) -> ScryfallCard, en ignorant silencieusement
 * les cartes non trouvées ou les erreurs réseau (elles restent "non trouvée" côté UI).
 */
export async function getCardsByNames(names: string[]): Promise<Map<string, ScryfallCard>> {
  const uniqueNames = Array.from(new Set(names));
  const result = new Map<string, ScryfallCard>();
  const CHUNK = 75;

  for (let i = 0; i < uniqueNames.length; i += CHUNK) {
    const chunk = uniqueNames.slice(i, i + CHUNK);
    await throttle();
    let res: Response | null;
    try {
      res = await fetch(`${SCRYFALL_API}/cards/collection`, {
        method: "POST",
        headers: { ...REQUIRED_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
        next: { revalidate: REVALIDATE_SECONDS },
      });
    } catch (err) {
      console.error(`[scryfall] échec réseau sur /cards/collection:`, err);
      continue;
    }
    if (!res.ok) {
      console.error(`[scryfall] HTTP ${res.status} sur /cards/collection (${chunk.length} cartes)`);
      continue;
    }
    const data = (await res.json()) as { data: ScryfallCard[] };
    for (const card of data.data) {
      result.set(card.name.toLowerCase(), card);
    }
  }

  return result;
}

/** Recherche de cartes via la syntax query Scryfall (https://scryfall.com/docs/syntax). */
export async function searchCards(query: string, maxPages = 1): Promise<ScryfallCard[]> {
  const results: ScryfallCard[] = [];
  let url: string | null = `/cards/search?q=${encodeURIComponent(query)}&order=edhrec`;
  let pages = 0;

  while (url && pages < maxPages) {
    const res = await scryfallFetch(url.startsWith("http") ? url.replace(SCRYFALL_API, "") : url);
    if (!res || !res.ok) break;
    const data = (await res.json()) as { data: ScryfallCard[]; has_more: boolean; next_page?: string };
    results.push(...data.data);
    url = data.has_more && data.next_page ? data.next_page : null;
    pages++;
  }

  return results;
}

/** Texte oracle affichable, en gérant les cartes double-face. */
export function getDisplayOracleText(card: ScryfallCard): string {
  if (card.oracle_text) return card.oracle_text;
  if (card.card_faces?.length) {
    return card.card_faces.map((f) => f.oracle_text).filter(Boolean).join("\n//\n");
  }
  return "";
}

/** Coût de mana affichable, en gérant les cartes double-face. */
export function getDisplayManaCost(card: ScryfallCard): string {
  if (card.mana_cost) return card.mana_cost;
  if (card.card_faces?.length) {
    return card.card_faces.map((f) => f.mana_cost).filter(Boolean).join(" // ");
  }
  return "";
}

/** URL d'image affichable (recto), en gérant les cartes double-face. */
export function getDisplayImageUrl(
  card: ScryfallCard,
  size: keyof ScryfallImageUris = "normal"
): string | null {
  if (card.image_uris) return card.image_uris[size] ?? null;
  if (card.card_faces?.[0]?.image_uris) {
    return card.card_faces[0].image_uris[size] ?? null;
  }
  return null;
}

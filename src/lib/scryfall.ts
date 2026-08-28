import type { ScryfallCard, ScryfallImageUris, ScryfallSet } from "./types";

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
 *
 * ⚠️ Filet de sécurité pour les cartes multi-faces (bug remonté par Ben le
 * 26/08/2026) : `/cards/collection` matche les noms de façon stricte, et il
 * peut arriver qu'une carte comme "Insult // Injury" (carte split) — pourtant
 * bien orthographiée et bien présente chez Scryfall, ajoutée quelques
 * instants plus tôt via "Tester une carte" (qui utilise `/cards/named`,
 * plus tolérant) — reparte en "non trouvée" au recalcul suivant. Cause
 * exacte non confirmée (mon bac à sable bloque aussi `api.scryfall.com`, je
 * n'ai pas pu reproduire l'appel en direct), mais le correctif est robuste
 * quelle qu'elle soit : tout nom qui échoue sur le lot rapide est retenté
 * individuellement via `/cards/named?fuzzy=` (même endpoint que la
 * recherche manuelle, qui l'a résolu la première fois) avant d'abandonner.
 * Seuls les noms non résolus sont retentés — le cas normal (l'immense
 * majorité des cartes) ne fait qu'un seul appel groupé, comme avant.
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

  const unresolvedNames = uniqueNames.filter((name) => !result.has(name.toLowerCase()));
  for (const name of unresolvedNames) {
    const card = await getCardByName(name, "fuzzy");
    if (card) result.set(name.toLowerCase(), card);
  }

  return result;
}

/**
 * Autocomplétion de noms de cartes (`/cards/autocomplete`), pour la
 * recherche manuelle "ajouter une carte" (DeckBuilder/AddCardSearch) : un
 * endpoint léger dédié à ce cas d'usage plutôt qu'une recherche complète.
 */
export async function autocompleteCardNames(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await scryfallFetch(`/cards/autocomplete?q=${encodeURIComponent(q)}`);
  if (!res || !res.ok) return [];
  const data = (await res.json()) as { data: string[] };
  return data.data;
}

/**
 * Autocomplétion sensible à la langue sélectionnée par l'utilisateur (voir
 * LanguageProvider.tsx) — ajout du 28/08/2026, demande de Ben : la
 * recherche de carte (AddCardSearch) doit matcher le nom français quand le
 * site est en français, pas uniquement le nom anglais.
 *
 * `/cards/autocomplete` (autocompleteCardNames ci-dessus) ne couvre que les
 * noms canoniques anglais — la documentation Scryfall décrit cet endpoint
 * comme renvoyant "up to 20 full English card names"
 * (https://scryfall.com/docs/api/cards/autocomplete). Je n'ai pas pu
 * revérifier cette page en direct (accès à `api.scryfall.com` bloqué depuis
 * mon environnement de dev, voir la note en haut de ce fichier) : c'est ma
 * meilleure compréhension de la doc telle que je la connais, pas une
 * vérification en direct. Taper un nom français dans cet endpoint ne
 * renverrait donc rien d'utile.
 *
 * Pour lang="fr", on interroge donc plutôt `/cards/search` avec `lang:fr`
 * combiné à `name:`, qui filtre sur les impressions françaises et matche le
 * nom imprimé. D'après la syntaxe de recherche Scryfall
 * (https://scryfall.com/docs/syntax), matcher un nom étranger nécessite de
 * préciser `lang:` — sans lui, la recherche de nom porte sur le nom anglais
 * canonique. Là encore, non re-vérifié en direct pour la même raison ;
 * heuristique documentée plutôt que certitude absolue. `unique="cards"`
 * pour dédupliquer par carte (une même carte a souvent plusieurs
 * impressions françaises).
 *
 * ⚠️ `name:` est entouré de guillemets (`name:"${q}"`) plutôt que laissé
 * brut : un nom français tapé en plusieurs mots (ex. "machinations de la
 * sorcière") sans guillemets serait scindé par le parseur de requête
 * Scryfall en plusieurs termes de recherche distincts (`name:machinations`
 * PUIS des mots isolés `de`, `la`, `sorcière`), au lieu d'une seule
 * recherche de sous-chaîne sur "machinations de la sorcière" — bug repéré
 * en investiguant un signalement de Ben du 28/08/2026 (finalement une carte
 * mal orthographiée de son côté, pas ce bug précis, mais le problème de
 * fond restait réel pour toute recherche FR à plusieurs mots).
 */
export async function autocompleteCardNamesForLang(query: string, lang: "fr" | "en"): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  if (lang === "en") return autocompleteCardNames(q);

  const results = await searchCards(`name:"${q}" lang:fr`, 1, "edhrec", "cards");
  const seen = new Set<string>();
  const names: string[] = [];
  for (const card of results) {
    const name = getDisplayLocalizedName(card);
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names.slice(0, 20);
}

/**
 * Résout une carte à partir d'un nom imprimé dans une langue donnée —
 * complète `autocompleteCardNamesForLang` ci-dessus pour la seconde étape
 * (une fois un nom choisi/tapé) du flow "Tester une carte" (voir
 * evaluateCardForDeck dans actions.ts).
 *
 * `/cards/named` (getCardByName ci-dessus, y compris son mode `fuzzy`) ne
 * prend pas de paramètre `lang` et ne matche, à ma connaissance, que le nom
 * canonique anglais — non plus vérifié en direct, même limite que
 * ci-dessus. On tente donc d'abord une correspondance exacte du nom
 * imprimé (`!"..."`, comme getLocalizedPrint plus bas dans ce fichier) —
 * le cas normal quand le nom vient de l'autocomplétion FR — puis, si rien
 * ne remonte (faute de frappe, nom tapé sans passer par l'autocomplétion),
 * une recherche partielle sur le nom (`name:`), en gardant le résultat le
 * plus pertinent (tri edhrec, comme le reste du site).
 *
 * Retourne `null` si aucune impression dans cette langue ne correspond —
 * l'appelant retombe alors sur la recherche anglaise standard, un cas
 * normal (beaucoup de cartes n'ont pas d'impression française, ou
 * l'utilisateur a tapé un nom anglais malgré le mode FR).
 */
export async function getCardByLocalizedName(name: string, lang: string): Promise<ScryfallCard | null> {
  const q = name.trim();
  if (!q) return null;
  const exact = await searchCards(`!"${q}" lang:${lang}`, 1);
  if (exact[0]) return exact[0];
  // `name:"${q}"` guillemeté pour la même raison que dans
  // autocompleteCardNamesForLang ci-dessus (un nom à plusieurs mots non
  // guillemeté est scindé en plusieurs termes de recherche distincts).
  const partial = await searchCards(`name:"${q}" lang:${lang}`, 1);
  return partial[0] ?? null;
}

/**
 * Recherche de cartes via la syntax query Scryfall (https://scryfall.com/docs/syntax).
 * `order` accepte n'importe quelle valeur documentée par
 * https://scryfall.com/docs/api/cards/search (vérifié le 26/08/2026 :
 * name, set, released, rarity, color, usd, tix, eur, cmc, power,
 * toughness, edhrec, penny, artist, review) — "edhrec" par défaut
 * (pertinence pour les suggestions), "set" pour un tri par numéro de
 * collection au sein d'un set (checklist, voir getSetCards ci-dessous).
 * 175 résultats par page (maximum documenté par Scryfall).
 *
 * `unique` correspond au paramètre `unique` de Scryfall (même doc que
 * ci-dessus, section "unique") : `"cards"` (comportement par défaut de
 * Scryfall si on omet le paramètre — une entrée par carte unique,
 * dédupliquée par nom/fonctionnalité), `"art"` (une entrée par
 * illustration unique) ou `"prints"` (aucune déduplication — toutes les
 * impressions correspondantes). Laissé `undefined` par défaut ici pour
 * ne rien changer au comportement existant des appelants qui n'en ont
 * pas besoin (recherche de suggestions, autocomplétion...) ; voir
 * getSetCards ci-dessous pour le cas où `"prints"` est nécessaire.
 */
export async function searchCards(
  query: string,
  maxPages = 1,
  order: string = "edhrec",
  unique?: "cards" | "art" | "prints"
): Promise<ScryfallCard[]> {
  const results: ScryfallCard[] = [];
  const uniqueParam = unique ? `&unique=${unique}` : "";
  let url: string | null = `/cards/search?q=${encodeURIComponent(query)}&order=${order}${uniqueParam}`;
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

/**
 * Nombre maximum de pages Scryfall (175 cartes/page) récupérées pour la
 * checklist complète d'un set — 25 pages = jusqu'à 4375 cartes. Depuis le
 * correctif du 28/08/2026 (`unique=prints`, voir getSetCards ci-dessous),
 * le nombre de cartes récupérées par set correspond au nombre
 * d'impressions distinctes (et non plus au nombre de noms uniques) : un
 * set avec beaucoup de variantes (art alternatif, showcase...) compte
 * donc plus de cartes qu'avant ce correctif. Je n'ai pas de chiffre
 * vérifié en direct pour "le plus gros set suivi" (accès à l'API non
 * testable depuis mon environnement, voir note en haut du fichier et
 * README), mais la marge jusqu'à 4375 reste large pour tout set/produit
 * Commander classique de TRACKED_SETS, à l'exception de "sld" (Secret
 * Lair Drop, qui agrège des milliers de cartes disparates sous un seul
 * code) où la liste peut être tronquée — voir loadSetChecklist dans
 * sets.ts, qui expose ce cas via `truncated`.
 */
const SET_CHECKLIST_MAX_PAGES = 25;

/**
 * Métadonnées d'un set/extension (`/sets/:code`) — voir
 * https://scryfall.com/docs/api/sets (vérifié le 26/08/2026).
 */
export async function getSetInfo(code: string): Promise<ScryfallSet | null> {
  const res = await scryfallFetch(`/sets/${encodeURIComponent(code)}`);
  if (!res || !res.ok) return null;
  return (await res.json()) as ScryfallSet;
}

/**
 * Checklist complète (anglaise) d'un set : TOUTES les impressions de ce
 * set (`unique=prints`), triées par numéro de collection (`order=set`).
 *
 * ⚠️ Correctif du 28/08/2026 (bug remonté par Ben : un set de 132 cartes
 * n'en affichait que 117, "checklist potentiellement incomplète"). Sans
 * `unique=prints`, `searchCards` utilise le comportement par défaut de
 * Scryfall (`unique=cards`, voir sa doc ci-dessus) : une seule entrée
 * par nom de carte, même si le set contient plusieurs impressions
 * distinctes du même nom (art alternatif, showcase, borderless...),
 * chacune avec son propre numéro de collection et sa propre image. Le
 * champ `card_count` du set (utilisé pour détecter une checklist
 * tronquée, voir `truncated` dans loadSetChecklist/sets.ts) compte lui
 * TOUTES les impressions, pas les noms uniques — d'où l'écart observé
 * (132 imprimées vs 117 noms uniques). `unique=prints` aligne le
 * comptage sur `card_count` : c'est aussi le comportement attendu d'une
 * "checklist" (une entrée par carte physiquement imprimable dans le
 * set, pas par nom).
 *
 * Root cause confirmée via la documentation officielle Scryfall
 * (https://scryfall.com/docs/api/cards/search, section "unique",
 * consultée le 28/08/2026 — cite verbatim les 3 valeurs possibles et le
 * défaut "cards"). Non vérifiée en direct contre une réponse Scryfall
 * réelle pour un set précis : mon environnement de dev bloque l'accès à
 * `api.scryfall.com` (voir note en haut du fichier), et j'ai aussi
 * essayé — à la demande de Ben — de passer par son navigateur Chrome
 * connecté au pont vers son ordinateur pour faire la requête depuis un
 * contexte réseau normal, mais les outils d'exécution/lecture de page
 * de ce pont ont échoué ("Google Chrome is not running", alors que la
 * gestion des onglets fonctionnait) — détails dans le README. Le
 * correctif est donc vérifié via un test avec des données Scryfall
 * simulées (plusieurs impressions du même nom dans un même set) plutôt
 * qu'un appel réel ; à confirmer une fois déployé, où l'hébergement a un
 * accès réseau normal.
 */
export async function getSetCards(code: string): Promise<ScryfallCard[]> {
  return searchCards(`set:${code}`, SET_CHECKLIST_MAX_PAGES, "set", "prints");
}

/**
 * Noms français imprimés pour les cartes d'un set, en un seul passage
 * paginé (`lang:fr`) plutôt qu'un appel par carte — voir la note sur
 * getLocalizedPrint plus haut : même principe, mais en lot pour éviter
 * 200-400 requêtes individuelles sur une checklist complète.
 *
 * Retourne une Map numéro-de-collection -> nom imprimé français. Le
 * numéro de collection est la clé la plus fiable au sein d'un même set
 * (contrairement au nom anglais, stable même pour les cartes multi-faces
 * ou les variantes de traduction). Les cartes sans impression française
 * (set non traduit, ou impression bonus anglaise uniquement) sont
 * simplement absentes de la Map — à traiter comme "pas de traduction
 * disponible", pas comme une erreur (voir getLocalizedPrint).
 *
 * `unique=prints` ici aussi (même correctif du 28/08/2026 que
 * getSetCards ci-dessus, voir son commentaire pour le détail) : sans ça,
 * une impression FR pouvait être écartée par la déduplication par nom de
 * Scryfall alors que sa `card` anglaise correspondante (même numéro de
 * collection) était bien conservée côté `getSetCards`, laissant ce nom
 * sans traduction dans l'UI alors qu'une existe réellement.
 */
export async function getSetCardsFrNames(code: string): Promise<Map<string, string>> {
  const frCards = await searchCards(`set:${code} lang:fr`, SET_CHECKLIST_MAX_PAGES, "set", "prints");
  const map = new Map<string, string>();
  for (const card of frCards) {
    const name = pickLocalized(card, "printed_name");
    if (name) map.set(card.collector_number, name);
  }
  return map;
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

/**
 * Cherche l'impression la plus récente d'une carte dans une langue donnée
 * (voir https://scryfall.com/docs/api/languages), pour en tirer le texte
 * imprimé localisé (`printed_text`/`printed_type_line`/`printed_name`).
 *
 * ⚠️ Le code langue "fr" pour le français est confirmé par la syntaxe de
 * recherche Scryfall (`lang:`/`language:`), mais je n'ai pas pu vérifier
 * en direct la liste exhaustive des codes langue (page bloquée par mon
 * pare-feu de dev) — "fr" est la convention ISO 639-1 standard et
 * quasi certainement correcte, mais si jamais elle ne l'était pas, la
 * recherche renvoie simplement 0 résultat et l'app bascule proprement
 * sur le texte anglais (voir CardTile.tsx / SuggestionCard.tsx).
 *
 * Beaucoup de cartes (surtout anciennes ou de sets non traduits) n'ont
 * tout simplement pas d'impression française : `null` dans ce cas, à
 * traiter comme "pas de traduction disponible", pas comme une erreur.
 */
export async function getLocalizedPrint(name: string, lang: string): Promise<ScryfallCard | null> {
  try {
    const results = await searchCards(`!"${name}" lang:${lang}`, 1);
    return results[0] ?? null;
  } catch {
    return null;
  }
}

function pickLocalized(card: ScryfallCard, field: "printed_name" | "printed_text" | "printed_type_line"): string {
  if (card[field]) return card[field] as string;
  if (card.card_faces?.length) {
    return card.card_faces.map((f) => f[field]).filter(Boolean).join(field === "printed_text" ? "\n//\n" : " // ");
  }
  return "";
}

/** Nom/texte/type imprimés localisés d'une impression (vide si non disponibles). */
export function getDisplayLocalizedName(card: ScryfallCard): string {
  return pickLocalized(card, "printed_name") || card.name;
}
export function getDisplayLocalizedText(card: ScryfallCard): string {
  return pickLocalized(card, "printed_text");
}
export function getDisplayLocalizedTypeLine(card: ScryfallCard): string {
  return pickLocalized(card, "printed_type_line");
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

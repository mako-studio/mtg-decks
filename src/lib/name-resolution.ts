import type { ScryfallCard } from "./types";
import {
  autocompleteCardNames,
  getCardByLocalizedName,
  getCardByName,
  getCardsByNames,
  scryfallRateLimitStatus,
} from "./scryfall";

/**
 * Résolution tolérante des noms de cartes importés (25/09/2026, demande de
 * Ben : « inclus aussi des orthographes proches ou autocorrect sur les
 * noms »). Cascade, du plus sûr au plus approximatif — chaque étape ne
 * traite que les noms que les précédentes n'ont pas résolus :
 *
 * 1. exact, en lot (`/cards/collection`, 75 noms par requête) ;
 * 2. nom NETTOYÉ, en lot : retire ce que les exports d'outils de collection
 *    ajoutent souvent (code d'extension « (MH2) 123 », « *F* » foil,
 *    « [Commander] », guillemets typographiques, accents, espaces multiples,
 *    une seule face « A / B » → « A // B ») ;
 * 3. autocomplétion Scryfall (nom entier, puis début du nom), choix de la
 *    suggestion la plus proche par distance d'édition (≤ 30% de la
 *    longueur), puis résolution groupée des suggestions retenues ;
 * 4. recherche approchée Scryfall (`/cards/named?fuzzy=`), qui corrige les
 *    fautes de frappe courantes (« Sol Rinng », « swords to plowshare ») ;
 * 5. nom FRANÇAIS (`lang:fr`), pour une liste saisie en français.
 * Ordre revu le 26/09/2026 : l'autocomplétion est dans le couloir rapide
 * de Scryfall (10 req/s), les étapes 4-5 dans le couloir lent (2 req/s) —
 * voir scryfall.ts. Chaque étape est plafonnée pour qu'une liste très sale
 * ne bloque pas l'analyse ni ne déclenche la limitation de Scryfall.
 *
 * Chaque correction est rapportée (`corrections`) et affichée à Ben : un nom
 * corrigé n'est jamais « silencieusement » remplacé par une autre carte.
 */

export interface NameCorrection {
  input: string;
  resolved: string;
  method: "nettoyage" | "approché" | "français" | "autocomplétion";
}

export interface ResolvedCollection {
  /** Carte résolue par nom saisi (clé : nom saisi en minuscules). */
  byInput: Map<string, ScryfallCard>;
  corrections: NameCorrection[];
  unresolved: string[];
}

// Plafonds (26/09/2026, revus avec les limites Scryfall, voir scryfall.ts) :
// autocomplétion ≈ 110 ms/nom ; approché ≈ 550 ms ; français ≈ 1,1 s (2 recherches).
const MAX_AUTOCOMPLETE = 60;
const MAX_FUZZY_LOOKUPS = 12;
const MAX_FRENCH_LOOKUPS = 6;

/** Nettoyage des décorations d'export les plus courantes (pur, testable). */
export function cleanCardName(raw: string): string {
  let s = raw.normalize("NFC");
  s = s.replace(/[‘’´`]/g, "'").replace(/[“”]/g, '"');
  s = s.replace(/\*[^*]*\*/g, " "); // *F*, *Foil*
  s = s.replace(/\[[^\]]*\]/g, " "); // [Commander Legends]
  s = s.replace(/\(([A-Za-z0-9]{2,6})\)\s*[A-Za-z0-9★-]*\s*$/g, " "); // (MH2) 123
  s = s.replace(/\s+#.*$/, " "); // commentaires « # ... »
  s = s.replace(/\s+\d+[a-z]?$/i, " "); // numéro de collection final
  s = s.replace(/\s*\/\/?\s*/g, " // "); // « A / B » ou « A//B » → « A // B »
  s = s.replace(/^"+|"+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Sans accents ni casse, pour comparer. */
export function foldName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distance d'édition de Levenshtein (pure). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** La suggestion la plus proche de `input`, si elle l'est suffisamment (≤ 30% de la longueur). */
export function closestName(input: string, suggestions: string[]): string | null {
  const target = foldName(input);
  let best: { name: string; d: number } | null = null;
  for (const s of suggestions) {
    const d = levenshtein(target, foldName(s));
    if (!best || d < best.d) best = { name: s, d };
  }
  if (!best) return null;
  return best.d <= Math.max(2, Math.floor(target.length * 0.3)) ? best.name : null;
}

export async function resolveCardNames(inputs: string[]): Promise<ResolvedCollection> {
  const byInput = new Map<string, ScryfallCard>();
  const corrections: NameCorrection[] = [];
  const unique = Array.from(new Set(inputs.map((n) => n.trim()).filter(Boolean)));

  // Lookup d'un résultat de lot : clé = nom Scryfall, ou face avant d'une carte double.
  const pick = (map: Map<string, ScryfallCard>, name: string): ScryfallCard | undefined => {
    const k = name.toLowerCase();
    const direct = map.get(k);
    if (direct) return direct;
    for (const card of map.values()) {
      const front = card.name.split(" // ")[0].toLowerCase();
      if (front === k) return card;
    }
    return undefined;
  };

  // 1. Exact
  const exact = await getCardsByNames(unique, { fuzzyFallback: false });
  let pending: string[] = [];
  for (const name of unique) {
    const card = pick(exact, name);
    if (card) byInput.set(name.toLowerCase(), card);
    else pending.push(name);
  }

  // 2. Nettoyé
  if (pending.length) {
    const cleaned = new Map(pending.map((n) => [n, cleanCardName(n)] as const));
    const toTry = Array.from(
      new Set(Array.from(cleaned.entries()).filter(([n, c]) => c && c !== n).map(([, c]) => c))
    );
    const batch = toTry.length ? await getCardsByNames(toTry, { fuzzyFallback: false }) : new Map();
    const still: string[] = [];
    for (const name of pending) {
      const c = cleaned.get(name) ?? "";
      const card = c && c !== name ? pick(batch, c) : undefined;
      if (card) {
        byInput.set(name.toLowerCase(), card);
        corrections.push({ input: name, resolved: card.name, method: "nettoyage" });
      } else still.push(name);
    }
    pending = still;
  }

  // 3. Autocomplétion (26/09/2026 : passée en premier). `/cards/autocomplete`
  // est dans le couloir « 10 req/s » de Scryfall, alors que les recherches
  // approchées/françaises sont limitées à 2 req/s (voir scryfall.ts) : on
  // choisit la suggestion la plus proche pour chaque nom, puis on résout
  // toutes les suggestions retenues en UN seul appel groupé.
  const chosen = new Map<string, string>(); // nom saisi → nom suggéré
  for (const name of pending.slice(0, MAX_AUTOCOMPLETE)) {
    if (scryfallRateLimitStatus().limited) break;
    const base = cleanCardName(name) || name;
    let suggestions = await autocompleteCardNames(base);
    if (suggestions.length === 0) {
      const words = base.split(" ");
      const prefix = words.slice(0, Math.max(1, Math.ceil(words.length / 2))).join(" ");
      if (prefix.length >= 2 && prefix !== base) suggestions = await autocompleteCardNames(prefix);
    }
    const best = closestName(base, suggestions);
    if (best) chosen.set(name, best);
  }
  if (chosen.size) {
    const batch = await getCardsByNames(Array.from(new Set(chosen.values())), { fuzzyFallback: false });
    const still: string[] = [];
    for (const name of pending) {
      const s = chosen.get(name);
      const card = s ? pick(batch, s) : undefined;
      if (card) {
        byInput.set(name.toLowerCase(), card);
        if (foldName(card.name) !== foldName(name)) corrections.push({ input: name, resolved: card.name, method: "autocomplétion" });
      } else still.push(name);
    }
    pending = still;
  }

  // 4-5. Recherche approchée puis nom français : une requête (2 req/s max)
  // par nom, donc plafonnées, et interrompues pendant une pause 429.
  let fuzzyBudget = MAX_FUZZY_LOOKUPS;
  let frenchBudget = MAX_FRENCH_LOOKUPS;
  const still: string[] = [];
  for (const name of pending) {
    if (scryfallRateLimitStatus().limited || (fuzzyBudget <= 0 && frenchBudget <= 0)) {
      still.push(name);
      continue;
    }
    const base = cleanCardName(name) || name;
    let card: ScryfallCard | null = null;
    let method: NameCorrection["method"] = "approché";
    if (fuzzyBudget > 0) {
      fuzzyBudget--;
      card = await getCardByName(base, "fuzzy");
    }
    if (!card && frenchBudget > 0 && !scryfallRateLimitStatus().limited) {
      frenchBudget--;
      card = await getCardByLocalizedName(base, "fr");
      method = "français";
    }
    if (card) {
      byInput.set(name.toLowerCase(), card);
      if (foldName(card.name) !== foldName(name)) corrections.push({ input: name, resolved: card.name, method });
    } else still.push(name);
  }

  return { byInput, corrections, unresolved: still };
}

import type { ComboDef } from "./combos";

/**
 * Client Commander Spellbook (25/09/2026, demande de Ben : « trouve des
 * moyens de contourner [les blocages] [...] et le commander spellbook »).
 *
 * Commander Spellbook (https://commanderspellbook.com) est la base
 * communautaire de référence des combos Commander. Son API publique est
 * inaccessible depuis les environnements de dev de ce projet, mais pas
 * depuis le site déployé (Vercel) : on l'interroge donc EN DIRECT, côté
 * serveur, au moment de l'analyse.
 *
 * Deux endpoints, documentés par le code source officiel
 * (github.com/SpaceCowMedia/commander-spellbook-backend, lu le 25/09/2026 :
 * `spellbook/views/find_my_combos.py`, `spellbook/views/estimate_bracket.py`,
 * `common/serializers.py`) :
 * - POST /find-my-combos : corps `{ main: [{card, quantity}], commanders:
 *   [{card, quantity}] }` (600 lignes max en `main`, 12 commandants max) ;
 *   réponse paginée `{ results: { identity, included, almostIncluded, … } }`
 *   (clés en camelCase : le backend utilise djangorestframework-camel-case).
 *   `included` = combos présentes, `almostIncluded` = combos à UNE carte
 *   près dans l'identité couleur du deck.
 * - POST /estimate-bracket : même corps ; réponse `{ bracketTag, cards,
 *   combos: [{ combo, relevant, definitelyTwoCard, speed, … }] }` —
 *   l'estimation de bracket de Commander Spellbook et SA classification des
 *   combos (pertinente ou non, vitesse, 2 cartes « certaines »...).
 * On ne télécharge JAMAIS la base entière (demande explicite de Commander
 * Spellbook sur sa page d'API) : une requête par deck analysé, résultats
 * mis en cache en mémoire.
 *
 * ⚠️ Ces appels n'ont pas pu être testés en direct depuis l'environnement de
 * dev (seulement contre une réponse simulée qui suit la forme lue dans le
 * code source). En cas d'échec (timeout, format inattendu), les fonctions
 * renvoient `null` et l'app retombe sur la base curatée (combos.ts) — rien
 * ne casse.
 */

const API = "https://backend.commanderspellbook.com";
const TIMEOUT_MS = 8000;
const HEADERS = {
  "User-Agent": "MTGOpti/1.0 (+https://github.com/mako-studio/mtg-decks)",
  Accept: "application/json",
  "Content-Type": "application/json",
};
const MAX_MAIN = 600;

/** Étiquettes Commander Spellbook → libellé FR. La correspondance avec les brackets WotC est MON interprétation (CSB ne publie pas d'équivalence officielle). */
export const SPELLBOOK_BRACKET_LABELS: Record<string, string> = {
  R: "Ruthless (≈ bracket 4 et plus)",
  S: "Spicy (≈ bracket 3-4)",
  P: "Powerful (≈ bracket 3)",
  O: "Oddball (≈ bracket 2-3)",
  C: "Core (≈ bracket 2)",
  E: "Exhibition (≈ bracket 1)",
  B: "Contient une carte bannie",
};

// ---------- Cache mémoire (par instance serverless) ----------
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 300;

function cacheKey(kind: string, main: string[], commanders: string[]): string {
  return `${kind}:${[...commanders].sort().join("|")}::${[...main].sort().join("|")}`;
}
function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}
function cacheSet(key: string, value: unknown) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
}

// ---------- Types (sous-ensemble de la réponse) ----------
interface RawCardInVariant {
  card?: { name?: string };
  quantity?: number;
  mustBeCommander?: boolean;
}
interface RawVariant {
  id?: string;
  uses?: RawCardInVariant[];
  requires?: { template?: { name?: string } }[];
  produces?: { feature?: { name?: string } }[];
  bracketTag?: string;
  popularity?: number | null;
  identity?: string;
  easyPrerequisites?: string;
  notablePrerequisites?: string;
}

/** Convertit une variante Commander Spellbook en ComboDef (format commun à toute l'app). */
export function variantToCombo(v: RawVariant): ComboDef | null {
  const pieces = (v.uses ?? []).map((u) => u.card?.name).filter((n): n is string => Boolean(n));
  if (pieces.length === 0) return null;
  const features = (v.produces ?? []).map((p) => p.feature?.name).filter((n): n is string => Boolean(n));
  const templates = (v.requires ?? []).map((r) => r.template?.name).filter((n): n is string => Boolean(n));
  const prereq = [v.easyPrerequisites, v.notablePrerequisites].filter(Boolean).join(" ").trim();
  return {
    id: `csb-${v.id ?? pieces.join("+")}`,
    pieces,
    result: features.slice(0, 3).join(", ") || "Combo",
    note: [templates.length ? `Nécessite aussi : ${templates.join(", ")}` : "", prereq].filter(Boolean).join(" — ") || undefined,
    source: "spellbook",
    bracketTag: v.bracketTag,
    popularity: typeof v.popularity === "number" ? v.popularity : undefined,
    templates: templates.length ? templates : undefined,
  };
}

async function post<T>(path: string, main: string[], commanders: string[]): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        main: main.slice(0, MAX_MAIN).map((card) => ({ card, quantity: 1 })),
        commanders: commanders.map((card) => ({ card, quantity: 1 })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[spellbook] HTTP ${res.status} sur ${path}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[spellbook] échec sur ${path} :`, err);
    return null;
  }
}

export interface FoundCombos {
  /** Combos présentes (toutes pièces nommées dans la liste, modèles génériques satisfaits selon CSB). */
  included: ComboDef[];
  /** Combos à UNE carte près (dans l'identité couleur) — pistes d'acquisition. */
  almostIncluded: ComboDef[];
}

/** find-my-combos. `null` si l'API est injoignable ou répond dans un format inattendu. */
export async function findMyCombos(main: string[], commanders: string[]): Promise<FoundCombos | null> {
  const key = cacheKey("fmc", main, commanders);
  const cached = cacheGet<FoundCombos>(key);
  if (cached) return cached;
  type Resp = { results?: { included?: RawVariant[]; almostIncluded?: RawVariant[] } };
  const data = await post<Resp>("/find-my-combos", main, commanders);
  const r = data?.results;
  if (!r || !Array.isArray(r.included)) return null;
  const conv = (list?: RawVariant[]) => (list ?? []).map(variantToCombo).filter((c): c is ComboDef => c !== null);
  const value: FoundCombos = { included: conv(r.included), almostIncluded: conv(r.almostIncluded) };
  cacheSet(key, value);
  return value;
}

export interface BracketEstimate {
  bracketTag: string;
  label: string;
  /** Combos présentes, avec la classification CSB. `minor` = pas « pertinente » selon CSB. */
  combos: (ComboDef & { speed?: number; twoCard?: boolean })[];
}

/** estimate-bracket. `null` si l'API est injoignable ou répond dans un format inattendu. */
export async function estimateBracket(main: string[], commanders: string[]): Promise<BracketEstimate | null> {
  const key = cacheKey("eb", main, commanders);
  const cached = cacheGet<BracketEstimate>(key);
  if (cached) return cached;
  type Resp = {
    bracketTag?: string;
    combos?: { combo?: RawVariant; relevant?: boolean; definitelyTwoCard?: boolean; speed?: number }[];
  };
  const data = await post<Resp>("/estimate-bracket", main, commanders);
  if (!data || typeof data.bracketTag !== "string" || !Array.isArray(data.combos)) return null;
  const combos = data.combos
    .map((c) => {
      const def = c.combo ? variantToCombo(c.combo) : null;
      if (!def) return null;
      return { ...def, minor: c.relevant !== true, speed: c.speed, twoCard: c.definitelyTwoCard === true };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const value: BracketEstimate = {
    bracketTag: data.bracketTag,
    label: SPELLBOOK_BRACKET_LABELS[data.bracketTag] ?? data.bracketTag,
    combos,
  };
  cacheSet(key, value);
  return value;
}

/**
 * Dédoublonne des combos par ENSEMBLE DE CARTES NOMMÉES : Commander
 * Spellbook liste souvent des dizaines de « variantes » d'un même principe
 * (le deck de test de Ben du 25/09/2026 en montre plus de 600) — compter
 * chaque variante ferait exploser la composante combo du tier.
 */
export function distinctCombos(list: ComboDef[]): ComboDef[] {
  const seen = new Set<string>();
  const out: ComboDef[] = [];
  for (const c of [...list].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))) {
    const key = c.pieces.map((p) => p.toLowerCase()).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

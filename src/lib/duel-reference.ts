import referenceData from "@/data/duel-commander-reference.json";
import cooccurrenceData from "@/data/duel-cooccurrence.json";

/**
 * Base de construction issue des decks de tournoi Duel Commander
 * (25/09/2026, 3e passage — demande de Ben : transformer l'archive mtgtop8 en
 * « DB de construction de deck »). Deux index, générés par
 * scripts/fetch-duel-meta.mjs à partir de analysis/duelcommander/decks-mtgtop8.json :
 *
 * 1. `duel-commander-reference.json` — pour chaque commandant (ou duo) joué
 *    dans ≥ 2 decks : la part de chaque carte DANS SES decks (≥ 25%) et des
 *    decks d'exemple. Sert à (a) orienter la construction vers ce que les
 *    joueurs de tournoi jouent réellement avec CE commandant, (b) montrer à
 *    Ben les cartes du « cœur » qui manquent à son deck.
 * 2. `duel-cooccurrence.json` — « synergies apprises » : paires de cartes
 *    jouées ensemble par PLUSIEURS commandants différents bien plus souvent
 *    que le hasard ne le prévoit (voir computeOutputs dans le script pour
 *    les seuils et pourquoi l'unité de compte est le commandant, pas le deck).
 *
 * Limites : Duel Commander uniquement ; échantillon = ce que mtgtop8 publie
 * (surtout les tops de tournois) ; un commandant absent des tournois n'a pas
 * de référence. Les noms viennent de mtgtop8, normalisés par Scryfall au
 * moment de la génération quand c'est possible : la recherche ci-dessous
 * tolère les cartes recto-verso (face avant seule ou nom complet).
 */

interface RawRef {
  deckCount: number;
  cards: Record<string, number>;
  samples: { event: string; deck: string; date: string | null }[];
}
interface RawPartner {
  name: string;
  lift: number;
  together: number;
  confidence?: number;
}

const REF = referenceData as { deckCount?: number; period?: string | null; commanders?: Record<string, RawRef> };
const COOC = cooccurrenceData as { cards?: Record<string, RawPartner[]> };

/** Normalise un nom de carte : minuscules, faces séparées (« A // B » → [a, b]). */
function faces(name: string): string[] {
  return name
    .toLowerCase()
    .split(/\s*\/\/?\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}
/** Clé d'un commandant ou duo : toutes les faces, triées, dédoublonnées. */
function commanderKey(names: string[]): string {
  return Array.from(new Set(names.flatMap(faces))).sort().join(" + ");
}

export interface CommanderReference {
  /** Libellé tel qu'enregistré (noms mtgtop8/Scryfall). */
  label: string;
  deckCount: number;
  /** Part des decks de ce commandant qui jouent chaque carte (clé : face avant en minuscules). */
  shares: Map<string, { name: string; share: number }>;
  samples: { url: string; date: string | null }[];
}

const REF_BY_KEY = new Map<string, CommanderReference>();
for (const [label, r] of Object.entries(REF.commanders ?? {})) {
  const shares = new Map<string, { name: string; share: number }>();
  for (const [name, share] of Object.entries(r.cards)) shares.set(faces(name)[0], { name, share });
  REF_BY_KEY.set(commanderKey(label.split(" + ")), {
    label,
    deckCount: r.deckCount,
    shares,
    samples: r.samples.map((s) => ({ url: `https://mtgtop8.com/event?e=${s.event}&d=${s.deck}&f=EDH`, date: s.date })),
  });
}

/** Référence tournoi pour ce commandant / ce duo, ou null s'il n'a pas assez de decks (< 2). */
export function referenceFor(commanderNames: string[]): CommanderReference | null {
  return REF_BY_KEY.get(commanderKey(commanderNames)) ?? null;
}

/** Part d'une carte dans la référence (0 si absente). */
export function referenceShare(ref: CommanderReference | null, cardName: string): number {
  if (!ref) return 0;
  return ref.shares.get(faces(cardName)[0])?.share ?? 0;
}

export const DUEL_REFERENCE_INFO = { deckCount: REF.deckCount ?? 0, period: REF.period ?? null };

const PARTNERS = new Map<string, { name: string; key: string; lift: number; together: number }[]>();
for (const [name, list] of Object.entries(COOC.cards ?? {})) {
  PARTNERS.set(
    faces(name)[0],
    list.map((p) => ({ name: p.name, key: faces(p.name)[0], lift: p.lift, together: p.together }))
  );
}

/** Clé de recherche d'une carte pour la co-occurrence (face avant, minuscules). */
export function cooccurrenceKey(name: string): string {
  return faces(name)[0] ?? "";
}

/** Partenaires fréquents d'une carte (synergies apprises), du plus fort au plus faible. */
export function learnedPartners(name: string): { name: string; key: string; lift: number; together: number }[] {
  return PARTNERS.get(cooccurrenceKey(name)) ?? [];
}

/** Toutes les cartes des références (part ≥ minShare) — pour les résoudre et les proposer en acquisition. */
export function referenceCardNames(minShare = 0.5): string[] {
  const out = new Set<string>();
  for (const r of REF_BY_KEY.values()) for (const v of r.shares.values()) if (v.share >= minShare) out.add(v.name);
  return Array.from(out);
}

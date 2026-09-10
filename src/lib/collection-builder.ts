import type { EnrichedCard, FormatConfig, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";
import { classifyCard, computeDeckStats } from "./deck-score";

/**
 * Construction d'un deck Commander/Duel Commander à partir d'une collection
 * possédée (05/09/2026, demande de Ben : "importer une liste de cartes et
 * que le site me suggère un deck avec les cartes que j'ai, et voir son
 * score"). Toute la logique ici est PURE (aucun appel réseau) : les cartes
 * données en entrée sont déjà résolues auprès de Scryfall par l'appelant
 * (voir buildDeckFromCollection dans actions.ts) — ce module ne fait que
 * choisir/classer, jamais chercher.
 *
 * Principe directeur (convention du projet, voir HANDOFF.md §11) : ne pas
 * réinventer de moteur de score. La sélection ci-dessous s'appuie sur les
 * primitives déjà existantes — `classifyCard` (deck-score.ts) pour savoir
 * quel(s) rôle(s) une carte remplit, et surtout `computeDeckStats` pour
 * TOUT score affiché (le score d'un deck construit ici, ou le score d'essai
 * qui sert à classer les commandants candidats, sont calculés par la même
 * fonction que le reste du site — jamais une métrique de classement
 * inventée à part).
 */

/** Même ordre WUBRG que deck-loader.ts (sortedColorIdentity, non exporté) — dupliqué ici car privé à ce fichier, pas une nouvelle convention. */
const WUBRG_ORDER = ["W", "U", "B", "R", "G"];

function sortedColorIdentity(colors: Iterable<string>): string[] {
  const set = new Set(colors);
  return WUBRG_ORDER.filter((c) => set.has(c));
}

/**
 * Une carte peut-elle être commandant ? Deux cas reconnus par les règles
 * Commander officielles :
 * - créature légendaire ("Legendary" + "Creature" dans type_line) ;
 * - toute carte dont le texte oracle dit explicitement "can be your
 *   commander" (planeswalkers commandants de certains produits, ex.
 *   Commander Legends).
 * Les "Background" (type_line contient "Background") sont exclus : une
 * carte Background ne peut être commandant QUE comme partenaire d'une
 * créature ayant "Choose a Background", jamais seule — et ce module ne gère
 * qu'un commandant unique en v1 (pas de partenaires/Background), voir
 * buildDeckFromCollection dans actions.ts.
 */
export function isCommanderEligible(card: ScryfallCard): boolean {
  const typeLine = card.type_line ?? "";
  if (typeLine.includes("Background")) return false;
  const isLegendaryCreature = typeLine.includes("Legendary") && typeLine.includes("Creature");
  if (isLegendaryCreature) return true;
  return /can be your commander/i.test(getDisplayOracleText(card));
}

/** Légalité d'une carte pour le format donné (legal ou restricted comptent comme jouable — même convention que evaluateCardForDeck dans actions.ts). */
export function isLegalInFormat(card: ScryfallCard, format: FormatConfig): boolean {
  const status = card.legalities?.[format.scryfallLegality];
  return status === "legal" || status === "restricted";
}

function isBasicLand(card: ScryfallCard): boolean {
  return Boolean(card.type_line?.includes("Basic Land"));
}

function isLand(card: ScryfallCard): boolean {
  return Boolean(card.type_line?.includes("Land"));
}

/**
 * Score de priorité d'une carte possédée pour la sélection du deck : somme
 * des poids/cible de chaque pilier qu'elle remplit (`classifyCard`, même
 * formule que l'`impact` d'une suggestion dans recommend.ts — un pilier
 * proche de sa cible pèse plus qu'un pilier déjà large), plus un léger bonus
 * de qualité individuelle pour départager des cartes de priorité égale —
 * même signal (`game_changer`/`edhrec_rank`, champs officiels Scryfall) et
 * même direction que le bonus de `buildRemovalCandidates` dans
 * recommend.ts (protéger les cartes notoirement puissantes/populaires),
 * mais volontairement à une échelle plus faible ici : le rôle rempli dans
 * le deck (piliers) doit rester le critère dominant, la popularité ne sert
 * qu'à trancher entre deux cartes de rôle équivalent.
 */
function priorityScore(card: ScryfallCard, format: FormatConfig): number {
  const categories = classifyCard(card);
  const { weights, targets } = format.categories;
  let score = 0;
  for (const cat of categories) score += weights[cat] / targets[cat];

  if (card.game_changer) score += 0.3;
  if (typeof card.edhrec_rank === "number" && card.edhrec_rank > 0) {
    if (card.edhrec_rank <= 300) score += 0.15;
    else if (card.edhrec_rank <= 1500) score += 0.05;
  }
  return score;
}

function toEnriched(entries: { name: string; count: number }[], byName: Map<string, ScryfallCard>): EnrichedCard[] {
  return entries.map((e) => ({
    name: e.name,
    count: e.count,
    isCommander: false,
    card: byName.get(e.name.toLowerCase()) ?? null,
  }));
}

export interface SelectDeckParams {
  /** Cartes possédées déjà résolues auprès de Scryfall, hors commandant choisi. */
  pool: ScryfallCard[];
  /** Nombre d'exemplaires possédés par carte (clé : nom en minuscule) — plafonné à format.maxCopies dans la sélection, sauf terrains de base. */
  ownedCounts: Map<string, number>;
  commander: ScryfallCard;
  format: FormatConfig;
  /** Terrains de base résolus (Plains/Island/Swamp/Mountain/Forest/Wastes) pour compléter le deck — voir topUpLandCount dans actions.ts pour le même principe côté "Super Opti". */
  basics: Map<string, ScryfallCard>;
}

/**
 * Construit la meilleure liste {name,count} possible pour `commander` à
 * partir du pool possédé, complétée par des terrains de base pour atteindre
 * exactement `format.deckSize` cartes (deck immédiatement jouable même si
 * la collection est incomplète — demande explicite de Ben, voir le
 * commentaire ci-dessus).
 *
 * Étapes : (1) filtre le pool à l'identité couleur du commandant et à la
 * légalité du format, en excluant le commandant lui-même ; (2) sépare
 * terrains / non-terrains, classe chaque groupe par `priorityScore`
 * décroissant ; (3) retient jusqu'à `idealLandRatio * deckSize` terrains et
 * le reste en non-terrains (cible ~62 non-terrains / 37 terrains sur 99,
 * voir formats.ts) ; (4) comble tout écart restant avec des terrains de
 * base (couleurs cyclées dans l'identité du commandant, "Wastes" si
 * incolore) jusqu'à `deckSize` cartes au total.
 *
 * Ne dépasse jamais `format.maxCopies` par carte (1 en Commander/Duel
 * Commander, format singleton) sauf terrains de base, sans limite officielle
 * de copies.
 */
export function selectDeckFromPool(params: SelectDeckParams): { name: string; count: number }[] {
  const { pool, ownedCounts, commander, format, basics } = params;
  const commanderKey = commander.name.toLowerCase();

  const eligible = pool.filter((card) => {
    if (card.name.toLowerCase() === commanderKey) return false;
    if (!isLegalInFormat(card, format)) return false;
    return card.color_identity.every((c) => commander.color_identity.includes(c));
  });

  const cappedCount = (card: ScryfallCard): number => {
    const owned = ownedCounts.get(card.name.toLowerCase()) ?? 0;
    if (owned <= 0) return 0;
    return isBasicLand(card) ? owned : Math.min(owned, format.maxCopies);
  };

  const lands = eligible
    .filter((c) => isLand(c))
    .sort((a, b) => priorityScore(b, format) - priorityScore(a, format));
  const nonLands = eligible
    .filter((c) => !isLand(c))
    .sort((a, b) => priorityScore(b, format) - priorityScore(a, format));

  const idealLandCount = Math.round(format.categories.idealLandRatio * format.deckSize);
  const nonLandTarget = format.deckSize - idealLandCount;

  const selected = new Map<string, { name: string; count: number }>();
  const addSelected = (name: string, count: number) => {
    if (count <= 0) return;
    const key = name.toLowerCase();
    const existing = selected.get(key);
    if (existing) existing.count += count;
    else selected.set(key, { name, count });
  };

  let landSlots = idealLandCount;
  for (const card of lands) {
    if (landSlots <= 0) break;
    const count = Math.min(cappedCount(card), landSlots);
    if (count <= 0) continue;
    addSelected(card.name, count);
    landSlots -= count;
  }

  let nonLandSlots = nonLandTarget;
  for (const card of nonLands) {
    if (nonLandSlots <= 0) break;
    const count = Math.min(cappedCount(card), nonLandSlots);
    if (count <= 0) continue;
    addSelected(card.name, count);
    nonLandSlots -= count;
  }

  // Comble tout écart restant (terrains manquants ET/OU non-terrains
  // manquants faute de pool suffisant) avec des terrains de base — un deck
  // avec plus de terrains que l'idéal reste jouable, alors qu'un deck de
  // moins de `deckSize` cartes ne l'est pas (règle Commander : exactement
  // deckSize cartes hors commandant). Couleurs cyclées dans l'identité du
  // commandant (déjà triée WUBRG) ; "Wastes" si commandant incolore.
  const remaining = landSlots + nonLandSlots;
  const colorIdentity = sortedColorIdentity(commander.color_identity);
  for (let i = 0; i < remaining; i++) {
    const landName = colorIdentity.length > 0 ? BASIC_LAND_BY_COLOR[colorIdentity[i % colorIdentity.length]] : "Wastes";
    if (!landName || !basics.has(landName.toLowerCase())) break;
    addSelected(landName, 1);
  }

  return Array.from(selected.values());
}

/**
 * Table couleur -> terrain de base. Source unique (05/09/2026) : actions.ts
 * l'importe désormais d'ici pour `topUpLandCount` (Super Opti) au lieu de
 * garder sa propre copie — même besoin exact (cycler les couleurs de
 * l'identité pour choisir un terrain de base à ajouter), pas de raison de
 * dupliquer.
 */
const BASIC_LAND_BY_COLOR: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

export interface RankedCommanderCandidate {
  card: ScryfallCard;
  /** Score du deck d'essai construit pour ce commandant (computeDeckStats — même échelle/formule que le score final affiché), utilisé pour présélectionner le meilleur candidat. */
  trialScore: number;
}

export interface RankCandidatesParams {
  pool: ScryfallCard[];
  ownedCounts: Map<string, number>;
  candidates: ScryfallCard[];
  format: FormatConfig;
  basics: Map<string, ScryfallCard>;
}

/**
 * Classe les commandants candidats (cartes possédées éligibles, voir
 * isCommanderEligible) par score du deck qu'on pourrait construire avec
 * chacun — pas une heuristique de classement à part : chaque candidat est
 * évalué en construisant réellement son deck d'essai (`selectDeckFromPool`)
 * puis en calculant son score avec `computeDeckStats`, exactement comme le
 * deck final affiché. Aucun appel réseau ici (tout est déjà résolu en
 * amont, voir buildDeckFromCollection dans actions.ts), donc classer même
 * une vingtaine de candidats reste rapide.
 */
export function rankCommanderCandidates(params: RankCandidatesParams): RankedCommanderCandidate[] {
  const { pool, ownedCounts, candidates, format, basics } = params;
  const byName = new Map<string, ScryfallCard>();
  for (const c of pool) byName.set(c.name.toLowerCase(), c);
  for (const c of basics.values()) byName.set(c.name.toLowerCase(), c);

  const ranked = candidates.map((commander) => {
    const trialPool = pool.filter((c) => c.name.toLowerCase() !== commander.name.toLowerCase());
    const deckCards = selectDeckFromPool({ pool: trialPool, ownedCounts, commander, format, basics });
    const enriched = toEnriched(deckCards, byName);
    const stats = computeDeckStats(enriched, format.categories);
    return { card: commander, trialScore: stats.score };
  });

  ranked.sort((a, b) => {
    if (b.trialScore !== a.trialScore) return b.trialScore - a.trialScore;
    // Départage à score de deck d'essai égal (cas fréquent avec un pool
    // petit) : popularité générale de la carte elle-même (mêmes champs
    // officiels Scryfall que popularitySignal/buildRemovalCandidates dans
    // recommend.ts), pas une nouvelle donnée.
    const aRank = a.card.edhrec_rank ?? Infinity;
    const bRank = b.card.edhrec_rank ?? Infinity;
    return aRank - bRank;
  });

  return ranked;
}

/**
 * Exportée pour que buildDeckFromCollection (actions.ts) résolve les mêmes
 * noms de terrains de base auprès de Scryfall que ceux utilisés ici — un
 * seul appel réseau (`getCardsByNames`) pour toutes les couleurs, fait côté
 * actions.ts avant d'appeler `selectDeckFromPool`/`rankCommanderCandidates`
 * (ce module reste volontairement sans accès réseau, voir la doc en tête de
 * fichier).
 */
export { BASIC_LAND_BY_COLOR };

import type { ArchetypeSignal, DeckCategory, EnrichedCard, FormatConfig, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";
import { classifyCard, computeDeckStats, EMPTY_CATEGORY_COUNTS } from "./deck-score";
import { cardMatchesArchetype, detectArchetypes } from "./archetype";

/**
 * Construction d'un deck Commander/Duel Commander à partir d'une collection
 * possédée (05/09/2026, demande de Ben : "importer une liste de cartes et
 * que le site me suggère un deck avec les cartes que j'ai, et voir son
 * score"). Toute la logique ici est PURE (aucun appel réseau) : les cartes
 * données en entrée sont déjà résolues auprès de Scryfall par l'appelant
 * (voir buildDeckFromCollection dans actions.ts) — ce module ne fait que
 * choisir/classer, jamais chercher.
 *
 * Robustifié le 24/09/2026 (nouvelle demande de Ben : "améliore et rends
 * plus robuste l'algo de construction de deck commander multi et duel,
 * fais en sorte qu'il soit le plus puissant et pertinent possible"). La
 * v1 ci-dessus triait le pool UNE FOIS par priorityScore et prenait les N
 * meilleures cartes dans l'ordre — simple, mais ça peut sur-représenter un
 * pilier déjà bien couvert (beaucoup de removal fort) au détriment d'un
 * pilier resté vide (aucune protection possédée alors qu'il y en avait une
 * correcte plus bas dans le tri). La v2 remplace ce tri statique par une
 * sélection ITÉRATIVE "pilier le plus faible d'abord" — même principe que
 * `suggestImprovements` (recommend.ts, pattern `weakestFirst`), appliqué
 * ici carte par carte plutôt que suggestion par suggestion — et ajoute une
 * détection d'archétype en deux passes (voir `selectDeckFromPool` plus
 * bas). Toujours aucune réinvention de moteur de score (convention du
 * projet, HANDOFF.md §11) : `classifyCard`, `computeDeckStats`,
 * `format.categories.targets/weights` et les fonctions pures
 * d'archetype.ts sont réutilisées telles quelles ; les seules nouveautés
 * sont l'ORDRE de sélection (une généralisation du pattern déjà existant)
 * et quelques constantes de réglage modestes, documentées ci-dessous.
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
 * Bonus de score pour une carte qui correspond à un archétype détecté
 * (voir la passe 2 de `selectDeckFromPool`) — même ordre de grandeur que
 * l'`impact` de `suggestForArchetype` dans recommend.ts (un budget modeste,
 * documenté comme ne devant jamais dominer un vrai déficit de pilier) :
 * volontairement comparable à UN SEUL pilier proche de sa cible (~1.4-2
 * selon les poids/cibles de formats.ts), jamais à plusieurs piliers cumulés.
 */
const ARCHETYPE_MATCH_BONUS = 0.5;

/**
 * Score de priorité d'une carte possédée pour la sélection du deck : somme
 * des poids/cible de chaque pilier qu'elle remplit (`classifyCard`, même
 * formule que l'`impact` d'une suggestion dans recommend.ts — un pilier
 * proche de sa cible pèse plus qu'un pilier déjà large), plus :
 * - un bonus de qualité individuelle (même signal que
 *   `buildRemovalCandidates` dans recommend.ts — `game_changer`/
 *   `edhrec_rank`, champs officiels Scryfall — légèrement augmenté par
 *   rapport à la v1 du 05/09/2026 pour mieux refléter la puissance réelle
 *   d'une carte, tout en restant nettement sous la contribution d'un
 *   pilier correctement rempli) ;
 * - un léger ajustement de courbe de mana (encourage sans forcer les
 *   cartes proches de `idealAvgCmc` du format — amplitude volontairement
 *   faible, seulement un départage) ;
 * - le bonus d'archétype ci-dessus, si applicable.
 * `categories` est précalculé par l'appelant (voir `classifyCache` dans
 * `selectDeckFromPool`) plutôt que recalculé ici à chaque appel : cette
 * fonction est maintenant appelée à chaque itération de
 * `pickBestCards` pour chaque carte restante, un recalcul de
 * `classifyCard` à chaque fois serait un travail redondant inutile sur de
 * grosses collections.
 */
function priorityScore(
  card: ScryfallCard,
  format: FormatConfig,
  categories: DeckCategory[],
  archetypeSignals: ArchetypeSignal[]
): number {
  const { weights, targets } = format.categories;
  let score = 0;
  for (const cat of categories) score += weights[cat] / targets[cat];

  if (card.game_changer) score += 0.5;
  if (typeof card.edhrec_rank === "number" && card.edhrec_rank > 0) {
    if (card.edhrec_rank <= 300) score += 0.25;
    else if (card.edhrec_rank <= 1500) score += 0.08;
  }

  // Ajustement de courbe, amplitude volontairement faible (max 0.3, contre
  // ~1.4-2 pour un seul pilier rempli) : un simple départage vers la
  // courbe idéale du format, jamais un critère qui pourrait l'emporter sur
  // le rôle réel de la carte dans le deck.
  score += Math.max(0, 0.3 - Math.abs(card.cmc - format.categories.idealAvgCmc) * 0.05);

  if (archetypeSignals.length > 0 && archetypeSignals.some((s) => cardMatchesArchetype(card, s))) {
    score += ARCHETYPE_MATCH_BONUS;
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

/**
 * Bonus fixe accordé, à chaque étape de `pickBestCards`, à une carte qui
 * remplit le pilier actuellement le plus sous sa cible. Doit dominer
 * NETTEMENT la contribution d'un pilier isolé dans `priorityScore`
 * (~1.4-2 selon formats.ts) pour que "combler le trou le plus criant
 * d'abord" prime vraiment sur un simple tri par qualité globale — sans
 * quoi cette sélection itérative se comporterait presque comme l'ancien
 * tri statique. 2.5 a été choisi pour dépasser la contribution d'un seul
 * pilier tout en restant dépassable par une carte qui cumule PLUSIEURS
 * piliers pertinents + bonus qualité (cas fréquent des cartes staples) —
 * le pilier faible influence donc fortement l'ordre sans jamais devenir
 * une règle absolue qui ignorerait une carte manifestement meilleure.
 */
const WEAKEST_CATEGORY_BONUS = 2.5;

/**
 * Sélectionne jusqu'à `slots` cartes parmi `candidates` par itérations
 * successives : à chaque étape, détermine le pilier le plus sous sa cible
 * parmi `categoryCounts`/`format.categories.targets` (ratio compte/cible
 * le plus bas ; si tous les piliers sont déjà couverts — ratio ≥ 1 partout
 * — aucun bonus de pilier n'est appliqué, seul `priorityScore` départage),
 * puis choisit parmi les cartes restantes celle qui maximise
 * `priorityScore` + le bonus de pilier faible si elle le remplit. Un
 * départage déterministe par nom (`localeCompare`) évite toute dépendance
 * à l'ordre d'itération du moteur JS sur les égalités exactes — important
 * pour des tests reproductibles (voir HANDOFF.md §7).
 *
 * `categoryCountsSeed` permet d'enchaîner deux appels (terrains puis
 * non-terrains) en conservant le même décompte de piliers d'un appel à
 * l'autre : un terrain de correction de couleur ("landfix") choisi dans la
 * passe terrains doit réduire le déficit "landfix" vu par la passe
 * non-terrains qui suit, même si ce pilier est presque entièrement rempli
 * par des terrains en pratique.
 */
function pickBestCards(
  candidates: ScryfallCard[],
  slots: number,
  format: FormatConfig,
  archetypeSignals: ArchetypeSignal[],
  classifyCache: Map<string, DeckCategory[]>,
  cappedCount: (card: ScryfallCard) => number,
  categoryCountsSeed: Record<DeckCategory, number>
): { picked: Map<string, { card: ScryfallCard; count: number }>; categoryCounts: Record<DeckCategory, number> } {
  const { targets } = format.categories;
  const categoryCounts: Record<DeckCategory, number> = { ...categoryCountsSeed };
  const picked = new Map<string, { card: ScryfallCard; count: number }>();
  const remaining = new Map(candidates.map((c) => [c.id, c] as const));
  let slotsLeft = slots;

  while (slotsLeft > 0 && remaining.size > 0) {
    let weakest: DeckCategory | null = null;
    let weakestRatio = Infinity;
    for (const cat of Object.keys(targets) as DeckCategory[]) {
      const target = targets[cat];
      if (target <= 0) continue;
      const ratio = categoryCounts[cat] / target;
      if (ratio < weakestRatio) {
        weakestRatio = ratio;
        weakest = cat;
      }
    }
    if (weakestRatio >= 1) weakest = null;

    let bestCard: ScryfallCard | null = null;
    let bestScore = -Infinity;
    for (const card of remaining.values()) {
      const cats = classifyCache.get(card.id) ?? [];
      let score = priorityScore(card, format, cats, archetypeSignals);
      if (weakest && cats.includes(weakest)) score += WEAKEST_CATEGORY_BONUS;

      const isBetter =
        score > bestScore || (score === bestScore && bestCard !== null && card.name.localeCompare(bestCard.name) < 0);
      if (isBetter) {
        bestScore = score;
        bestCard = card;
      }
    }
    if (!bestCard) break;

    const count = Math.min(cappedCount(bestCard), slotsLeft);
    remaining.delete(bestCard.id);
    if (count <= 0) continue;

    const key = bestCard.name.toLowerCase();
    const existing = picked.get(key);
    if (existing) existing.count += count;
    else picked.set(key, { card: bestCard, count });

    for (const cat of classifyCache.get(bestCard.id) ?? []) {
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + count;
    }
    slotsLeft -= count;
  }

  return { picked, categoryCounts };
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
 * la collection est incomplète — demande explicite de Ben).
 *
 * Étapes : (1) filtre le pool à l'identité couleur du commandant et à la
 * légalité du format, en excluant le commandant lui-même, puis ne garde
 * que les cartes réellement possédées (`cappedCount > 0`) ; (2) précalcule
 * `classifyCard` une fois par carte (`classifyCache`) — la sélection
 * itérative interroge chaque carte restante à chaque étape, un recalcul à
 * la volée serait un gâchis sur une grosse collection ; (3) sépare
 * terrains / non-terrains et sélectionne chaque groupe par
 * `pickBestCards` (pilier le plus faible d'abord), la passe terrains
 * (`idealLandCount` créneaux) alimentant son décompte de piliers final
 * dans la passe non-terrains (`nonLandTarget` créneaux) ; (4) comble tout
 * écart restant avec des terrains de base (couleurs cyclées dans
 * l'identité du commandant, "Wastes" si incolore) jusqu'à `deckSize`
 * cartes au total.
 *
 * Détection d'archétype en DEUX passes : `detectArchetypes` (archetype.ts)
 * exige déjà au moins 6 cartes hors terrain pour retourner un signal
 * (`MIN_CARDS_FOR_SIGNAL`) — impossible donc de connaître l'archétype
 * avant d'avoir choisi ne serait-ce qu'une première sélection. La passe 1
 * construit donc une sélection "seed" sans aucun bonus d'archétype ; si
 * cette seed déclenche un signal (ex : beaucoup de cartes de sacrifice),
 * la passe 2 REFAIT ENTIÈREMENT la sélection depuis zéro (décomptes de
 * piliers repartis à zéro, mêmes candidats) avec ce bonus activé pour
 * toute carte du pool qui correspond au signal (`cardMatchesArchetype`,
 * réutilisée telle quelle depuis archetype.ts) — pas un ajustement
 * incrémental de la seed, pour que le bonus soit visible dès le début du
 * classement et profite aussi aux cartes écartées en passe 1. Si aucun
 * signal n'est détecté sur la seed, elle est renvoyée telle quelle (pas de
 * recalcul inutile).
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

  const usable = eligible.filter((c) => cappedCount(c) > 0);
  const lands = usable.filter((c) => isLand(c));
  const nonLands = usable.filter((c) => !isLand(c));

  const classifyCache = new Map<string, DeckCategory[]>();
  for (const card of usable) classifyCache.set(card.id, classifyCard(card));

  const idealLandCount = Math.round(format.categories.idealLandRatio * format.deckSize);
  const nonLandTarget = format.deckSize - idealLandCount;

  const runSelection = (archetypeSignals: ArchetypeSignal[]) => {
    const landsResult = pickBestCards(lands, idealLandCount, format, archetypeSignals, classifyCache, cappedCount, {
      ...EMPTY_CATEGORY_COUNTS,
    });
    const nonLandsResult = pickBestCards(
      nonLands,
      nonLandTarget,
      format,
      archetypeSignals,
      classifyCache,
      cappedCount,
      landsResult.categoryCounts
    );
    return { landsResult, nonLandsResult };
  };

  const seed = runSelection([]);

  const seedNonLandEntries: EnrichedCard[] = Array.from(seed.nonLandsResult.picked.values()).map((e) => ({
    name: e.card.name,
    count: e.count,
    isCommander: false,
    card: e.card,
  }));
  const archetypeSignals = detectArchetypes(seedNonLandEntries, [commander]);

  const finalResult = archetypeSignals.length > 0 ? runSelection(archetypeSignals) : seed;

  const selected = new Map<string, { name: string; count: number }>();
  const addSelected = (name: string, count: number) => {
    if (count <= 0) return;
    const key = name.toLowerCase();
    const existing = selected.get(key);
    if (existing) existing.count += count;
    else selected.set(key, { name, count });
  };
  for (const entry of finalResult.landsResult.picked.values()) addSelected(entry.card.name, entry.count);
  for (const entry of finalResult.nonLandsResult.picked.values()) addSelected(entry.card.name, entry.count);

  // Comble tout écart restant (terrains manquants ET/OU non-terrains
  // manquants faute de pool suffisant) avec des terrains de base — un deck
  // avec plus de terrains que l'idéal reste jouable, alors qu'un deck de
  // moins de `deckSize` cartes ne l'est pas (règle Commander : exactement
  // deckSize cartes hors commandant). Couleurs cyclées dans l'identité du
  // commandant (déjà triée WUBRG) ; "Wastes" si commandant incolore.
  const landSlotsUsed = Array.from(finalResult.landsResult.picked.values()).reduce((s, e) => s + e.count, 0);
  const nonLandSlotsUsed = Array.from(finalResult.nonLandsResult.picked.values()).reduce((s, e) => s + e.count, 0);
  const remaining = idealLandCount - landSlotsUsed + (nonLandTarget - nonLandSlotsUsed);

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
 * évalué en construisant réellement son deck d'essai (`selectDeckFromPool`,
 * qui bénéficie automatiquement de la sélection itérative + archétype
 * robustifiée ci-dessus, aucun changement nécessaire ici) puis en calculant
 * son score avec `computeDeckStats`, exactement comme le deck final
 * affiché. Aucun appel réseau ici (tout est déjà résolu en amont, voir
 * buildDeckFromCollection dans actions.ts), donc classer même une
 * vingtaine de candidats reste rapide.
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

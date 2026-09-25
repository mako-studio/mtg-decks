import type { ArchetypeSignal, DeckCategory, EnrichedCard, FormatConfig, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";
import { classifyCard, computeDeckStats, EMPTY_CATEGORY_COUNTS, hasDeadSingletonSynergy } from "./deck-score";
import { cardMatchesArchetype, detectArchetypes } from "./archetype";
import { cardPowerScore, computeDeckTier, type DeckTierResult } from "./deck-tier";

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
 * - `cardPowerScore(card)` (deck-tier.ts), **la priorité principale
 *   depuis le 24/09/2026** (3e passage de la journée, demande de Ben :
 *   "l'objectif principal du builder n'est pas d'avoir le meilleur score
 *   de complétude mais le meilleur score de tier [...] je veux que le
 *   builder créé des decks les plus puissants possibles") — jusqu'à 6
 *   points pour un Game Changer, contre 2.5 pour `WEAKEST_CATEGORY_BONUS`
 *   ci-dessous : un Game Changer possédé l'emporte donc quasiment
 *   toujours sur une carte qui comblerait juste un pilier faible, sans
 *   pour autant rendre `WEAKEST_CATEGORY_BONUS` inutile (il départage
 *   toujours entre cartes de puissance égale, et garde un deck
 *   FONCTIONNEL — un tas de bombes sans removal/rampe n'est pas non plus
 *   "le deck le plus puissant possible" en pratique) ;
 * - un bonus de qualité individuelle plus léger (`edhrec_rank`, popularité
 *   générale — signal de désambiguïsation entre cartes non couvertes par
 *   `cardPowerScore`, volontairement sous la contribution d'un pilier
 *   correctement rempli) ;
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
 *
 * `powerScore` est de la même façon précalculé par l'appelant (voir
 * `powerScoreCache` dans `prepareCandidatePool`) plutôt que recalculé ici
 * via `cardPowerScore(card)` à chaque appel. ⚠️ Correctif de performance
 * du 24/09/2026 (Ben : "le site est bloqué à cette étape avec 1000
 * cartes" / "ça ne génère pas les commandants suggérés") : `priorityScore`
 * est appelée par `pickBestCards` pour CHAQUE carte restante à CHAQUE
 * itération de sa boucle (O(slots × cartes restantes) par appel de
 * `pickBestCards`, lui-même appelé 2 à 4 fois par candidat) — `cardPowerScore`
 * recalculant `classifyCard(card)` en interne (déjà disponible via
 * `categories` ci-dessus, donc un pur doublon) sur CHACUN de ces appels
 * transformait un simple calcul arithmétique en un travail regex-lourd
 * répété des dizaines de milliers de fois par commandant candidat évalué
 * (`rankCommanderCandidates`) — la cause dominante du blocage signalé,
 * bien plus coûteuse que le filtrage/la classification déjà mise en
 * cache côté `prepareCandidatePool`/`classifyCache`.
 */
function priorityScore(
  card: ScryfallCard,
  format: FormatConfig,
  categories: DeckCategory[],
  archetypeSignals: ArchetypeSignal[],
  powerScore: number
): number {
  const { weights, targets } = format.categories;
  let score = 0;
  for (const cat of categories) score += weights[cat] / targets[cat];

  score += powerScore;
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
  powerScoreCache: Map<string, number>,
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
      // Repli défensif `?? cardPowerScore(card)` : ne devrait jamais être
      // exercé en pratique (toute carte de `remaining` provient de
      // `legalCards`/`usable`, déjà présente dans `powerScoreCache` — voir
      // prepareCandidatePool), gardé seulement pour ne jamais planter si
      // cette invariant venait à changer.
      const power = powerScoreCache.get(card.id) ?? cardPowerScore(card);
      let score = priorityScore(card, format, cats, archetypeSignals, power);
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

/**
 * Résultat de `prepareCandidatePool` (voir sa doc juste en dessous) —
 * légalité dans le format + exclusion des synergies singleton mortes déjà
 * appliquées, classification par pilier (`classifyCard`) déjà calculée
 * pour chaque carte retenue.
 */
export interface PreparedPool {
  legalCards: ScryfallCard[];
  classifyCache: Map<string, DeckCategory[]>;
  /** Voir la note du 24/09/2026 dans la doc de `priorityScore` — `cardPowerScore(card)` précalculé une fois par carte plutôt que recalculé à chaque itération de `pickBestCards`. */
  powerScoreCache: Map<string, number>;
}

/**
 * Précalcule, pour un `pool`/`format` donnés, tout ce qui NE DÉPEND PAS du
 * commandant candidat : légalité (`isLegalInFormat`), exclusion des
 * synergies singleton mortes (`hasDeadSingletonSynergy`, deck-score.ts) et
 * classification par pilier (`classifyCard`, deck-score.ts — plusieurs
 * dizaines de tests regex par carte, la partie la plus coûteuse).
 *
 * ⚠️ Correctif de performance du 24/09/2026 (Ben : "le site est bloqué à
 * cette étape avec 1000 cartes", et "ça ne génère pas les commandants
 * suggérés" pour "Découvrir des commandants") : avant ce correctif,
 * `selectDeckFromPool` recalculait ce filtrage/cette classification DEPUIS
 * ZÉRO à chaque appel — et `rankCommanderCandidates` (juste plus bas)
 * l'appelle une fois PAR COMMANDANT CANDIDAT (jusqu'à ~175 pour
 * "Découvrir des commandants", potentiellement plusieurs centaines pour
 * les commandants possédés d'une grosse collection). Le coût, indépendant
 * du commandant, était donc multiplié par le nombre de candidats au lieu
 * de rester proportionnel à la taille de la collection — mesuré : ~7
 * secondes en calcul pur (sans latence réseau) pour seulement 100
 * candidats sur 1000 cartes (voir repro-1000-cards-2026-09-24.mts,
 * scratchpad), largement de quoi dépasser un timeout de fonction
 * serverless en production ou simplement donner l'impression que le site
 * est bloqué. `rankCommanderCandidates` appelle désormais cette fonction
 * UNE SEULE FOIS et réutilise son résultat pour chaque candidat ; seule
 * l'identité couleur du commandant (qui, elle, varie par candidat) est
 * encore filtrée à l'intérieur de `selectDeckFromPool`, un filtrage sans
 * regex donc bien moins coûteux.
 */
export function prepareCandidatePool(pool: ScryfallCard[], format: FormatConfig): PreparedPool {
  const legalCards = pool.filter((card) => {
    if (!isLegalInFormat(card, format)) return false;
    // Voir la note identique dans l'ancienne version de `selectDeckFromPool`
    // (signalé par Ben le 24/09/2026, exemple : Mishra) — indépendant du
    // commandant, donc calculable ici une bonne fois pour toutes.
    if (format.maxCopies <= 1 && hasDeadSingletonSynergy(card)) return false;
    return true;
  });
  const classifyCache = new Map<string, DeckCategory[]>();
  const powerScoreCache = new Map<string, number>();
  for (const card of legalCards) {
    classifyCache.set(card.id, classifyCard(card));
    powerScoreCache.set(card.id, cardPowerScore(card));
  }
  return { legalCards, classifyCache, powerScoreCache };
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
  /**
   * Résultat de `prepareCandidatePool` déjà calculé pour ce `pool`/`format`
   * (24/09/2026, correctif de performance — voir sa doc). Optionnel :
   * `rankCommanderCandidates` le calcule une fois et le fournit à chaque
   * appel pour éviter de le refaire par candidat ; un appel isolé
   * (`switchCollectionCommander`, `buildDeckWithUnownedCommander`,
   * `buildDeckFromCollection` pour le deck final) peut l'omettre —
   * `selectDeckFromPool` le calcule alors lui-même, un coût correct pour
   * un appel unique (seule la MULTIPLICATION par le nombre de candidats
   * posait problème).
   */
  prepared?: PreparedPool;
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

  // Légalité + exclusion singleton morte + classifyCard : indépendants du
  // commandant, voir prepareCandidatePool (correctif de performance du
  // 24/09/2026). Seule l'identité couleur (ci-dessous) dépend réellement
  // du commandant candidat.
  const {
    legalCards,
    classifyCache: preparedClassifyCache,
    powerScoreCache: preparedPowerScoreCache,
  } = params.prepared ?? prepareCandidatePool(pool, format);

  const eligible = legalCards.filter((card) => {
    if (card.name.toLowerCase() === commanderKey) return false;
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

  // Sous-ensembles du cache partagé (toutes les cartes de `usable` sont
  // dans `legalCards`, donc déjà présentes dans ces deux caches — aucun
  // recalcul de `classifyCard`/`cardPowerScore` ici).
  const classifyCache = preparedClassifyCache;
  const powerScoreCache = preparedPowerScoreCache;

  const idealLandCount = Math.round(format.categories.idealLandRatio * format.deckSize);
  const nonLandTarget = format.deckSize - idealLandCount;

  const runSelection = (archetypeSignals: ArchetypeSignal[]) => {
    const landsResult = pickBestCards(
      lands,
      idealLandCount,
      format,
      archetypeSignals,
      classifyCache,
      powerScoreCache,
      cappedCount,
      { ...EMPTY_CATEGORY_COUNTS }
    );
    const nonLandsResult = pickBestCards(
      nonLands,
      nonLandTarget,
      format,
      archetypeSignals,
      classifyCache,
      powerScoreCache,
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
  /** Score du deck d'essai construit pour ce commandant (computeDeckStats — même échelle/formule que le score final affiché) — critère SECONDAIRE de classement depuis le 24/09/2026 (voir trialTier). */
  trialScore: number;
  /**
   * Tier de puissance du deck d'essai (computeDeckTier) — critère
   * PRINCIPAL de classement depuis le 24/09/2026 (demande de Ben : "le
   * score de tier a la priorité"). Toujours défini : `rankCommanderCandidates`
   * n'est appelée que pour des formats à commandant (voir sa doc), donc
   * `computeDeckTier` s'applique toujours ici, contrairement à
   * `DeckAnalysisResult.tier` qui peut être `null` pour un format sans
   * commandant.
   */
  trialTier: DeckTierResult;
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
 * isCommanderEligible) par TIER de puissance du deck qu'on pourrait
 * construire avec chacun, le score de complétude servant de départage
 * secondaire (24/09/2026, 3e passage de la journée — demande de Ben :
 * "l'objectif principal du builder n'est pas d'avoir le meilleur score de
 * complétude mais le meilleur score de tier. Le score de tier a la
 * priorité." — avant ce changement, le tri se faisait uniquement par
 * score de complétude, ce qui pouvait présélectionner un commandant qui
 * couvre bien ses propres piliers plutôt que celui qui joue réellement le
 * plus fort). Pas une heuristique de classement à part : chaque candidat
 * est évalué en construisant réellement son deck d'essai
 * (`selectDeckFromPool`, qui bénéficie automatiquement de la sélection
 * itérative + archétype + priorité puissance ci-dessus, aucun changement
 * nécessaire ici) puis en calculant son score (`computeDeckStats`) ET son
 * tier (`computeDeckTier`), exactement comme le deck final affiché.
 * Aucun appel réseau ici (tout est déjà résolu en amont, voir
 * buildDeckFromCollection dans actions.ts).
 *
 * ⚠️ Correctif de performance du 24/09/2026 (Ben : "le site est bloqué à
 * cette étape avec 1000 cartes" / "ça ne génère pas les commandants
 * suggérés") : `selectDeckFromPool` filtre/classe désormais une bonne
 * partie du pool (légalité, synergie singleton morte, `classifyCard`) de
 * façon indépendante du commandant — voir `prepareCandidatePool`. Calculé
 * ICI une seule fois pour tous les candidats plutôt que refait depuis
 * zéro par `selectDeckFromPool` à chaque itération de la boucle
 * ci-dessous : sans ça, ce travail (coûteux — dizaines de regex par
 * carte) était multiplié par le nombre de candidats (jusqu'à ~175 pour
 * "Découvrir des commandants", potentiellement plus pour les commandants
 * possédés d'une grosse collection), au lieu de rester proportionnel à la
 * taille de la collection. Voir la doc de `prepareCandidatePool` pour la
 * mesure exacte (~7s pour 100 candidats sur 1000 cartes, en calcul pur).
 */
export function rankCommanderCandidates(params: RankCandidatesParams): RankedCommanderCandidate[] {
  const { pool, ownedCounts, candidates, format, basics } = params;
  const byName = new Map<string, ScryfallCard>();
  for (const c of pool) byName.set(c.name.toLowerCase(), c);
  for (const c of basics.values()) byName.set(c.name.toLowerCase(), c);

  const prepared = prepareCandidatePool(pool, format);

  const ranked = candidates.map((commander) => {
    const trialPool = pool.filter((c) => c.name.toLowerCase() !== commander.name.toLowerCase());
    const deckCards = selectDeckFromPool({ pool: trialPool, ownedCounts, commander, format, basics, prepared });
    const enriched = toEnriched(deckCards, byName);
    const stats = computeDeckStats(enriched, format.categories);
    const tier = computeDeckTier(enriched, [commander], stats, format.categories);
    return { card: commander, trialScore: stats.score, trialTier: tier };
  });

  ranked.sort((a, b) => {
    if (b.trialTier.powerIndex !== a.trialTier.powerIndex) return b.trialTier.powerIndex - a.trialTier.powerIndex;
    if (b.trialScore !== a.trialScore) return b.trialScore - a.trialScore;
    // Départage à tier ET score de deck d'essai égaux (cas fréquent avec
    // un pool petit) : popularité générale de la carte elle-même (mêmes
    // champs officiels Scryfall que popularitySignal/buildRemovalCandidates
    // dans recommend.ts), pas une nouvelle donnée.
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

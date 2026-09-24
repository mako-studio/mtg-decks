"use server";

import type {
  ArchetypeSignal,
  CardSuggestion,
  DeckStats,
  EnrichedCard,
  FormatConfig,
  FormatKey,
  PreconDeck,
  ScryfallCard,
} from "./types";
import { parseArenaDeck, serializeArenaDeck } from "./arena-format";
import { arenaImportToPreconDeck } from "./arena-import";
import { parseDeckCsv } from "./csv-import";
import { parseCollectionCsv, parseCollectionText } from "./collection-import";
import {
  BASIC_LAND_BY_COLOR,
  isCommanderEligible,
  isLegalInFormat,
  rankCommanderCandidates,
  selectDeckFromPool,
} from "./collection-builder";
import { loadEnrichedDeck } from "./deck-loader";
import { buildRemovalCandidates, evaluateCardCompatibility, suggestImprovements } from "./recommend";
import { computeDeckStats } from "./deck-score";
import { computeDeckTier, type DeckTierResult } from "./deck-tier";
import { detectArchetypes } from "./archetype";
import { getFormat } from "./formats";
import {
  autocompleteCardNamesForLang,
  getCardByLocalizedName,
  getCardByName,
  getCardsByNames,
  getDisplayLocalizedName,
  getDisplayLocalizedText,
  getDisplayLocalizedTypeLine,
  getDisplayOracleText,
  getLocalizedPrint,
  searchCards,
} from "./scryfall";

export interface DeckAnalysisResult {
  ok: boolean;
  error: string | null;
  formatKey: FormatKey;
  deckName: string;
  commanderEntries: EnrichedCard[];
  cards: EnrichedCard[];
  currentStats: DeckStats | null;
  projectedStats: DeckStats | null;
  improvementPct: number;
  suggestions: CardSuggestion[];
  /** Archétype(s)/stratégie(s) détectés pour ce deck (voir archetype.ts) — tableau vide si aucun signal clair. */
  archetypes: ArchetypeSignal[];
  /**
   * Tier de puissance 1-5 (low/mid/top), voir deck-tier.ts — axe séparé du
   * score structurel `currentStats.score` (24/09/2026, demande de Ben).
   * `null` pour un format sans commandant (le système de Game Changers/
   * brackets est une notion Commander, voir computeDeckTier) ou tant que
   * l'analyse n'a pas encore réussi.
   */
  tier: DeckTierResult | null;
  exportText: string;
  /**
   * Renseignés uniquement par `analyzeCsvImport` : cartes à remettre dans
   * l'état "ajoutée via suggestion" / "à retirer" dès le montage du
   * DeckBuilder, pour reprendre exactement la session exportée en CSV
   * (voir CsvImportForm.tsx). `undefined` pour tous les autres chemins
   * (précon, import Arena) — pas de restauration à faire dans ces cas.
   */
  restoredAddedNames?: string[];
  restoredMarkedForRemoval?: string[];
}

function emptyResult(formatKey: FormatKey, deckName: string, error: string): DeckAnalysisResult {
  return {
    ok: false,
    error,
    formatKey,
    deckName,
    commanderEntries: [],
    cards: [],
    currentStats: null,
    projectedStats: null,
    improvementPct: 0,
    suggestions: [],
    archetypes: [],
    tier: null,
    exportText: "",
  };
}

/**
 * Server Action centrale : résout un deck (commandant + cartes) auprès de
 * Scryfall, calcule score/suggestions pour le format donné, et prépare
 * l'export texte Arena si pertinent. Réutilisée par :
 * - le rendu initial des pages deck (précon papier, galerie Arena) ;
 * - l'import d'un deck Arena collé (après parsing du texte) ;
 * - chaque ajout/retrait de carte dans le simulateur (DeckBuilder), pour
 *   recalculer le deck "en direct" avec la nouvelle liste de cartes.
 */
export async function analyzeDeck(input: {
  formatKey: string;
  deckName: string;
  /** Un ou plusieurs commandants (partenaires) — vide pour un deck sans commandant. */
  commanders: string[];
  cards: { name: string; count: number }[];
}): Promise<DeckAnalysisResult> {
  const format = getFormat(input.formatKey);
  const deck: PreconDeck = {
    id: "session",
    name: input.deckName,
    setCode: "",
    setName: "",
    releaseDate: "",
    commanders: input.commanders,
    cardCount: input.cards.reduce((sum, c) => sum + c.count, 0) + input.commanders.length,
    cards: input.cards,
    source: null,
  };

  try {
    const { commanderCards, cards, colorIdentity } = await loadEnrichedDeck(deck, format);
    const nonCommanderCards = cards.filter((c) => !c.isCommander);
    const commanderEntries = cards.filter((c) => c.isCommander);

    const { currentStats, projectedStats, improvementPct, suggestions, archetypes } =
      await suggestImprovements(nonCommanderCards, colorIdentity, format, commanderCards, 10);

    // Tier de puissance (24/09/2026, demande de Ben) : uniquement pour les
    // formats à commandant — le système de Game Changers/brackets dont il
    // s'inspire (voir deck-tier.ts) est une notion Commander, elle n'a pas
    // de sens pour Standard/Historic/etc. Calculé sur les mêmes
    // `nonCommanderCards`/`commanderCards`/`currentStats` que le reste de
    // cette fonction, pas de résolution Scryfall supplémentaire.
    const tier = format.hasCommander
      ? computeDeckTier(nonCommanderCards, commanderCards, currentStats, format.categories)
      : null;

    const exportText = format.arenaOnly
      ? serializeArenaDeck({
          commander:
            commanderCards[0] && commanderEntries[0]
              ? { card: commanderCards[0], count: commanderEntries[0].count }
              : null,
          deck: nonCommanderCards
            .filter((c) => c.card)
            .map((c) => ({ card: c.card!, count: c.count })),
        })
      : "";

    return {
      ok: true,
      error: null,
      formatKey: format.key,
      deckName: input.deckName,
      commanderEntries,
      cards: nonCommanderCards,
      currentStats,
      projectedStats,
      improvementPct,
      suggestions,
      archetypes,
      tier,
      exportText,
    };
  } catch {
    return emptyResult(
      format.key,
      input.deckName,
      "Erreur pendant l'analyse (service Scryfall indisponible ?). Réessaie dans quelques instants."
    );
  }
}

/**
 * Server Action liée au formulaire d'import (voir ArenaImportForm.tsx) :
 * parse le texte collé puis délègue à `analyzeDeck`.
 */
export async function analyzeArenaImport(
  prevState: DeckAnalysisResult,
  formData: FormData
): Promise<DeckAnalysisResult> {
  const text = String(formData.get("decklist") ?? "");
  const formatKey = String(formData.get("format") ?? "historic") as FormatKey;

  const parsed = parseArenaDeck(text);
  if (!parsed.valid) {
    return emptyResult(
      formatKey,
      prevState.deckName || "Deck importé",
      "Impossible de lire ce texte comme un deck. Colle l'export tel quel depuis le bouton \"Export\" du client MTG Arena (menu du deck)."
    );
  }

  const deck = arenaImportToPreconDeck(parsed, "Deck importé");
  return analyzeDeck({
    formatKey,
    deckName: deck.name,
    commanders: deck.commanders,
    cards: deck.cards,
  });
}

/**
 * Server Action liée à l'import CSV (voir CsvImportForm.tsx) : reprend un
 * deck exporté précédemment (bouton "Exporter en CSV") pour continuer une
 * session d'optimisation plus tard — restaure aussi quelles cartes
 * étaient "ajoutée via suggestion" / "à retirer" via `restoredAddedNames`/
 * `restoredMarkedForRemoval`, pas juste la liste de cartes.
 */
export async function analyzeCsvImport(
  prevState: DeckAnalysisResult,
  formData: FormData
): Promise<DeckAnalysisResult> {
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    return emptyResult("commander", prevState.deckName || "Deck importé (CSV)", "Choisis un fichier CSV à importer.");
  }

  const text = await file.text();
  const parsed = parseDeckCsv(text);
  if (!parsed.ok) {
    return emptyResult(
      "commander",
      prevState.deckName || "Deck importé (CSV)",
      parsed.error ?? "Impossible de lire ce fichier CSV."
    );
  }

  const result = await analyzeDeck({
    formatKey: "commander",
    deckName: file.name.replace(/\.csv$/i, "") || "Deck importé (CSV)",
    commanders: parsed.commanders,
    cards: parsed.cards,
  });

  if (!result.ok) return result;

  return {
    ...result,
    restoredAddedNames: parsed.addedNames,
    restoredMarkedForRemoval: parsed.markedForRemoval,
  };
}

export interface LocalizedText {
  name: string;
  typeLine: string;
  text: string;
}

/**
 * Server Action : cherche l'impression française d'une carte pour la
 * bascule FR/EN (voir LanguageProvider.tsx + getLocalizedPrint dans
 * scryfall.ts). Retourne `null` si aucune impression FR n'existe — un
 * cas normal (beaucoup de cartes n'ont pas été traduites), pas une erreur.
 */
export async function fetchLocalizedText(cardName: string): Promise<LocalizedText | null> {
  const localized = await getLocalizedPrint(cardName, "fr");
  if (!localized) return null;
  const text = getDisplayLocalizedText(localized);
  const typeLine = getDisplayLocalizedTypeLine(localized);
  // Si l'impression FR trouvée n'a en fait pas de texte imprimé localisé
  // (carte vierge de texte, ou champ absent malgré lang=fr), pas la peine
  // de la traiter comme une traduction utilisable.
  if (!text && !typeLine) return null;
  return {
    name: getDisplayLocalizedName(localized),
    typeLine: typeLine || localized.type_line,
    text: text || getDisplayOracleText(localized),
  };
}

/**
 * Server Action : autocomplétion pour la recherche manuelle "ajouter une
 * carte" (AddCardSearch.tsx). Ne filtre pas par format/légalité — c'est
 * juste une liste de noms pour guider la saisie ; la légalité est vérifiée
 * ensuite par `searchCardToAdd` une fois une carte précise choisie.
 *
 * `lang` (28/08/2026, demande de Ben) : la recherche matche le nom dans la
 * langue actuellement sélectionnée par l'utilisateur (voir
 * LanguageProvider.tsx) — anglais par défaut si omis, pour ne rien changer
 * aux appelants qui n'ont pas encore ce contexte. Voir
 * autocompleteCardNamesForLang dans scryfall.ts pour le détail (et les
 * limites documentées) de la recherche en français.
 */
export async function autocompleteCardName(query: string, lang: "fr" | "en" = "en"): Promise<string[]> {
  if (!query || query.trim().length < 2) return [];
  return autocompleteCardNamesForLang(query, lang);
}

export interface CardEvaluationResult {
  /** Carte + rôle(s)/verdict/candidate au retrait (voir evaluateCardCompatibility dans recommend.ts). */
  suggestion: CardSuggestion;
  /** Statut de légalité brut renvoyé par Scryfall pour ce format (ex: "legal", "banned", "not_legal"). */
  legalityStatus: string;
  legal: boolean;
}

/**
 * Server Action : résout une carte par nom (approché si besoin — l'utilisateur
 * n'a pas forcément tapé l'orthographe exacte) puis évalue sa compatibilité
 * avec le deck actuel — quel rôle elle remplit, si le deck en manque, et
 * quelle carte du deck elle pourrait remplacer (voir AddCardSearch.tsx pour
 * le flow complet : chercher → voir l'impact → confirmer l'ajout ou le swap).
 * `currentCards` est renvoyé tel quel par le client (déjà résolu via
 * analyzeDeck), pas besoin de le recharger depuis Scryfall ici.
 *
 * Contrairement aux suggestions automatiques (recommend.ts), cette recherche
 * manuelle ne filtre PAS par légalité ni par identité de couleur : c'est le
 * deck de l'utilisateur, on l'informe (badge d'avertissement côté UI) sans
 * lui interdire d'ajouter une carte hors format ou hors couleurs.
 *
 * `commanderEntries` (28/08/2026, optionnel) : renvoyé tel quel par le
 * client (déjà résolu via analyzeDeck) comme `currentCards`, sert à la
 * détection d'archétype (voir evaluateCardCompatibility dans
 * recommend.ts) — même raisonnement que `commanders` dans
 * suggestImprovements.
 *
 * `lang` (28/08/2026, demande de Ben) : résout d'abord par nom imprimé
 * dans la langue sélectionnée (`getCardByLocalizedName`, voir scryfall.ts)
 * si `lang="fr"`, avec repli sur la résolution anglaise habituelle
 * (`getCardByName` fuzzy) si rien ne correspond — que ce soit parce que la
 * carte n'a pas d'impression française, ou que l'utilisateur a tapé un nom
 * anglais malgré le mode FR. `lang="en"` (défaut) garde le comportement
 * d'origine sans appel supplémentaire.
 */
export async function evaluateCardForDeck(
  query: string,
  formatKey: string,
  currentCards: EnrichedCard[],
  excludeFromSwap: string[] = [],
  commanderEntries: EnrichedCard[] = [],
  lang: "fr" | "en" = "en"
): Promise<CardEvaluationResult | null> {
  const q = query.trim();
  if (!q) return null;
  const format = getFormat(formatKey);
  const card =
    lang === "fr"
      ? (await getCardByLocalizedName(q, "fr")) ?? (await getCardByName(q, "fuzzy"))
      : await getCardByName(q, "fuzzy");
  if (!card) return null;
  const legalityStatus = card.legalities?.[format.scryfallLegality] ?? "not_legal";
  const legal = legalityStatus === "legal" || legalityStatus === "restricted";
  const commanders = commanderEntries.map((c) => c.card).filter((c): c is NonNullable<typeof c> => c !== null);
  const suggestion = evaluateCardCompatibility(card, currentCards, format, excludeFromSwap, commanders);
  return { suggestion, legalityStatus, legal };
}

/**
 * Server Action : résout une liste de noms de cartes en objets Scryfall
 * bruts, sans calcul de score/suggestions (contrairement à `analyzeDeck`).
 *
 * Sert uniquement à ré-enrichir la liste "retirées pendant cette session"
 * (RemovedCardsList.tsx) au moment de reprendre une session sauvegardée
 * (28/08/2026, demande de Ben) : comme le reste de la session persistée
 * (`SavedSession` dans DeckBuilder.tsx), seuls le nom et le nombre sont
 * gardés en localStorage, pas les données Scryfall complètes (image, type,
 * coût de mana) — il faut donc les re-demander une fois. Une carte non
 * résolue (ex. Scryfall indisponible) reste simplement absente de l'objet
 * renvoyé — traité comme "non trouvée" côté UI, pas une erreur bloquante.
 */
export async function resolveCardNames(names: string[]): Promise<Record<string, ScryfallCard | null>> {
  if (names.length === 0) return {};
  const byName = await getCardsByNames(names);
  const result: Record<string, ScryfallCard | null> = {};
  for (const name of names) result[name] = byName.get(name.toLowerCase()) ?? null;
  return result;
}

/**
 * Nombre de tours de suggestions appliqués par "Super Opti" (voir
 * `superOptimizeDeck` ci-dessous) avant de s'arrêter, même si le moteur en
 * proposerait encore. Compromis assumé, pas une science exacte : chaque
 * tour relance `suggestImprovements` (jusqu'à 10 requêtes Scryfall
 * séquentielles, throttlées ~110ms chacune côté client de ce site — voir
 * scryfall.ts — plus la latence réseau réelle), donc 4 tours peuvent déjà
 * représenter facilement 15-30+ secondes en conditions réelles. Un plafond
 * plus haut pousserait le score encore un peu plus loin (rendements
 * décroissants au fil des tours, les piliers les plus faibles étant comblés
 * en premier) au prix d'une attente plus longue pour l'utilisateur.
 */
const SUPER_OPTIMIZE_MAX_ROUNDS = 4;

/** Construit l'objet `PreconDeck` minimal attendu par `loadEnrichedDeck` à partir d'une liste plate {name,count} — factorisé ici car répété à chaque tour/étape de `superOptimizeDeck` et `topUpLandCount`. */
function sessionDeckFrom(
  cardsList: { name: string; count: number }[],
  deckName: string,
  commanders: string[]
): PreconDeck {
  return {
    id: "session",
    name: deckName,
    setCode: "",
    setName: "",
    releaseDate: "",
    commanders,
    cardCount: cardsList.reduce((sum, c) => sum + c.count, 0) + commanders.length,
    cards: cardsList,
    source: null,
  };
}

/**
 * Score ET tier d'une liste plate {name,count} — calcul direct via
 * `computeDeckStats`/`computeDeckTier` (pas de recherche Scryfall de
 * suggestions, contrairement à `suggestImprovements`), utilisé uniquement
 * pour comparer des états successifs de `working` dans `superOptimizeDeck`
 * (voir `bestWorking`/`bestScore`/`bestTier` et `isBetterState` ci-dessous).
 * `null` si le deck ne peut pas être résolu (Scryfall indisponible).
 *
 * ⚠️ Remplace l'ancien `scoreOfWorking` (24/09/2026, demande de Ben :
 * "l'objectif principal du builder n'est pas d'avoir le meilleur score de
 * complétude mais le meilleur score de tier [...] je veux que le builder
 * créé des decks les plus puissants possibles", confirmé "partout sur le
 * site" y compris Super Opti) — `tier` n'a de sens que pour les formats à
 * commandant (voir computeDeckTier, deck-tier.ts), `null` sinon.
 */
interface WorkingMeasure {
  score: number;
  tier: DeckTierResult | null;
}

async function measureWorking(
  cardsList: { name: string; count: number }[],
  format: FormatConfig,
  deckName: string,
  commanders: string[]
): Promise<WorkingMeasure | null> {
  try {
    const { commanderCards, cards } = await loadEnrichedDeck(sessionDeckFrom(cardsList, deckName, commanders), format);
    const nonCommanderCards = cards.filter((c) => !c.isCommander);
    const stats = computeDeckStats(nonCommanderCards, format.categories);
    const tier = format.hasCommander
      ? computeDeckTier(nonCommanderCards, commanderCards, stats, format.categories)
      : null;
    return { score: stats.score, tier };
  } catch {
    return null;
  }
}

/**
 * Décide si `candidate` est un meilleur état que `best` pour Super Opti —
 * priorité au tier de puissance (`powerIndex`, deck-tier.ts) sur le score
 * de complétude (24/09/2026, demande de Ben, voir doc de `measureWorking`
 * ci-dessus) : un état avec un `powerIndex` plus haut l'emporte MÊME s'il a
 * un score de complétude plus bas — c'est précisément le comportement
 * demandé ("le score de tier a la priorité"), pas un bug. À `powerIndex`
 * égal, le score départage. Pour un format sans commandant (`tier` toujours
 * `null` des deux côtés — voir analyzeDeck), ou si l'un des deux tiers
 * manque pour une raison quelconque, on retombe sur la comparaison de score
 * seule : la notion de tier n'existe pas hors Commander.
 */
function isBetterState(candidate: WorkingMeasure, best: WorkingMeasure): boolean {
  if (candidate.tier && best.tier) {
    if (candidate.tier.powerIndex !== best.tier.powerIndex) {
      return candidate.tier.powerIndex > best.tier.powerIndex;
    }
    return candidate.score > best.score;
  }
  return candidate.score > best.score;
}

/**
 * Plafond de sécurité pour `topUpLandCount` (voir sa doc) : en pratique
 * l'écart typique de quelques terrains se comble en 2-3 itérations et la
 * tolérance de `landHealthFor` (±3 terrains sur 99, voir deck-score.ts)
 * arrête la boucle bien avant ce plafond dans l'immense majorité des cas —
 * juste là pour ne jamais boucler indéfiniment si quelque chose se passe
 * mal (ex: candidates au retrait qui s'épuisent sans jamais satisfaire la
 * cible de terrains sur un très petit deck).
 */
const LAND_TOPUP_MAX_STEPS = 12;

/**
 * Comble un manque de terrains persistant, en aval des tours de
 * suggestions par pilier (29/08/2026, correctif demandé par Ben : "Super
 * Opti n'atteint pas le score maximal possible pour ce deck, et le nombre
 * de terrains reste très bas").
 *
 * Pourquoi c'est un passage à part et pas juste "plus de tours" :
 * `suggestImprovements` (recommend.ts) ne peut structurellement JAMAIS
 * combler un manque de terrains tout seul, quel que soit le nombre de
 * tours — les requêtes Scryfall de ramp/draw/tutor/finisher excluent
 * explicitement les terrains (`-t:land` dans `CATEGORY_QUERIES`), et
 * "landfix" ne vise que le fixing multicolore (produire plusieurs
 * couleurs), pas le compte total de terrains. Le choix de la catégorie la
 * plus faible à combler (`weakestFirst`, dans `suggestImprovements`) ne
 * regarde d'ailleurs que les 9 piliers, jamais `landHealth`. Sans ce
 * passage dédié, un deck avec trop peu de terrains n'atteint donc jamais
 * son score maximal, même avec un plafond de tours infini — ce n'était pas
 * volontaire, c'est un angle mort du moteur de suggestions par pilier.
 *
 * Un terrain de base (couleur cyclée parmi celles de `colorIdentity`, déjà
 * triée WUBRG par `loadEnrichedDeck` ; "Wastes" si le deck est incolore)
 * est échangé contre la carte hors-terrain la plus "sacrifiable" du deck
 * actuel — même heuristique `buildRemovalCandidates` que les swaps de
 * pilier (recommend.ts), juste filtrée pour ne jamais proposer de retirer
 * un terrain en échange d'un terrain (ce qui ne changerait rien au
 * problème) — une paire à la fois, jusqu'à ce que `landHealth` atteigne
 * son ratio maximal (dans la bande de tolérance de `landHealthFor`) ou que
 * `LAND_TOPUP_MAX_STEPS` soit atteint.
 *
 * ⚠️ Ne traite que le manque (trop peu de terrains), pas l'excès : retirer
 * un terrain en trop demande de décider QUOI ajouter à la place, une
 * décision qui appartient au moteur de suggestions par pilier plutôt qu'à
 * ce passage dédié — limitation connue et assumée, pas un oubli. Le cas
 * remonté par Ben (30 terrains sur 99, cible ~37) est un manque, donc
 * couvert.
 */
async function topUpLandCount(
  working: { name: string; count: number }[],
  format: FormatConfig,
  deckName: string,
  commanders: string[]
): Promise<{ working: { name: string; count: number }[]; stepsApplied: number }> {
  let current = working;
  let stepsApplied = 0;

  for (let step = 0; step < LAND_TOPUP_MAX_STEPS; step++) {
    let loaded;
    try {
      loaded = await loadEnrichedDeck(sessionDeckFrom(current, deckName, commanders), format);
    } catch {
      break; // Scryfall indisponible : on s'arrête là où on en est, comme le reste de superOptimizeDeck.
    }
    const { commanderCards, cards, colorIdentity } = loaded;
    const nonCommanderCards = cards.filter((c) => !c.isCommander);
    const stats = computeDeckStats(nonCommanderCards, format.categories);

    const total = stats.landCount + stats.totalNonLandCards;
    const idealLandCount = Math.round(format.categories.idealLandRatio * total);
    // On s'arrête dès que le ratio de santé est déjà maximal (dans la
    // tolérance) OU que le compte a rejoint/dépassé la cible — le second
    // test est une garde-fou supplémentaire pour ne jamais continuer à
    // ajouter des terrains une fois la cible atteinte, même si le ratio
    // mettait un instant à refléter l'arrondi.
    if (stats.landHealth.ratio >= 1 || stats.landCount >= idealLandCount) break;

    const landName =
      colorIdentity.length > 0 ? BASIC_LAND_BY_COLOR[colorIdentity[step % colorIdentity.length]] : "Wastes";
    if (!landName) break;

    const resolved = await getCardsByNames([landName]);
    const landCard = resolved.get(landName.toLowerCase());
    if (!landCard) break; // Terrain introuvable (réseau/Scryfall) : on s'arrête sans planter le reste de l'optimisation.

    const archetypes = detectArchetypes(nonCommanderCards, commanderCards);
    const removalCandidates = buildRemovalCandidates(
      nonCommanderCards,
      stats.categoryCounts,
      format.categories.targets,
      archetypes
    ).filter((candidate) => {
      // `buildRemovalCandidates` n'exclut que les terrains de base — un
      // terrain non-basique (dual land de fixing, etc.) resterait sinon
      // une candidate valide, et l'échanger contre un terrain de base ne
      // changerait rien au compte de terrains (le problème qu'on essaie
      // justement de résoudre ici).
      const entry = nonCommanderCards.find((e) => e.name.toLowerCase() === candidate.name.toLowerCase());
      return !entry?.card?.type_line?.includes("Land");
    });
    const swapOut = removalCandidates[0];
    if (!swapOut) break; // Plus aucune carte hors-terrain sacrifiable identifiée : on s'arrête plutôt que de retirer une pièce clé.

    current = applyOneSuggestion(current, {
      card: landCard,
      categories: [],
      reason: "Comble le manque de terrains du deck (voir landHealth).",
      impact: 0,
      swapOut: { name: swapOut.name, reason: "Cède sa place à un terrain pour combler le manque de terrains du deck." },
    });
    stepsApplied++;
  }

  return { working: current, stepsApplied };
}

/** Applique une suggestion (ajout, et retrait de `swapOut` si présent) à une liste plate {name,count} — même logique que confirmSwap dans DeckBuilder.tsx, reproduite ici côté serveur pour enchaîner les tours sans aller-retour réseau avec le client. */
function applyOneSuggestion(
  working: { name: string; count: number }[],
  suggestion: CardSuggestion
): { name: string; count: number }[] {
  const addKey = suggestion.card.name.toLowerCase();
  const already = working.find((c) => c.name.toLowerCase() === addKey);
  let next = already
    ? working.map((c) => (c.name.toLowerCase() === addKey ? { name: c.name, count: c.count + 1 } : c))
    : [...working, { name: suggestion.card.name, count: 1 }];

  if (suggestion.swapOut) {
    const removeKey = suggestion.swapOut.name.toLowerCase();
    const toRemove = next.find((c) => c.name.toLowerCase() === removeKey);
    if (toRemove) {
      next =
        toRemove.count > 1
          ? next.map((c) => (c.name.toLowerCase() === removeKey ? { name: c.name, count: c.count - 1 } : c))
          : next.filter((c) => c.name.toLowerCase() !== removeKey);
    }
  }
  return next;
}

export interface SuperOptimizeResult extends DeckAnalysisResult {
  /**
   * Cartes présentes en plus grand nombre (ou nouvellement présentes)
   * qu'au moment du clic — diff avant/après, même sémantique que
   * `restoredAddedNames` : le client les marque "ajoutée" (voir
   * handleSuperOptimize dans DeckBuilder.tsx).
   */
  addedNames: string[];
  /**
   * Cartes entièrement sorties du deck (compte tombé à 0) par
   * l'optimisation — le client les ajoute à la liste "Retirées pendant
   * cette session" (RemovedCardsList.tsx), avec leurs données Scryfall
   * déjà connues côté client (pas besoin de les re-résoudre).
   */
  removedNames: string[];
  /** Nombre de tours réellement exécutés avant convergence ou le plafond `SUPER_OPTIMIZE_MAX_ROUNDS`. */
  roundsApplied: number;
  /**
   * Nombre de terrains de base ajoutés par le passage dédié `topUpLandCount`
   * (29/08/2026, voir sa doc) — distinct de `roundsApplied` car ce n'est pas
   * un tour de suggestions par pilier, juste un ajustement du nombre de
   * terrains. `0` si le deck avait déjà assez de terrains ou si aucune
   * candidate au retrait n'a été trouvée.
   */
  landAdjustments: number;
  /**
   * Message informatif (PAS une erreur, voir `error`) sur l'issue :
   * `null` si l'optimisation a amélioré le deck normalement ; un message à
   * afficher tel quel si le deck était déjà au maximum de ce que
   * l'heuristique sait proposer, ou si aucune amélioration nette du score
   * n'a été trouvée (voir le filet de sécurité plus bas).
   */
  optimizationNote: string | null;
}

/**
 * Server Action "Super Opti" (28/08/2026, demande de Ben) : optimise le
 * deck en un seul clic en enchaînant plusieurs tours de suggestions
 * automatiques (celles déjà calculées par `suggestImprovements`, la même
 * heuristique que le panneau "Suggestions automatiques" — rien de nouveau
 * n'est inventé ici, ce bouton orchestre juste l'existant en boucle),
 * chaque tour appliquant l'intégralité des suggestions du lot (ajout, et
 * retrait de la candidate au swap si une a été trouvée) avant de relancer
 * l'analyse sur le nouveau deck pour le tour suivant. S'arrête dès qu'un
 * tour ne renvoie plus aucune suggestion (deck déjà au maximum de ce que
 * l'heuristique sait proposer) ou au bout de `SUPER_OPTIMIZE_MAX_ROUNDS`,
 * puis lance un passage dédié `topUpLandCount` (voir sa doc) pour combler
 * un manque de terrains que les tours par pilier ne savent structurellement
 * jamais corriger.
 *
 * Fonctionne aussi bien sur un deck précon que sur un deck importé (CSV ou
 * Arena) — c'est juste `DeckBuilder` qui l'appelle avec l'état courant du
 * deck, quelle que soit son origine.
 *
 * ⚠️ Heuristique, pas une garantie d'optimalité globale : chaque tour reste
 * un choix glouton (les meilleures suggestions de CE tour précis), pas une
 * recherche exhaustive de la meilleure combinaison possible sur l'ensemble
 * du deck — voir les limites déjà documentées pour `suggestImprovements`
 * (classification heuristique des piliers, `buildRemovalCandidates` qui ne
 * tient pas compte de la santé courbe/terrains lors du choix d'une carte à
 * retirer).
 *
 * ⚠️ Correctif du 29/08/2026 (remonté par Ben : "ça optimise mais ce n'est
 * pas le score maximal possible pour ce deck") : le filet de sécurité
 * antérieur ne comparait QUE le score de départ et le score final après
 * `SUPER_OPTIMIZE_MAX_ROUNDS` tours — si un tour tardif (ou le passage
 * terrains) faisait légèrement reculer le score global d'une heuristique
 * gloutonne, TOUT le parcours était jeté, y compris les gains bien réels
 * des tours précédents, et le deck revenait inchangé avec le message
 * "aucune amélioration nette trouvée" alors qu'un état intermédiaire était
 * strictement meilleur que le point de départ. Désormais, le meilleur état
 * (`bestWorking`/`bestScore`) est suivi à chaque étape (chaque tour par
 * pilier, puis après le passage terrains) et c'est CET état qui est retenu
 * en sortie — pas seulement le tout premier ou le tout dernier. Le filet de
 * sécurité en fin de fonction reste en place par prudence (si même le
 * meilleur état retrouvé était pire que le départ, cas qui ne devrait plus
 * arriver avec ce suivi mais jamais totalement exclu), pas comme mécanisme
 * principal.
 *
 * Non vérifié contre une vraie réponse Scryfall (même limite que le reste
 * du site dans cet environnement, voir README) — vérifié via données
 * simulées.
 */
export async function superOptimizeDeck(input: {
  formatKey: string;
  deckName: string;
  commanders: string[];
  cards: { name: string; count: number }[];
}): Promise<SuperOptimizeResult> {
  const initialCounts = new Map<string, number>();
  for (const c of input.cards) {
    const key = c.name.toLowerCase();
    initialCounts.set(key, (initialCounts.get(key) ?? 0) + c.count);
  }

  const format = getFormat(input.formatKey);
  const originalWorking = input.cards.map((c) => ({ name: c.name, count: c.count }));
  let working = originalWorking;
  let startingScore: number | null = null;
  // Tier de départ (24/09/2026, voir isBetterState ci-dessus) — capturé en
  // même temps que `startingScore`, sert au filet de sécurité en fin de
  // fonction pour rester cohérent avec le critère tier-prioritaire (sans
  // ça, un état retenu à tier plus haut mais score plus bas — exactement
  // le comportement voulu — déclencherait à tort le filet de sécurité
  // score-only et jetterait un gain de puissance réel).
  let startingTier: DeckTierResult | null = null;
  let roundsApplied = 0;

  // Meilleur état rencontré au fil du parcours, et son "coût" affiché
  // (voir le correctif du 29/08/2026 dans la doc ci-dessus) — `bestScore`
  // volontairement à `-Infinity` tant qu'aucune mesure réelle n'a encore
  // été prise (évite de traiter arbitrairement le départ comme "meilleur"
  // avant même la première mesure). `bestRoundsApplied`/`bestLandAdjustments`
  // sont snapshotés EN MÊME TEMPS que `bestWorking`, pas juste incrémentés
  // au fil de l'eau : sans ça, si un tour ou le passage terrains est
  // tenté mais pas retenu (parce qu'il fait reculer l'état, voir
  // isBetterState), les compteurs renvoyés au client annonceraient des
  // changements qui ne sont en réalité pas dans le deck final — voir aussi
  // le diff `addedNames`/`removedNames` plus bas, qui lui est calculé
  // directement sur `bestWorking` et fait foi en cas de doute.
  //
  // `bestTier` (24/09/2026, demande de Ben — voir doc de `measureWorking`/
  // `isBetterState` ci-dessus) : suivi en parallèle de `bestScore`, c'est
  // désormais LUI le critère principal de "meilleur état" pour les formats
  // à commandant.
  let bestWorking = originalWorking;
  let bestScore = -Infinity;
  let bestTier: DeckTierResult | null = null;
  let bestRoundsApplied = 0;
  let bestLandAdjustments = 0;

  try {
    for (let round = 0; round < SUPER_OPTIMIZE_MAX_ROUNDS; round++) {
      const { commanderCards, cards, colorIdentity } = await loadEnrichedDeck(
        sessionDeckFrom(working, input.deckName, input.commanders),
        format
      );
      const nonCommanderCards = cards.filter((c) => !c.isCommander);

      const { currentStats, suggestions } = await suggestImprovements(
        nonCommanderCards,
        colorIdentity,
        format,
        commanderCards,
        10
      );
      // Tier de cet état (24/09/2026, voir isBetterState ci-dessus) —
      // calculé sur les mêmes `nonCommanderCards`/`commanderCards`/
      // `currentStats` que `suggestImprovements` vient de produire, pas de
      // résolution Scryfall supplémentaire (même raisonnement que dans
      // analyzeDeck).
      const tierNow = format.hasCommander
        ? computeDeckTier(nonCommanderCards, commanderCards, currentStats, format.categories)
        : null;
      if (startingScore === null) {
        startingScore = currentStats.score;
        startingTier = tierNow;
      }
      if (isBetterState({ score: currentStats.score, tier: tierNow }, { score: bestScore, tier: bestTier })) {
        bestScore = currentStats.score;
        bestTier = tierNow;
        bestWorking = working;
        bestRoundsApplied = roundsApplied;
        bestLandAdjustments = 0;
      }
      if (suggestions.length === 0) break;

      for (const s of suggestions) working = applyOneSuggestion(working, s);
      roundsApplied++;
    }

    // État du dernier tour atteint par les tours par pilier ci-dessus, même
    // quand ce dernier tour a été appliqué juste avant la sortie de la
    // boucle par le plafond `SUPER_OPTIMIZE_MAX_ROUNDS` (auquel cas il n'a
    // encore jamais été mesuré, contrairement aux tours précédents — voir
    // la mesure en tête de boucle ci-dessus).
    const afterRounds = await measureWorking(working, format, input.deckName, input.commanders);
    if (afterRounds && isBetterState(afterRounds, { score: bestScore, tier: bestTier })) {
      bestScore = afterRounds.score;
      bestTier = afterRounds.tier;
      bestWorking = working;
      bestRoundsApplied = roundsApplied;
      bestLandAdjustments = 0;
    }

    // Passage dédié terrains (voir topUpLandCount) : sur le dernier état
    // de `working` obtenu ci-dessus, une fois les tours par pilier
    // épuisés (convergés ou plafond atteint). `roundsApplied` ne bouge
    // plus à partir d'ici : ce passage n'est pas un tour de suggestions
    // par pilier (voir `landAdjustments`, compteur séparé).
    const landTopup = await topUpLandCount(working, format, input.deckName, input.commanders);
    working = landTopup.working;

    if (landTopup.stepsApplied > 0) {
      const afterLandTopup = await measureWorking(working, format, input.deckName, input.commanders);
      if (afterLandTopup && isBetterState(afterLandTopup, { score: bestScore, tier: bestTier })) {
        bestScore = afterLandTopup.score;
        bestTier = afterLandTopup.tier;
        bestWorking = working;
        bestRoundsApplied = roundsApplied;
        bestLandAdjustments = landTopup.stepsApplied;
      }
    }
  } catch {
    // Erreur réseau/Scryfall en cours de route : on s'arrête là où on en
    // est plutôt que de tout perdre — `bestWorking` reflète le meilleur
    // état mesuré avant l'erreur.
  }

  const finalAnalysis = await analyzeDeck({
    formatKey: input.formatKey,
    deckName: input.deckName,
    commanders: input.commanders,
    cards: bestWorking,
  });

  // Diff cartes calculé sur `bestWorking` (pas sur `roundsApplied`/
  // `landAdjustments`, qui comptent des TENTATIVES, pas des changements
  // effectifs) : si aucun tour ni aucun ajustement de terrain retenu n'a
  // in fine amélioré le score, `bestWorking` est resté égal au deck de
  // départ et ce diff est vide — c'est ce vide, pas les compteurs de
  // tentatives, qui doit décider si le deck a réellement changé.
  const finalCounts = new Map<string, number>();
  for (const c of bestWorking) {
    const key = c.name.toLowerCase();
    finalCounts.set(key, (finalCounts.get(key) ?? 0) + c.count);
  }
  const addedNames: string[] = [];
  for (const [key, count] of finalCounts) {
    if (count > (initialCounts.get(key) ?? 0)) addedNames.push(key);
  }
  const removedNames: string[] = [];
  for (const key of initialCounts.keys()) {
    if (!finalCounts.has(key)) removedNames.push(key);
  }
  const changed = addedNames.length > 0 || removedNames.length > 0;

  if (!changed || !finalAnalysis.ok) {
    return {
      ...finalAnalysis,
      addedNames: [],
      removedNames: [],
      roundsApplied: bestRoundsApplied,
      landAdjustments: bestLandAdjustments,
      optimizationNote: finalAnalysis.ok
        ? "Ton deck est déjà au maximum de ce que cette heuristique sait proposer — aucun changement effectué."
        : null,
    };
  }

  // Filet de sécurité (voir la doc du correctif du 29/08/2026 ci-dessus) :
  // ne devrait plus se déclencher en pratique puisque `bestWorking` est
  // déjà, par construction, le meilleur état mesuré — gardé par prudence
  // au cas où une mesure se révélait incohérente avec `finalAnalysis`
  // (ex: `analyzeDeck` échoue puis retombe sur un score par défaut).
  //
  // ⚠️ Correctif du 24/09/2026 (tier prioritaire, voir isBetterState
  // ci-dessus) : comparer UNIQUEMENT `score` ici serait maintenant FAUX en
  // soi — le comportement voulu par Ben peut légitimement retenir un état
  // à tier plus haut mais score de complétude plus bas (ex: un deck plus
  // "puissant" mais légèrement moins rond sur ses 9 piliers). Un filet de
  // sécurité score-only déclencherait alors à tort sur exactement le cas
  // que ce correctif est censé permettre. Pour un format à commandant, on
  // ne régresse donc que si le tier final est strictement pire que le
  // tier de départ, ou à tier égal si le score a reculé ; pour un format
  // sans commandant (tier toujours `null`), la comparaison de score seule
  // reste inchangée.
  const finalTier = finalAnalysis.tier;
  const regressed =
    startingScore !== null &&
    (format.hasCommander && startingTier && finalTier
      ? finalTier.powerIndex < startingTier.powerIndex ||
        (finalTier.powerIndex === startingTier.powerIndex && (finalAnalysis.currentStats?.score ?? 0) < startingScore)
      : (finalAnalysis.currentStats?.score ?? 0) < startingScore);

  if (regressed) {
    const original = await analyzeDeck({
      formatKey: input.formatKey,
      deckName: input.deckName,
      commanders: input.commanders,
      cards: input.cards,
    });
    return {
      ...original,
      addedNames: [],
      removedNames: [],
      roundsApplied: 0,
      landAdjustments: 0,
      optimizationNote: format.hasCommander
        ? "Aucune amélioration nette du tier de puissance (ni, à tier égal, du score) n'a été trouvée après optimisation — le deck n'a pas été modifié."
        : "Aucune amélioration nette du score n'a été trouvée après optimisation — le deck n'a pas été modifié.",
    };
  }

  return {
    ...finalAnalysis,
    addedNames,
    removedNames,
    roundsApplied: bestRoundsApplied,
    landAdjustments: bestLandAdjustments,
    optimizationNote: null,
  };
}

export interface CollectionCommanderCandidate {
  name: string;
  /** Score (computeDeckStats, sur 100) du deck d'essai construit pour ce candidat — voir rankCommanderCandidates dans collection-builder.ts. */
  trialScore: number;
  /**
   * Tier de puissance (deck-tier.ts) du deck d'essai construit pour ce
   * candidat (24/09/2026, demande de Ben : le classement des commandants
   * candidats priorise désormais ce tier sur `trialScore` — voir
   * rankCommanderCandidates dans collection-builder.ts). Toujours défini
   * ici (contrairement à `DeckAnalysisResult.tier`, nullable pour les
   * formats sans commandant) : cette interface n'existe que pour des
   * candidats commandant, donc toujours un format à commandant.
   */
  trialTier: DeckTierResult;
}

export interface CollectionBuildResult extends DeckAnalysisResult {
  /** Commandants candidats détectés dans la collection, triés du meilleur score d'essai au moins bon (voir collection-builder.ts). Vide si l'analyse a échoué avant la détection. */
  candidates: CollectionCommanderCandidate[];
  /** Nom du commandant retenu pour CE résultat (le meilleur par défaut, ou celui choisi via switchCollectionCommander). `null` si l'analyse a échoué. */
  selectedCommander: string | null;
  /** Liste brute importée (avant résolution/sélection) — renvoyée telle quelle pour permettre de reconstruire le deck avec un autre commandant sans redemander le texte/CSV à Ben (voir switchCollectionCommander). */
  collectionCards: { name: string; count: number }[];
  /** Noms de la liste importée que Scryfall n'a pas su résoudre (faute de frappe probable) — affichés à Ben plutôt que silencieusement ignorés, cohérence avec la convention d'honnêteté du projet (HANDOFF.md §11). */
  unresolvedNames: string[];
}

function emptyCollectionResult(
  formatKey: string,
  deckName: string,
  error: string,
  collectionCards: { name: string; count: number }[] = []
): CollectionBuildResult {
  return {
    ...emptyResult(getFormat(formatKey).key, deckName, error),
    candidates: [],
    selectedCommander: null,
    collectionCards,
    unresolvedNames: [],
  };
}

/**
 * Construit le meilleur deck Commander/Duel Commander possible à partir
 * d'une collection possédée (05/09/2026, demande de Ben — voir
 * collection-builder.ts pour le détail de la sélection). Fonction centrale
 * réutilisée par les deux Server Actions liées aux formulaires d'import
 * (analyzeCollectionText/analyzeCollectionCsv, ci-dessous) ET par le
 * changement de commandant depuis l'UI (switchCollectionCommander) — dans
 * les trois cas, `collectionCards` est la même liste brute {name,count},
 * seul `preferredCommander` change.
 *
 * Étapes : résout la collection auprès de Scryfall (un seul appel groupé,
 * comme partout ailleurs sur ce site — voir getCardsByNames) ; détecte les
 * commandants éligibles qui sont aussi légaux dans le format choisi ; les
 * classe par score du deck qu'on obtiendrait avec chacun
 * (rankCommanderCandidates) ; retient `preferredCommander` s'il est fourni
 * et fait partie des candidats, sinon le mieux classé ; construit le deck
 * final pour ce commandant (selectDeckFromPool, avec complément en terrains
 * de base) ; puis délègue à `analyzeDeck` pour le score/les suggestions
 * d'acquisition — même pipeline que tous les autres decks du site, rien de
 * dupliqué à partir de là.
 */
export async function buildDeckFromCollection(input: {
  formatKey: string;
  deckName: string;
  collectionCards: { name: string; count: number }[];
  /** Commandant à utiliser si fourni et éligible/légal — sinon le mieux classé est retenu (voir doc ci-dessus). */
  preferredCommander?: string | null;
}): Promise<CollectionBuildResult> {
  const format = getFormat(input.formatKey);
  if (!format.hasCommander) {
    return emptyCollectionResult(
      format.key,
      input.deckName,
      "Ce format ne fonctionne pas avec un commandant — choisis Commander ou Duel Commander.",
      input.collectionCards
    );
  }
  if (input.collectionCards.length === 0) {
    return emptyCollectionResult(format.key, input.deckName, "Aucune carte reconnue dans ta collection.", []);
  }

  try {
    const names = input.collectionCards.map((c) => c.name);
    const resolvedPool = await getCardsByNames(names);
    const unresolvedNames = input.collectionCards
      .filter((c) => !resolvedPool.has(c.name.toLowerCase()))
      .map((c) => c.name);

    const ownedCounts = new Map<string, number>();
    for (const c of input.collectionCards) {
      const key = c.name.toLowerCase();
      if (!resolvedPool.has(key)) continue;
      ownedCounts.set(key, (ownedCounts.get(key) ?? 0) + c.count);
    }

    const pool = Array.from(resolvedPool.values());
    const candidates = pool.filter((card) => isCommanderEligible(card) && isLegalInFormat(card, format));
    if (candidates.length === 0) {
      return emptyCollectionResult(
        format.key,
        input.deckName,
        'Aucune carte de ta collection ne peut être commandant pour ce format (créature légendaire, ou carte avec "can be your commander"). Ajoute-en une à ta liste.',
        input.collectionCards
      );
    }

    const basicNames = Array.from(new Set([...Object.values(BASIC_LAND_BY_COLOR), "Wastes"]));
    const basics = await getCardsByNames(basicNames);

    const ranked = rankCommanderCandidates({ pool, ownedCounts, candidates, format, basics });
    const preferred = input.preferredCommander?.toLowerCase();
    const chosen = (preferred && ranked.find((r) => r.card.name.toLowerCase() === preferred)) || ranked[0];

    const deckCards = selectDeckFromPool({
      pool: pool.filter((c) => c.name.toLowerCase() !== chosen.card.name.toLowerCase()),
      ownedCounts,
      commander: chosen.card,
      format,
      basics,
    });

    const analysis = await analyzeDeck({
      formatKey: format.key,
      deckName: input.deckName,
      commanders: [chosen.card.name],
      cards: deckCards,
    });

    return {
      ...analysis,
      candidates: ranked.map((r) => ({ name: r.card.name, trialScore: r.trialScore, trialTier: r.trialTier })),
      selectedCommander: chosen.card.name,
      collectionCards: input.collectionCards,
      unresolvedNames,
    };
  } catch {
    return emptyCollectionResult(
      format.key,
      input.deckName,
      "Erreur pendant l'analyse (service Scryfall indisponible ?). Réessaie dans quelques instants.",
      input.collectionCards
    );
  }
}

/** Server Action liée au formulaire "coller ma liste" (voir CollectionImportForm.tsx) : parse le texte collé puis délègue à buildDeckFromCollection. */
export async function analyzeCollectionText(
  prevState: CollectionBuildResult,
  formData: FormData
): Promise<CollectionBuildResult> {
  const text = String(formData.get("collection") ?? "");
  const formatKey = String(formData.get("format") ?? "commander");
  const parsed = parseCollectionText(text);
  if (!parsed.ok) {
    return emptyCollectionResult(
      formatKey,
      prevState.deckName || "Deck depuis ma collection",
      parsed.error ?? "Impossible de lire cette liste."
    );
  }
  return buildDeckFromCollection({
    formatKey,
    deckName: "Deck depuis ma collection",
    collectionCards: parsed.cards,
  });
}

/** Server Action liée au formulaire d'import CSV de collection (voir CollectionImportForm.tsx) : parse le fichier puis délègue à buildDeckFromCollection. */
export async function analyzeCollectionCsv(
  prevState: CollectionBuildResult,
  formData: FormData
): Promise<CollectionBuildResult> {
  const file = formData.get("csv");
  const formatKey = String(formData.get("format") ?? "commander");
  if (!(file instanceof File) || file.size === 0) {
    return emptyCollectionResult(
      formatKey,
      prevState.deckName || "Deck depuis ma collection",
      "Choisis un fichier CSV à importer."
    );
  }
  const text = await file.text();
  const parsed = parseCollectionCsv(text);
  if (!parsed.ok) {
    return emptyCollectionResult(
      formatKey,
      prevState.deckName || "Deck depuis ma collection",
      parsed.error ?? "Impossible de lire ce fichier CSV."
    );
  }
  return buildDeckFromCollection({
    formatKey,
    deckName: file.name.replace(/\.csv$/i, "") || "Deck depuis ma collection",
    collectionCards: parsed.cards,
  });
}

/**
 * Reconstruit le deck avec un autre commandant candidat (voir le sélecteur
 * dans CollectionImportForm.tsx) — même `collectionCards` que l'analyse
 * initiale, pas besoin de redemander le texte/CSV à Ben. Server Action
 * appelée directement (pas liée à un `<form>`/useActionState, contrairement
 * aux deux ci-dessus) : même pattern que `analyzeDeck`/`superOptimizeDeck`
 * appelées depuis DeckBuilder.tsx pour chaque recalcul.
 */
export async function switchCollectionCommander(
  formatKey: string,
  deckName: string,
  collectionCards: { name: string; count: number }[],
  commanderName: string
): Promise<CollectionBuildResult> {
  return buildDeckFromCollection({ formatKey, deckName, collectionCards, preferredCommander: commanderName });
}

export interface UnownedCommanderSuggestion extends CollectionCommanderCandidate {
  /** Identité couleur (WUBRG) du commandant — pour un badge couleur côté UI, sans appel supplémentaire. */
  colorIdentity: string[];
}

/** Nombre de candidats évalués pour suggestUnownedCommanders ci-dessous — voir sa doc pour la justification (1 page Scryfall = 175 cartes). */
const UNOWNED_CANDIDATE_POOL_SIZE = 1;
/** Nombre de suggestions retournées à l'UI — assez pour choisir, pas au point de noyer Ben sous des options marginales. */
const UNOWNED_SUGGESTIONS_LIMIT = 8;

/**
 * Suggère des commandants que Ben NE POSSÈDE PAS, évalués sur le deck
 * qu'on pourrait réellement construire pour chacun avec UNIQUEMENT les
 * cartes déjà présentes dans sa collection (24/09/2026, demande de Ben :
 * "je veux aussi avoir une fonctionnalité de commanders recommandés avec
 * mes cartes même si je ne possède pas ces commanders dans mes cartes").
 *
 * Aucune nouvelle mécanique de score : réutilise tel quel
 * `rankCommanderCandidates` (collection-builder.ts), le même moteur qui
 * classe déjà les commandants POSSÉDÉS dans `buildDeckFromCollection` —
 * seule la provenance des candidats change. `selectDeckFromPool`
 * construit toujours le deck d'essai à partir du pool RÉELLEMENT possédé
 * par Ben (`pool`/`ownedCounts`), jamais du commandant non possédé
 * lui-même : un commandant hors des couleurs de sa collection se
 * retrouve donc naturellement avec un pool quasi vide et un score
 * d'essai bas (terrains de base seuls) — pas besoin de filtrer les
 * couleurs à la main, le score existant pénalise déjà l'incompatibilité.
 *
 * Bassin de candidats : les commandants légaux les plus populaires du
 * format (recherche `is:commander legal:<format>`, triée par popularité
 * EDHREC, ${UNOWNED_CANDIDATE_POOL_SIZE} page = jusqu'à 175 cartes) —
 * pas l'exhaustivité de toutes les créatures légendaires jamais
 * imprimées (plusieurs milliers), qui rendrait l'évaluation lente et
 * proposerait surtout des curiosités obscures plutôt que des commandants
 * connus et effectivement jouables. `is:commander` est un opérateur de
 * recherche Scryfall documenté (https://scryfall.com/docs/syntax,
 * "cartes qui peuvent être commandant") — non re-vérifié en direct (accès
 * à api.scryfall.com bloqué depuis mon environnement de dev, voir la
 * note en tête de scryfall.ts), mais c'est un opérateur stable et
 * largement utilisé côté communauté ; `isCommanderEligible`/
 * `isLegalInFormat` sont réappliqués en filet de sécurité sur le résultat
 * plutôt que de faire une confiance aveugle à la recherche.
 *
 * Action SÉPARÉE de `buildDeckFromCollection`, appelée à la demande côté
 * UI (pas à chaque analyse/changement de commandant possédé) : elle
 * ajoute une recherche Scryfall et l'évaluation d'une grosse poignée de
 * candidats, un coût qu'on ne veut payer que si Ben ouvre effectivement
 * cette fonctionnalité.
 */
export async function suggestUnownedCommanders(
  formatKey: string,
  collectionCards: { name: string; count: number }[]
): Promise<{ ok: true; suggestions: UnownedCommanderSuggestion[] } | { ok: false; error: string }> {
  const format = getFormat(formatKey);
  if (!format.hasCommander) {
    return { ok: false, error: "Ce format ne fonctionne pas avec un commandant." };
  }
  if (collectionCards.length === 0) {
    return { ok: false, error: "Aucune carte reconnue dans ta collection." };
  }

  try {
    const names = collectionCards.map((c) => c.name);
    const resolvedPool = await getCardsByNames(names);
    const ownedCounts = new Map<string, number>();
    for (const c of collectionCards) {
      const key = c.name.toLowerCase();
      if (!resolvedPool.has(key)) continue;
      ownedCounts.set(key, (ownedCounts.get(key) ?? 0) + c.count);
    }
    const pool = Array.from(resolvedPool.values());
    const ownedNames = new Set(pool.map((c) => c.name.toLowerCase()));

    const popular = await searchCards(
      `is:commander legal:${format.scryfallLegality}`,
      UNOWNED_CANDIDATE_POOL_SIZE,
      "edhrec",
      "cards"
    );
    const unowned = popular.filter(
      (card) =>
        !ownedNames.has(card.name.toLowerCase()) && isCommanderEligible(card) && isLegalInFormat(card, format)
    );
    if (unowned.length === 0) {
      return {
        ok: false,
        error: "Aucun commandant supplémentaire trouvé (tous déjà possédés, ou service Scryfall indisponible).",
      };
    }

    const basicNames = Array.from(new Set([...Object.values(BASIC_LAND_BY_COLOR), "Wastes"]));
    const basics = await getCardsByNames(basicNames);

    const ranked = rankCommanderCandidates({ pool, ownedCounts, candidates: unowned, format, basics });
    return {
      ok: true,
      suggestions: ranked.slice(0, UNOWNED_SUGGESTIONS_LIMIT).map((r) => ({
        name: r.card.name,
        trialScore: r.trialScore,
        trialTier: r.trialTier,
        colorIdentity: r.card.color_identity,
      })),
    };
  } catch {
    return { ok: false, error: "Erreur pendant la recherche (service Scryfall indisponible ?). Réessaie dans quelques instants." };
  }
}

/**
 * Construit un deck d'APERÇU pour un commandant que Ben ne possède pas
 * (voir `suggestUnownedCommanders` ci-dessus) : "si j'avais ce commandant,
 * voici le meilleur deck que je pourrais construire avec ce que je
 * possède déjà". Différence avec `switchCollectionCommander` : ce
 * commandant n'est PAS cherché parmi les candidats possédés (il ne peut
 * pas l'être, par définition) — il est résolu directement auprès de
 * Scryfall par son nom exact (déjà connu, renvoyé par
 * `suggestUnownedCommanders`), puis le deck est construit avec le pool
 * RÉELLEMENT possédé par Ben, exactement comme pour n'importe quel autre
 * commandant (`selectDeckFromPool`, même moteur, aucune branche
 * spéciale).
 *
 * `candidates: []` dans le résultat : ce n'est pas un commandant possédé,
 * proposer de "changer de commandant possédé" depuis cet aperçu n'aurait
 * pas de sens — Ben revient à son deck normal via le lien dédié côté UI
 * (CollectionImportForm.tsx garde `submitted`, le résultat original, à
 * côté de cet aperçu).
 */
export async function buildDeckWithUnownedCommander(
  formatKey: string,
  deckName: string,
  collectionCards: { name: string; count: number }[],
  commanderName: string
): Promise<CollectionBuildResult> {
  const format = getFormat(formatKey);
  if (!format.hasCommander) {
    return emptyCollectionResult(
      format.key,
      deckName,
      "Ce format ne fonctionne pas avec un commandant.",
      collectionCards
    );
  }

  try {
    const names = collectionCards.map((c) => c.name);
    const resolvedPool = await getCardsByNames(names);
    const unresolvedNames = collectionCards
      .filter((c) => !resolvedPool.has(c.name.toLowerCase()))
      .map((c) => c.name);
    const ownedCounts = new Map<string, number>();
    for (const c of collectionCards) {
      const key = c.name.toLowerCase();
      if (!resolvedPool.has(key)) continue;
      ownedCounts.set(key, (ownedCounts.get(key) ?? 0) + c.count);
    }
    const pool = Array.from(resolvedPool.values());

    const commander = await getCardByName(commanderName, "exact");
    if (!commander || !isCommanderEligible(commander) || !isLegalInFormat(commander, format)) {
      return emptyCollectionResult(
        format.key,
        deckName,
        "Ce commandant est introuvable ou n'est pas légal dans ce format.",
        collectionCards
      );
    }

    const basicNames = Array.from(new Set([...Object.values(BASIC_LAND_BY_COLOR), "Wastes"]));
    const basics = await getCardsByNames(basicNames);

    const deckCards = selectDeckFromPool({
      pool: pool.filter((c) => c.name.toLowerCase() !== commander.name.toLowerCase()),
      ownedCounts,
      commander,
      format,
      basics,
    });

    const analysis = await analyzeDeck({
      formatKey: format.key,
      deckName,
      commanders: [commander.name],
      cards: deckCards,
    });

    return {
      ...analysis,
      candidates: [],
      selectedCommander: commander.name,
      collectionCards,
      unresolvedNames,
    };
  } catch {
    return emptyCollectionResult(
      format.key,
      deckName,
      "Erreur pendant la construction de l'aperçu (service Scryfall indisponible ?). Réessaie dans quelques instants.",
      collectionCards
    );
  }
}

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
import { loadEnrichedDeck } from "./deck-loader";
import { buildRemovalCandidates, evaluateCardCompatibility, suggestImprovements } from "./recommend";
import { computeDeckStats } from "./deck-score";
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
 * Score actuel (sur 100, avec landHealth/curveHealth) d'une liste plate
 * {name,count} — calcul direct via `computeDeckStats` (pas de recherche
 * Scryfall de suggestions, contrairement à `suggestImprovements`), utilisé
 * uniquement pour comparer des états successifs de `working` dans
 * `superOptimizeDeck` (voir `bestWorking`/`bestScore` ci-dessous). `null`
 * si le deck ne peut pas être résolu (Scryfall indisponible).
 */
async function scoreOfWorking(
  cardsList: { name: string; count: number }[],
  format: FormatConfig,
  deckName: string,
  commanders: string[]
): Promise<number | null> {
  try {
    const { cards } = await loadEnrichedDeck(sessionDeckFrom(cardsList, deckName, commanders), format);
    const nonCommanderCards = cards.filter((c) => !c.isCommander);
    return computeDeckStats(nonCommanderCards, format.categories).score;
  } catch {
    return null;
  }
}

/** Une couleur de terrain de base par lettre WUBRG — pour choisir quel terrain ajouter dans `topUpLandCount`. */
const BASIC_LAND_BY_COLOR: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

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
  let roundsApplied = 0;

  // Meilleur état rencontré au fil du parcours, et son "coût" affiché
  // (voir le correctif du 29/08/2026 dans la doc ci-dessus) — `bestScore`
  // volontairement à `-Infinity` tant qu'aucune mesure réelle n'a encore
  // été prise (évite de traiter arbitrairement le départ comme "meilleur"
  // avant même la première mesure). `bestRoundsApplied`/`bestLandAdjustments`
  // sont snapshotés EN MÊME TEMPS que `bestWorking`, pas juste incrémentés
  // au fil de l'eau : sans ça, si un tour ou le passage terrains est
  // tenté mais pas retenu (parce qu'il fait reculer le score), les
  // compteurs renvoyés au client annonceraient des changements qui ne
  // sont en réalité pas dans le deck final — voir aussi le diff
  // `addedNames`/`removedNames` plus bas, qui lui est calculé directement
  // sur `bestWorking` et fait foi en cas de doute.
  let bestWorking = originalWorking;
  let bestScore = -Infinity;
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
      if (startingScore === null) startingScore = currentStats.score;
      if (currentStats.score > bestScore) {
        bestScore = currentStats.score;
        bestWorking = working;
        bestRoundsApplied = roundsApplied;
        bestLandAdjustments = 0;
      }
      if (suggestions.length === 0) break;

      for (const s of suggestions) working = applyOneSuggestion(working, s);
      roundsApplied++;
    }

    // Score du dernier état atteint par les tours par pilier ci-dessus,
    // même quand ce dernier tour a été appliqué juste avant la sortie de
    // la boucle par le plafond `SUPER_OPTIMIZE_MAX_ROUNDS` (auquel cas il
    // n'a encore jamais été mesuré, contrairement aux tours précédents —
    // voir la mesure en tête de boucle ci-dessus).
    const scoreAfterRounds = await scoreOfWorking(working, format, input.deckName, input.commanders);
    if (scoreAfterRounds !== null && scoreAfterRounds > bestScore) {
      bestScore = scoreAfterRounds;
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
      const scoreAfterLandTopup = await scoreOfWorking(working, format, input.deckName, input.commanders);
      if (scoreAfterLandTopup !== null && scoreAfterLandTopup > bestScore) {
        bestScore = scoreAfterLandTopup;
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
  if (startingScore !== null && (finalAnalysis.currentStats?.score ?? 0) < startingScore) {
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
      optimizationNote:
        "Aucune amélioration nette du score n'a été trouvée après optimisation — le deck n'a pas été modifié.",
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

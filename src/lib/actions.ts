"use server";

import type { ArchetypeSignal, CardSuggestion, DeckStats, EnrichedCard, FormatKey, PreconDeck, ScryfallCard } from "./types";
import { parseArenaDeck, serializeArenaDeck } from "./arena-format";
import { arenaImportToPreconDeck } from "./arena-import";
import { parseDeckCsv } from "./csv-import";
import { loadEnrichedDeck } from "./deck-loader";
import { evaluateCardCompatibility, suggestImprovements } from "./recommend";
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

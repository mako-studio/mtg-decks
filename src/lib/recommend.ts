import type {
  CardSuggestion,
  DeckCategory,
  DeckStats,
  EnrichedCard,
  FormatConfig,
  ScryfallCard,
} from "./types";
import { searchCards } from "./scryfall";
import { classifyCard, computeDeckStats } from "./deck-score";

/**
 * Requêtes Scryfall (syntaxe : https://scryfall.com/docs/syntax) utilisées
 * comme point de départ pour chaque catégorie. Ce ne sont pas des filtres
 * parfaits (voir la note sur `classifyCard` dans deck-score.ts) : les
 * résultats sont ensuite reclassés par `classifyCard` pour confirmer la
 * catégorie avant d'être proposés.
 */
const CATEGORY_QUERIES: Record<DeckCategory, string> = {
  ramp:
    '(o:"search your library for a basic land" or o:"additional land" or o:"add {c}{c}") -t:land',
  removal:
    '(o:"destroy target creature" or o:"exile target creature" or o:"deals damage to target creature")',
  wipe: '(o:"destroy all creatures" or o:"each creature" and o:"destroy")',
  draw: '(o:"draw two cards" or o:"draw a card" or o:"whenever you draw a card") -t:land',
  tutor: 'o:"search your library for a card" -t:land',
  protection: "(o:hexproof or o:indestructible or o:\"protection from\" or o:\"counter target spell\")",
  landfix: 't:land (o:"add one mana of any color" or o:"any color")',
};

function colorIdentityQuery(identity: string[]): string {
  const id = identity.length ? identity.join("").toLowerCase() : "c";
  return `id<=${id}`;
}

/**
 * Propose des cartes pour combler les catégories les plus faibles du deck,
 * dans les couleurs du deck (identité du commandant pour les formats
 * singleton, couleurs cumulées des cartes sinon), légales dans le format
 * choisi (et sur Arena si `format.arenaOnly`), en respectant le nombre
 * d'exemplaires maximum autorisé (`format.maxCopies`).
 */
export async function suggestImprovements(
  currentCards: EnrichedCard[],
  colorIdentity: string[],
  format: FormatConfig,
  maxSuggestions = 10
): Promise<{
  currentStats: DeckStats;
  projectedStats: DeckStats;
  improvementPct: number;
  suggestions: CardSuggestion[];
}> {
  const currentStats = computeDeckStats(currentCards, format.categories);

  const currentCounts = new Map<string, number>();
  for (const c of currentCards) {
    const key = c.name.toLowerCase();
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + c.count);
  }

  const targets = format.categories.targets;
  const weights = format.categories.weights;

  const weakestFirst = (Object.keys(currentStats.categoryCounts) as DeckCategory[])
    .map((cat) => ({
      cat,
      ratio: currentStats.categoryCounts[cat] / Math.max(1, targets[cat]),
    }))
    .sort((a, b) => a.ratio - b.ratio)
    .filter((c) => c.ratio < 1);

  const suggestions: CardSuggestion[] = [];
  const seen = new Set<string>();

  for (const { cat } of weakestFirst) {
    if (suggestions.length >= maxSuggestions) break;

    const legalityClause = `f:${format.scryfallLegality}`;
    const gameClause = format.arenaOnly ? "game:arena" : "-is:digital";
    const query = `${CATEGORY_QUERIES[cat]} ${legalityClause} ${colorIdentityQuery(colorIdentity)} ${gameClause}`;
    let results: ScryfallCard[] = [];
    try {
      results = await searchCards(query, 1);
    } catch {
      // La recherche Scryfall peut échouer (réseau, requête invalide) : on
      // passe simplement à la catégorie suivante plutôt que de faire
      // planter toute la page.
      continue;
    }

    for (const card of results) {
      if (suggestions.length >= maxSuggestions) break;
      const key = card.name.toLowerCase();
      const isBasicLand = card.type_line?.includes("Basic Land");
      const have = currentCounts.get(key) ?? 0;
      if (seen.has(key) || (!isBasicLand && have >= format.maxCopies)) continue;
      const categories = classifyCard(card);
      if (!categories.includes(cat)) continue;

      seen.add(key);
      suggestions.push({
        card,
        categories,
        reason: reasonFor(cat),
        impact: weights[cat] / targets[cat],
      });
    }
  }

  // Simule l'ajout des cartes suggérées pour projeter le nouveau score.
  const projectedCategoryCounts = { ...currentStats.categoryCounts };
  for (const s of suggestions) {
    for (const cat of s.categories) {
      projectedCategoryCounts[cat] += 1;
    }
  }
  let projectedScore = 0;
  for (const cat of Object.keys(projectedCategoryCounts) as DeckCategory[]) {
    const ratio = Math.min(projectedCategoryCounts[cat] / targets[cat], 1);
    projectedScore += ratio * weights[cat];
  }
  projectedScore = Math.round(projectedScore * 10) / 10;

  const projectedStats: DeckStats = {
    ...currentStats,
    categoryCounts: projectedCategoryCounts,
    score: projectedScore,
  };

  const improvementPct =
    currentStats.score > 0
      ? Math.round(((projectedScore - currentStats.score) / currentStats.score) * 1000) / 10
      : projectedScore > 0
        ? 100
        : 0;

  return { currentStats, projectedStats, improvementPct, suggestions };
}

function reasonFor(cat: DeckCategory): string {
  const labels: Record<DeckCategory, string> = {
    ramp: "Accélère votre mana disponible (rampe)",
    removal: "Retire une menace ciblée",
    wipe: "Balaye le board en cas de retard",
    draw: "Renouvelle votre main (pioche)",
    tutor: "Va chercher la pièce dont vous avez besoin",
    protection: "Protège votre commandant ou vos permanents clés",
    landfix: "Fixe votre mana multicolore",
  };
  return labels[cat];
}

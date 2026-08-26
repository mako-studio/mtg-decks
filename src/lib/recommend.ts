import type {
  CardSuggestion,
  CardVerdict,
  DeckCategory,
  DeckStats,
  EnrichedCard,
  FormatConfig,
  ScryfallCard,
  SwapCandidate,
} from "./types";
import { searchCards } from "./scryfall";
import { CATEGORY_LABELS, classifyCard, computeDeckStats } from "./deck-score";

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

  // Pour chaque suggestion, propose une carte du deck actuel à retirer en
  // échange ("swap"), plutôt que de laisser le deck grossir indéfiniment
  // (les decks Commander/Brawl/constructed visés ont tous une taille
  // cible fixe — voir formats.ts). Une seule candidate par carte du deck :
  // on évite de proposer de retirer la même carte pour plusieurs
  // suggestions différentes (peu ergonomique), donc les candidates sont
  // marquées "utilisées" au fur et à mesure.
  const removalCandidates = buildRemovalCandidates(
    currentCards,
    currentStats.categoryCounts,
    targets
  );
  const usedRemovals = new Set<string>();
  for (const s of suggestions) {
    const candidate = pickSwapCandidate(s, removalCandidates, usedRemovals, currentStats.categoryCounts, targets);
    if (candidate) {
      usedRemovals.add(candidate.name.toLowerCase());
      s.swapOut = candidate;
    } else {
      s.swapOut = null;
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

/**
 * Évalue la compatibilité d'une carte cherchée manuellement (voir
 * AddCardSearch.tsx) avec le deck actuel : quel(s) rôle(s) elle remplit,
 * si le deck en manque encore ou si c'est déjà bien couvert, et une
 * candidate au retrait pour en faire un swap — même heuristique et mêmes
 * fonctions internes que les suggestions automatiques (`suggestImprovements`
 * ci-dessus), appliquées ici à une carte choisie par l'utilisateur plutôt
 * qu'à un résultat de recherche Scryfall par catégorie.
 */
export function evaluateCardCompatibility(
  card: ScryfallCard,
  currentCards: EnrichedCard[],
  format: FormatConfig
): CardSuggestion {
  const currentStats = computeDeckStats(currentCards, format.categories);
  const targets = format.categories.targets;
  const categories = classifyCard(card);

  let verdict: CardVerdict;
  let reason: string;

  if (categories.length === 0) {
    verdict = "unclear";
    reason =
      "Aucun rôle clé détecté dans le texte de cette carte (rampe, removal, pioche, …) selon notre heuristique interne — elle peut malgré tout apporter une synergie que cette analyse ne mesure pas (voir les limites décrites dans le README).";
  } else {
    const underTarget = categories.filter((cat) => currentStats.categoryCounts[cat] < targets[cat]);
    if (underTarget.length > 0) {
      verdict = "improve";
      reason = `Comble un manque du deck : ${underTarget.map((c) => CATEGORY_LABELS[c]).join(", ")} (sous la cible actuellement).`;
    } else {
      verdict = "marginal";
      reason = `Catégorie${categories.length > 1 ? "s" : ""} déjà bien couverte${categories.length > 1 ? "s" : ""} dans le deck (${categories.map((c) => CATEGORY_LABELS[c]).join(", ")}) — ajout possible mais impact limité selon notre heuristique.`;
    }
  }

  const removalCandidates = buildRemovalCandidates(currentCards, currentStats.categoryCounts, targets);
  const pseudoSuggestion: CardSuggestion = { card, categories, reason, impact: 0 };
  const swapOut = pickSwapCandidate(
    pseudoSuggestion,
    removalCandidates,
    new Set(),
    currentStats.categoryCounts,
    targets
  );

  return { card, categories, reason, impact: 0, swapOut, verdict };
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

interface RemovalCandidate {
  name: string;
  categories: DeckCategory[];
  cmc: number;
  /** Score heuristique : plus c'est haut, plus la carte est "sacrifiable" sans risque. */
  removability: number;
}

/**
 * Classe les cartes du deck actuel (hors commandant et terrains de base)
 * de la plus "sacrifiable" à la moins sacrifiable, pour servir de vivier
 * de candidates au retrait lors d'un swap.
 *
 * Heuristique volontairement simple et explicable, dans le même esprit que
 * le reste du moteur de score (voir deck-score.ts) : une carte sans
 * catégorie identifiée (pas de rôle clé détecté dans son texte oracle) est
 * considérée générique et donc facilement remplaçable ; une carte dont
 * toutes les catégories sont déjà à/au-dessus de la cible est redondante
 * et donc elle aussi sacrifiable ; à l'inverse, une carte qui contribue à
 * une catégorie encore sous sa cible est pénalisée (on évite de la
 * proposer, elle comble un manque réel). Ce n'est pas une mesure de
 * puissance individuelle de la carte — juste un signal relatif.
 */
function buildRemovalCandidates(
  currentCards: EnrichedCard[],
  categoryCounts: Record<DeckCategory, number>,
  targets: Record<DeckCategory, number>
): RemovalCandidate[] {
  const list: RemovalCandidate[] = [];
  for (const entry of currentCards) {
    if (entry.isCommander || !entry.card) continue;
    if (entry.card.type_line?.includes("Basic Land")) continue;

    const categories = classifyCard(entry.card);
    let removability = 0;
    if (categories.length === 0) {
      removability += 3;
    } else {
      for (const cat of categories) {
        removability += categoryCounts[cat] >= targets[cat] ? 2 : -3;
      }
    }
    // Léger bonus aux cartes chères à lancer : à sacrifice égal, autant
    // garder les cartes les moins gourmandes en mana.
    removability += (entry.card.cmc ?? 0) * 0.1;

    list.push({ name: entry.name, categories, cmc: entry.card.cmc ?? 0, removability });
  }
  return list.sort(
    (a, b) => b.removability - a.removability || b.cmc - a.cmc || a.name.localeCompare(b.name)
  );
}

/**
 * Choisit, pour une suggestion d'ajout donnée, la meilleure candidate au
 * retrait parmi celles pas encore utilisées : en priorité une carte qui
 * partage une catégorie avec la suggestion et dont cette catégorie est
 * déjà couverte (= "mise à niveau" au sein du même rôle), sinon la carte
 * la plus sacrifiable qui ne touche à aucune catégorie visée par la
 * suggestion (= "rééquilibrage", pour ne pas retirer une pièce dont le
 * deck a justement besoin), sinon en dernier recours la carte la plus
 * sacrifiable tout court.
 */
function pickSwapCandidate(
  suggestion: CardSuggestion,
  candidates: RemovalCandidate[],
  used: Set<string>,
  categoryCounts: Record<DeckCategory, number>,
  targets: Record<DeckCategory, number>
): SwapCandidate | null {
  const suggestionKey = suggestion.card.name.toLowerCase();
  const available = candidates.filter(
    (c) => !used.has(c.name.toLowerCase()) && c.name.toLowerCase() !== suggestionKey
  );
  if (available.length === 0) return null;

  const upgrade = available.find(
    (c) => c.removability > 0 && c.categories.some((cat) => suggestion.categories.includes(cat))
  );
  const chosen =
    upgrade ??
    available.find((c) => !c.categories.some((cat) => suggestion.categories.includes(cat))) ??
    available[0];

  return { name: chosen.name, reason: swapReason(chosen, categoryCounts, targets) };
}

function swapReason(
  candidate: RemovalCandidate,
  categoryCounts: Record<DeckCategory, number>,
  targets: Record<DeckCategory, number>
): string {
  if (candidate.categories.length === 0) {
    return "Pas de rôle clé détecté sur cette carte (ramp/removal/pioche/…) — remplaçable sans perte identifiée.";
  }
  const overCovered = candidate.categories.filter((cat) => categoryCounts[cat] >= targets[cat]);
  if (overCovered.length > 0) {
    return `Catégorie déjà bien couverte dans le deck (${overCovered.map((c) => CATEGORY_LABELS[c]).join(", ")}) — une carte de plus dans ce rôle a peu d'impact.`;
  }
  return "Carte la moins impactante identifiée dans le deck actuel selon notre heuristique.";
}

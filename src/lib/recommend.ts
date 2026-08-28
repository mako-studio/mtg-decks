import type {
  Archetype,
  ArchetypeSignal,
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
import { cardMatchesArchetype, detectArchetypes } from "./archetype";

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
  finisher:
    '(o:"you win the game" or o:"loses the game" or o:"extra combat" or keyword:menace or o:"can\'t be blocked") -t:land',
  disruption:
    '(o:"can\'t cast" or o:"more to cast" or o:"can\'t untap" or o:"sacrifices a creature" or o:"discards two cards")',
};

function colorIdentityQuery(identity: string[]): string {
  const id = identity.length ? identity.join("").toLowerCase() : "c";
  return `id<=${id}`;
}

/**
 * Requêtes Scryfall de point de départ pour chaque archétype détecté
 * (voir archetype.ts) — même esprit que CATEGORY_QUERIES ci-dessus : pas
 * des filtres parfaits, les résultats sont reconfirmés par
 * `cardMatchesArchetype` avant d'être proposés (voir suggestForArchetype
 * ci-dessous). "tribal" n'a pas d'entrée fixe ici : sa requête dépend du
 * type de créature détecté, construite à la volée par `archetypeQueryFor`.
 */
const ARCHETYPE_QUERIES: Partial<Record<Archetype, string>> = {
  sacrifice:
    '(o:"sacrifice a creature" or o:"whenever a creature you control dies" or o:"you may sacrifice a creature")',
  counters: '(o:"+1/+1 counter" (o:proliferate or o:"double the number of" or o:"puts a +1/+1 counter"))',
  spellslinging: '(o:"whenever you cast an instant or sorcery spell" or o:magecraft or t:instant or t:sorcery)',
  artifacts: '(o:"whenever an artifact" or o:"artifacts you control get" or t:artifact) -t:land',
  lifegain: '(o:"whenever you gain life" or o:"gain life equal to")',
};

function archetypeQueryFor(signal: ArchetypeSignal): string | null {
  if (signal.archetype === "tribal") {
    const type = signal.label.replace(/^Tribal — /, "");
    return `(t:"${type}" or o:"${type}s")`;
  }
  return ARCHETYPE_QUERIES[signal.archetype] ?? null;
}

/** Nombre maximum de suggestions réservées à la synergie thématique (voir suggestImprovements) sur le total demandé — le reste va aux piliers génériques sous leur cible. */
const ARCHETYPE_SUGGESTION_BUDGET = 3;

/**
 * Cherche des cartes en synergie avec un archétype détecté du deck
 * (voir archetype.ts) — complète les suggestions par pilier, qui ne
 * mesurent que des rôles génériques (ramp/removal/...) indépendants de
 * la stratégie précise du deck. Même structure que la boucle par pilier
 * de suggestImprovements : requête Scryfall de point de départ, puis
 * confirmation carte par carte (ici via `cardMatchesArchetype` plutôt
 * que `classifyCard`) avant de proposer.
 */
async function suggestForArchetype(
  signal: ArchetypeSignal,
  colorIdentity: string[],
  format: FormatConfig,
  seen: Set<string>,
  currentCounts: Map<string, number>,
  maxCount: number
): Promise<CardSuggestion[]> {
  const query = archetypeQueryFor(signal);
  if (!query || maxCount <= 0) return [];

  const legalityClause = `f:${format.scryfallLegality}`;
  const gameClause = format.arenaOnly ? "game:arena" : "-is:digital";
  const fullQuery = `${query} ${legalityClause} ${colorIdentityQuery(colorIdentity)} ${gameClause}`;

  let results: ScryfallCard[] = [];
  try {
    results = await searchCards(fullQuery, 1);
  } catch {
    return [];
  }

  const out: CardSuggestion[] = [];
  for (const card of results) {
    if (out.length >= maxCount) break;
    const key = card.name.toLowerCase();
    const isBasicLand = card.type_line?.includes("Basic Land");
    const have = currentCounts.get(key) ?? 0;
    if (seen.has(key) || (!isBasicLand && have >= format.maxCopies)) continue;
    if (!cardMatchesArchetype(card, signal)) continue;

    seen.add(key);
    out.push({
      card,
      categories: classifyCard(card),
      reason: `Synergie thématique avec ton deck (${signal.label}), détectée d'après ton commandant et/ou la composition actuelle.`,
      // Signal qualitatif de synergie, pas dérivé d'un poids de pilier
      // (voir DeckCategory) : valeur arbitraire mais basse pour rester
      // cohérente avec les impacts "impact/target" des suggestions de
      // pilier, qui tournent generalement autour de 0.02-0.06.
      impact: 0.04,
      archetypeMatch: { archetype: signal.archetype, label: signal.label },
    });
  }
  return out;
}

/**
 * Propose des cartes pour combler les catégories les plus faibles du deck,
 * dans les couleurs du deck (identité du commandant pour les formats
 * singleton, couleurs cumulées des cartes sinon), légales dans le format
 * choisi (et sur Arena si `format.arenaOnly`), en respectant le nombre
 * d'exemplaires maximum autorisé (`format.maxCopies`).
 *
 * `commanders` (28/08/2026, optionnel/vide par défaut) sert à détecter
 * l'archétype du deck (voir archetype.ts) : quand un archétype est
 * détecté, une partie du budget de suggestions (`ARCHETYPE_SUGGESTION_BUDGET`)
 * est réservée à des cartes en synergie thématique plutôt qu'à des
 * piliers génériques — correctif du problème remonté par Ben ("deux
 * decks très différents avec le même commandant reçoivent les mêmes
 * suggestions génériques").
 */
export async function suggestImprovements(
  currentCards: EnrichedCard[],
  colorIdentity: string[],
  format: FormatConfig,
  commanders: ScryfallCard[] = [],
  maxSuggestions = 10
): Promise<{
  currentStats: DeckStats;
  projectedStats: DeckStats;
  improvementPct: number;
  suggestions: CardSuggestion[];
  archetypes: ArchetypeSignal[];
}> {
  const currentStats = computeDeckStats(currentCards, format.categories);
  const archetypes = detectArchetypes(currentCards, commanders);

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

  // Budget réservé à la synergie thématique quand un archétype est
  // détecté (voir doc ci-dessus) — le reste va aux piliers génériques.
  const archetypeBudget = archetypes.length > 0 ? Math.min(ARCHETYPE_SUGGESTION_BUDGET, maxSuggestions) : 0;
  const pillarBudget = maxSuggestions - archetypeBudget;

  for (const { cat } of weakestFirst) {
    if (suggestions.length >= pillarBudget) break;

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
      if (suggestions.length >= pillarBudget) break;
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

  // Suggestions de synergie thématique (voir suggestForArchetype
  // ci-dessus) : réparties entre les archétypes détectés (les plus
  // confiants d'abord, `archetypes` est déjà trié par detectArchetypes),
  // jusqu'au budget réservé ou à maxSuggestions au total.
  for (const signal of archetypes) {
    const remaining = Math.min(archetypeBudget, maxSuggestions - suggestions.length);
    if (remaining <= 0) break;
    const archSuggestions = await suggestForArchetype(
      signal,
      colorIdentity,
      format,
      seen,
      currentCounts,
      remaining
    );
    suggestions.push(...archSuggestions);
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
    targets,
    archetypes
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
  // ⚠️ Correctif du 28/08/2026 : le score (voir computeDeckStats,
  // deck-score.ts) inclut désormais curveHealth/landHealth en plus des 9
  // piliers — sans les rajouter ici aussi, currentStats.score (sur 100)
  // et projectedScore (qui ne comptait que les piliers, sur 84) étaient
  // sur des échelles différentes, ce qui pouvait afficher un score
  // "projeté" plus bas que l'actuel après avoir pourtant ajouté des
  // cartes utiles. Cette simulation n'essaie pas de réévaluer la courbe/
  // les terrains après ajout (les suggestions ne remplacent pas encore
  // réellement les cartes swap-out dans ce calcul) : on reprend tel
  // quel le ratio actuel, une approximation raisonnable pour quelques
  // cartes ajoutées sur un deck de ~99.
  projectedScore += currentStats.curveHealth.ratio * format.categories.curveWeight;
  projectedScore += currentStats.landHealth.ratio * format.categories.landWeight;
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

  return { currentStats, projectedStats, improvementPct, suggestions, archetypes };
}

/**
 * Évalue la compatibilité d'une carte cherchée manuellement (voir
 * AddCardSearch.tsx) avec le deck actuel : quel(s) rôle(s) elle remplit,
 * si le deck en manque encore ou si c'est déjà bien couvert, et une
 * candidate au retrait pour en faire un swap — même heuristique et mêmes
 * fonctions internes que les suggestions automatiques (`suggestImprovements`
 * ci-dessus), appliquées ici à une carte choisie par l'utilisateur plutôt
 * qu'à un résultat de recherche Scryfall par catégorie.
 *
 * `excludeFromSwap` (optionnel) : noms de cartes à ignorer comme candidate
 * au retrait — sert à faire tourner les propositions entre plusieurs
 * recherches manuelles successives (voir AddCardSearch.tsx) : sans ça, la
 * carte la plus "sacrifiable" du deck (souvent une seule, très générique)
 * ressort identique pour toute recherche qui ne partage aucune catégorie
 * avec elle, ce qui donne l'impression d'un outil qui répète toujours la
 * même réponse plutôt que d'analyser vraiment chaque carte.
 *
 * `commanders` (28/08/2026, optionnel/vide par défaut) sert à détecter
 * l'archétype du deck (voir archetype.ts) : une carte qui ne remplit
 * aucun des 9 piliers mais correspond au thème détecté du deck (ex: un
 * gobelin dans un deck tribal Gobelin) n'est plus classée "rôle non
 * identifié" — voir ci-dessous.
 */
export function evaluateCardCompatibility(
  card: ScryfallCard,
  currentCards: EnrichedCard[],
  format: FormatConfig,
  excludeFromSwap: string[] = [],
  commanders: ScryfallCard[] = []
): CardSuggestion {
  const currentStats = computeDeckStats(currentCards, format.categories);
  const targets = format.categories.targets;
  const categories = classifyCard(card);
  const archetypes = detectArchetypes(currentCards, commanders);
  const archetypeMatches = archetypes.filter((a) => cardMatchesArchetype(card, a));

  let verdict: CardVerdict;
  let reason: string;
  let archetypeMatch: CardSuggestion["archetypeMatch"];

  if (categories.length === 0 && archetypeMatches.length === 0) {
    verdict = "unclear";
    reason =
      "Aucun rôle clé détecté dans le texte de cette carte (rampe, removal, pioche, …) selon notre heuristique interne — elle peut malgré tout apporter une synergie que cette analyse ne mesure pas (voir les limites décrites dans le README)." +
      popularitySignal(card);
  } else if (categories.length === 0) {
    // Aucun pilier générique, mais correspond au thème détecté du deck
    // (voir archetype.ts) — plus utile à annoncer que "rôle non
    // identifié", même si ce n'est pas un pilier au sens strict.
    verdict = "improve";
    const match = archetypeMatches[0];
    archetypeMatch = { archetype: match.archetype, label: match.label };
    reason = `Correspond au thème détecté de ton deck (${match.label}) — aucun des 9 piliers génériques ne la classe, mais elle est en synergie avec ta stratégie.`;
  } else {
    const underTarget = categories.filter((cat) => currentStats.categoryCounts[cat] < targets[cat]);
    if (underTarget.length > 0) {
      verdict = "improve";
      reason = `Comble un manque du deck : ${underTarget.map((c) => CATEGORY_LABELS[c]).join(", ")} (sous la cible actuellement).`;
    } else {
      verdict = "marginal";
      reason = `Catégorie${categories.length > 1 ? "s" : ""} déjà bien couverte${categories.length > 1 ? "s" : ""} dans le deck (${categories.map((c) => CATEGORY_LABELS[c]).join(", ")}) — ajout possible mais impact limité selon notre heuristique.`;
    }
    if (archetypeMatches.length > 0) {
      const match = archetypeMatches[0];
      archetypeMatch = { archetype: match.archetype, label: match.label };
      reason += ` Correspond aussi au thème détecté de ton deck (${match.label}).`;
    }
  }

  const removalCandidates = buildRemovalCandidates(currentCards, currentStats.categoryCounts, targets, archetypes);
  const pseudoSuggestion: CardSuggestion = { card, categories, reason, impact: 0 };
  const swapOut = pickSwapCandidate(
    pseudoSuggestion,
    removalCandidates,
    new Set(excludeFromSwap.map((n) => n.toLowerCase())),
    currentStats.categoryCounts,
    targets
  );

  return { card, categories, reason, impact: 0, swapOut, verdict, archetypeMatch };
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
    finisher: "Aide à conclure la partie (évasion, combats supplémentaires, victoire alternative)",
    disruption: "Ralentit ou prive les adversaires de ressources (verrou, taxe, sacrifice forcé, défausse)",
  };
  return labels[cat];
}

/**
 * Signal complémentaire pour une carte "rôle non identifié" (aucun des 9
 * piliers ne matche) : `card.game_changer` et `card.edhrec_rank` sont des
 * champs officiels du Card Object Scryfall lui-même (pas un scraper
 * EDHREC non officiel, voir la note dans types.ts) qui donnent un
 * indicateur de puissance/popularité générale, indépendant des piliers.
 * Ça ne dit PAS si la carte comble un manque de CE deck précis (aucune
 * catégorie n'est ajoutée, le verdict reste "unclear") — juste un fait
 * objectif en plus, pour que "rôle non identifié" ne reste pas une
 * impasse totale sur des cartes hors du périmètre volontairement limité
 * des 9 piliers (ex : Mana Maze — un verrou symétrique inhabituel qui ne
 * matche aucun pilier). Aucun des deux champs n'implique "ajoute cette
 * carte à ton deck" : ils informent, ils ne recommandent pas.
 */
function popularitySignal(card: ScryfallCard): string {
  const parts: string[] = [];
  if (card.game_changer) {
    parts.push(
      "Classée \"Game Changer\" par le Commander Rules Committee (liste officielle de cartes jugées susceptibles de définir une partie à elles seules, utilisée pour les brackets) — signal de forte puissance générale, à manier selon les règles de ta table."
    );
  }
  if (typeof card.edhrec_rank === "number" && card.edhrec_rank > 0 && card.edhrec_rank <= 5000) {
    parts.push(
      `Très souvent jouée en Commander toutes couleurs confondues (rang de popularité EDHREC #${card.edhrec_rank}, donnée officielle Scryfall) — ce n'est pas une synergie avec ton deck précis, juste un signal que la carte est généralement appréciée.`
    );
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
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
 * proposer, elle comble un manque réel).
 *
 * ⚠️ Correctif du 28/08/2026 (remonté par Ben : "ça peut proposer de
 * retirer ma meilleure carte juste parce que son pilier est plein, et
 * protéger une carte faible juste parce que son pilier est vide") : deux
 * signaux supplémentaires, tous deux volontairement plus légers que
 * l'écart de catégorie ci-dessus (±3/±2), pour NUANCER sans inverser le
 * critère principal — piliers sous leur cible restent toujours prioritaires
 * à protéger :
 * - qualité individuelle de la carte (`card.game_changer`/`edhrec_rank`,
 *   champs officiels Scryfall — voir popularitySignal ci-dessus) : une
 *   carte notoirement puissante ou très jouée est protégée même si son
 *   pilier est "plein" ;
 * - synergie thématique (`archetypes`, voir archetype.ts) : une carte sur
 *   le thème détecté du deck est protégée même si elle ne remplit aucun
 *   des 9 piliers génériques.
 * Toujours pas une mesure de puissance absolue — un signal relatif de plus.
 */
function buildRemovalCandidates(
  currentCards: EnrichedCard[],
  categoryCounts: Record<DeckCategory, number>,
  targets: Record<DeckCategory, number>,
  archetypes: ArchetypeSignal[] = []
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

    // Qualité individuelle (voir doc ci-dessus) : protège les cartes
    // notoirement puissantes/populaires, sans jamais l'emporter à elle
    // seule sur un vrai manque de pilier (±5 max, contre ±3 par pilier
    // manquant — une carte qui comble 2 piliers sous leur cible reste
    // protégée quelle que soit sa popularité).
    if (entry.card.game_changer) removability -= 5;
    if (typeof entry.card.edhrec_rank === "number" && entry.card.edhrec_rank > 0) {
      if (entry.card.edhrec_rank <= 300) removability -= 3;
      else if (entry.card.edhrec_rank <= 1500) removability -= 1.5;
    }

    // Synergie thématique (voir doc ci-dessus) : protège les cartes sur
    // le thème détecté du deck, y compris celles sans catégorie/pilier.
    if (archetypes.some((a) => cardMatchesArchetype(entry.card!, a))) {
      removability -= 3;
    }

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

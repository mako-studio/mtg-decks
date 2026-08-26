import type { CategoryConfig, DeckCategory, DeckStats, EnrichedCard, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";

/**
 * Moteur de score interne pour évaluer la "puissance structurelle" d'un
 * deck Commander.
 *
 * ⚠️ Important (transparence) : il n'existe pas d'API publique officielle
 * EDHREC pour les synergies/recommandations. EDHREC ne documente ni ne
 * garantit d'accès programmatique à ses données de synergie ; les
 * "scrapers" communautaires trouvés en ligne ne sont pas une source
 * fiable ou dont l'usage est clairement autorisé par leurs CGU. Plutôt
 * que de dépendre d'une source non officielle et fragile, ce moteur
 * utilise une heuristique interne, inspirée des piliers classiques du
 * deckbuilding Commander (ramp, removal, card draw, board wipes, tutors,
 * protection, fixing de mana) et calculée uniquement à partir des
 * données Scryfall (texte oracle + type de carte).
 *
 * C'est une approximation, pas une vérité absolue : la détection par
 * mots-clés dans le texte oracle génère des faux positifs/négatifs
 * (ex: une carte qui "détruit" un artéfact sans être un removal de
 * créature). Le score sert d'indicateur relatif "avant / après", pas
 * de mesure de puissance certifiée.
 */

// Beaucoup de removal/wipe réels intercalent un ou plusieurs qualificatifs
// entre "target"/"all" et le nom (ex: "destroy target noncreature
// artifact", "destroy target attacking or blocking creature", "destroy
// all nontoken creatures") — sans tolérance, ces formulations très
// courantes ne matchaient jamais, quel que soit leur effet. `QUAL`
// autorise 0 à 3 mots avant le nom, borné par la ponctuation (un point ou
// une virgule collée à un mot casse le mot-qualificatif, donc ça ne
// "traverse" pas les phrases) : voir README pour l'exemple concret
// (Hulk Smash!, "Destroy target noncreature artifact.").
const QUAL = "(?:[a-z][a-z'-]*\\s+){0,3}";

const CATEGORY_PATTERNS: Record<DeckCategory, RegExp[]> = {
  ramp: [
    /search your library for a(n)? (basic )?land card/i,
    /add \{[wubrgc0-9]\}/i,
    /additional land/i,
    /lands you control/i,
    /add one mana of any (type|color)/i,
  ],
  removal: [
    new RegExp(`destroy target ${QUAL}(creature|permanent|artifact|enchantment|planeswalker)`, "i"),
    new RegExp(`exile target ${QUAL}(creature|permanent|artifact|enchantment|planeswalker)`, "i"),
    new RegExp(`exile up to (one|two|three) target ${QUAL}(creature|permanent|artifact|enchantment|planeswalker)`, "i"),
    /target creature gets -\d+\/-\d+/i,
    /deals? \d+ damage to target creature/i,
    // "Combat/bite" à sens unique sans le mot-clé "fight" (ex: Hulk Smash!
    // "Target creature you control deals damage equal to its power to
    // target creature an opponent controls.") — un removal conditionné à
    // avoir une créature suffisamment forte, comme "fights?" ci-dessous,
    // mais formulé explicitement plutôt que via le mot-clé.
    /deals? damage equal to its power to target creature/i,
    /return target (creature|permanent|nonland permanent).* to (its|their) owner's hand/i,
    /fights? target creature/i,
  ],
  wipe: [
    new RegExp(`destroy all ${QUAL}(creatures|permanents)`, "i"),
    new RegExp(`exile all ${QUAL}(creatures|permanents)`, "i"),
    /each creature (gets|is)/i,
    /each creature (you don't control|an opponent controls) (gets|is)/i,
    /all creatures get -\d+\/-\d+/i,
    /destroy each/i,
    /damage to each creature/i,
  ],
  draw: [
    /draw (a|one|two|three|four|five|x|\d+)( additional)? cards?/i,
    /draw cards equal to/i,
    /whenever .* draw a card/i,
    // Surveil/scry : pas une pioche littérale, mais reconnu dans le
    // deckbuilding Commander comme un outil de qualité/sélection de
    // cartes du même pilier ("card advantage") — voir README.
    /surveil \d+/i,
    /scry \d+/i,
  ],
  tutor: [/search your library for a card/i, /search your library for a .* card and put (it|that card) into your hand/i],
  protection: [
    /hexproof/i,
    /indestructible/i,
    /protection from/i,
    /counter target spell/i,
    /can't be countered/i,
    /\bward\b/i,
    /\bshroud\b/i,
  ],
  landfix: [/add \{[wubrg]\}.*\{[wubrg]\}/i, /any color/i],
  // "Finisher" mesure un axe différent des 7 piliers ci-dessus : pas le
  // moteur du deck, mais ce qui termine la partie. Volontairement limité à
  // des signaux textuels précis (victoire/défaite alternative, combats
  // supplémentaires, dégâts doublés, évasion difficile à bloquer) plutôt
  // qu'à la force/endurance brute d'une créature — sinon n'importe quelle
  // grosse créature vanille deviendrait un "finisher", ce qui viderait la
  // catégorie de son sens. Conséquence assumée : une bombe reconnue par les
  // joueurs mais dont l'effet n'est ni une victoire alternative, ni de
  // l'évasion, ni des dégâts doublés/combats supplémentaires (un moteur de
  // buff/valeur, par exemple) ne matchera pas "finisher" — ce n'est pas un
  // manque à combler par plus de mots-clés, voir le README.
  finisher: [
    /you win the game/i,
    /(target player|an opponent|that player|each opponent) loses? the game/i,
    /(extra|additional) combat( phase)?/i,
    /deals? double( that (much )?)? damage/i,
    /damage.* is doubled/i,
    /can't be blocked/i,
    /\bunblockable\b/i,
  ],
};

/** Libellés FR des catégories, partagés entre le moteur (raisons de swap) et l'UI. */
export const CATEGORY_LABELS: Record<DeckCategory, string> = {
  ramp: "Rampe",
  removal: "Removal",
  wipe: "Board wipe",
  draw: "Pioche",
  tutor: "Tutor",
  protection: "Protection",
  landfix: "Fixing",
  finisher: "Finisher",
};

/** Mots-clés Scryfall (card.keywords) considérés comme de la "protection". */
const PROTECTION_KEYWORDS = ["hexproof", "indestructible", "ward", "shroud"];

export function classifyCard(card: ScryfallCard): DeckCategory[] {
  const text = getDisplayOracleText(card);
  const isLand = card.type_line?.includes("Land");
  const categories: DeckCategory[] = [];

  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS) as [
    DeckCategory,
    RegExp[]
  ][]) {
    // "landfix" n'était auparavant vérifié QUE sur les terrains — un rocher
    // de mana ou une créature qui fixe les couleurs (ex: Arcane Signet)
    // n'était donc jamais reconnue, quel que soit son texte. Corrigé : le
    // fixing dépend de ce que la carte produit comme mana, pas de son type.
    if (category === "ramp" && isLand) continue; // les terrains de base ne comptent pas comme "ramp"
    if (patterns.some((p) => p.test(text))) {
      categories.push(category);
    }
  }

  // Signaux structurés Scryfall (déjà présents dans la réponse API, aucun
  // appel réseau supplémentaire) en complément des regex sur texte oracle
  // ci-dessus — plus fiables pour ce que Scryfall documente explicitement,
  // insensibles aux formulations variables ("Ward {2}" vs "Ward — Discard
  // a card", etc.).
  if (!categories.includes("protection")) {
    const keywords = (card.keywords ?? []).map((k) => k.toLowerCase());
    if (keywords.some((k) => PROTECTION_KEYWORDS.some((p) => k.includes(p)))) {
      categories.push("protection");
    }
  }
  if (!categories.includes("landfix")) {
    const coloredManaTypes = (card.produced_mana ?? []).filter((m) => "WUBRG".includes(m));
    if (coloredManaTypes.length >= 2) {
      categories.push("landfix");
    }
  }
  if (!categories.includes("finisher")) {
    const keywords = (card.keywords ?? []).map((k) => k.toLowerCase());
    if (keywords.includes("menace")) {
      categories.push("finisher");
    }
  }

  return categories;
}

export function computeDeckStats(cards: EnrichedCard[], config: CategoryConfig): DeckStats {
  const categoryCounts: Record<DeckCategory, number> = {
    ramp: 0,
    removal: 0,
    wipe: 0,
    draw: 0,
    tutor: 0,
    protection: 0,
    landfix: 0,
    finisher: 0,
  };

  let landCount = 0;
  let nonLandCount = 0;
  let cmcTotal = 0;

  for (const entry of cards) {
    if (!entry.card) continue;
    const { card } = entry;
    const isLand = card.type_line?.includes("Land");

    if (isLand) {
      landCount += entry.count;
    } else {
      nonLandCount += entry.count;
      cmcTotal += card.cmc * entry.count;
    }

    for (const cat of classifyCard(card)) {
      categoryCounts[cat] += entry.count;
    }
  }

  const avgCmc = nonLandCount > 0 ? cmcTotal / nonLandCount : 0;

  let score = 0;
  for (const cat of Object.keys(config.targets) as DeckCategory[]) {
    const ratio = Math.min(categoryCounts[cat] / config.targets[cat], 1);
    score += ratio * config.weights[cat];
  }

  return {
    totalNonLandCards: nonLandCount,
    landCount,
    avgCmc: Math.round(avgCmc * 100) / 100,
    categoryCounts,
    score: Math.round(score * 10) / 10,
  };
}

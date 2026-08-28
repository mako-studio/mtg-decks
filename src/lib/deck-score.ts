import type {
  CategoryConfig,
  DeckCategory,
  DeckStats,
  EnrichedCard,
  HealthSignal,
  ManaCurveBucket,
  ScryfallCard,
} from "./types";
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
 *
 * ⚠️ Correctif du 28/08/2026 (remonté par Ben : "le score ignore la
 * courbe de mana et le nombre de terrains") : le score intègre
 * désormais deux signaux structurels en plus des 9 piliers — santé de
 * la courbe de mana et santé du nombre de terrains (voir
 * curveHealthFor/landHealthFor ci-dessous) — avec leur propre poids
 * (config.curveWeight/landWeight), en gardant le même total de 100
 * points (voir le rééquilibrage dans formats.ts). Avant ce correctif,
 * un deck pouvait afficher 100/100 avec une courbe ou un nombre de
 * terrains problématique tant que les 9 piliers étaient couverts.
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
// Même idée que QUAL mais jusqu'à 4 mots — utilisé pour "can't cast (...)
// spell(s)" où le qualificatif est parfois plus long ("can't cast more
// than one spell").
const QUAL4 = "(?:[a-z][a-z'-]*\\s+){0,4}";
// Types de terrain de base (dont Wastes, incolore) — utilisé pour
// reconnaître les recherches de terrain typé ("search your library for a
// Forest card", ex: Wood Elves) en plus de "land card" littéral, sans quoi
// toute recherche de terrain typé plutôt que générique passait inaperçue.
const BASIC_LAND_TYPES = "plains|island|swamp|mountain|forest|wastes";

const CATEGORY_PATTERNS: Record<DeckCategory, RegExp[]> = {
  ramp: [
    new RegExp(`search your library for a(n)? ${QUAL}(land|${BASIC_LAND_TYPES})( card)?`, "i"),
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
  tutor: [
    // Tutor "libre" (n'importe quelle carte) — Vampiric Tutor et
    // équivalents : peu importe où la carte va ensuite (main, dessus de
    // bibliothèque, ...), "search your library for a card" tout court est
    // déjà un signal fort et sans ambiguïté.
    /search your library for a card/i,
    // Tutor "restreint" à un type de carte (Enlightened Tutor, Mystical
    // Tutor, Worldly Tutor, ...) : l'ancien motif exigeait explicitement
    // "and put (it|that card) into your hand", ce qui ratait TOUS les
    // tutors qui posent la carte sur le dessus de la bibliothèque plutôt
    // que dans la main (un template très courant, ex: Vampiric/Mystical/
    // Enlightened Tutor) — et exigeait l'article "a" alors que Scryfall
    // écrit "an" devant un type qui commence par une voyelle ("an artifact
    // ... card"). Corrigé : on ne regarde plus la destination, seulement
    // la restriction de type, et on exclut explicitement les recherches de
    // terrain (déjà comptées comme "ramp" ci-dessus, pas comme tutor — un
    // fetch de terrain n'est pas un tutor de carte-clé).
    new RegExp(
      `search your library for a(n)? (?!(basic )?(lands?|${BASIC_LAND_TYPES})\\b)${QUAL}cards?\\b`,
      "i"
    ),
  ],
  protection: [
    /hexproof/i,
    /indestructible/i,
    /protection from/i,
    // "Counter target spell" seul ne matchait pas "counter target
    // NONCREATURE spell" (Negate) ni "counter target CREATURE spell"
    // (Essence Scatter) — un contresort restreint à un type de sort est
    // pourtant un cas extrêmement courant.
    new RegExp(`counter target ${QUAL}spell`, "i"),
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
  // "Disruption" (9e pilier, ajouté le 26/08/2026) : verrous/taxes,
  // sacrifices forcés et défausse forcée — ce qui prive les adversaires de
  // ressources ou d'options sans nécessairement détruire un permanent.
  // Formulations vérifiées sur de vraies cartes avant d'écrire les motifs
  // (voir README) : Mana Maze / Rule of Law ("can't cast ... spell(s)"),
  // Thalia ("cost {1} more to cast"), Static Orb ("can't untap ... during
  // their untap steps"), Diabolic Edict ("target player sacrifices a
  // creature"), Mind Rot ("target player discards two cards").
  disruption: [
    new RegExp(`can't cast ${QUAL4}spells?\\b`, "i"),
    /costs? \{?\d+\}? more to (cast|activate)/i,
    /can't untap [^.]{0,60}untap steps?/i,
    /(target player|each opponent|that player) sacrifices? a(n)? (creature|permanent|artifact|enchantment|planeswalker)/i,
    /(target player|each opponent|that player) discards? (a|an|one|two|three|four|five|x|\d+) cards?/i,
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
  disruption: "Disruption",
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

/**
 * Compteurs à zéro pour les 9 piliers. Exporté pour que l'UI (tableau de
 * bord du deck builder) ait un repli typé quand les stats ne sont pas
 * encore disponibles, sans dupliquer la liste des catégories.
 */
export const EMPTY_CATEGORY_COUNTS: Record<DeckCategory, number> = {
  ramp: 0,
  removal: 0,
  wipe: 0,
  draw: 0,
  tutor: 0,
  protection: 0,
  landfix: 0,
  finisher: 0,
  disruption: 0,
};

/**
 * Répartition du nombre de cartes (hors terrains) par coût de mana
 * converti, arrondi à l'entier le plus proche (les coûts fractionnaires
 * n'existent pas côté cartes jouables normales) et plafonné à 7 ("7 et
 * plus") — convention d'affichage standard d'une courbe de mana MTG.
 * Exporté pour être réutilisé tel quel par ManaCurveChart.tsx (une seule
 * source de vérité pour la courbe, calculée ici avec le reste des stats).
 */
export function computeManaCurve(cards: EnrichedCard[]): ManaCurveBucket[] {
  const counts = new Map<number, number>();
  for (let cmc = 0; cmc <= 7; cmc++) counts.set(cmc, 0);

  for (const entry of cards) {
    if (!entry.card) continue;
    const { card } = entry;
    if (card.type_line?.includes("Land")) continue;
    const cmc = Math.min(Math.max(Math.round(card.cmc ?? 0), 0), 7);
    counts.set(cmc, (counts.get(cmc) ?? 0) + entry.count);
  }

  return Array.from(counts.entries()).map(([cmc, count]) => ({
    cmc,
    label: cmc === 7 ? "7+" : String(cmc),
    count,
  }));
}

/**
 * Convertit un écart à une cible en ratio de santé 0-1 (même échelle que
 * les ratios de piliers) via une bande de tolérance (`tolerance` : écart
 * jusqu'auquel c'est considéré optimal) puis une dégradation linéaire
 * jusqu'à 0 sur `falloff` d'écart supplémentaire. Utilisé pour la courbe
 * de mana et le nombre de terrains (voir computeDeckStats ci-dessous) :
 * factorisé ici plutôt que dupliqué, la logique est identique, seules
 * les unités (CMC vs ratio de terrains) et les constantes changent.
 */
function healthRatio(actual: number, ideal: number, tolerance: number, falloff: number): number {
  const diff = Math.abs(actual - ideal);
  if (diff <= tolerance) return 1;
  return Math.max(0, 1 - (diff - tolerance) / falloff);
}

function statusFor(ratio: number): HealthSignal["status"] {
  if (ratio >= 0.8) return "good";
  if (ratio >= 0.4) return "watch";
  return "off";
}

/**
 * Santé de la courbe de mana : compare `avgCmc` (hors terrains) à la
 * cible du format (`config.idealAvgCmc`). Bande de tolérance ±0.4 (une
 * courbe "normale" varie facilement de ça d'un deck à l'autre sans que
 * ce soit un problème), dégradation jusqu'à 0 à ±1.8 d'écart. Retourne
 * `ratio: 1` si le deck n'a aucune carte hors terrain (rien à évaluer,
 * pas la peine de signaler un problème sur un deck vide/en construction).
 */
function curveHealthFor(avgCmc: number, nonLandCount: number, config: CategoryConfig): HealthSignal {
  if (nonLandCount === 0) {
    return { ratio: 1, status: "good", message: "Pas encore de carte hors terrain à évaluer." };
  }
  const ratio = healthRatio(avgCmc, config.idealAvgCmc, 0.4, 1.4);
  const status = statusFor(ratio);
  const message =
    status === "good"
      ? `Courbe de mana cohérente avec le repère habituel de ce format (coût moyen ~${config.idealAvgCmc}).`
      : `Coût moyen actuel : ${Math.round(avgCmc * 100) / 100} — repère habituel de ce format : ~${config.idealAvgCmc}. Écart notable mais pas forcément un problème selon la stratégie du deck (voir archétype détecté).`;
  return { ratio, status, message };
}

/**
 * Santé du nombre de terrains : compare la part réelle de terrains dans
 * le deck (landCount / total, hors commandant) à la cible du format
 * (`config.idealLandRatio`), en ratio plutôt qu'en nombre absolu pour
 * s'appliquer à des tailles de deck différentes. Tolérance ±3% (~3
 * cartes sur un deck de 99), dégradation jusqu'à 0 à ±13% d'écart.
 */
function landHealthFor(
  landCount: number,
  nonLandCount: number,
  config: CategoryConfig
): HealthSignal {
  const total = landCount + nonLandCount;
  if (total === 0) {
    return { ratio: 1, status: "good", message: "Pas encore de carte à évaluer." };
  }
  const actualRatio = landCount / total;
  const ratio = healthRatio(actualRatio, config.idealLandRatio, 0.03, 0.1);
  const status = statusFor(ratio);
  const idealCount = Math.round(config.idealLandRatio * total);
  const message =
    status === "good"
      ? `Nombre de terrains cohérent avec le repère habituel de ce format (${landCount} terrains, cible ~${idealCount}).`
      : `${landCount} terrains sur ${total} cartes — repère habituel de ce format : ~${idealCount} (${Math.round(config.idealLandRatio * 100)}%).`;
  return { ratio, status, message };
}

export function computeDeckStats(cards: EnrichedCard[], config: CategoryConfig): DeckStats {
  const categoryCounts: Record<DeckCategory, number> = { ...EMPTY_CATEGORY_COUNTS };

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
  const curveHealth = curveHealthFor(avgCmc, nonLandCount, config);
  const landHealth = landHealthFor(landCount, nonLandCount, config);

  let score = 0;
  for (const cat of Object.keys(config.targets) as DeckCategory[]) {
    const ratio = Math.min(categoryCounts[cat] / config.targets[cat], 1);
    score += ratio * config.weights[cat];
  }
  score += curveHealth.ratio * config.curveWeight;
  score += landHealth.ratio * config.landWeight;

  return {
    totalNonLandCards: nonLandCount,
    landCount,
    avgCmc: Math.round(avgCmc * 100) / 100,
    categoryCounts,
    manaCurve: computeManaCurve(cards),
    curveHealth,
    landHealth,
    score: Math.round(score * 10) / 10,
  };
}

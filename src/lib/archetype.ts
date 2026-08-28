import type { Archetype, ArchetypeSignal, EnrichedCard, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";

/**
 * Détection de l'archétype/stratégie d'un deck — correctif du 28/08/2026
 * (remonté par Ben : "deux decks très différents avec le même commandant
 * reçoivent les mêmes suggestions génériques"). Les 9 piliers de
 * deck-score.ts mesurent des RÔLES de carte (ramp, removal, pioche...),
 * indépendants de la stratégie précise du deck ; ce module ajoute un
 * signal complémentaire — CE deck-ci cherche-t-il à faire du sacrifice,
 * du tribal, des compteurs +1/+1... — utilisé par recommend.ts pour (a)
 * proposer des cartes en synergie thématique en plus des piliers
 * génériques, et (b) protéger les cartes "sur le thème" d'être proposées
 * au retrait juste parce qu'elles ne remplissent aucun pilier.
 *
 * ⚠️ Comme pour classifyCard (deck-score.ts), c'est une heuristique par
 * motifs de texte/type, pas une vérité absolue : périmètre volontairement
 * limité à des archétypes au signal textuel/structurel fort et au
 * templating Magic bien standardisé (sacrifice, compteurs +1/+1, sorts,
 * artefacts, gain de vie, tribal) — pas de tentative de couvrir "tous les
 * archétypes possibles" : stax, group hug, politique... ont des signaux
 * bien plus diffus (pas de formulation textuelle récurrente fiable), les
 * inclure aurait surtout produit des faux positifs. Voir README.
 */

/** En dessous de ce nombre de cartes hors terrain, le deck est trop peu rempli pour un signal fiable (en cours de montage). */
const MIN_CARDS_FOR_SIGNAL = 6;

/** Part du deck (hors terrains) à partir de laquelle un signal textuel seul (sans confirmation du commandant) est retenu. */
const TEXT_SHARE_THRESHOLD = 0.12;
/** Part à partir de laquelle la confiance passe à "high" même sans confirmation du commandant. */
const TEXT_SHARE_HIGH_THRESHOLD = 0.22;
/** Part de cartes d'un type donné (instant/sorcery, artifact) à partir de laquelle c'est un signal structurel en soi. */
const STRUCTURAL_SHARE_THRESHOLD = 0.32;
const STRUCTURAL_SHARE_HIGH_THRESHOLD = 0.45;

interface ArchetypeDef {
  archetype: Archetype;
  label: string;
  /** Motifs de texte oracle qui comptent comme un signal fort pour cet archétype (voir le README pour la justification de chacun). */
  patterns: RegExp[];
  /** Types (type_line) qui comptent en plus comme un signal structurel (ex: Instant/Sorcery pour "spellslinging"). */
  structuralTypes?: string[];
}

const ARCHETYPE_DEFS: ArchetypeDef[] = [
  {
    archetype: "sacrifice",
    label: "Sacrifice / Aristocrates",
    patterns: [
      /sacrifice(s)? (a|an|another) creature/i,
      /you may sacrifice a creature/i,
      /whenever (a|one or more) creature(s)? you control dies?/i,
      /whenever (a|another) creature dies/i,
    ],
  },
  {
    archetype: "counters",
    label: "Compteurs +1/+1",
    patterns: [
      /whenever (you|a creature you control) (put|puts|enters) [^.]{0,30}\+1\/\+1 counter/i,
      /double the number of \+1\/\+1 counters/i,
      /proliferate/i,
      /distribute [^.]{0,20}\+1\/\+1 counters/i,
    ],
  },
  {
    archetype: "spellslinging",
    label: "Sorts (instants/rituels)",
    patterns: [
      /whenever you cast (an? )?instant or sorcery spell/i,
      /whenever you cast (a|an) noncreature spell/i,
      /magecraft/i,
    ],
    structuralTypes: ["Instant", "Sorcery"],
  },
  {
    archetype: "artifacts",
    label: "Artefacts",
    patterns: [
      /whenever (an|another) artifact (enters|you control enters)/i,
      /number of artifacts you control/i,
      /artifacts you control get/i,
    ],
    structuralTypes: ["Artifact"],
  },
  {
    archetype: "lifegain",
    label: "Gain de vie",
    patterns: [/whenever you gain life/i, /gain life equal to/i],
  },
];

/** Types de créatures très génériques/incidents (Human, Soldier...) : présents dans énormément de decks sans que ce soit forcément le thème voulu — seuil de détection plus haut pour ceux-là. */
const GENERIC_CREATURE_TYPES = new Set([
  "human",
  "soldier",
  "warrior",
  "wizard",
  "cleric",
  "knight",
  "shaman",
  "scout",
  "citizen",
  "advisor",
  "noble",
  "peasant",
  "spirit",
]);

function parseCreatureTypes(typeLine: string | undefined): string[] {
  if (!typeLine?.includes("Creature")) return [];
  const afterDash = typeLine.split("—")[1];
  if (!afterDash) return [];
  return afterDash
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function detectTextArchetypes(
  nonLandCards: EnrichedCard[],
  commanderText: string
): ArchetypeSignal[] {
  const totalCount = nonLandCards.reduce((s, c) => s + c.count, 0);
  if (totalCount < MIN_CARDS_FOR_SIGNAL) return [];

  const signals: ArchetypeSignal[] = [];

  for (const def of ARCHETYPE_DEFS) {
    let matchedCount = 0;
    let structuralCount = 0;

    for (const entry of nonLandCards) {
      if (!entry.card) continue;
      const text = getDisplayOracleText(entry.card).toLowerCase();
      if (def.patterns.some((p) => p.test(text))) matchedCount += entry.count;
      if (def.structuralTypes?.some((t) => entry.card!.type_line?.includes(t))) {
        structuralCount += entry.count;
      }
    }

    const commanderMatches = def.patterns.some((p) => p.test(commanderText));
    const textShare = matchedCount / totalCount;
    const structuralShare = structuralCount / totalCount;

    const structuralSignal = def.structuralTypes
      ? structuralShare >= STRUCTURAL_SHARE_THRESHOLD
      : false;

    if (!commanderMatches && textShare < TEXT_SHARE_THRESHOLD && !structuralSignal) continue;

    const confidence: ArchetypeSignal["confidence"] =
      commanderMatches ||
      textShare >= TEXT_SHARE_HIGH_THRESHOLD ||
      structuralShare >= STRUCTURAL_SHARE_HIGH_THRESHOLD
        ? "high"
        : "medium";

    signals.push({
      archetype: def.archetype,
      label: def.label,
      confidence,
      matchedCount,
      matchedShare: Math.max(textShare, structuralShare),
    });
  }

  return signals;
}

function detectTribal(nonLandCards: EnrichedCard[], commanderTypes: string[]): ArchetypeSignal | null {
  const creatureCounts = new Map<string, number>();
  let totalCreatures = 0;

  for (const entry of nonLandCards) {
    if (!entry.card?.type_line?.includes("Creature")) continue;
    totalCreatures += entry.count;
    for (const t of parseCreatureTypes(entry.card.type_line)) {
      creatureCounts.set(t, (creatureCounts.get(t) ?? 0) + entry.count);
    }
  }
  if (totalCreatures < 5) return null;

  let best: [string, number] | null = null;
  for (const [type, count] of creatureCounts) {
    if (!best || count > best[1]) best = [type, count];
  }
  if (!best) return null;
  const [type, count] = best;
  const share = count / totalCreatures;

  const commanderConfirms = commanderTypes.some((t) => t.toLowerCase() === type.toLowerCase());
  const isGeneric = GENERIC_CREATURE_TYPES.has(type.toLowerCase());
  const threshold = isGeneric ? 0.35 : 0.22;
  if (!commanderConfirms && share < threshold) return null;

  const confidence: ArchetypeSignal["confidence"] = commanderConfirms || share >= 0.4 ? "high" : "medium";

  return {
    archetype: "tribal",
    label: `Tribal — ${type}`,
    confidence,
    matchedCount: count,
    matchedShare: share,
  };
}

/**
 * Est-ce que CETTE carte précise correspond à un signal d'archétype déjà
 * détecté pour le deck ? Réutilise les mêmes motifs que la détection
 * agrégée ci-dessus (une seule définition des motifs, pas de risque de
 * divergence) — utilisé par recommend.ts pour (a) confirmer qu'une carte
 * trouvée par une requête Scryfall thématique correspond vraiment au
 * signal avant de la proposer, et (b) protéger les cartes du deck déjà
 * sur le thème d'être proposées au retrait (voir buildRemovalCandidates).
 */
export function cardMatchesArchetype(card: ScryfallCard, signal: ArchetypeSignal): boolean {
  if (signal.archetype === "tribal") {
    const type = signal.label.replace(/^Tribal — /, "").toLowerCase();
    return parseCreatureTypes(card.type_line).some((t) => t.toLowerCase() === type);
  }
  const def = ARCHETYPE_DEFS.find((d) => d.archetype === signal.archetype);
  if (!def) return false;
  const text = getDisplayOracleText(card).toLowerCase();
  if (def.patterns.some((p) => p.test(text))) return true;
  if (def.structuralTypes?.some((t) => card.type_line?.includes(t))) return true;
  return false;
}

/**
 * Détecte les archétypes du deck à partir de sa composition actuelle
 * (hors terrains, hors commandant) et du/des commandant(s) — un signal
 * du commandant compte plus fort qu'un simple signal de composition
 * (voir `commanderMatches`/`commanderConfirms` ci-dessus) : c'est lui qui
 * définit l'identité du deck. Retourne un tableau (0 à N signaux) : un
 * deck peut légitimement combiner plusieurs archétypes (ex: "Sacrifice"
 * + "Compteurs +1/+1"), et un deck encore trop peu rempli ou sans signal
 * clair n'en retourne aucun — un tableau vide n'est pas une erreur.
 */
export function detectArchetypes(nonLandCards: EnrichedCard[], commanders: ScryfallCard[]): ArchetypeSignal[] {
  const commanderText = commanders.map((c) => getDisplayOracleText(c)).join(" \n ").toLowerCase();
  const commanderTypes = commanders.flatMap((c) => parseCreatureTypes(c.type_line));

  const tribal = detectTribal(nonLandCards, commanderTypes);
  const signals = [...detectTextArchetypes(nonLandCards, commanderText), ...(tribal ? [tribal] : [])];

  // Confiance "high" d'abord (l'archétype le plus sûr en premier), puis
  // par part du deck concernée décroissante — ordre d'affichage plus
  // utile qu'un ordre arbitraire de détection.
  return signals.sort(
    (a, b) => Number(b.confidence === "high") - Number(a.confidence === "high") || b.matchedShare - a.matchedShare
  );
}

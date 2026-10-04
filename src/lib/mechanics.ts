import type { ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";

/**
 * Graphe de synergies par MÉCANIQUE (03/10/2026, demande de Ben : « dénicher
 * des synergies et game plans pouvant surprendre mais extrêmement efficaces,
 * en te basant sur une analyse des decks connus »).
 *
 * synergy.ts compare chaque carte au COMMANDANT (16-20 thèmes, un seul
 * rôle par carte). Ici, on décrit ce que chaque carte PRODUIT et ce qu'elle
 * RÉCOMPENSE, axe par axe :
 * - « produit » un axe : elle fait arriver l'événement (crée des jetons,
 *   remplit le cimetière, fait gagner de la vie, est un artefact...) ;
 * - « récompense » un axe : elle paie quand l'événement arrive (« whenever
 *   you gain life », « for each artifact you control »...).
 * Deux cartes sont en synergie quand l'une produit ce que l'autre
 * récompense — quel que soit leur nom, donc aussi pour des cartes qu'aucun
 * deck connu ne joue. C'est ce qui permet d'EXTRAPOLER : les decks de
 * tournoi nous apprennent quels axes se construisent et avec quelle densité
 * (src/data/deck-trends.json, généré par scripts/learn-deck-trends.mts), le
 * graphe applique ces densités à n'importe quelle collection.
 *
 * ⚠️ Même nature que deck-score.ts : motifs sur le texte oracle. Une
 * synergie fine (interaction de règles précise) échappe au graphe ; un mot
 * peut matcher sans que la carte récompense vraiment l'axe. Les motifs ont
 * été relus sur un échantillon des 4 077 cartes de
 * analysis/duelcommander/cards-scryfall.json, pas carte par carte.
 */

export interface AxisDef {
  id: string;
  /** Libellé affiché à Ben. */
  label: string;
  /** Ce que l'axe fait arriver, en clair (pour expliquer une synergie). */
  event: string;
  produces: RegExp[];
  /** Types de carte qui produisent l'axe par nature (un artefact « produit » des artefacts). */
  producesTypes?: string[];
  rewards: RegExp[];
  /** Gabarits de carte (card.layout) qui produisent l'axe : une aventure se lance depuis l'exil. */
  producesLayouts?: string[];
  /** Mots-clés Scryfall (card.keywords) qui valent production / récompense. */
  producesKeywords?: string[];
  rewardsKeywords?: string[];
  /** Axes que les producteurs de cet axe alimentent aussi (les jetons sont du matériel à sacrifier). */
  feeds?: string[];
}

export const AXES: readonly AxisDef[] = [
  {
    id: "tokens",
    label: "Jetons / largeur",
    event: "des créatures-jetons arrivent",
    produces: [/create (a|an|one|two|three|four|five|x|that many|a number of) [^.]*creature tokens?/i, /\bpopulate\b/i, /tokens? that('s| are) (a )?cop(y|ies)/i, /\bamass\b/i],
    rewards: [
      /whenever (you create|one or more [^.]*tokens? (you control )?enter)/i,
      /for each (creature )?token/i,
      /tokens? you control (get|have|gain)/i,
      /creatures you control (get \+|have|gain)/i,
      /for each creature you control/i,
      /number of creatures you control/i,
      /(double|twice) (the number of|that many) [^.]*tokens/i,
    ],
    rewardsKeywords: ["convoke"],
    feeds: ["sacrifice", "arrivals", "combat"],
  },
  {
    id: "sacrifice",
    label: "Sacrifice / morts",
    event: "une créature est sacrifiée ou meurt",
    produces: [/sacrifice (a|an|another|x|two|three|any number of) [^.:]*(creature|permanent|artifact|token)s?[^.:]*:/i, /as an additional cost to cast this spell, sacrifice/i, /you may sacrifice (a|another) (creature|permanent)/i, /\bexploit\b/i, /\bcasualty\b/i],
    rewards: [
      /whenever you sacrifice/i,
      /whenever (a|another|one or more)( nontoken)? creatures?( you control)? (dies|die)/i,
      /whenever [^.]*is put into (a|your) graveyard from the battlefield/i,
      /creature died this turn/i,
      /\bmorbid\b/i,
    ],
    feeds: ["graveyard"],
  },
  {
    id: "blink",
    label: "Clignotement / effets d'arrivée",
    event: "une créature à effet d'arrivée revient en jeu",
    produces: [
      /exile [^.]*(creature|permanent)[^.]*, then return (it|that card|them|those cards) to the battlefield/i,
      /return (another )?target creature you control to its owner's hand/i,
      /return [^.]*creature cards? from your graveyard to the battlefield/i,
    ],
    // Récompense = créature dont l'effet se déclenche à l'arrivée : la rejouer le redéclenche.
    rewards: [/[Ww]hen (this creature|this permanent|[A-Z][^.,]{0,40}) enters( the battlefield)?,/],
    feeds: ["arrivals"],
  },
  {
    id: "arrivals",
    label: "Créatures qui arrivent",
    event: "une créature arrive en jeu sous ton contrôle",
    produces: [],
    rewards: [/whenever (a|another|one or more) (nontoken |other )?(creatures?|permanents?) (you control )?enters?/i],
  },
  {
    id: "spells",
    label: "Éphémères et rituels",
    event: "tu lances un éphémère ou un rituel",
    produces: [/\bflashback\b/i, /\brebound\b/i, /copy (target|that) (instant|sorcery|spell)/i],
    producesTypes: ["Instant", "Sorcery"],
    rewards: [
      /whenever you cast (an? |your (first|second) )?(instant|sorcery|noncreature)/i,
      /instant (and|or) sorcery (spells?|cards?)/i,
      /\bmagecraft\b/i,
      /for each (instant|sorcery)/i,
      /noncreature spells? you cast/i,
    ],
    rewardsKeywords: ["prowess", "storm"],
  },
  {
    id: "artifacts",
    label: "Artefacts",
    event: "un artefact arrive ou est en jeu",
    produces: [/create [^.]*(artifact|treasure|clue|food|blood|powerstone|map|gold|heartwood|thopter|servo|construct|lotus) tokens?/i],
    producesTypes: ["Artifact"],
    rewards: [
      /artifacts? you control/i,
      /whenever (an|another|one or more) (nontoken )?artifacts? (you control )?(enters?|is put)/i,
      /for each artifact/i,
      /artifact spells?/i,
      /\bmetalcraft\b/i,
      /sacrifice an artifact/i,
    ],
    rewardsKeywords: ["affinity", "improvise"],
  },
  {
    id: "enchantments",
    label: "Enchantements",
    event: "un enchantement arrive ou est en jeu",
    produces: [],
    producesTypes: ["Enchantment"],
    rewards: [
      /enchantments? you control/i,
      /whenever (an|another|one or more) enchantments? (you control )?enters?/i,
      /for each enchantment/i,
      /enchantment spells?/i,
      /\bconstellation\b/i,
      /\beerie\b/i,
    ],
  },
  {
    id: "graveyard",
    label: "Cimetière",
    event: "des cartes arrivent dans ton cimetière",
    produces: [/\bmills?\b/i, /\bsurveil\b/i, /discard (a|two|three|your hand|x) cards?/i, /put [^.]*cards? [^.]*into your graveyard/i, /\bdredge\b/i, /draw [^.]*, then discard/i],
    rewards: [
      /from your graveyard (to|onto) (the battlefield|your hand)/i,
      /cast [^.]*from your graveyard/i,
      /cards? in your graveyard/i,
      /\b(flashback|escape|unearth|disturb|delve|threshold|delirium|encore|embalm|eternalize)\b/i,
      /for each (creature |instant |sorcery )?card in your graveyard/i,
    ],
  },
  {
    id: "lands",
    label: "Terrains",
    event: "un terrain arrive en jeu",
    produces: [
      /play (an|two|three) additional lands?/i,
      /search your library for [^.]*land[^.]*put (it|them|that card|those cards|one) onto the battlefield/i,
      /put [^.]*land cards? [^.]*onto the battlefield/i,
      /return [^.]*land cards? from your graveyard/i,
      /play lands from your graveyard/i,
    ],
    rewards: [/\blandfall\b/i, /whenever a land (you control )?enters/i, /for each land you control/i, /\bdomain\b/i, /number of lands you control/i],
  },
  {
    id: "lifegain",
    label: "Gain de vie",
    event: "tu gagnes des points de vie",
    produces: [/you gain (\d+|x) life/i, /gains? life equal/i, /you gain that much life/i],
    producesKeywords: ["lifelink"],
    rewards: [/whenever you gain life/i, /if you('ve| have)? gained (\d+ or more )?life/i, /life you gained/i, /your life total is/i],
  },
  {
    id: "drain",
    label: "Blessures directes",
    event: "un adversaire perd des points de vie hors combat",
    produces: [
      /each opponent loses (\d+|x) life/i,
      /deals? (\d+|x) damage to (each opponent|target opponent|target player|any target)/i,
      /target (player|opponent) loses (\d+|x) life/i,
    ],
    rewards: [/whenever an opponent (loses life|is dealt (noncombat )?damage)/i, /noncombat damage/i, /opponents? (was|were) dealt [^.]*damage/i, /lost life this turn/i],
  },
  {
    id: "counters",
    label: "Marqueurs +1/+1",
    event: "des marqueurs +1/+1 sont posés",
    produces: [/put (a|an|x|one|two|three|four|that many) [^.]*\+1\/\+1 counters?/i, /enters with [^.]*\+1\/\+1 counters?/i, /\bproliferate\b/i],
    rewards: [
      /with (a|one or more) \+1\/\+1 counters? on (it|them)/i,
      /whenever (one or more )?[^.]*counters? (is|are) put/i,
      /for each \+1\/\+1 counter/i,
      /number of \+1\/\+1 counters/i,
      /remove (a|x|one|two) \+1\/\+1 counters?/i,
      /that many plus one/i,
      /twice that many [^.]*counters/i,
    ],
  },
  {
    id: "draw",
    label: "Pioche",
    event: "tu pioches des cartes",
    produces: [/draw (two|three|four|x|\d+) cards/i, /each player draws/i, /whenever [^.]*, draw a card/i, /at the beginning of [^.]*, draw (a|an additional) card/i],
    rewards: [/whenever you draw/i, /draw your second card/i, /for each card in your hand/i, /no maximum hand size/i, /cards? you've drawn this turn/i],
  },
  {
    id: "discard",
    label: "Défausse",
    event: "une carte est défaussée",
    produces: [/discard (a|two|three|x|your hand)/i, /each (player|opponent) discards/i, /target (player|opponent) discards/i],
    rewards: [/whenever (you|a player|an opponent|one or more players?) discards?/i, /when you discard this card/i, /\bmadness\b/i, /discarded this turn/i, /\bhellbent\b/i],
    feeds: ["graveyard"],
  },
  {
    id: "combat",
    label: "Attaque",
    event: "tes créatures attaquent ou touchent un joueur",
    produces: [/(additional|extra) combat/i, /creatures you control (have|gain) (haste|flying|menace|trample)/i, /can't be blocked/i],
    producesKeywords: ["haste", "flying", "menace", "double strike"],
    rewards: [/whenever [^.]{0,60} attacks?\b/i, /deals combat damage to a (player|opponent)/i, /\b(raid|battalion)\b/i, /attacking creatures? you control/i, /whenever you attack/i],
  },
  {
    id: "voltron",
    label: "Équipements et auras",
    event: "une créature est équipée ou enchantée",
    produces: [],
    producesTypes: ["Equipment", "Aura"],
    // Pas « equipped creature » seul : tout équipement le dit de lui-même.
    rewards: [/(aura|equipment)s? (you control|spells?|cards?)/i, /becomes? (equipped|attached)/i, /for each (aura|equipment)/i, /whenever you cast an (aura|equipment)/i, /(equipped|enchanted) creatures? you control/i, /is (equipped|enchanted)/i],
  },
  {
    id: "planeswalkers",
    label: "Planeswalkers",
    event: "un planeswalker est en jeu ou gagne de la loyauté",
    produces: [/empower jace/i, /\bproliferate\b/i],
    producesTypes: ["Planeswalker"],
    rewards: [/planeswalkers? you control/i, /loyalty (abilit|counters?)/i, /planeswalker spells?/i, /\bjaces? you control/i],
  },
  {
    id: "scry",
    label: "Regard / surveillance",
    event: "tu regardes ou surveilles le dessus de ta bibliothèque",
    produces: [/\b(scry|surveil) (\d+|x)\b/i, /empower jace/i],
    rewards: [/whenever you (scry|surveil)/i, /scried or surveilled/i, /reveal the top card of your library/i, /play (lands and cast spells|cards) from the top of your library/i],
  },
  {
    id: "untap",
    label: "Dégagement",
    event: "un permanent se dégage",
    produces: [/untap (another )?(target|all|up to (one|two)) [^.]*(creature|permanent|artifact|land)s?/i, /untap (it|that creature|them)\b/i],
    rewards: [/whenever [^.]{0,40} becomes? (tapped|untapped)/i, /\binspired\b/i, /\{t\}: add \{[wubrgc]\}\{[wubrgc]\}/i, /\{t\}: add (x|an amount of)/i],
  },
  {
    id: "exilecast",
    label: "Sorts lancés hors de la main",
    event: "tu joues une carte depuis l'exil, le cimetière ou le dessus de la bibliothèque",
    // 04/10/2026 : élargi aux mots-clés qui font lancer une carte d'ailleurs
    // que la main (rappel éclair, aventure, harmonisation...). Spider-Man
    // 2099 récompense « un sort lancé d'ailleurs que de ta main » : ses decks
    // de tournoi jouent tous Reckless Charge, Wild Ride, Detective's Phoenix.
    produces: [
      /exile the top [^.]*cards? of your library[^.]*(you may|may) (play|cast)/i,
      /\b(cascade|discover|foretell|suspend|plot|flashback|harmonize|escape|jump-start|retrace|rebound|madness|disturb|aftermath)\b/i,
      /you may (play|cast) (it|that card|them|those cards) (this turn|until)/i,
      /you may (cast|play) [^.]*from your graveyard/i,
      /play lands? (and cast spells )?from (your graveyard|the top of your library)/i,
    ],
    producesKeywords: ["flashback", "harmonize", "escape", "jump-start", "retrace", "rebound", "madness", "disturb", "aftermath", "foretell", "plot", "suspend", "cascade", "discover"],
    producesLayouts: ["adventure"],
    rewards: [
      /whenever you (cast|play) [^.]*from (exile|anywhere other than your hand)/i,
      /spells? you cast from (exile|your graveyard|anywhere)/i,
      /(cast a spell|played a land or cast a spell)[^.]*from anywhere other than your hand/i,
    ],
  },
  {
    id: "treasure",
    label: "Trésors et jetons de mana",
    event: "tu crées ou sacrifies un jeton de mana",
    produces: [/create [^.]*(treasure|gold|powerstone|heartwood|lotus) tokens?/i],
    rewards: [/treasures? you control/i, /whenever you sacrifice an? (artifact|treasure|token)/i, /whenever [^.]*treasure/i, /mana from a treasure/i],
    feeds: ["artifacts", "bigmana"],
  },
  {
    id: "bigmana",
    label: "Gros mana / sorts à X",
    event: "tu as beaucoup de mana disponible",
    produces: [/add (an additional|one additional|twice|three|x|\{[wubrgc]\}\{[wubrgc]\}\{[wubrgc]\})/i, /whenever you tap a[^.]* for mana, add/i, /untap all lands/i],
    // Le coût à X se lit dans mana_cost (voir cardMechanics), pas dans le texte.
    rewards: [/spells? (you cast )?with mana value (5|6|7) or greater/i],
    rewardsKeywords: ["kicker", "multikicker"],
  },
  {
    id: "legends",
    label: "Légendes / historique",
    event: "un permanent légendaire arrive",
    produces: [],
    producesTypes: ["Legendary"],
    rewards: [/legendary (creatures?|spells?|permanents?|cards?) you control/i, /whenever you cast a (legendary|historic)/i, /\bhistoric\b/i, /for each legendary/i, /another legendary/i],
  },
  {
    id: "flash",
    label: "Jeu au tour adverse",
    event: "tu joues pendant le tour de l'adversaire",
    produces: [],
    producesTypes: ["Instant"],
    producesKeywords: ["flash"],
    rewards: [/during (an|each) opponent's turn/i, /whenever you cast a spell during an opponent's turn/i, /as though (it|they) had flash/i, /if it's not your turn/i],
  },
  {
    id: "poison",
    label: "Poison",
    event: "un adversaire reçoit un marqueur poison",
    produces: [/poison counters?/i],
    producesKeywords: ["infect", "toxic"],
    rewards: [/\bproliferate\b/i, /\bcorrupted\b/i, /for each poison counter/i],
  },
  {
    id: "prepare",
    label: "Préparation",
    event: "une créature est préparée",
    produces: [/becomes? prepared/i, /enters prepared/i],
    rewards: [/prepared spell/i, /whenever [^.]*becomes? prepared/i],
  },
];

const AXIS_INDEX = new Map(AXES.map((a, i) => [a.id, i] as const));

export function axisIndex(id: string): number {
  return AXIS_INDEX.get(id) ?? -1;
}

/** Ce qu'une carte produit et récompense : indices dans AXES. */
export interface CardMechanics {
  produces: number[];
  rewards: number[];
}

/**
 * Texte d'une carte SANS son texte de rappel entre parenthèses : le rappel
 * d'un mot-clé (« ward », « flashback »...) contient des mots qui feraient
 * matcher des axes sans rapport. Exception voulue : deck-score.ts garde le
 * rappel (un Trésor compte comme rampe par son rappel).
 */
function rulesText(card: ScryfallCard): string {
  return getDisplayOracleText(card).replace(/\([^)]*\)/g, " ");
}

/** Carte qui absorbe beaucoup de mana : coût à X, ou sort non-terrain à 6 manas et plus. */
function isManaSink(card: ScryfallCard): boolean {
  if ((card.type_line ?? "").split(" // ")[0].includes("Land")) return false;
  const cost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? "";
  return cost.includes("{X}") || (card.cmc ?? 0) >= 6;
}

export function cardMechanics(card: ScryfallCard): CardMechanics {
  const text = rulesText(card);
  const typeLine = card.type_line ?? "";
  const keywords = new Set((card.keywords ?? []).map((k) => k.toLowerCase()));
  const produces: number[] = [];
  const rewards: number[] = [];
  AXES.forEach((axis, i) => {
    const p =
      axis.produces.some((re) => re.test(text)) ||
      (axis.producesTypes?.some((t) => typeLine.includes(t)) ?? false) ||
      (axis.producesKeywords?.some((k) => keywords.has(k)) ?? false) ||
      (axis.producesLayouts?.includes(card.layout ?? "") ?? false);
    const r = axis.rewards.some((re) => re.test(text)) || (axis.rewardsKeywords?.some((k) => keywords.has(k)) ?? false);
    if (p) produces.push(i);
    if (r || (axis.id === "bigmana" && isManaSink(card))) rewards.push(i);
  });
  // Alimentation croisée : un producteur de jetons est aussi du matériel de sacrifice, etc.
  for (const i of [...produces]) {
    for (const fed of AXES[i].feeds ?? []) {
      const j = axisIndex(fed);
      if (j >= 0 && !produces.includes(j)) produces.push(j);
    }
  }
  // Un terrain ne « produit » pas l'axe terrains pour le graphe (tous les
  // decks en ont 35+) ; une créature légendaire ordinaire reste productrice
  // de l'axe légendes (c'est le but de l'axe).
  return { produces, rewards };
}

/**
 * Rôles fonctionnels d'une carte, pour décrire la FORME d'un deck (recettes
 * d'archétypes apprises dans deck-trends.json). Complète les 9 piliers de
 * deck-score.ts par ce qui distingue un deck agressif d'un deck de contrôle :
 * contresorts, interaction à bas coût, créatures par coût, menaces.
 */
export const ROLE_IDS = [
  "creature",
  "cheapCreature",
  "threat",
  "counterspell",
  "cheapInteraction",
  "removal",
  "wipe",
  "draw",
  "ramp",
  "tutor",
  "protection",
  "recursion",
  "cmc01",
  "cmc2",
  "cmc3",
  "cmc4",
  "cmc5plus",
] as const;
export type RoleId = (typeof ROLE_IDS)[number];

const COUNTERSPELL = /counter target [^.]*(spell|ability)/i;
const RECURSION = /return [^.]*cards? from your graveyard to (your hand|the battlefield)/i;

/** `categories` : résultat de classifyCard (passé par l'appelant pour ne pas le recalculer). */
export function cardRoles(card: ScryfallCard, categories: readonly string[]): RoleId[] {
  const typeLine = (card.type_line ?? "").split(" // ")[0];
  if (typeLine.includes("Land")) return [];
  const text = getDisplayOracleText(card);
  const roles: RoleId[] = [];
  const cmc = card.cmc ?? 0;
  const isCreature = typeLine.includes("Creature");
  const power = Number.parseInt(card.power ?? card.card_faces?.[0]?.power ?? "", 10);
  const counter = COUNTERSPELL.test(text);
  const interaction = categories.includes("removal") || categories.includes("disruption") || counter;
  if (isCreature) roles.push("creature");
  if (isCreature && cmc <= 2) roles.push("cheapCreature");
  if ((isCreature && Number.isFinite(power) && power >= 4) || categories.includes("finisher") || typeLine.includes("Planeswalker")) roles.push("threat");
  if (counter) roles.push("counterspell");
  if (interaction && cmc <= 2) roles.push("cheapInteraction");
  if (categories.includes("removal")) roles.push("removal");
  if (categories.includes("wipe")) roles.push("wipe");
  if (categories.includes("draw")) roles.push("draw");
  if (categories.includes("ramp")) roles.push("ramp");
  if (categories.includes("tutor")) roles.push("tutor");
  if (categories.includes("protection") && !counter) roles.push("protection");
  if (RECURSION.test(text)) roles.push("recursion");
  roles.push(cmc <= 1 ? "cmc01" : cmc <= 2 ? "cmc2" : cmc <= 3 ? "cmc3" : cmc <= 4 ? "cmc4" : "cmc5plus");
  return roles;
}

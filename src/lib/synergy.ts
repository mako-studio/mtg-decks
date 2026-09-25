import type { ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";

/**
 * Synergie carte ↔ commandant (25/09/2026, constructeur compétitif —
 * demande de Ben : « le système évalue les synergies entre les cartes et
 * peut être le plus créatif possible »).
 *
 * archetype.ts détecte déjà 6 archétypes à partir de la COMPOSITION d'un
 * deck existant (il faut ≥6 cartes sur le thème pour qu'un signal sorte).
 * Ici le problème est inverse : on part d'un commandant SEUL (le deck
 * n'existe pas encore) et on veut savoir, pour chaque carte possédée, si
 * elle nourrit ce que le commandant récompense. D'où un lexique plus
 * large de thèmes, chacun avec :
 * - `commander` : motifs qui, dans le texte du COMMANDANT, indiquent qu'il
 *   récompense ce thème (« whenever you cast an instant or sorcery »...) ;
 * - `card` : motifs/types qui, sur une CARTE, indiquent qu'elle alimente
 *   ce thème (un rituel alimente « sorts », un créateur de jetons alimente
 *   « jetons » et « sacrifice »...).
 * Plus la tribu : un commandant qui mentionne son propre type de créature
 * (« other Elves you control ») → les cartes de ce type sont en synergie.
 *
 * ⚠️ Heuristique par motifs de texte oracle, même nature que
 * deck-score.ts/archetype.ts : repère des synergies DE SURFACE (thème
 * partagé), pas une compréhension des interactions de règles. Une
 * synergie subtile (ex. un effet de copie avec un déclencheur d'arrivée
 * précis) peut être ratée ; un faux positif est possible sur un texte qui
 * mentionne un mot-clé sans vraiment le récompenser.
 *
 * Performance : tout est précalculé UNE fois par carte sous forme de
 * masque de bits (`cardThemeMask`) — la synergie d'une carte avec un
 * commandant est ensuite un simple ET binaire, indispensable parce que le
 * constructeur évalue des dizaines de commandants × des centaines de cartes.
 */

export interface ThemeDef {
  id: string;
  label: string;
  commander: RegExp[];
  card: RegExp[];
  cardTypes?: string[];
}

export const THEMES: readonly ThemeDef[] = [
  {
    id: "tokens",
    label: "Jetons",
    commander: [/tokens? you control/i, /whenever you create (a|one or more) .*tokens?/i, /for each (creature )?token/i, /create (a|an|two|three|x|that many) [^.]*tokens?/i],
    card: [/create (a|an|one|two|three|four|x|that many) [^.]*tokens?/i, /populate/i, /double the number of tokens|twice that many [^.]*tokens/i],
  },
  {
    id: "counters",
    label: "Compteurs +1/+1",
    commander: [/\+1\/\+1 counters?/i, /proliferate/i],
    card: [/\+1\/\+1 counters?/i, /proliferate/i],
  },
  {
    id: "sacrifice",
    label: "Sacrifice / mort",
    commander: [/whenever (a|another|one or more)( nontoken)? creatures?( you control)? (dies|die|is put into a graveyard)/i, /sacrifice (a|another) (creature|permanent)/i],
    card: [/sacrifice (a|another) (creature|permanent|artifact)/i, /whenever (a|another|one or more)( nontoken)? creatures?( you control)? (dies|die)/i, /when [^.]* dies/i],
  },
  {
    id: "spells",
    label: "Sorts (éphémères/rituels)",
    commander: [/whenever you cast (an? )?(instant|sorcery|noncreature)/i, /instant (and|or) sorcery spells? you cast/i, /magecraft/i, /copy (target|that) (instant|sorcery)/i],
    card: [/whenever you cast (an? )?(instant|sorcery|noncreature)/i, /copy (target|that) (instant|sorcery|spell)/i, /magecraft/i],
    cardTypes: ["Instant", "Sorcery"],
  },
  {
    id: "artifacts",
    label: "Artefacts",
    commander: [/artifacts? you control/i, /whenever (an|another|one or more) artifacts?/i, /artifact spells?/i],
    card: [/artifacts? you control/i, /whenever (an|another) artifact/i],
    cardTypes: ["Artifact"],
  },
  {
    id: "enchantments",
    label: "Enchantements",
    commander: [/enchantments? you control/i, /whenever (an|another) enchantment/i, /enchantment spells?/i, /constellation/i],
    card: [/enchantments? you control/i, /constellation/i],
    cardTypes: ["Enchantment"],
  },
  {
    id: "graveyard",
    label: "Cimetière / réanimation",
    commander: [/from your graveyard/i, /cards? in your graveyard/i, /\bmill\b/i, /whenever [^.]* put into your graveyard/i],
    card: [/return target creature card from (a|your) graveyard/i, /from your graveyard to the battlefield/i, /\bmills?\b/i, /\bflashback\b|\bescape\b|\bunearth\b|\bdredge\b/i, /put [^.]* into your graveyard/i],
  },
  {
    id: "lands",
    label: "Terrains / landfall",
    commander: [/landfall/i, /whenever a land (you control )?enters/i, /play an additional land/i, /lands? you control/i],
    card: [/landfall/i, /play an additional land|additional land/i, /search your library for (a|up to [a-z]+) (basic )?land/i, /return [^.]*land cards? from your graveyard/i],
  },
  {
    id: "lifegain",
    label: "Gain de vie",
    commander: [/whenever you gain life/i, /gain(ed)? life this turn/i],
    card: [/you gain \d+ life|gain life equal/i, /\blifelink\b/i, /whenever you gain life/i],
  },
  {
    id: "blink",
    label: "Arrivées / clignotement",
    commander: [/whenever (a|another) (nontoken )?(creature|permanent) (you control )?enters/i, /exile [^.]*, then return (it|them|that card)/i, /enters the battlefield under your control/i],
    card: [/exile (another )?target [^.]*(creature|permanent) you control, then return/i, /exile [^.]*return (it|that card|them) to the battlefield/i, /when [^.]* enters( the battlefield)?,/i],
  },
  {
    id: "combat",
    label: "Attaque / combat",
    commander: [/whenever [^.]* attacks/i, /deals combat damage to a player/i, /attacking creatures? you control/i],
    card: [/\bhaste\b/i, /double strike/i, /additional combat|extra combat/i, /can't be blocked/i, /whenever [^.]* attacks/i],
  },
  {
    id: "voltron",
    label: "Équipements / Auras",
    commander: [/equipped/i, /\baura\b|\bauras\b/i, /\bequipment\b/i, /enchanted creature/i],
    card: [/equipped creature/i, /enchanted creature gets/i],
    cardTypes: ["Equipment", "Aura"],
  },
  {
    id: "draw",
    label: "Pioche",
    commander: [/whenever you draw/i, /draw your (second|first) card/i],
    card: [/draw (two|three|x|\d+) cards/i, /each player draws/i, /whenever you draw/i],
  },
  {
    id: "discard",
    label: "Défausse",
    commander: [/whenever (you|a player) discards?/i, /discard (a|one|two) cards?/i],
    card: [/discard (a|your hand|one|two|x)/i, /\bmadness\b/i, /each player discards/i],
  },
  {
    id: "treasure",
    label: "Trésors / mana",
    commander: [/\btreasures?\b/i, /whenever you (sacrifice|tap) [^.]*for mana/i],
    card: [/\btreasures?\b/i],
  },
  {
    id: "poison",
    label: "Poison / infection",
    commander: [/poison counters?/i, /\binfect\b|\btoxic\b/i],
    card: [/poison counters?/i, /\binfect\b|\btoxic\b/i, /proliferate/i],
  },
];

/** Types de créatures trop génériques pour constituer un thème tribal à eux seuls (même idée que GENERIC_CREATURE_TYPES dans archetype.ts). */
const GENERIC_TRIBES = new Set(["human", "soldier", "warrior", "wizard", "cleric", "knight", "shaman", "scout", "citizen", "advisor", "noble", "peasant", "rogue"]);

function creatureTypes(typeLine: string | undefined): string[] {
  if (!typeLine) return [];
  const faces = typeLine.split(" // ");
  const out: string[] = [];
  for (const face of faces) {
    if (!face.includes("Creature") && !face.includes("Kindred") && !face.includes("Tribal")) continue;
    const after = face.split("—")[1];
    if (after) out.push(...after.trim().split(/\s+/).filter(Boolean).map((t) => t.toLowerCase()));
  }
  return out;
}

/** Masque de bits des thèmes qu'une CARTE alimente. */
export function cardThemeMask(card: ScryfallCard): number {
  const text = getDisplayOracleText(card);
  let mask = 0;
  THEMES.forEach((theme, i) => {
    if (theme.card.some((p) => p.test(text)) || theme.cardTypes?.some((t) => card.type_line?.includes(t))) {
      mask |= 1 << i;
    }
  });
  return mask;
}

export interface CommanderProfile {
  themeMask: number;
  themes: { id: string; label: string }[];
  /** Tribus récompensées (minuscules) — types du commandant mentionnés au pluriel dans son texte, ex. "elves". */
  tribes: string[];
}

function pluralForms(type: string): string[] {
  const t = type.toLowerCase();
  const forms = new Set([t, `${t}s`]);
  if (t.endsWith("f")) forms.add(`${t.slice(0, -1)}ves`);
  if (t === "elf") forms.add("elves");
  if (t === "dwarf") forms.add("dwarves");
  if (t.endsWith("y")) forms.add(`${t.slice(0, -1)}ies`);
  if (t.endsWith("s") || t.endsWith("x")) forms.add(`${t}es`);
  return Array.from(forms);
}

/** Profil de synergie d'un commandant : thèmes qu'il récompense + tribus. */
export function commanderProfile(commander: ScryfallCard): CommanderProfile {
  const text = getDisplayOracleText(commander);
  let themeMask = 0;
  const themes: { id: string; label: string }[] = [];
  THEMES.forEach((theme, i) => {
    if (theme.commander.some((p) => p.test(text))) {
      themeMask |= 1 << i;
      themes.push({ id: theme.id, label: theme.label });
    }
  });

  const lower = text.toLowerCase();
  const tribes = creatureTypes(commander.type_line).filter((t) => {
    if (GENERIC_TRIBES.has(t)) {
      // Tribu générique : seulement si le texte l'appelle explicitement ("other Humans you control").
      return pluralForms(t).some((f) => new RegExp(`\\b${f}\\b[^.]*you control`, "i").test(lower));
    }
    return pluralForms(t).some((f) => new RegExp(`\\b${f}\\b`, "i").test(lower));
  });
  // Limite connue : une tribu mentionnée qui n'est PAS celle du commandant
  // ("Goblins you control" sur un commandant Humain) n'est pas détectée —
  // extraire un type de créature arbitraire du texte donnait trop de faux
  // positifs ("creatures you control", "lands you control").

  return { themeMask, themes, tribes };
}

/** Précalcul par carte pour la synergie (voir la note de performance en tête de fichier). */
export interface CardSynergyFeatures {
  themeMask: number;
  creatureTypes: string[];
}

export function cardSynergyFeatures(card: ScryfallCard): CardSynergyFeatures {
  return { themeMask: cardThemeMask(card), creatureTypes: creatureTypes(card.type_line) };
}

function popcount(n: number): number {
  let c = 0;
  let x = n;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/**
 * Score de synergie d'une carte pour un commandant : 1 point par thème
 * partagé (plafonné à 2 — une carte qui touche 4 thèmes n'est pas 4 fois
 * meilleure), +1.5 si elle est de la tribu récompensée. Échelle 0-3.5,
 * volontairement comparable à UN pilier (voir priorityScore dans
 * competitive-builder.ts) : la synergie oriente le choix entre cartes de
 * puissance proche, elle ne doit pas faire passer une carte thématique
 * faible devant un Game Changer.
 */
export function synergyScore(features: CardSynergyFeatures, profile: CommanderProfile): number {
  let score = Math.min(2, popcount(features.themeMask & profile.themeMask));
  if (profile.tribes.length > 0 && features.creatureTypes.some((t) => profile.tribes.includes(t))) score += 1.5;
  return score;
}

/** Libellés des thèmes partagés (pour expliquer une recommandation dans l'UI). */
export function sharedThemeLabels(features: CardSynergyFeatures, profile: CommanderProfile): string[] {
  const out: string[] = [];
  THEMES.forEach((theme, i) => {
    if (features.themeMask & profile.themeMask & (1 << i)) out.push(theme.label);
  });
  if (profile.tribes.length > 0 && features.creatureTypes.some((t) => profile.tribes.includes(t))) {
    out.push(`Tribu (${profile.tribes.join(", ")})`);
  }
  return out;
}

/**
 * Requêtes Scryfall de point de départ pour élargir le pool recommandé aux
 * cartes en synergie avec le commandant (25/09/2026) — même esprit que
 * CATEGORY_QUERIES/ARCHETYPE_QUERIES de recommend.ts : pas des filtres
 * parfaits, chaque résultat repasse par le moteur de sélection (gain de
 * tier, piliers, synergie calculée) avant d'être proposé. Syntaxe Scryfall
 * standard (o:, t:, id<=) — non testée en direct depuis l'environnement de
 * dev (api.scryfall.com bloqué), mêmes opérateurs que ceux déjà utilisés
 * par recommend.ts.
 */
const THEME_QUERIES: Record<string, string> = {
  tokens: '(o:"create" o:"token")',
  counters: '(o:"+1/+1 counter" or o:proliferate)',
  sacrifice: '(o:"sacrifice a creature" or o:"whenever a creature you control dies" or o:"sacrifice another")',
  spells: '(o:"whenever you cast an instant or sorcery" or o:magecraft or o:"copy target instant")',
  artifacts: '(o:"artifacts you control" or o:"whenever an artifact")',
  enchantments: '(o:"enchantments you control" or o:constellation)',
  graveyard: '(o:"from your graveyard to the battlefield" or o:"return target creature card from your graveyard" or o:mill)',
  lands: '(o:landfall or o:"additional land" or o:"lands you control")',
  lifegain: '(o:"whenever you gain life" or keyword:lifelink)',
  blink: '(o:"exile another target" o:"return" or o:"then return it to the battlefield")',
  combat: '(o:"extra combat" or o:"additional combat" or keyword:"double strike")',
  voltron: '(t:equipment or (t:aura o:"enchanted creature gets"))',
  draw: '(o:"whenever you draw" or o:"each player draws")',
  discard: '(o:"whenever you discard" or keyword:madness)',
  treasure: 'o:treasure',
  poison: '(keyword:infect or keyword:toxic or o:proliferate)',
};

/** Requêtes (sans identité/légalité, ajoutées par l'appelant) pour les thèmes et tribus d'un commandant, 3 max. */
export function synergySearchQueries(profile: CommanderProfile): string[] {
  const out: string[] = [];
  for (const tribe of profile.tribes.slice(0, 1)) out.push(`(t:${tribe} or o:"${tribe}")`);
  for (const theme of profile.themes) {
    const q = THEME_QUERIES[theme.id];
    if (q) out.push(q);
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
}

/** Profil combiné d'un duo de commandants (25/09/2026) : union des thèmes et des tribus. */
export function mergeProfiles(profiles: CommanderProfile[]): CommanderProfile {
  if (profiles.length === 1) return profiles[0];
  const themes = new Map<string, { id: string; label: string }>();
  let themeMask = 0;
  const tribes = new Set<string>();
  for (const p of profiles) {
    themeMask |= p.themeMask;
    for (const t of p.themes) themes.set(t.id, t);
    for (const t of p.tribes) tribes.add(t);
  }
  return { themeMask, themes: Array.from(themes.values()), tribes: Array.from(tribes) };
}

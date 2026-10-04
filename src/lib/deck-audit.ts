import type { DeckCategory, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";
import { classifyCard } from "./deck-score";
import { AXES, ROLE_IDS, cardMechanics, cardRoles, type CardMechanics, type RoleId } from "./mechanics";
import { cardQuality, isRealAcceleration, textQuality, type CardQuality } from "./card-quality";
import { unmetDependencies } from "./dependencies";
import { axisTargets, familyLabel, ownShape, recipeById, RECIPES, type Recipe, type TrendMode } from "./deck-trends";
import { duelPresenceForIdentity } from "./duel-profiles";
import { duelCommanderDeckCount, duelMetaPresenceInColors } from "./duel-meta";
import { referenceFor, referenceShare, type CommanderReference } from "./duel-reference";
import { recentCards } from "./recent-sets";
import { ROLE_GROUP_LABELS, ROLE_GROUP_ORDER, type RoleGroup, type VerdictLevel } from "./deck-reading";

/**
 * LECTURE D'UN DECK CARTE PAR CARTE (04/10/2026, demandes de Ben : « il y a
 * encore des cartes contre-productives », « si les cartes sont justifiées
 * même si elles paraissent contre-intuitives, je veux la justification sur
 * la page de deck », « se concentrer sur une cohérence et une homogénéité du
 * deck »).
 *
 * Un seul module répond aux trois, pour qu'il n'y ait qu'UNE lecture du deck
 * (convention du projet : une seule formule, réutilisée) :
 * - le CONSTRUCTEUR s'en sert pour écarter ou pénaliser une carte qui n'a
 *   pas sa place dans le deck qu'il vient de bâtir, puis reconstruire
 *   (competitive-builder.ts) ;
 * - la PAGE DE DECK affiche, pour chaque carte, son rôle dans CE deck et la
 *   raison de sa présence, et signale les cartes à revoir ;
 * - le CLASSEMENT des commandants et le choix entre variantes utilisent
 *   l'indice de cohérence qui en sort (deck-optimizer.ts).
 *
 * Ce que la lecture établit :
 * 1. la LIGNE DIRECTRICE du deck — sa forme (famille de decks de tournoi la
 *    plus proche, ou la forme des decks de tournoi de ce commandant) et le
 *    ou les axes de mécanique autour desquels il est réellement construit ;
 * 2. pour chaque carte, un RÔLE (réponse, contresort, mana, pioche, pièce du
 *    plan, menace...) et un VERDICT :
 *    - « ok » ;
 *    - « contre-intuitif » : surprend à la lecture mais se justifie (la
 *      justification est donnée) ;
 *    - « discutable » : le deck la sert mal (récompense sans moteur,
 *      équipement sans porteurs, remplissage) ;
 *    - « contre-productif » : ne fonctionne pas ici (mécanique multijoueur
 *      en Duel, recherche sans cible, effet qui frappe ton propre plan).
 *
 * ⚠️ Tout est lu par MOTIFS sur le texte anglais des cartes, comme
 * deck-score.ts et mechanics.ts : une formulation inhabituelle échappe à la
 * lecture, et un verdict peut être faux. Une carte jouée par les decks de
 * tournoi du commandant ou de ces couleurs n'est jamais déclarée
 * contre-productive : le verdict est ramené à « contre-intuitif », avec la
 * part des decks qui la jouent.
 */

export { ROLE_GROUP_LABELS, ROLE_GROUP_ORDER };
export type { RoleGroup, VerdictLevel };

export interface CardVerdict {
  group: RoleGroup;
  /** Une phrase : ce que la carte fait dans CE deck et pourquoi elle y est. */
  why: string;
  level: VerdictLevel;
  /** Réserve ou justification, quand le verdict n'est pas « ok ». */
  note: string | null;
  /** Nature de la réserve (pour le constructeur) : multijoueur, dependance, miroir, nettoyage, porteurs, recompense, remplissage, surprise. */
  code: string | null;
  /** Note de qualité 0-10 et sa source (card-quality.ts). */
  quality: number;
  basis: CardQuality["basis"];
}

export interface DeckLineAxis {
  id: string;
  label: string;
  producers: number;
  rewarders: number;
  commander: boolean;
  target: number;
}

export interface DeckLine {
  /** Forme du deck : famille de decks de tournoi la plus proche. */
  style: string;
  /** La forme vient-elle des decks de tournoi de CE commandant ? */
  ownShape: boolean;
  axes: DeckLineAxis[];
  /** La ligne directrice en une ou deux phrases. */
  text: string;
}

export interface DeckAudit {
  line: DeckLine;
  /** Verdict par carte (clé : nom en minuscules). */
  verdicts: Record<string, CardVerdict>;
  /** 0-100 : part des cartes non-terrain qui ont un rôle clair dans le deck, moins les cartes à revoir (70 %), et réalisation du plan annoncé (30 %). */
  coherence: number;
  /** 0-100 : écart de la forme du deck (rôles, courbe) à la forme de référence. */
  structure: number;
  /** Qualité moyenne (0-10) des cartes non-terrain. */
  avgQuality: number;
  /** Cartes dont le verdict n'est pas « ok », de la plus grave à la moins grave. */
  flagged: { name: string; level: VerdictLevel; note: string }[];
  counts: { nonLand: number; creatures: number; roles: Record<RoleId, number> };
}

/** Ce que l'audit a besoin de savoir d'une carte — satisfait par CardFeatures (competitive-builder.ts). */
export interface AuditItem {
  card: ScryfallCard;
  count: number;
  isLand: boolean;
  categories: readonly DeckCategory[];
  mech: CardMechanics;
  roles: readonly RoleId[];
  quality: CardQuality;
  /** Part des decks de tournoi Duel de ces couleurs qui la jouent (0 hors Duel ou si jamais vue). */
  presence: number;
  /** Part des decks de tournoi de CE commandant qui la jouent (0 sans référence). */
  refShare: number;
  /** Pièce d'une combo présente dans le deck. */
  comboPiece?: boolean;
}

// ---------------------------------------------------------------------------
// Mécaniques pensées pour le multijoueur
// ---------------------------------------------------------------------------

export interface FormatMisfit {
  /** 0-1 : part de la carte qui ne fonctionne pas à deux joueurs. */
  severity: number;
  label: string;
  why: string;
}

function rulesText(card: ScryfallCard): string {
  return getDisplayOracleText(card).replace(/\([^)]*\)/g, " ");
}

const MULTIPLAYER_PATTERNS: { test: (text: string, kw: Set<string>) => boolean; severity: number; label: string; why: string }[] = [
  {
    test: (t, kw) => kw.has("goad") || /\bgoad(s|ed)?\b/i.test(t),
    severity: 0.8,
    label: "Incitation (goad)",
    why: "à deux joueurs, une créature incitée ne peut attaquer que toi : sur une créature adverse l'effet se retourne contre toi, il ne sert que sur tes propres créatures",
  },
  {
    test: (t, kw) => kw.has("myriad") || /\bmyriad\b/i.test(t),
    severity: 0.6,
    label: "Myriade",
    why: "la myriade crée une copie pour chaque AUTRE adversaire : il n'y en a aucun à deux joueurs",
  },
  {
    test: (t) => /will of the council|council's dilemma|secret council|each player votes|\bvotes? for\b/i.test(t),
    severity: 0.5,
    label: "Vote",
    why: "les cartes à vote comptent sur une table de plusieurs joueurs : à deux, l'adversaire vote toujours contre toi",
  },
  {
    test: (t) => /tempting offer|join forces/i.test(t),
    severity: 0.5,
    label: "Offre à la table",
    why: "l'effet grandit avec le nombre de joueurs qui acceptent : un seul adversaire, qui refusera",
  },
  {
    test: (t, kw) => kw.has("undaunted") || /for each opponent|number of opponents|for each player/i.test(t),
    severity: 0.3,
    label: "Proportionnel au nombre d'adversaires",
    why: "l'effet se multiplie par le nombre d'adversaires : un seul à deux joueurs",
  },
  {
    test: (t, kw) => kw.has("melee") || /\bmelee\b/i.test(t),
    severity: 0.2,
    label: "Mêlée",
    why: "la mêlée compte les adversaires attaqués : un seul à deux joueurs",
  },
  {
    test: (t) => /player to your (left|right)|each other opponent|an opponent other than|attacks? (a player|an opponent) other than you/i.test(t),
    severity: 0.5,
    label: "Table à plusieurs",
    why: "le texte suppose plusieurs adversaires",
  },
];

const misfitCache = new Map<string, FormatMisfit | null>();

/** La carte repose-t-elle sur une mécanique pensée pour le multijoueur ? (à n'appliquer qu'en Duel) */
export function multiplayerOnly(card: ScryfallCard): FormatMisfit | null {
  const hit = misfitCache.get(card.name);
  if (hit !== undefined) return hit;
  const text = rulesText(card);
  const kw = new Set((card.keywords ?? []).map((k) => k.toLowerCase()));
  let best: FormatMisfit | null = null;
  for (const p of MULTIPLAYER_PATTERNS) {
    if (p.test(text, kw) && (!best || p.severity > best.severity)) best = { severity: p.severity, label: p.label, why: p.why };
  }
  misfitCache.set(card.name, best);
  return best;
}

// ---------------------------------------------------------------------------
// Note d'un commandant
// ---------------------------------------------------------------------------

export interface CommanderRating {
  /** 0-10. */
  score: number;
  /** Decks de tournoi Duel menés par ce commandant dans l'échantillon. */
  tournamentDecks: number;
  /** Ce qui fonde la note, en clair. */
  notes: string[];
}

/**
 * Note d'un commandant POUR LE DUEL (0-10). Le commandant est la seule carte
 * disponible à chaque partie : sa valeur compte bien plus qu'une carte du
 * deck, et l'ancien classement ne la regardait pas du tout.
 * - joué en tournoi : 5 + 5 × √(decks / 50), plafonné à 10 (1 deck = 5,7 ;
 *   5 = 6,6 ; 15 = 7,7 ; 50 et plus = 10), jamais moins que la note du texte :
 *   un ou deux decks sont un indice, pas une preuve ;
 * - jamais joué : la note du modèle de texte, ramenée entre 1 et 5,8 (6,4
 *   pour une carte trop récente pour figurer dans les données), moins 0,6
 *   par mana au-delà de 4 ;
 * - mécanique pensée pour le multijoueur (incitation, myriade, vote...) :
 *   jusqu'à −3,2 — The Rani, par exemple, incite les créatures adverses à
 *   attaquer « un autre joueur que toi », ce qui n'existe pas à deux.
 * « Jamais joué » ne veut pas dire mauvais : c'est une absence de preuve,
 * et la note le dit (`notes`).
 */
export function commanderRating(commanders: readonly ScryfallCard[], mode: TrendMode): CommanderRating {
  if (mode !== "duel") return { score: 5, tournamentDecks: 0, notes: [] };
  const decks = duelCommanderDeckCount(commanders.map((c) => c.name));
  const notes: string[] = [];
  // Note d'après le texte seul : plancher de tous les commandants.
  const text = Math.min(...commanders.map((c) => textQuality(c, classifyCard(c))));
  const recent = commanders.some((c) => isRecentCard(c.name));
  // Carte trop récente pour les données : plafond un peu plus haut (6,4) que pour une carte ancienne jamais jouée (5,8).
  let score = recent ? Math.min(6.4, 1.5 + text * 0.55) : Math.min(5.8, 1 + text * 0.5);
  if (decks > 0) {
    // 5 + 5 × √(decks / 50), plafonné à 10 : 1 deck = 5,7 ; 5 = 6,6 ; 15 = 7,7 ; 50 et plus = 10.
    score = Math.max(score, 5 + 5 * Math.min(1, Math.sqrt(decks / 50)));
    notes.push(
      decks >= 5
        ? `${decks} decks de tournoi Duel dans l'échantillon : un commandant qui a fait ses preuves dans ce format.`
        : `${decks} deck${decks > 1 ? "s" : ""} de tournoi Duel dans l'échantillon : déjà joué à ce niveau, mais c'est trop peu pour conclure.`
    );
  } else {
    notes.push(
      recent
        ? "Trop récent pour figurer dans les decks de tournoi : jugé sur son texte seulement."
        : "Aucun deck de tournoi Duel avec ce commandant dans l'échantillon : c'est une piste, pas une valeur sûre."
    );
    // 81 % des commandants de tournoi coûtent 4 manas ou moins (échantillon
    // d'après le 27/07/2026) : sans preuve du contraire, un commandant cher
    // est un handicap en Duel — 0,6 point par mana au-delà de 4.
    const cmc = Math.max(...commanders.map((c) => c.cmc ?? 0));
    if (cmc > 4) {
      score -= (cmc - 4) * 0.6;
      notes.push(`Coûte ${cmc} manas : la plupart des commandants de tournoi en coûtent 4 ou moins.`);
    }
  }
  for (const c of commanders) {
    const misfit = multiplayerOnly(c);
    if (!misfit) continue;
    score -= misfit.severity * 4;
    notes.push(`${c.name.split(" // ")[0]} — ${misfit.label} : ${misfit.why}.`);
  }
  return { score: Math.round(Math.max(0, Math.min(10, score)) * 10) / 10, tournamentDecks: decks, notes };
}

// ---------------------------------------------------------------------------
// Faits sur une carte (hors constructeur : page de deck, suggestions)
// ---------------------------------------------------------------------------

const RECENT_NAMES = new Set(recentCards().map((e) => e.card.name.toLowerCase()));

export function isRecentCard(name: string): boolean {
  return RECENT_NAMES.has(name.toLowerCase());
}

const itemCache = new Map<string, Omit<AuditItem, "count" | "refShare" | "comboPiece">>();

/** Faits d'une carte pour l'audit, calculés sans le constructeur. `identity` : couleurs du deck. */
export function auditItem(
  card: ScryfallCard,
  count: number,
  mode: TrendMode,
  identity: readonly string[],
  reference: CommanderReference | null = null
): AuditItem {
  const key = `${card.name}|${mode}|${[...identity].sort().join("")}`;
  let base = itemCache.get(key);
  if (!base) {
    const categories = classifyCard(card);
    const isLand = Boolean(card.type_line?.split(" // ")[0].includes("Land"));
    const presence = mode === "duel" ? duelPresenceForIdentity(card.name, card.color_identity ?? [], identity) : 0;
    // Jamais vue dans les decks de CES couleurs mais jouée ailleurs : demi-crédit (même règle que le constructeur).
    const forQuality = presence || (mode === "duel" ? duelMetaPresenceInColors(card.name) * 0.5 : 0);
    base = {
      card,
      isLand,
      categories,
      mech: cardMechanics(card),
      roles: cardRoles(card, categories),
      quality: cardQuality(card, categories, { mode, duelPresence: forQuality, recent: isRecentCard(card.name) }),
      presence,
    };
    if (itemCache.size > 30000) itemCache.clear();
    itemCache.set(key, base);
  }
  return { ...base, count, refShare: referenceShare(reference, card.name) };
}

// ---------------------------------------------------------------------------
// Ligne directrice
// ---------------------------------------------------------------------------

/** Axes que presque tout deck sert sans le vouloir : ils ne définissent pas un plan. */
export const BROAD_AXES = new Set(["combat", "flash", "legends", "bigmana", "blink", "arrivals", "draw", "untap", "scry"]);
/** Axes dont la récompense se nourrit toute seule (rappel éclair, terrains qui arrivent de toute façon) : pas de contrôle « récompense sans moteur ». */
const SELF_FED_AXES = new Set(["graveyard", "lands", "exilecast", "discard"]);

/** Axes qu'une carte alimente par son seul type (éphémères, artefacts, enchantements...). */
const TYPE_FED = new Set(AXES.map((a, i) => (a.producesTypes?.length ? i : -1)).filter((i) => i >= 0));

function emptyRoles(): Record<RoleId, number> {
  return Object.fromEntries(ROLE_IDS.map((r) => [r, 0])) as Record<RoleId, number>;
}

const STRUCTURE_ROLES: RoleId[] = ["creature", "cheapCreature", "counterspell", "cheapInteraction", "removal", "draw", "ramp", "cmc01", "cmc2", "cmc3", "cmc4", "cmc5plus"];

/**
 * Écart de la forme d'un deck à une forme de référence, sur 0-100. Pour
 * chaque rôle suivi : 1 dans la fourchette [p25, p75] des decks de tournoi,
 * puis décroissance linéaire jusqu'à 0 à une demi-médiane d'écart (4 cartes
 * au moins). 100 = tous les rôles dans la fourchette.
 */
export function structureFit(counts: Record<RoleId, number>, recipe: Recipe): number {
  let sum = 0;
  let n = 0;
  for (const r of STRUCTURE_ROLES) {
    const range = recipe.roles[r];
    if (!range) continue;
    const c = counts[r];
    const gap = c < range.p25 ? range.p25 - c : c > range.p75 ? c - range.p75 : 0;
    const tolerance = Math.max(4, range.median / 2);
    sum += Math.max(0, 1 - gap / tolerance);
    n++;
  }
  return n ? Math.round((sum / n) * 100) : 100;
}

/**
 * Indice « forme » affiché et compté dans la solidité (04/10/2026).
 *
 * Un commandant joué en tournoi est construit sur SA forme (fourchettes de
 * 4 à 100 decks presque identiques, donc étroites) ; un commandant sans
 * référence, sur la forme de sa famille (des centaines de decks, fourchettes
 * larges). Mesurés chacun contre sa propre règle, le second avait toujours
 * la meilleure note : avec la liste de Ben, Vivi Ornitier (13 decks de
 * tournoi) obtenait 81 et Sanar (2 decks) 97 pour le même deck à quelques
 * cartes près — et sortait du classement. On retient donc la meilleure des
 * deux mesures : suivre une référence plus précise ne doit pas coûter.
 */
export function structureScore(counts: Record<RoleId, number>, recipe: Recipe): number {
  const own = structureFit(counts, recipe);
  const family = recipe.family ? recipeById(recipe.family) : null;
  return family ? Math.max(own, structureFit(counts, family)) : own;
}

/** Rôles dont la forme de référence fixe un quota (fourchettes apprises, deck-trends.ts). */
const QUOTA_ROLES: RoleId[] = ["creature", "cheapCreature", "threat", "counterspell", "cheapInteraction", "removal", "wipe", "draw", "ramp", "tutor", "protection", "recursion"];
const CURVE_BUCKETS: RoleId[] = ["cmc01", "cmc2", "cmc3", "cmc4", "cmc5plus"];

/**
 * Ce que la FORME de référence dit d'une carte, compte tenu de ce qui est
 * déjà choisi. Pour chaque rôle de la carte : +1,6 tant que le deck est sous
 * le premier quartile des decks de tournoi (manque net), +0,8 sous la
 * médiane, 0 dans la fourchette, puis un frein croissant au-delà du
 * troisième quartile. Même logique, à demi-poids, pour la tranche de coût.
 * C'est ce qui empêche un deck de tempo de finir avec 40 réponses et aucune
 * créature, ou un deck de créatures sans réponses.
 *
 * Deux garde-fous (04/10/2026, mesurés sur la collection de Ben : Traxos,
 * noté 2,9, entrait pour « remplir les 4 manas » pendant que Tetsuko
 * Umezawa, notée 5,8, était freinée de −4,8) :
 * - les FREINS ne se cumulent plus : seul le plus fort compte (rôles, puis
 *   tranche de coût). Une carte à trois rôles n'est pas trois fois de trop ;
 * - le BONUS « comble un manque » dépend de la qualité (`quality`, 0-10) :
 *   nul à 3,5 et en dessous, entier à partir de 5,5. Un quota ne se comble
 *   pas avec une carte de remplissage. Sans `quality` : bonus entier.
 * Ces seuils sont des choix de conception.
 */
export function structureNeed(roles: readonly RoleId[], recipe: Recipe, counts: Record<RoleId, number>, quality?: number): { score: number; fills: RoleId | null } {
  let bonus = 0;
  let brake = 0;
  let fills: RoleId | null = null;
  let bestGap = 0;
  for (const r of QUOTA_ROLES) {
    if (!roles.includes(r)) continue;
    const range = recipe.roles[r];
    if (!range) continue;
    const c = counts[r];
    // Menaces : au moins 4 autorisées quelle que soit la forme — un deck de
    // contrôle en joue peu, mais il lui en faut pour conclure.
    const cap = Math.max(range.p75, range.median + 1, r === "threat" ? 4 : 0);
    if (c < range.p25) {
      bonus += 1.6;
      if (range.p25 - c > bestGap) {
        bestGap = range.p25 - c;
        fills = r;
      }
    } else if (c < range.median) bonus += 0.8;
    else if (c >= cap) brake = Math.max(brake, Math.min(4, 1.5 + 0.6 * (c - cap)));
  }
  bonus = Math.min(3.2, bonus);
  let curveBrake = 0;
  for (const r of CURVE_BUCKETS) {
    if (!roles.includes(r)) continue;
    const range = recipe.roles[r];
    if (!range) continue;
    const c = counts[r];
    const cap = Math.max(range.p75, range.median + 1);
    if (c < range.p25) bonus += 0.8;
    else if (c < range.median) bonus += 0.4;
    else if (c >= cap) curveBrake = Math.max(curveBrake, Math.min(2.4, 0.8 + 0.4 * (c - cap)));
  }
  const worth = quality === undefined ? 1 : Math.max(0, Math.min(1, (quality - 3.5) / 2));
  if (worth === 0) fills = null;
  return { score: bonus * worth - brake - curveBrake, fills };
}

/** Rôles cités pour justifier une carte sans preuve en tournoi, du plus parlant au plus général. */
const FILL_ROLES: RoleId[] = ["counterspell", "removal", "draw", "ramp", "cheapCreature", "creature"];
const FILL_LABELS: Partial<Record<RoleId, string>> = {
  counterspell: "les contresorts",
  removal: "les réponses ciblées",
  draw: "la pioche",
  ramp: "le mana d'appoint",
  cheapCreature: "les créatures à 1-2 manas",
  creature: "les créatures",
};

/** Famille dont la forme est la plus proche de celle du deck. */
export function nearestRecipe(counts: Record<RoleId, number>): Recipe | null {
  let best: Recipe | null = null;
  let bestFit = -1;
  for (const r of RECIPES) {
    const fit = structureFit(counts, r);
    if (fit > bestFit) {
      bestFit = fit;
      best = r;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

const SYMMETRIC_HATE: { test: RegExp; hits: (ctx: AuditCtx) => number; min: number; what: string }[] = [
  {
    test: /would be put into a graveyard from anywhere, exile it instead|exile all (cards from all )?graveyards|each player exiles (all cards from )?their graveyard/i,
    hits: (c) => c.graveyardUsers,
    min: 5,
    what: "vide aussi TON cimetière, dont dépendent {n} cartes du deck",
  },
  {
    test: /activated abilities of artifacts can't be activated|destroy all artifacts|artifacts? enter tapped/i,
    hits: (c) => c.artifacts,
    min: 8,
    what: "frappe aussi TES {n} artefacts",
  },
  {
    test: /creatures entering (the battlefield )?don't cause abilities to trigger/i,
    hits: (c) => c.etbCreatures,
    min: 8,
    what: "éteint aussi les effets d'arrivée de TES {n} créatures",
  },
  {
    test: /noncreature spells cost \{\d\} more|can't cast more than one spell each turn|each player can't cast more than one/i,
    hits: (c) => c.spells,
    min: 22,
    what: "te bride autant que l'adversaire : le deck joue {n} éphémères et rituels",
  },
  {
    test: /destroy all enchantments/i,
    hits: (c) => c.enchantments,
    min: 6,
    what: "détruit aussi TES {n} enchantements",
  },
  {
    test: /nonbasic lands are mountains|nonbasic lands don't untap/i,
    hits: (c) => c.nonBasicLands,
    min: 14,
    what: "bloque aussi TES {n} terrains non-base",
  },
];

interface AuditCtx {
  creatures: number;
  artifacts: number;
  enchantments: number;
  spells: number;
  graveyardUsers: number;
  etbCreatures: number;
  nonBasicLands: number;
  producers: number[];
  rewarders: number[];
}

export interface AuditInput {
  items: readonly AuditItem[];
  commanders: readonly ScryfallCard[];
  mode: TrendMode;
  /** Plan suivi par le constructeur, s'il y en a un : sinon la ligne directrice est déduite de la liste. */
  plan?: { axes: readonly number[]; recipe: Recipe | null } | null;
}

const LEVEL_RANK: Record<VerdictLevel, number> = { ok: 0, "contre-intuitif": 1, discutable: 2, "contre-productif": 3 };
const pct = (x: number) => `${Math.round(x * 100)} %`;
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const mana = (cmc: number) => `${cmc} mana${cmc > 1 ? "s" : ""}`;

const LAND_CYCLING = /\b(basic landcycling|landcycling|plainscycling|islandcycling|swampcycling|mountaincycling|forestcycling)\b/i;
const CARD_ADVANTAGE = /look at the top (two|three|four|five|six|seven|x|\d+) cards of your library|exile the top (card|two cards|three cards|\w+ cards) of your library[^.]*\.[^.]*(you may|may) (play|cast)|reveal the top [^.]*put [^.]*into your hand/i;
const ONE_SIDED = /(you don't control|opponents? controls?|each opponent)/i;

function isCreatureCard(card: ScryfallCard): boolean {
  return (card.type_line ?? "").split(" // ")[0].includes("Creature");
}

/** Phrase de rôle : ce que la carte fait, en clair et avec son coût. */
function roleSentence(it: AuditItem): { group: RoleGroup; text: string } {
  const { card, categories, roles } = it;
  const cmc = Math.round(card.cmc ?? 0);
  const type = (card.type_line ?? "").split(" // ")[0];
  const text = rulesText(card);
  const instant = type.includes("Instant") || (card.keywords ?? []).some((k) => k.toLowerCase() === "flash");
  const creature = type.includes("Creature");
  const body = creature && card.power && card.toughness ? ` sur un corps ${card.power}/${card.toughness}` : "";
  if (roles.includes("counterspell")) {
    const soft = /unless (its|that spell's|that player|they)/i.test(text);
    return { group: "contresort", text: `Contresort${soft ? " conditionnel" : ""} à ${mana(cmc)}${body}` };
  }
  if (categories.includes("wipe")) return { group: "reponse", text: `Nettoyage de table à ${mana(cmc)}${ONE_SIDED.test(text) ? " qui épargne ton côté" : ""}${body}` };
  if (categories.includes("removal")) {
    const bounce = /owner's hand/i.test(text) && !/destroy|exile target|damage/i.test(text);
    return { group: "reponse", text: `${bounce ? "Renvoi en main" : "Réponse ciblée"} à ${mana(cmc)}${instant && !creature ? ", à vitesse d'éphémère" : ""}${body}` };
  }
  if (categories.includes("tutor")) return { group: "recherche", text: `Recherche de carte à ${mana(cmc)}${body}` };
  if (isRealAcceleration(card)) return { group: "mana", text: `Accélération de mana à ${mana(cmc)}${body}` };
  if (categories.includes("disruption")) return { group: "perturbation", text: `Perturbation (défausse, taxe ou verrou) à ${mana(cmc)}${body}` };
  if (roles.includes("draw")) {
    const real = /draws? (a|an|one|two|three|four|five|x|\d+) (additional )?cards?|draw cards equal/i.test(text);
    if (!creature || !real) return { group: "pioche", text: `${real ? "Pioche" : "Sélection de pioche"} à ${mana(cmc)}${body}` };
  }
  if (categories.includes("ramp") && !creature) return { group: "mana", text: `Source de mana d'appoint à ${mana(cmc)}` };
  if (!creature && CARD_ADVANTAGE.test(text)) return { group: "pioche", text: `Avantage de cartes à ${mana(cmc)} (choisit ou joue des cartes du dessus de la bibliothèque)` };
  if (/destroy target (nonbasic )?land/i.test(text)) return { group: "perturbation", text: `Destruction de terrain à ${mana(cmc)}` };
  if (roles.includes("protection") && !creature) return { group: "protection", text: `Protection à ${mana(cmc)}` };
  if (type.includes("Planeswalker")) return { group: "menace", text: `Planeswalker à ${mana(cmc)}` };
  if (creature) {
    const kws = (card.keywords ?? []).filter((k) => /flying|haste|deathtouch|lifelink|trample|menace|first strike|double strike|vigilance|flash|ward|hexproof|prowess/i.test(k)).slice(0, 2);
    const extra = roles.includes("draw") ? ", qui fait piocher" : categories.includes("ramp") ? ", qui produit du mana" : "";
    return {
      group: "menace",
      text: `Créature ${card.power ?? "?"}/${card.toughness ?? "?"} à ${mana(cmc)}${kws.length ? ` (${kws.join(", ").toLowerCase()})` : ""}${extra}`,
    };
  }
  if (categories.includes("finisher")) return { group: "menace", text: `Carte de fin de partie à ${mana(cmc)}` };
  if (type.includes("Equipment")) return { group: "autre", text: `Équipement à ${mana(cmc)}` };
  if (type.includes("Aura")) return { group: "autre", text: `Aura à ${mana(cmc)}` };
  return { group: "autre", text: `${type.split(" — ")[0] || "Carte"} à ${mana(cmc)}` };
}

/** Rôle fonctionnel d'une carte hors de tout deck (réponse, contresort, mana, menace...) — sans la place dans un plan. */
export function functionalGroup(it: AuditItem): RoleGroup {
  return it.isLand ? "terrain" : roleSentence(it).group;
}

/**
 * Lit un deck : ligne directrice, rôle et verdict de chaque carte, indices.
 * `items` : cartes du deck hors commandants (terrains compris).
 */
export function auditDeck(input: AuditInput): DeckAudit {
  const { items, commanders, mode } = input;
  const duel = mode === "duel";
  const targets = axisTargets(mode);

  // --- Comptes ---
  const roles = emptyRoles();
  const ctx: AuditCtx = { creatures: 0, artifacts: 0, enchantments: 0, spells: 0, graveyardUsers: 0, etbCreatures: 0, nonBasicLands: 0, producers: AXES.map(() => 0), rewarders: AXES.map(() => 0) };
  const graveyardAxis = AXES.findIndex((a) => a.id === "graveyard");
  for (const it of items) {
    const type = (it.card.type_line ?? "").split(" // ")[0];
    if (it.isLand) {
      if (!type.includes("Basic")) ctx.nonBasicLands += it.count;
      continue;
    }
    for (const r of it.roles) roles[r] += it.count;
    if (type.includes("Creature")) ctx.creatures += it.count;
    if (type.includes("Artifact")) ctx.artifacts += it.count;
    if (type.includes("Enchantment")) ctx.enchantments += it.count;
    if (type.includes("Instant") || type.includes("Sorcery")) ctx.spells += it.count;
    if (it.mech.rewards.includes(graveyardAxis)) ctx.graveyardUsers += it.count;
    if (type.includes("Creature") && /when (this creature|[^.,\n]{2,40}) enters/i.test(rulesText(it.card))) ctx.etbCreatures += it.count;
    for (const i of it.mech.produces) ctx.producers[i] += it.count;
    for (const i of it.mech.rewards) ctx.rewarders[i] += it.count;
  }
  const cmdRewards = AXES.map(() => false);
  const cmdProduces = AXES.map(() => false);
  for (const c of commanders) {
    const m = cardMechanics(c);
    for (const i of m.rewards) cmdRewards[i] = true;
    for (const i of m.produces) cmdProduces[i] = true;
  }
  const boardCreatures = ctx.creatures + commanders.filter(isCreatureCard).length;

  // --- Ligne directrice ---
  const own = duel ? ownShape(commanders.map((c) => c.name)) : null;
  const recipe = input.plan?.recipe ?? own ?? nearestRecipe(roles);
  let axisIds: number[];
  if (input.plan) axisIds = [...input.plan.axes];
  else {
    axisIds = AXES.map((_, i) => i)
      .filter((i) => !BROAD_AXES.has(AXES[i].id))
      .filter((i) => (cmdRewards[i] || ctx.rewarders[i] >= 4) && ctx.producers[i] >= Math.max(4, targets[i].target * 0.5))
      .map((i) => ({ i, units: Math.min(ctx.rewarders[i] + (cmdRewards[i] ? 3 : 0), 8) * Math.min(1, ctx.producers[i] / Math.max(1, targets[i].target)) }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 2)
      .map((x) => x.i);
  }
  // Un axe du plan n'est annoncé dans la ligne directrice que si le deck le
  // sert vraiment : au moins la moitié de la densité des decks construits
  // dessus (4 cartes au moins), et de quoi en profiter.
  const served = (i: number) => ctx.producers[i] >= Math.max(4, targets[i].target * 0.5) && ctx.rewarders[i] + (cmdRewards[i] ? 3 : 0) >= 2;
  // Réalisation du plan (0-1) : pour chaque axe visé, part de la densité cible
  // atteinte × présence de récompenses. Sans axe, 0,7 (un deck sans mécanique
  // dominante n'est ni pénalisé ni favorisé).
  const planFit = axisIds.length
    ? axisIds.reduce((sum, i) => sum + Math.min(1, ctx.producers[i] / Math.max(1, targets[i].target)) * Math.min(1, (ctx.rewarders[i] + (cmdRewards[i] ? 3 : 0)) / 4), 0) / axisIds.length
    : 0.7;
  // Seuls les axes réellement servis comptent pour dire qu'une carte « est dans
  // le plan » : une récompense d'un axe visé mais non servi reste une
  // récompense sans moteur.
  const planAxes = new Set(axisIds.filter(served));
  const lineAxes: DeckLineAxis[] = axisIds.filter(served).map((i) => ({
    id: AXES[i].id,
    label: AXES[i].label,
    producers: ctx.producers[i],
    rewarders: ctx.rewarders[i],
    commander: cmdRewards[i],
    target: Math.round(targets[i].target),
  }));

  // --- Dépendances (recherche sans cible, tribu mal servie) ---
  const deps = new Map<string, { hard: boolean; reason: string }>();
  for (const u of unmetDependencies(items.map((i) => i.card), commanders)) {
    const hard = u.dependency.hard || (u.dependency.kind !== "tribe" && u.have === 0);
    const prev = deps.get(u.name.toLowerCase());
    if (!prev || (hard && !prev.hard)) deps.set(u.name.toLowerCase(), { hard, reason: u.reason });
  }

  // --- Verdicts ---
  const verdicts: Record<string, CardVerdict> = {};
  const flagged: DeckAudit["flagged"] = [];
  let weight = 0;
  let coherent = 0;
  let qualitySum = 0;
  const commanderLabel = commanders.length > 1 ? "tes commandants" : (commanders[0]?.name.split(" // ")[0] ?? "le commandant");

  for (const it of items) {
    const key = it.card.name.toLowerCase();
    if (it.isLand) {
      verdicts[key] = { group: "terrain", why: "Terrain.", level: "ok", note: null, code: null, quality: it.quality.score, basis: it.quality.basis };
      continue;
    }
    const text = rulesText(it.card);
    const type = (it.card.type_line ?? "").split(" // ")[0];
    const cmc = Math.round(it.card.cmc ?? 0);
    const role = roleSentence(it);
    let group = role.group;
    const parts: string[] = [role.text];

    // Place dans le plan.
    const rewardsPlan = it.mech.rewards.filter((i) => planAxes.has(i));
    const producesPlan = it.mech.produces.filter((i) => planAxes.has(i));
    const functional = group !== "menace" && group !== "autre";
    let planNote = "";
    if (rewardsPlan.length) {
      const i = rewardsPlan[0];
      planNote = `récompense « ${AXES[i].label} » : ${plural(ctx.producers[i], "carte du deck le déclenche", "cartes du deck le déclenchent")}`;
      if (!functional) group = "plan";
    } else if (producesPlan.some((i) => !TYPE_FED.has(i))) {
      // Un axe nourri par le seul TYPE de la carte (tout éphémère nourrit
      // « sorts ») ne se signale pas carte par carte : ce serait écrit partout.
      const i = producesPlan.find((x) => !TYPE_FED.has(x))!;
      const by = cmdRewards[i] ? commanderLabel : plural(ctx.rewarders[i], "carte", "cartes");
      planNote = `nourrit « ${AXES[i].label} », que ${cmdRewards[i] ? "récompense" : ctx.rewarders[i] > 1 ? "récompensent" : "récompense"} ${by}`;
      if (!functional && !isCreatureCard(it.card)) group = "soutien";
    }
    if (it.comboPiece) planNote = planNote ? `pièce de combo ; ${planNote}` : "pièce d'une combo du deck";

    // Preuves.
    let evidence = "";
    if (it.refShare >= 0.3) evidence = `jouée par ${pct(it.refShare)} des decks de tournoi de ce commandant`;
    else if (it.presence >= 0.1) evidence = `jouée par ${pct(it.presence)} des decks de tournoi de ces couleurs`;
    else if (it.presence > 0) evidence = "déjà vue en tournoi";
    const proven = it.refShare >= 0.3 || it.presence >= 0.2;

    // --- Réserves ---
    let level = "ok" as VerdictLevel;
    let note = null as string | null;
    let code = null as string | null;
    const raise = (l: VerdictLevel, n: string, c: string) => {
      if (LEVEL_RANK[l] > LEVEL_RANK[level]) {
        level = l;
        note = n;
        code = c;
      }
    };

    if (duel) {
      const misfit = multiplayerOnly(it.card);
      if (misfit) raise(misfit.severity >= 0.5 ? "contre-productif" : "discutable", `${misfit.label} : ${misfit.why}.`, "multijoueur");
    }
    const dep = deps.get(key);
    if (dep && !it.comboPiece) raise(dep.hard ? "contre-productif" : "discutable", dep.reason, "dependance");

    for (const h of SYMMETRIC_HATE) {
      if (!h.test.test(text)) continue;
      const n = h.hits(ctx);
      if (n >= h.min) raise("contre-productif", `Cette carte ${h.what.replace("{n}", String(n))}.`, "miroir");
    }
    if (it.categories.includes("wipe") && !ONE_SIDED.test(text) && /creatures/i.test(text)) {
      if (boardCreatures >= 20) raise("discutable", `Nettoie aussi ton côté : le deck joue ${boardCreatures} créatures. À garder seulement comme bouton de secours.`, "nettoyage");
      else raise("contre-intuitif", `Nettoie les deux côtés, mais le deck ne joue que ${boardCreatures} créatures : c'est l'adversaire qui y perd le plus.`, "surprise");
    }
    const attaches = (type.includes("Equipment") || (type.includes("Aura") && /enchant creature/i.test(getDisplayOracleText(it.card)))) && !it.categories.includes("removal") && !/enchanted creature (can't|doesn't|loses)|you control enchanted creature/i.test(text);
    if (attaches && boardCreatures < 12) raise("discutable", `${type.includes("Equipment") ? "Équipement" : "Aura"} à poser sur une créature, mais le deck n'en joue que ${boardCreatures}.`, "porteurs");
    if (/creatures you control get \+/i.test(text) && boardCreatures < 12) raise("discutable", `Renforce « les créatures que tu contrôles », mais le deck n'en joue que ${boardCreatures}.`, "porteurs");

    // Récompense d'un axe que le deck n'alimente pas.
    if (!functional) {
      for (const i of it.mech.rewards) {
        const id = AXES[i].id;
        if (BROAD_AXES.has(id) || SELF_FED_AXES.has(id) || planAxes.has(i) || it.mech.produces.includes(i)) continue;
        const have = ctx.producers[i] + (cmdProduces[i] ? 2 : 0);
        const need = Math.max(4, targets[i].target * 0.4);
        if (have < need) {
          raise("discutable", `Récompense « ${AXES[i].label} », une mécanique que ce deck ne suit pas : ${plural(have, "carte seulement la déclenche", "cartes seulement la déclenchent")} (repère : ${Math.round(targets[i].target)}).`, "recompense");
          break;
        }
      }
    }
    // Remplissage : rien n'indique que la carte soit forte, et elle ne sert pas le plan.
    const onPlan = rewardsPlan.length > 0 || producesPlan.length > 0 || Boolean(it.comboPiece);
    if (duel && it.quality.score < 3.4 && !onPlan && level === "ok") {
      raise("discutable", "Carte de remplissage : jamais vue en tournoi et rien dans son texte n'indique une carte forte. C'est la meilleure option disponible pour ce rôle — une carte à remplacer en priorité.", "remplissage");
    }

    // Une carte que les decks de tournoi jouent n'est pas déclarée fautive.
    if (proven && LEVEL_RANK[level] >= LEVEL_RANK.discutable) {
      note = `${note ?? ""} Les joueurs de tournoi la jouent pourtant (${evidence}) : gardée.`.trim();
      level = "contre-intuitif";
      code = "surprise";
    }

    // --- Choix qui surprennent mais se tiennent ---
    if (level === "ok") {
      if (LAND_CYCLING.test(getDisplayOracleText(it.card)) && cmc >= 4) {
        raise("contre-intuitif", `Chère pour ce deck, mais son recyclage va chercher un terrain en début de partie : elle sert de terrain quand il en manque, de menace sinon.`, "surprise");
      } else if (cmc >= 6 && recipe && recipe.avgCmc <= 2.6) {
        raise("contre-intuitif", `À ${mana(cmc)} dans un deck à courbe basse : une des rares cartes de fin de partie, à ne pas multiplier.`, "surprise");
      } else if (duel && it.quality.basis === "tournoi" && it.presence >= 0.2 && group === "autre") {
        raise("contre-intuitif", `Son rôle ne saute pas aux yeux, mais ${pct(it.presence)} des decks de tournoi de ces couleurs la jouent.`, "surprise");
      }
    }

    if (planNote) parts.push(planNote);
    if (evidence) parts.push(evidence);
    // Sans preuve en tournoi ni place dans le plan : dire ce qui justifie la
    // carte — elle complète un rôle que la forme du deck demande.
    // (Duel seulement : les fourchettes viennent de decks de tournoi Duel.)
    if (duel && !evidence && !planNote && recipe) {
      const r = FILL_ROLES.find((x) => it.roles.includes(x) && (recipe.roles[x]?.median ?? 0) > 0);
      if (r) {
        const range = recipe.roles[r];
        parts.push(`complète ${FILL_LABELS[r]} du deck (${roles[r]}, pour ${range.p25} à ${range.p75} dans les decks de tournoi de cette forme)`);
      }
    }
    const why = `${parts.join(" ; ")}.`;
    verdicts[key] = { group, why, level, note, code, quality: Math.round(it.quality.score * 10) / 10, basis: it.quality.basis };
    if (level !== "ok" && note) flagged.push({ name: it.card.name, level, note });

    // --- Indices ---
    weight += it.count;
    qualitySum += it.quality.score * it.count;
    const hasJob = functional || onPlan || group === "menace";
    const credit = level === "contre-productif" ? 0 : level === "discutable" ? 0.4 : hasJob ? 1 : 0.6;
    coherent += credit * it.count;
  }
  flagged.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.name.localeCompare(b.name));

  const style = recipe ? familyLabel(recipe) : "Forme libre";
  const axisText = lineAxes.length
    ? `construit autour de ${lineAxes.map((a) => `« ${a.label} » (${plural(a.producers, "carte l'alimente", "cartes l'alimentent")}, ${a.commander ? "le commandant" : plural(a.rewarders, "carte", "cartes")}${a.commander && a.rewarders ? ` et ${plural(a.rewarders, "carte", "cartes")}` : ""} en profite${a.rewarders + (a.commander ? 1 : 0) > 1 ? "nt" : ""})`).join(" et ")}`
    : "sans mécanique dominante : le deck repose sur la qualité de ses cartes et sur sa forme";
  const shapeText = `${ctx.creatures} créatures, ${roles.counterspell} contresorts, ${roles.removal} réponses ciblées, ${roles.draw} cartes de pioche ou de sélection, ${roles.ramp} sources de mana hors terrains`;
  const line: DeckLine = {
    style,
    ownShape: Boolean(own && recipe === own),
    axes: lineAxes,
    text: `${style}, ${axisText}. ${shapeText.charAt(0).toUpperCase()}${shapeText.slice(1)}.`,
  };

  return {
    line,
    verdicts,
    // 70 % : part des cartes qui ont un rôle clair ; 30 % : réalisation du plan annoncé.
    coherence: weight ? Math.round((coherent / weight) * 70 + planFit * 30) : 100,
    structure: recipe ? structureScore(roles, recipe) : 100,
    avgQuality: weight ? Math.round((qualitySum / weight) * 100) / 100 : 0,
    flagged,
    counts: { nonLand: weight, creatures: ctx.creatures, roles },
  };
}

/**
 * Lecture d'un deck à partir de ses seules cartes (page de deck, suggestions) :
 * calcule les faits de chaque carte puis appelle auditDeck. `cards` : hors
 * commandants.
 */
export function auditDeckFromCards(
  cards: readonly { card: ScryfallCard; count: number }[],
  commanders: readonly ScryfallCard[],
  mode: TrendMode,
  comboPieces: ReadonlySet<string> = new Set()
): DeckAudit {
  const identity = Array.from(new Set(commanders.flatMap((c) => c.color_identity ?? [])));
  const reference = mode === "duel" ? referenceFor(commanders.map((c) => c.name)) : null;
  const items = cards.map(({ card, count }) => ({ ...auditItem(card, count, mode, identity, reference), comboPiece: comboPieces.has(card.name.toLowerCase()) }));
  return auditDeck({ items, commanders, mode });
}

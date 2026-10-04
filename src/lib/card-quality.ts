import type { DeckCategory, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";
import { counterspellKind } from "./mechanics";
import model from "@/data/card-quality-model.json";

/**
 * QUALITÉ INTRINSÈQUE D'UNE CARTE (04/10/2026, retour de Ben : « il y a
 * encore des cartes contre-productives dans tes suggestions », « l'algo
 * s'enferme dans des schémas »).
 *
 * Constat à l'origine de ce module : le constructeur notait une carte par
 * les CASES qu'elle cochait (rampe, tutor, synergie de thème...), jamais par
 * ce qu'elle vaut. Une carte médiocre qui cochait trois cases (Deathspore
 * Thallid : « jetons » + « sacrifice » + « removal ») passait devant une bonne
 * carte qui n'en cochait qu'une. Il manquait une note de fond, indépendante
 * du deck.
 *
 * Trois sources, de la plus fiable à la moins fiable :
 * 1. « tournoi » — part des decks de tournoi Duel qui jouent la carte, à
 *    couleurs égales (duel-meta.ts). Une donnée observée.
 * 2. « popularité » — rang EDHREC renvoyé par Scryfall (1 = la carte la plus
 *    jouée en Commander). Une donnée observée, mais de popularité, pas de
 *    force.
 * 3. « texte » — un modèle appris (régression logistique) qui estime, à
 *    partir du texte et du coût, si une carte a le profil de celles que les
 *    joueurs de tournoi retiennent. Entraîné par
 *    scripts/learn-card-quality.mts sur les cartes jouées en tournoi Duel
 *    (cibles positives, pondérées par leur présence) contre un échantillon
 *    de cartes jamais jouées. Coefficients : src/data/card-quality-model.json.
 *
 * ⚠️ Limites à garder en tête :
 * - le modèle « texte » lit des MOTIFS (même nature que deck-score.ts). Il
 *   repère le profil d'une carte efficace (réponse à 1 mana, créature au bon
 *   ratio, pioche répétée) et le profil d'une carte de remplissage ; il ne
 *   comprend pas une interaction de règles. Sa précision mesurée est écrite
 *   dans card-quality-model.json (`auc`) ;
 * - il est appris sur le DUEL. En multijoueur il n'est qu'un repli, quand la
 *   carte n'a pas de rang EDHREC (carte trop récente) ;
 * - une note basse ne dit pas « mauvaise carte dans l'absolu » mais « rien
 *   n'indique qu'elle soit forte ». Une vraie synergie peut la justifier :
 *   c'est le rôle du plan de jeu (game-plan.ts), pas de cette note.
 */

export type QualityBasis = "tournoi" | "popularité" | "texte";

export interface CardQuality {
  /** 0-10. Repères : 8+ carte de tout premier plan, 6 solide, 4,5 jouable, < 3,5 remplissage. */
  score: number;
  basis: QualityBasis;
  /** Estimation du seul modèle « texte » (0-10), toujours calculée : sert de repli et de garde-fou. */
  textScore: number;
  /** Carte sans métier reconnu (voir hasNoJob). Absent = non calculé (terrains, cartes notées à la main). */
  noJob?: boolean;
}

const EVERGREEN = ["flying", "haste", "deathtouch", "lifelink", "trample", "menace", "first strike", "double strike", "vigilance", "reach", "hexproof", "ward", "indestructible", "flash", "prowess"] as const;

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, x: 3 };

function stripReminder(text: string): string {
  return text.replace(/\([^)]*\)/g, " ");
}

const LAND_TO_BATTLEFIELD = /search your library for [^.]*(land|plains|island|swamp|mountain|forest)[^.]*(onto|on) the battlefield/i;
const RITUAL = /\badd (\{[wubrgc]\}){2,}|\badd (two|three|four|five|x) mana/i;

/**
 * Vraie accélération de mana : la carte rend PLUS de mana qu'elle n'en coûte,
 * de façon répétée ou immédiate. Écarte les filtres (« {1}, {T}, sacrifice :
 * ajoutez un mana » — Chromatic Star) et les Trésors conditionnels, que le
 * pilier « rampe » de deck-score.ts compte par leur texte de rappel.
 * Utilisée par le signal « mana rapide » du tier (deck-tier.ts).
 */
export function isRealAcceleration(card: ScryfallCard): boolean {
  const typeLine = (card.type_line ?? "").split(" // ")[0];
  if (typeLine.includes("Land")) return false;
  const text = stripReminder(getDisplayOracleText(card).split("\n//\n")[0]);
  const lines = text.split("\n");
  // Rocher / créature à mana : une ligne « {T}: Add ... » sans coût de mana ni sacrifice.
  const freeTap = lines.some((l) => /\{t\}: add /i.test(l) && !/(\{\d+\}|\{[wubrgc]\}|sacrifice|discard|pay \d+ life)[^:]*:/i.test(l));
  if (freeTap) return true;
  // Usage unique gratuit (Lotus Petal) : seulement si la carte ne coûte rien.
  if ((card.cmc ?? 0) === 0 && /sacrifice [^:]*: add /i.test(text)) return true;
  if (LAND_TO_BATTLEFIELD.test(text)) return true;
  if (/play (an|two) additional lands?/i.test(text)) return true;
  const isSpell = typeLine.includes("Instant") || typeLine.includes("Sorcery");
  if (isSpell && RITUAL.test(text)) return true;
  return false;
}

/**
 * Descripteurs d'une carte pour le modèle « texte ». Valeurs 0/1 ou petites
 * valeurs numériques bornées. Les noms sont les clés des coefficients de
 * card-quality-model.json : en ajouter ou en renommer impose de relancer
 * l'apprentissage (un descripteur inconnu du modèle est simplement ignoré).
 */
export function qualityFeatures(card: ScryfallCard, categories: readonly DeckCategory[]): Record<string, number> {
  const f: Record<string, number> = {};
  const set = (k: string, v: number | boolean = 1) => {
    const n = typeof v === "boolean" ? (v ? 1 : 0) : v;
    if (n !== 0) f[k] = n;
  };
  const typeFull = card.type_line ?? "";
  const type = typeFull.split(" // ")[0];
  const text = stripReminder(getDisplayOracleText(card));
  const lower = text.toLowerCase();
  const kw = new Set((card.keywords ?? []).map((k) => k.toLowerCase()));
  const cmc = Math.round(card.cmc ?? 0);
  const cost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? "";
  const isCreature = type.includes("Creature");
  const isInstant = type.includes("Instant");
  const isSorcery = type.includes("Sorcery");
  const isAura = type.includes("Aura");
  const isEquipment = type.includes("Equipment");
  const has = (c: DeckCategory) => categories.includes(c);

  // --- Type ---
  set("creature", isCreature);
  set("instant", isInstant);
  set("sorcery", isSorcery);
  set("artifact", type.includes("Artifact") && !isCreature && !isEquipment);
  set("enchantment", type.includes("Enchantment") && !isCreature && !isAura);
  set("aura", isAura);
  set("equipment", isEquipment);
  set("planeswalker", type.includes("Planeswalker"));
  set("legendary", type.includes("Legendary"));
  set("vehicle", type.includes("Vehicle"));
  set("saga", type.includes("Saga"));
  set("twoInOne", ["adventure", "modal_dfc", "split", "prepare", "transform"].includes(card.layout ?? "") && (card.card_faces?.length ?? 0) > 1);

  // --- Coût ---
  set(`cmc${Math.min(cmc, 7)}`);
  const pips = (cost.match(/\{[WUBRG]\}/g) ?? []).length;
  set("pips3", pips >= 3);
  set("multicolor", new Set((cost.match(/\{([WUBRG])\}/g) ?? [])).size >= 2);
  set("xCost", cost.includes("{X}"));
  const flash = isInstant || kw.has("flash");
  set("instantSpeed", flash);

  // --- Rôles, croisés avec le coût ---
  // Contresort « large » seulement ; l'étroit (Avoid Fate : ne contre que ce
  // qui cible vos permanents) a son propre descripteur (04/10/2026).
  const counterKind = counterspellKind(text);
  const counter = counterKind === "large";
  set("counter", counter);
  set("counterNarrow", counterKind === "étroit");
  set("counterCheap", counter && cmc <= 2);
  set("counterSoft", counter && /unless (its|that spell's|that player|they)/i.test(text));
  const removal = has("removal");
  const bounceOnly = removal && !/destroy|exile|damage|-\d+\/-\d+|-x\/-x|fights?|counters? on/i.test(text) && /owner's hand/i.test(text);
  set("removal", removal);
  set("removalCheap", removal && cmc <= 2);
  set("removalInstant", removal && flash);
  set("removalExile", removal && /exile (up to (one|two) )?target/i.test(text));
  set("removalDestroy", removal && /destroy (up to (one|two) )?target/i.test(text));
  set("removalDamage", removal && /deals? (\d+|x) damage to (any target|target)/i.test(text));
  set("removalBounce", bounceOnly);
  set("removalFight", removal && /fights?|damage equal to its power/i.test(text));
  set("removalOnBody", removal && isCreature);
  set("wipe", has("wipe"));
  set("wipeCheap", has("wipe") && cmc <= 4);
  set("wipeOneSided", has("wipe") && /(you don't control|opponents? controls?)/i.test(text));
  const drawMatch = lower.match(/draws? (a|an|one|two|three|four|five|six|seven|x) (additional )?cards?/);
  const drawN = drawMatch ? (NUM_WORDS[drawMatch[1]] ?? 1) : 0;
  const realDraw = drawN > 0 || /draw cards equal/i.test(text);
  set("draw", realDraw);
  set("draw2plus", drawN >= 2);
  set("drawRepeat", realDraw && /(whenever|at the beginning of)[^.]*draw/i.test(text));
  set("drawCheap", realDraw && cmc <= 2);
  set("selection", /\b(scry|surveil) \d|look at the top/i.test(text));
  set("loot", /draw[^.]*then discard|discard[^.]*then draw/i.test(text));
  const accel = isRealAcceleration(card);
  set("accel", accel);
  set("accelCheap", accel && cmc <= 2);
  set("rampOther", has("ramp") && !accel);
  set("treasure", /create [^.]*treasure/i.test(text));
  set("tutor", has("tutor"));
  set("tutorCheap", has("tutor") && cmc <= 2);
  set("tutorAny", /search your library for a card[, ]/i.test(text));
  set("tutorToPlay", has("tutor") && /onto the battlefield/i.test(text));
  set("protection", has("protection") && !counter);
  set("disruption", has("disruption"));
  set("discardPick", /reveals their hand\. you choose/i.test(text));
  set("taxEffect", /costs? \{?\d+\}? more|can't cast|can't untap/i.test(text));
  set("finisher", has("finisher"));
  set("recursion", /return [^.]*from your graveyard to your hand/i.test(text));
  set("reanimate", /from (your|a) graveyard (on)?to the battlefield/i.test(text));
  set("tokens", /create [^.]*creature tokens?/i.test(text));
  set("tokensMany", /create (two|three|four|five|x|that many) [^.]*creature tokens?/i.test(text));
  set("free", /without paying (its|their) mana cost|rather than pay (this spell's|its) mana cost|costs? \{\d+\} less|costs? \{[wubrgx]\} less/i.test(text) || ["affinity", "delve", "convoke", "improvise"].some((k) => kw.has(k)));
  set("extraTurn", /take an extra turn/i.test(text));
  set("modal", /choose (one|two|one or both|one or more) —/i.test(text));
  set("cantripRider", !isCreature && cmc <= 3 && /\ndraw a card\.?$|\. draw a card\./i.test(text));
  set("manaSink", /\{x\}/i.test(text) && !cost.includes("{X}"));
  set("anthem", /creatures you control get \+/i.test(text));
  set("stealOrCopy", /gain control of target|copy (of )?target|becomes? a copy/i.test(text));
  set("landDestruction", /destroy (target|all) (nonbasic )?lands?/i.test(text));
  set("graveHate", /exile (all cards from )?(target player's|each opponent's|all) graveyards?|exile target card from a graveyard/i.test(text));

  // --- Marqueurs de carte de remplissage ---
  const noRole = !removal && !counter && !realDraw && !accel && !has("tutor") && !has("wipe") && !has("disruption");
  set("lifegainOnly", noRole && !isCreature && /you gain (\d+|x) life/i.test(text) && text.length < 140);
  set("trickOnly", noRole && isInstant && /target creature (you control )?gets \+/i.test(text));
  set("auraPump", isAura && /enchanted creature gets \+/i.test(text) && noRole);
  set("equipPump", isEquipment && noRole);
  set("downside", /enters tapped|can't block|sacrifice (it|this creature|this permanent) unless|\becho\b|cumulative upkeep|\bdefender\b|skip your|at the beginning of your upkeep, sacrifice/i.test(text));
  set("spellNoRole", (isInstant || isSorcery) && noRole && !has("protection"));
  // Permanent non-créature sans métier reconnu (Library of Leng : 1 mana, ne
  // fait rien d'utile seule) — le coût bas ne doit pas suffire à bien la noter.
  set("permanentNoRole", !isCreature && !isInstant && !isSorcery && !type.includes("Planeswalker") && noRole && !has("protection") && !has("ramp") && !has("finisher"));

  // --- Créatures ---
  if (isCreature) {
    const p = Number.parseInt(card.power ?? card.card_faces?.[0]?.power ?? "", 10);
    const t = Number.parseInt(card.toughness ?? card.card_faces?.[0]?.toughness ?? "", 10);
    if (Number.isFinite(p) && Number.isFinite(t)) {
      const rate = (p + t - 2 * cmc) / 4; // 0 = « 2/2 pour 2 », positif = au-dessus de la courbe
      set("bodyRate", Math.max(-1.5, Math.min(1.5, rate)));
      set("powerOverCost", p > cmc);
      set("power4", p >= 4);
    }
    let ev = 0;
    for (const k of EVERGREEN) if (kw.has(k) || new RegExp(`\\b${k}\\b`, "i").test(text)) ev++;
    set("evergreen", Math.min(3, ev) / 3);
    set("evasion", kw.has("flying") || kw.has("menace") || /can't be blocked/i.test(text));
    set("hasteCreature", kw.has("haste"));
    set("etb", /when (this creature|[^.,\n]{2,40}) enters/i.test(text));
    set("dies", /when (this creature|[^.,\n]{2,40}) dies/i.test(text));
    set("attackTrigger", /whenever (this creature|[^.,\n]{2,40}) attacks/i.test(text));
    set("damageTrigger", /deals combat damage to a player/i.test(text));
    set("manaDork", accel);
    const abilityLines = text.split("\n").filter((l) => l.trim().length > 25).length;
    set("vanilla", abilityLines === 0);
    set("creatureCheap", cmc <= 2);
    set("creatureBig", cmc >= 6);
    set("activated", /\{[^}]+\}[^.\n]*:/.test(text) && !accel);
  }
  set("textLen", Math.min(1, text.length / 400));
  // Rareté de l'impression renvoyée par Scryfall (absente = non renseignée).
  if (card.rarity === "common") set("common");
  else if (card.rarity === "uncommon") set("uncommon");
  else if (card.rarity === "rare") set("rare");
  else if (card.rarity === "mythic") set("mythic");
  return f;
}

interface QualityModel {
  intercept: number;
  weights: Record<string, number>;
  /** Scores (probabilités) aux déciles de l'échantillon d'entraînement, pour étaler la note sur 0-10. */
  quantiles: number[];
  auc?: number;
}

const MODEL = model as QualityModel;

/** Probabilité (0-1) estimée par le modèle « texte » : « cette carte a le profil d'une carte jouée en tournoi ». */
export function textProbability(features: Record<string, number>): number {
  let z = MODEL.intercept;
  for (const [k, v] of Object.entries(features)) z += (MODEL.weights[k] ?? 0) * v;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Probabilité → note 0-10 par les quantiles de l'échantillon d'entraînement
 * (interpolation linéaire) : 5 = carte médiane de l'échantillon, 9 = dans le
 * dernier décile. Sans modèle chargé (fichier vide), renvoie 4,5 (neutre).
 */
function probabilityToScore(p: number): number {
  const q = MODEL.quantiles;
  if (!q || q.length < 2) return 4.5;
  if (p <= q[0]) return 0;
  for (let i = 1; i < q.length; i++) {
    if (p <= q[i]) {
      const span = q[i] - q[i - 1] || 1;
      return ((i - 1 + (p - q[i - 1]) / span) / (q.length - 1)) * 10;
    }
  }
  return 10;
}

export function textQuality(card: ScryfallCard, categories: readonly DeckCategory[]): number {
  return probabilityToScore(textProbability(qualityFeatures(card, categories)));
}

/**
 * Carte SANS MÉTIER reconnu (04/10/2026, retour de Ben : Library of Leng
 * entrait dans ses decks) : ni créature, ni arpenteur, ni réponse, ni
 * contresort, ni pioche, ni accélération, ni tuteur, ni balayage, ni
 * protection, ni finisseur. Le modèle « texte » note surtout le coût et la
 * rareté : il donnait 9,2/10 à un artefact à 1 mana qui ne fait rien seul.
 * Une telle carte, si les tournois ne la jouent pas, est plafonnée
 * (NO_JOB_CAP) : elle ne peut entrer que portée par le plan de jeu.
 */
export function hasNoJob(features: Record<string, number>): boolean {
  return Boolean(features.permanentNoRole || features.spellNoRole);
}

/**
 * Plafond d'une carte sans métier jamais vue en tournoi. Plus haut pour une
 * carte d'extension récente : les tournois n'ont pas encore eu le temps de la
 * juger, son absence ne prouve rien. Choix de conception, pas une mesure.
 */
const NO_JOB_CAP = 3.5;
const NO_JOB_CAP_RECENT = 4.5;

/** Présence en tournoi (0-1) → note. 2 % ≈ 6,1 ; 10 % ≈ 7,3 ; 40 % ≈ 9 ; 80 %+ ≈ 10. */
function presenceScore(p: number): number {
  return Math.min(10, 5.5 + 4.5 * Math.pow(Math.min(1, p / 0.8), 0.45));
}

/** Rang EDHREC → note. 1 → 10 ; 100 → 8 ; 1 000 → 6,3 ; 5 000 → 4,9 ; 20 000 → 3,5. */
function rankScore(rank: number): number {
  return Math.max(2.5, Math.min(10, 10.2 - 0.75 * Math.pow(Math.log10(Math.max(1, rank)), 1.5)));
}

export interface QualityContext {
  mode: "multi" | "duel";
  /** Part des decks de tournoi Duel qui la jouent, à couleurs égales (0 si jamais vue). */
  duelPresence: number;
  /** Carte d'une extension trop récente pour figurer dans les données de tournoi ou de popularité. */
  recent?: boolean;
}

/**
 * Note d'une carte JAMAIS vue en tournoi Duel alors qu'elle est ancienne :
 * les joueurs de tournoi ont accès à tout ; s'ils ne la jouent pas, rien
 * n'autorise à la noter au niveau d'une carte qu'ils jouent (≥ 5,9). Le
 * modèle « texte » garde son ORDRE (une réponse à 1 mana reste devant un
 * 2/2 sans texte), comprimé entre 1 et 5,8. Choix de conception, pas une
 * mesure.
 */
function unseenScore(textScore: number): number {
  return Math.min(5.8, 1 + textScore * 0.5);
}

/**
 * `known` : note « texte » et marqueur « sans métier » déjà calculés pour
 * cette carte (ils ne dépendent ni du deck ni des couleurs) — le constructeur
 * les calcule une fois par carte, puis ne refait que la partie « présence
 * en tournoi », qui dépend des couleurs du deck.
 */
export function cardQuality(card: ScryfallCard, categories: readonly DeckCategory[], ctx: QualityContext, known?: Pick<CardQuality, "textScore" | "noJob">): CardQuality {
  let textScore = known?.textScore;
  let noJob = known?.noJob;
  if (textScore === undefined || noJob === undefined) {
    const features = qualityFeatures(card, categories);
    textScore ??= probabilityToScore(textProbability(features));
    noJob ??= hasNoJob(features);
  }
  const rank = typeof card.edhrec_rank === "number" && card.edhrec_rank > 0 ? card.edhrec_rank : null;
  const cap = (score: number) => (noJob ? Math.min(score, ctx.recent ? NO_JOB_CAP_RECENT : NO_JOB_CAP) : score);
  if (ctx.mode === "duel") {
    if (ctx.duelPresence > 0) {
      return { score: Math.max(presenceScore(ctx.duelPresence), unseenScore(cap(textScore))), basis: "tournoi", textScore, noJob };
    }
    // Extension trop récente pour figurer dans les données : le texte décide, sans le plafond des cartes anciennes.
    if (ctx.recent) return { score: cap(Math.min(7, 1.5 + textScore * 0.6)), basis: "texte", textScore, noJob };
    return { score: cap(unseenScore(textScore)), basis: "texte", textScore, noJob };
  }
  if (card.game_changer === true) return { score: 10, basis: "popularité", textScore, noJob };
  if (rank) return { score: 0.75 * rankScore(rank) + 0.25 * textScore, basis: "popularité", textScore, noJob };
  return { score: cap(Math.min(textScore, ctx.recent ? 7.5 : 6.5)), basis: "texte", textScore, noJob };
}

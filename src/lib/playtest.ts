import type { DeckCategory, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";

/**
 * PLAYTEST : parties simulées en solitaire (03/10/2026, demande de Ben :
 * « en faisant des playtests et des game plans afin de maximiser les chances
 * de victoire »).
 *
 * Ce que c'est : un « goldfish » de Monte-Carlo. Le deck joue seul des
 * centaines de parties — mulligans, un terrain par tour, paiement du mana
 * avec les bonnes couleurs, accélérateurs, pioche, commandant, attaque — et
 * on mesure ce qui se mesure sans adversaire :
 * - RÉGULARITÉ : mains gardées, pannes de terrains, engorgements, sorts
 *   bloqués faute de la bonne couleur ;
 * - TEMPO : part du mana réellement dépensée, tour où sort le commandant ;
 * - HORLOGE : tour où les blessures cumulées atteignent le total de points
 *   de vie d'un adversaire, ou tour où une combo connue est réunie ;
 * - RÉPONSES : part des parties avec une interaction jouable dans les trois
 *   premiers tours.
 *
 * Ce que ce N'EST PAS : un taux de victoire. Aucun adversaire ne joue en
 * face — pas de blocage, pas de removal subi, pas de course. Deux decks au
 * même indice ne sont pas « à égalité » contre un vrai joueur. L'indice sert
 * à comparer des VARIANTES d'un même deck (plus de terrains ? courbe plus
 * basse ? autre plan ?) et à repérer une base de mana fragile, pas à
 * prédire un résultat de tournoi.
 *
 * Simplifications assumées (chacune tire l'indice dans un sens connu) :
 * - les sorts de réponse (removal, contresorts, défausse) ne sont pas
 *   lancés : ils restent en main, et le mana « gardé pour répondre » compte
 *   comme utilisé — sinon un deck de contrôle paraîtrait inefficace ;
 * - une créature attaque dès qu'elle le peut et touche toujours : l'horloge
 *   est une borne BASSE (aucun bloqueur) ;
 * - les rituels (Dark Ritual...) et les capacités activées ne sont pas
 *   modélisés ; un tutor va chercher une pièce de combo manquante, sinon la
 *   meilleure menace ;
 * - le mana hybride est compté comme générique ; la taxe de commandant
 *   n'existe pas (personne ne le tue).
 *
 * Tirages reproductibles : le générateur est initialisé par une graine, la
 * même liste donne toujours le même rapport, et deux variantes comparées
 * avec la même graine reçoivent les mêmes mélanges autant que possible.
 */

const COLOR_BIT: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16 };
const ALL_COLORS = 31;

export type SimKind = "land" | "rock" | "dork" | "landRamp" | "tutor" | "draw" | "creature" | "other" | "reactive";

export interface SimCard {
  name: string;
  kind: SimKind;
  cmc: number;
  /** Symboles colorés du coût : W, U, B, R, G. */
  pips: [number, number, number, number, number];
  /** Couleurs produites (terrain, artefact de mana, créature de mana). 0 = incolore seulement. */
  mask: number;
  /** Mana produit par activation. */
  amount: number;
  entersTapped: boolean;
  /** Cartes piochées quand le sort est lancé. */
  drawNow: number;
  /** Cartes piochées par tour ensuite (moteur de pioche). */
  drawEngine: number;
  power: number;
  haste: boolean;
  /** Réponse (removal, contresort, défausse) : gardée en main. */
  interaction: boolean;
  /** Indices des combos dont la carte est une pièce. */
  combos: number[];
}

const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, x: 2 };
const ENTERS_TAPPED = /enters (the battlefield )?tapped/i;
const CONDITIONAL_TAPPED = /unless|you may pay|if you control|if it's not your turn|as .* enters, you may/i;

function parsePips(cost: string): { pips: [number, number, number, number, number] } {
  const pips: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
    const s = m[1];
    // Hybride / phyrexian : payable autrement, compté comme générique.
    if (s.length === 1 && COLOR_BIT[s]) pips["WUBRG".indexOf(s)]++;
  }
  return { pips };
}

function maskOf(colors: readonly string[] | null | undefined): number {
  let m = 0;
  for (const c of colors ?? []) m |= COLOR_BIT[c] ?? 0;
  return m;
}

/**
 * Traduit une carte en ce que le simulateur sait jouer. `categories` =
 * classifyCard(card) ; `identityMask` = couleurs du deck (un fetchland
 * trouve n'importe laquelle).
 */
export function toSimCard(card: ScryfallCard, categories: readonly DeckCategory[], identityMask: number): SimCard {
  const text = getDisplayOracleText(card);
  const front = text.split("\n//\n")[0];
  const typeLine = (card.type_line ?? "").split(" // ")[0];
  const cost = (card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? "").split(" // ")[0];
  const { pips } = parsePips(cost);
  const base: SimCard = {
    name: card.name,
    kind: "other",
    cmc: Math.round(card.cmc ?? 0),
    pips,
    mask: 0,
    amount: 1,
    entersTapped: false,
    drawNow: 0,
    drawEngine: 0,
    power: 0,
    haste: false,
    interaction: false,
    combos: [],
  };
  const produced = maskOf(card.produced_mana);
  const producesAny = (card.produced_mana ?? []).length > 0;

  if (typeLine.includes("Land")) {
    base.kind = "land";
    base.cmc = 0;
    const fetch = /search your library for an? [^.]*(land|plains|island|swamp|mountain|forest)/i.test(front);
    base.mask = produced || (fetch ? identityMask : 0);
    base.amount = /add \{c\}\{c\}/i.test(front) ? 2 : 1;
    base.entersTapped = ENTERS_TAPPED.test(front) && !CONDITIONAL_TAPPED.test(front);
    return base;
  }

  const isCreature = typeLine.includes("Creature");
  const isPermanent = isCreature || /Artifact|Enchantment|Planeswalker|Battle/.test(typeLine);
  const power = Number.parseInt(card.power ?? card.card_faces?.[0]?.power ?? "", 10);
  base.power = isCreature && Number.isFinite(power) ? Math.max(0, power) : 0;
  base.haste = (card.keywords ?? []).some((k) => k.toLowerCase() === "haste");
  const counter = /counter target [^.]*spell/i.test(front);
  base.interaction = categories.includes("removal") || categories.includes("disruption") || categories.includes("wipe") || counter;

  // Pioche : nombre de cartes à la résolution, moteur si l'effet se répète.
  const draw = front.match(/draws? (a|an|one|two|three|four|five|six|seven|x|\d+)( additional)? cards?/i);
  if (draw) {
    const n = WORD_NUM[draw[1].toLowerCase()] ?? Number.parseInt(draw[1], 10) ?? 1;
    const repeats = isPermanent && /(whenever|at the beginning of)[^.]*draws? (a|an|one|two|three) /i.test(front);
    if (repeats) base.drawEngine = 1;
    else base.drawNow = Math.min(4, Number.isFinite(n) ? n : 1);
  }

  const manaAbility = producesAny && /(\{t\}[^.]*: add|: add )/i.test(front);
  if (isPermanent && manaAbility && categories.includes("ramp")) {
    base.kind = isCreature ? "dork" : "rock";
    base.mask = produced;
    const add = front.match(/add ((?:\{[^}]+\})+)/i);
    base.amount = add ? Math.min(3, (add[1].match(/\{/g) ?? []).length) : 1;
    return base;
  }
  if (/search your library for [^.]*(land|plains|island|swamp|mountain|forest)[^.]*onto the battlefield/i.test(front)) {
    base.kind = "landRamp";
    return base;
  }
  // Réponse pure (non-créature) : gardée en main. Une créature qui détruit
  // en arrivant est jouée comme une créature.
  if (base.interaction && !isCreature && !typeLine.includes("Planeswalker")) {
    base.kind = "reactive";
    return base;
  }
  if (categories.includes("tutor")) base.kind = "tutor";
  else if (isCreature) base.kind = "creature";
  else if (base.drawNow > 0 || base.drawEngine > 0) base.kind = "draw";
  return base;
}

export interface PlaytestDeck {
  /** Les cartes du deck hors commandant(s), une entrée par exemplaire. */
  cards: SimCard[];
  commanders: SimCard[];
  /** Nombre de pièces de chaque combo (les cartes portent l'indice dans `combos`). */
  comboSizes: number[];
}

export interface PlaytestOptions {
  mode: "multi" | "duel";
  games?: number;
  seed?: number;
  turns?: number;
}

export interface PlaytestReport {
  games: number;
  /** Part des parties où la main de 7 est gardée. */
  keep7: number;
  avgMulligans: number;
  /** Moins de 3 terrains en jeu à la fin du tour 3. */
  manaScrew: number;
  /** 9 terrains ou plus parmi les cartes vues à la fin du tour 6 (environ 15 cartes : plus de la moitié). */
  manaFlood: number;
  /** Part des tours 2 à 5 où un sort était payable en quantité mais pas dans les bonnes couleurs. */
  colorScrew: number;
  /** Mana dépensé (ou gardé pour une réponse) / mana disponible, tours 1 à 6. */
  manaEfficiency: number;
  /** Tour moyen de sortie du commandant (parties où il sort). */
  commanderTurn: number | null;
  /** Part des parties où le commandant sort au tour égal à son coût, ou avant. */
  commanderOnCurve: number;
  /** Cartes vues à la fin du tour 6 (main de départ comprise). */
  cardsSeenT6: number;
  /** Blessures cumulées infligées à la fin du tour 6. */
  damageT6: number;
  /** Tour médian où les blessures cumulées atteignent `lifeTarget` (turns+1 si jamais). */
  killTurn: number;
  lifeTarget: number;
  /** Part des parties où une combo connue est réunie au tour 6 / au dernier tour simulé. null si le deck n'a pas de combo. */
  comboByT6: number | null;
  comboByEnd: number | null;
  /** Part des parties avec une réponse jouable en main dans les 3 premiers tours. */
  interactionByT3: number;
  /** Indice 0-100 et ses quatre composantes (0-1). */
  score: number;
  parts: { consistency: number; tempo: number; clock: number; interaction: number };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function popcount5(m: number): number {
  let c = 0;
  for (let b = 1; b <= 16; b <<= 1) if (m & b) c++;
  return c;
}

/** Une unité de mana disponible ce tour : masque de couleurs (0 = incolore). */
type Pool = number[];

/**
 * Peut-on payer `card` avec `pool` ? Affectation gloutonne : chaque symbole
 * coloré prend l'unité qui le produit ET qui a le moins d'autres usages.
 * Renvoie les indices consommés, ou null. `colorOnly` : si la quantité
 * suffit mais pas les couleurs, on le signale (panne de couleur).
 */
function pay(card: SimCard, pool: Pool): number[] | null {
  if (pool.length < card.cmc) return null;
  const used: number[] = [];
  const taken = new Array<boolean>(pool.length).fill(false);
  for (let c = 0; c < 5; c++) {
    const bit = 1 << c;
    for (let n = 0; n < card.pips[c]; n++) {
      let best = -1;
      let bestFlex = 99;
      for (let i = 0; i < pool.length; i++) {
        if (taken[i] || !(pool[i] & bit)) continue;
        const flex = popcount5(pool[i]);
        if (flex < bestFlex) {
          bestFlex = flex;
          best = i;
        }
      }
      if (best < 0) return null;
      taken[best] = true;
      used.push(best);
    }
  }
  let generic = card.cmc - used.length;
  // Le générique prend d'abord l'incolore, puis les unités les moins flexibles.
  const rest: number[] = [];
  for (let i = 0; i < pool.length; i++) if (!taken[i]) rest.push(i);
  rest.sort((a, b) => popcount5(pool[a]) - popcount5(pool[b]));
  for (const i of rest) {
    if (generic <= 0) break;
    used.push(i);
    generic--;
  }
  return generic > 0 ? null : used;
}

function removeUnits(pool: Pool, used: number[]): void {
  used.sort((a, b) => b - a);
  for (const i of used) pool.splice(i, 1);
}

interface Source {
  mask: number;
  amount: number;
  /** Tour à partir duquel la source produit (terrain engagé, mal d'invocation). */
  readyTurn: number;
}

const PRIORITY: Record<SimKind, number> = { land: 0, rock: 90, dork: 90, landRamp: 85, tutor: 60, draw: 65, creature: 50, other: 40, reactive: -1 };

/** Garde-t-on cette main ? Règles simples, proches de ce qu'un joueur applique. */
function keepHand(hand: SimCard[], size: number): boolean {
  if (size <= 5) return true;
  let lands = 0;
  let cheap = 0;
  for (const c of hand) {
    if (c.kind === "land") lands++;
    else if (c.cmc <= 2) cheap++;
  }
  if (size === 7) return lands >= 2 && lands <= 5 && (lands >= 3 || cheap >= 2);
  return lands >= 2 && lands <= 4;
}

export function runPlaytest(deck: PlaytestDeck, options: PlaytestOptions): PlaytestReport {
  const games = options.games ?? 300;
  const turns = options.turns ?? 10;
  const duel = options.mode === "duel";
  const lifeTarget = duel ? 20 : 40;
  const rnd = mulberry32(options.seed ?? 20261003);
  const n = deck.cards.length;
  const hasCombo = deck.comboSizes.length > 0;
  const commanderCmc = deck.commanders.length ? Math.max(...deck.commanders.map((c) => c.cmc)) : 0;

  let keep7 = 0;
  let mulligans = 0;
  let screw = 0;
  let flood = 0;
  let colorScrewTurns = 0;
  let colorScrewDenom = 0;
  let spent = 0;
  let available = 0;
  let cmdTurnSum = 0;
  let cmdGames = 0;
  let cmdOnCurve = 0;
  let seenT6 = 0;
  let dmgT6 = 0;
  const killTurns: number[] = [];
  let comboT6 = 0;
  let comboEnd = 0;
  let interT3 = 0;

  const order = new Array<number>(n);
  for (let g = 0; g < games; g++) {
    // --- Mulligan de Londres (1er gratuit en multijoueur) ---
    let handSize = 7;
    let free = !duel;
    let mulled = false;
    let library: SimCard[] = [];
    let hand: SimCard[] = [];
    for (;;) {
      for (let i = 0; i < n; i++) order[i] = i;
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
      }
      library = order.map((i) => deck.cards[i]);
      hand = library.splice(0, 7);
      if (keepHand(hand, handSize)) break;
      mulligans++;
      mulled = true;
      if (free) free = false;
      else handSize--;
    }
    if (!mulled) keep7++;
    // Cartes à remettre dessous : terrains en trop, sinon les plus chères.
    while (hand.length > handSize) {
      const lands = hand.filter((c) => c.kind === "land").length;
      let idx = -1;
      if (lands > 4) idx = hand.findIndex((c) => c.kind === "land");
      if (idx < 0) {
        let worst = -1;
        hand.forEach((c, i) => {
          if (c.kind !== "land" && c.cmc > worst) {
            worst = c.cmc;
            idx = i;
          }
        });
      }
      if (idx < 0) idx = 0;
      library.push(hand.splice(idx, 1)[0]);
    }

    const onPlay = duel && rnd() < 0.5;
    const sources: Source[] = [];
    let landsInPlay = 0;
    const attackers: { power: number; readyTurn: number }[] = [];
    let engines = 0;
    let damage = 0;
    let kill = turns + 1;
    let landsSeen = hand.filter((c) => c.kind === "land").length;
    let cardsSeen = hand.length;
    const cmdLeft = [...deck.commanders];
    let cmdTurn = 0;
    const comboHave = deck.comboSizes.map(() => 0);
    let comboTurn = 0;
    let hadInteraction = false;
    for (const c of deck.commanders) for (const k of c.combos) comboHave[k]++;

    const drawCards = (count: number) => {
      for (let i = 0; i < count && library.length; i++) {
        const c = library.shift()!;
        hand.push(c);
        cardsSeen++;
        if (c.kind === "land") landsSeen++;
      }
    };

    for (let turn = 1; turn <= turns; turn++) {
      if (!(turn === 1 && onPlay)) drawCards(1);
      if (engines > 0) drawCards(engines);

      // Mana déjà en jeu ce tour.
      const pool: Pool = [];
      for (const s of sources) if (s.readyTurn <= turn) for (let k = 0; k < s.amount; k++) pool.push(s.mask);

      // --- Terrain du tour ---
      const landIdx: number[] = [];
      hand.forEach((c, i) => c.kind === "land" && landIdx.push(i));
      if (landIdx.length) {
        // Couleurs dont la main a besoin et que les sources ne donnent pas encore.
        let have = 0;
        for (const s of sources) have |= s.mask;
        let need = 0;
        for (const c of hand) if (c.kind !== "land") for (let k = 0; k < 5; k++) if (c.pips[k]) need |= 1 << k;
        for (const c of cmdLeft) for (let k = 0; k < 5; k++) if (c.pips[k]) need |= 1 << k;
        const missing = need & ~have;
        // Un terrain dégagé ne vaut mieux qu'un engagé que s'il permet de lancer quelque chose maintenant.
        const playable = (extra: number) =>
          hand.some((c) => c.kind !== "land" && c.kind !== "reactive" && c.cmc === pool.length + extra && c.cmc > 0) ||
          cmdLeft.some((c) => c.cmc === pool.length + extra);
        let best = landIdx[0];
        let bestScore = -Infinity;
        for (const i of landIdx) {
          const l = hand[i];
          let s = popcount5(l.mask & missing) * 3 + popcount5(l.mask) * 0.2;
          if (l.entersTapped) s += playable(l.amount) ? -2 : 1;
          if (s > bestScore) {
            bestScore = s;
            best = i;
          }
        }
        const land = hand.splice(best, 1)[0];
        landsInPlay++;
        sources.push({ mask: land.mask, amount: land.amount, readyTurn: land.entersTapped ? turn + 1 : turn });
        if (!land.entersTapped) for (let k = 0; k < land.amount; k++) pool.push(land.mask);
      }

      const manaThisTurn = pool.length;
      const fullPool = pool.slice();

      // --- Lancer les sorts, les plus prioritaires d'abord ---
      let colorBlocked = false;
      for (;;) {
        const sel: { card: SimCard | null; idx: number; cmd: number; used: number[] | null; prio: number } = {
          card: null,
          idx: -1,
          cmd: -1,
          used: null,
          prio: -1,
        };
        const consider = (c: SimCard, prio: number, idx: number, cmd: number) => {
          if (prio <= sel.prio) return;
          if (c.cmc > pool.length) return;
          const used = pay(c, pool);
          if (!used) {
            colorBlocked = true;
            return;
          }
          sel.card = c;
          sel.idx = idx;
          sel.cmd = cmd;
          sel.used = used;
          sel.prio = prio;
        };
        cmdLeft.forEach((c, i) => consider(c, 80, -1, i));
        for (let i = 0; i < hand.length; i++) {
          const c = hand[i];
          if (c.kind === "land" || c.kind === "reactive") continue;
          // Accélération d'abord dans les premiers tours ; ensuite on préfère dépenser le plus de mana possible.
          let prio = PRIORITY[c.kind] + c.cmc * 0.5;
          if ((c.kind === "rock" || c.kind === "dork" || c.kind === "landRamp") && turn > 4) prio = 30;
          if (c.kind === "tutor" && !hasCombo) prio = 35;
          if (c.drawEngine) prio += 20;
          consider(c, prio, i, -1);
        }
        if (!sel.card || !sel.used) break;
        const pickIdx = sel.idx;
        const pickCmd = sel.cmd;
        const pickUsed = sel.used;
        const card: SimCard = sel.card;
        removeUnits(pool, pickUsed);
        if (pickCmd >= 0) {
          cmdLeft.splice(pickCmd, 1);
          if (!cmdTurn && cmdLeft.length === 0) cmdTurn = turn;
        } else {
          hand.splice(pickIdx, 1);
          for (const k of card.combos) comboHave[k]++;
        }
        if (card.kind === "rock") {
          sources.push({ mask: card.mask, amount: card.amount, readyTurn: turn });
          for (let k = 0; k < card.amount; k++) pool.push(card.mask);
        } else if (card.kind === "dork") {
          sources.push({ mask: card.mask, amount: card.amount, readyTurn: card.haste ? turn : turn + 1 });
        } else if (card.kind === "landRamp") {
          landsInPlay++;
          sources.push({ mask: ALL_COLORS, amount: 1, readyTurn: turn + 1 });
        } else if (card.kind === "tutor") {
          // Va chercher une pièce de la combo la plus avancée, sinon la plus grosse menace.
          let target = -1;
          if (hasCombo) {
            let bestK = -1;
            let bestMissing = 99;
            comboHave.forEach((h, k) => {
              const missing = deck.comboSizes[k] - h;
              if (missing > 0 && missing < bestMissing) {
                bestMissing = missing;
                bestK = k;
              }
            });
            if (bestK >= 0) target = library.findIndex((c) => c.combos.includes(bestK) && !hand.includes(c));
          }
          if (target < 0) {
            let bp = 0;
            library.forEach((c, i) => {
              if (c.power > bp) {
                bp = c.power;
                target = i;
              }
            });
          }
          if (target >= 0) {
            hand.push(library.splice(target, 1)[0]);
            cardsSeen++;
          }
        }
        if (card.power > 0) attackers.push({ power: card.power, readyTurn: card.haste ? turn : turn + 1 });
        if (card.drawNow) drawCards(card.drawNow);
        if (card.drawEngine) engines += card.drawEngine;
      }

      // Réponses : en main et payables → le mana restant est « gardé ».
      let held = 0;
      for (const c of hand) {
        if (!c.interaction || c.kind !== "reactive") continue;
        if (c.cmc <= manaThisTurn && pay(c, fullPool)) {
          if (turn <= 3) hadInteraction = true;
          if (c.cmc <= pool.length) held = Math.max(held, c.cmc);
        }
      }

      if (turn <= 6) {
        available += manaThisTurn;
        spent += manaThisTurn - pool.length + held;
      }
      if (turn >= 2 && turn <= 5) {
        colorScrewDenom++;
        if (colorBlocked) colorScrewTurns++;
      }

      // --- Attaque ---
      for (const a of attackers) if (a.readyTurn <= turn) damage += a.power;
      if (kill > turns && damage >= lifeTarget) kill = turn;

      // --- Combo réunie ? (toutes les pièces lancées ou en main) ---
      if (hasCombo && !comboTurn) {
        for (let k = 0; k < comboHave.length; k++) {
          let inHand = 0;
          for (const c of hand) if (c.combos.includes(k)) inHand++;
          if (comboHave[k] + inHand >= deck.comboSizes[k]) {
            comboTurn = turn;
            break;
          }
        }
      }

      if (turn === 3 && landsInPlay < 3) screw++;
      if (turn === 6) {
        seenT6 += cardsSeen;
        dmgT6 += damage;
      }
      if (turn === 6 && landsSeen >= 9) flood++;

      // Défausse à 7.
      while (hand.length > 7) {
        let idx = 0;
        let worst = -1;
        hand.forEach((c, i) => {
          const v = c.kind === "land" ? (landsInPlay >= 6 ? 50 : -1) : c.cmc;
          if (v > worst) {
            worst = v;
            idx = i;
          }
        });
        hand.splice(idx, 1);
      }
    }

    if (hadInteraction) interT3++;
    if (cmdTurn) {
      cmdGames++;
      cmdTurnSum += cmdTurn;
      if (cmdTurn <= Math.max(1, commanderCmc)) cmdOnCurve++;
    }
    killTurns.push(kill);
    if (comboTurn && comboTurn <= 6) comboT6++;
    if (comboTurn) comboEnd++;
  }

  killTurns.sort((a, b) => a - b);
  const killTurn = killTurns[Math.floor(killTurns.length / 2)] ?? turns + 1;
  const meanKill = killTurns.reduce((a, b) => a + b, 0) / Math.max(1, killTurns.length);
  const r = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
  const report: Omit<PlaytestReport, "score" | "parts"> = {
    games,
    keep7: r(keep7 / games),
    avgMulligans: r(mulligans / games, 2),
    manaScrew: r(screw / games),
    manaFlood: r(flood / games),
    colorScrew: r(colorScrewDenom ? colorScrewTurns / colorScrewDenom : 0),
    manaEfficiency: r(available ? spent / available : 0),
    commanderTurn: cmdGames ? r(cmdTurnSum / cmdGames, 1) : null,
    commanderOnCurve: r(deck.commanders.length ? cmdOnCurve / games : 0),
    cardsSeenT6: r(seenT6 / games, 1),
    damageT6: r(dmgT6 / games, 1),
    killTurn,
    lifeTarget,
    comboByT6: hasCombo ? r(comboT6 / games) : null,
    comboByEnd: hasCombo ? r(comboEnd / games) : null,
    interactionByT3: r(interT3 / games),
  };
  return { ...report, ...scoreReport(report, options.mode, turns, meanKill) };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Indice 0-100 à partir des mesures. Pondérations = choix de conception
 * (pas une vérité mesurée) : la régularité pèse le plus, parce que c'est ce
 * qu'un goldfish mesure le mieux ; les réponses pèsent plus en Duel (un seul
 * adversaire, parties courtes).
 */
function scoreReport(
  rep: Omit<PlaytestReport, "score" | "parts">,
  mode: "multi" | "duel",
  turns: number,
  meanKill: number
): Pick<PlaytestReport, "score" | "parts"> {
  const duel = mode === "duel";
  const consistency = clamp01(1 - (rep.manaScrew * 1.5 + rep.manaFlood * 1.2 + rep.colorScrew * 1.5 + (1 - rep.keep7) * 0.6));
  const tempo = clamp01(0.7 * clamp01((rep.manaEfficiency - 0.35) / 0.5) + 0.3 * rep.commanderOnCurve);
  // Horloge : tour moyen (plus fin que la médiane) ramené sur 0-1 ; une combo réunie compte comme une victoire.
  const fast = duel ? 5 : 7;
  const damageClock = clamp01(1 - (meanKill - fast) / (turns + 1 - fast));
  const comboClock = rep.comboByEnd === null ? 0 : clamp01((rep.comboByT6 ?? 0) * 0.6 + rep.comboByEnd * 0.4);
  const clock = Math.max(damageClock, comboClock);
  const interaction = clamp01(rep.interactionByT3 / 0.8);
  const w = duel ? { c: 0.35, t: 0.25, k: 0.2, i: 0.2 } : { c: 0.4, t: 0.3, k: 0.2, i: 0.1 };
  const score = 100 * (w.c * consistency + w.t * tempo + w.k * clock + w.i * interaction);
  const r = (x: number) => Math.round(x * 100) / 100;
  return { score: Math.round(score * 10) / 10, parts: { consistency: r(consistency), tempo: r(tempo), clock: r(clock), interaction: r(interaction) } };
}

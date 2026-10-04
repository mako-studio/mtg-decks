/**
 * Apprend des TENDANCES de construction à partir des decks connus et les
 * écrit dans src/data/deck-trends.json (03/10/2026, demande de Ben :
 * « te baser sur une analyse des decks connus, en tirer des tendances, des
 * idées et des bonnes pratiques que tu peux ensuite décliner ou extrapoler »).
 *
 * Aucun accès réseau : lit ce qui est déjà dans le dépôt.
 *   npx tsx scripts/learn-deck-trends.mts
 * À relancer après une mise à jour de l'archive mtgtop8
 * (scripts/fetch-duel-meta.mjs) ou des motifs de src/lib/mechanics.ts.
 *
 * Sources :
 * - analysis/duelcommander/decks-mtgtop8.json : decks de tournoi Duel
 *   Commander (mtgtop8), texte des cartes dans cards-scryfall.json ;
 * - src/data/commander-decks.json : précons Commander officiels (texte des
 *   cartes manquantes dans analysis/precons/cards-forge.json).
 *
 * Ce qu'on apprend :
 * 1. PAR AXE de mécanique (src/lib/mechanics.ts) : quand un deck est
 *    construit autour d'un axe (son commandant le récompense, ou il aligne
 *    beaucoup de cartes qui le récompensent), combien de cartes le
 *    PRODUISENT — la densité que les constructeurs jugent nécessaire — et
 *    de combien c'est plus que dans les autres decks (« lift »).
 * 2. PAIRES D'AXES construits ensemble plus souvent que le hasard.
 * 3. RECETTES : familles de decks de tournoi regroupées par leur forme
 *    (créatures, contresorts, interaction à bas coût, rampe, courbe...),
 *    avec les fourchettes de chaque rôle.
 *
 * Unité de compte : le COMMANDANT (moyenne de ses decks), pas le deck —
 * sinon les 108 decks d'un commandant populaire pèseraient 50 fois plus que
 * les 2 decks d'un commandant rare (même choix que duel-cooccurrence.json).
 *
 * Limites à garder en tête en lisant le fichier produit :
 * - Duel : ce que mtgtop8 publie, surtout les tops de tournois ; présence
 *   n'est pas taux de victoire (on ne voit pas les decks qui ont perdu).
 * - Multi : les précons sont construits autour d'un thème, ce qui renseigne
 *   sur les densités par axe, mais ce ne sont PAS des decks puissants : on
 *   n'en tire aucune recette de forme.
 * - Les axes viennent de motifs de texte (voir mechanics.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScryfallCard } from "../src/lib/types";

/** Minuscules sans accents : mtgtop8 écrit « Lorien Revealed », Scryfall « Lórien Revealed » (04/10/2026). */
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Import dynamique : les imports nommés depuis un .ts échouent sous tsx dans
// certains environnements (voir HANDOFF §7).
const load = async <T,>(p: string): Promise<T> => {
  const ns = (await import(p)) as { default?: T } & T;
  return (ns.default ?? ns) as T;
};
const mech = await load<typeof import("../src/lib/mechanics")>(path.join(ROOT, "src/lib/mechanics.ts"));
const score = await load<typeof import("../src/lib/deck-score")>(path.join(ROOT, "src/lib/deck-score.ts"));
const { AXES, ROLE_IDS, cardMechanics, cardRoles } = mech;

const readJson = <T,>(rel: string): T => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8")) as T;

// ---------- Cartes ----------
type RawCard = Partial<ScryfallCard> & { name: string; type_line: string; cmc: number };
const cardIndex = new Map<string, RawCard>();
function addCards(cards: Record<string, RawCard>) {
  for (const c of Object.values(cards)) {
    for (const n of [c.name, c.name.split(" // ")[0]]) {
      const k = fold(n);
      if (!cardIndex.has(k)) cardIndex.set(k, c);
    }
  }
}
addCards(readJson<{ cards: Record<string, RawCard> }>("analysis/duelcommander/cards-scryfall.json").cards);
addCards(readJson<{ cards: Record<string, RawCard> }>("analysis/precons/cards-forge.json").cards);

interface Tagged {
  isLand: boolean;
  produces: number[];
  rewards: number[];
  roles: string[];
  cmc: number;
}
const tagCache = new Map<string, Tagged | null>();
function tag(name: string): Tagged | null {
  const key = fold(name);
  if (tagCache.has(key)) return tagCache.get(key) ?? null;
  const raw = cardIndex.get(key) ?? cardIndex.get(key.split(" // ")[0]);
  let out: Tagged | null = null;
  if (raw) {
    const card = { legalities: {}, games: [], color_identity: [], ...raw } as unknown as ScryfallCard;
    const m = cardMechanics(card);
    const isLand = card.type_line.split(" // ")[0].includes("Land");
    out = { isLand, produces: m.produces, rewards: m.rewards, roles: cardRoles(card, score.classifyCard(card)), cmc: card.cmc ?? 0 };
  }
  tagCache.set(key, out);
  return out;
}

// ---------- Decks ----------
interface Deck {
  commanders: string[];
  cards: { name: string; count: number }[];
  date?: string | null;
}
interface Profile {
  key: string;
  /** Producteurs par axe (cartes du deck, hors commandant). */
  P: number[];
  /** Cartes du deck qui récompensent l'axe + 3 si un commandant le récompense. */
  R: number[];
  cmdRewards: boolean[];
  roles: Record<string, number>;
  lands: number;
  avgCmc: number;
  colors: number;
}

function profile(deck: Deck): Profile | null {
  const P = AXES.map(() => 0);
  const R = AXES.map(() => 0);
  const cmdRewards = AXES.map(() => false);
  const roles: Record<string, number> = Object.fromEntries(ROLE_IDS.map((r) => [r, 0]));
  let lands = 0;
  let nonLands = 0;
  let cmcSum = 0;
  let known = 0;
  let total = 0;
  for (const c of deck.cards) {
    total += c.count;
    const t = tag(c.name);
    if (!t) continue;
    known += c.count;
    if (t.isLand) {
      lands += c.count;
      continue;
    }
    nonLands += c.count;
    cmcSum += t.cmc * c.count;
    for (const i of t.produces) P[i] += c.count;
    for (const i of t.rewards) R[i] += c.count;
    for (const r of t.roles) roles[r] += c.count;
  }
  // Deck incomplet ou trop de cartes sans texte : écarté plutôt que biaisé.
  if (total < 95 || known / total < 0.95) return null;
  const colors = new Set<string>();
  for (const name of deck.commanders) {
    const t = tag(name);
    const raw = cardIndex.get(fold(name)) ?? cardIndex.get(fold(name).split(" // ")[0]);
    for (const c of raw?.color_identity ?? []) colors.add(c);
    if (!t) continue;
    for (const i of t.rewards) {
      cmdRewards[i] = true;
      R[i] += 3;
    }
  }
  return { key: deck.commanders.join(" + "), P, R, cmdRewards, roles, lands, avgCmc: nonLands ? cmcSum / nonLands : 0, colors: colors.size };
}

const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Regroupe par commandant : une entrée = la moyenne de ses decks. */
function byCommander(profiles: Profile[]): Map<string, Profile[]> {
  const m = new Map<string, Profile[]>();
  for (const p of profiles) {
    const list = m.get(p.key);
    if (list) list.push(p);
    else m.set(p.key, [p]);
  }
  return m;
}

interface AxisTrend {
  /** Producteurs moyens dans les decks NON construits autour de l'axe. */
  baseProducers: number;
  /** Producteurs dans les decks construits autour de l'axe : la densité à viser. */
  builtProducers: { p25: number; median: number; p75: number };
  builtRewarders: number;
  /** builtProducers moyen / baseProducers : > 1 = les constructeurs ajoutent bien des producteurs. */
  lift: number;
  /** Part des commandants (ou des précons) construits autour de l'axe. */
  builtShare: number;
  support: number;
  examples: string[];
}

function axisTrends(groups: Map<string, Profile[]>): { axes: Record<string, AxisTrend>; built: Map<string, boolean[]> } {
  const keys = Array.from(groups.keys());
  const avg = (key: string, f: (p: Profile) => number) => mean((groups.get(key) ?? []).map(f));
  const axes: Record<string, AxisTrend> = {};
  const built = new Map<string, boolean[]>(keys.map((k) => [k, AXES.map(() => false)]));
  AXES.forEach((axis, i) => {
    const R = keys.map((k) => avg(k, (p) => p.R[i]));
    const P = keys.map((k) => avg(k, (p) => p.P[i]));
    // « Construit autour » : nettement plus de récompenses que la plupart
    // (quartile supérieur, et au moins 3 — un commandant qui récompense
    // l'axe vaut 3 à lui seul).
    const threshold = Math.max(3, quantile(R, 0.75));
    const isBuilt = R.map((r) => r >= threshold);
    keys.forEach((k, j) => (built.get(k)![i] = isBuilt[j]));
    const inB = P.filter((_, j) => isBuilt[j]);
    const outB = P.filter((_, j) => !isBuilt[j]);
    if (inB.length < 4) return;
    const base = mean(outB);
    const ranked = keys
      .map((k, j) => ({ k, p: P[j], b: isBuilt[j], n: groups.get(k)!.length }))
      .filter((x) => x.b)
      .sort((a, b) => b.n - a.n);
    axes[axis.id] = {
      baseProducers: round(base),
      builtProducers: { p25: round(quantile(inB, 0.25)), median: round(quantile(inB, 0.5)), p75: round(quantile(inB, 0.75)) },
      builtRewarders: round(quantile(R.filter((_, j) => isBuilt[j]), 0.5)),
      lift: round(base > 0 ? mean(inB) / base : 0, 2),
      builtShare: round(inB.length / keys.length, 2),
      support: inB.length,
      examples: ranked.slice(0, 5).map((x) => x.k),
    };
  });
  return { axes, built };
}

interface PairTrend {
  a: string;
  b: string;
  lift: number;
  support: number;
}
function pairTrends(built: Map<string, boolean[]>, minSupport: number): PairTrend[] {
  const rows = Array.from(built.values());
  const n = rows.length;
  const out: PairTrend[] = [];
  for (let i = 0; i < AXES.length; i++) {
    for (let j = i + 1; j < AXES.length; j++) {
      const ni = rows.filter((r) => r[i]).length;
      const nj = rows.filter((r) => r[j]).length;
      const both = rows.filter((r) => r[i] && r[j]).length;
      if (both < minSupport || ni === 0 || nj === 0) continue;
      const lift = both / n / ((ni / n) * (nj / n));
      if (lift >= 1.3) out.push({ a: AXES[i].id, b: AXES[j].id, lift: round(lift, 2), support: both });
    }
  }
  return out.sort((x, y) => y.lift - x.lift);
}

// ---------- Recettes (k-moyennes sur la forme des decks) ----------
const SHAPE = [...ROLE_IDS, "lands"] as const;
function shapeVector(ps: Profile[]): number[] {
  return SHAPE.map((r) => mean(ps.map((p) => (r === "lands" ? p.lands : p.roles[r]))));
}

/** Générateur déterministe (même résultat à chaque lancement). */
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

function kmeans(X: number[][], k: number, seed: number): { assign: number[]; inertia: number } {
  const rnd = mulberry32(seed);
  const d2 = (a: number[], b: number[]) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
  // Initialisation k-means++.
  const centers: number[][] = [X[Math.floor(rnd() * X.length)]];
  while (centers.length < k) {
    const dist = X.map((x) => Math.min(...centers.map((c) => d2(x, c))));
    const sum = dist.reduce((a, b) => a + b, 0);
    let r = rnd() * sum;
    let idx = 0;
    for (; idx < X.length - 1; idx++) {
      r -= dist[idx];
      if (r <= 0) break;
    }
    centers.push(X[idx]);
  }
  let assign = X.map(() => 0);
  for (let iter = 0; iter < 60; iter++) {
    const next = X.map((x) => {
      let best = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = d2(x, c);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    });
    const changed = next.some((a, i) => a !== assign[i]);
    assign = next;
    for (let c = 0; c < k; c++) {
      const members = X.filter((_, i) => assign[i] === c);
      if (members.length) centers[c] = members[0].map((_, j) => mean(members.map((m) => m[j])));
    }
    if (!changed) break;
  }
  return { assign, inertia: X.reduce((s, x, i) => s + d2(x, centers[assign[i]]), 0) };
}

interface Recipe {
  id: string;
  label: string;
  /** En une phrase : ce qui caractérise cette famille. */
  summary: string;
  /** Part des commandants de tournoi dans cette famille. */
  share: number;
  commanders: number;
  decks: number;
  examples: string[];
  /** Fourchette de chaque rôle dans les decks de la famille (p25, médiane, p75). */
  roles: Record<string, { p25: number; median: number; p75: number }>;
  lands: { p25: number; median: number; p75: number };
  avgCmc: number;
  /** Part des commandants de la famille par nombre de couleurs. */
  colors: Record<string, number>;
  /** Écart de chaque rôle à la moyenne de tous les decks, en écarts-types (pour le libellé). */
  z: Record<string, number>;
}

/**
 * Nom d'une famille d'après ce qui la distingue (écarts à la moyenne). Les
 * règles sont volontairement simples ; le champ `z` reste dans le fichier
 * pour contrôler qu'un libellé correspond bien à la forme.
 */
function nameRecipe(z: Record<string, number>): { id: string; label: string } {
  if (z.lands > 2) return { id: "lands", label: "Deck de terrains" };
  if (z.recursion > 1 && z.cmc5plus > 1) return { id: "reanimator", label: "Réanimation et grosses menaces" };
  if (z.ramp > 0.7 && z.tutor > 0.5) return { id: "engine", label: "Accélération et moteur" };
  if (z.counterspell > 0.7 && z.creature < -0.3) return { id: "control", label: "Contrôle" };
  if (z.counterspell > 0.5) return { id: "tempo", label: "Tempo" };
  if (z.ramp > 0.7 && (z.cmc5plus > 0.3 || z.threat > 0.3)) return { id: "ramp", label: "Rampe et grosses menaces" };
  if (z.cheapCreature > 0.6 && z.cmc5plus < 0) return { id: "aggro", label: "Agression" };
  if (z.creature < -0.6 && (z.tutor > 0.3 || z.draw > 0.3)) return { id: "combo", label: "Sorts et combo" };
  if (z.creature > 0.4) return { id: "creatures", label: "Créatures et valeur" };
  return { id: "midrange", label: "Milieu de partie" };
}

function learnRecipes(groups: Map<string, Profile[]>, k: number): { recipes: Recipe[]; familyOf: Map<string, string> } {
  const familyOf = new Map<string, string>();
  const keys = Array.from(groups.keys()).filter((key) => groups.get(key)!.length >= 2);
  const raw = keys.map((key) => shapeVector(groups.get(key)!));
  const mu = SHAPE.map((_, j) => mean(raw.map((r) => r[j])));
  const sd = SHAPE.map((_, j) => Math.sqrt(mean(raw.map((r) => (r[j] - mu[j]) ** 2))) || 1);
  const X = raw.map((r) => r.map((x, j) => (x - mu[j]) / sd[j]));
  let best = kmeans(X, k, 1);
  for (let s = 2; s <= 20; s++) {
    const run = kmeans(X, k, s);
    if (run.inertia < best.inertia) best = run;
  }
  const recipes: Recipe[] = [];
  const used = new Map<string, number>();
  for (let c = 0; c < k; c++) {
    const members = keys.filter((_, i) => best.assign[i] === c);
    if (members.length < 3) continue;
    const decks = members.flatMap((m) => groups.get(m)!);
    const z = Object.fromEntries(SHAPE.map((r, j) => [r, round(mean(X.filter((_, i) => best.assign[i] === c).map((x) => x[j])), 2)]));
    const named = nameRecipe(z);
    const n = (used.get(named.id) ?? 0) + 1;
    used.set(named.id, n);
    const role = (r: string) => {
      const xs = decks.map((d) => (r === "lands" ? d.lands : d.roles[r]));
      return { p25: round(quantile(xs, 0.25), 0), median: round(quantile(xs, 0.5), 0), p75: round(quantile(xs, 0.75), 0) };
    };
    const colorCount: Record<string, number> = {};
    for (const m of members) {
      const col = String(groups.get(m)![0].colors);
      colorCount[col] = (colorCount[col] ?? 0) + 1;
    }
    const top = [...SHAPE].sort((a, b) => Math.abs(z[b]) - Math.abs(z[a])).slice(0, 3);
    for (const m of members) familyOf.set(m, n > 1 ? `${named.id}-${n}` : named.id);
    recipes.push({
      id: n > 1 ? `${named.id}-${n}` : named.id,
      label: n > 1 ? `${named.label} (variante ${n})` : named.label,
      summary: top.map((r) => `${ROLE_LABELS[r] ?? r} ${z[r] > 0 ? "au-dessus" : "en dessous"} de la moyenne`).join(", "),
      share: round(members.length / keys.length, 2),
      commanders: members.length,
      decks: decks.length,
      examples: [...members].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length).slice(0, 6),
      roles: Object.fromEntries(ROLE_IDS.map((r) => [r, role(r)])),
      lands: role("lands"),
      avgCmc: round(mean(decks.map((d) => d.avgCmc)), 2),
      colors: Object.fromEntries(Object.entries(colorCount).map(([col, v]) => [col, round(v / members.length, 2)])),
      z,
    });
  }
  return { recipes: recipes.sort((a, b) => b.commanders - a.commanders), familyOf };
}

const ROLE_LABELS: Record<string, string> = {
  creature: "créatures",
  cheapCreature: "créatures à 1-2 manas",
  threat: "grosses menaces",
  counterspell: "contresorts",
  cheapInteraction: "interaction à 1-2 manas",
  removal: "removal",
  wipe: "nettoyages de table",
  draw: "pioche",
  ramp: "rampe",
  tutor: "tutors",
  protection: "protection",
  recursion: "récursion",
  cmc01: "cartes à 0-1 mana",
  cmc2: "cartes à 2 manas",
  cmc3: "cartes à 3 manas",
  cmc4: "cartes à 4 manas",
  cmc5plus: "cartes à 5 manas et plus",
  lands: "terrains",
};

// ---------- Exécution ----------
const archive = readJson<{ decks: Deck[] }>("analysis/duelcommander/decks-mtgtop8.json");
// Méta récente seulement : les decks d'avant 2026 décrivent un autre format.
const duelDecks = archive.decks.filter((d) => (d.date ?? "") >= "2026-01-01");
const duelProfiles = duelDecks.map(profile).filter((p): p is Profile => p !== null);
const duelGroups = byCommander(duelProfiles);
const duel = axisTrends(duelGroups);

const precons = readJson<{ id: string; commanders: string[]; cards: { name: string; count: number }[] }[]>("src/data/commander-decks.json");
// Unité = le deck (chaque précon a son propre plan, même commandant ou non).
const preconProfiles = precons
  .map((d) => {
    const p = profile(d);
    return p ? { ...p, key: d.id } : null;
  })
  .filter((p): p is Profile => p !== null);
const multiGroups = byCommander(preconProfiles);
const multi = axisTrends(multiGroups);

// ---------- Forme propre à chaque commandant (04/10/2026) ----------
// Pour un commandant assez joué, la forme de SES decks est un meilleur guide
// que celle de sa famille (une famille mélange 30 commandants). Fourchettes
// de chaque rôle sur ses decks ; 4 decks au moins, sinon on s'en tient à la
// famille. Clé : noms des commandants joints par « + », tels que mtgtop8 les
// écrit (deck-trends.ts normalise à la lecture).
const learned = learnRecipes(duelGroups, 6);
const shapes: Record<string, { decks: number; recipe: string | null; roles: Record<string, { p25: number; median: number; p75: number }>; lands: { p25: number; median: number; p75: number }; avgCmc: number }> = {};
for (const [key, ps] of duelGroups) {
  if (ps.length < 4) continue;
  const range = (xs: number[]) => ({ p25: round(quantile(xs, 0.25), 0), median: round(quantile(xs, 0.5), 0), p75: round(quantile(xs, 0.75), 0) });
  shapes[key] = {
    decks: ps.length,
    recipe: learned.familyOf.get(key) ?? null,
    roles: Object.fromEntries(ROLE_IDS.map((r) => [r, range(ps.map((p) => p.roles[r]))])),
    lands: range(ps.map((p) => p.lands)),
    avgCmc: round(mean(ps.map((p) => p.avgCmc)), 2),
  };
}

const dates = duelDecks.map((d) => d.date ?? "").filter(Boolean).sort();
const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: {
    duel: { decks: duelProfiles.length, commanders: duelGroups.size, period: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : null, origin: "mtgtop8 (analysis/duelcommander/decks-mtgtop8.json)" },
    multi: { decks: preconProfiles.length, origin: "précons Commander officiels (src/data/commander-decks.json)" },
  },
  axes: Object.fromEntries(AXES.map((a) => [a.id, { duel: duel.axes[a.id] ?? null, multi: multi.axes[a.id] ?? null }])),
  axisPairs: { duel: pairTrends(duel.built, 5), multi: pairTrends(multi.built, 5) },
  recipes: learned.recipes,
  shapes,
  roleLabels: ROLE_LABELS,
};
writeFileSync(path.join(ROOT, "src/data/deck-trends.json"), JSON.stringify(out, null, 1) + "\n", "utf8");

console.log(`Duel : ${duelProfiles.length} decks, ${duelGroups.size} commandants (${out.sources.duel.period}). Précons : ${preconProfiles.length}.`);
for (const a of AXES) {
  const d = duel.axes[a.id];
  const m = multi.axes[a.id];
  console.log(
    `${a.id.padEnd(14)} duel ${d ? `lift ${d.lift} · ${d.baseProducers} → ${d.builtProducers.median} producteurs (${d.support} cmd)` : "—"}`.padEnd(70) +
      ` | multi ${m ? `lift ${m.lift} · ${m.baseProducers} → ${m.builtProducers.median} (${m.support})` : "—"}`
  );
}
for (const r of out.recipes) console.log(`${r.label} : ${r.commanders} commandants, ${r.decks} decks — ${r.summary} — ex. ${r.examples.slice(0, 3).join(" ; ")}`);
console.log("Paires (duel) :", out.axisPairs.duel.slice(0, 8).map((p) => `${p.a}+${p.b} ×${p.lift}`).join(", "));
console.log("Paires (multi) :", out.axisPairs.multi.slice(0, 8).map((p) => `${p.a}+${p.b} ×${p.lift}`).join(", "));

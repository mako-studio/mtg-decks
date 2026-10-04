/**
 * Apprend le modèle « texte » de qualité des cartes (src/lib/card-quality.ts)
 * → src/data/card-quality-model.json. 04/10/2026.
 *
 * Usage (aucun réseau) :
 *   npm run learn-quality -- /chemin/forge-cards.json
 * où forge-cards.json est l'index { cards: { nom: carte } } de TOUTES les
 * cartes, produit par `python3 scripts/dump-forge-cards.py /tmp/forge out.json`
 * à partir d'un clone du dépôt Card-Forge/forge (voir HANDOFF §5).
 *
 * Cible : la part des decks de tournoi Duel qui jouent la carte, à couleurs
 * égales (src/data/duel-meta.json), ramenée sur 0-1 par une échelle
 * logarithmique (1 % ≈ 0,15 ; 10 % ≈ 0,52 ; 90 % ≈ 1). Une carte jamais vue
 * vaut 0. Les cartes des extensions récentes non vues sont écartées (trop
 * neuves pour conclure). Positifs et négatifs sont lus dans la MÊME source
 * (Forge) pour que le modèle n'apprenne pas une différence de format de texte.
 *
 * Modèle : régression logistique à cibles continues, pénalité L2, descente de
 * gradient. Les deux classes sont rééquilibrées (les cartes jamais jouées
 * sont ~10 fois plus nombreuses). Précision mesurée par validation croisée à
 * 5 plis (AUC « jouée au moins une fois » contre « jamais jouée »), écrite
 * dans le fichier produit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScryfallCard } from "../src/lib/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = async (p: string) => { const ns = await import(path.join(ROOT, p)); return (ns as { default?: unknown }).default ?? ns; };
const cq = (await load("src/lib/card-quality.ts")) as typeof import("../src/lib/card-quality");
const ds = (await load("src/lib/deck-score.ts")) as typeof import("../src/lib/deck-score");

const forgePath = process.argv[2];
if (!forgePath) { console.error("Usage : npm run learn-quality -- /chemin/forge-cards.json"); process.exit(1); }
type RawCard = Partial<ScryfallCard> & { name: string; type_line?: string };
const forge = JSON.parse(fs.readFileSync(forgePath, "utf8")).cards as Record<string, RawCard>;
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/duel-meta.json"), "utf8"));
const presence = new Map<string, number>();
for (const [n, v] of Object.entries((meta.cardsInColors ?? meta.cards) as Record<string, number>)) {
  presence.set(n.toLowerCase(), v); presence.set(n.toLowerCase().split(" // ")[0], v);
}
const recentRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/recent-set-cards.json"), "utf8")).cards;
const recent = new Set<string>((Array.isArray(recentRaw) ? recentRaw : Object.values(recentRaw)).map((c) => String((c as { name: string }).name).toLowerCase()));

// Générateur déterministe (mulberry32) : l'échantillon et les plis sont reproductibles.
let seed = 20261004;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

interface Row { name: string; x: Record<string, number>; y: number; pos: boolean }
const rows: Row[] = [];
const seen = new Set<string>();
for (const card of Object.values(forge)) {
  const key = String(card.name).toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  const type = String(card.type_line ?? "").split(" // ")[0];
  if (type.includes("Land") || !type || /Token|Scheme|Plane\b|Phenomenon|Vanguard|Conspiracy|Dungeon|Stickers|Attraction|Contraption/.test(type)) continue;
  const p = presence.get(key) ?? presence.get(key.split(" // ")[0]) ?? 0;
  if (p === 0 && recent.has(key)) continue;
  const full = { legalities: {}, games: [], ...card } as unknown as ScryfallCard;
  const y = p > 0 ? Math.min(1, Math.log(1 + 100 * p) / Math.log(91)) : 0;
  rows.push({ name: card.name, x: cq.qualityFeatures(full, ds.classifyCard(full)), y, pos: p > 0 });
}
const positives = rows.filter((r) => r.pos);
const negatives = rows.filter((r) => !r.pos).sort(() => rnd() - 0.5).slice(0, 12000);
const data = [...positives, ...negatives].sort(() => rnd() - 0.5);
const keys = Array.from(new Set(data.flatMap((r) => Object.keys(r.x)))).sort();
console.log(`cartes : ${positives.length} jouées en tournoi, ${negatives.length} jamais jouées (échantillon), ${keys.length} descripteurs`);

function fit(train: Row[], epochs = 1500, lr = 1.0, l2 = 0.0005) {
  const w = new Map(keys.map((k) => [k, 0]));
  let b = 0;
  const nPos = train.filter((r) => r.pos).length;
  const wPos = train.length / (2 * nPos);
  const wNeg = train.length / (2 * (train.length - nPos));
  for (let e = 0; e < epochs; e++) {
    const g = new Map(keys.map((k) => [k, 0]));
    let gb = 0;
    for (const r of train) {
      let z = b;
      for (const [k, v] of Object.entries(r.x)) z += (w.get(k) ?? 0) * v;
      const err = (1 / (1 + Math.exp(-z)) - r.y) * (r.pos ? wPos : wNeg);
      for (const [k, v] of Object.entries(r.x)) g.set(k, (g.get(k) ?? 0) + err * v);
      gb += err;
    }
    for (const k of keys) w.set(k, (w.get(k) ?? 0) - lr * ((g.get(k) ?? 0) / train.length + l2 * (w.get(k) ?? 0)));
    b -= (lr * gb) / train.length;
  }
  return { w, b };
}
const predict = (m: { w: Map<string, number>; b: number }, r: Row) => { let z = m.b; for (const [k, v] of Object.entries(r.x)) z += (m.w.get(k) ?? 0) * v; return 1 / (1 + Math.exp(-z)); };
function auc(scored: { s: number; pos: boolean }[]) {
  const sorted = [...scored].sort((a, b) => a.s - b.s);
  let rankSum = 0, nPos = 0;
  sorted.forEach((r, i) => { if (r.pos) { rankSum += i + 1; nPos++; } });
  const nNeg = sorted.length - nPos;
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}
const folds = 5;
const cv: { s: number; pos: boolean }[] = [];
for (let f = 0; f < folds; f++) {
  const m = fit(data.filter((_, i) => i % folds !== f));
  for (const [i, r] of data.entries()) if (i % folds === f) cv.push({ s: predict(m, r), pos: r.pos });
}
const cvAuc = Math.round(auc(cv) * 1000) / 1000;
console.log(`AUC en validation croisée (${folds} plis) : ${cvAuc}`);

const m = fit(data);
// Quantiles sur un mélange représentatif : toutes les cartes de l'échantillon, sans rééquilibrage.
const scores = data.map((r) => predict(m, r)).sort((a, b) => a - b);
const quantiles = Array.from({ length: 11 }, (_, i) => Math.round(scores[Math.min(scores.length - 1, Math.floor((i / 10) * (scores.length - 1)))] * 1e5) / 1e5);
const weights = Object.fromEntries(keys.map((k) => [k, Math.round((m.w.get(k) ?? 0) * 1000) / 1000]).filter(([, v]) => v !== 0));
const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: `Régression logistique sur ${positives.length} cartes jouées en tournoi Duel (${meta.period}) contre ${negatives.length} cartes jamais jouées (échantillon Forge). scripts/learn-card-quality.mts`,
  auc: cvAuc,
  intercept: Math.round(m.b * 1000) / 1000,
  weights,
  quantiles,
};
fs.writeFileSync(path.join(ROOT, "src/data/card-quality-model.json"), JSON.stringify(out, null, 1) + "\n");
const top = Object.entries(weights).sort((a, b) => (b[1] as number) - (a[1] as number));
console.log("poids les plus hauts :", top.slice(0, 14).map(([k, v]) => `${k} ${v}`).join(", "));
console.log("poids les plus bas   :", top.slice(-14).map(([k, v]) => `${k} ${v}`).join(", "));

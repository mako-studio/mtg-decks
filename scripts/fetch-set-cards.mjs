#!/usr/bin/env node
/**
 * Régénère src/data/recent-set-cards.json (cartes NOUVELLES des dernières
 * extensions) depuis Scryfall. Voir src/lib/recent-sets.ts pour l'usage de
 * ce fichier par le site.
 *
 * À lancer sur le Mac de Ben (api.scryfall.com est inaccessible depuis les
 * environnements de dev de Claude, voir HANDOFF.md §5) :
 *
 *   node scripts/fetch-set-cards.mjs fra frc
 *   npm run fetch-set-cards -- fra frc      (équivalent)
 *
 * Passer TOUS les codes des extensions encore « récentes » : le fichier est
 * réécrit en entier. `--dry-run` affiche le compte sans rien écrire.
 *
 * ⚠️ Écrit le 03/10/2026 sans pouvoir être exécuté en réel. Points à
 * surveiller au premier lancement : la requête `not:reprint` (cartes dont
 * c'est la première impression) et le champ `set` renvoyé pour les cartes
 * Commander (attendu : « frc »). Le script s'arrête sans rien écrire si
 * Scryfall ne renvoie aucune carte.
 *
 * Remplace la version générée depuis Forge (scripts/build-set-cards-from-forge.py),
 * dont les champs sont les mêmes mais dont `keywords` est incomplet.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/data/recent-set-cards.json");
// Même convention que scripts/fetch-duel-meta.mjs : en-tête obligatoire.
const UA = "mtg-decks/1.0 (site personnel ; scripts/fetch-set-cards.mjs)";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const codes = args.filter((a) => !a.startsWith("--")).map((c) => c.toLowerCase());
if (codes.length === 0) {
  console.error("Usage : node scripts/fetch-set-cards.mjs <code> [<code>...] [--dry-run]   (ex. fra frc)");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  // /cards/search : 2 requêtes/seconde maximum (scryfall.com/docs/api/rate-limits).
  await sleep(600);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

function trimFace(f) {
  const out = { name: f.name, mana_cost: f.mana_cost, type_line: f.type_line, oracle_text: f.oracle_text };
  for (const k of ["power", "toughness", "loyalty"]) if (f[k] != null) out[k] = f[k];
  return out;
}

/** Mêmes champs que scripts/build-set-cards-from-forge.py (type RecentCard dans recent-sets.ts). */
function trimCard(c) {
  const out = {
    name: c.name,
    layout: c.layout,
    cmc: c.cmc,
    type_line: c.type_line,
    colors: c.colors ?? c.card_faces?.[0]?.colors ?? [],
    color_identity: c.color_identity,
    keywords: c.keywords ?? [],
    produced_mana: c.produced_mana ?? null,
    mana_cost: c.mana_cost ?? "",
  };
  if (c.oracle_text != null) out.oracle_text = c.oracle_text;
  for (const k of ["power", "toughness", "loyalty"]) if (c[k] != null) out[k] = c[k];
  if (c.card_faces?.length) out.card_faces = c.card_faces.map(trimFace);
  out.set = c.set;
  out.collector_number = c.collector_number;
  out.rarity = c.rarity;
  return out;
}

async function main() {
  const sets = [];
  for (const code of codes) {
    const info = await getJson(`https://api.scryfall.com/sets/${code}`);
    if (!info) {
      console.error(`Extension inconnue de Scryfall : ${code}. Rien n'est écrit.`);
      process.exit(1);
    }
    sets.push({ code, name: info.name, releasedAt: info.released_at ?? null });
  }

  const q = `(${codes.map((c) => `set:${c}`).join(" or ")}) not:reprint -is:digital -t:basic`;
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=set`;
  const cards = [];
  while (url) {
    const page = await getJson(url);
    if (!page) break;
    cards.push(...page.data.map(trimCard));
    url = page.has_more ? page.next_page : null;
  }
  console.log(`${cards.length} cartes nouvelles pour ${codes.join(", ")} (requête : ${q}).`);
  if (cards.length === 0) {
    console.error("Aucune carte : rien n'est écrit (fichier actuel conservé).");
    process.exit(1);
  }
  if (DRY) {
    console.log("Dry-run : rien n'est écrit.");
    return;
  }
  const data = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: "scryfall",
    sourceDetail: `api.scryfall.com — ${q}`,
    sets,
    cards,
  };
  await writeFile(OUT, JSON.stringify(data, null, 1) + "\n", "utf8");
  console.log(`Écrit dans ${path.relative(ROOT, OUT)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Sonde magic-ville.com (26/09/2026, demande de Ben : utiliser les résultats
 * Duel Commander de magic-ville pour affiner le constructeur).
 *
 * Pourquoi une sonde d'abord : le site est inaccessible depuis
 * l'environnement de Claude (403), il faut donc connaître la structure des
 * pages AVANT d'écrire l'import. Ce script, lancé sur le Mac de Ben :
 *   1. lit robots.txt (on respecte ses interdictions) ;
 *   2. télécharge la page de résultats DC et 2 pages de tournoi + 2 pages
 *      de deck trouvées dedans ;
 *   3. les enregistre telles quelles dans analysis/magicville/_probe/
 *      (octets bruts : le site n'est peut-être pas en UTF-8).
 * Aucune donnée n'est envoyée ailleurs. 1 requête toutes les 1,5 s.
 *
 *   node scripts/probe-magic-ville.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "analysis/magicville/_probe");
const BASE = "https://www.magic-ville.com";
const LIST = `${BASE}/fr/decks/resultats?data=1&dci=DC&tour_cur=1&tour_orig=1`;
const UA = "MTG-Opti/1.0 (outil personnel de deckbuilding ; contact via GitHub mako-studio/mtg-decks)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  await sleep(1500);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" } });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`${res.status} ${url} (${buf.length} octets, ${res.headers.get("content-type")})`);
  return { status: res.status, buf, text: buf.toString("latin1") };
}

await mkdir(OUT, { recursive: true });
const robots = await get(`${BASE}/robots.txt`);
await writeFile(path.join(OUT, "robots.txt"), robots.buf);
console.log("--- robots.txt ---\n" + robots.text.slice(0, 1500) + "\n------------------");

const list = await get(LIST);
await writeFile(path.join(OUT, "list.html"), list.buf);
const hrefs = Array.from(new Set(Array.from(list.text.matchAll(/href=["']([^"']+)["']/gi), (m) => m[1])));
const abs = (h) => (h.startsWith("http") ? h : new URL(h, `${BASE}/fr/decks/`).toString());
const deckish = hrefs.filter((h) => /deck|tourn|event|showdeck|decklist/i.test(h) && !/resultats\?/.test(h));
console.log(`${hrefs.length} liens sur la page, dont ${deckish.length} qui ressemblent à des tournois/decks. Exemples :`);
deckish.slice(0, 25).forEach((h) => console.log("  " + h));

let n = 0;
for (const h of deckish.slice(0, 4)) {
  const page = await get(abs(h));
  await writeFile(path.join(OUT, `page${++n}.html`), page.buf);
  const inner = Array.from(new Set(Array.from(page.text.matchAll(/href=["']([^"']+)["']/gi), (m) => m[1]))).filter(
    (x) => /deck|showdeck|decklist|export|txt|mtgo|arena|dl/i.test(x)
  );
  if (n <= 2 && inner.length) {
    const sub = await get(abs(inner.find((x) => x !== h) ?? inner[0]));
    await writeFile(path.join(OUT, `page${n}-sub.html`), sub.buf);
  }
}
console.log(`\nPages enregistrées dans ${path.relative(ROOT, OUT)}/ — préviens Claude, il les lira directement.`);

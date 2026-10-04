#!/usr/bin/env node
/**
 * Listes de tournoi Duel Commander COMPLÈTES, pour retrouver dans la
 * collection de l'utilisateur un deck réel presque entier (04/10/2026,
 * retour de Ben : « l'algo ne reconnaît pas le deck Vivi » alors que sa liste
 * contenait 63 des 99 cartes d'un deck de tournoi).
 *
 * Les autres fichiers générés ne gardent que des PARTS par carte ; ici on
 * garde chaque liste, sous forme compacte :
 *   { names: [nom…], decks: [{ i, e, d, c: [commandants], k: [indices de names], b: { terrain de base: nombre } }] }
 * → src/data/duel-tournament-lists.json, lu par src/lib/tournament-lists.ts.
 *
 * Usage (aucun réseau) : node scripts/duel-lists.mjs [--keep-days 180]
 * Appelé aussi par scripts/fetch-duel-meta.mjs à chaque mise à jour.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = path.join(ROOT, "analysis/duelcommander/decks-mtgtop8.json");
export const OUT_LISTS = path.join(ROOT, "src/data/duel-tournament-lists.json");
const BASICS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes", "snow-covered plains", "snow-covered island", "snow-covered swamp", "snow-covered mountain", "snow-covered forest"]);

/** `decks` : entrées de l'archive ({ id, event, date, commanders, cards: [{ name, count }] }). Listes de moins de 90 cartes écartées (saisie incomplète). */
export function buildTournamentLists(decks) {
  const names = [];
  const index = new Map();
  const idOf = (name) => {
    let i = index.get(name);
    if (i === undefined) {
      i = names.length;
      names.push(name);
      index.set(name, i);
    }
    return i;
  };
  const out = [];
  for (const d of decks) {
    const total = d.cards.reduce((s, c) => s + c.count, 0);
    if (!d.commanders?.length || total < 90) continue;
    const k = [];
    const b = {};
    for (const c of d.cards) {
      if (BASICS.has(c.name.toLowerCase())) b[c.name] = (b[c.name] ?? 0) + c.count;
      else k.push(idOf(c.name));
    }
    out.push({ i: d.id, e: d.event, d: d.date ?? null, c: d.commanders, k, b });
  }
  const dates = out.map((d) => d.d).filter(Boolean).sort();
  return { generatedAt: new Date().toISOString().slice(0, 10), period: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : null, names, decks: out };
}

export async function writeTournamentLists(decks) {
  const data = buildTournamentLists(decks);
  await writeFile(OUT_LISTS, JSON.stringify(data) + "\n", "utf8");
  console.log(`duel-tournament-lists.json : ${data.decks.length} listes complètes, ${data.names.length} cartes distinctes.`);
  return data;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--keep-days");
  const keepDays = i > 0 ? Number(process.argv[i + 1]) : 180;
  const archive = JSON.parse(await readFile(ARCHIVE, "utf8"));
  const keepSince = new Date(Date.now() - keepDays * 86400000).toISOString().slice(0, 10);
  await writeTournamentLists(archive.decks.filter((d) => !d.date || d.date >= keepSince));
}

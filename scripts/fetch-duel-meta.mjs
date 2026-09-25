#!/usr/bin/env node
/**
 * Élargit l'échantillon de decks Duel Commander de tournoi (25/09/2026,
 * demande de Ben : « augmente l'échantillon duel ») et régénère
 * src/data/duel-meta.json, utilisé par le constructeur compétitif et par le
 * tier de puissance (voir src/lib/duel-meta.ts).
 *
 * ⚠️ À LANCER SUR LE MAC DE BEN (Terminal), pas depuis un environnement
 * Claude : mtgtop8.com et api.scryfall.com y sont inaccessibles.
 *
 *   node scripts/fetch-duel-meta.mjs                 # 12 dernières semaines
 *   node scripts/fetch-duel-meta.mjs --weeks 26      # 6 mois
 *   node scripts/fetch-duel-meta.mjs --dry-run       # 2 événements, rien n'est écrit
 *
 * Structure mtgtop8 utilisée (vérifiée le 25/09/2026 sur de vraies pages) :
 * - liste des événements : https://mtgtop8.com/format?f=EDH&meta=115&cp=N
 *   (liens `event?e=<id>&f=EDH`, dates au format JJ/MM/AA) ;
 * - page d'événement : liens de decks `event?e=<id>&d=<deck>&f=EDH` ;
 * - export texte d'un deck : https://mtgtop8.com/mtgo?d=<deck> — « 1 Nom »
 *   par ligne, puis une section « Sideboard » qui contient le(s)
 *   commandant(s) en Duel Commander.
 * Si mtgtop8 change sa structure, le script s'arrête avec un message clair
 * plutôt que d'écrire des données vides.
 *
 * Accumulation : chaque deck récupéré est archivé dans
 * analysis/duelcommander/decks-mtgtop8.json (dédoublonné par identifiant) —
 * les lancements successifs agrandissent l'échantillon au lieu de le
 * remplacer. duel-meta.json est ensuite recalculé sur les decks de
 * l'archive des `--keep-days` derniers jours (180 par défaut).
 *
 * Deux parts par carte :
 * - `cards` : part de TOUS les decks qui la jouent (utilisée par le tier —
 *   c'est sur cette échelle que la composante « méta Duel » est calibrée) ;
 * - `cardsInColors` : part des decks DONT L'IDENTITÉ COULEUR PERMET de la
 *   jouer (identités lues sur Scryfall) — meilleur signal pour choisir
 *   une carte : un staple blanc joué par 90% des decks blancs ne doit pas
 *   être pénalisé parce que peu de decks sont blancs.
 * Politesse réseau : 1 requête / 0,8 s vers mtgtop8, ~9 / s vers Scryfall
 * (en-tête User-Agent obligatoire), comme le site.
 *
 * Trois fichiers produits (25/09/2026, 3e passage — demande de Ben : faire
 * de l'archive une vraie base de construction) :
 * - src/data/duel-meta.json — part de chaque carte dans tous les decks ;
 * - src/data/duel-commander-reference.json — pour chaque commandant (ou
 *   duo) joué dans ≥ 2 decks : part de chaque carte DANS SES decks, et
 *   quelques decks d'exemple (liens mtgtop8) ;
 * - src/data/duel-cooccurrence.json — synergies apprises : pour chaque
 *   carte, les cartes que PLUSIEURS commandants différents jouent ensemble
 *   bien plus souvent que le hasard ne le
 *   prévoit (« lift » ≥ 2, ≥ 4 commandants, confiance ≥ 70%), calculé à
 *   couleurs compatibles — voir computeOutputs.
 *
 *   node scripts/fetch-duel-meta.mjs --rebuild-only   # recalcule sans rien télécharger sur mtgtop8
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = path.join(ROOT, "analysis/duelcommander/decks-mtgtop8.json");
const OUT = path.join(ROOT, "src/data/duel-meta.json");
const OUT_REFERENCE = path.join(ROOT, "src/data/duel-commander-reference.json");
const OUT_COOC = path.join(ROOT, "src/data/duel-cooccurrence.json");

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
};
const WEEKS = argVal("--weeks", 12);
const KEEP_DAYS = argVal("--keep-days", 180);
const MAX_PAGES = argVal("--max-pages", 40);
const DRY = args.includes("--dry-run");
const DEBUG = args.includes("--debug");
const REBUILD_ONLY = args.includes("--rebuild-only");
const DELAY_MS = 800;
const UA = "MTGOpti/1.0 (+https://github.com/mako-studio/mtg-decks) duel-meta script";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastMtgtop8 = 0;
async function getText(url) {
  const wait = lastMtgtop8 + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastMtgtop8 = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return await res.text();
      console.warn(`  HTTP ${res.status} sur ${url} (essai ${attempt})`);
    } catch (e) {
      console.warn(`  échec réseau sur ${url} (essai ${attempt}) : ${e.message}`);
    }
    await sleep(1500 * attempt);
  }
  return null;
}

function parseDate(ddmmyy) {
  const m = ddmmyy.match(/(\d{2})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

export function parseMtgoExport(text) {
  const main = [];
  const side = [];
  let target = main;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^sideboard$/i.test(line)) {
      target = side;
      continue;
    }
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) target.push({ name: m[2].trim(), count: Number(m[1]) });
  }
  return { main, commanders: side.map((c) => c.name) };
}

async function loadArchive() {
  try {
    return JSON.parse(await readFile(ARCHIVE, "utf8"));
  } catch {
    return { decks: [] };
  }
}

/**
 * Nom canonique Scryfall + identité couleur de chaque nom (clé : nom saisi
 * en minuscules). Les cartes recto-verso sont souvent listées par leur seule
 * face avant sur mtgtop8 : on cherche par face avant et on garde le nom
 * complet Scryfall, qui est celui qu'utilise le site.
 */
async function scryfallLookup(names) {
  const out = new Map();
  const unique = Array.from(new Set(names));
  for (let i = 0; i < unique.length; i += 75) {
    const chunk = unique.slice(i, i + 75);
    await sleep(120);
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: chunk.map((name) => ({ name: name.split(" // ")[0].split(" / ")[0] })) }),
      });
      if (!res.ok) {
        console.warn(`  Scryfall HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      for (const card of data.data) {
        const info = { name: card.name, identity: card.color_identity, typeLine: card.type_line };
        out.set(card.name.toLowerCase(), info);
        for (const face of card.name.split(" // ")) out.set(face.toLowerCase(), info);
      }
    } catch (e) {
      console.warn(`  Scryfall indisponible : ${e.message}`);
    }
  }
  return out;
}

const BASICS = new Set(
  ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"].flatMap((b) => [b, `Snow-Covered ${b}`]).map((b) => b.toLowerCase())
);

async function main() {
  const since = new Date(Date.now() - WEEKS * 7 * 86400000);
  console.log(`Événements Duel Commander mtgtop8 depuis le ${since.toISOString().slice(0, 10)}${DRY ? " (dry-run)" : ""}`);

  const archive = await loadArchive();
  const known = new Set(archive.decks.map((d) => d.id));
  if (REBUILD_ONLY) {
    console.log(`--rebuild-only : recalcul depuis l'archive (${archive.decks.length} decks), sans téléchargement mtgtop8.`);
    return writeOutputs(archive);
  }

  // 1+2. Pages d'événements, puis decks de chaque événement.
  // La page de liste contient aussi des événements ANCIENS (colonne annexe,
  // constaté le 25/09/2026 : des tournois de 2013-2018 récupérés par
  // erreur) : on ne se fie donc qu'à la date lue sur la page de CHAQUE
  // événement. Un événement plus ancien que la fenêtre est ignoré ; on
  // arrête de paginer quand une page entière ne contient plus aucun
  // événement récent.
  const seen = new Set();
  let added = 0;
  let checked = 0;
  let emptyEvents = 0;
  let oldEvents = 0;
  for (let cp = 1; cp <= MAX_PAGES; cp++) {
    const listHtml = await getText(`https://mtgtop8.com/format?f=EDH&meta=115&cp=${cp}`);
    if (!listHtml) break;
    // Chaque événement apparaît souvent plusieurs fois sur la page : dédoublonné.
    const ids = Array.from(new Set(Array.from(listHtml.matchAll(/[?&]e=(\d+)(?:&amp;|&)f=EDH/g), (m) => m[1])));
    const fresh = ids.filter((id) => !seen.has(id));
    if (fresh.length === 0) break;
    fresh.forEach((id) => seen.add(id));
    console.log(`  page ${cp} : ${fresh.length} événements`);
    let recentOnPage = 0;

    for (const eventId of fresh) {
      if (DRY && checked >= 2) break;
      checked++;
      const html = await getText(`https://mtgtop8.com/event?e=${eventId}&f=EDH`);
      if (!html) continue;
      // Date : motif « N players - JJ/MM/AA » si présent, sinon 1re date de la page.
      const date = parseDate(html.match(/players?\s*-\s*(\d{2}\/\d{2}\/\d{2})/i)?.[1] ?? html.match(/\b\d{2}\/\d{2}\/\d{2}\b/)?.[0] ?? "");
      if (date && date < since) {
        oldEvents++;
        continue;
      }
      recentOnPage++;
      // Liens de deck : on ne suppose rien sur le préfixe de l'URL (absolue, relative,
      // « ?e=… » seul) ni sur l'encodage de « & » — seulement « e=<id> » suivi de « d=<deck> ».
      const deckRe = new RegExp(`e=${eventId}(?:&amp;|&)d=(\\d+)|d=(\\d+)(?:&amp;|&)e=${eventId}`, "g");
      const deckIds = Array.from(new Set(Array.from(html.matchAll(deckRe), (m) => m[1] ?? m[2])));
      console.log(`  [${checked}] événement ${eventId}${date ? ` (${date.toISOString().slice(0, 10)})` : ""} : ${deckIds.length} deck(s)`);
      if (deckIds.length === 0) {
        emptyEvents++;
        if (DEBUG || emptyEvents === 1) {
          const debugFile = path.join(ROOT, "analysis/duelcommander/_debug-event.html");
          await mkdir(path.dirname(debugFile), { recursive: true });
          await writeFile(debugFile, html, "utf8");
          const sample = Array.from(html.matchAll(/href="([^"]*d=\d+[^"]*)"/g), (m) => m[1]).slice(0, 5);
          console.warn(`    Aucun lien de deck reconnu. Page enregistrée dans ${path.relative(ROOT, debugFile)} ; liens contenant « d= » : ${JSON.stringify(sample)}`);
        }
      }
      for (const deckId of deckIds) {
        if (known.has(deckId)) continue;
        const text = await getText(`https://mtgtop8.com/mtgo?d=${deckId}`);
        if (!text) continue;
        const { main: cards, commanders } = parseMtgoExport(text);
        const deckTotal = cards.reduce((s, c) => s + c.count, 0) + commanders.length;
        if (commanders.length === 0 || deckTotal < 95 || deckTotal > 102) {
          console.warn(`    deck ${deckId} ignoré (${deckTotal} cartes, ${commanders.length} commandant(s))`);
          continue;
        }
        archive.decks.push({ id: deckId, event: eventId, date: date ? date.toISOString().slice(0, 10) : null, commanders, cards });
        known.add(deckId);
        added++;
        if (DRY) console.log(`    ✓ deck ${deckId} : ${commanders.join(" + ")} (${cards.length + commanders.length} lignes)`);
      }
    }
    if (DRY) break;
    if (recentOnPage === 0) {
      console.log(`  page ${cp} : plus aucun événement dans la fenêtre, arrêt.`);
      break;
    }
  }
  if (seen.size === 0) {
    console.error("Aucun événement trouvé : la structure de mtgtop8 a peut-être changé. Rien n'est écrit.");
    process.exit(1);
  }
  console.log(
    `${added} nouveaux decks (${checked} événements parcourus, ${oldEvents} hors fenêtre ignorés, ${emptyEvents} sans deck reconnu), archive : ${archive.decks.length} decks.`
  );
  if (DRY) {
    console.log("Dry-run : rien n'est écrit.");
    return;
  }
  if (archive.decks.length === 0) {
    console.error("Archive vide : rien n'est écrit (duel-meta.json actuel conservé).");
    process.exit(1);
  }
  await mkdir(path.dirname(ARCHIVE), { recursive: true });
  await writeFile(ARCHIVE, JSON.stringify(archive) + "\n", "utf8");

  await writeOutputs(archive);
}

async function writeOutputs(archive) {
  const keepSince = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const decks = archive.decks.filter((d) => !d.date || d.date >= keepSince);
  const allNames = decks.flatMap((d) => [...d.commanders, ...d.cards.map((c) => c.name)]);
  console.log(`Noms canoniques et identités couleur via Scryfall pour ${new Set(allNames).size} cartes…`);
  const lookup = await scryfallLookup(allNames);
  const { meta, reference, cooccurrence } = computeOutputs(decks, lookup);
  await writeFile(OUT, JSON.stringify(meta, null, 0) + "\n", "utf8");
  await writeFile(OUT_REFERENCE, JSON.stringify(reference) + "\n", "utf8");
  await writeFile(OUT_COOC, JSON.stringify(cooccurrence) + "\n", "utf8");
  console.log(
    `duel-meta.json : ${meta.deckCount} decks, ${Object.keys(meta.cards).length} cartes, ${Object.keys(meta.commanders).length} commandants.`
  );
  console.log(`duel-commander-reference.json : ${Object.keys(reference.commanders).length} commandants/duos de référence.`);
  console.log(`duel-cooccurrence.json : ${Object.keys(cooccurrence.cards).length} cartes avec des partenaires fréquents.`);
  console.log("Pense à vérifier le site puis à commiter ces fichiers (GitHub Desktop).");
}

const round3 = (x) => Math.round(x * 1000) / 1000;
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));

/**
 * Calcul pur des trois fichiers à partir des decks archivés (testable sans
 * réseau). `lookup` : nom (minuscules) → { name canonique, identity }.
 * Sans entrée dans `lookup`, un nom est gardé tel quel (identité inconnue).
 */
export function computeOutputs(decks, lookup, opts = {}) {
  const minRefDecks = opts.minRefDecks ?? 2;
  const minCoGroups = opts.minCoGroups ?? 4;
  const minLift = opts.minLift ?? 2;
  const minConfidence = opts.minConfidence ?? 0.7;
  // Chaque carte de la paire doit apparaître dans au moins `minSupportEach`
  // decks : sur des cartes rares (5-6 decks), une coïncidence suffit à
  // produire une « synergie » (testé : 81 faux positifs sans ce seuil).
  const minSupportEach = opts.minSupportEach ?? 5;
  const canon = (n) => lookup.get(n.toLowerCase())?.name ?? n;
  const identityOf = (n) => lookup.get(n.toLowerCase())?.identity ?? null;

  // Decks normalisés : noms canoniques, commandants dédoublonnés (une carte
  // recto-verso listée par ses deux faces redevient UN commandant).
  const norm = decks.map((d) => {
    const commanders = Array.from(new Set(d.commanders.map(canon))).sort();
    const cards = Array.from(new Set(d.cards.map((c) => canon(c.name)))).filter((n) => !BASICS.has(n.toLowerCase()));
    const identity = new Set(commanders.flatMap((c) => identityOf(c) ?? []));
    return { id: d.id, event: d.event, date: d.date, commanders, cards, identity };
  });

  // --- duel-meta.json ---
  const counts = new Map();
  const commanderCounts = new Map();
  for (const d of norm) {
    for (const c of d.commanders) commanderCounts.set(c, (commanderCounts.get(c) ?? 0) + 1);
    for (const n of d.cards) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const eligibleCount = (name) => {
    const id = identityOf(name);
    if (!id) return null;
    return norm.filter((d) => id.every((c) => d.identity.has(c))).length;
  };
  const cards = {};
  const cardsInColors = {};
  for (const [name, n] of counts) {
    if (n < 2) continue;
    cards[name] = round3(n / norm.length);
    const e = eligibleCount(name);
    if (e) cardsInColors[name] = round3(Math.min(1, n / e));
  }
  const dates = norm.map((d) => d.date).filter(Boolean).sort();
  const meta = {
    source: `mtgtop8.com — ${norm.length} decks Duel Commander de tournoi (scripts/fetch-duel-meta.mjs)`,
    period: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : null,
    deckCount: norm.length,
    cards: sortObj(cards),
    cardsInColors: sortObj(cardsInColors),
    commanders: sortObj(Object.fromEntries(commanderCounts)),
  };

  // --- duel-commander-reference.json ---
  const byCommander = new Map();
  for (const d of norm) {
    const key = d.commanders.join(" + ");
    if (!byCommander.has(key)) byCommander.set(key, []);
    byCommander.get(key).push(d);
  }
  const refCommanders = {};
  for (const [key, list] of byCommander) {
    if (list.length < minRefDecks) continue;
    const c = new Map();
    for (const d of list) for (const n of d.cards) c.set(n, (c.get(n) ?? 0) + 1);
    const refCards = {};
    for (const [n, k] of c) {
      const share = k / list.length;
      if (share >= 0.25) refCards[n] = round3(share);
    }
    const recent = [...list].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 3);
    refCommanders[key] = {
      deckCount: list.length,
      cards: sortObj(refCards),
      samples: recent.map((d) => ({ event: d.event, deck: d.id, date: d.date })),
    };
  }
  const reference = { deckCount: norm.length, period: meta.period, commanders: refCommanders };

  // --- duel-cooccurrence.json ---
  // Unité de compte = un COMMANDANT (ou duo), pas un deck : constaté sur les
  // vrais decks du 25/09/2026, compter par deck faisait ressortir « le deck
  // de Cloud » ou « le deck Selesnya » (20 listes quasi identiques gonflent
  // toutes leurs paires) — c'est de l'archétype, déjà couvert par
  // duel-commander-reference.json. En comptant chaque commandant une fois,
  // une paire doit être jouée ensemble par PLUSIEURS archétypes différents
  // pour ressortir : c'est une synergie qui voyage (ex. une combo).
  // Une carte « appartient » à un commandant si elle est dans ≥ 50% de ses
  // decks. Terrains exclus (leur co-occurrence reflète les couleurs).
  // Lift = P(A et B) / (P(A) × P(B)) parmi les commandants dont les couleurs
  // permettent les deux cartes ; gardé si ensemble chez ≥ minCoGroups
  // commandants, chaque carte chez ≥ minSupportEach, confiance ≥ minConfidence.
  const isLand = (n) => lookup.get(n.toLowerCase())?.isLand === true || /\b(Land|Forest|Island|Plains|Swamp|Mountain)\b/.test(lookup.get(n.toLowerCase())?.typeLine ?? "");
  const groups = [];
  for (const list of byCommander.values()) {
    const c = new Map();
    for (const d of list) for (const n of d.cards) c.set(n, (c.get(n) ?? 0) + 1);
    const cardsOf = Array.from(c.entries())
      .filter(([n, k]) => k / list.length >= 0.5 && !isLand(n))
      .map(([n]) => n);
    groups.push({ identity: list[0].identity, cards: new Set(cardsOf) });
  }
  const groupCounts = new Map();
  for (const g of groups) for (const n of g.cards) groupCounts.set(n, (groupCounts.get(n) ?? 0) + 1);
  const frequent = Array.from(groupCounts.entries()).filter(([, k]) => k >= minSupportEach).map(([n]) => n);
  const idx = new Map(frequent.map((n, i) => [n, i]));
  const pair = new Map();
  for (const g of groups) {
    const ids = Array.from(g.cards).filter((n) => idx.has(n)).map((n) => idx.get(n));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const x = Math.min(ids[i], ids[j]);
        const y = Math.max(ids[i], ids[j]);
        const k = x * 100000 + y;
        pair.set(k, (pair.get(k) ?? 0) + 1);
      }
    }
  }
  const partners = new Map();
  const poolStats = new Map();
  const statsFor = (colors) => {
    const key = [...colors].sort().join("");
    let st = poolStats.get(key);
    if (!st) {
      const pool = groups.filter((g) => colors.every((c) => g.identity.has(c)));
      const perCard = new Map();
      for (const g of pool) for (const n of g.cards) perCard.set(n, (perCard.get(n) ?? 0) + 1);
      st = { N: pool.length, perCard };
      poolStats.set(key, st);
    }
    return st;
  };
  for (const [k, together] of pair) {
    if (together < minCoGroups) continue;
    const a = frequent[Math.floor(k / 100000)];
    const b = frequent[k % 100000];
    const colors = Array.from(new Set([...(identityOf(a) ?? []), ...(identityOf(b) ?? [])]));
    const { N, perCard } = statsFor(colors);
    const na = perCard.get(a) ?? 0;
    const nb = perCard.get(b) ?? 0;
    if (!N || na < minSupportEach || nb < minSupportEach) continue;
    const lift = (together / N) / ((na / N) * (nb / N));
    const confidence = together / Math.min(na, nb);
    if (lift < minLift || confidence < minConfidence) continue;
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!partners.has(x)) partners.set(x, []);
      partners.get(x).push({ name: y, lift: Math.round(lift * 10) / 10, together, confidence: round3(confidence) });
    }
  }
  const coCards = {};
  for (const [name, list] of partners) {
    coCards[name] = list.sort((p, q) => q.lift * Math.log(1 + q.together) - p.lift * Math.log(1 + p.together)).slice(0, 10);
  }
  const cooccurrence = {
    deckCount: norm.length,
    commanderCount: groups.length,
    unit: "commandant (une voix par commandant ou duo, carte comptée si jouée dans ≥ 50% de ses decks)",
    minCommanders: minCoGroups,
    minLift,
    minConfidence,
    cards: coCards,
  };

  return { meta, reference, cooccurrence };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => {
  console.error(e);
  process.exit(1);
});

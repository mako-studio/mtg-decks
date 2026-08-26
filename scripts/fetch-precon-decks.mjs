#!/usr/bin/env node
/**
 * Récupère les decks préconstruits depuis le jeu de données communautaire
 * "magic-preconstructed-decks-data" (taw), publié sur GitHub :
 * https://github.com/taw/magic-preconstructed-decks-data
 *
 * Ce dataset agrège les decklists officielles (Wizards of the Coast) pour
 * tous les produits Magic. Chaque entrée référence sa source officielle
 * (magic.wizards.com) dans le champ "source". On en extrait trois vues :
 *
 * - type === "Commander Deck"     -> src/data/commander-decks.json
 *   (decks Commander préconstruits papier, 2011 → aujourd'hui)
 * - type === "Brawl Deck"         -> src/data/arena-brawl-decks.json
 *   (les seuls decks Brawl officiels jamais commercialisés : vague
 *   Throne of Eldraine 2019 — voir avertissement dans le README, ces
 *   decks datent et leur légalité Historic Brawl actuelle n'est pas
 *   garantie, elle est vérifiée à la volée via Scryfall)
 * - type === "Arena Starter Deck" ou "Arena Starter Kit"
 *                                  -> src/data/arena-starter-decks.json
 *   (decks de démarrage Arena officiels, à utiliser comme base pour un
 *   deck constructed Standard/Historic/Explorer/Alchemy/Timeless)
 *
 * Relancer ce script pour rafraîchir ces listes : `npm run fetch-decks`
 */

const SOURCE_URL =
  "https://raw.githubusercontent.com/taw/magic-preconstructed-decks-data/master/decks_v2.json";

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function slimify(decks, { prefix }) {
  const seenSlugs = new Map();
  const slim = decks.map((deck) => {
    const commanderNames = (deck.commander || []).map((c) => c.name);

    const cardMap = new Map();
    for (const c of deck.cards || []) {
      if (commanderNames.includes(c.name)) continue;
      const prev = cardMap.get(c.name) || 0;
      cardMap.set(c.name, prev + (c.count || 1));
    }
    const cards = Array.from(cardMap.entries()).map(([name, count]) => ({
      name,
      count,
    }));

    let baseSlug = `${prefix}${deck.set_code}-${slugify(deck.name)}`;
    let slug = baseSlug;
    let i = 2;
    while (seenSlugs.has(slug)) {
      slug = `${baseSlug}-${i++}`;
    }
    seenSlugs.set(slug, true);

    return {
      id: slug,
      name: deck.name,
      setCode: deck.set_code,
      setName: deck.set_name,
      releaseDate: deck.release_date,
      commanders: commanderNames,
      cardCount: cards.length + commanderNames.length,
      cards,
      source: deck.source || null,
    };
  });

  slim.sort((a, b) => (b.releaseDate || "").localeCompare(a.releaseDate || ""));
  return slim;
}

async function writeJson(relativePath, data) {
  const fs = await import("node:fs/promises");
  const outPath = new URL(relativePath, import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  console.log(`Écrit ${data.length} decks dans ${outPath.pathname}`);
}

async function main() {
  console.log(`Téléchargement de ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Échec du téléchargement : HTTP ${res.status}`);
  }
  const all = await res.json();
  console.log(`${all.length} decks au total dans le dataset.`);

  const commanderDecks = all.filter((d) => d.type === "Commander Deck");
  const brawlDecks = all.filter((d) => d.type === "Brawl Deck");
  const arenaStarterDecks = all.filter(
    (d) => d.type === "Arena Starter Deck" || d.type === "Arena Starter Kit"
  );

  console.log(
    `${commanderDecks.length} Commander Deck, ${brawlDecks.length} Brawl Deck, ${arenaStarterDecks.length} Arena Starter Deck/Kit.`
  );

  await writeJson("../src/data/commander-decks.json", slimify(commanderDecks, { prefix: "" }));
  await writeJson(
    "../src/data/arena-brawl-decks.json",
    slimify(brawlDecks, { prefix: "brawl-" })
  );
  await writeJson(
    "../src/data/arena-starter-decks.json",
    slimify(arenaStarterDecks, { prefix: "starter-" })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

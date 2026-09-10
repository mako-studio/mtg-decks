import { parseCsvRows } from "./csv-import";

/**
 * Import d'une LISTE DE CARTES POSSÉDÉES (collection), pas d'un deck — pour
 * la fonctionnalité "construire un deck avec ma collection" (05/09/2026,
 * demande de Ben). Deux formats acceptés en entrée, chacun sa fonction :
 * texte collé libre (parseCollectionText) et fichier CSV (parseCollectionCsv,
 * réutilise le parseur RFC4180 de csv-import.ts).
 *
 * Différence importante avec csv-import.ts/arena-format.ts : il n'y a ici NI
 * notion de commandant, NI de "ajoutée via suggestion" — juste "quelles
 * cartes, combien d'exemplaires". Le commandant est détecté automatiquement
 * plus tard (voir collection-builder.ts) à partir des cartes résolues
 * auprès de Scryfall, pas depuis l'import.
 *
 * Philosophie volontairement permissive et silencieuse (même esprit que
 * parseDeckCsv) : une ligne mal formée est ignorée plutôt que de faire
 * échouer tout l'import — beaucoup d'outils de gestion de collection
 * exportent des formats légèrement différents (avec/sans quantité, avec un
 * set entre parenthèses, etc.), et Ben ne devrait pas avoir à nettoyer sa
 * liste à la main avant de la coller.
 */

export interface ParsedCollection {
  ok: boolean;
  error: string | null;
  cards: { name: string; count: number }[];
}

function fail(error: string): ParsedCollection {
  return { ok: false, error, cards: [] };
}

/** Agrège des entrées {name,count} par nom (insensible à la casse) — une même carte peut apparaître sur plusieurs lignes (exports fusionnés, doublons de collection physique). */
function mergeCounts(entries: { name: string; count: number }[]): { name: string; count: number }[] {
  const byKey = new Map<string, { name: string; count: number }>();
  for (const e of entries) {
    const key = e.name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.count += e.count;
    else byKey.set(key, { name: e.name, count: e.count });
  }
  return Array.from(byKey.values());
}

/**
 * Parse une ligne de texte libre représentant une carte possédée. Formats
 * reconnus, par ordre d'essai :
 * - "4 Sol Ring" / "4x Sol Ring" (quantité devant, "x" optionnel)
 * - "Sol Ring x4" / "Sol Ring x 4" (quantité derrière, style export Arena)
 * - "Sol Ring" seule (quantité implicite : 1)
 * Un suffixe entre parenthèses ou crochets (édition/numéro de collection,
 * ex: "Sol Ring (CMR) 234" ou "Sol Ring [CMR]") est retiré avant analyse :
 * beaucoup d'outils de collection l'ajoutent, et il ne fait pas partie du
 * nom de carte que Scryfall reconnaît. Lignes vides ou commentaires
 * ("//", "#") ignorées.
 */
function parseCollectionLine(line: string): { name: string; count: number } | null {
  let l = line.trim();
  if (!l || l.startsWith("//") || l.startsWith("#")) return null;

  // Retire un suffixe (édition/numéro de collection) entre parenthèses ou
  // crochets en fin de ligne, éventuellement suivi d'un numéro isolé
  // (ex: "Sol Ring (CMR) 234").
  l = l
    .replace(/\s*[([][^)\]]*[)\]]\s*\d*\s*$/, "")
    .trim();
  if (!l) return null;

  let m = l.match(/^(\d+)\s*x?\s+(.+)$/i);
  if (m) {
    const count = parseInt(m[1], 10);
    const name = m[2].trim();
    if (name && Number.isFinite(count) && count > 0) return { name, count };
  }

  m = l.match(/^(.+?)\s+x\s*(\d+)$/i);
  if (m) {
    const count = parseInt(m[2], 10);
    const name = m[1].trim();
    if (name && Number.isFinite(count) && count > 0) return { name, count };
  }

  return { name: l, count: 1 };
}

export function parseCollectionText(raw: string): ParsedCollection {
  const lines = raw.split(/\r?\n/);
  const entries: { name: string; count: number }[] = [];
  for (const line of lines) {
    const parsed = parseCollectionLine(line);
    if (parsed) entries.push(parsed);
  }
  if (entries.length === 0) {
    return fail("Aucune carte reconnue dans cette liste. Une carte par ligne, ex. \"4 Sol Ring\" ou \"Sol Ring x4\".");
  }
  return { ok: true, error: null, cards: mergeCounts(entries) };
}

/**
 * Parse un CSV de collection. Colonnes reconnues par intitulé (insensible à
 * la casse, ordre indifférent) : quantité ("nombre", "count", "qty",
 * "quantité", "quantity") et nom ("nom", "name") — mêmes regex que
 * parseDeckCsv (csv-import.ts) pour rester cohérent avec le reste du site,
 * mais sans les colonnes commandant/ajoutée/retirer (une collection n'a pas
 * cette notion). Les autres colonnes éventuelles (édition, foil, langue,
 * prix...) sont ignorées silencieusement plutôt que de faire échouer
 * l'import — beaucoup d'exports d'outils tiers en ont.
 *
 * Si aucune colonne de quantité n'est trouvée, chaque ligne compte pour 1
 * exemplaire (certains exports de collection listent juste des noms, une
 * ligne par carte physique possédée).
 */
export function parseCollectionCsv(raw: string): ParsedCollection {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    return fail("Fichier CSV vide ou illisible.");
  }

  const header = rows[0].map((h) => h.trim());
  const idxName = header.findIndex((h) => /^(nom|name)$/i.test(h));
  const idxCount = header.findIndex((h) => /^(nombre|count|qty|quantité|quantity)$/i.test(h));

  if (idxName === -1) {
    return fail('Colonne "Nom" introuvable dans ce fichier CSV.');
  }

  const entries: { name: string; count: number }[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((cell) => !cell.trim())) continue;
    const name = (row[idxName] ?? "").trim();
    if (!name) continue;
    const count = idxCount !== -1 ? parseInt((row[idxCount] ?? "").trim(), 10) : 1;
    if (!Number.isFinite(count) || count <= 0) continue;
    entries.push({ name, count });
  }

  if (entries.length === 0) {
    return fail("Aucune carte reconnue dans ce fichier.");
  }
  return { ok: true, error: null, cards: mergeCounts(entries) };
}

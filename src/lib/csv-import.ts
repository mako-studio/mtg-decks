/**
 * Import d'un deck depuis un CSV — pensé pour reprendre un CSV exporté
 * depuis ce site (bouton "Exporter en CSV" dans DeckBuilder.tsx), afin de
 * reprendre une session d'optimisation plus tard : le fichier réexporté
 * contient déjà quelles cartes ont été ajoutées via suggestion et
 * lesquelles sont marquées "à retirer", donc on les restaure aussi (pas
 * seulement la liste de cartes) pour reprendre exactement là où on
 * s'était arrêté.
 *
 * Colonnes reconnues (recherchées par intitulé, insensible à la casse,
 * ordre indifférent — un tableur peut les avoir réordonnées) :
 * "Commandant", "Nombre", "Nom", "Ajoutée via suggestion", "Marquée à
 * retirer". Seules "Nombre" et "Nom" sont obligatoires ; le reste est
 * optionnel et ignoré silencieusement si absent (CSV plus simple fait à
 * la main, par exemple). Compatibilité ascendante : les exports générés
 * avant l'ajout d'une colonne "Commandant" dédiée marquaient le
 * commandant via la valeur "non (commandant)" dans la colonne "Ajoutée
 * via suggestion" — toujours reconnue en repli si "Commandant" est absente.
 */

export interface ParsedDeckCsv {
  ok: boolean;
  error: string | null;
  commanders: string[];
  cards: { name: string; count: number }[];
  addedNames: string[];
  markedForRemoval: string[];
}

function fail(error: string): ParsedDeckCsv {
  return { ok: false, error, commanders: [], cards: [], addedNames: [], markedForRemoval: [] };
}

function isYes(value: string | undefined): boolean {
  return /^\s*(oui|yes|true|1)\s*$/i.test(value ?? "");
}

/**
 * Parseur CSV minimal mais correct (RFC 4180) : gère les champs entre
 * guillemets, avec virgules, guillemets doublés (`""` -> `"`) et retours
 * à la ligne à l'intérieur — indispensable ici, beaucoup de noms de
 * cartes MTG contiennent une virgule (ex: "Krenko, Mob Boss"), donc un
 * simple `split(",")` casserait l'import.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export function parseDeckCsv(raw: string): ParsedDeckCsv {
  // Retire le BOM UTF-8 ajouté par notre propre export (pour qu'Excel
  // affiche correctement les accents) — sinon il resterait collé au
  // premier caractère du header et casserait la détection de colonne.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    return fail("Fichier CSV vide ou illisible.");
  }

  const header = rows[0].map((h) => h.trim());
  const idxCount = header.findIndex((h) => /^(nombre|count|qty|quantité|quantity)$/i.test(h));
  const idxName = header.findIndex((h) => /^(nom|name)$/i.test(h));
  const idxCommander = header.findIndex((h) => /commandant/i.test(h));
  const idxAdded = header.findIndex((h) => /ajout/i.test(h));
  const idxMarked = header.findIndex((h) => /retirer/i.test(h));

  if (idxCount === -1 || idxName === -1) {
    return fail(
      'Colonnes "Nombre" et "Nom" introuvables dans ce fichier. Utilise un CSV exporté depuis ce site (bouton "Exporter en CSV").'
    );
  }

  const commanders: string[] = [];
  const cards: { name: string; count: number }[] = [];
  const addedNames: string[] = [];
  const markedForRemoval: string[] = [];

  for (const row of rows.slice(1)) {
    if (row.every((cell) => !cell.trim())) continue;

    const name = (row[idxName] ?? "").trim();
    const count = parseInt((row[idxCount] ?? "").trim(), 10);
    // Ligne mal formée (nom vide, quantité non numérique) : ignorée
    // silencieusement plutôt que de faire échouer tout l'import pour une
    // seule ligne abîmée (ex: ligne de total ajoutée à la main dans Excel).
    if (!name || !Number.isFinite(count) || count <= 0) continue;

    const isCommanderRow =
      idxCommander !== -1
        ? isYes(row[idxCommander])
        : idxAdded !== -1 && /commandant/i.test(row[idxAdded] ?? "");

    if (isCommanderRow) {
      commanders.push(name);
      continue;
    }

    cards.push({ name, count });
    if (idxAdded !== -1 && isYes(row[idxAdded])) addedNames.push(name.toLowerCase());
    if (idxMarked !== -1 && isYes(row[idxMarked])) markedForRemoval.push(name.toLowerCase());
  }

  if (cards.length === 0 && commanders.length === 0) {
    return fail("Aucune carte reconnue dans ce fichier.");
  }

  return { ok: true, error: null, commanders, cards, addedNames, markedForRemoval };
}

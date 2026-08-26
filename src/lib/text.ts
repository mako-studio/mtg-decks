/**
 * Petits utilitaires texte partagés (recherche insensible aux accents,
 * identifiants d'ancre) — utilisés par le Glossaire et la section
 * Extensions.
 */

/** Normalise une chaîne pour une comparaison de recherche insensible à la casse et aux accents. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Identifiant d'ancre stable à partir d'un texte (ex: nom anglais d'un terme de glossaire). */
export function slugify(value: string): string {
  return normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/**
 * Formate une date ISO ("YYYY-MM-DD...") en français ("2 août 2024"), en
 * découpant la chaîne directement plutôt que via `new Date(...)` — évite
 * un décalage d'un jour selon le fuseau horaire du serveur de rendu
 * (`new Date("2024-08-02")` est interprété en UTC minuit, puis
 * `toLocaleDateString` l'affiche dans le fuseau local, qui peut faire
 * "reculer" la date d'un jour à l'ouest de l'UTC).
 */
export function formatFrenchDate(iso: string | null | undefined): string {
  if (!iso) return "date inconnue";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, year, month, day] = m;
  const monthLabel = MONTHS_FR[parseInt(month, 10) - 1] ?? month;
  return `${parseInt(day, 10)} ${monthLabel} ${year}`;
}

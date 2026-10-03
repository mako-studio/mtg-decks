/**
 * Étapes du constructeur compétitif, partagées entre le serveur (qui les
 * émet, competitive-run.ts) et l'interface (qui les affiche dès le départ,
 * CompetitiveBuilder.tsx). Fichier sans aucun import : utilisable des deux
 * côtés (03/10/2026, demande de Ben : « un loader afin que le user ait de la
 * visibilité sur la progression de la tâche et ses étapes »).
 *
 * `weight` : part approximative de la durée totale, pour la barre globale.
 * Estimations d'après un essai sur une collection de 1 480 cartes avec un
 * Scryfall simulé — les durées réelles dépendent surtout du réseau.
 */
export const BUILD_STEPS = [
  { key: "resolve", label: "Lecture de ta liste (reconnaissance des cartes auprès de Scryfall)", weight: 18 },
  { key: "commanders", label: "Recherche des commandants possibles (ta liste, populaires, tournoi, sorties récentes)", weight: 8 },
  { key: "pool", label: "Chargement du pool de cartes recommandées (staples, Game Changers, combos)", weight: 14 },
  { key: "rank", label: "Un deck par commandant : construction et classement", weight: 14 },
  { key: "synergy", label: "Recherche de cartes en synergie pour les meilleurs decks", weight: 10 },
  { key: "combos", label: "Combos disponibles et à une carte près (Commander Spellbook)", weight: 10 },
  { key: "playtest", label: "Plans de jeu : variantes, parties simulées, ajustements", weight: 18 },
  { key: "finalize", label: "Estimation finale, plan de jeu détaillé et staples manquants", weight: 8 },
] as const;

export type BuildStepKey = (typeof BUILD_STEPS)[number]["key"];

export interface BuildProgress {
  /** Indice de l'étape dans BUILD_STEPS. */
  step: number;
  total: number;
  key: BuildStepKey;
  label: string;
  /** Ce qui est en cours dans l'étape (« Deck 12/40 : … »). */
  detail?: string;
  /** Avancement dans l'étape, 0 à 1. */
  fraction: number;
}

/** Avancement global 0-1 à partir d'un événement de progression. */
export function overallProgress(p: Pick<BuildProgress, "step" | "fraction">): number {
  const total = BUILD_STEPS.reduce((s, x) => s + x.weight, 0);
  const before = BUILD_STEPS.slice(0, p.step).reduce((s, x) => s + x.weight, 0);
  return (before + (BUILD_STEPS[p.step]?.weight ?? 0) * p.fraction) / total;
}

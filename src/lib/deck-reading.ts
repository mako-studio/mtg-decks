/**
 * Vocabulaire de la « lecture du deck » (deck-audit.ts), dans un module SANS
 * dépendance : les composants client (DeckBuilder, CardTile) en ont besoin
 * pour ranger et libeller les cartes, et importer deck-audit.ts côté
 * navigateur y embarquerait toutes les données de tournoi (plusieurs
 * centaines de Ko de JSON). 04/10/2026.
 */

export type VerdictLevel = "ok" | "contre-intuitif" | "discutable" | "contre-productif";

export type RoleGroup =
  | "plan"
  | "soutien"
  | "contresort"
  | "reponse"
  | "perturbation"
  | "mana"
  | "pioche"
  | "recherche"
  | "protection"
  | "menace"
  | "autre"
  | "terrain";

export const ROLE_GROUP_LABELS: Record<RoleGroup, string> = {
  plan: "Cœur du plan",
  soutien: "Soutien du plan",
  contresort: "Contresorts",
  reponse: "Réponses",
  perturbation: "Perturbation",
  mana: "Mana",
  pioche: "Pioche et sélection",
  recherche: "Recherche",
  protection: "Protection",
  menace: "Menaces",
  autre: "Autres",
  terrain: "Terrains",
};

/** Ordre d'affichage des groupes sur la page de deck. */
export const ROLE_GROUP_ORDER: RoleGroup[] = ["plan", "soutien", "menace", "contresort", "reponse", "perturbation", "pioche", "recherche", "mana", "protection", "autre", "terrain"];


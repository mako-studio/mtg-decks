import type { FormatConfig, ScryfallCard } from "./types";
import { getDisplayOracleText } from "./scryfall";
import { DUEL_BANNED, DUEL_BANNED_AS_COMMANDER } from "@/data/duel-banlist";

/**
 * Utilitaires partagés de construction de deck Commander/Duel Commander.
 *
 * Historique : ce fichier contenait jusqu'au 24/09/2026 tout le moteur
 * « deck depuis ma collection » (sélection itérative par pilier,
 * `selectDeckFromPool`, `rankCommanderCandidates`, `prepareCandidatePool`
 * — voir les sections datées du README et `git log` pour son évolution).
 * Le 25/09/2026, ce moteur a été REMPLACÉ par le constructeur compétitif
 * (competitive-builder.ts, demande de Ben : viser le Tier 4 en priorité
 * absolue, commandant dans la liste ou non, pool de cartes recommandées) :
 * sélection au gain marginal EXACT de tier, synergie avec le commandant,
 * combos, profils Multi/Duel. Les anciennes fonctions de sélection n'avaient
 * plus d'appelant et ont été retirées pour ne pas laisser deux moteurs
 * concurrents ; seuls restent ici les utilitaires réutilisés par
 * competitive-builder.ts, competitive-actions.ts et actions.ts (Super Opti).
 */

/**
 * Une carte peut-elle être commandant ? Deux cas reconnus par les règles
 * Commander officielles :
 * - créature légendaire ("Legendary" + "Creature" dans type_line) ;
 * - toute carte dont le texte oracle dit explicitement "can be your
 *   commander" (planeswalkers commandants de certains produits, ex.
 *   Commander Legends).
 * Les "Background" (type_line contient "Background") sont exclus : une
 * carte Background ne peut être commandant QUE comme partenaire d'une
 * créature ayant "Choose a Background", jamais seule — et ce module ne gère
 * qu'un commandant unique en v1 (pas de partenaires/Background), voir
 * le constructeur (competitive-builder.ts).
 */
export function isCommanderEligible(card: ScryfallCard): boolean {
  const typeLine = card.type_line ?? "";
  if (typeLine.includes("Background")) return false;
  const isLegendaryCreature = typeLine.includes("Legendary") && typeLine.includes("Creature");
  if (isLegendaryCreature) return true;
  return /can be your commander/i.test(getDisplayOracleText(card));
}

/** Légalité d'une carte pour le format donné (legal ou restricted comptent comme jouable — même convention que evaluateCardForDeck dans actions.ts). */
export function isLegalInFormat(card: ScryfallCard, format: FormatConfig): boolean {
  const status = card.legalities?.[format.scryfallLegality];
  if (status !== "legal" && status !== "restricted") return false;
  // 26/09/2026 : banlist officielle Duel en plus de Scryfall (au cas où
  // Scryfall serait en retard sur une annonce — voir data/duel-banlist.ts).
  if (format.key === "duelcommander" && DUEL_BANNED_SET.has(frontName(card))) return false;
  return true;
}

const frontName = (card: ScryfallCard) => card.name.toLowerCase().split(" // ")[0];
const DUEL_BANNED_SET = new Set(DUEL_BANNED.map((n) => n.toLowerCase()));
const DUEL_BANNED_AS_COMMANDER_SET = new Set(DUEL_BANNED_AS_COMMANDER.map((n) => n.toLowerCase()));

/**
 * Peut-elle être le commandant d'un deck de CE format ? (26/09/2026)
 * En Duel Commander, certaines cartes sont « bannies comme commandant » :
 * jouables dans les 99, pas en zone de commandement. Scryfall les marque
 * `restricted` pour le format duel (vérifié sur 19 d'entre elles dans nos
 * données), et la liste officielle (data/duel-banlist.ts) sert de filet.
 */
export function canBeCommanderInFormat(card: ScryfallCard, format: FormatConfig): boolean {
  if (!isLegalInFormat(card, format)) return false;
  if (format.key === "duelcommander") {
    if (card.legalities?.[format.scryfallLegality] === "restricted") return false;
    if (DUEL_BANNED_AS_COMMANDER_SET.has(frontName(card))) return false;
  }
  return true;
}

/**
 * Table couleur -> terrain de base. Source unique (05/09/2026) : actions.ts
 * l'importe d'ici pour `topUpLandCount` (Super Opti), et
 * competitive-builder.ts pour compléter les decks en terrains de base — même besoin exact (cycler les couleurs de
 * l'identité pour choisir un terrain de base à ajouter), pas de raison de
 * dupliquer.
 */
const BASIC_LAND_BY_COLOR: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

export { BASIC_LAND_BY_COLOR };

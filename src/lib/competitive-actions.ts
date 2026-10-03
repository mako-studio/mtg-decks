"use server";

import { analyzeDeck, type DeckAnalysisResult } from "./actions";
import { runCompetitiveBuildCore, type AcquisitionOption, type CompetitiveBuildResult } from "./competitive-run";

/**
 * Server Actions du constructeur compétitif. Le déroulé lui-même est dans
 * competitive-run.ts (03/10/2026) : il accepte une fonction de progression,
 * ce qu'une Server Action ne peut pas recevoir du navigateur.
 *
 * L'interface appelle d'abord la route de flux
 * (src/app/api/competitive-build/route.ts), qui renvoie les étapes en
 * direct ; `runCompetitiveBuild` reste le REPLI si ce flux échoue (réseau
 * ou hébergement qui met la réponse en tampon) — même résultat, sans les
 * étapes.
 */
export async function runCompetitiveBuild(input: {
  formatKey: string;
  collectionCards: { name: string; count: number }[];
  maxAcquisitions: AcquisitionOption;
}): Promise<CompetitiveBuildResult> {
  return runCompetitiveBuildCore(input);
}

/**
 * Ouvre un deck proposé dans le simulateur (DeckBuilder) : simple délégation
 * à `analyzeDeck` avec la liste déjà construite — aucune reconstruction,
 * donc exactement le deck affiché dans la carte de proposition.
 * `addedNames` : cartes non possédées (en minuscules), pour que le
 * simulateur les marque « ajoutées » (même mécanisme que la reprise CSV).
 */
export async function openProposedDeck(input: {
  formatKey: string;
  commanders: string[];
  cards: { name: string; count: number }[];
  acquisitionNames: string[];
  label: string;
}): Promise<DeckAnalysisResult & { addedNames: string[] }> {
  const result = await analyzeDeck({
    formatKey: input.formatKey,
    deckName: input.label,
    commanders: input.commanders.slice(0, 2),
    cards: input.cards,
  });
  return { ...result, addedNames: input.acquisitionNames.map((n) => n.toLowerCase()) };
}

import type { PreconDeck } from "./types";
import rawDecks from "@/data/duelcommander-decks.json";

/**
 * Liste de decks Duel Commander (1v1) réels, pour la section "Duel
 * Commander" du site (05/09/2026).
 *
 * ⚠️ Contrairement aux decks Commander papier (src/lib/precon-decks.ts,
 * dataset communautaire vérifié) et aux decks Arena (produits papier
 * officiels réutilisés), Duel Commander n'a PAS de précons officiels : ce
 * format se joue avec des decks construits par les joueurs. Ces 11 decks
 * sont donc des VRAIES decklists de tournoi (top classements d'événements
 * récents, Paris/Pérou/Brésil/Italie/Tchéquie/USA, 01-03/09/2026),
 * récupérées sur https://mtgtop8.com/format?f=EDH (le filtre "EDH" de
 * mtgtop8 désigne Duel Commander, pas le Commander multijoueur classique).
 *
 * Méthode de collecte — à ne pas confondre avec le script
 * `scripts/fetch-precon-decks.mjs` (appel réseau direct depuis ce
 * bac à sable, qui fonctionne pour raw.githubusercontent.com) : mtgtop8.com
 * n'est PAS accessible en réseau direct depuis l'environnement cloud Claude
 * (même restriction que api.scryfall.com, voir README/HANDOFF), donc ces
 * 11 decks ont été transcrits un par un via l'outil WebFetch (qui, lui,
 * atteint bien mtgtop8.com), en demandant une transcription verbatim de
 * chaque page de decklist, puis vérifiés programmatiquement (total de
 * cartes ≈ 100, pas de ligne parasite) avant d'être commités ici. Deux
 * pièges rencontrés pendant cette collecte, documentés pour une future
 * session qui voudrait l'étendre :
 * - Demander à WebFetch de "trouver le lien d'export .dec" puis de fetcher
 *   CE lien séparément s'est avéré peu fiable (plusieurs decks ont renvoyé
 *   le contenu d'un AUTRE deck récemment fetché) — probablement le petit
 *   modèle de résumé qui invente/confond un href sous charge. Fiable :
 *   fetcher directement la page `event?e=X&d=Y&f=EDH` du deck et demander
 *   une transcription complète de la decklist telle qu'affichée (catégorisée
 *   par type de carte), jamais un lien à suivre ensuite.
 * - Un paramètre `d=` sans le `e=` correspondant peut renvoyer un deck
 *   complètement différent (l'id `d=` ne semble pas suffire seul) — toujours
 *   garder les deux paramètres de l'URL trouvée sur la page de l'événement.
 *
 * Conséquence : cette liste est donc UN SNAPSHOT MANUEL, pas régénérable
 * par un script comme les autres datasets de ce projet — pour la
 * rafraîchir, il faut répéter cette collecte manuelle (ou, si l'accès
 * réseau à mtgtop8.com devient possible depuis cet environnement, écrire
 * un vrai script comme `fetch-precon-decks.mjs`). Risque résiduel
 * documenté : une transcription assistée par IA peut comporter une
 * erreur ponctuelle de quantité sur une carte (un écart de +/-1 a été
 * observé sur un deck lors de la vérification) — un nom de carte introuvable
 * sur Scryfall se comporte comme pour n'importe quel import utilisateur
 * (carte affichée "non trouvée", pas un crash).
 *
 * La légalité (banlist Duel Commander) n'est PAS dupliquée à la main ici :
 * elle est vérifiée à la volée via `card.legalities.duel` (voir
 * FORMATS.duelcommander dans formats.ts), exactement comme le Commander
 * papier utilise `card.legalities.commander`.
 */
const decks = rawDecks as PreconDeck[];

export function getAllDuelCommanderDecks(): PreconDeck[] {
  return decks;
}

export function getDuelCommanderDeckById(id: string): PreconDeck | null {
  return decks.find((d) => d.id === id) ?? null;
}

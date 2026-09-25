/**
 * Liste officielle des "Game Changers" Commander (25/09/2026, constructeur
 * compétitif — voir competitive-builder.ts).
 *
 * Rôle dans l'app : uniquement une LISTE DE NOMS À CHERCHER pour le pool de
 * cartes recommandées hors collection (on ne peut pas faire une recherche
 * Scryfall `is:gamechanger` vérifiée depuis l'environnement de dev). Le
 * statut réel de chaque carte reste lu dans le champ officiel Scryfall
 * `game_changer` une fois la carte résolue : si WotC retire une carte de
 * la liste, Scryfall mettra ce champ à jour et le tier cessera de la
 * compter, même si ce fichier n'a pas été modifié. Seul risque d'un
 * fichier périmé : une carte AJOUTÉE à la liste après cette date ne sera
 * pas proposée spontanément par le pool recommandé (elle reste comptée si
 * Ben la possède déjà).
 *
 * Source : liste à jour au 09/02/2026 (dernière mise à jour officielle,
 * annonce WotC « Commander Brackets Beta Update – February 9, 2026 » :
 * https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026
 * — ajout de Farewell, et de Biorhythm suite à son débannissement).
 * L'annonce ne republie pas la liste complète : les 53 noms ci-dessous
 * viennent de https://commanderbrackets.com/game-changers (consulté le
 * 25/09/2026, « 53 cartes, mise à jour du 09/02/2026 »), recoupés avec
 * https://edhcheck.com/game-changers/ (même date, 52 noms listés : il y
 * manque Smothering Tithe). Source secondaire, pas la page officielle.
 */
export const GAME_CHANGERS_AS_OF = "2026-02-09";

export const GAME_CHANGER_NAMES: readonly string[] = [
  // Blanc
  "Drannith Magistrate",
  "Enlightened Tutor",
  "Farewell",
  "Humility",
  "Serra's Sanctum",
  "Smothering Tithe",
  "Teferi's Protection",
  // Bleu
  "Consecrated Sphinx",
  "Cyclonic Rift",
  "Fierce Guardianship",
  "Force of Will",
  "Gifts Ungiven",
  "Intuition",
  "Mystical Tutor",
  "Narset, Parter of Veils",
  "Rhystic Study",
  "Thassa's Oracle",
  // Noir
  "Ad Nauseam",
  "Bolas's Citadel",
  "Braids, Cabal Minion",
  "Demonic Tutor",
  "Imperial Seal",
  "Necropotence",
  "Opposition Agent",
  "Orcish Bowmasters",
  "Tergrid, God of Fright",
  "Vampiric Tutor",
  // Rouge
  "Gamble",
  "Jeska's Will",
  "Underworld Breach",
  // Vert
  "Biorhythm",
  "Crop Rotation",
  "Gaea's Cradle",
  "Natural Order",
  "Seedborn Muse",
  "Survival of the Fittest",
  "Worldly Tutor",
  // Multicolore
  "Aura Shards",
  "Coalition Victory",
  "Grand Arbiter Augustin IV",
  "Notion Thief",
  // Incolore / terrains
  "Ancient Tomb",
  "Chrome Mox",
  "Field of the Dead",
  "Glacial Chasm",
  "Grim Monolith",
  "Lion's Eye Diamond",
  "Mana Vault",
  "Mishra's Workshop",
  "Mox Diamond",
  "Panoptic Mirror",
  "The One Ring",
  "The Tabernacle at Pendrell Vale",
];

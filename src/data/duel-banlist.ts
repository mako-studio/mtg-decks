/**
 * Banlist officielle Duel Commander (duelcommander.org/banlist, « Last
 * Updated: July 27, 2026 »), recopiée le 26/09/2026 depuis une capture
 * d'écran fournie par Ben — noms relus à l'œil sur la capture, pas extraits
 * automatiquement : une coquille reste possible. Page consultable ici :
 * https://www.duelcommander.org/banlist/ (non accessible depuis mon
 * environnement, d'où la capture).
 *
 * Pourquoi en dur plutôt que la légalité Scryfall (`legalities.duel`) :
 * Scryfall ne distingue pas « banni comme commandant » (carte légale dans
 * les 99 mais pas en zone de commandement), et sa liste « banned » peut
 * être en retard sur les annonces du format. À mettre à jour à chaque
 * annonce (le format annonce une révision tous les 2 mois environ).
 */
export const DUEL_BANLIST_AS_OF = "2026-07-27";
export const DUEL_BANLIST_SOURCE = "https://www.duelcommander.org/banlist/";

/** Interdits comme commandant, autorisés dans les 99 (27 cartes). */
export const DUEL_BANNED_AS_COMMANDER: readonly string[] = [
  "Ajani, Nacatl Pariah",
  "Arahbo, Roar of the World",
  "Derevi, Empyrial Tactician",
  "Dihada, Binder of Wills",
  "Edgar Markov",
  "Edric, Spymaster of Trest",
  "Eris, Roar of the Storm",
  "Ezio Auditore da Firenze",
  "Geist of Saint Traft",
  "Hogaak, Arisen Necropolis",
  "Inalla, Archmage Ritualist",
  "Krark, the Thumbless",
  "Lumra, Bellow of the Woods",
  "Minsc & Boo, Timeless Heroes",
  "Old Stickfingers",
  "Oloro, Ageless Ascetic",
  "Omnath, Locus of Creation",
  "Prime Speaker Vannifar",
  "Raffine, Scheming Seer",
  "Rograkh, Son of Rohgahh",
  "Shorikai, Genesis Engine",
  "Spider-Man 2099",
  "Tamiyo, Inquisitive Student",
  "The Fantasticar",
  "Urza, Lord High Artificer",
  "Vial Smasher the Fierce",
  "Yuriko, the Tiger's Shadow",
];

/** Interdits comme compagnon. */
export const DUEL_BANNED_AS_COMPANION: readonly string[] = ["Lutri, the Spellchaser"];

/** Interdits dans le deck (80 cartes). Hors cartes interdites par les règles (ante, bordure argent…). */
export const DUEL_BANNED: readonly string[] = [
  "Ancestral Recall", "Ancient Tomb", "Back to Basics", "Balance",
  "Bazaar of Baghdad", "Black Lotus", "Blood Moon", "Capture of Jingzhou",
  "Cavern of Souls", "Channel", "Chrome Mox", "Comet, Stellar Pup",
  "Dark Ritual", "Deadly Rollick", "Deflecting Swat", "Dig Through Time",
  "Emrakul, the Aeons Torn", "Entomb", "Fastbond", "Field of the Dead",
  "Fierce Guardianship", "Flawless Maneuver", "Food Chain", "Force of Will",
  "Gaea's Cradle", "Genesis Storm", "Gifts Ungiven", "Grim Monolith",
  "Hermit Druid", "Humility", "Imperial Seal", "Invert Polarity",
  "Jeweled Lotus", "Karakas", "Library of Alexandria", "Lion's Eye Diamond",
  "Lotus Petal", "Maddening Hex", "Mana Crypt", "Mana Drain",
  "Mana Vault", "Mishra's Workshop", "Mox Amber", "Mox Diamond",
  "Mox Emerald", "Mox Jet", "Mox Opal", "Mox Pearl",
  "Mox Ruby", "Mox Sapphire", "Mystical Tutor", "Nadu, Winged Wisdom",
  "Natural Order", "Oath of Druids", "Price of Progress", "Protean Hulk",
  "Ragavan, Nimble Pilferer", "Rain of Filth", "Reanimate", "Scapeshift",
  "Sensei's Divining Top", "Serra's Sanctum", "Sol Ring", "Strip Mine",
  "Temporal Manipulation", "Thassa's Oracle", "The One Ring", "The Tabernacle at Pendrell Vale",
  "Time Vault", "Time Walk", "Time Warp", "Timetwister",
  "Tinker", "Tolarian Academy", "Treasure Cruise", "Underworld Breach",
  "Uro, Titan of Nature's Wrath", "Vampiric Tutor", "Wasteland", "White Plume Adventurer",
];

/**
 * Combos connus à 2-3 cartes (25/09/2026, constructeur compétitif — voir
 * src/lib/combos.ts).
 *
 * Pourquoi : le tier de puissance (deck-tier.ts) ne détectait jusqu'ici
 * aucune combo, alors que c'est LE marqueur des niveaux de jeu les plus
 * hauts (le système officiel de Brackets WotC n'autorise les combos
 * infinies à deux cartes qu'à partir du bracket 3 « tard dans la
 * partie », et sans restriction en bracket 4). Ben demande que le
 * constructeur « évalue les synergies entre les cartes » pour viser le
 * Tier 4 : assembler une combo avec les cartes possédées (ou proposer la
 * pièce manquante) en fait partie.
 *
 * ⚠️ Provenance : base curatée à la main à partir de ma connaissance des
 * combos les plus connues et documentées de la communauté Commander. La
 * référence communautaire exhaustive est Commander Spellbook
 * (https://commanderspellbook.com), mais son API
 * (backend.commanderspellbook.com) est inaccessible depuis les
 * environnements de dev de ce projet — je n'ai donc pas pu recouper cette
 * liste avec elle. N'y figurent que des combos que je considère très
 * largement établies ; certaines ont des prérequis (noté dans `note`) que
 * le moteur ne vérifie pas. La légalité de chaque pièce est vérifiée à
 * l'exécution via Scryfall (une pièce bannie n'est jamais proposée).
 *
 * `pieces` : noms Scryfall exacts. Une pièce peut être le commandant.
 */
export interface ComboDef {
  id: string;
  pieces: readonly string[];
  /** Ce que la combo produit — en français, affiché tel quel dans l'UI. */
  result: string;
  /** Prérequis non vérifiés automatiquement, affichés à Ben. */
  note?: string;
  /** Origine : base curatée (ce fichier) ou Commander Spellbook en direct (spellbook.ts). */
  source?: "curated" | "spellbook";
  /** Étiquette de puissance Commander Spellbook (R, S, P, O, C, E, B) si connue. */
  bracketTag?: string;
  /** Nombre de decks EDHREC qui jouent la combo, selon Commander Spellbook. */
  popularity?: number;
  /** Rôles génériques requis en plus des cartes nommées (« un outil de sacrifice »…), selon Commander Spellbook. */
  templates?: string[];
  /** La combo n'est pas relevée comme « pertinente » par Commander Spellbook (estimate-bracket). */
  minor?: boolean;
}

export const COMBOS: readonly ComboDef[] = [
  {
    id: "oracle-consultation",
    pieces: ["Thassa's Oracle", "Demonic Consultation"],
    result: "Victoire immédiate (bibliothèque exilée, puis Oracle)",
  },
  {
    id: "oracle-pact",
    pieces: ["Thassa's Oracle", "Tainted Pact"],
    result: "Victoire immédiate (bibliothèque exilée, puis Oracle)",
    note: "Tainted Pact s'arrête sur un doublon de nom : fonctionne en singleton hors terrains de base.",
  },
  {
    id: "labman-consultation",
    pieces: ["Laboratory Maniac", "Demonic Consultation"],
    result: "Victoire en piochant sur bibliothèque vide",
  },
  {
    id: "jace-consultation",
    pieces: ["Jace, Wielder of Mysteries", "Demonic Consultation"],
    result: "Victoire en piochant sur bibliothèque vide",
  },
  {
    id: "jace-pact",
    pieces: ["Jace, Wielder of Mysteries", "Tainted Pact"],
    result: "Victoire en piochant sur bibliothèque vide",
  },
  {
    id: "breach-led-brainfreeze",
    pieces: ["Underworld Breach", "Lion's Eye Diamond", "Brain Freeze"],
    result: "Meule infinie des adversaires (boucle Breach)",
  },
  {
    id: "scepter-reversal",
    pieces: ["Isochron Scepter", "Dramatic Reversal"],
    result: "Mana infini, dégagements infinis de permanents",
    note: "Nécessite des sources de mana non-terrain produisant au moins 3 manas au total.",
  },
  {
    id: "kiki-conscripts",
    pieces: ["Kiki-Jiki, Mirror Breaker", "Zealous Conscripts"],
    result: "Créatures infinies avec célérité",
  },
  {
    id: "kiki-pestermite",
    pieces: ["Kiki-Jiki, Mirror Breaker", "Pestermite"],
    result: "Créatures infinies avec célérité",
  },
  {
    id: "kiki-exarch",
    pieces: ["Kiki-Jiki, Mirror Breaker", "Deceiver Exarch"],
    result: "Créatures infinies avec célérité",
  },
  {
    id: "twin-pestermite",
    pieces: ["Splinter Twin", "Pestermite"],
    result: "Créatures infinies avec célérité",
  },
  {
    id: "twin-exarch",
    pieces: ["Splinter Twin", "Deceiver Exarch"],
    result: "Créatures infinies avec célérité",
  },
  {
    id: "saheeli-felidar",
    pieces: ["Saheeli Rai", "Felidar Guardian"],
    result: "Créatures infinies avec célérité",
  },
  {
    id: "heliod-ballista",
    pieces: ["Heliod, Sun-Crowned", "Walking Ballista"],
    result: "Dégâts infinis",
    note: "Demande {1}{W} pour donner le lien de vie à Walking Ballista.",
  },
  {
    id: "mikaeus-triskelion",
    pieces: ["Mikaeus, the Unhallowed", "Triskelion"],
    result: "Dégâts infinis",
  },
  {
    id: "druid-vizier",
    pieces: ["Devoted Druid", "Vizier of Remedies"],
    result: "Mana vert infini",
  },
  {
    id: "foodchain-squee",
    pieces: ["Food Chain", "Squee, the Immortal"],
    result: "Mana de créature infini",
  },
  {
    id: "foodchain-scourge",
    pieces: ["Food Chain", "Eternal Scourge"],
    result: "Mana de créature infini",
  },
  {
    id: "foodchain-griffin",
    pieces: ["Food Chain", "Misthollow Griffin"],
    result: "Mana de créature infini",
  },
  {
    id: "exquisite-sanguine",
    pieces: ["Exquisite Blood", "Sanguine Bond"],
    result: "Drain de vie infini (dès le premier gain ou perte de vie)",
  },
  {
    id: "niv-curiosity",
    pieces: ["Niv-Mizzet, Parun", "Curiosity"],
    result: "Dégâts et pioche infinis",
  },
  {
    id: "firemind-curiosity",
    pieces: ["Niv-Mizzet, the Firemind", "Curiosity"],
    result: "Dégâts et pioche infinis",
  },
  {
    id: "basalt-rings",
    pieces: ["Basalt Monolith", "Rings of Brighthearth"],
    result: "Mana incolore infini",
  },
  {
    id: "basalt-power-artifact",
    pieces: ["Basalt Monolith", "Power Artifact"],
    result: "Mana incolore infini",
  },
  {
    id: "grim-power-artifact",
    pieces: ["Grim Monolith", "Power Artifact"],
    result: "Mana incolore infini",
  },
  {
    id: "kinnan-basalt",
    pieces: ["Kinnan, Bonder Prodigy", "Basalt Monolith"],
    result: "Mana infini",
  },
  {
    id: "worldgorger-animate",
    pieces: ["Worldgorger Dragon", "Animate Dead"],
    result: "Mana et déclenchements d'arrivée infinis",
    note: "Il faut une utilisation du mana (ex. sort X, Kiki) pour conclure — sinon la boucle doit être rompue.",
  },
  {
    id: "drake-deadeye",
    pieces: ["Peregrine Drake", "Deadeye Navigator"],
    result: "Mana infini",
  },
  {
    id: "palinchron-deadeye",
    pieces: ["Palinchron", "Deadeye Navigator"],
    result: "Mana infini",
  },
  {
    id: "dualcaster-twinflame",
    pieces: ["Dualcaster Mage", "Twinflame"],
    result: "Créatures infinies avec célérité",
  },
  {
    id: "dualcaster-heat-shimmer",
    pieces: ["Dualcaster Mage", "Heat Shimmer"],
    result: "Créatures infinies avec célérité",
  },
  {
    id: "earthcraft-squirrel",
    pieces: ["Earthcraft", "Squirrel Nest"],
    result: "Jetons Écureuil infinis",
    note: "Nécessite au moins un terrain de base.",
  },
  {
    id: "painter-grindstone",
    pieces: ["Painter's Servant", "Grindstone"],
    result: "Meule de toute la bibliothèque adverse",
  },
  {
    id: "pili-architect",
    pieces: ["Pili-Pala", "Grand Architect"],
    result: "Mana infini de n'importe quelle couleur",
  },
  {
    id: "mindcrank-duskmantle",
    pieces: ["Mindcrank", "Duskmantle Guildmage"],
    result: "Meule et perte de vie infinies",
    note: "Demande {1}{U}{B} pour activer la Guildmage.",
  },
  {
    id: "gitrog-dakmor",
    pieces: ["The Gitrog Monster", "Dakmor Salvage"],
    result: "Meule de toute sa bibliothèque, puis boucle de pioche",
    note: "Nécessite un moyen de se défausser (outil de défausse) pour lancer la boucle.",
  },
  // --- Ajouts du 25/09/2026 (2e passage, demande de Ben : « augmente ta liste de combos ») ---
  // Même provenance (connaissance générale des combos établies) ; cette base
  // n'est plus que le REPLI hors ligne : en production, Commander Spellbook
  // est interrogé en direct (spellbook.ts) et couvre des dizaines de milliers
  // de combos.
  { id: "hullbreaker-solring", pieces: ["Hullbreaker Horror", "Sol Ring"], result: "Mana incolore infini, tempête infinie" },
  { id: "kiki-resto", pieces: ["Kiki-Jiki, Mirror Breaker", "Restoration Angel"], result: "Créatures infinies avec célérité" },
  { id: "kiki-bellringer", pieces: ["Kiki-Jiki, Mirror Breaker", "Village Bell-Ringer"], result: "Créatures infinies avec célérité" },
  { id: "kiki-felidar", pieces: ["Kiki-Jiki, Mirror Breaker", "Felidar Guardian"], result: "Créatures infinies avec célérité" },
  { id: "kiki-corridor", pieces: ["Kiki-Jiki, Mirror Breaker", "Corridor Monitor"], result: "Créatures infinies avec célérité" },
  { id: "twin-conscripts", pieces: ["Splinter Twin", "Zealous Conscripts"], result: "Créatures infinies avec célérité" },
  { id: "vito-exquisite", pieces: ["Vito, Thorn of the Dusk Rose", "Exquisite Blood"], result: "Drain de vie infini" },
  { id: "blightpriest-exquisite", pieces: ["Marauding Blight-Priest", "Exquisite Blood"], result: "Drain de vie infini" },
  { id: "bloodlord-exquisite", pieces: ["Defiant Bloodlord", "Exquisite Blood"], result: "Drain de vie infini" },
  { id: "tenacity-exquisite", pieces: ["Enduring Tenacity", "Exquisite Blood"], result: "Drain de vie infini" },
  { id: "basalt-monument", pieces: ["Basalt Monolith", "Forsaken Monument"], result: "Mana incolore infini" },
  { id: "druid-quillspike", pieces: ["Devoted Druid", "Quillspike"], result: "Mana vert infini, force infinie" },
  { id: "druid-swiftreconfig", pieces: ["Devoted Druid", "Swift Reconfiguration"], result: "Mana vert infini" },
  { id: "niv-ophidian", pieces: ["Niv-Mizzet, Parun", "Ophidian Eye"], result: "Dégâts et pioche infinis" },
  { id: "niv-tandem", pieces: ["Niv-Mizzet, Parun", "Tandem Lookout"], result: "Dégâts et pioche infinis" },
  { id: "worldgorger-necromancy", pieces: ["Worldgorger Dragon", "Necromancy"], result: "Mana et déclenchements d'arrivée infinis", note: "Il faut une utilisation du mana pour conclure." },
  { id: "worldgorger-dance", pieces: ["Worldgorger Dragon", "Dance of the Dead"], result: "Mana et déclenchements d'arrivée infinis", note: "Il faut une utilisation du mana pour conclure." },
  { id: "whale-deadeye", pieces: ["Great Whale", "Deadeye Navigator"], result: "Mana infini" },
  { id: "chatterfang-plunderer", pieces: ["Chatterfang, Squirrel General", "Pitiless Plunderer"], result: "Jetons, morts et Trésors infinis" },
  { id: "scurry-ivy", pieces: ["Scurry Oak", "Ivy Lane Denizen"], result: "Jetons Écureuil infinis" },
  { id: "illusionist-shuko", pieces: ["Cephalid Illusionist", "Shuko"], result: "Meule de toute sa bibliothèque", note: "Sert à alimenter une stratégie de cimetière (ex. Thassa's Oracle / Laboratory Maniac)." },
  { id: "led-salvagers", pieces: ["Lion's Eye Diamond", "Auriok Salvagers"], result: "Mana infini de n'importe quelle couleur" },
  { id: "heliod-spikefeeder", pieces: ["Heliod, Sun-Crowned", "Spike Feeder"], result: "Vie infinie" },
  { id: "dualcaster-molten", pieces: ["Dualcaster Mage", "Molten Duplication"], result: "Créatures infinies avec célérité" },
  { id: "godo-helm", pieces: ["Godo, Bandit Warlord", "Helm of the Host"], result: "Combats supplémentaires infinis" },
  { id: "assault-sword-ff", pieces: ["Aggravated Assault", "Sword of Feast and Famine"], result: "Combats supplémentaires infinis", note: "Il faut infliger des blessures de combat à un joueur avec la créature équipée." },
  { id: "assault-bear-umbra", pieces: ["Aggravated Assault", "Bear Umbra"], result: "Combats supplémentaires infinis", note: "La créature enchantée doit attaquer." },
  { id: "mindcrank-bloodchief", pieces: ["Mindcrank", "Bloodchief Ascension"], result: "Meule et drain infinis", note: "Bloodchief Ascension doit avoir au moins 3 marqueurs de quête." },
];

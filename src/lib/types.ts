/**
 * Types partagés de l'application.
 */

/** Une carte telle que stockée dans un deck préconstruit (source: dataset GitHub taw). */
export interface PreconCardRef {
  name: string;
  count: number;
}

/**
 * Un deck Commander préconstruit officiel.
 *
 * Réutilisé tel quel (05/09/2026) pour les decks Duel Commander de
 * src/data/duelcommander-decks.json (voir src/lib/duelcommander-decks.ts) —
 * ce ne sont pas des précons officiels mais des decks de tournoi réels
 * scrapés sur mtgtop8.com. Champs repurposés pour ce cas : `setCode`/
 * `setName` = code/nom de l'événement mtgtop8 (pas un set Magic),
 * `releaseDate` = date du tournoi, `source` = lien vers la decklist
 * mtgtop8. Choix délibéré plutôt qu'un nouveau type : ces champs sont déjà
 * assez génériques pour porter cette sémantique, et ça permet de réutiliser
 * DeckCard/DeckBrowser/DeckAnalysis sans dupliquer de composant (voir
 * README, section Duel Commander).
 */
export interface PreconDeck {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  releaseDate: string;
  commanders: string[];
  cardCount: number;
  cards: PreconCardRef[];
  source: string | null;
}

/**
 * Sous-ensemble des champs Scryfall utilisés par l'app.
 * Référence complète : https://scryfall.com/docs/api/cards
 */
export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: ScryfallImageUris;
  /** Nom/texte/type imprimés sur CETTE impression si elle n'est pas en anglais. */
  printed_name?: string;
  printed_text?: string;
  printed_type_line?: string;
}

export interface ScryfallImageUris {
  small: string;
  normal: string;
  large: string;
  png: string;
  art_crop: string;
  border_crop: string;
}

export interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  /**
   * Mots-clés d'habileté officiels reconnus par Scryfall (ex: "Hexproof",
   * "Ward", "Indestructible", "Flying", "Trample", ...) — données
   * structurées déjà renvoyées par l'API (aucun appel réseau
   * supplémentaire), bien plus fiables qu'une regex sur le texte oracle
   * pour ce genre de mot-clé (formulations variables : "Ward {2}",
   * "Ward — Discard a card", "Hexproof from black", ...). Voir classifyCard
   * dans deck-score.ts.
   */
  keywords?: string[];
  /**
   * Couleurs de mana que cette carte peut produire (ex: ["W","U"]),
   * renvoyées par Scryfall pour toute source de mana (terrain, artefact,
   * créature, ...). Plus fiable qu'une regex sur le texte oracle pour
   * détecter le fixing multicolore, quel que soit le type de permanent ou
   * la formulation exacte de l'habileté de mana.
   */
  produced_mana?: string[] | null;
  /**
   * Rang de popularité général de cette carte sur EDHREC (1 = la plus
   * jouée toutes couleurs/commandants confondus), renvoyé directement par
   * Scryfall — ⚠️ à ne pas confondre avec les données de SYNERGIE
   * EDHREC-par-commandant (celles-ci ne sont pas disponibles via une API
   * officielle, voir la note en tête de deck-score.ts). `edhrec_rank` est
   * un champ standard du Card Object Scryfall lui-même (pas un scraper
   * tiers), documenté sur https://scryfall.com/docs/api/cards — un simple
   * indicateur de popularité générale, pas une recommandation pour CE
   * deck précis. `null`/absent si la carte n'est pas classée.
   */
  edhrec_rank?: number | null;
  /**
   * `true` si cette carte figure sur la liste officielle "Game Changers"
   * du Commander Rules Committee (cartes jugées susceptibles de définir
   * une partie à elles seules, utilisées pour les "brackets" Commander),
   * exposée directement par Scryfall (champ officiel, pas un scraper
   * tiers) — voir https://scryfall.com/docs/api/cards et l'annonce
   * officielle de Scryfall. Signal de puissance générale, indépendant des
   * 8 piliers ci-dessous.
   */
  game_changer?: boolean | null;
  legalities: Record<string, "legal" | "not_legal" | "restricted" | "banned">;
  /** Jeux dans lesquels cette impression existe : "paper" | "mtgo" | "arena" | ... */
  games: string[];
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    eur?: string | null;
  };
  scryfall_uri: string;
  layout: string;
  rarity: string;
  set: string;
  set_name: string;
  collector_number: string;
  /** Code langue de CETTE impression (ex: "en", "fr") — https://scryfall.com/docs/api/languages */
  lang?: string;
  /** Nom/texte/type imprimés sur CETTE impression si elle n'est pas en anglais. */
  printed_name?: string;
  printed_text?: string;
  printed_type_line?: string;
}

/** Carte enrichie utilisée dans l'UI : la ref du deck + les données Scryfall (si trouvées). */
export interface EnrichedCard {
  name: string;
  count: number;
  isCommander: boolean;
  card: ScryfallCard | null;
}

/**
 * Catégories heuristiques utilisées pour scorer un deck Commander.
 *
 * "finisher" est différent des piliers "moteur" (ramp/removal/wipe/draw/
 * tutor/protection/landfix) : il essaie de repérer les cartes qui
 * terminent la partie (victoire alternative, combats supplémentaires,
 * évasion difficile à bloquer, dégâts doublés) — un axe différent,
 * volontairement détecté par des signaux textuels précis plutôt que par
 * la puissance brute (force/endurance) d'une créature, pour éviter de
 * qualifier "finisher" n'importe quelle grosse créature vanille. Une
 * carte peut donc être une bombe reconnue par les joueurs sans matcher
 * "finisher" si son effet n'est ni une victoire alternative, ni de
 * l'évasion, ni des dégâts doublés/combats supplémentaires (voir la note
 * dans classifyCard, deck-score.ts).
 *
 * "disruption" (9e pilier, ajouté le 26/08/2026) regroupe ce qui ralentit
 * ou prive les adversaires de ressources sans nécessairement détruire un
 * permanent : verrous/taxes ("les joueurs ne peuvent pas lancer de
 * sorts", "coûte {1} de plus à lancer", "ne dégèlent pas"), sacrifices
 * forcés (edicts, ex: Diabolic Edict) et défausse forcée. Comme
 * "finisher", volontairement limité à des formulations textuelles
 * précises et vérifiées sur de vraies cartes (voir CATEGORY_PATTERNS
 * dans deck-score.ts et le README) plutôt qu'à une notion vague de
 * "carte qui gêne l'adversaire".
 */
export type DeckCategory =
  | "ramp"
  | "removal"
  | "wipe"
  | "draw"
  | "tutor"
  | "protection"
  | "landfix"
  | "finisher"
  | "disruption";

/** Une tranche de la courbe de mana : nombre de cartes (hors terrains) à ce coût converti. `cmc: 7` regroupe "7 et plus". */
export interface ManaCurveBucket {
  cmc: number;
  label: string;
  count: number;
}

/**
 * Signal de santé "structurel" du deck (courbe de mana ou nombre de
 * terrains) — même échelle que les ratios de piliers (`ratio` 0-1,
 * contribue au score final avec son propre poids, voir `curveWeight`/
 * `landWeight` dans CategoryConfig et computeDeckStats dans
 * deck-score.ts). `status` est dérivé du ratio pour l'affichage
 * (même trichotomie que PillarCoverage.tsx : bon / à surveiller /
 * hors cible). Basé sur des repères de deckbuilding communautaires
 * répandus (ex : ~37 terrains sur 99 cartes en Commander), pas une
 * règle officielle — voir README et le commentaire sur
 * `idealLandRatio`/`idealAvgCmc` dans formats.ts.
 */
export interface HealthSignal {
  ratio: number;
  status: "good" | "watch" | "off";
  message: string;
}

export interface DeckStats {
  totalNonLandCards: number;
  landCount: number;
  avgCmc: number;
  categoryCounts: Record<DeckCategory, number>;
  manaCurve: ManaCurveBucket[];
  curveHealth: HealthSignal;
  landHealth: HealthSignal;
  score: number; // 0-100
}

/**
 * Archétypes/stratégies de deck détectables par `detectArchetypes`
 * (archetype.ts, 28/08/2026) : un signal complémentaire aux 9 piliers,
 * qui eux mesurent des RÔLES de carte (ramp, removal...) indépendamment
 * de la stratégie du deck. Périmètre volontairement limité à des
 * archétypes à signal textuel/structurel fort et bien standardisé dans
 * le templating Magic (voir ARCHETYPE_DEFS dans archetype.ts) — pas de
 * tentative de couvrir "tous les archétypes possibles" (stax, group
 * hug... ont des signaux trop diffus pour une détection fiable par
 * heuristique, voir README).
 */
export type Archetype = "tribal" | "sacrifice" | "counters" | "spellslinging" | "artifacts" | "lifegain";

/**
 * Détection d'un archétype pour CE deck précis. `confidence` reflète la
 * force du signal (commandant qui confirme explicitement > forte part
 * du deck seulement) — même esprit de transparence que `GlossaryTerm`/
 * `SetNote`, appliqué ici à une inférence algorithmique plutôt qu'à une
 * recherche documentaire. `matchedCount`/`matchedShare` exposent le
 * calcul plutôt que de le cacher derrière un simple label.
 */
export interface ArchetypeSignal {
  archetype: Archetype;
  label: string;
  confidence: "high" | "medium";
  matchedCount: number;
  matchedShare: number;
}

/**
 * Carte du deck actuel proposée comme candidate au retrait, pour former un
 * "swap" avec une suggestion d'ajout. Heuristique interne (voir
 * `pickSwapCandidate` dans recommend.ts) : pas une garantie que c'est LA
 * meilleure carte à retirer, juste une proposition raisonnable et
 * explicable (catégorie déjà bien couverte, ou carte sans rôle identifié).
 */
export interface SwapCandidate {
  name: string;
  reason: string;
}

/**
 * Verdict d'une évaluation de compatibilité carte/deck (voir
 * `evaluateCardCompatibility` dans recommend.ts, utilisé par la recherche
 * manuelle — AddCardSearch.tsx) :
 * - "improve" : comble une catégorie encore sous sa cible dans le deck.
 * - "marginal" : rôle identifié mais catégorie déjà bien couverte.
 * - "unclear" : aucun rôle clé détecté par l'heuristique (ne veut pas dire
 *   que la carte est mauvaise, juste que ce moteur ne mesure pas son
 *   apport — voir les limites documentées dans le README).
 * Absent pour les suggestions automatiques (recommend.ts) : elles ciblent
 * déjà uniquement des catégories sous-représentées, donc toujours "improve"
 * par construction — pas la peine de le répéter sur chaque suggestion.
 */
export type CardVerdict = "improve" | "marginal" | "unclear";

export interface CardSuggestion {
  card: ScryfallCard;
  reason: string;
  categories: DeckCategory[];
  impact: number; // contribution estimée au score, arbitraire mais comparable
  /** Carte du deck actuel qu'on pourrait retirer pour faire de la place. `null` si aucune candidate trouvée. */
  swapOut?: SwapCandidate | null;
  verdict?: CardVerdict;
  /**
   * Présent si cette suggestion vient de la détection d'archétype
   * (synergie thématique avec le deck précis, voir archetype.ts) plutôt
   * que d'un pilier générique sous sa cible — permet à l'UI de
   * distinguer visuellement les deux raisons (SuggestionCard.tsx).
   */
  archetypeMatch?: { archetype: Archetype; label: string };
}

/**
 * Formats pris en charge. "commander" est le format papier existant.
 * "duelcommander" (05/09/2026) est Duel Commander (1v1, vie 20) — voir
 * src/lib/formats.ts et src/lib/duelcommander-decks.ts. Les autres sont
 * des formats MTG Arena — voir src/lib/formats.ts.
 * Clés vérifiées contre la doc officielle Scryfall (scryfall.com/docs/syntax,
 * mot-clé de recherche `f:`/`format:` — "duel" y est explicitement documenté
 * comme "Duel Commander").
 */
export type FormatKey =
  | "commander"
  | "duelcommander"
  | "brawl"
  | "historicbrawl"
  | "standard"
  | "historic"
  | "explorer"
  | "alchemy"
  | "timeless";

export interface CategoryConfig {
  targets: Record<DeckCategory, number>;
  weights: Record<DeckCategory, number>;
  /**
   * Poids (points sur 100, même échelle que `weights`) de la santé de la
   * courbe de mana et du nombre de terrains dans le score global —
   * correctif du 28/08/2026 : ces deux données étaient déjà calculées
   * (`avgCmc`/`landCount` dans DeckStats) mais n'entraient jamais dans le
   * score, qui pouvait donc être à 100 avec une courbe ou un nombre de
   * terrains problématique. `weights` (les 9 piliers) a été réduit
   * proportionnellement pour laisser la place à ces deux poids, en
   * gardant un total de 100 — même méthode que l'ajout du pilier
   * "disruption" (voir deck-score.ts).
   */
  curveWeight: number;
  landWeight: number;
  /**
   * Coût de mana moyen (hors terrains) jugé sain pour ce type de deck —
   * repère de deckbuilding communautaire répandu, pas une règle
   * officielle (aucune source primaire vérifiée en direct, voir README).
   * Sert de centre à une bande de tolérance (voir curveHealthRatio dans
   * deck-score.ts), pas un objectif strict.
   */
  idealAvgCmc: number;
  /**
   * Part de terrains jugée saine dans le deck (hors commandant) — même
   * caveat que `idealAvgCmc` : repère communautaire, pas une règle
   * officielle. Exprimée en ratio plutôt qu'en nombre absolu pour
   * s'appliquer aux formats de tailles différentes (99 cartes en
   * Commander, 59 en Brawl, 60 en constructed...).
   */
  idealLandRatio: number;
}

export interface FormatConfig {
  key: FormatKey;
  label: string;
  /** Clé de légalité Scryfall (card.legalities[scryfallLegality] / "f:<scryfallLegality>"). */
  scryfallLegality: string;
  /** Si true, les recherches/enrichissements sont filtrés à game:arena. */
  arenaOnly: boolean;
  singleton: boolean;
  hasCommander: boolean;
  /** Nombre de cartes visé (hors commandant pour les formats singleton). */
  deckSize: number;
  /** Nombre d'exemplaires maximum d'une même carte (hors terrains de base). */
  maxCopies: number;
  categories: CategoryConfig;
}

/** Une carte telle que représentée dans un import/export au format texte MTG Arena. */
export interface ArenaCardLine {
  name: string;
  amount: number;
  set?: string;
  collector?: number;
}

export interface ParsedArenaDeck {
  valid: boolean;
  deck: ArenaCardLine[];
  sideboard: ArenaCardLine[];
  commander: ArenaCardLine | null;
  companion: ArenaCardLine | null;
}

/**
 * Métadonnées d'un set/extension Scryfall (sous-ensemble utilisé par
 * l'app) — voir https://scryfall.com/docs/api/sets (vérifié le
 * 26/08/2026, y compris la liste des valeurs de `set_type`).
 */
export interface ScryfallSet {
  code: string;
  name: string;
  set_type: string;
  released_at?: string | null;
  card_count: number;
  icon_svg_uri?: string;
  block?: string | null;
  parent_set_code?: string | null;
}

/**
 * Catégorie d'un terme de glossaire (src/data/glossary.ts) — sert de
 * filtre dans la section Glossaire.
 */
export type GlossaryCategory =
  | "keyword-evergreen"
  | "keyword-other"
  | "deckbuilding"
  | "commander"
  | "gameplay";

/**
 * Terme de glossaire MTG (FR/EN). `termEn` correspond, quand le terme est
 * une capacité mot-clé, à la chaîne officielle Scryfall (`ScryfallCard.keywords`)
 * — ce qui permet de relier automatiquement les mots-clés affichés dans la
 * section Extensions aux entrées du glossaire (voir src/lib/sets.ts).
 * `confidence`/`sourceNote` documentent la fiabilité de la traduction FR
 * (voir README) : "low"/"medium" signale une traduction communautaire non
 * officielle plutôt qu'un terme confirmé sur des cartes/documents Wizards.
 */
export interface GlossaryTerm {
  termEn: string;
  termFr: string;
  category: GlossaryCategory;
  definitionFr: string;
  sourceNote: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Une mécanique/mot-clé effectivement INTRODUIT par ce set/produit précis
 * — à distinguer de `SetMechanic` (src/lib/sets.ts), qui liste les
 * mots-clés simplement PRÉSENTS dans les cartes du set, qu'il les ait
 * introduits ou non. Contenu recherché (demande de Ben du 26/08/2026,
 * voir README "Mécaniques introduites par set") : chaque entrée cite sa
 * source dans `sourceNote`.
 */
export interface SetMechanicIntro {
  termEn: string;
  termFr: string;
  definitionFr: string;
  sourceNote: string;
}

/**
 * Note de recherche pour un set/extension suivi (voir
 * src/data/set-notes.json, ~58 entrées) : les mécaniques qu'il introduit
 * réellement (liste vide = réponse honnête "aucune" — le cas de la
 * plupart des produits Commander préconstruits, suppléments d'un set
 * principal qui n'introduisent rien eux-mêmes), un paragraphe de
 * contexte utile pour un choix de deckbuilding éclairé, les sources
 * utilisées, et un niveau de confiance global de cette recherche
 * (`"low"` = zone d'incertitude explicitement signalée par l'agent de
 * recherche, ex. ambiguïté d'attribution non résolue).
 */
export interface SetNote {
  code: string;
  mechanicsIntroduced: SetMechanicIntro[];
  context: string;
  sourceNotes: string[];
  confidence: "high" | "medium" | "low";
}

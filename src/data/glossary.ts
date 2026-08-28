import type { GlossaryCategory, GlossaryTerm } from "@/lib/types";

/**
 * Glossaire des termes Magic: The Gathering (FR/EN), pour la section
 * "Glossaire" du site (demande de Ben du 26/08/2026).
 *
 * Contenu recherché et sourcé (pas rédigé de mémoire) : chaque terme cite,
 * dans `sourceNote`, la source utilisée pour la traduction française
 * (glossaire officiel des mots-clés Wizards, notes de publication
 * officielles, texte imprimé sur les cartes françaises, ou à défaut une
 * source communautaire fiable). `confidence` reflète cette fiabilité :
 * - "high" : terme officiel confirmé (carte imprimée, glossaire Wizards,
 *   règles complètes, notes de publication officielles).
 * - "medium" : traduction communautaire largement répandue mais pas
 *   confirmée sur une source Wizards de premier rang.
 * - "low" : aucune traduction officielle trouvée ; terme récent ou
 *   argotique, à prendre avec précaution (signalé dans l'UI).
 *
 * ⚠️ Portée volontairement limitée à ~60 termes essentiels (capacités
 * mot-clé courantes + vocabulaire de deckbuilding/Commander) plutôt qu'à
 * l'intégralité des mots-clés jamais imprimés (plusieurs centaines,
 * beaucoup obsolètes ou très rares) : un choix par défaut pour rester
 * utile sans sacrifier la fiabilité de chaque entrée, jamais explicitement
 * confirmé avec Ben — à ajuster sur demande.
 */
export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    termEn: "Deathtouch",
    termFr: "Contact mortel",
    category: "keyword-evergreen",
    definitionFr:
      "N'importe quelle quantité de blessures infligée par cette créature à une autre créature suffit à la détruire. Rend une petite créature dangereuse en bloqueur ou en attaquant, même face à de grosses créatures.",
    sourceNote:
      "Glossaire officiel des mots-clés Wizards en français (magic.wizards.com/fr/keyword-glossary : « CONTACT MORTEL ») et texte imprimé sur cartes françaises.",
    confidence: "high",
  },
  {
    termEn: "Defender",
    termFr: "Défenseur",
    category: "keyword-evergreen",
    definitionFr:
      "Une créature avec le défenseur ne peut pas attaquer, mais peut bloquer normalement. Typique des créatures pensées pour la défense (murs) plutôt que pour l'offensive.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« DÉFENSEUR »).",
    confidence: "high",
  },
  {
    termEn: "Double Strike",
    termFr: "Double initiative",
    category: "keyword-evergreen",
    definitionFr:
      "La créature inflige ses blessures de combat à la fois lors de l'étape de blessures avec initiative et lors de l'étape normale, doublant potentiellement ses dégâts. Combine très bien avec le lien de vie ou les bonus de force.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« DOUBLE INITIATIVE »).",
    confidence: "high",
  },
  {
    termEn: "Enchant",
    termFr: "Enchanter",
    category: "keyword-evergreen",
    definitionFr:
      "Capacité présente sur toutes les auras, qui précise à quel type de permanent (créature, terrain, joueur...) l'aura peut être attachée. Détermine les cibles légales quand vous lancez une aura.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« ENCHANTER »).",
    confidence: "high",
  },
  {
    termEn: "Equip",
    termFr: "Équipement",
    category: "keyword-evergreen",
    definitionFr:
      "Capacité activée imprimée sur la plupart des cartes d'équipement, sous la forme « Équipement [coût] ». En payant ce coût, vous attachez l'artefact à une créature ciblée que vous contrôlez ; cette capacité ne peut être activée qu'à un moment où vous pourriez lancer un rituel.",
    sourceNote:
      "Texte « Équipement {1} » imprimé sur Scinde-os (Bonesplitter), Mirrodin, 2003 (également confirmé sur Épée des Ténèbres et de la Lumière et Épée d'âtre et de foyer, Horizons du Modern 2, 2021) ; confirmé par le glossaire officiel des mots-clés de Wizards en français, entrée « Équipement » (magic.wizards.com/fr/keyword-glossary).",
    confidence: "high",
  },
  {
    termEn: "First Strike",
    termFr: "Initiative",
    category: "keyword-evergreen",
    definitionFr:
      "La créature inflige ses blessures de combat avant les créatures sans initiative, ce qui peut la faire gagner un combat avant de subir la riposte. Très efficace contre des créatures de force égale ou inférieure sans cette capacité.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« INITIATIVE »).",
    confidence: "high",
  },
  {
    termEn: "Flash",
    termFr: "Flash",
    category: "keyword-evergreen",
    definitionFr:
      "Un sort avec le flash peut être lancé à tout moment où vous pourriez lancer un éphémère, y compris pendant le tour de l'adversaire. Permet de surprendre l'adversaire, par exemple avec un bloqueur inattendu.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« FLASH »).",
    confidence: "high",
  },
  {
    termEn: "Flashback",
    termFr: "Flashback",
    category: "keyword-evergreen",
    definitionFr:
      "Un sort avec le flashback peut être lancé une fois depuis le cimetière en payant son coût de flashback, puis est exilé au lieu d'y retourner. Offre une deuxième utilisation d'un sort déjà joué.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« FLASHBACK »).",
    confidence: "high",
  },
  {
    termEn: "Flying",
    termFr: "Vol",
    category: "keyword-evergreen",
    definitionFr:
      "Une créature avec le vol ne peut être bloquée que par des créatures ayant elles-mêmes le vol ou la portée. Un des moyens les plus fiables d'infliger des blessures de combat de façon répétée.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« VOL »).",
    confidence: "high",
  },
  {
    termEn: "Haste",
    termFr: "Célérité",
    category: "keyword-evergreen",
    definitionFr:
      "Une créature avec la célérité ignore le mal d'invocation : elle peut attaquer et être engagée dès le tour où elle arrive sur le champ de bataille. Idéale quand son arrivée déclenche un gros effet immédiat.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« CÉLÉRITÉ »).",
    confidence: "high",
  },
  {
    termEn: "Hexproof",
    termFr: "Défense talismanique",
    category: "keyword-evergreen",
    definitionFr:
      "Le permanent (ou joueur) ne peut pas être la cible de sorts ou de capacités contrôlés par un adversaire. Protège efficacement contre le retrait ciblé, mais pas contre les effets qui touchent tout le monde (balayages...).",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français ; confirmé aussi via mtga.untapped.gg/fr.",
    confidence: "high",
  },
  {
    termEn: "Indestructible",
    termFr: "Indestructible",
    category: "keyword-evergreen",
    definitionFr:
      "Le permanent ne peut pas être détruit par les blessures ni par les effets « détruisez ». Reste vulnérable aux effets d'exil, de sacrifice, ou qui réduisent l'endurance à 0 ou moins.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« INDESTRUCTIBLE »).",
    confidence: "high",
  },
  {
    termEn: "Lifelink",
    termFr: "Lien de vie",
    category: "keyword-evergreen",
    definitionFr:
      "Quand une créature avec le lien de vie inflige des blessures, vous gagnez autant de points de vie. Très fort en Commander multijoueur, où le pool de vie de départ est élevé mais la pression vient de plusieurs adversaires.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« LIEN DE VIE »).",
    confidence: "high",
  },
  {
    termEn: "Menace",
    termFr: "Menace",
    category: "keyword-evergreen",
    definitionFr:
      "Une créature avec la menace ne peut être bloquée que par deux créatures ou plus en même temps. Complique fortement la défense d'un adversaire qui manque de bloqueurs disponibles.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« MENACE »).",
    confidence: "high",
  },
  {
    termEn: "Protection",
    termFr: "Protection",
    category: "keyword-evergreen",
    definitionFr:
      "« Protection contre [qualité] » empêche le permanent d'être ciblé, enchanté/équipé, bloqué ou blessé par tout ce qui correspond à cette qualité (une couleur, un type de créature...). L'une des capacités défensives les plus anciennes du jeu.",
    sourceNote: "Terme identique en français et en anglais depuis les premières éditions ; règles complètes §702.",
    confidence: "high",
  },
  {
    termEn: "Prowess",
    termFr: "Prouesse",
    category: "keyword-evergreen",
    definitionFr:
      "Chaque fois que vous lancez un sort qui n'est pas une créature, cette créature gagne +1/+1 jusqu'à la fin du tour. Récompense les decks qui jouent beaucoup de rituels et d'éphémères plutôt que des créatures.",
    sourceNote: "Entrée lexique dédiée, terminologie communautaire francophone stable.",
    confidence: "high",
  },
  {
    termEn: "Reach",
    termFr: "Portée",
    category: "keyword-evergreen",
    definitionFr:
      "Une créature avec la portée peut bloquer les créatures avec le vol (mais n'a pas elle-même le vol). Solution défensive économique contre les menaces aériennes.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« PORTÉE »).",
    confidence: "high",
  },
  {
    termEn: "Scry",
    termFr: "Regard",
    category: "keyword-evergreen",
    definitionFr:
      "« Regard N » : regardez les N cartes du dessus de votre bibliothèque, puis remettez-en n'importe quel nombre dessus (dans l'ordre voulu) et le reste en dessous. Outil de lissage de pioche extrêmement courant.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« REGARD ») ; texte imprimé sur cartes françaises.",
    confidence: "high",
  },
  {
    termEn: "Trample",
    termFr: "Piétinement",
    category: "keyword-evergreen",
    definitionFr:
      "Si une créature avec le piétinement est bloquée, l'excédent de blessures (au-delà de ce qu'il faut pour tuer les bloqueurs) est infligé au joueur ou planeswalker attaqué. Empêche un adversaire d'annuler une grosse attaque avec un petit bloqueur.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« PIÉTINEMENT »).",
    confidence: "high",
  },
  {
    termEn: "Vigilance",
    termFr: "Vigilance",
    category: "keyword-evergreen",
    definitionFr:
      "Une créature avec la vigilance ne s'engage pas quand elle attaque, et reste donc disponible pour bloquer au tour suivant. Permet d'attaquer sans sacrifier sa défense.",
    sourceNote: "Glossaire officiel des mots-clés Wizards en français (« VIGILANCE »).",
    confidence: "high",
  },
  {
    termEn: "Ward",
    termFr: "Parade",
    category: "keyword-evergreen",
    definitionFr:
      "Chaque fois que ce permanent devient la cible d'un sort ou d'une capacité adverse, cet effet est contrecarré à moins que son contrôleur ne paie le coût de parade indiqué. Une taxe défensive plus « douce » que la défense talismanique.",
    sourceNote: "Notes de publication officielles Wizards en français (ex. Secrets de Strixhaven) et article officiel « Présentation de la parade ».",
    confidence: "high",
  },
  {
    termEn: "Adventure",
    termFr: "Aventure",
    category: "keyword-other",
    definitionFr:
      "Type de carte (créature ou autre permanent) qui possède aussi un sort d'Aventure séparé qu'on peut lancer d'abord ; la carte part en exil et peut ensuite être lancée normalement comme permanent depuis l'exil. Deux effets pour le prix d'une carte.",
    sourceNote: "Entrée lexique dédiée, terminologie communautaire francophone stable.",
    confidence: "high",
  },
  {
    termEn: "Backup",
    termFr: "Main-forte",
    category: "keyword-other",
    definitionFr:
      "Quand cette créature arrive sur le champ de bataille, mettez N marqueurs +1/+1 sur une créature ciblée ; si la cible est une autre créature, celle-ci gagne aussi les capacités de cette créature jusqu'à la fin du tour.",
    sourceNote: "Notes de publication officielles Wizards en français pour L'invasion des machines.",
    confidence: "high",
  },
  {
    termEn: "Blitz",
    termFr: "Blitz",
    category: "keyword-other",
    definitionFr:
      "En lançant ce sort pour son coût de blitz, la créature gagne la célérité et « quand elle meurt, piochez une carte », mais elle est sacrifiée au début de la prochaine étape de fin. Une attaque éclair jetable qui rentabilise une carte.",
    sourceNote: "Notes de publication officielles Wizards en français pour Les rues de la Nouvelle-Capenna.",
    confidence: "high",
  },
  {
    termEn: "Cascade",
    termFr: "Cascade",
    category: "keyword-other",
    definitionFr:
      "Quand vous lancez ce sort, révélez des cartes du dessus de votre bibliothèque jusqu'à révéler un sort non-terrain de coût converti inférieur ; vous pouvez le lancer gratuitement, puis remettez le reste en dessous dans le désordre.",
    sourceNote: "Entrée lexique dédiée, terme identique en français et en anglais.",
    confidence: "high",
  },
  {
    termEn: "Convoke",
    termFr: "Convocation",
    category: "keyword-other",
    definitionFr:
      "Capacité imprimée sur certains sorts signifiant que vous pouvez engager n'importe quel nombre de créatures dégagées que vous contrôlez comme coût supplémentaire pour le lancer. Chaque créature ainsi engagée paie {1} ou un mana de la couleur de cette créature.",
    sourceNote:
      "Texte « Convocation » imprimé sur Corde d'adjuration (Chord of Calling), Ravnica Remastered #134, 2023 (mécanique parue initialement dans Ravnica, 2005) ; confirmé par les notes de publication officielles FR de Ravnica Remastered.",
    confidence: "high",
  },
  {
    termEn: "Disturb",
    termFr: "Perturbation",
    category: "keyword-other",
    definitionFr:
      "Mot-clé imprimé sur la face verso de certaines cartes recto-verso, apparu dans Innistrad : Chasse de minuit / Noce écarlate (2021). « Perturbation [coût] » signifie que vous pouvez lancer cette carte transformée depuis votre cimetière en payant ce coût à la place de son coût de mana ; le permanent obtenu arrive sur le champ de bataille verso visible.",
    sourceNote:
      "Texte « Perturbation {4}{B} » imprimé sur Geist cupide (verso de Coupe-bourse caché // Geist cupide), Innistrad : Chasse de minuit, 2021 ; confirmé par les notes de publication officielles FR (media.wizards.com, FR_MTGMID_ReleaseNotes_08022021.pdf).",
    confidence: "high",
  },
  {
    termEn: "Explore",
    termFr: "Explorer",
    category: "keyword-other",
    definitionFr:
      "Révélez la carte du dessus de votre bibliothèque : si c'est un terrain, mettez-la en main ; sinon, gardez-la au-dessus ou mettez-la au cimetière, et la créature reçoit un marqueur +1/+1 si la carte n'était pas un terrain.",
    sourceNote: "Nom officiel de carte « Explore » traduit « Explorer » ; entrée lexique dédiée.",
    confidence: "high",
  },
  {
    termEn: "Foretell",
    termFr: "Prédiction",
    category: "keyword-other",
    definitionFr:
      "Pendant votre étape principale, payez {2} pour exiler cette carte face cachée depuis votre main ; vous pourrez ensuite la lancer plus tard depuis l'exil pour son coût de prédiction, souvent moins cher. Cache l'information et lisse la courbe de mana.",
    sourceNote: "Nom officiel de la carte de rappel « Foretell » traduit « Prédiction ».",
    confidence: "high",
  },
  {
    termEn: "Kicker",
    termFr: "Kick",
    category: "keyword-other",
    definitionFr:
      "Coût supplémentaire facultatif imprimé sur certains sorts depuis Invasion (2000). « Kick [coût] » signifie que vous pouvez payer ce coût en plus au moment où vous lancez le sort, ce qui déclenche un effet renforcé ou additionnel décrit sur la carte si le sort a été kické.",
    sourceNote:
      "Texte « Kick {4} » imprimé sur Feu shivân (Shivan Fire), Dominaria, 2018 ; confirmé par les notes de publication officielles FR de Dominaria unie (« Kick {1}{U} »). Confirme que le terme français est bien l'anglicisme non traduit « Kick », pas « Kicker ».",
    confidence: "high",
  },
  {
    termEn: "Mutate",
    termFr: "Mutation",
    category: "keyword-other",
    definitionFr:
      "Mot-clé imprimé sur certaines cartes de créature d'Ikoria : la terre des Béhémoths (2020). « Mutation [coût] » signifie que vous pouvez lancer le sort pour ce coût à la place de son coût de mana ; s'il cible une créature non-Humaine que vous contrôlez, il fusionne avec elle (au-dessus ou en dessous, à votre choix), formant une créature mutante qui cumule toutes les capacités des cartes fusionnées.",
    sourceNote:
      "Texte « Mutation {3}{R} » imprimé sur Perce-nuages (Cloudpiercer), Ikoria : la terre des Béhémoths, 2020 ; confirmé par l'article officiel FR des mécaniques d'Ikoria sur magic.wizards.com/fr.",
    confidence: "high",
  },
  {
    termEn: "Proliferate",
    termFr: "Proliférer",
    category: "keyword-other",
    definitionFr:
      "Choisissez un nombre quelconque de permanents et/ou joueurs qui ont déjà un marqueur (ou du poison), puis ajoutez un marqueur du même type à chacun. Excellent pour faire grossir des marqueurs +1/+1, de loyauté, ou toute stratégie à marqueurs.",
    sourceNote: "Entrée lexique dédiée, terminologie communautaire francophone stable.",
    confidence: "high",
  },
  {
    termEn: "Reconfigure",
    termFr: "Reconfiguration",
    category: "keyword-other",
    definitionFr:
      "En payant son coût de reconfiguration, cette créature-Équipement peut s'attacher à une autre créature que vous contrôlez (devenant alors un Équipement plutôt qu'une créature), ou se détacher pour redevenir une créature.",
    sourceNote: "Nom de carte officiel « Reconfiguration expéditive » (Gatherer FR).",
    confidence: "high",
  },
  {
    termEn: "Bracket system",
    termFr: "Catégories",
    category: "commander",
    definitionFr:
      "Échelle officielle de niveaux de puissance du format Commander (introduite début 2025, toujours en vigueur en août 2026) : cinq catégories numérotées, chacune associée à un nom — Catégorie 1 (Exhibition), Catégorie 2 (Basique), Catégorie 3 (Amélioré), Catégorie 4 (Optimisé) et Catégorie 5 (cEDH) — définies notamment par le nombre de Cartes à impact autorisées (voir ce terme). Utile pour annoncer le niveau de son deck avant une partie.",
    sourceNote:
      "Wizards traduit systématiquement « Brackets » par « Catégories » sur sa page officielle magic.wizards.com/fr/formats/commander (section « CATÉGORIES »), jamais par « Paliers » ni en gardant l'anglais — vérifié le 28/08/2026.",
    confidence: "high",
  },
  {
    termEn: "Color identity",
    termFr: "Identité de couleur",
    category: "commander",
    definitionFr:
      "Ensemble des couleurs déterminé par le coût de mana et les symboles de mana dans le texte d'un permanent (y compris votre commandant). En Commander, chaque carte du deck doit avoir une identité de couleur incluse dans celle du commandant.",
    sourceNote: "Règles complètes §903.4 (identité de couleur en Commander) ; entrée lexique dédiée.",
    confidence: "high",
  },
  {
    termEn: "Commander tax",
    termFr: "Taxe de commandant",
    category: "commander",
    definitionFr:
      "Chaque fois que vous lancez votre commandant depuis la zone de commandement, son coût augmente de {2} générique, cumulatif à chaque relance durant la partie (règle 903.8 des Règles Complètes). À prendre en compte dans sa courbe de mana si l'on recaste souvent son commandant. Ni les Règles Complètes anglaises ni leur traduction française officielle ne nomment cette règle — « taxe de commandant » est un terme communautaire, mais quasi universel sur les forums francophones.",
    sourceNote:
      "Règles Complètes FR/EN (règle 903.8, décrivent le coût sans le nommer) ; usage confirmé sur magiccorporation.com (fils de discussion dédiés « taxe de commandant ») — vérifié le 28/08/2026, aucun terme concurrent significatif trouvé.",
    confidence: "medium",
  },
  {
    termEn: "EDHREC",
    termFr: "EDHREC",
    category: "commander",
    definitionFr:
      "Site communautaire (non officiel) qui agrège des statistiques d'inclusion de cartes par commandant, à partir de decklists publiées en ligne. Utile pour trouver des idées de cartes synergiques avec un commandant donné.",
    sourceNote: "Nom propre d'un site tiers (edhrec.com) ; description factuelle de son fonctionnement.",
    confidence: "high",
  },
  {
    termEn: "Game Changers (list)",
    termFr: "Cartes à impact",
    category: "commander",
    definitionFr:
      "Traduction officielle française de « Game Changers » : liste de cartes particulièrement puissantes utilisée pour définir les Catégories de puissance du format Commander (voir ce terme). Les Catégories 1 et 2 les interdisent totalement, la Catégorie 3 en autorise jusqu'à trois par deck, et les Catégories 4 et 5 n'ont aucune limite. La liste précise des cartes concernées est révisée périodiquement par Wizards.",
    sourceNote:
      "Wizards, page officielle magic.wizards.com/fr/formats/commander (section « CARTES À IMPACT ») : « Les catégories une et deux excluent les Cartes à impact. La catégorie trois autorise jusqu'à trois Cartes à impact. » — vérifié le 28/08/2026.",
    confidence: "high",
  },
  {
    termEn: "Precon",
    termFr: "Préconstruit",
    category: "commander",
    definitionFr:
      "Deck vendu tout prêt par Wizards (souvent thématique autour d'un commandant), utilisable tel quel ou comme base à améliorer — c'est le point de départ de tous les decks « Commander (papier) » de ce site.",
    sourceNote: "Terme standard chez les revendeurs et la communauté française (« Deck Préconstruit »).",
    confidence: "high",
  },
  {
    termEn: "Singleton",
    termFr: "Singleton",
    category: "commander",
    definitionFr:
      "Règle de construction imposant un seul exemplaire de chaque carte (hors terrains de base) dans le deck. C'est la contrainte fondamentale du format Commander, qui pousse à diversifier les effets plutôt qu'à jouer des cartes en plusieurs copies. Le terme anglais est repris tel quel en français, y compris dans des documents officiels Wizards.",
    sourceNote:
      "Confirmé dans un document officiel Wizards en français (Notes de publication Commander 2013) : « Commander est un format « singleton ». Autrement dit, excepté les terrains de base, chaque carte doit avoir un nom anglais différent. » — confirmé aussi par 3 sources communautaires françaises indépendantes (magiccorporation.com, ratemydecks.com/fr, jeuxonline.info).",
    confidence: "high",
  },
  {
    termEn: "Social contract",
    termFr: "Contrat social",
    category: "commander",
    definitionFr:
      "Ensemble non écrit d'attentes partagées entre joueurs de Commander (éviter certaines stratégies trop oppressives en partie décontractée, par exemple) pour que la partie reste amusante pour tous. Sert de base philosophique au format. ⚠ Traduction proposée par ce site plutôt que terme réellement observé : une recherche ciblée sur plusieurs sites Commander francophones dédiés n'a trouvé aucun usage réel de « contrat social » (ni de l'anglais « social contract ») — le concept y est systématiquement décrit en langage courant plutôt que nommé.",
    sourceNote:
      "Recherche du 28/08/2026 sur magic-casual.fr, nofastmana.fr, La Tour de Commandement (EDHREC France) et les forums magic-ville.com/magiccorporation.com : aucune occurrence du terme trouvée, le concept y est expliqué sans étiquette fixe.",
    confidence: "low",
  },
  {
    termEn: "Combo",
    termFr: "Combo",
    category: "deckbuilding",
    definitionFr:
      "Association de deux cartes ou plus qui, ensemble, produisent un effet disproportionné (souvent la victoire immédiate ou un avantage écrasant). En Commander, l'omniprésence de combos rapides est un facteur clé du système de paliers.",
    sourceNote: "Anglicisme courant, usage généralisé dans la communauté francophone.",
    confidence: "high",
  },
  {
    termEn: "Mana curve",
    termFr: "Courbe de mana",
    category: "deckbuilding",
    definitionFr:
      "Répartition du nombre de cartes de votre deck selon leur coût converti de mana. Une courbe bien pensée évite d'avoir trop de cartes chères et pas assez de cartes jouables tôt en partie.",
    sourceNote: "Terme officiel Wizards en français, article officiel « Comment construire une courbe de mana ».",
    confidence: "high",
  },
  {
    termEn: "Mana dork",
    termFr: "Mana dork",
    category: "deckbuilding",
    definitionFr:
      "Petite créature (souvent à 1 mana) qui peut être engagée pour produire du mana, généralement un elfe vert. Permet d'accélérer son développement, mais reste vulnérable au retrait de créatures. L'expression anglaise est utilisée telle quelle dans les sources françaises consultées.",
    sourceNote:
      "Confirmé utilisé tel quel (anglicisme direct dans une phrase française) sur magic-casual.fr et ratemydecks.com/fr ; aucune traduction alternative (« elfe de mana », etc.) trouvée en usage réel sur magiccorporation.com ou magic-ville.com — vérifié le 28/08/2026.",
    confidence: "low",
  },
  {
    termEn: "Mana rock",
    termFr: "Caillou (de mana) / Mana rock",
    category: "deckbuilding",
    definitionFr:
      "Artefact (souvent à 2 ou 3 manas) qui peut être engagé pour produire du mana, comme Anneau de Sol ou Sceau arcanique. Accélère le développement sans dépendre de la survie d'une créature. Le site francophone magic-casual.fr utilise le terme familier « caillou » pour ces artefacts, mais l'anglais « mana rock » ou une description neutre restent tout aussi courants ailleurs.",
    sourceNote:
      "« Caillou » utilisé de façon répétée sur magic-casual.fr (« privilégier autant que possible les cailloux à 2 manas ») ; par contraste, ratemydecks.com/fr et magiccorporation.com n'emploient ni « caillou » ni « mana rock » de façon fixe — un seul site fort attestant le terme, d'où une confiance medium plutôt que high. Vérifié le 28/08/2026.",
    confidence: "medium",
  },
  {
    termEn: "Ramp",
    termFr: "Accélération de mana / Ramp",
    category: "deckbuilding",
    definitionFr:
      "Terme générique pour les cartes qui accélèrent la production de mana disponible avant le tour attendu, via des terrains, mana rocks ou mana dorks. Essentiel en Commander pour arriver plus vite à jouer ses grosses cartes. « Accélération de mana » est l'équivalent formel le plus utilisé à l'écrit, mais l'anglicisme « ramp » (« le ramp », « jouer du ramp ») domine largement à l'oral et dans les guides.",
    sourceNote:
      "« Accélération de mana » utilisé sur magiccorporation.com et magic-casual.fr ; « ramp » employé comme nom masculin dans tout le guide de ratemydecks.com/fr (« Le ramp est la colonne vertébrale de chaque deck Commander ») ; « rampe de mana » (variante précédemment retenue) ne s'est trouvée que dans un seul titre de deck isolé, donc écartée comme terme dominant. Vérifié le 28/08/2026.",
    confidence: "medium",
  },
  {
    termEn: "Sideboard",
    termFr: "Réserve",
    category: "deckbuilding",
    definitionFr:
      "Ensemble de 15 cartes maximum que l'on peut échanger avec le deck principal entre les manches d'un match, pour s'adapter à l'adversaire. Non utilisé en Commander classique (format à une seule partie, sans réserve).",
    sourceNote: "Terme officiel des règles françaises de Magic ; entrées lexique dédiées.",
    confidence: "high",
  },
  {
    termEn: "Tutor",
    termFr: "Tuteur",
    category: "deckbuilding",
    definitionFr:
      "Carte (souvent un sort) qui permet de chercher une carte précise dans sa bibliothèque et de la mettre en main ou sur le champ de bataille. Très puissant pour aller chercher sa pièce de combo ou sa réponse clé, mais souvent régulé en parties décontractées.",
    sourceNote: "Terme officiel/consacré, correspond aussi au nom donné en français à la famille de cartes « Tutor » (ex. « Tuteur éclairé »).",
    confidence: "high",
  },
  {
    termEn: "Board wipe",
    termFr: "Board wipe / Rase-board",
    category: "gameplay",
    definitionFr:
      "Sort qui détruit, exile ou neutralise la plupart ou la totalité des créatures (parfois d'autres permanents) sur le champ de bataille. Une carte clé en Commander multijoueur pour réinitialiser une partie qui tourne mal. L'anglicisme « board wipe » est très largement utilisé tel quel ; le néologisme « rase-board » existe aussi dans certains guides francophones. La traduction littérale « balayage (de table) » précédemment retenue ici s'est révélée introuvable en usage réel et a été abandonnée.",
    sourceNote:
      "« Board wipe(s) » confirmé en usage sur ratemydecks.com/fr ; « rase-board » utilisé de façon répétée (9 occurrences) dans le guide de deckbuilding EDH de magic-casual.fr. Une recherche ciblée de « balayage de table » sur magiccorporation.com et magic-ville.com n'a donné aucun résultat pertinent lié à Magic. Vérifié le 28/08/2026.",
    confidence: "medium",
  },
  {
    termEn: "ETB (Enters the battlefield)",
    termFr: "Arrivée sur le champ de bataille",
    category: "gameplay",
    definitionFr:
      "Abréviation désignant les capacités déclenchées qui se produisent quand un permanent entre sur le champ de bataille (formule officielle : « Quand [cette carte] arrive sur le champ de bataille... »). Les effets ETB sont très recherchés en Commander car ils apportent de la valeur même si la carte est ensuite détruite.",
    sourceNote: "Formulation exacte reprise du texte officiel imprimé sur les cartes françaises.",
    confidence: "high",
  },
  {
    termEn: "Exile",
    termFr: "Exil",
    category: "gameplay",
    definitionFr:
      "Zone de jeu séparée du cimetière, de la main, de la bibliothèque et du champ de bataille. Une carte exilée n'est en général plus accessible aux effets de récupération depuis le cimetière, sauf mention contraire.",
    sourceNote: "Terme officiel des règles complètes en français.",
    confidence: "high",
  },
  {
    termEn: "Graveyard",
    termFr: "Cimetière",
    category: "gameplay",
    definitionFr:
      "Zone où vont les cartes détruites, sacrifiées, défaussées ou qui meurent (pour les créatures). De nombreuses stratégies (récursion, flashback, perturbation) exploitent activement le cimetière comme une ressource.",
    sourceNote: "Terme officiel des règles complètes en français, utilisé de façon constante sur les cartes imprimées.",
    confidence: "high",
  },
  {
    termEn: "Mulligan",
    termFr: "Mulligan",
    category: "gameplay",
    definitionFr:
      "Action de mélanger sa main de départ dans la bibliothèque et d'en piocher une nouvelle (règle du « mulligan de Londres » : on pioche 7 cartes puis on en remet un nombre égal au nombre de mulligans pris sous sa bibliothèque). Sert à corriger une main injouable.",
    sourceNote: "Terme officiel des règles complètes, conservé tel quel en français ; article officiel WPN sur le mulligan de Londres.",
    confidence: "high",
  },
  {
    termEn: "Stack",
    termFr: "Pile",
    category: "gameplay",
    definitionFr:
      "Structure sur laquelle les sorts et capacités attendent d'être résolus, dans l'ordre inverse de leur mise en jeu (dernier arrivé, premier résolu). Comprendre la pile est essentiel pour savoir quand répondre à un sort ou une capacité adverse.",
    sourceNote: "Terme officiel des règles complètes en français.",
    confidence: "high",
  },
  {
    termEn: "Stax",
    termFr: "Stax",
    category: "gameplay",
    definitionFr:
      "Archétype de stratégie qui vise à ralentir tous les joueurs (souvent via des taxes sur le mana ou des restrictions) pour tirer parti d'un avantage structurel. Généralement peu apprécié en tables décontractées — à évoquer avec son groupe avant de jouer ce type de deck.",
    sourceNote: "Nom d'archétype dérivé de la carte « Smokestack », conservé tel quel en français comme en anglais.",
    confidence: "high",
  },
];

export const GLOSSARY_CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  "keyword-evergreen": "Mot-clé intemporel",
  "keyword-other": "Mot-clé (autre)",
  deckbuilding: "Deckbuilding",
  commander: "Commander",
  gameplay: "Jeu / règles",
};

export const GLOSSARY_CATEGORY_ORDER: GlossaryCategory[] = [
  "keyword-evergreen",
  "keyword-other",
  "deckbuilding",
  "commander",
  "gameplay",
];

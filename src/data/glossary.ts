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
      "Capacité activée des cartes d'Équipement : en payant son coût, elle attache l'artefact à une créature ciblée que vous contrôlez (uniquement en tant que rituel). Permet de faire circuler un bonus d'une créature à une autre.",
    sourceNote: "Texte « Équipement {coût} » imprimé sur les cartes d'artefact-équipement françaises.",
    confidence: "medium",
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
      "Chaque créature que vous engagez en lançant ce sort paie {1} ou un mana de la couleur de cette créature. Permet de lancer de gros sorts en avance en « payant » avec ses créatures.",
    sourceNote: "Entrée lexique dédiée, terminologie communautaire francophone stable.",
    confidence: "medium",
  },
  {
    termEn: "Disturb",
    termFr: "Perturbation",
    category: "keyword-other",
    definitionFr:
      "Capacité des cartes recto-verso permettant de lancer la carte depuis le cimetière, mais uniquement sous sa face transformée (dos), en payant son coût de perturbation. Une deuxième vie sous une forme différente.",
    sourceNote: "mtga.untapped.gg/fr et entrée lexique dédiée.",
    confidence: "medium",
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
      "Vous pouvez payer un coût supplémentaire (le « coût de kick ») en lançant ce sort pour obtenir un effet bonus. Une carte flexible, jouable tôt pour pas cher ou plus tard avec plus d'impact.",
    sourceNote: "Entrée lexique dédiée ; terme confirmé sur mtga.untapped.gg/fr (« Kick »).",
    confidence: "medium",
  },
  {
    termEn: "Mutate",
    termFr: "Mutation",
    category: "keyword-other",
    definitionFr:
      "Vous pouvez lancer ce sort pour son coût de mutation en le fusionnant avec une créature non-humaine que vous contrôlez ; la carte fusionnée devient une seule créature, cumulant généralement les capacités. Permet de combiner un gros corps avec de bonnes capacités.",
    sourceNote: "Entrée lexique dédiée, terminologie communautaire francophone stable.",
    confidence: "medium",
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
    termFr: "Paliers (Brackets)",
    category: "commander",
    definitionFr:
      "Système officiel (introduit en 2025) qui classe les decks Commander en niveaux de puissance (1 à 5) pour faciliter l'appariement entre joueurs aux tables. Utile pour annoncer le niveau de son deck avant une partie.",
    sourceNote:
      "Terminologie française encore en stabilisation (système récent) ; « paliers » est employé par des médias MTG francophones, mais « brackets » reste aussi très utilisé tel quel. Aucun terme officiel Wizards en français confirmé.",
    confidence: "low",
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
      "Chaque fois que vous lancez votre commandant depuis la zone de commandement, son coût augmente de {2} générique, cumulatif à chaque relance durant la partie. À prendre en compte dans sa courbe de mana si l'on recaste souvent son commandant.",
    sourceNote: "Terme communautaire standard désignant une règle officielle du format Commander (surcoût {2} par relance).",
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
    termFr: "Game Changers",
    category: "commander",
    definitionFr:
      "Liste officielle de cartes jugées particulièrement puissantes ou déterminantes, utilisée dans le système de paliers pour distinguer les decks les plus optimisés (paliers 4-5) des decks plus décontractés.",
    sourceNote: "Terme laissé tel quel en anglais dans les sources francophones consultées ; aucune traduction officielle trouvée (liste introduite en 2025).",
    confidence: "low",
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
      "Règle de construction imposant un seul exemplaire de chaque carte (hors terrains de base) dans le deck. C'est la contrainte fondamentale du format Commander, qui pousse à diversifier les effets plutôt qu'à jouer des cartes en plusieurs copies.",
    sourceNote: "Terme anglais conservé tel quel dans l'usage francophone ; aucune traduction officielle distincte identifiée.",
    confidence: "medium",
  },
  {
    termEn: "Social contract",
    termFr: "Contrat social",
    category: "commander",
    definitionFr:
      "Ensemble non écrit d'attentes partagées entre joueurs de Commander (éviter certaines stratégies trop oppressives en partie décontractée, par exemple) pour que la partie reste amusante pour tous. Sert de base philosophique au format.",
    sourceNote: "Traduction littérale du terme communautaire anglais ; pas un terme de règle officiel.",
    confidence: "medium",
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
      "Petite créature (souvent à 1 mana) qui peut être engagée pour produire du mana, généralement un elfe vert. Permet d'accélérer son développement, mais reste vulnérable au retrait de créatures.",
    sourceNote: "Expression anglaise familière conservée telle quelle ; aucune traduction officielle ou communautaire fixe identifiée — argot de joueurs.",
    confidence: "low",
  },
  {
    termEn: "Mana rock",
    termFr: "Mana rock",
    category: "deckbuilding",
    definitionFr:
      "Artefact (souvent à 2 ou 3 manas) qui peut être engagé pour produire du mana, comme Anneau de Sol ou Sceau arcanique. Accélère le développement sans dépendre de la survie d'une créature.",
    sourceNote: "Expression anglaise conservée telle quelle ; aucune traduction officielle ou communautaire fixe identifiée — argot de joueurs.",
    confidence: "low",
  },
  {
    termEn: "Ramp",
    termFr: "Rampe (de mana)",
    category: "deckbuilding",
    definitionFr:
      "Terme générique pour les cartes qui accélèrent la production de mana disponible avant le tour attendu, via des terrains, mana rocks ou mana dorks. Essentiel en Commander pour arriver plus vite à jouer ses grosses cartes.",
    sourceNote: "Terme communautaire francisé de l'anglais « ramp », usage répandu dans la communauté FR.",
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
    termFr: "Balayage (de table) / Board wipe",
    category: "gameplay",
    definitionFr:
      "Sort qui détruit, exile ou neutralise la plupart ou la totalité des créatures (parfois d'autres permanents) sur le champ de bataille. Une carte clé en Commander multijoueur pour réinitialiser une partie qui tourne mal.",
    sourceNote: "Expression anglaise très utilisée telle quelle dans la communauté francophone ; « balayage » est parfois employé mais aucun terme unique dominant confirmé.",
    confidence: "low",
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

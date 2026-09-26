# Commander Booster

Un site pour partir d'un deck préconstruit — Commander papier, Duel
Commander (1v1) ou MTG Arena — trouver les cartes qui l'amélioreraient, et
visualiser le gain de puissance estimé, avec le texte oracle et le coût de
mana de chaque carte.

## Fonctionnalités (v1)

**Commander papier**
- Parcourir les 190 decks Commander préconstruits officiels (Commander
  2011 → aujourd'hui), avec recherche par nom / extension / commandant.
- Page détail d'un deck : liste complète des cartes, coût de mana, texte
  oracle et image au clic. Survoler une vignette agrandit l'image en
  superposition pour mieux la lire, sans avoir à déplier la carte.
- Suggestions de cartes pour combler les faiblesses structurelles du deck,
  filtrées par légalité Commander et identité couleur du commandant.
- Tableau de bord en tête de page (score actuel → projeté, et couverture
  des 9 piliers de deckbuilding avec leur cible) — voir "Refonte UI/UX du
  26/08/2026" plus bas.
- Chaque carte de la liste affiche son (ou ses) rôle(s) directement en
  ligne — plus besoin de la retaper dans "Tester une carte" pour savoir à
  quoi elle sert (ou qu'elle ne matche aucun des 9 piliers, assumé
  honnêtement plutôt que masqué).
- Reprendre un deck exporté en CSV (page d'accueil) : réimporte un fichier
  CSV précédemment généré par le bouton "Exporter en CSV" pour continuer
  une session d'optimisation plus tard, sur un autre appareil ou après
  nettoyage du navigateur. Contrairement à la sauvegarde automatique
  (localStorage, locale à un navigateur), le CSV est un fichier portable.
  Les cartes marquées "ajoutée via suggestion" / "à retirer" dans le CSV
  sont restaurées telles quelles, pas seulement la liste de cartes.

**Duel Commander** (`/duelcommander`, 05/09/2026)
- Format 1v1 (vie 20) à part entière : légalité/banlist propres (via la
  clé Scryfall officielle `duel`, distincte de `commander` — ex. Sol Ring
  y est banni), et cibles/poids des 9 piliers recalibrés pour le 1v1
  (removal/tutor/disruption pèsent plus, wipe beaucoup moins — voir
  `DUEL_COMMANDER` dans `src/lib/formats.ts` pour le détail et les
  réserves).
- Pas de précons officiels pour ce format (il n'en existe pas) : la
  section propose à la place 11 vrais decks de tournoi récents
  (01-03/09/2026, Europe/Amérique du Sud/USA), scrapés sur
  [mtgtop8.com](https://www.mtgtop8.com/format?f=EDH) — voir "Duel
  Commander : section dédiée (05/09/2026)" plus bas pour la méthode de
  collecte (manuelle, pas un script) et ses limites.
- Même simulateur interactif que les autres sections (ajout/retrait/swap,
  Super Opti, export CSV) : aucune fonctionnalité dupliquée.

**Ma collection** (`/collection`, 10/09/2026)
- Importe les cartes possédées (texte collé libre OU CSV) et suggère le
  meilleur deck Commander/Duel Commander constructible avec, plutôt que de
  se contenter d'analyser une liste déjà fixée.
- Détecte automatiquement les commandants possibles dans la collection
  (créature légendaire, ou "can be your commander") et présélectionne
  celui qui donnerait le meilleur score — un sélecteur permet de changer
  d'avis et de reconstruire le deck pour un autre candidat.
- Sélectionne les meilleures cartes possédées (piliers sous leur cible en
  priorité) dans l'identité couleur du commandant, puis complète avec des
  terrains de base si la collection ne suffit pas à remplir le deck — un
  deck toujours immédiatement jouable, même incomplet.
- Le score et les suggestions d'acquisition (quoi ajouter pour combler ce
  qui manque encore) réutilisent tel quel le moteur existant — voir "Deck
  depuis ma collection : section dédiée (10/09/2026)" plus bas.

**Simulateur interactif** (sur toute page deck)
- Ajouter une carte suggérée met à jour le deck immédiatement, recalcule
  le score et les nouvelles suggestions (le retrait d'une carte comble
  peut faire apparaître un nouveau manque ailleurs), et permet de retirer
  n'importe quelle carte (y compris pour respecter la taille du deck).
- Sauvegarde automatique dans le navigateur (localStorage, pas de compte
  ni de base de données) : une bannière propose de reprendre la session
  en revenant sur la page.
- Export CSV de la liste finale (nom, coût de mana, type, "ajoutée via
  suggestion" oui/non, "marquée à retirer" oui/non) — fonctionne sur tous
  les formats.
- Suggestions de swap : quand une carte suggérée a une candidate évidente
  au retrait dans le deck actuel, la suggestion l'affiche directement
  ("⇄ À la place de [carte]") et le bouton devient "⇄ Swap" plutôt que
  "+ Ajouter". Cliquer dessus ouvre une confirmation avec deux issues : soit
  swap immédiat (ajoute la suggestion et retire la candidate en un seul
  recalcul), soit ajout seul avec la candidate simplement taguée "à
  retirer" (badge visible sur sa ligne dans la liste du deck) pour la
  retirer manuellement plus tard. La candidate est choisie par une
  heuristique interne (voir `pickSwapCandidate` dans `src/lib/recommend.ts`)
  : en priorité une carte du même rôle déjà bien couverte (swap "montée en
  gamme"), sinon la carte la moins impactante identifiée dans le deck.
  Comme pour le reste du moteur de score, c'est une approximation
  explicable, pas une garantie que c'est LA meilleure carte à sacrifier.
- Annuler un swap : retirer (via le ×) une carte qui a été ajoutée par un
  swap confirmé remet automatiquement la carte d'origine qu'elle avait
  remplacée, plutôt que de laisser un trou dans le deck. Un ajout simple
  (sans swap) reste un simple retrait — rien à restaurer. Bouton "↺ Retour
  au deck initial" (dans le panneau "Sauvegarder / exporter") pour tout
  annuler d'un coup et repartir du deck tel quel.
- Tester une carte en dehors des suggestions : recherche libre (avec
  autocomplétion Scryfall), regroupée avec les suggestions automatiques
  dans un seul panneau à onglets ("Suggestions automatiques" /
  "Tester une carte") — voir "Refonte UI/UX du 26/08/2026" plus bas.
  Contrairement à
  un simple ajout à l'aveugle, la carte choisie est évaluée par la même
  heuristique que les suggestions automatiques (`evaluateCardCompatibility`
  dans `src/lib/recommend.ts`) : un verdict ("✓ Améliore le deck" si elle
  comble une catégorie encore sous sa cible, "≈ Impact limité" si le rôle
  est déjà bien couvert, "? Rôle non identifié" si l'heuristique n'y voit
  aucun rôle clé) accompagné d'une explication, et — le cas échéant — une
  candidate au retrait pour en faire un swap. La confirmation réutilise le
  même popup que les suggestions automatiques (swap immédiat, ou ajout
  seul avec la candidate taguée "à retirer"). Comme pour le reste du
  moteur de score, ce verdict est une approximation explicable basée sur
  le texte oracle, pas une mesure de puissance individuelle de la carte
  (voir les limites documentées plus bas). Cette recherche n'est filtrée
  ni par légalité ni par identité de couleur : n'importe quelle carte peut
  être cherchée et ajoutée, avec un avertissement (pas un blocage) si elle
  n'est pas légale dans le format en cours ou hors des couleurs du
  commandant, et un message si elle est déjà au nombre d'exemplaires
  maximum autorisé.
- Cartes du deck et suggestions en accordéon (une seule carte dépliée à la
  fois par liste) ; le panneau de suggestions défile dans son propre
  cadre (hauteur limitée) plutôt que d'allonger toute la page.
- Toggle FR/EN en haut de page (dans l'en-tête) pour basculer le texte
  oracle et le type des cartes entre français et anglais. Le nom des
  cartes reste toujours en anglais (clé canonique utilisée partout —
  CSV, export Arena, recherche Scryfall). La traduction FR est récupérée
  à la demande à l'ouverture d'une carte (impression Scryfall en
  `lang:fr` si elle existe) ; si aucune impression française n'est
  trouvée pour une carte, le texte anglais reste affiché avec un message
  explicite plutôt qu'un vide silencieux.

**MTG Arena** (`/arena`)
- Import d'un deck via le texte d'export natif du client Arena (menu du
  deck → Export), pour n'importe quel format : Standard, Historic,
  Explorer, Alchemy, Timeless, Brawl, Historic Brawl.
- Galeries d'exemples pour démarrer : les 4 decks Brawl officiels jamais
  commercialisés (Throne of Eldraine, 2019) et 109 decks de démarrage
  Arena officiels (2018-2020).
- Même moteur de score/suggestions que Commander papier, mais recalibré
  par format : cibles différentes pour un deck constructed 60 cartes
  (jusqu'à 4 exemplaires par carte) vs. un deck singleton 100 cartes
  (Brawl/Historic Brawl), et cartes filtrées à `game:arena`.
- Export du deck (+ suggestions) au format texte Arena, prêt à recoller
  dans le client.

**Glossaire** (`/glossaire`) et **Extensions** (`/extensions`)
- Glossaire de ~55 termes MTG (FR/EN), recherchable et filtrable par
  catégorie (mots-clés intemporels, autres mots-clés, deckbuilding,
  Commander, jeu/règles) — chaque entrée cite sa source et signale les
  traductions non confirmées officiellement.
- Liste des ~58 extensions déjà couvertes par le site (recherchable,
  triable par date ou par nom) ; chaque extension ouvre sur un détail
  recherché (mécaniques réellement introduites par ce set précis,
  expliquées, avec sources — "aucune" étant une réponse honnête et
  fréquente — + contexte utile au deckbuilding), sa checklist complète
  (cartes en FR/EN, zoom au survol, recherche) et les mots-clés présents
  dans ses cartes, automatiquement reliés au glossaire quand une entrée
  correspond. Voir "Glossaire et Extensions (26/08/2026)" et "Mécaniques
  introduites par set (27/08/2026)" plus bas pour l'architecture et les
  limites connues.

## Refonte UI/UX du 26/08/2026

Demande de Ben : le site s'était complexifié avec l'ajout de features
(9e pilier, signal de popularité, swap...) sans revoir l'agencement de la
page deck builder. Après une maquette visuelle (Design Components) validée
par Ben, voici ce qui a été implémenté dans le code (pas seulement
esquissé) :

1. **Score et couverture des 9 piliers enterrés en bas de la colonne
   latérale** (`ImprovementGauge`, invisible sans scroller, et la
   couverture par pilier n'était visible qu'en testant une carte une par
   une) → remplacés par `DeckDashboard` + `PillarCoverage`, un bandeau
   pleine largeur en tête de page, toujours visible sans scroller : score
   actuel → projeté, puis les 9 piliers avec leur cible, colorés (vert =
   cible atteinte, ambre = nettement sous la cible — moins de 60 % de la
   cible, seuil arbitraire choisi pour rester lisible, pas une donnée
   scientifique). Grille de 9 cartes sur desktop, bandeau compact
   défilable horizontalement sur mobile (`lg:hidden` / `hidden lg:grid`,
   même donnée, deux présentations).
2. **La liste du deck n'affichait jamais le rôle d'une carte** → chaque
   ligne (`CardTile`) affiche maintenant sa ou ses catégorie(s) via
   `classifyCard` (jusqu'à 2 affichées, `+N` au-delà pour ne pas surcharger
   la ligne), ou "non identifiée" en italique gris si aucune catégorie ne
   matche — assumé honnêtement plutôt que masqué. Pas affiché sur la ligne
   du commandant (son rôle de "pilier" n'est pas ce qui compte pour lui).
3. **"Suggestions automatiques" et "Tester une carte" étaient deux zones
   déconnectées de la page** (l'une en haut de la colonne principale,
   l'autre en bas de la colonne latérale) alors qu'elles répondent à la
   même question → regroupées dans `ImproveDeckPanel`, un seul panneau à
   onglets. `AddCardSearch` a perdu son propre cadre/titre pour s'intégrer
   dans l'onglet sans double bordure.
4. **Mobile** : le panneau "Améliorer ce deck" apparaît maintenant juste
   après le tableau de bord plutôt qu'après la liste de 99 cartes, via un
   simple réordonnancement CSS (`order-1 lg:order-2` sur la colonne
   latérale, inversé sur la colonne principale) — sans dupliquer aucun
   composant. J'ai délibérément simplifié par rapport à la maquette, qui
   proposait en plus une barre d'onglets fixe en bas d'écran (Deck /
   Améliorer / Score) : je ne l'ai pas construite, le réordonnancement
   seul couvrait déjà le problème concret (score et suggestions visibles
   sans scroller longuement) avec beaucoup moins de surface pour des bugs
   (zone fixe, safe-area iOS, superposition avec les popups existants). Si
   tu veux quand même cette barre d'onglets, dis-le et je l'ajoute.

Vérifié : build (`next build`) et `eslint .` sans erreur, capture d'écran
Playwright de la page deck builder à 1440px et 390px (pas d'erreur de
rendu ; seuls les 403 Scryfall déjà documentés apparaissent en console,
propres au bac à sable de dev). Testé aussi la classification sur les
cartes vérifiées plus tôt cette session (Mana Maze → Disruption,
Smothering Tithe → aucune catégorie, Swords to Plowshares → Removal) pour
confirmer qu'aucune régression n'a été introduite par ce remaniement.

### Retours de Ben du 26/08/2026 (après la refonte ci-dessus)

**Fenêtre de "Tester une carte" coupée.** `ImproveDeckPanel` avait un
`overflow-hidden` sur son conteneur (pour garder les coins arrondis
propres) — sans le vouloir, ça coupait aussi la liste d'autocomplétion de
`AddCardSearch`, positionnée en `absolute` sous le champ de recherche et
censée dépasser la hauteur du panneau. Corrigé en retirant
`overflow-hidden` (aucun enfant n'a de fond carré qui aurait besoin d'être
coupé aux coins arrondis, donc aucune régression visuelle). Vérifié en
inspectant la chaîne d'ancêtres du champ de recherche jusqu'à `<main>` :
tous en `overflow: visible` désormais.

**Une carte tout juste ajoutée ("Insult // Injury", carte split) repassait
"non trouvée" après recalcul**, alors qu'elle existe bien chez Scryfall
(Ben l'a d'abord trouvée et ajoutée via "Tester une carte", qui utilise
`/cards/named?fuzzy=`). Cause exacte non confirmée avec certitude — mon
bac à sable de dev bloque aussi `api.scryfall.com`, impossible de
reproduire l'appel en direct — mais `/cards/collection` (utilisé pour
résoudre toute la liste du deck en un seul appel groupé) fait un match
plus strict que `/cards/named`, et semble ne pas toujours retrouver
certaines cartes multi-faces par leur nom combiné ("Face A // Face B")
pourtant exact. Corrigé dans `getCardsByNames` (`scryfall.ts`) par un
filet de sécurité robuste quelle que soit la cause précise : tout nom qui
échoue sur le lot groupé est retenté individuellement via
`/cards/named?fuzzy=` avant d'abandonner — un seul appel réseau
supplémentaire par nom non résolu, pas par tout le lot. Testé avec un
`fetch` mocké (le batch groupé "manque" volontairement une carte multi-
faces, comme observé) : le filet de sécurité la retrouve bien et la carte
n'apparaît plus en double dans le résultat.

**Piliers cliquables avec filtre de la liste.** Chaque pilier du tableau
de bord (`PillarCoverage`) est maintenant un bouton : cliquer dessus
affiche juste en dessous les cartes du deck qui matchent ce pilier (noms
en puces) et filtre la liste principale du deck sur la même catégorie —
avec un indicateur clair ("Deck (N cartes) · filtré sur Removal (4)") et
un moyen de l'effacer à deux endroits (à côté des piliers, et à côté du
titre "Deck"). Re-cliquer le même pilier annule le filtre. Vérifié avec
un jeu de cartes mockées couvrant plusieurs piliers (capture d'écran :
cliquer "Disruption" affiche bien "Mana Maze" + "Static Orb" et réduit la
liste à ces deux cartes).

**"Déjà dans le deck".** Dans "Tester une carte", le badge "✓ Améliore le
deck" était trompeur quand la carte cherchée était déjà présente au
nombre d'exemplaires maximum autorisé pour le format (typiquement déjà
dans le deck en Commander/Brawl, singleton). Il affiche maintenant "Déjà
dans le deck" dans ce cas précis (`alreadyInDeck` dans
`AddCardSearch.tsx`) ; les verdicts "≈ Impact limité" / "? Rôle non
identifié" restent inchangés, toujours pertinents même pour une carte
déjà présente.

## Glossaire et Extensions (26/08/2026)

Trois ajouts demandés par Ben : un glossaire de termes MTG (FR/EN,
recherchable), une section listant les extensions déjà couvertes par le
site avec leurs mécaniques, et — au sein de cette dernière — la checklist
complète de chaque set avec noms FR/EN, zoom au survol et recherche.

**Portée**, choisie via deux questions posées à Ben (`AskUserQuestion`) :
- Sets couverts : uniquement les ~58 sets déjà référencés par les decks du
  site (dédupliqués depuis les 3 fichiers `src/data/*.json`, voir
  `src/data/tracked-sets.ts`), pas l'intégralité des sets Magic jamais
  imprimés.
- Cartes par set : la checklist officielle complète du set (toutes les
  cartes qu'il contient), pas seulement celles déjà connues via les
  decklists précon/Arena.

**Glossaire** (`src/data/glossary.ts`, ~55 termes) — contenu recherché
(pas rédigé de mémoire) : chaque entrée cite sa source dans
`sourceNote` (glossaire officiel des mots-clés Wizards, notes de
publication officielles, texte imprimé sur cartes françaises, ou à
défaut une source communautaire). `confidence: "low"` signale une
traduction non confirmée officiellement (affiché avec un ⚠ dans l'UI,
ex. "board wipe", "mana dork", "bracket system") — assumé plutôt que
masqué, cohérent avec le reste du site. Portée volontairement limitée
(~55 termes essentiels plutôt que les centaines de mots-clés jamais
imprimés) pour rester fiable sur chaque entrée ; jamais explicitement
confirmée avec Ben, à ajuster sur demande.

**Mots-clés présents dans les cartes** (`computeMechanics` dans
`src/lib/sets.ts`) : calculés automatiquement à partir du champ
`keywords` officiel de chaque carte Scryfall, agrégé sur toute la
checklist du set. Zéro risque d'invention, avec une nuance assumée dans
l'UI : ce sont les mots-clés **présents** dans les cartes de ce set, pas
nécessairement des mots-clés qu'il a introduits en premier — sert
d'outil de filtre secondaire pour la checklist (voir "Mécaniques
introduites par set" ci-dessous pour la vraie réponse à "qu'est-ce que ce
set a introduit ?"). Quand un mot-clé correspond à une entrée du
glossaire (`termEn` matché), le chip affiche la traduction FR et renvoie
vers le glossaire (recherche pré-remplie) ; sinon il reste en anglais,
sans lien.

### Mécaniques introduites par set (27/08/2026)

Demande de Ben, en clarification de ce qui précède : "pour chaque
extension un détail sur l'extension avec notamment les mécaniques
introduites par l'extension expliquées (si applicable) ou tout autre
explication intéressante pour le sujet du site (faire des choix
éclairés)". Les mots-clés "présents" ci-dessus sont un outil de filtre
honnête mais ne répondent pas à cette question — un set peut afficher un
mot-clé sans l'avoir introduit. Ceci ajoute la vraie réponse, recherchée
set par set : `src/data/set-notes.json` (58 entrées, une par
`TRACKED_SETS`), typée `SetNote` (`src/lib/types.ts`), chargée via
`getSetNote` (`src/lib/set-notes.ts`) et affichée en tête de page
extension (`SetNoteSection` dans `SetDetail.tsx`, avant la checklist), au
même niveau de priorité visuelle que la checklist elle-même.

**Contenu par set** : `mechanicsIntroduced` (liste, potentiellement
vide), `context` (2-5 phrases de contexte utile au deckbuilding),
`sourceNotes` (sources utilisées) et `confidence` globale
(`"high"`/`"medium"`/`"low"`). `mechanicsIntroduced: []` est un résultat
attendu et fréquent (22 des 58 sets ont au moins une mécanique
introduite, 36 n'en ont aucune) — la plupart des produits Commander
suivis (ex. "Neon Dynasty Commander"/`nec`, "Zendikar Rising
Commander"/`znc`) sont des suppléments d'un set principal qui n'ajoutent
eux-mêmes aucune mécanique ; l'UI l'affiche comme un fait neutre ("Ce set
n'introduit aucune nouvelle mécanique...", pas un avertissement), pas
comme un manque.

**Méthodologie de recherche** : 58 sets répartis en 12 lots de 4-5,
chacun confié à un agent de recherche indépendant (outil `Agent`, sans
mémoire de la conversation ni des autres lots) avec consigne explicite de
faire une vraie recherche web (plusieurs des sets couverts, dont ceux de
2025-2026, sont postérieurs à la coupure de connaissances du modèle) et
de distinguer rigoureusement "ce produit introduit X" de "ce produit
utilise X, introduit ailleurs" — la confusion la plus probable pour des
produits Commander portant un nom proche d'un set principal différent
(ex. "Forgotten Realms Commander"/`afc`, sorti la semaine précédant
"Adventures in the Forgotten Realms"/`afr`, n'introduit rien lui-même :
Dungeons/Venture into the Dungeon et Class enchantments appartiennent à
`afr`). 5 des 12 lots ont initialement échoué en cours de route (limite
de session du compte, pas une erreur de recherche) et ont été relancés
avec succès dans un tour suivant.

**Limites connues** : `confidence: "low"` (1 set sur 58, `msc`) signale
une zone d'incertitude explicitement flaggée par l'agent de recherche
lui-même (ambiguïté d'attribution non résolue avant l'épuisement de son
budget de recherche pour ce lot) plutôt que masquée — même traitement ⚠
que le glossaire. Comme pour le reste du site, ce contenu n'a pas pu être
vérifié contre l'API Scryfall en direct depuis mon bac à sable (réseau
bloqué) — la recherche factuelle vient d'agents avec accès web réel, mais
le rendu/l'intégration (les trois états UI : mécaniques listées, liste
vide, confiance basse) est vérifié avec un `fetch` mocké et Playwright,
pas avec de vraies données Scryfall en conditions réelles.

**Checklist FR/EN d'un set** (`loadSetChecklist` dans `src/lib/sets.ts`) :
les noms français sont récupérés en un seul passage paginé
(`set:<code> lang:fr`) plutôt qu'un appel par carte, puis appairés aux
cartes anglaises par **numéro de collection** (plus fiable que le nom
pour les cartes multi-faces). `getSetInfo`/`getSetCards`/
`getSetCardsFrNames` sont les nouveaux helpers Scryfall (`scryfall.ts`) ;
`searchCards` accepte maintenant un paramètre `order` (généralisé,
"edhrec" par défaut pour ne rien casser côté suggestions).

**Limites connues, transparence :**
- Un set volumineux et hétérogène comme "Secret Lair Drop" (`sld`, des
  milliers de cartes disparates sous un seul code) peut dépasser la
  limite de pages récupérées par prudence (25 pages = ~4375 cartes) — la
  page affiche alors un avertissement (`checklist.truncated`) plutôt que
  de prétendre à une liste complète.
- `/extensions` (page liste) est forcée en rendu à la demande
  (`export const dynamic = "force-dynamic"`) plutôt que statique, pour
  éviter que Next.js tente de précalculer ~58 appels Scryfall au moment
  du build — même raisonnement que `/decks/[id]`. Le cache `fetch` 24h
  s'applique quand même normalement ensuite.
- Comme pour tout ce qui dépend de Scryfall dans ce projet, je n'ai pas pu
  tester le comportement avec un accès réseau réel depuis mon bac à
  sable (voir "Limites connues sur les sources de données" plus bas) : la
  logique de fusion FR/EN et l'agrégation de mécaniques sont vérifiées
  avec un `fetch` mocké reproduisant la forme exacte des réponses
  Scryfall (pagination, `printed_name`, `keywords`...), et le rendu/les
  interactions (filtre par mécanique, recherche, zoom au survol) avec des
  données de cartes fictives via Playwright — pas avec de vraies cartes
  en conditions réelles.

### Deuxième passe de vérification, réduction de l'incertitude (28/08/2026)

Demande de Ben, après la livraison de ce qui précède : "il y a beaucoup
d'incertitude dans tes informations et analyses. Trouve un moyen de
réduire au maximum ces incertitudes", précisée en "avec pour seul
objectif de limiter l'incertitude à travers tout le site". Plutôt que de
supposer le périmètre, j'ai ciblé les deux jeux de données du site qui
portent un champ `confidence` explicite (le glossaire et les mécaniques
par set) — c'est là que se concentre l'incertitude déclarée du site ; je
n'ai pas touché aux heuristiques de scoring (`deck-score.ts`), qui sont
des choix de conception documentés comme des approximations, pas des
faits à vérifier.

**Méthode** : 7 lots de recherche indépendants (agents avec accès web
réel, sans mémoire de session), chacun chargé de retrouver une **source
primaire directement citable** — texte réellement imprimé sur une carte
française, article officiel "[Produit] Mechanics"/"Release Notes" de
Wizards, ou glossaire officiel des règles — plutôt que de se contenter de
confirmer la formulation existante. Consigne explicite : remonter la
confiance seulement si une source de ce niveau est trouvée, et sinon
documenter précisément ce qui a été vérifié et ce qui reste incertain
(jamais une simple reformulation de l'incertitude).

**Résultat côté glossaire** (14 entrées `medium`/`low` sur 55
réexaminées) : 9 entrées passées à `high` (Équipement, Convocation,
Perturbation, Kick, Mutation, Singleton — toutes confirmées par du texte
de carte française réel ou un document Wizards officiel). Deux
corrections factuelles notables, pas seulement des changements de
confiance : le système de paliers Commander se traduit officiellement
par **« Catégories »** (pas « Paliers ») et la liste "Game Changers" par
**« Cartes à impact »** — les deux confirmés sur la page officielle
`magic.wizards.com/fr/formats/commander`, que la première recherche
n'avait pas su localiser. Deux entrées légitimement dégradées après
recherche plus poussée : "Contrat social" (`medium` → `low`, aucun usage
réel trouvé sur les sites Commander francophones consultés — juste décrit
en langage courant, jamais nommé) confirme que la confiance initiale
était trop généreuse. "Mana rock" et "Board wipe" remontent à `medium`
avec un terme français réel trouvé (« caillou », « rase-board »)
mais porté par une seule source forte, insuffisant pour `high`. "Ramp"
voit son terme français corrigé ("Accélération de mana / Ramp" plutôt que
"Rampe (de mana)", cette dernière variante s'étant révélée quasi
inexistante en usage réel).

**Résultat côté mécaniques par set** (11 entrées `medium`/`low` sur 58
réexaminées) : 9 passées à `high` via une source primaire directement
citable (texte de carte, article officiel). Deux corrections factuelles
importantes qui changent le contenu, pas juste le niveau de confiance —
`ltc` (Tales of Middle-earth Commander) introduit en réalité un mot de
capacité inédit, **le conseil secret** (vote à bulletin secret,
exclusif aux decks Commander et absent du set principal LTR), manqué par
la première recherche ; `msc` (Marvel Super Heroes Commander) a vu son
ambiguïté d'attribution explicitement levée — le deck Doom Prevails
introduit bel et bien le sous-type d'enchantement **Plan** via Glorious
Purpose, alors que les trois autres precons n'utilisent aucune mécanique
neuve. Deux entrées restent `medium` après recherche complète,
honnêtement : `anb` (page Wizards d'origine introuvable après migration
du site, seulement des citations indépendantes concordantes) et `soc`
(aucune phrase officielle "aucune nouvelle mécanique" trouvée, seulement
une absence cohérente dans plusieurs sources — la recherche a quand même
corrigé une erreur de date de sortie initiale). Plus aucune entrée en
confiance `low` côté mécaniques par set (58/58 en `high` ou `medium`).

**Ce que cette passe ne prétend pas** : "confiance élevée" signifie
"source primaire directement citable trouvée", pas "vérité absolue" — un
document Wizards peut lui-même comporter une erreur, et l'absence de
preuve du contraire (ex. sld : aucune des 330+ Secret Lair Drop n'a
jamais introduit de mot-clé inédit) reste une conclusion par convergence
de sources, pas un audit exhaustif carte par carte. Chaque `sourceNote`
mise à jour reste volontairement précise sur ce qui a été vérifié pour
que ce soit vérifiable à nouveau plus tard.

### Checklists de set incomplètes : correctif `unique=prints` (28/08/2026)

Ben a remonté un exemple concret : un set de 132 cartes n'en affichait
que 117, avec le message "checklist potentiellement incomplète" —
jusque-là ce message n'était documenté que pour "sld" (Secret Lair
Drop, plusieurs milliers de cartes), pas pour un set ordinaire.

**Cause identifiée** : `getSetCards`/`getSetCardsFrNames`
(`scryfall.ts`) appelaient la recherche Scryfall sans préciser le
paramètre `unique`, qui vaut alors `"cards"` par défaut côté Scryfall —
une seule entrée par *nom* de carte, même si le set contient plusieurs
*impressions* distinctes de ce nom (art alternatif, showcase,
borderless...), chacune avec son propre numéro de collection. Or le
champ `card_count` du set (utilisé pour détecter une checklist
tronquée) compte lui toutes les impressions, pas les noms uniques —
d'où l'écart (132 imprimées, 117 noms uniques récupérés). Confirmé
verbatim par la documentation officielle Scryfall
(`https://scryfall.com/docs/api/cards/search`, section "unique").

**Correctif** : `searchCards` accepte désormais un paramètre `unique`
optionnel ; `getSetCards`/`getSetCardsFrNames` passent `"prints"`
(toutes les impressions), ce qui aligne le nombre de cartes récupérées
sur `card_count` et correspond à ce qu'on attend d'une "checklist" (une
entrée par carte physiquement imprimable, pas par nom). Les autres
appelants de `searchCards` (suggestions, autocomplétion) ne sont pas
touchés — ils gardent le comportement par défaut de Scryfall. Effet de
bord mineur et documenté dans le code : le comptage des mots-clés par
set (`computeMechanics`/`SetMechanic.cardCount` dans `sets.ts`) compte
maintenant les impressions, pas les noms uniques, pour un set avec des
variantes.

**Sur la vérification en direct** — Ben a explicitement demandé de
trouver un moyen de se connecter réellement à l'API Scryfall plutôt que
de rester bloqué. Tentatives, dans l'ordre :
- `WebFetch` direct sur `api.scryfall.com` : la requête atteint bien
  les serveurs Scryfall mais reçoit un 403 (cohérent avec l'exigence
  Scryfall d'un header `User-Agent` personnalisé, que `WebFetch` ne
  permet pas de définir) — pour un endpoint simple (`/sets/mkc`) comme
  pour une recherche.
- Un agent dédié à ce seul test de connectivité, avec pour consigne de
  tenter plusieurs voies (WebFetch, `curl` en bash local, `curl` sur
  l'ordinateur de Ben via le pont) : le `curl` en bash — aussi bien
  dans le bac à sable que sur l'ordinateur de Ben — ne reçoit même pas
  de réponse de Scryfall : la connexion est coupée avant la poignée de
  main TLS par un proxy réseau local (403 renvoyé par le proxy
  lui-même, `CONNECT` refusé) — restriction d'infrastructure, sans
  rapport avec la politique de Scryfall.
- Tentative d'utiliser le vrai navigateur Chrome de Ben (trouvé via le
  pont vers son ordinateur — un onglet `scryfall.com/docs/api` y était
  déjà ouvert) pour faire la requête depuis un contexte réseau normal
  (ce qui aurait dû fonctionner : c'est exactement ainsi que le site
  Scryfall s'alimente lui-même). L'ouverture/fermeture d'onglets a
  fonctionné, mais les deux outils nécessaires pour lire la page ou
  exécuter du code dans cet onglet ont échoué avec "Google Chrome is
  not running" — alors que Chrome tournait manifestement (les onglets
  se géraient normalement). Résultat : une limite de cet outil précis
  côté pont, pas quelque chose de contournable en retentant.

Aucune de ces voies n'a permis d'obtenir une réponse JSON réelle de
Scryfall depuis cet environnement. Le correctif ci-dessus n'est donc
**pas vérifié contre une réponse Scryfall réelle** — il repose sur la
documentation officielle (citée verbatim ci-dessus) et sur un test avec
des données Scryfall simulées (deux impressions du même nom dans un
set fictif, confirmant que `unique=prints` récupère bien les deux et
que `unique=cards`/défaut n'en récupère qu'une, reproduisant exactement
le cas remonté par Ben). Le site déployé (Vercel), lui, a un accès
réseau normal à Scryfall — une fois ce correctif en ligne, la vraie
vérification sera la page `/extensions/<code>` d'un set à variantes.

### Refonte du scoring et des suggestions, détection d'archétype (28/08/2026)

Ben a demandé d'améliorer l'algorithme de suggestion de cartes et le
scoring des decks — "le cœur du site" — en le rendant "le plus solide
possible et pertinent". Trois faiblesses ont été identifiées et
soumises à Ben (qui a choisi l'option la plus ambitieuse, combinant les
trois) :

1. Le score ignorait complètement la courbe de mana et le nombre de
   terrains — `avgCmc` et `landCount` étaient calculés mais jamais
   utilisés ni affichés.
2. Le choix de la carte à retirer lors d'une suggestion (swap-out)
   ignorait la qualité individuelle des cartes — le site pouvait
   suggérer de retirer la meilleure carte du deck si elle ne couvrait
   qu'un pilier déjà bien pourvu.
3. Aucune détection d'archétype/stratégie : deux decks très différents
   avec le même commandant recevaient des suggestions génériques
   identiques.

Deux demandes annexes ont été intégrées à la même mise à jour : un
correctif visuel du bouton d'import CSV, et une visualisation de la
courbe de mana sur la page de deck.

**Santé de courbe de mana et de terrains.** Deux nouveaux signaux
(`curveHealth`, `landHealth` dans `deck-score.ts`) suivent le même
mécanisme que les 9 piliers existants : un ratio 0-1 multiplié par un
poids, ajouté au score total sur 100. Le ratio utilise une bande de
tolérance (± une marge autour de l'idéal) puis une décroissance
linéaire au-delà — pas un seuil brutal. Les valeurs "idéales"
(`idealAvgCmc`, `idealLandRatio` dans `formats.ts`, ex. CMC moyen 2.9
et ~37 terrains/99 en Commander) sont des heuristiques de construction
de deck courantes, **pas une vérité absolue** — un deck délibérément
agressif (courbe basse) ou très contrôlant (courbe haute) s'écartera
de cet idéal sans que ce soit un défaut. Pour faire de la place à ces
deux nouveaux signaux (16 points au total) sans dépasser 100, les
poids des 9 piliers existants ont été réduits proportionnellement
d'environ 16 %, selon la même méthode déjà utilisée lors de l'ajout du
pilier "disruption".

**Swap-out sensible à la qualité.** `buildRemovalCandidates` applique
désormais des pénalités qui protègent les cartes fortes d'être
proposées au retrait : -5 pour une carte marquée `game_changer` par
Scryfall, -3/-1.5 selon que son `edhrec_rank` est très bas (carte très
jouée) ou modérément bas, et -3 si elle correspond à un archétype
détecté du deck. Ces pénalités restent volontairement plus petites que
l'écart ±3 lié à la couverture de pilier, pour qu'un vrai trou dans un
pilier continue de dominer la décision — la qualité de la carte
affine le choix, elle ne l'écrase pas.

**Détection d'archétype.** Nouveau fichier `archetype.ts` : détection
par motifs de texte + part du type de créature pour 6 archétypes
(sacrifice, +1/+1 counters, spellslinging, artefacts, gain de vie,
tribal). Le choix de ces 6-là est volontaire — des archétypes à signal
faible ou ambigu (stax, group hug...) ont été exclus plutôt que
détectés à moitié. Deux niveaux de confiance ("high" si le commandant
confirme le thème, "medium" sinon, sur la seule part de composition du
deck) ; en dessous de 6 cartes non-terrain le detecteur ne renvoie
aucun signal (échantillon trop petit). **C'est une heuristique, pas une
analyse garantie** : un deck peut avoir un vrai thème que ces 6
catégories ne couvrent pas, ou déclencher un faux positif sur un
thème mineur. Les archétypes détectés alimentent : un budget dédié de
suggestions ciblées (3 sur les 10 maximum) via des requêtes Scryfall
par archétype revalidées carte par carte, l'affichage d'un badge "✦
Archétype" sur le dashboard et les suggestions, et une meilleure
évaluation dans "tester une carte" (une carte qui ne correspond à
aucun pilier mais matche un archétype détecté n'est plus classée
"indéterminée").

**Correctif UI import CSV.** Le bouton natif `<input type="file">`
stylé via le pseudo-élément Tailwind `file:` débordait de son
conteneur (signalé par Ben, captures à l'appui). Remplacé par un motif
plus robuste : input natif masqué (`sr-only`, toujours accessible au
clavier/lecteur d'écran) déclenché par un bouton personnalisé
cohérent avec le design system du site.

**Visualisation de la courbe de mana.** Nouveau composant
`ManaCurveChart.tsx` (histogramme par CMC, 0 à "7+", terrains exclus),
sans dépendance externe, sur la page de deck aux côtés des messages de
santé courbe/terrains — construit en suivant les recommandations d'une
compétence interne de visualisation de données (une seule teinte pour
une série unique, étiquettes de valeur directes plutôt qu'une légende,
pas de survol nécessaire vu le faible nombre de barres).

**Sur la vérification** — comme pour le correctif `unique=prints`
ci-dessus, aucun accès réseau réel à Scryfall n'était disponible dans
cet environnement. La vérification s'est donc faite en deux temps :
des tests de logique métier avec des données Scryfall simulées
(fixtures écrites à la main couvrant les 6 archétypes et plusieurs
profils de deck), puis un serveur Next.js de production complet avec
les mêmes appels Scryfall interceptés, capturé visuellement via
Playwright (formulaire CSV, dashboard, panneau de suggestions,
galerie de decks). Cette deuxième passe a révélé un vrai bug avant
livraison : le score projeté après application des suggestions ne
comptait que les 9 poids de piliers, oubliant les 16 points de
courbe/terrains — le dashboard affichait un score qui *baissait* après
des suggestions pourtant bénéfiques (16,1 → 7,6). Corrigé en ajoutant
la contribution des deux nouveaux signaux au score projeté (en
réutilisant les ratios courbe/terrains *actuels* comme approximation,
plutôt que de re-simuler le deck après échange — précisé dans le code
via un commentaire). Comme pour le correctif précédent, cette mise à
jour reste **non vérifiée contre une vraie réponse Scryfall** — la
vérification en conditions réelles se fera sur le site déployé.

### Recherche de carte sensible à la langue, ajout sans swap, cartes retirées (28/08/2026)

Trois demandes de Ben sur la même mise à jour :

**Recherche de carte selon la langue sélectionnée.** La recherche manuelle
("Tester une carte", AddCardSearch.tsx) matche désormais le nom dans la
langue actuellement choisie via le sélecteur FR/EN en haut du site (déjà
utilisé jusque-là uniquement pour la traduction du texte des cartes, voir
LanguageProvider.tsx) — taper un nom français en mode FR retrouve la carte
via son impression française, pas seulement son nom anglais canonique. Un
message rappelle explicitement la langue de recherche active directement
dans le panneau, avec un raccourci pour en changer sans remonter à l'en-tête
(`autocompleteCardNamesForLang`/`getCardByLocalizedName` dans scryfall.ts).
Repli automatique sur la recherche anglaise si rien ne correspond en
français (carte non traduite, ou nom anglais tapé malgré le mode FR).

⚠️ Comme pour les correctifs Scryfall précédents, aucun accès réseau réel
n'était disponible pour vérifier ceci en direct — vérifié via données
simulées (tests de logique + Playwright sur un serveur de production avec
Scryfall mocké). Un bug a été repéré et corrigé pendant cette implémentation
(pas en vérifiant un signalement de Ben, qui s'est avéré être une carte mal
orthographiée de son côté) : la requête `name:` n'était pas guillemetée,
donc un nom français à plusieurs mots (ex. "machinations de la sorcière")
aurait été scindé par le parseur de requête Scryfall en plusieurs termes
de recherche distincts au lieu d'une seule recherche de sous-chaîne —
corrigé en guillemetant systématiquement la valeur (`name:"..."`).

**Bouton "+ Ajouter" séparé du swap.** Jusqu'ici, quand une suggestion (ou
un résultat de "Tester une carte") avait une candidate au retrait, le seul
bouton disponible ("⇄ Swap") ouvrait une popup de confirmation qui, au
mieux, proposait d'ajouter sans retirer mais en marquant quand même l'autre
carte "à retirer". Aucune option ne permettait un ajout complètement
indépendant. Un second bouton "+ Ajouter" apparaît maintenant à côté du
swap (SuggestionCard.tsx et AddCardSearch.tsx) : il ajoute la carte
directement, sans ouvrir la popup ni toucher à aucune autre carte du deck.

**Liste des cartes retirées pendant la session.** Une nouvelle section
"Retirées pendant cette session", affichée sous la liste du deck
(RemovedCardsList.tsx), garde une trace des cartes qui ont complètement
quitté le deck (dernier exemplaire, via le bouton de retrait ou via un swap
confirmé) — masquée tant qu'aucune carte n'est concernée. Chaque entrée
propose un bouton "Remettre dans le deck" qui la restaure en un clic, sans
avoir à la rechercher à nouveau. Ne suit que les retraits complets : un
décrément partiel (il reste des exemplaires en jeu) n'est pas listé, la
carte n'ayant pas vraiment quitté le deck. Une carte remise automatiquement
suite à l'annulation d'un swap (mécanisme déjà existant, voir plus haut) est
retirée de cette liste plutôt que d'y traîner en double. Persistée dans la
sauvegarde locale du navigateur comme le reste de la session (nom + nombre
seulement — les données Scryfall complètes sont re-résolues à la reprise
via une nouvelle Server Action dédiée, `resolveCardNames`, plutôt que
stockées telles quelles).

### "Super Opti" : optimisation du deck en un clic (29/08/2026)

Demande de Ben : un bouton qui remplace automatiquement les cartes du deck
par les plus optimales possibles, en un seul clic, sur les decks précons
comme sur les imports CSV/Arena.

**Mécanisme.** `superOptimizeDeck` (actions.ts) n'invente aucune nouvelle
logique de score : c'est une boucle autour du moteur de suggestions déjà
existant (`suggestImprovements`, recommend.ts — le même que celui utilisé
carte par carte dans le panneau "Améliorer ce deck"). À chaque tour, il
récupère jusqu'à 10 suggestions (ajout + candidate au retrait), les
applique toutes, puis recommence avec le deck mis à jour — jusqu'à ce qu'un
tour ne trouve plus rien à proposer, ou qu'un plafond de 4 tours soit
atteint (`SUPER_OPTIMIZE_MAX_ROUNDS`), pour borner le temps de calcul sur
un gros deck. Le résultat final est comparé aux cartes de départ pour
calculer précisément quelles cartes ont été ajoutées/retirées au total
(peu importe combien de tours ont été nécessaires), afin d'alimenter les
deux mécanismes déjà en place plutôt que d'en créer un troisième : les
cartes ajoutées rejoignent le badge "Ajoutée" existant, les cartes
retirées rejoignent la liste "Retirées pendant cette session"
(RemovedCardsList.tsx, voir ci-dessus) — restaurables en un clic comme un
retrait manuel.

Filet de sécurité : si, malgré tout, le score final calculé se révèle plus
bas que le score de départ (l'heuristique de retrait ne tient pas compte de
la courbe de mana ni du nombre de terrains, voir la limite documentée sur
`buildRemovalCandidates` dans recommend.ts — un cas en théorie possible même
s'il ne s'est pas produit dans les scénarios testés), le deck n'est pas
modifié et un message l'indique plutôt que d'appliquer un changement net
négatif.

Fonctionne indifféremment sur un deck précon ou un import CSV/Arena : la
fonctionnalité vit dans DeckBuilder.tsx, le composant partagé par les trois
types de page deck du site, et ne prend en entrée que commandant(s) + liste
de cartes, sans rien supposer sur leur origine.

⚠️ Comme pour le reste des fonctionnalités Scryfall de ce projet, aucun
accès réseau réel n'était disponible pour vérifier ceci en conditions
réelles. Vérifié par : un test de logique (dizaines de cartes simulées
réparties sur les 9 piliers, appel direct de `superOptimizeDeck` avec un
`fetch` mocké) confirmant la convergence en plusieurs tours sous le
plafond, le calcul du diff ajoutées/retirées, et la branche "deck déjà
optimal" (aucune suggestion dès le premier tour) ; puis un passage
Playwright sur le build de production avec Scryfall mocké, confirmant
l'intégration UI complète (bouton, texte de chargement, score qui
progresse, badges "Ajoutée", liste "Retirées" peuplée et son bouton de
restauration, second clic qui détecte correctement qu'il n'y a plus rien à
optimiser). Le filet de sécurité anti-régression, lui, n'a été vérifié que
par relecture du code (score final < score de départ) : le reproduire
avec des données simulées réalistes n'a pas été tenté, ce cas restant
délicat à provoquer artificiellement sans fausser le reste du scénario de
test.

### Duel Commander : section dédiée (05/09/2026)

Demande de Ben : "faire le même travail d'optimisation de decks pour Duel
Commander avec une section dédiée", en suggérant de se baser sur
[mtgtop8.com/format?f=EDH](https://www.mtgtop8.com/format?f=EDH) (le
filtre "EDH" de mtgtop8 désigne Duel Commander, pas le Commander
multijoueur classique — vérifié en direct sur le site).

**Format.** Duel Commander est un format 1 contre 1 : deck singleton
~100 cartes comme le Commander papier, mais vie de départ à 20 (au lieu de
40) et parties nettement plus rapides (mtgtop8 indique 10-20 min en
moyenne). Point clé qui a évité un chantier de banlist maison : Scryfall
documente officiellement une clé de légalité `duel` (voir
[scryfall.com/docs/syntax](https://scryfall.com/docs/syntax), mot-clé
`f:`/`format:` — "duel" y est explicitement listé comme "Duel Commander"),
gérée nativement par le mécanisme déjà en place (`card.legalities[format.
scryfallLegality]`, voir `FormatConfig` dans `types.ts`). Le nouveau format
`duelcommander` (`src/lib/formats.ts`) n'a donc eu besoin d'aucune liste de
cartes bannies dupliquée à la main — juste `scryfallLegality: "duel"`,
comme "commander"/"brawl"/etc. Les 9 cibles/poids de piliers ont en
revanche été recalibrés spécifiquement pour le 1v1 (voir le commentaire
détaillé sur `DUEL_COMMANDER` dans `formats.ts`) : removal/tutor/disruption
montent (répondre directement au seul adversaire, consistance pour aller
chercher sa pièce maîtresse), wipe descend fortement (réinitialiser LE
board adverse est bien moins pertinent à 1 contre 1 qu'à 4). Comme pour
COMMANDER_LIKE/CONSTRUCTED_60, ce sont des repères de deckbuilding
raisonnés (partiellement recoupés avec les 11 decklists réelles du
snapshot ci-dessous), pas une donnée officielle.

**Pas de précons — deckbuilding assumé par les joueurs.** Contrairement au
Commander papier, Duel Commander n'a pas de produits préconstruits
officiels. La section propose à la place un snapshot de 11 vraies
decklists de tournoi (classements récents du 01 au 03/09/2026 — Troll2Jeux
Paris, Finale Lega Estiva DC Perugia, DC Arequipa, Liga Plateu Osasco,
Černý Rytíř Prague, Weekly DC Oklahoma City, DC Piacenza), choisies pour
la diversité des commandants/couleurs plutôt que par exhaustivité.

**Méthode de collecte — écart important par rapport au reste du projet.**
Les autres datasets de ce site (`commander-decks.json`,
`arena-*-decks.json`) viennent d'un dataset GitHub communautaire, fetché
par un vrai script (`fetch-precon-decks.mjs`) via `raw.githubusercontent.com`
(accessible en réseau direct depuis le bac à sable cloud). **mtgtop8.com
n'est PAS accessible en réseau direct depuis cet environnement** — testé
et confirmé : `curl` (bash du bac à sable) échoue en `HTTP 000` dessus, de
même que sur `api.scryfall.com` (même restriction déjà documentée) et sur
plusieurs proxies publics essayés en secours (`api.allorigins.win`,
`r.jina.ai`, `corsproxy.io` — tous bloqués aussi). Écrire un vrai script
comme `fetch-precon-decks.mjs` n'était donc pas possible cette fois.

À la place, chaque deck a été **transcrit manuellement via l'outil
WebFetch** (qui, lui, atteint mtgtop8.com — accès différent du `fetch`
Node du bac à sable), avec vérification programmatique du total de cartes
(~100) avant intégration. Deux pièges rencontrés pendant cette collecte,
à connaître pour l'étendre plus tard :
- Demander à WebFetch de "trouver le lien d'export `.dec`" d'un deck puis
  fetcher ce lien séparément s'est révélé **peu fiable** : plusieurs
  tentatives ont renvoyé le contenu d'un tout autre deck récemment fetché
  dans le même lot de requêtes (probablement le petit modèle de résumé qui
  confond/invente un href sous charge). Fiable en revanche : fetcher
  directement la page `event?e=X&d=Y&f=EDH` du deck et demander une
  transcription complète de la decklist telle qu'affichée, sans jamais
  demander de "lien à suivre" en intermédiaire.
- Un paramètre `d=` sans le `e=` correspondant peut renvoyer un deck
  complètement différent — toujours garder les deux paramètres ensemble.

Conséquence assumée : ce snapshot est **manuel, pas régénérable par une
commande** comme les autres — pour l'étendre ou le rafraîchir, il faut
répéter cette collecte (ou écrire un vrai script si l'accès réseau à
mtgtop8.com devient possible depuis cet environnement un jour). Risque
résiduel documenté : une transcription assistée par IA peut comporter un
écart ponctuel de +/-1 sur une quantité de carte (observé sur un deck lors
de la vérification, toujours dans la tolérance acceptée) ; un nom de carte
introuvable sur Scryfall se comporte comme pour n'importe quel import
utilisateur ("non trouvée", pas un crash). Détail complet de la méthode et
des 11 sources : voir le commentaire en tête de
`src/lib/duelcommander-decks.ts`.

**Bug attrapé par la vérification Playwright (voir plus bas) : routage.**
`DeckBrowser`/`DeckCard` étaient conçus uniquement pour les précons papier
(`DeckCard` pointe par défaut vers `/decks/${id}`). Réutiliser ces
composants tels quels pour la section Duel Commander aurait fait pointer
chaque carte vers `/decks/<id-duel-commander>` (404, l'id n'existe pas
dans `commander-decks.json`) au lieu de `/duelcommander/decks/<id>`.
Corrigé en ajoutant un prop `linkBase` optionnel à `DeckBrowser` (défaut
`/decks`, comportement historique inchangé pour l'accueil Commander
papier) plutôt que de dupliquer le composant — voir `DeckBrowser.tsx`.

**⚠️ Piège d'environnement découvert pendant la vérification — à
connaître pour toute future session utilisant la méthodologie de
vérification "niveau 1" (HANDOFF.md section 7).** Sur ce Node/tsx précis
(Node 22.22.2, `tsx` 4.21.0 — a pu changer depuis), `npx tsx
verify-xxx.mts` qui fait `import { X } from "./src/lib/foo.ts"` échoue
avec `SyntaxError: ... does not provide an export named 'X'`, **même pour
un fichier `.ts` trivial sans aucune syntaxe TypeScript**. Confirmé que ce
n'est pas spécifique à ce projet (reproduit avec un fichier `.ts` de test
isolé dans `/tmp`, hors du repo). Le module est en réalité chargé via
l'interop CJS et tous ses exports nommés se retrouvent regroupés sous une
clé `.default` (objet à accesseurs) plutôt qu'exposés en imports nommés
ESM directs. Contournement : importer en `import * as ns from "./foo.ts"`,
puis déstructurer depuis `ns.default ?? ns`. Les scripts `verify-*.mts` de
ce projet devront utiliser ce contournement tant que ce comportement
persiste (pas de repro tenté avec un Node/tsx antérieur pour dater
précisément le changement).

**Vérification.** Niveau 1 (logique pure, `tsx`, fetch mocké) : config du
format (`scryfallLegality`, poids qui totalisent bien 100, singleton),
chargement des 11 decks (par id + id inconnu → `null`), `analyzeDeck()` de
bout en bout sur un deck Duel Commander avec cartes Scryfall simulées
(dont une carte factice "Sol Ring" bannie en `duel` mais légale en
`commander`, pour confirmer que le bon champ de légalité est lu), et
confirmation que la recherche de suggestions utilise bien `f:duel` dans sa
requête Scryfall. Niveau 2 (Playwright sur build de production, Scryfall
mocké) : page de navigation (11 decks affichés, recherche par commandant),
ouverture d'un deck (dashboard, courbe de mana, panneau Suggestions/Super
Opti, export CSV) — captures d'écran relues, aucune erreur console. C'est
cette passe qui a révélé le bug de routage ci-dessus (corrigé puis
re-vérifié). Comme pour tout ce qui touche Scryfall dans ce projet, aucune
de ces vérifications n'a pu se faire contre une vraie réponse Scryfall ou
mtgtop8 en direct depuis cet environnement.

### Deck depuis ma collection : section dédiée (10/09/2026)

Demande de Ben : "importer une liste de cartes et que le site me suggère
un deck Commander (duel ou multi) avec les cartes que j'ai, et voir le
score de performance de ce deck". Trois choix de conception validés avec
lui avant implémentation (`AskUserQuestion`) : import texte collé **et**
CSV (les deux, pas l'un ou l'autre) ; collection insuffisante pour remplir
le deck → compléter avec des terrains de base **et** suggérer le reste à
acquérir (pas un deck partiel sans suggestions) ; commandant détecté
automatiquement avec présélection du meilleur, mais changeable par Ben.

**Principe directeur : aucune nouvelle logique de score.** Comme pour
Super Opti et la recherche manuelle (voir section 11 de HANDOFF.md), cette
fonctionnalité est une couche de sélection au-dessus du moteur existant,
jamais une réinvention. Concrètement : `classifyCard`/`computeDeckStats`
(`deck-score.ts`) décident de tout ce qui touche au score — y compris le
"score d'essai" qui sert à classer les commandants candidats (un candidat
est classé en construisant réellement son deck d'essai puis en
`computeDeckStats`-ant, jamais via une métrique de classement séparée) —
et `analyzeDeck`/`suggestImprovements` (`actions.ts`/`recommend.ts`)
restent l'unique source des suggestions d'acquisition, une fois le deck
construit à partir du pool possédé.

**Nouveaux fichiers, séparation réseau/pur.** `src/lib/collection-import.ts`
parse la collection (texte libre ou CSV, voir plus bas) — aucun appel
réseau, aucune notion de commandant (contrairement à `csv-import.ts`, qui
importe un DECK déjà construit avec cette notion). `src/lib/
collection-builder.ts` contient toute la logique de sélection
(`isCommanderEligible`, `selectDeckFromPool`, `rankCommanderCandidates`) —
elle aussi volontairement sans aucun appel réseau : les cartes lui sont
données déjà résolues, pour rester testable en pur avec de simples objets
`ScryfallCard` à la main plutôt qu'un `fetch` mocké. L'orchestration
réseau (un seul appel groupé `getCardsByNames` pour toute la collection,
un second pour les 6 terrains de base) vit dans une nouvelle fonction
`buildDeckFromCollection` (`actions.ts`), aux côtés d'`analyzeDeck` dont
elle se sert pour l'étape finale (score + suggestions), exactement comme
`superOptimizeDeck` le fait déjà.

**Détection de commandant — logique inexistante avant cette
fonctionnalité.** Le reste du site n'avait jamais eu besoin de savoir si
UNE carte donnée peut être commandant (le commandant est toujours fourni
par la source : précon, import Arena, CSV de deck). Règle retenue :
créature légendaire (`type_line` contient "Legendary" et "Creature"), ou
toute carte dont le texte oracle contient "can be your commander"
(planeswalkers commandants). Les "Background" sont explicitement exclus :
un Background ne peut être commandant QUE comme partenaire d'une créature
"Choose a Background", jamais seul — et cette v1 ne gère qu'un commandant
unique (pas de partenaires/Background), limitation assumée pour rester
dans un périmètre raisonnable, à réévaluer si Ben le demande.

**Sélection du deck (`selectDeckFromPool`).** Le pool possédé est filtré à
l'identité couleur du commandant et à la légalité du format choisi, puis
scindé terrains / non-terrains, chaque groupe trié par un score de
priorité — somme, pour chaque carte, de `poids/cible` de chaque pilier
qu'elle remplit (`classifyCard`, même formule que l'`impact` d'une
suggestion dans `recommend.ts`), avec un petit bonus de départage repris
de `buildRemovalCandidates` (`game_changer`/`edhrec_rank`, à échelle
volontairement réduite : le rôle rempli doit rester le critère dominant).
Terrains retenus jusqu'à `idealLandRatio × deckSize` (~37 sur 99), le
reste des places jusqu'à `deckSize` va aux non-terrains classés — puis
tout écart restant (collection insuffisante, dans un sens ou dans l'autre)
est comblé par des terrains de base, couleurs cyclées dans l'identité du
commandant (`Wastes` si incolore) : garantit un deck toujours à
exactement `deckSize` cartes, donc immédiatement jouable, quelle que soit
la taille réelle de la collection importée. Le maximum de copies du
format (1 en Commander/Duel Commander, singleton) est respecté partout
sauf pour les terrains de base.

**Formats de collection acceptés.** Texte libre : une carte par ligne,
"4 Sol Ring" / "Sol Ring x4" / "Sol Ring" seule (1 exemplaire implicite),
suffixe édition entre parenthèses/crochets ignoré (beaucoup d'exports
d'outils tiers en ajoutent). CSV : colonnes "Nom"/"Nombre" (mêmes intitulés
reconnus que l'import CSV de deck existant, réutilise son parseur RFC4180
`parseCsvRows`, maintenant exporté), colonnes inconnues ignorées
silencieusement (foil/édition/prix...). Les noms non résolus par Scryfall
(faute de frappe probable) sont listés à Ben dans l'UI plutôt que
silencieusement ignorés — cohérent avec la convention d'honnêteté
épistémique du projet : une carte qu'il pense avoir mise dans sa liste et
qui manque à l'appel doit être visible, pas juste absente sans explication.

**UI.** `CollectionImportForm.tsx` (nouveau composant, page `/collection`)
suit le même schéma que `CsvImportForm.tsx`/`ArenaImportForm.tsx` :
formulaire jusqu'à un résultat `ok`, puis bascule vers le `DeckBuilder`
existant en pleine largeur — aucune UI de deck dupliquée. Un sélecteur de
commandant additionnel apparaît uniquement s'il y a plus d'un candidat
détecté, affichant le score d'essai de chacun ; le changer appelle une
nouvelle Server Action dédiée (`switchCollectionCommander`) qui reconstruit
le deck pour le candidat choisi à partir de la même collection (pas besoin
de recoller le texte/re-uploader le CSV). Piège rencontré en écrivant ce
composant : `useEffect(() => setState(...), [dep])` pour recopier le
résultat d'un `useActionState` dans un état local déclenche la règle
`react-hooks/set-state-in-effect` (rendus en cascade) — corrigé en posant
l'état directement dans le `onSubmit` du `<form>` (qui s'exécute avant
l'action, pas dans un effet) plutôt que de le dériver après coup.

**Vérification.** Niveau 1 (logique pure, `tsx`, fetch mocké) :
`parseCollectionText`/`parseCollectionCsv` (comptages, virgule dans un nom
guillemetée, commentaires/lignes vides ignorés), `buildDeckFromCollection`
de bout en bout sur un pool volontairement minuscule (commandant détecté
correctement, carte hors-couleur exclue, faute de frappe listée dans
`unresolvedNames`, deck complété à exactement 99 cartes via des terrains
de base), et `switchCollectionCommander` vers un nom inexistant qui
retombe proprement sur le meilleur candidat. Niveau 2 (Playwright sur
build de production, Scryfall mocké, deux commandants candidats dans le
pool simulé) : page `/collection` et son lien de nav, import texte,
détection des 2 candidats avec leurs scores d'essai, bascule vers l'autre
candidat (reconstruit bien le deck — titre/score/liste de cartes changent
en conséquence), aucune erreur console — captures d'écran relues. Comme
pour tout ce qui touche Scryfall dans ce projet, aucune de ces
vérifications n'a pu se faire contre une vraie réponse Scryfall depuis cet
environnement (voir section réseau ci-dessous) ; le site déployé, lui, a
un accès réseau normal.

### Robustification de la construction Commander/Duel + tier de puissance (24/09/2026)

Demande de Ben : "améliore et rends plus robuste l'algo de construction de
deck commander multi et duel, fais en sorte qu'il soit le plus puissant et
pertinent possible ; si tu rencontres des blocages tu trouveras un moyen
de les contourner ; ajoute aussi une indication de tier du deck". Précision
apportée en cours de route : 5 tiers (1 à 5), pas 4 — voir plus bas pourquoi
ça correspond en fait mieux à la source officielle utilisée.

**A. Sélection du pool, de statique à itérative.** La v1 du 10/09/2026
(voir section ci-dessus) triait tout le pool possédé **une seule fois**
par score de priorité et prenait les N meilleures cartes dans l'ordre — un
défaut connu de ce genre de tri statique : plusieurs cartes d'un même
pilier déjà bien couvert (beaucoup de removal fort, par exemple) peuvent
occuper toutes les places disponibles pendant qu'un pilier resté à zéro
(protection, disons) ne récupère jamais rien, faute d'avoir jamais été
reconsidéré une fois les meilleures cartes globales déjà choisies.
`selectDeckFromPool` (`collection-builder.ts`) sélectionne désormais
**carte par carte, en reconsidérant à chaque étape quel pilier est
actuellement le plus sous sa cible** — même principe que `weakestFirst`
dans `suggestImprovements` (`recommend.ts`), généralisé ici à la
construction complète du deck plutôt qu'à un lot de suggestions
ponctuelles. `classifyCard` est précalculé une fois par carte
(`classifyCache`) plutôt que recalculé à chaque itération, pour rester
robuste sur une grosse collection. Terrains et non-terrains passent par le
même mécanisme (`pickBestCards`), la passe terrains transmettant son
décompte de piliers final comme point de départ de la passe non-terrains
(un terrain de fixing compté en premier réduit d'autant le déficit
"fixing" vu ensuite par les non-terrains). Un départage déterministe par
nom évite toute dépendance à l'ordre d'itération du moteur JS en cas
d'égalité stricte de score.

**Bootstrap d'archétype en deux passes.** `detectArchetypes`
(`archetype.ts`) exige déjà un minimum de cartes hors terrain pour
retourner un signal — impossible donc de connaître l'archétype d'un deck
avant d'avoir choisi ne serait-ce qu'une première sélection de cartes.
`selectDeckFromPool` construit donc une sélection "seed" sans aucun bonus
d'archétype (passe 1), détecte les signaux dessus, puis **refait
entièrement** la sélection depuis zéro avec un bonus modeste (+0.5, à
l'échelle d'un seul pilier proche de sa cible, jamais dominant) pour toute
carte du pool qui correspond à un signal détecté (`cardMatchesArchetype`,
réutilisée telle quelle) — pas un ajustement incrémental de la seed, pour
que les cartes écartées en passe 1 aient elles aussi une chance d'être
repêchées en passe 2 si elles collent au thème. Aucun signal détecté sur
la seed → la seed est renvoyée telle quelle, pas de recalcul inutile.

**Réglages secondaires de `priorityScore` :** bonus de qualité
(`game_changer`/`edhrec_rank`) légèrement augmenté par rapport à la v1
pour mieux refléter la puissance individuelle d'une carte, et ajout d'un
terme de courbe de mana modeste (amplitude max 0.3, contre ~1.4-2 pour un
seul pilier rempli) qui ne fait que départager entre cartes de priorité
sinon égale — le rôle rempli dans le deck reste partout le critère
dominant. **Aucune réinvention de moteur de score** (convention du projet,
section 11 ci-dessous) : tout repose sur `classifyCard`/`computeDeckStats`/
`format.categories`/`archetype.ts` déjà existants ; la seule nouveauté est
l'ORDRE de sélection et ces quelques constantes de réglage, documentées
dans le code.

**B. Tier de puissance (`src/lib/deck-tier.ts`, nouveau module).** Axe
volontairement DISTINCT du score structurel 0-100 existant (qui mesure la
couverture des 9 piliers par rapport à la propre cible du deck, pas sa
puissance absolue). Plutôt que d'inventer une échelle arbitraire, ce
module s'appuie sur le système officiel **Commander Brackets** de Wizards
of the Coast (recherché le 24/09/2026 via magic.wizards.com/en/formats/
commander et commanderbrackets.com/faq — système explicitement encore en
"beta" à cette date, donc susceptible d'évoluer, à revérifier si ce module
est retouché) : 5 paliers officiels (1 Exhibition, 2 Core, 3 Upgraded,
4 Optimized, 5 cEDH), ce qui correspond exactement aux 5 tiers demandés
par Ben. Le discriminant quantifiable principal de WotC — le nombre de
"Game Changers" (leur liste officielle de cartes jugées à part) — est déjà
un champ Scryfall présent dans l'app (`ScryfallCard.game_changer`,
utilisé ailleurs par `recommend.ts`), donc le signal dominant du calcul
(poids 40/100) n'est pas une donnée inventée.

**Signaux extraits** (tous dérivés de champs Scryfall déjà exploités
ailleurs, ou de sorties déjà calculées par le moteur existant — aucun
appel réseau supplémentaire) : nombre de Game Changers (mainboard +
commandant(s)), "mana rapide" (cartes classées "ramp" à coût ≤2, proxy
pour Sol Ring/Mana Crypt/Arcane Signet et équivalents), nombre de tutors
(repris de `stats.categoryCounts.tutor`), nombre de cartes donnant un tour
supplémentaire (nouveau motif dédié `takes? an extra turn`, volontairement
PAS ajouté aux 9 piliers stables de `deck-score.ts` — ce n'est pas un rôle
de deckbuilding au même sens), nombre de cartes de destruction de terrains
DE MASSE (motifs délibérément étroits — "destroy all lands",
"each/all player(s) sacrifice(s)... land(s)" — pour ne jamais confondre
avec du removal de terrain ciblé et situationnel comme Wasteland, un outil
normal à tous les niveaux de puissance), courbe moyenne, et ratio
d'interaction (removal+disruption rapporté à leur cible du format).

**Formule (0-100, somme de poids) :** Game Changers 40 pts (0 si aucun,
jusqu'à 40 à partir de 6), mana rapide 15 pts (3 pts/carte, plafond à 5
cartes), tutors 10 pts (proportionnel à la cible du format — donc plus
exigeant en Duel Commander, dont la cible de tutors est déjà plus haute
qu'en Commander multijoueur, cohérence avec le réglage existant de
`formats.ts`), interaction 10 pts, tours supplémentaires 10 pts (faible
pour 1-2 occurrences — "a Time Warp or two is fine" selon WotC — plafond
dès 3, l'enchaînement étant le vrai discriminant des paliers hauts),
destruction de terrains de masse 10 pts (binaire, quasi absente en dessous
du palier 4 selon WotC), courbe de mana 5 pts (petit bonus pour une courbe
à ou sous l'idéal du format, jamais dominant). Le résultat est ensuite
découpé en 5 paliers égaux de 20 points, chacun en 3 sous-bandes
low/mid/top — simplicité et transparence plutôt qu'un calage précis sur
des seuils WotC que la source elle-même présente comme non mécaniques.

**Limitation assumée et affichée à l'écran (pas seulement documentée
ici).** WotC le dit elle-même à propos de son propre système : le tableau
de cartes est un plancher, pas toute la réponse — l'intention du deck
compte le plus. Cette heuristique reste un pur proxy textuel/structurel :
elle ne peut PAS détecter de façon fiable une vraie ligne de combo à deux
cartes, une pièce de stax/verrou, ou un enchaînement de destruction de
terrains — seulement des motifs de surface. Un deck combo rapide mais avec
peu de Game Changers "visibles" peut être sous-évalué ; un deck avec
plusieurs Game Changers mais mal exécuté peut être surévalué. Ce caveat
est renvoyé tel quel par `computeDeckTier` (champ `caveat`) et affiché sous
le badge de tier dans `DeckDashboard.tsx`, pas seulement en commentaire de
code — cohérent avec la convention d'honnêteté épistémique du projet et
avec les préférences de Ben sur la transparence des heuristiques.

**Intégration.** `DeckAnalysisResult.tier` (nouveau champ, `actions.ts`) :
calculé dans `analyzeDeck` uniquement quand `format.hasCommander` (le
système de Game Changers/brackets est une notion Commander, sans sens pour
Standard/Historic/etc.), `null` sinon. Comme le reste de `analyzeDeck`,
tous les chemins qui en dérivent (import CSV/Arena, Super Opti, deck
depuis collection) héritent du champ automatiquement puisqu'ils étalent
(`...`) le résultat d'`analyzeDeck` plutôt que d'en reconstruire un
séparément. `DeckDashboard.tsx` affiche le badge juste à côté du score
(dégradé de couleur croissant du tier 1 neutre au tier 5 violet, seules
teintes déjà définies dans `globals.css`, aucune nouvelle variable CSS),
avec le détail des signaux et le caveat complet au survol, et un résumé
d'une ligne toujours visible en dessous (pas caché uniquement dans un
tooltip, pour rester visible sur mobile/tactile).

**Blocage rencontré et contournement.** Même contrainte que pour toute
autre fonctionnalité de ce projet : `api.scryfall.com` reste bloqué depuis
ce bac à sable (`curl` → 403 au niveau du proxy). Comme d'habitude, aucune
tentative de contournement réseau (pas de proxy alternatif, pas de scraper
de repli) — seule la méthodologie de vérification en deux niveaux déjà
établie pour ce projet a été utilisée, voir juste en dessous.

**Vérification.** Niveau 1 (logique pure, `tsx`, aucun mock réseau
nécessaire : `selectDeckFromPool`/`computeDeckTier` ne font eux-mêmes
aucun appel Scryfall) : démonstration directe de la régression corrigée
(pilier "removal" totalement absent avec l'ancien tri statique, désormais
couvert même quand 3 cartes de rampe à score identique sont disponibles),
bootstrap d'archétype en deux passes vérifié à la fois positivement (≥6
cartes en synergie détectées sur la seed → une carte marginale en synergie
l'emporte sur une carte marginale neutre pour la dernière place) et
négativement (zéro carte en synergie → le départage alphabétique par
défaut s'applique, aucun faux positif), intégration de bout en bout avec
le vrai format Commander (99 cartes exactes, `maxCopies` respecté, les 9
piliers couverts, `rankCommanderCandidates` trie bien par score d'essai
décroissant), et `computeDeckTier` vérifié sur un cas vide (tier 1 bas),
un cas saturant chaque sous-score (tier 5 haut, avec un recalcul
indépendant de la formule pour écarter une erreur d'arithmétique) et un
cas intermédiaire. Niveau 2 (Playwright sur build de production, Scryfall
mocké, collection avec Game Changers/mana rapide/removal simulés) : le
badge de tier s'affiche avec le bon format ("Tier X — Low/Mid/Top"), son
tooltip détaille les signaux, la ligne de transparence sous le badge est
bien présente, et le badge reste cohérent après un changement de
commandant — aucune erreur console. Comme pour tout ce qui touche
Scryfall dans ce projet, aucune de ces vérifications n'a pu se faire
contre une vraie réponse Scryfall depuis cet environnement ; le site
déployé, lui, a un accès réseau normal.

### Cohérence score/tier, indicateur de chargement, commandants non possédés (24/09/2026)

Trois retours de Ben le même jour, après avoir testé la fonctionnalité de
tier de puissance ci-dessus en conditions réelles (deux captures d'écran
d'un deck Duel Commander avec le commandant Merieke Ri Berit : score
95.1/100 mais "Tier 2 — Top", indice de puissance 35.2/100).

**(A) "je ne comprends pas pourquoi le score est de 95.1/100 et seulement
tier 2 top. Vérifie la cohérence de la notation des decks."** Investigation
plutôt que correctif immédiat : relecture de `deck-score.ts`/`deck-tier.ts`
et reconstruction d'un scénario qui reproduit la FORME du signalement de
Ben (voir `verify-A-C-2026-09-24.mts`, scratchpad) — un deck Duel Commander
qui couvre à 100% ses 9 piliers (cibles de `DUEL_COMMANDER.targets`,
modestes par construction) et a une courbe/un nombre de terrains sains,
mais sans aucun signal de puissance objective (0 Game Changer, pas de mana
rapide, pas de tours supplémentaires, pas de MLD). Résultat : score 100/100,
Tier 2 — Top, indice de puissance 33.7/100 — à moins de 2 points de l'indice
réel de Ben (35.2/100) avec un fixture construit uniquement à partir de la
lecture du code, sans connaître son deck exact. **Verdict : ce n'est PAS un
bug.** Le score (`computeDeckStats`) et le tier (`computeDeckTier`) mesurent
deux choses différentes à partir des MÊMES données d'entrée
(`nonCommanderCards`/`commanderCards`/`currentStats`/`format.categories`,
identiques dans `analyzeDeck` — pas de désynchronisation possible) : le
score dit "ce deck remplit-il bien SES PROPRES rôles de deckbuilding, par
rapport à une cible modeste et atteignable ?", le tier dit "à quel niveau
de puissance objectif ce deck joue-t-il face à l'écosystème Commander dans
son ensemble, en particulier le nombre de cartes 'Game Changer' officielles
WotC (40% du poids) ?". Un deck petit budget/synergique bien construit peut
tout à fait remplir tous ses rôles (score élevé) sans contenir de bombes
reconnues (tier modeste) — les deux n'ont aucune raison de converger. Ce
n'était déjà pas caché (le badge de tier portait déjà la mention "un axe
distinct du score" en petit texte), mais visuellement trop collé au score
pour se lire comme tel au premier coup d'œil. Correctif UI dans
`DeckDashboard.tsx` : chaque nombre a maintenant un micro-libellé
("Score de complétude" / "Puissance (tier)") pour ne plus se lire comme une
seule mesure, et le texte sous les deux nombres énonce maintenant
explicitement, en premier, que les deux peuvent diverger sans contradiction
— avant le détail des signaux, personnalisé au deck affiché (nombre de
Game Changers, de mana rapide, de tutors, de tours supplémentaires).

**(B) "je veux aussi une notif visuel que les decks sont en train de
charger car lorsque je clique sur un deck suggéré dans le dropdown, le
temps de chargement laisse penser que le système freeze."** Confirmé en
lisant le code : le changement de commandant (`handleCommanderChange` dans
`CollectionImportForm.tsx`, `useTransition`) relance tout le pipeline
(`switchCollectionCommander` → nouvel appel Scryfall + reconstruction
complète du deck) mais n'affichait avant ce correctif QUE `disabled` +
`opacity-60` sur le `<select>` lui-même — aucun texte, aucune animation.
Correctif : nouveau composant `LoadingIndicator` (spinner SVG
`animate-spin` + texte, `role="status" aria-live="polite"`) affiché sous le
sélecteur pendant `switching` ("Recalcul du deck en cours…"), réutilisé tel
quel pour les deux nouvelles interactions asynchrones de (C) ci-dessous
plutôt qu'un style différent par cas.

**(C) "je veux aussi avoir une fonctionnalité de commanders recommandés
avec mes cartes même si je ne possède pas ces commanders dans mes
cartes."** Nouvelle section "Commandants que tu ne possèdes pas encore"
dans `CollectionImportForm.tsx`, ouverte à la demande (pas calculée à
chaque analyse — coût réseau/calcul non négligeable, voir plus bas) :

- `suggestUnownedCommanders` (actions.ts) : cherche les commandants légaux
  les plus populaires du format (`is:commander legal:<format>`, tri
  EDHREC, 1 page Scryfall = jusqu'à 175 cartes — pas l'exhaustivité de
  toutes les créatures légendaires jamais imprimées, pour rester rapide et
  pertinent), écarte ceux déjà possédés, puis les classe avec
  `rankCommanderCandidates` — **le même moteur, sans aucune modification**,
  qui classe déjà les commandants POSSÉDÉS dans `buildDeckFromCollection`.
  Aucune nouvelle mécanique de score n'a été nécessaire : `selectDeckFromPool`
  construit toujours le deck d'essai à partir du pool RÉELLEMENT possédé
  par Ben, jamais du commandant lui-même — un commandant hors de ses
  couleurs se retrouve donc naturellement avec un pool quasi vide et un
  score d'essai bas (vérifié dans `verify-A-C-2026-09-24.mts` : un
  commandant mono-vert candidat contre un pool possédé 100% rouge/noir
  obtient un score d'essai de 8/100 contre 49.6/100 pour un commandant
  on-color — l'auto-pénalisation fonctionne sans filtrage de couleur codé
  en dur).
- `buildDeckWithUnownedCommander` (actions.ts) : construit un deck
  d'APERÇU pour un commandant non possédé donné — "si j'avais ce
  commandant, voici le meilleur deck que je pourrais construire avec ce
  que je possède déjà" — en le résolvant directement auprès de Scryfall
  (il n'est par définition pas dans le pool possédé) puis en appelant
  `selectDeckFromPool` normalement.
- UI : bouton "Découvrir des commandants" → liste (nom, identité couleur,
  score d'essai) → "Prévisualiser ce deck" par candidat → bandeau "Aperçu
  avec {nom}" + bouton "Revenir à mon deck" qui restaure exactement l'état
  d'avant (y compris un commandant possédé choisi manuellement au
  préalable, via un instantané `beforePreview` capturé une seule fois par
  session d'aperçu).

`is:commander` est un opérateur de recherche Scryfall documenté
(scryfall.com/docs/syntax) mais non re-vérifié en direct (accès à
`api.scryfall.com` bloqué depuis cet environnement de dev, comme partout
ailleurs dans ce projet, voir la section Limites plus bas) —
`isCommanderEligible`/`isLegalInFormat` sont réappliqués en filet de
sécurité sur le résultat de recherche plutôt que de lui faire une confiance
aveugle. À confirmer une fois déployé si le résultat semblait incohérent.

**Vérification.** Niveau 1 (`verify-A-C-2026-09-24.mts`, logique pure) :
scénario (A) ci-dessus (score 100/100, Tier 2 — Top, indice 33.7/100 — à
moins de 2 points de l'observation réelle de Ben) et scénario (C)
(auto-pénalisation d'un commandant hors couleurs, 8/100 vs 49.6/100 pour un
commandant on-color). Niveau 2 (Playwright, build de production, Scryfall
mocké — `verify-mock-server.cjs` étendu avec un handler `/cards/search`
minimal et un délai artificiel de 400ms sur chaque appel mocké pour pouvoir
observer les indicateurs de chargement, sinon trop rapides en local pour
qu'un script les capture) : micro-libellés score/tier et paragraphe de
clarté affichés, indicateur "Recalcul du deck en cours…" visible pendant
un changement de commandant possédé, section "Découvrir des commandants"
fonctionnelle (indicateur de chargement, commandant non possédé on-color
proposé, commandants déjà possédés absents de la liste), aperçu d'un
commandant non possédé fonctionnel (indicateur "Construction…", titre du
deck mis à jour, bandeau d'aperçu) et retour au deck d'origine après
"Revenir à mon deck" — aucune erreur console sur l'ensemble du scénario.

### Priorité tier > score partout sur le site, exclusion des synergies singleton mortes (24/09/2026)

Deux retours de Ben le même jour (4e passage), après le tier de puissance
et le correctif de cohérence ci-dessus.

**(1) "l'objectif principal du builder n'est pas d'avoir le meilleure
score de complétude mais le meilleur score de tier. Le score de tier a la
priorité. Je veux que le builder créé des decks les plus puissants
possibles."** Demande confirmée "partout sur le site" (question posée à
Ben : uniquement "Deck depuis ma collection" ou tout le site — réponse :
tout le site). Deux primitives partagées, réutilisées par les trois
moteurs concernés plutôt que trois implémentations séparées :

- `cardPowerScore` (nouvelle fonction, `deck-tier.ts`) : score de
  puissance PAR CARTE — Game Changer (+6, dominant), mana rapide (+3),
  tour supplémentaire (+4), déni de terrain de masse (+4) — délibérément
  restreint aux signaux que `computeDeckTier` pèse fortement et qui ne
  sont PAS déjà des piliers (removal/tutor/disruption le sont déjà, pas
  besoin de les dupliquer ici). +6 pour un Game Changer dépasse
  volontairement `WEAKEST_CATEGORY_BONUS` (2.5, collection-builder.ts) :
  un Game Changer possédé l'emporte presque toujours sur une carte qui ne
  ferait que combler un pilier faible, sans rendre ce bonus inutile pour
  autant (départage entre cartes de puissance égale, garde un deck
  FONCTIONNEL — un tas de bombes sans removal/rampe n'est pas non plus
  "le deck le plus puissant possible" en pratique).
- `hasDeadSingletonSynergy` (nouvelle fonction, `deck-score.ts`) : voir
  point (2) ci-dessous — réutilisée ici aussi car une carte à synergie
  morte n'a évidemment pas sa place dans "le deck le plus puissant
  possible".

Trois moteurs branchés dessus :

- **`collection-builder.ts`** : `priorityScore` ajoute `cardPowerScore(card)`
  (remplace l'ancien bonus fixe de 0.5 pour `game_changer`) ; `selectDeckFromPool`
  exclut les cartes à synergie singleton morte du pool éligible ;
  `rankCommanderCandidates` trie désormais les commandants candidats par
  `trialTier.powerIndex` D'ABORD, `trialScore` en second (récupère aussi le
  tier complet du deck d'essai, pas seulement son score).
- **`recommend.ts`** : dans `suggestImprovements` (piliers génériques) et
  `suggestForArchetype` (synergie thématique), les résultats Scryfall sont
  réordonnés par `cardPowerScore` décroissant avant sélection (à budget de
  suggestions égal, les cartes puissantes sont retenues en priorité), et
  les cartes à synergie singleton morte sont exclues des deux boucles.
- **`actions.ts`, `superOptimizeDeck` ("Super Opti")** : le suivi du
  "meilleur état" (`bestWorking`) au fil des tours ne compare plus
  seulement `bestScore` mais passe par une nouvelle fonction `isBetterState`
  (tier `powerIndex` prioritaire, score en tie-break, uniquement pour les
  formats à commandant — hors Commander le tier n'existe pas, voir
  `computeDeckTier`) — appliquée aux trois points de comparaison de la
  boucle (chaque tour par pilier, après le dernier tour, après le passage
  terrains). Le filet de sécurité en fin de fonction (qui annule tout si
  le résultat final est "pire" que le départ) est lui aussi devenu
  tier-aware : comparer uniquement le score y aurait été un bug neuf —
  un état à tier plus haut mais score de complétude plus bas est
  EXACTEMENT le résultat voulu par Ben, pas une régression à annuler.
  `CollectionCommanderCandidate`/`UnownedCommanderSuggestion` (types)
  portent désormais `trialTier` en plus de `trialScore`, et
  `CollectionImportForm.tsx` affiche le tier en premier dans le sélecteur
  de commandant et la liste "commandants que tu ne possèdes pas encore"
  (afficher encore le score seul en tête aurait reproduit la confusion
  score-vs-tier déjà remontée par Ben plus haut).

**Non fait, à la demande si besoin :** pas de nouvelle fonctionnalité
"proposer une carte plus puissante pour upgrader un pilier déjà complet" —
ça demanderait de nouvelles requêtes de recherche et un mécanisme de
comparaison/swap contre l'existant, une extension de périmètre plus large
que ce qui était nécessaire pour répondre à la demande de Ben (priorité de
sélection/classement, pas une nouvelle source de suggestions).

**(2) "certaines suggestions ne correspondent pas au format commander. Par
exemple : Mishra avec 'À chaque fois que vous jouez un sort d'artefact,
vous pouvez chercher dans votre cimetière, votre main et/ou votre
bibliothèque une carte ayant le même nom que ce sort et la mettre en jeu.
[...]' Implique que l'on a plusieurs fois la même carte dans notre deck ce
qui est impossible en commander où il n'y a qu'un exemplaire de chaque
carte."** Correctif général (pas un cas spécial pour Mishra) :
`hasDeadSingletonSynergy` (`deck-score.ts`) détecte, par motif de texte
oracle, toute carte dont l'effet suppose de trouver/utiliser un AUTRE
exemplaire de la même carte (`"a card with the same name as..."`), avec
une exemption explicite pour les cartes qui lèvent elles-mêmes la règle
singleton pour leur propre nom (Relentless Rats et équivalents —
`"any number of cards named..."`) : ces dernières restent parfaitement
fonctionnelles en Commander. Appliquée uniquement quand `format.maxCopies
<= 1` (singleton) : en constructed 60 cartes, ce schéma est parfaitement
jouable et ne doit jamais être filtré. Branchée aux trois points où une
carte peut être proposée ou ajoutée à Ben : exclusion dans
`selectDeckFromPool` (collection-builder.ts), exclusion dans les deux
boucles de suggestion de `recommend.ts`, et mise en garde ajoutée (sans
changer le verdict — la carte peut avoir un autre effet valable en plus
de cette clause morte) dans `evaluateCardCompatibility` pour la recherche
manuelle ("Tester une carte").

**Vérification.** Niveau 1 (logique pure, mocked fetch — voir
`verify-tier-priority-2026-09-24.mts`, `verify-recommend-2026-09-24.mts`,
`verify-actions-2026-09-24.mts`, scratchpad) : magnitudes de
`cardPowerScore` ; `hasDeadSingletonSynergy` détecte un Mishra-like et
épargne un Relentless-Rats-like (exemption explicite) et une carte
normale ; `selectDeckFromPool` exclut un Mishra-like en Commander ;
scénario construit où un commandant a un meilleur score mais l'autre un
meilleur tier — confirmé que `rankCommanderCandidates` classe bien celui
au tier supérieur en premier ; `evaluateCardCompatibility` ajoute la mise
en garde en Commander (singleton) mais pas en Standard (maxCopies=4) ;
`suggestImprovements` ne suggère jamais un Mishra-like et préfère la carte
la plus puissante d'un pilier à budget de suggestions limité ;
`buildDeckFromCollection`/`suggestUnownedCommanders`/`superOptimizeDeck`
(actions.ts, import direct avec fetch mocké) s'exécutent de bout en bout
sans erreur et exposent bien `trialTier`/`tier`. Niveau 2 (Playwright,
build de production, Scryfall mocké) : le sélecteur de commandant et la
liste des commandants non possédés affichent bien le tier avant le score
dans chaque option/suggestion — aucune erreur console.

⚠️ Portée de la vérification de `superOptimizeDeck` : le test niveau 1
confirme que la fonction s'exécute correctement de bout en bout avec le
nouveau suivi tier/score (pas d'exception, champs attendus présents), mais
ne construit pas de scénario dédié qui force le cas de bascule exact
("tier plus haut mais score plus bas gagne") À L'INTÉRIEUR de Super Opti —
un tel montage à travers plusieurs tours de suggestions + swaps aurait
demandé un effort disproportionné par rapport au risque réel, la fonction
de comparaison (`isBetterState`) suivant exactement le même schéma que
`rankCommanderCandidates`, elle-même testée avec un scénario dédié qui
force cette divergence.

### Correctif de performance : blocage sur une grosse collection (24/09/2026)

Deux signalements de Ben le même jour, juste après le correctif
ci-dessus : **"le site est bloqué à cette étape avec 1000 cartes"** (à la
soumission d'une collection depuis `/collection`) puis **"idem, ça ne
génère pas les commandants suggérés"** (bouton "Découvrir des
commandants" resté bloqué sur "Recherche en cours…").

Même cause racine pour les deux : `rankCommanderCandidates`
(collection-builder.ts) appelle `selectDeckFromPool` une fois PAR
COMMANDANT CANDIDAT — jusqu'à ~175 pour "Découvrir des commandants"
(1 page Scryfall de commandants populaires), potentiellement plusieurs
centaines pour les commandants POSSÉDÉS d'une grosse collection (autant
de créatures légendaires que Ben en a accumulé). `selectDeckFromPool`
recalculait à chaque appel, depuis zéro, tout ce qui ne dépend PAS
réellement du commandant testé : légalité dans le format, exclusion des
synergies singleton mortes (`hasDeadSingletonSynergy`, ajoutée plus tôt
dans la même journée) et surtout `classifyCard`/`cardPowerScore`
(plusieurs dizaines de tests regex par carte chacune) — `cardPowerScore`
étant en plus appelée à CHAQUE itération de la boucle de sélection
gloutonne de `pickBestCards` (elle-même O(créneaux × cartes restantes)
par appel), pas juste une fois par carte. Un travail indépendant du
commandant candidat se retrouvait donc multiplié par le nombre de
candidats ET par la taille de la boucle de sélection, au lieu de rester
proportionnel à la taille de la collection. Mesuré en reproduisant le
scénario en pur calcul local (sans latence réseau, voir
`repro-1000-cards-2026-09-24.mts`, scratchpad) : **~7 secondes rien que
pour classer 100 candidats sur une collection de 1000 cartes** — largement
de quoi dépasser un timeout de fonction serverless en production (Vercel)
ou simplement donner l'impression que le site est figé, et ça empirait
avec chaque commandant candidat supplémentaire.

Correctif : deux nouveaux caches calculés UNE SEULE FOIS par
`rankCommanderCandidates` puis réutilisés pour tous les candidats plutôt
que reconstruits à chaque appel de `selectDeckFromPool`/`pickBestCards` :

- `prepareCandidatePool` (nouvelle fonction) : légalité + exclusion
  singleton morte + `classifyCard`, pour l'ensemble du pool, indépendant
  du commandant — `selectDeckFromPool` prend maintenant un paramètre
  optionnel `prepared` (ce résultat) ; s'il est omis (appel isolé depuis
  `switchCollectionCommander`/`buildDeckWithUnownedCommander`/le deck
  final de `buildDeckFromCollection`), il est calculé sur place comme
  avant — un coût correct pour UN appel, seule la multiplication par le
  nombre de candidats posait problème.
- `powerScoreCache` (dans le même objet `prepared`) : `cardPowerScore(card)`
  précalculé une fois par carte, passé en paramètre à `pickBestCards`/
  `priorityScore` au lieu d'être recalculé (et donc de rappeler
  `classifyCard` en interne, un pur doublon) à chaque carte évaluée dans
  la boucle de sélection gloutonne — la partie du correctif qui avait
  le plus d'impact, puisque cette boucle est bien plus fréquente qu'un
  simple appel par candidat.

Résultat mesuré (même script) : ~900 ms pour 100 candidats sur 1000
cartes (contre ~7200 ms avant), et un scénario de stress à 300 candidats
sur 2000 cartes reste sous les 5 secondes (voir
`repro-stress-2026-09-24.mts`, scratchpad) — une croissance désormais
linéaire avec la taille de la collection/du nombre de candidats plutôt
qu'explosive.

**Vérification.** Niveau 1 : chronométrage avant/après sur un pool
synthétique de taille comparable à celle signalée par Ben (pas de decklist
réelle disponible, même technique de reproduction "par la forme" que le
correctif précédent) ; l'intégralité de la suite de vérification niveau 1
de la journée (tier-priorité, exclusion singleton, actions.ts) rejouée
sans régression après ce refactor (mêmes assertions, mêmes résultats).
Niveau 2 (Playwright, build de production, Scryfall mocké) : le scénario
complet "commandants non possédés" (découverte + aperçu + retour) et les
libellés tier-first du sélecteur de commandant, tous deux déjà vérifiés
plus haut, rejoués après ce correctif sans régression.

⚠️ Portée : ce correctif traite la cause identifiée par LECTURE DU CODE et
confirmée par un scénario de reproduction construit à partir de la FORME
du signalement de Ben (pas sa collection réelle, non disponible) — comme
pour le correctif score/tier plus haut dans ce document. S'il reste un
blocage après ce correctif sur la vraie collection de Ben, ce serait un
signal que la cause est différente ou plus profonde qu'estimé ici (par
exemple : nombre de candidats commandant bien au-delà de ce qui a été
testé, ou un tout autre goulot d'étranglement) — à réinvestiguer plutôt
qu'à supposer résolu sans confirmation de Ben.

### Constructeur de decks compétitif (25/09/2026)

**Demande de Ben** : « j'importe une liste de cartes ; je sélectionne
commander multi ou commander duel (les decks duel doivent être plus
explosifs/court terme, les parties sont plus courtes) ; le système suggère
des decks avec les cartes de la liste et un commander — dans la liste ou en
dehors, il évalue le meilleur commander possible ; l'objectif est de créer
des decks les plus compétitifs possible (tier 4 est l'objectif, s'en
rapprocher est la priorité absolue) ; il évalue les synergies entre les
cartes et peut être le plus créatif possible ; un pool de cartes
recommandées en dehors de la liste rend le deck encore plus performant ;
ergonomique, intuitive, la plus performante possible. »

La page `/collection` (menu « Construire un deck ») est entièrement
refaite. L'ancien moteur (`selectDeckFromPool`/`rankCommanderCandidates`
dans `collection-builder.ts`) et l'ancien formulaire
(`CollectionImportForm.tsx`) ainsi que ses 6 Server Actions
(`buildDeckFromCollection`, `analyzeCollectionText/Csv`,
`switchCollectionCommander`, `suggestUnownedCommanders`,
`buildDeckWithUnownedCommander`) sont **retirés** : ils n'avaient plus
d'appelant, et garder deux moteurs concurrents aurait brouillé toute
évolution future. `collection-builder.ts` ne garde que ses utilitaires
(`isCommanderEligible`, `isLegalInFormat`, `BASIC_LAND_BY_COLOR`).

**Parcours** (`CompetitiveBuilder.tsx`) : (1) liste collée ou CSV, avec
« Reprendre ma dernière liste » (localStorage, simple confort) ; (2) format
Multi ou Duel, présentés avec ce qui change ; (3) nombre max de cartes hors
liste (0/5/10/15/25). Résultat : jusqu'à 8 decks classés par tier, chacun
avec son tier « avec mes cartes » et son tier « optimisé », une barre qui
matérialise le seuil du Tier 4 (indice 60), le coût estimé des
acquisitions ; le 1er deck s'ouvre automatiquement dans le simulateur
habituel (DeckBuilder : score, suggestions, swaps, Super Opti, export), les
cartes à acquérir marquées « Ajoutée ». Boutons « Relancer en Duel/Multi »
et sélecteur du nombre d'acquisitions directement sur la page de résultats.

**Moteur** (`competitive-builder.ts`, fonctions pures) :

- **Gain marginal EXACT de tier** : à chaque créneau, chaque carte est
  évaluée par la variation de l'indice de puissance qu'elle provoque,
  calculée avec la même formule que le badge (`tierComponentsFromCounts`,
  deck-tier.ts, factorisée pour ça). Plus d'approximation par carte
  (`cardPowerScore` reste utilisé par `recommend.ts`). Le 1er Game Changer
  vaut +10, les suivants +6 jusqu'au plafond, un tutor vaut plus tant que la
  cible n'est pas atteinte, etc. Un a priori de 10 cartes au coût idéal
  stabilise la composante « courbe » pendant la sélection (sans lui, la
  toute première carte à 1 mana valait +5) — le tier affiché, lui, est
  calculé sans a priori.
- **Synergie avec le commandant** (`synergy.ts`) : 16 thèmes (jetons,
  compteurs, sacrifice, sorts, artefacts, enchantements, cimetière,
  terrains, gain de vie, clignotement, combat, équipements/auras, pioche,
  défausse, trésors, poison) détectés dans le texte du commandant (ce qu'il
  récompense) et des cartes (ce qu'elles alimentent), plus la tribu
  (« other Goblins you control »). Précalculés une fois par carte en masque
  de bits : la synergie carte↔commandant est un ET binaire (indispensable
  pour évaluer des dizaines de commandants).
- **Combos** (`combos.ts` + `src/data/combos.ts`, ~35 combos connues à 2-3
  cartes) : bonus de sélection aux pièces d'une combo réalisable, et gain
  exact de la nouvelle composante « combo » du tier quand elle se complète.
- **Profils Multi / Duel** (`MODE_PROFILES`) : en Duel, pénalité plus forte
  au-dessus de 4 manas, bonus à l'interaction à ≤2 manas, bonus à la
  présence en tournoi. Dans les deux modes, jusqu'à 3 terrains cèdent leur
  place quand le deck contient beaucoup de mana rapide (1 pour 2 sources).
- **Terrains de base répartis selon les symboles de mana** des sorts
  choisis (plus un simple cycle de couleurs).
- **Pool d'acquisition** : des cartes non possédées peuvent entrer avec une
  pénalité de 1.5 (à valeur égale, une carte possédée passe devant),
  plafonnées au nombre choisi par Ben.

**Classement des commandants** (`rankProposals`) : candidats = commandants
de la liste + 2 pages de commandants populaires Scryfall
(`is:commander legal:<format>`) + une liste curatée haute puissance (Multi,
`src/data/competitive-staples.ts`) ou les commandants réellement joués en
tournoi (Duel, `duel-meta.json`). Présélection par affinité (somme des
meilleurs scores statiques des cartes possédées jouables avec lui), puis
30 commandants (dont au moins 8 possédés) construits en entier, deux fois
(avec mes cartes / optimisé). Tri : tier « avec mes cartes », puis tier
optimisé, puis score — convention tier d'abord du projet. Pour les 3
meilleurs, jusqu'à 3 recherches Scryfall de cartes en synergie avec le
commandant élargissent le pool optimisé (gardé seulement s'il fait au moins
aussi bien).

**Pool recommandé** : Game Changers (liste officielle au 09/02/2026,
`src/data/game-changers.ts`), staples par rôle (mana rapide, tutors,
interaction, pioche, conditions de victoire), pièces de combo, et en Duel
les cartes jouées dans ≥5% des decks de tournoi. Chaque carte est résolue
via Scryfall et filtrée par légalité réelle (une carte bannie n'est jamais
proposée) et identité couleur. Affiché avec la raison (« Game Changer »,
« Mana rapide », « Complète une combo », « Synergie : Jetons », « Jouée
dans 45% des decks de tournoi Duel »...), le gain d'indice au moment du
choix et le prix Scryfall en euros.

**Tier (deck-tier.ts), deux composantes nouvelles** — s'appliquent partout
sur le site : **combo** (+8 pour une combo connue complète, +12 pour deux ;
les combos infinies sont le marqueur des brackets hauts du système WotC) et,
**en Duel Commander uniquement**, **présence en tournoi** (1.5 point par
unité de présence cumulée, plafond 25 — calibré sur les données du repo :
les 11 decks de tournoi de `duelcommander-decks.json` cumulent 14 à 22.5,
deux exceptions à 4.2 et 8.1 ; les 190 précons 0.1 à 2.6, médiane 1.3).
Conséquence voulue : les decks de tournoi de `/duelcommander` montent en
tier, les précons ne bougent presque pas. Le tableau de bord mentionne les
combos détectées et la présence en tournoi.

**Données ajoutées** : `src/data/duel-meta.json` (généré par
`scripts/build-duel-meta.py` depuis
`analysis/duelcommander/duelcommander_cartes_incontournables.xlsx` — seules
les colonnes fiables sont reprises : nom de carte et fréquence ; les
couleurs/raretés estimées du classeur sont ignorées, Scryfall fait foi à
l'exécution), `game-changers.ts`, `competitive-staples.ts`, `combos.ts`.

**Autres changements** : `getCardsByNames(names, { fuzzyFallback: false })`
pour les listes curatées (un nom inconnu n'y est pas une faute de frappe,
inutile de le retenter en requête individuelle) ; `throttle()` de
scryfall.ts devient une vraie file d'attente (les requêtes parallèles du
constructeur partaient sinon par paires) ; `maxDuration = 60` sur la page
`/collection` (limite réelle dépendante du plan Vercel, non vérifiée) ; le
header du site passe à la ligne sur mobile (il débordait horizontalement à
390 px, sur toutes les pages).

**Vérification** (même méthodologie que HANDOFF §7, Scryfall inaccessible
depuis les environnements de dev) :

- Niveau 1 (`tsx`, cartes construites à la main avec des textes oracle
  écrits de mémoire — approximations) : 28 assertions OK — exclusion des
  cartes bannies (Mana Crypt, Sol Ring en Duel), identité couleur,
  singleton, 99 cartes exactes, Game Changers retenus, combo Oracle +
  Consultation assemblée et comptée (+8), pièce de combo manquante proposée
  en acquisition, plafond d'acquisitions, synergies détectées (tribu
  Gobelin de Krenko, sorts de Talrand, sacrifice de Korvold), combo Heliod +
  Walking Ballista, classement trié par tier, cohérence tier constructeur =
  tier recalculé.
- Comparaison avec l'ancien moteur (récupéré depuis git, mêmes cartes,
  même formule de tier pour les deux) : le nouveau fait au moins aussi bien
  sur les 12 couples commandant × format testés (ex. Heliod 42.4 → 50.9
  grâce à la combo, Meren 66.4 → 69.2), score de complétude égal ou
  supérieur partout. Échantillon synthétique : un indice encourageant, pas
  une preuve sur une vraie collection.
- Performance : 30 commandants × 2 decks sur 1 100 cartes ≈ 0,7 s de calcul
  pur (hors latence Scryfall : ~20 requêtes, compter 5-20 s en production).
- Niveau 2 (build de prod + Scryfall simulé + Playwright) : parcours
  complet OK (progression affichée, 7 decks proposés, carte mal
  orthographiée signalée, chemin vers le Tier 4, pool recommandé, ouverture
  automatique dans le simulateur, bascule « mes cartes / optimisé »,
  changement de deck, relance en Duel, aucun débordement à 390 px, aucune
  erreur console) ; pages existantes (précon, deck Duel, Arena, glossaire)
  toujours en 200.

**Non vérifié en conditions réelles** : les requêtes Scryfall
(`is:commander`, recherches de synergie, `/cards/collection` sur ~600 noms
curatés), le temps total en production et la limite `maxDuration` du plan
Vercel ; l'orthographe exacte de chaque nom des listes curatées (un nom
faux est simplement ignoré) ; la base de combos n'a pas pu être recoupée
avec Commander Spellbook (API inaccessible).

**Limites assumées** : un seul commandant (pas de partenaires/Background) ;
tier = heuristique (voir deck-tier.ts), la synergie est de surface (thèmes
partagés), une combo absente de la base est invisible ; en Duel,
l'échantillon de tournoi est court (4 jours, 82 decks) et favorise les
couleurs dominantes du moment ; les terrains de base sont supposés
disponibles en quantité illimitée.

### Constructeur compétitif, 2e passage : duos, Commander Spellbook, méta Duel, autocorrection (25/09/2026)

**Demande de Ben** : « gère les duos de partenaires, augmente l'échantillon
duel, augmente ta liste de combos, trouve des moyens de contourner
Scryfall et Commander Spellbook, inclus aussi des orthographes proches ou
autocorrect sur les noms ».

**Duos de commandants** (`partners.ts`) : Partner, Partner with <nom>
(uniquement avec la carte nommée), Partner—<groupe>, Friends forever,
Choose a Background (+ carte Background), Doctor's companion (+ Time Lord
Doctor). Le moteur (`competitive-builder.ts`) travaille désormais sur 1 ou
2 commandants : identité = union, profil de synergie fusionné
(`mergeProfiles`), 98 cartes au lieu de 99 en duo (`mainDeckSize`).
`generatePairs` forme les duos parmi les 25 meilleurs candidats « à
partenaire » + les Backgrounds (recherche `t:background`), évalue leur
affinité et en construit 10 en entier, classés avec les commandants seuls
(tier d'abord). Types renommés : `CommanderCandidate.cards[]`/`owned[]`,
`BuildContext.commanders[]`, `BuiltDeck.commanders[]`.

**Commander Spellbook en direct** (`spellbook.ts`) : l'API est inaccessible
depuis les environnements de dev mais pas depuis Vercel — le site
l'interroge côté serveur. Format lu dans le code source officiel
(github.com/SpaceCowMedia/commander-spellbook-backend : `find_my_combos.py`,
`estimate_bracket.py`, `common/serializers.py`, rendu camelCase) :
- `POST /find-my-combos` `{main:[{card,quantity}], commanders:[…]}` (600
  lignes max) → `results.included` / `results.almostIncluded` ;
- `POST /estimate-bracket` → `bracketTag` (R/S/P/O/C/E/B) + combos
  classées (`relevant`, `definitelyTwoCard`, `speed`).
Usage : (1) `analyzeDeck` (toutes les pages deck) appelle estimate-bracket
et recalcule le tier avec les combos confirmées (`tierWithSpellbook`,
deck-tier.ts — variantes dédoublonnées par ensemble de cartes, combos non
« pertinentes » affichées mais non comptées) + affiche le bracket CSB en
2e avis ; (2) le constructeur, pour ses 6 meilleures propositions, appelle
find-my-combos sur le pool (cartes possédées puis recommandées), vise les
combos disponibles (sans « modèle » générique), propose les pièces
manquantes des combos à une carte près, puis estime le bracket des deux
decks finaux. Cache mémoire 1 h, timeout 8 s, repli sur la base curatée
(passée de 36 à 64 combos) si l'API ne répond pas. On ne télécharge jamais
la base entière (demande explicite de Commander Spellbook).

**Échantillon Duel** : `scripts/fetch-duel-meta.mjs` (`npm run
fetch-duel-meta -- --weeks 12`), **à lancer sur le Mac de Ben** (mtgtop8 et
Scryfall inaccessibles depuis les environnements Claude). Structure
mtgtop8 vérifiée sur de vraies pages le 25/09/2026 (liste
`format?f=EDH&meta=115&cp=N`, decks `event?e=…&d=…`, export
`mtgo?d=…` avec les commandants sous « Sideboard »). Archive cumulative
`analysis/duelcommander/decks-mtgtop8.json`, puis `duel-meta.json` recalculé
avec une nouvelle part `cardsInColors` (part parmi les decks dont l'identité
permet de jouer la carte, identités lues sur Scryfall) utilisée pour
CHOISIR les cartes (`duelMetaPresenceInColors`) ; le tier reste calibré sur
la part globale. Non exécuté depuis l'environnement de dev (seul le parseur
d'export a été testé sur un vrai export) : le premier lancement par Ben
fait office de test réel. `--dry-run` parcourt 2 événements sans rien écrire.

**Autocorrection des noms** (`name-resolution.ts`) : exact → nettoyage des
décorations d'export (« (MH2) 123 », « *F* », « [Set] », « A/B » → « A // B »,
apostrophes typographiques) → recherche approchée Scryfall → nom français →
autocomplétion + distance d'édition (≤ 30% de la longueur). Étapes lentes
plafonnées à 60 requêtes. Chaque correction est listée à Ben (« vérifie que
c'est bien la bonne carte »), jamais silencieuse.

**Contournement tenté et abandonné** : récupérer en masse des données
(Commander Spellbook, mtgtop8) via le navigateur intégré de l'app sur le Mac
de Ben a été bloqué par un garde-fou de sécurité (extraction de données
vers l'environnement Claude en contournant ses restrictions réseau). Les
solutions retenues passent par le site déployé (Commander Spellbook en
direct) ou par un script que Ben lance lui-même (méta Duel).

**Vérification** : niveau 1 — 41 assertions OK (dont duos valides/invalides,
98 cartes en duo, combos externes à 3 cartes assemblées, dédoublonnage des
variantes, combos mineures non comptées, nettoyage des noms) ; niveau 2 —
build de prod + Scryfall ET Commander Spellbook simulés + Playwright :
corrections affichées (« Sol Rinng » → Sol Ring), nom introuvable signalé,
duo Thrasios + Tymna proposé et ouvert dans le simulateur (« Commandants »,
« Deck (98 cartes) »), 2e avis Spellbook, combos à une carte près, pas de
débordement à 390 px, aucune erreur console. **Non vérifié en réel** : les
réponses exactes de Commander Spellbook (format déduit du code source), le
temps total avec ~18 appels Spellbook supplémentaires, le script mtgtop8.

### Base de construction Duel : mise à jour hebdomadaire, decks de référence, synergies apprises (25/09/2026)

**Demande de Ben** : faire de l'archive mtgtop8 une vraie base de
construction — (1) mise à jour automatique, (2) decks de référence par
commandant, (3) synergies apprises.

**Collecte corrigée** (`scripts/fetch-duel-meta.mjs`) : 1er vrai lancement
par Ben le 25/09/2026 → 344 decks archivés, mais 54 dataient de 2013-2018 (la
page de liste mtgtop8 affiche aussi d'anciens événements en colonne annexe)
et leurs dates arrêtaient la pagination trop tôt (septembre seulement). Le
script lit désormais la date sur la page de CHAQUE événement, ignore ceux
hors fenêtre, et s'arrête quand une page ne contient plus aucun événement
récent. `--rebuild-only` recalcule les fichiers depuis l'archive sans rien
télécharger.

**(1) Mise à jour hebdomadaire** : `zsh scripts/install-weekly-duel-meta.sh`
installe un LaunchAgent macOS (lundi 8h17, `--weeks 4`, notification à la
fin, journal `~/Library/Logs/mtg-opti-duel-meta.log`), `--uninstall` pour le
retirer, `--run-now` pour tester. Ne commite rien : Ben relit et commite.
Testé dans l'environnement de dev avec un `launchctl` simulé (le plist
généré est valide, la commande décodée est correcte) — pas sur un vrai macOS.

**(2) Decks de référence par commandant** : `src/data/duel-commander-reference.json`
(généré par le script : pour chaque commandant ou duo joué dans ≥ 2 decks,
part de chaque carte dans SES decks, cartes ≥ 25%, 3 decks d'exemple).
`duel-reference.ts` le lit (recherche tolérante : duo dans n'importe quel
ordre, recto-verso par face ou nom complet). En Duel, le constructeur
ajoute `part × 6` au score d'une carte (une carte jouée par 100% des decks de
tournoi de ce commandant vaut l'équivalent d'un Game Changer suivant), les
cartes du « cœur » (≥ 50%) entrent dans le pool recommandé, et l'UI affiche
« Comparé aux decks de tournoi de ce commandant » : couverture du cœur,
cartes manquantes (possédées ou à acquérir), liens vers 3 decks.

**(3) Synergies apprises** : `src/data/duel-cooccurrence.json`. Premier
essai compté par deck : sur les vrais decks, il faisait surtout ressortir
« le deck de Cloud » (20 listes quasi identiques gonflent toutes leurs
paires) — de l'archétype, déjà couvert par (2). Version retenue : une voix
par COMMANDANT (carte comptée si dans ≥ 50% de ses decks), terrains exclus,
lift ≥ 2 parmi les commandants aux couleurs compatibles, ensemble chez ≥ 4
commandants, confiance ≥ 70%, chaque carte chez ≥ 5 commandants. Sur une
archive synthétique de 700 decks avec une synergie plantée : synergie
retrouvée, 0 faux positif (contre 754 avec le lift seul). Dans le
constructeur : bonus pour chaque partenaire déjà choisi (lift plafonné à 6,
poids 1 en Duel, 0.5 en multi), raison « Souvent jouée avec X en tournoi ».

**Fichiers livrés provisoires** : les deux index ont été générés dans
l'environnement de dev depuis l'archive réelle de Ben mais SANS Scryfall
(noms mtgtop8 bruts, identités couleur inconnues, donc terrains non filtrés
par type) — à régénérer sur le Mac avec `node scripts/fetch-duel-meta.mjs
--rebuild-only` (noms canoniques + couleurs).

**Vérification** : niveau 1 — 48 assertions OK (dont référence de Cloud
trouvée, duo trouvé quel que soit l'ordre, recto-verso par nom complet,
cœur retenu face à du removal générique en Duel, raison affichée, synergie
apprise appliquée, pas de bonus de référence en multi) ; calcul des index :
160 ms sur les 290 decks réels ; niveau 2 — section « Comparé aux decks de
tournoi » affichée pour Cloud (22 decks, cœur de 70 cartes, liens), aucune
erreur, pas de débordement mobile.

## Stack

Next.js 16 (App Router, TypeScript, Turbopack) + Tailwind CSS v4. Pas de
base de données : les decklists préconstruites sont un snapshot JSON
généré localement (voir ci-dessous), et les données de cartes (texte,
coût de mana, image, légalités) sont résolues à la demande auprès de
l'API Scryfall, avec cache HTTP 24h.

## ⚠️ Limites connues sur les sources de données (à lire avant de continuer le dev)

**Suggestions de cartes — pas d'EDHREC.** EDHREC ne publie pas d'API
publique officielle pour ses données de synergie/popularité par
commandant. Les seuls accès trouvés en ligne sont des scrapers
communautaires non officiels (Apify, dépôts GitHub divers), dont la
conformité aux CGU d'EDHREC n'est pas claire. Plutôt que de bâtir le
produit sur une dépendance fragile et potentiellement non autorisée, la
v1 utilise **un moteur heuristique interne** (`src/lib/deck-score.ts` et
`src/lib/recommend.ts`) : classification des cartes par mots-clés dans le
texte oracle (rampe / removal / board wipe / pioche / tutor / protection
/ fixing / finisher / disruption), comparaison à des cibles indicatives par format (voir
`src/lib/formats.ts`), et recherche de candidats via l'API Scryfall
(syntaxe de recherche, pas de service de recommandation). Les cibles pour
les formats Arena constructed (Standard/Historic/Explorer/Alchemy/Timeless)
sont encore plus approximatives que celles de Commander : moins de recul,
pas de validation en usage réel.

C'est une approximation qui peut se tromper (faux positifs/négatifs sur
la détection par mots-clés), pas une vérité de synergie EDHREC. Si tu
veux une vraie intégration EDHREC, il faudra soit leur demander un accès
officiel, soit valider explicitement l'usage d'un scraper non officiel en
connaissance de cause — je ne l'ai pas fait par défaut.

**"Rôle non identifié" (verdict "unclear") — pas forcément un bug.** Les
motifs de `CATEGORY_PATTERNS` (`src/lib/deck-score.ts`) couvrent 9
piliers : les 7 piliers classiques du deckbuilding Commander (rampe /
removal / board wipe / pioche / tutor / protection / fixing),
volontairement élargis pour couvrir des formulations courantes équivalentes (ex : `surveil`/`scry`
comptent comme "pioche" — sélection de cartes ; `ward`/`shroud` comptent
comme "protection" ; les effets de fight et le bounce de permanent
comptent comme "removal"). En complément des regex sur texte oracle, la
classification utilise aussi deux champs structurés déjà renvoyés par
Scryfall mais non exploités jusqu'ici (aucun appel réseau
supplémentaire) : `card.keywords` (liste officielle de mots-clés —
Hexproof, Ward, Indestructible, ... — insensible aux formulations
variables comme "Ward {2}" vs "Ward — Discard a card") pour "protection",
et `card.produced_mana` (couleurs de mana qu'une carte peut produire) pour
"fixing", **quel que soit le type de permanent** — un bug a été corrigé le
26/08/2026 : la catégorie "fixing" ne vérifiait auparavant QUE les
terrains, donc un rocher de mana bicolore/multicolore (Arcane Signet,
signets de guilde, ...) n'était jamais reconnu comme fixing, même quand
son texte matchait déjà les motifs existants.

Malgré ça, une carte qui ne rentre dans aucun de ces 9 piliers (ex : une
terre qui fabrique des jetons, une carte qui copie des sorts sans piocher
ni retirer de menace) reçoit honnêtement "rôle non identifié" plutôt
qu'un rôle forcé et faux — élargir encore les motifs au point de capter
ce genre de carte ferait perdre en précision aux piliers existants
(l'objectif premier de ce moteur), donc ce n'est pas fait par défaut.

**Le 8e pilier "finisher" (ajouté le 26/08/2026, à la demande de Ben).**
Les 7 piliers historiques mesurent le "moteur" d'un deck (mana,
interaction, avantage de cartes), pas ce qui termine la partie — une
grosse bombe qui ne fait "qu'" attaquer fort ou générer de la valeur
pouvait donc rester "rôle non identifié" alors qu'elle est objectivement
excellente. "Finisher" comble cet axe, volontairement limité à des
signaux textuels précis plutôt qu'à la force/endurance brute d'une
créature (sinon n'importe quelle grosse créature vanille deviendrait un
"finisher", ce qui viderait la catégorie de son sens) : victoire
alternative ("you win the game"), défaite forcée d'un adversaire, combats
supplémentaires, dégâts doublés, évasion difficile à bloquer (`can't be
blocked`, mot-clé Menace via `card.keywords`).

Conséquence assumée, vérifiée sur les deux exemples donnés par Ben avant
l'ajout de la catégorie : le texte oracle réel de Sephiroth, Fallen Hero
(vérifié sur Scryfall) ne matche toujours pas "finisher" — son ability
est un moteur de buff/récursion (+1/+0 et gain de mots-clés, mise en jeu
depuis le cimetière), pas un des signaux ci-dessus, donc "rôle non
identifié" reste le verdict correct pour cette carte précise, pas un bug
restant. À l'inverse, le texte oracle réel de The Incredible Hulk (face
arrière, capacité Enrage "there is an additional combat phase after this
phase", vérifié sur Scryfall) matche désormais "finisher" via le motif
"combat supplémentaire" — une vraie amélioration de couverture.

Si une carte précise te semble mal classée dans un de ces 9 piliers (pas
"c'est une bombe et ça devrait être reconnue comme telle" en général), le
plus fiable est de vérifier son texte oracle exact sur Scryfall et de me
le signaler : j'ajoute le motif correspondant seulement si c'est un cas
générique et sans ambiguïté, pas un cas isolé.

**Bug corrigé le 26/08/2026 : les qualificatifs entre "target"/"all" et
le nom cassaient le removal/wipe.** Exemple concret que tu as remonté :
HULK SMASH! ("Destroy target noncreature artifact." / "Target creature
you control deals damage equal to its power to target creature an
opponent controls.") ressortait "rôle non identifié" alors que ses deux
modes sont clairement du removal. Cause réelle, vérifiée sur le texte
oracle exact de la carte (pas une supposition) : les motifs `removal`/
`wipe` exigeaient que "target"/"all" soit **immédiatement** suivi du nom
(`creature`, `permanent`, `artifact`...), donc toute formulation avec un
qualificatif entre les deux — "target **noncreature** artifact", "target
**attacking or blocking** creature", "all **nontoken** creatures" — ne
matchait jamais, quel que soit l'effet réel. C'est une formulation très
courante dans le texte oracle Magic, donc ce n'était pas un cas isolé à
Hulk Smash. Corrigé en tolérant 0 à 3 mots de qualificatif entre les deux
(borné par la ponctuation, donc ça ne "traverse" pas les phrases — pas de
risque de faux positif sur un texte sans rapport). J'ai aussi ajouté un
motif dédié pour le 2e mode de Hulk Smash ("deals damage equal to its
power to target creature") : un removal formulé explicitement comme un
combat à sens unique, sans passer par le mot-clé `fight`. Testé avant/
après sur Hulk Smash! (désormais "removal") et sur plusieurs cartes de
removal/wipe connues (Swords to Plowshares, Wrath of God) pour vérifier
qu'elles restent correctement classées.

**Refonte du 26/08/2026 suite à ton retour "beaucoup de cartes n'ont rien
d'identifié, il faut que cet outil apporte de la valeur ajoutée pour
toutes les cartes".** Pas un patch isolé sur Mana Maze : un audit complet
des motifs `CATEGORY_PATTERNS` a montré que le bug de qualificatif trouvé
sur Hulk Smash (voir ci-dessus) touchait aussi deux autres piliers, en
plus de l'ajout d'un 9e pilier. Chaque cas ci-dessous a été vérifié sur le
texte oracle réel d'une carte connue (pas une supposition) avant d'écrire
le motif correspondant :

- **Tutor.** L'ancien motif pour les tutors "restreints" (qui cherchent un
  type de carte précis, pas n'importe laquelle) exigeait littéralement
  "and put it into your hand" — or une grande partie des tutors les plus
  emblématiques de Commander posent la carte trouvée **sur le dessus de la
  bibliothèque**, pas dans la main : Vampiric Tutor, Mystical Tutor,
  Worldly Tutor, Enlightened Tutor... Vérifié sur Enlightened Tutor
  ("Search your library for an artifact or enchantment card, reveal it,
  then shuffle and put that card on top of your library.") : ne matchait
  ni pattern (pas de "into your hand", et en plus l'ancien motif exigeait
  l'article "a" alors que le texte a "an"). Corrigé : la destination
  n'est plus vérifiée, seule la restriction de type compte — en excluant
  explicitement les recherches de terrain (déjà comptées comme "rampe",
  pas comme tutor).
- **Rampe.** Le motif de recherche de terrain n'acceptait que le mot
  littéral "land" — "search your library for a **Forest** card" (Wood
  Elves, vérifié) ne contient pas ce mot et ne matchait donc jamais,
  malgré un effet de rampe évident. Corrigé : le motif reconnaît aussi les
  noms de terrains de base (Forest, Island, Swamp, Mountain, Plains,
  Wastes) en plus de "land".
- **Protection.** "Counter target spell" ne matchait pas "counter target
  **noncreature** spell" (Negate, vérifié) ni "counter target
  **creature** spell" (Essence Scatter) — alors que restreindre un
  contresort à un type de sort est un des templates les plus courants du
  jeu. Corrigé avec la même tolérance de qualificatif que removal/wipe.

**9e pilier "disruption" (ajouté le 26/08/2026).** Les 8 piliers
précédents ne couvrent ni les verrous/taxes ("les joueurs ne peuvent pas
lancer de sorts", "coûte {1} de plus à lancer", "les permanents ne
dégèlent pas"), ni les sacrifices forcés (edicts), ni la défausse forcée
— tout un pan classique du deckbuilding Commander (stax, contrôle de
ressources) qui n'est ni du removal ciblé, ni un board wipe, ni de la
protection. C'est exactement le cas de Mana Maze que tu as remonté
("Players can't cast spells that share a color with the spell most
recently cast this turn.") : un verrou symétrique, hors du périmètre des
8 piliers existants. Motifs vérifiés sur le texte oracle réel de cartes
connues avant d'écrire les regex : Mana Maze et Rule of Law ("Each player
can't cast more than one spell each turn.") pour "can't cast ... spell(s)"
; Thalia, Guardian of Thraben ("Noncreature spells cost {1} more to
cast.") pour la taxe ; Static Orb ("players can't untap more than two
permanents during their untap steps.") pour le verrou de dégel ; Diabolic
Edict ("Target player sacrifices a creature.") pour le sacrifice forcé ;
Mind Rot ("Target player discards two cards.") pour la défausse forcée.
Cibles/poids rééquilibrés dans `formats.ts` pour les deux configs (somme
des poids revérifiée à 100 programmatiquement).

**Nouveau signal pour les cartes qui restent "rôle non identifié".**
Même avec 9 piliers, il y aura toujours des cartes hors périmètre — c'est
inhérent à un système de piliers finis, pas un manque à combler à l'infini
par plus de mots-clés (au risque de perdre en précision, ce que tu m'as
explicitement demandé d'éviter). Pour que "rôle non identifié" ne soit
plus une impasse totale, j'ai ajouté un signal complémentaire, factuel et
indépendant des piliers : `card.game_changer` (liste officielle "Game
Changer" du Commander Rules Committee, cartes jugées susceptibles de
définir une partie à elles seules) et `card.edhrec_rank` (rang de
popularité générale sur EDHREC) sont deux champs **officiels du Card
Object Scryfall lui-même** — pas un scraper EDHREC non officiel, donc
cohérent avec la position prise plus haut sur EDHREC — déjà présents dans
la réponse API, juste jamais exploités jusqu'ici. Quand aucune catégorie
ne matche mais que la carte est marquée "Game Changer" ou très populaire
(rang EDHREC ≤ 5000), le message affiché le mentionne explicitement. ⚠️
Important : ça ne dit toujours PAS si la carte comble un manque de TON
deck précis (le verdict reste "unclear", aucune catégorie n'est ajoutée)
— c'est un fait objectif en plus, pas une recommandation. Testé sur Mana
Maze : reste "rôle non identifié" si on ignore la nouvelle catégorie
disruption (donc pas de régression sur les cartes réellement hors
périmètre), et le signal de popularité s'affiche correctement sur une
carte mockée avec `game_changer: true` et `edhrec_rank` bas.

**La recherche manuelle proposait toujours le même swap.** Corrigé le
26/08/2026 : quand la carte cherchée ne partage de catégorie avec rien
dans le deck, `pickSwapCandidate` retombe sur "la carte la plus
sacrifiable du deck" — souvent une seule carte, très générique. Sans
mémoire entre recherches, cette même carte ressortait pour toute
recherche non liée, ce qui donnait l'impression (à raison) d'un outil peu
utile. `AddCardSearch.tsx` garde maintenant en mémoire les 3 dernières
candidates proposées et les exclut des recherches suivantes
(`excludeFromSwap` dans `evaluateCardCompatibility`), pour faire tourner
les propositions plutôt que de répéter toujours la même.

**Decklists préconstruites — pas mtgjson.com en direct.** `mtgjson.com`
était bloqué par le pare-feu sortant de mon environnement de dev, donc je
n'ai pas pu vérifier son schéma en direct. J'ai utilisé à la place le
dataset communautaire
[`magic-preconstructed-decks-data`](https://github.com/taw/magic-preconstructed-decks-data)
(accessible via `raw.githubusercontent.com`), qui agrège les decklists
officielles publiées par Wizards of the Coast et que j'ai pu inspecter
directement. Il fournit trois types utilisés ici : `Commander Deck` (190,
2011 → juin 2026), `Brawl Deck` (4, seule vague jamais commercialisée —
Throne of Eldraine 2019) et `Arena Starter Deck`/`Arena Starter Kit` (109,
2018-2020). Le script `scripts/fetch-precon-decks.mjs` télécharge et
filtre ce dataset vers `src/data/{commander-decks,arena-brawl-decks,arena-starter-decks}.json`,
committés dans le repo. Relancer `npm run fetch-decks` pour rafraîchir.

⚠️ Les decks Brawl et Starter Arena sont des **produits papier de
2018-2020 réutilisés comme base** : leur légalité actuelle dans un format
Arena donné (rotation, Historic, bans...) n'est pas garantie par le
dataset — elle est vérifiée à la volée via Scryfall (`legalities` +
`games`) au moment de l'analyse, avec le même système de dégradation
("non trouvée" / carte non affichée) que le reste du site plutôt qu'une
promesse de fraîcheur.

**Format d'import/export Arena.** Le client Arena n'a pas de
spécification officielle publiée pour son format texte. `src/lib/arena-format.ts`
reproduit fidèlement le comportement de la bibliothèque open-source
[`mtg-decklist-parser`](https://github.com/im-sticky/mtg-decklist-parser)
(MIT), dont j'ai lu le code source directement (`decklist.js`,
`cardModel.js`) plutôt que de deviner le format à partir d'articles de
blog. Sections `Deck`/`Sideboard`/`Commander`/`Companion`, ligne de carte
`<n> <nom> (<SET>) <numéro>`.

**Clés de format Scryfall.** Les clés utilisées (`standard`, `historic`,
`explorer`, `alchemy`, `timeless`, `brawl`, `historicbrawl`, ...) viennent
du type `ScryfallFormat` du package officiel `@scryfall/api-types`
(installé temporairement pour inspection, pas une dépendance du projet) —
pas d'une supposition.

**Scryfall.** Pas de clé API requise. J'ai suivi les recommandations
officielles (cache 24h, `/cards/collection` pour les lookups groupés,
throttle ~9 req/s, en-tête `User-Agent` personnalisé — **requis** par
Scryfall depuis leur changement de politique anti-scraping, voir leur
blog officiel ; sans lui les requêtes sont bloquées silencieusement, ce
qui a causé un bug de résolution de cartes à 100% en production avant
d'être identifié et corrigé). Le code dégrade proprement quand une carte
n'est pas trouvée ("non trouvée" plutôt qu'un crash). Mon sandbox de dev
bloque toujours `api.scryfall.com` (403 systématique), donc je n'ai pas pu
retester les appels Scryfall en direct depuis ce même environnement — mais
le site déployé (Vercel) a été confirmé fonctionnel par l'utilisateur
après le correctif du `User-Agent`.

**Code langue FR pour les traductions.** Le toggle FR/EN suppose que
`"fr"` est le code langue Scryfall pour le français (`lang:fr` dans les
recherches), par analogie avec la doc Scryfall sur les langues — je n'ai
pas pu vérifier ce code contre une réponse API réelle (même blocage réseau
que ci-dessus). La conception est volontairement tolérante à l'erreur : si
le code est faux, la recherche ne renvoie simplement aucun résultat et
l'app retombe sur le texte anglais avec un message explicite, plutôt que
de planter ou d'afficher une traduction incorrecte.

## Démarrer en local

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Rafraîchir les decks préconstruits

```bash
npm run fetch-decks
```

Ne couvre PAS `src/data/duelcommander-decks.json` (snapshot manuel, pas de
script — voir "Duel Commander : section dédiée (05/09/2026)" plus haut).

## Structure

```
src/
  app/
    page.tsx                    # Accueil Commander papier : liste + recherche
    decks/[id]/page.tsx         # Détail deck Commander papier
    duelcommander/page.tsx      # Accueil Duel Commander : liste des 11 decks de tournoi
    duelcommander/decks/[id]/page.tsx  # Détail deck Duel Commander
    collection/page.tsx         # Constructeur de decks compétitif (25/09/2026)
    arena/page.tsx              # Accueil Arena : import + galeries Brawl/Starter
    arena/decks/[id]/page.tsx   # Détail deck Arena (galerie), sélecteur de format
    glossaire/page.tsx          # Glossaire MTG (FR/EN), recherchable
    extensions/page.tsx         # Liste des extensions suivies (métadonnées légères)
    extensions/[code]/page.tsx  # Checklist complète d'un set (cartes FR/EN, mécaniques)
  components/
    DeckAnalysis.tsx             # Point d'entrée serveur : lance analyzeDeck, rend DeckBuilder
    DeckBuilder.tsx              # Simulateur interactif (client) : add/remove, swap, tableau de bord, panneau latéral
    DeckDashboard.tsx            # Score actuel/projeté + couverture des 9 piliers (en tête de page)
    PillarCoverage.tsx           # Les 9 piliers, cliquables (filtre le deck sur la catégorie)
    ImproveDeckPanel.tsx         # Panneau à onglets Suggestions / Tester une carte
    SwapConfirmModal.tsx         # Popup de confirmation d'un swap (ajout + retrait suggéré)
    AddCardSearch.tsx            # Recherche + test de compatibilité d'une carte (hors suggestions)
    CardImageHover.tsx           # Vignette avec image agrandie au survol
    ArenaImportForm.tsx          # Formulaire d'import (client + Server Action)
    ArenaExportButton.tsx        # Export texte Arena (copier/coller)
    CsvImportForm.tsx            # Reprend un deck Commander exporté en CSV (client + Server Action)
    CompetitiveBuilder.tsx       # Constructeur compétitif : import, format, decks proposés, pool recommandé
    LanguageProvider.tsx         # Contexte + toggle FR/EN pour le texte des cartes
    GlossaryBrowser.tsx          # Glossaire : recherche + filtre par catégorie
    ExtensionsBrowser.tsx        # Liste des extensions : recherche + tri
    SetDetail.tsx                # Checklist d'un set : mécaniques cliquables + recherche + zoom au survol
    CardTile.tsx, SuggestionCard.tsx, ManaCost.tsx, DeckCard.tsx
  lib/
    types.ts                     # Types partagés
    formats.ts                   # Registre des formats (cibles/poids par format)
    translation-cache.ts         # Cache mémoire des traductions FR (partagé CardTile/SuggestionCard)
    precon-decks.ts              # Decks Commander papier (snapshot local)
    duelcommander-decks.ts       # Decks Duel Commander (snapshot manuel, 11 decks de tournoi mtgtop8)
    arena-decks.ts               # Decks Brawl/Starter Arena (snapshot local)
    arena-format.ts              # Parse/génère le texte d'import-export Arena
    arena-import.ts              # Adapte un deck importé vers le modèle interne
    csv-import.ts                # Parse un CSV exporté depuis ce site (reprise de session)
    actions.ts                   # Server Actions : analyzeDeck (cœur), analyzeArenaImport, fetchLocalizedText, recherche de carte
    scryfall.ts                  # Client API Scryfall (cache, throttle, headers requis, impressions FR, sets, autocomplétion)
    sets.ts                       # Checklist + mécaniques d'un set (combine scryfall.ts + glossary.ts + set-notes.ts)
    set-notes.ts                   # Charge set-notes.json (mécaniques introduites par set, recherchées)
    text.ts                       # Recherche insensible aux accents, slug, formatage de date FR
    deck-loader.ts                # Résolution deck -> cartes Scryfall (par format)
    deck-score.ts                 # Heuristique de score (catégories, paramétrable)
    recommend.ts                   # Recherche + classement des suggestions (par format)
    deck-tier.ts                   # Tier de puissance 1-5 (composantes exposées, combos, méta Duel)
    competitive-builder.ts         # Moteur du constructeur compétitif (gain marginal de tier, synergie, combos)
    competitive-actions.ts         # Server Actions du constructeur (runCompetitiveBuild, openProposedDeck)
    collection-builder.ts          # Utilitaires : éligibilité commandant, légalité, terrains de base
    collection-import.ts           # Parse une liste de cartes (texte ou CSV)
    synergy.ts                     # Thèmes/tribus d'un commandant, synergie carte↔commandant
    combos.ts                      # Détection de combos connues (par noms)
    duel-meta.ts                   # Présence des cartes en tournoi Duel (duel-meta.json)
    partners.ts                    # Règles des duos de commandants (Partner, Background...)
    spellbook.ts                   # Client Commander Spellbook (find-my-combos, estimate-bracket)
    name-resolution.ts             # Résolution tolérante des noms importés (autocorrection)
    duel-reference.ts              # Decks de référence par commandant + synergies apprises (Duel)
  data/
    commander-decks.json          # Snapshot Commander papier
    duelcommander-decks.json      # Snapshot Duel Commander (11 decks, collecte manuelle mtgtop8)
    arena-brawl-decks.json        # Snapshot Brawl (Arena)
    arena-starter-decks.json      # Snapshot Starter Decks (Arena)
    glossary.ts                   # Contenu du glossaire (~55 termes, sourcés)
    tracked-sets.ts               # Codes des ~58 sets couverts par la section Extensions
    set-notes.json                 # Mécaniques introduites + contexte par set (58 entrées, sourcées)
    duel-meta.json                 # Présence des cartes dans les decks de tournoi Duel (mtgtop8)
    duel-commander-reference.json  # Cartes jouées par commandant en tournoi Duel
    duel-cooccurrence.json         # Synergies apprises (paires jouées ensemble par plusieurs commandants)
    game-changers.ts               # Liste des Game Changers (09/02/2026) — noms à proposer
    competitive-staples.ts         # Staples par rôle + commandants haute puissance (curatés)
    combos.ts                      # Base curatée de combos connues
scripts/
  fetch-precon-decks.mjs          # Génère les 3 fichiers src/data/*.json
  build-duel-meta.py              # Génère src/data/duel-meta.json depuis l'ancien classeur xlsx (historique)
  fetch-duel-meta.mjs             # Élargit l'échantillon Duel depuis mtgtop8 (à lancer sur le Mac) + index
  install-weekly-duel-meta.sh     # Programme la collecte chaque lundi (LaunchAgent macOS)
```

## Prochaines étapes suggérées

- Vérifier l'intégration Scryfall avec un accès réseau réel (papier ET Arena).
- Affiner les patterns de classification par catégorie (faux
  positifs/négatifs actuels à surveiller en usage réel).
- Affiner les cibles de score constructed 60 cartes (`CONSTRUCTED_60`
  dans `formats.ts`) une fois testées sur de vrais decks.
- Décider d'une stratégie EDHREC si le besoin de vraies données de
  synergie se confirme.
- Authentification / sauvegarde serveur de decks personnalisés (hors
  scope v1 — la sauvegarde actuelle est locale au navigateur, voir
  DeckBuilder.tsx).
- Import d'un CSV précédemment exporté pour reprendre une session sur un
  autre appareil (actuellement la sauvegarde ne survit que dans le
  navigateur d'origine via localStorage).
- Gérer le sideboard et le companion dans l'analyse Arena (actuellement
  seul le deck principal est analysé).
- Constructeur compétitif : lancer `npm run fetch-duel-meta` régulièrement
  sur le Mac pour grossir l'échantillon Duel ; confirmer en réel le format
  des réponses Commander Spellbook.

## Attribution

- Données de cartes : [Scryfall](https://scryfall.com).
- Decklists préconstruites (Commander, Brawl, Starter Arena) : dataset
  [`magic-preconstructed-decks-data`](https://github.com/taw/magic-preconstructed-decks-data),
  agrégeant des decklists officielles Wizards of the Coast.
- Format d'import/export Arena : logique de référence de
  [`mtg-decklist-parser`](https://github.com/im-sticky/mtg-decklist-parser) (MIT).
- Magic: The Gathering est une marque déposée de Wizards of the Coast.
  Ce projet est un outil non officiel, non affilié à Wizards of the Coast.

## 26/09/2026 — Cartes toutes « non trouvée » : limites de débit Scryfall

**Symptôme (remonté par Ben)** : un deck collé s'affichait avec 100% des cartes
« non trouvée », tier 1 et indice 0/100.

**Cause la plus probable** : la page officielle
https://scryfall.com/docs/api/rate-limits (consultée le 26/09/2026) limite
`/cards/search`, `/cards/named`, `/cards/random` et `/cards/collection` à
**2 requêtes/seconde**. Un HTTP 429 suspend l'accès 30 s, et insister
« peut entraîner un bannissement temporaire ou permanent ». Le client envoyait
tout à ~9 req/s. Le constructeur compétitif fait des dizaines d'appels par
passage, et chaque échec relançait une recherche approchée par carte.
Reproduit avec un faux Scryfall qui applique ces limites : sur l'ancien code,
243 requêtes sur 245 ont reçu un 429 et l'analyse suivante affichait
91/91 cartes « non trouvée ». **Non confirmé sur les journaux Vercel**
(pas d'accès) : chercher « HTTP 429 » dans les logs pour le vérifier.

**Correctifs** (src/lib/scryfall.ts, name-resolution.ts, actions.ts,
competitive-actions.ts) :
- deux files d'attente : 550 ms entre deux appels « stricts », 110 ms pour
  les autres ;
- après un 429, pause de 35 s (ou `Retry-After`) pendant laquelle aucune
  requête n'est envoyée ;
- cache mémoire nom → carte (instance chaude) ; recherche approchée plafonnée
  à 20 noms ;
- résolution tolérante : l'autocomplétion (couloir 10 req/s) passe avant la
  recherche approchée (12 noms max) et le français (6 max) ;
- message clair (« Scryfall limite temporairement… ») au lieu d'un faux
  deck vide ; note dans le constructeur si un 429 est survenu pendant la
  construction.

**Contrepartie** : l'analyse d'un deck prend quelques secondes de plus
(≈ 6-9 s mesurées sur le faux Scryfall ; délais réels non mesurés).

**Aussi** : bouton « Trouver le meilleur commandant pour ces cartes » dans le
simulateur de deck. Il transmet la liste au constructeur (`/collection?depuis=simulateur`,
via le stockage du navigateur).

## 26/09/2026 (2) — Couleurs, terrains, deux groupes de propositions

Retours de Ben sur le constructeur : decks proposés en 4-5 couleurs, base de
mana invisible (« ça suggère 99 cartes de sorts »), et plus aucun commandant
de sa liste proposé.

- **3 couleurs max** (`MAX_DECK_COLORS`, competitive-builder.ts) : les
  commandants et duos à 4-5 couleurs ne sont plus évalués. Ils ressortaient
  parce qu'ils donnent accès à toutes les cartes de la liste, sans que le
  tier ne compte le coût d'une base de mana lente. Une note indique combien
  ont été écartés. Paramètre `maxColors` de `rankProposals` pour changer la
  règle plus tard.
- **Terrains** : le deck contenait déjà ~35 terrains (cible 37/99, moins
  jusqu'à 3 avec beaucoup de mana rapide), mais la liste les mélangeait aux
  sorts par ordre alphabétique. Désormais :
  - le simulateur sépare « Sorts et permanents (N) » et « Terrains (N) » ;
  - chaque version (« Avec mes cartes », « Optimisé ») affiche
    « X terrains (dont Y de base) · Z sorts ».
- **Qualité des terrains** :
  - malus pour un terrain qui arrive toujours engagé (0,75 en multi, 1,5 en
    Duel). La détection se fait sur le texte oracle ; les terrains de choc et
    les check-lands ne sont pas pénalisés ;
  - en monocolore, un terrain bicolore ne gagne plus de crédit « fixing » ;
  - un terrain de la liste qui ne vaut pas mieux qu'un terrain de base n'est
    plus pris : un terrain de base de la bonne couleur le remplace.
- **Deux groupes** (competitive-actions.ts, `PROPOSALS_PER_GROUP = 5`) :
  - les 5 meilleurs decks avec un commandant de la liste (au moins 12
    commandants de la liste sont évalués) ;
  - les 5 meilleurs avec un commandant à acquérir ;
  - chaque groupe est classé par tier. L'enrichissement (synergie, Commander
    Spellbook) alterne entre les deux.

Vérifié par des tests du moteur, dont 4 nouveaux cas (terrains engagés,
monocolore, UR, règle des couleurs), et de bout en bout avec un faux
Scryfall (groupes, compte des terrains, mobile sans débordement). Pas
vérifié sur tes vraies cartes : les poids (malus d'un terrain engagé) sont
des choix de conception à ajuster à l'usage.

## 26/09/2026 (3) — Plancher de terrains de base

Retour de Ben : les decks construits ne contenaient que des terrains
non-base. Avec une grande collection, presque chaque terrain non-base
valait un peu plus qu'un terrain de base (fixing, présence en tournoi,
rang EDHREC) et prenait toutes les places. Correctifs (competitive-builder.ts) :

- **Plancher de terrains de base** (`MIN_BASICS_BY_COLORS`) : 24 en
  monocolore, 14 en bicolore, 9 en tricolore. Ce sont des choix de
  conception (ordre de grandeur de listes courantes), pas des statistiques
  mesurées ; à ajuster à l'usage.
- **Coupe liée au mana rapide** : elle retire d'abord les derniers terrains
  non-base choisis, puis seulement des terrains de base.

Test : avec 40 bicolores non engagés possédés, le deck obtient 9 terrains
de base (3 couleurs) ou 14 (2 couleurs), toujours à 99 cartes.

## 26/09/2026 (4) — Constructeur Duel calé sur les decks de tournoi

Demande de Ben : s'inspirer des decks mtgtop8 (terrains de base / spéciaux,
patterns de construction). Le constructeur ne le convainquait pas en Duel.

**Données.** `node scripts/fetch-duel-meta.mjs --weeks 12` :
- archive de 2 056 decks, dont 1 500 de juillet à septembre 2026 ;
- `analysis/duelcommander/cards-scryfall.json` : type, coût et texte de
  4 025 cartes, pour analyser sans accès réseau (`--offline`) ;
- `src/data/duel-color-profiles.json` : pour chaque identité couleur, les
  médianes (terrains, terrains de base, fetchlands, courbe, créatures) et la
  part des decks qui jouent chaque carte.

**Ce que disent les decks réels** (1 500 decks ; médianes, avec l'écart
p25-p75 entre crochets) :

| Couleurs | Terrains | Terrains de base | Fetchlands | Coût moyen |
|---|---|---|---|---|
| 1 | 38 | 23 [18-26] | 1 | 1,98 |
| 2 | 38 | 9 [6-12] | 8 | 2,24 |
| 3 | 37 | 4 [3-5] | 10 | 2,33 |

- Terrains engagés : 0 à 3 par deck.
- Courbe (tous decks) : ~20 cartes à 0-1, ~18 à 2, ~11 à 3, ~6 à 4, ~4 à 5 et plus.
- Mana rapide : médiane 1-2 cartes ; les decks gardent 37-38 terrains même
  avec du mana rapide.

**Écarts du constructeur corrigés** (competitive-builder.ts,
duel-profiles.ts) :
- Terrains : la cible est la médiane de l'identité couleur (au lieu de
  37 − coupe liée au mana rapide) ; en Duel, plus aucun terrain n'est coupé.
- Terrains de base : médiane de l'identité (le plancher 24/14/9 reste pour
  le multi).
- Choix des cartes : part des decks de tournoi de la MÊME identité
  (identités voisines mélangées quand il y a peu de decks), au lieu de la
  part des decks qui peuvent jouer la carte. Exemple : Scalding Tarn est à
  ~60 % sur l'ensemble du méta mais presque absente des decks mono-blancs.
- Poids du méta et de la référence du commandant relevés
  (metaWeight 5 → 16, referenceWeight 6 → 12).
- Game Changers ignorés dans le choix en Duel (notion du multi ; Glacial
  Chasm était mise partout). Le tier affiché ne change pas.
- Fetchland inutile si elle ne trouve aucun type de base des couleurs du deck.
- Cartes modales « sort // terrain » comptées comme des sorts.

**Mesure.** On construit un deck pour chaque commandant joué ≥ 8 fois (45
commandants), en supposant toutes les cartes du méta disponibles. On
regarde quelle part du « cœur » réel (cartes jouées par ≥ 50 % des decks de
ce commandant) le deck retrouve :

| Version | Cœur retrouvé | Terrains (réel) | Terrains de base (réel) |
|---|---|---|---|
| Avant | 43 % | 33,5 (38,2) | 14,8 (9,9) |
| Après, sans données propres au commandant | 69 % | 37,4 | 9,8 |
| Après, avec la référence du commandant (test sur des decks postérieurs au 10/09, référence calculée avant) | 91 % | 37,4 (37,5) | 9,4 (9,4) |

Scripts d'évaluation : `analyze-patterns.mts` et `evaluate-builder.mts`,
gardés hors du dépôt (scratchpad de la session). À recréer si besoin à
partir de cette description.

**Limites.**
- Le cœur d'un archétype dépend souvent de cartes de synergie précises
  (ex. Sigarda's Aid pour Cloud) : sans decks de tournoi du commandant,
  elles restent difficiles à deviner.
- Le « tier » affiché reste la formule inspirée des brackets du multi.

# Commander Booster

Un site pour partir d'un deck préconstruit — Commander papier ou MTG
Arena — trouver les cartes qui l'amélioreraient, et visualiser le gain de
puissance estimé, avec le texte oracle et le coût de mana de chaque carte.

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

## Structure

```
src/
  app/
    page.tsx                    # Accueil Commander papier : liste + recherche
    decks/[id]/page.tsx         # Détail deck Commander papier
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
  data/
    commander-decks.json          # Snapshot Commander papier
    arena-brawl-decks.json        # Snapshot Brawl (Arena)
    arena-starter-decks.json      # Snapshot Starter Decks (Arena)
    glossary.ts                   # Contenu du glossaire (~55 termes, sourcés)
    tracked-sets.ts               # Codes des ~58 sets couverts par la section Extensions
    set-notes.json                 # Mécaniques introduites + contexte par set (58 entrées, sourcées)
scripts/
  fetch-precon-decks.mjs          # Génère les 3 fichiers src/data/*.json
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

## Attribution

- Données de cartes : [Scryfall](https://scryfall.com).
- Decklists préconstruites (Commander, Brawl, Starter Arena) : dataset
  [`magic-preconstructed-decks-data`](https://github.com/taw/magic-preconstructed-decks-data),
  agrégeant des decklists officielles Wizards of the Coast.
- Format d'import/export Arena : logique de référence de
  [`mtg-decklist-parser`](https://github.com/im-sticky/mtg-decklist-parser) (MIT).
- Magic: The Gathering est une marque déposée de Wizards of the Coast.
  Ce projet est un outil non officiel, non affilié à Wizards of the Coast.

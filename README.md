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
- Jauge visuelle du score de puissance structurelle, avant/après ajout
  des cartes suggérées.
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
- Ajouter une carte en dehors des suggestions : recherche libre (avec
  autocomplétion Scryfall) au-dessus de la liste du deck, aperçu (image,
  coût de mana, texte) avant confirmation. Contrairement aux suggestions
  automatiques, cette recherche n'est filtrée ni par légalité ni par
  identité de couleur : n'importe quelle carte peut être cherchée et
  ajoutée, avec un avertissement (pas un blocage) si elle n'est pas légale
  dans le format en cours ou hors des couleurs du commandant, et un
  message si elle est déjà au nombre d'exemplaires maximum autorisé.
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
/ fixing), comparaison à des cibles indicatives par format (voir
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
  components/
    DeckAnalysis.tsx             # Point d'entrée serveur : lance analyzeDeck, rend DeckBuilder
    DeckBuilder.tsx              # Simulateur interactif (client) : add/remove, swap, accordéon, save, export CSV
    SwapConfirmModal.tsx         # Popup de confirmation d'un swap (ajout + retrait suggéré)
    AddCardSearch.tsx            # Recherche + ajout manuel d'une carte (hors suggestions)
    CardImageHover.tsx           # Vignette avec image agrandie au survol
    ArenaImportForm.tsx          # Formulaire d'import (client + Server Action)
    ArenaExportButton.tsx        # Export texte Arena (copier/coller)
    CsvImportForm.tsx            # Reprend un deck Commander exporté en CSV (client + Server Action)
    LanguageProvider.tsx         # Contexte + toggle FR/EN pour le texte des cartes
    CardTile.tsx, SuggestionCard.tsx, ManaCost.tsx, ImprovementGauge.tsx, DeckCard.tsx
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
    scryfall.ts                  # Client API Scryfall (cache, throttle, headers requis, impressions FR, autocomplétion)
    deck-loader.ts                # Résolution deck -> cartes Scryfall (par format)
    deck-score.ts                 # Heuristique de score (catégories, paramétrable)
    recommend.ts                   # Recherche + classement des suggestions (par format)
  data/
    commander-decks.json          # Snapshot Commander papier
    arena-brawl-decks.json        # Snapshot Brawl (Arena)
    arena-starter-decks.json      # Snapshot Starter Decks (Arena)
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

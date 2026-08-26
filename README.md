# Commander Booster

Un site pour partir d'un deck préconstruit — Commander papier ou MTG
Arena — trouver les cartes qui l'amélioreraient, et visualiser le gain de
puissance estimé, avec le texte oracle et le coût de mana de chaque carte.

## Fonctionnalités (v1)

**Commander papier**
- Parcourir les 190 decks Commander préconstruits officiels (Commander
  2011 → aujourd'hui), avec recherche par nom / extension / commandant.
- Page détail d'un deck : liste complète des cartes, coût de mana, texte
  oracle et image au clic.
- Suggestions de cartes pour combler les faiblesses structurelles du deck,
  filtrées par légalité Commander et identité couleur du commandant.
- Jauge visuelle du score de puissance structurelle, avant/après ajout
  des cartes suggérées.

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
throttle ~9 req/s), mais je n'ai **pas pu tester les appels Scryfall en
direct** : `api.scryfall.com` était bloqué par le pare-feu sortant de mon
sandbox de dev. Le code est écrit pour dégrader proprement (cartes non
résolues affichées "non trouvée" plutôt qu'un crash) — vérifié en
simulant une panne réseau complète sur toutes les pages, y compris
l'import Arena — mais **le premier test avec un accès réseau normal (en
local ou déployé) reste à faire** avant de considérer l'intégration
Scryfall validée.

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
    DeckAnalysis.tsx             # Bloc partagé : liste + jauge + suggestions (server)
    ArenaImportForm.tsx          # Formulaire d'import (client + Server Action)
    ArenaExportButton.tsx        # Export texte Arena (copier/coller)
    CardTile.tsx, SuggestionCard.tsx, ManaCost.tsx, ImprovementGauge.tsx, DeckCard.tsx
  lib/
    types.ts                     # Types partagés
    formats.ts                   # Registre des formats (cibles/poids par format)
    precon-decks.ts              # Decks Commander papier (snapshot local)
    arena-decks.ts               # Decks Brawl/Starter Arena (snapshot local)
    arena-format.ts              # Parse/génère le texte d'import-export Arena
    arena-import.ts              # Adapte un deck importé vers le modèle interne
    actions.ts                   # Server Action : analyse d'un deck importé
    scryfall.ts                  # Client API Scryfall (cache, throttle)
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
- Authentification / sauvegarde de decks personnalisés (hors scope v1).
- Simulation de "coupe" de cartes (actuellement les suggestions
  s'ajoutent sans proposer quoi couper pour respecter la taille du deck).
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

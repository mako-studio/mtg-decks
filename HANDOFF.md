# Passation — MTG Opti (mtg-decks)

Document de passation pour reprendre ce projet dans une **nouvelle
conversation Claude**, sans l'historique des conversations précédentes.
Réécrit et consolidé le 25/09/2026 (constructeur de decks compétitif), mis à
jour le 04/10/2026 (moteur Duel refondu) : même version dans le repo et dans
le projet claude.ai.

**Si tu es un Claude qui reprend ce projet : lis ce fichier en entier, puis
le README.md, avant de toucher au code.** Le README est la doc
produit/technique vivante et l'historique daté de chaque évolution (sections
« ### … (date) ») ; ce fichier-ci est le mode d'emploi pour travailler dessus.

---

## 1. C'est quoi, ce projet

**MTG Opti** : un site Next.js pour Ben autour des decks Magic: The
Gathering, surtout Commander :

- analyse d'un deck (précon Commander papier, deck Duel Commander de
  tournoi, import MTG Arena, import CSV) : score de complétude 0-100 (9
  piliers), **tier de puissance 1-5** (low/mid/top), suggestions de cartes,
  simulateur interactif (ajout/retrait/swap, Super Opti) ;
- **constructeur de decks compétitif** (`/collection`, 25/09/2026) : Ben
  importe une liste de cartes, choisit Commander multi ou Duel Commander,
  le système trouve les meilleurs commandants (dans la liste ou non),
  construit pour chacun le deck le plus puissant possible (objectif Tier 4,
  priorité absolue) et propose un pool de cartes à acquérir ;
- Glossaire et Extensions (checklists de set FR/EN).

Pas de base de données, pas de compte. Données de cartes : API Scryfall en
direct (pas de clé). Decklists précon : snapshot JSON commité. Données de
méta Duel : snapshot JSON généré depuis une analyse mtgtop8.

## 2. Où vivent les fichiers

1. **Repo GitHub** `mako-studio/mtg-decks`, branche `main` — source de vérité.
2. **Clone local de Ben** : `/Users/bensom/Documents/GitHub/mtg-decks`. Ben
   commite et pousse lui-même depuis GitHub Desktop, avec ses propres
   messages (ex. `upgrade250926`) — les hash de commit du Mac ne
   correspondent donc PAS à ceux du clone de travail de Claude.
3. **Environnement de travail de Claude** (cloud) : une copie du repo, où
   l'on peut lancer Node/`npm run build`/Playwright.

Depuis le 25/09/2026, la session peut être **liée au Mac** (outils
`mcp__remote-devices__*`) : `device_bash` y donne un shell (Linux VM,
dossier monté à `$HOME/mnt/mtg-decks`, **pas** de `node_modules`, pas
d'accès Scryfall non plus). Copier le repo vers le cloud : `git ls-files`
côté Mac, puis `device_stage_files` par lots de ≤ 50 fichiers (le dossier
`.git` n'est pas accessible, `tar` échoue). Les suppressions de fichiers
sur le Mac demandent une permission explicite de Ben
(`device_request_delete_permission`).

## 3. Démarrer

```bash
npm install          # ou npm ci
npm run dev          # http://localhost:3000
npm run build        # build de prod (Turbopack) — avant tout livrable
npx eslint .         # doit être propre
npm run fetch-decks  # régénère src/data/*-decks.json (rare)
python3 scripts/build-duel-meta.py   # régénère src/data/duel-meta.json (openpyxl)
```

Stack : Next.js 16.3.3 (App Router, Turbopack), React 19.2.8, TypeScript,
Tailwind CSS v4 (tokens dans `globals.css`, mode sombre via
`prefers-color-scheme`). Aucune dépendance runtime hors Next/React.

## 4. Architecture — points d'entrée

Voir la section « Structure » du README pour l'arbre complet.

- **`src/lib/scryfall.ts`** — tout l'accès Scryfall. Header `User-Agent`
  obligatoire (sans lui, 100% des requêtes sont bloquées — déjà arrivé en
  prod), cache HTTP 24h, **file d'attente** ~9 req/s (`throttle()`, file
  chaînée depuis le 25/09/2026 : les appels parallèles partaient par
  paires). `getCardsByNames(names, { fuzzyFallback })` : `false` pour les
  listes curatées (un nom inconnu n'est pas une faute de frappe).
- **`src/lib/deck-score.ts`** — les 9 piliers (regex sur texte oracle +
  `keywords`/`produced_mana`), courbe/terrains, `hasDeadSingletonSynergy`.
- **`src/lib/deck-tier.ts`** — tier 1-5. Depuis le 25/09/2026 la formule
  est factorisée : `cardTierSignals` (par carte), `TierCounts` →
  `tierComponentsFromCounts` → `powerIndexFromComponents`, et
  `DeckTierResult.components` expose les points par composante. 9
  composantes : Game Changers (40), mana rapide (15), tutors (10),
  interaction (10), tours supplémentaires (10), destruction de terrains de
  masse (10), courbe (5), **combo** (12, nouveau), **présence en tournoi
  Duel** (25, Duel uniquement, nouveau). Plafond 100. `computeDeckTier` a un
  5e paramètre `formatKey`. `cardPowerScore` reste (utilisé par recommend.ts).
- **`src/lib/competitive-builder.ts`** (25/09/2026) — moteur du
  constructeur : `buildFeatureIndex` (tout précalculé une fois par carte),
  `greedyPick` (gain marginal EXACT de tier + piliers + synergie + combos +
  profil Multi/Duel + pénalité d'acquisition), `buildDeckForCommander`,
  `commanderAffinity` (présélection), `rankProposals` (tier d'abord).
  Fonctions pures, testables sans réseau.
- **`src/lib/competitive-run.ts`** (ex-competitive-actions, 03/10/2026) —
  `runCompetitiveBuildCore(input, onProgress?)` : le déroulé en 8 étapes
  (liste, commandants, pool, classement, synergies, combos, plans de jeu et
  parties simulées, finalisation). Appelé par la route de flux
  `src/app/api/competitive-build/route.ts` (étapes en direct) et, en repli,
  par la Server Action `runCompetitiveBuild` de `competitive-actions.ts`
  (qui garde aussi `openProposedDeck`).
- **Moteur du 03/10/2026** (section README « Moteur de construction ») :
  `mechanics.ts` (axes produit/récompense, rôles), `deck-trends.ts` +
  `src/data/deck-trends.json` (tendances apprises par
  `scripts/learn-deck-trends.mts`, `npm run learn-trends`), `game-plan.ts`
  (plans, indice de synergies), `playtest.ts` (parties simulées),
  `deck-optimizer.ts` (variantes → choix → ajustements),
  `game-plan-summary.ts`, `staples.ts`, `build-steps.ts`,
  `components/BuildPanels.tsx`. Règle de choix : palier de tier d'abord,
  puis 0,6 × parties simulées + 0,4 × synergies.
- **Moteur DUEL du 04/10/2026** (section README « Moteur Duel refondu ») —
  à lire avant de toucher au constructeur en Duel :
  `card-quality.ts` (qualité 0-10 d'une carte : présence en tournoi, sinon
  modèle de texte `src/data/card-quality-model.json`, appris par
  `scripts/learn-card-quality.mts`), `deck-audit.ts` (lecture d'un deck :
  ligne directrice, rôle/justification/verdict par carte, cohérence, forme ;
  `multiplayerOnly`, `commanderRating`, `structureNeed`), `deck-reading.ts`
  (libellés, sans dépendance, pour le client), `duel-suggest.ts`
  (suggestions de la page de deck), `duelCardScore`/`duelLandScore` dans
  `competitive-builder.ts`, `deckSolidity`/`rankScore` dans
  `deck-optimizer.ts`, formes par commandant (`shapes`) dans
  `deck-trends.json`. Le multijoueur garde le moteur du 03/10.
- **`src/lib/partners.ts`** (25/09/2026, 2e passage) — règles des duos ;
  le constructeur gère 1 ou 2 commandants (`commanders[]` partout).
- **`src/lib/spellbook.ts`** (25/09/2026, 2e passage) — Commander Spellbook
  en direct depuis le site déployé (find-my-combos, estimate-bracket),
  appelé par `analyzeDeck` et le constructeur ; repli sur la base curatée.
- **`src/lib/name-resolution.ts`** (25/09/2026, 2e passage) — autocorrection
  des noms importés (cascade exact → nettoyage → approché → français →
  autocomplétion), corrections affichées.
- **`scripts/fetch-duel-meta.mjs`** — élargit l'échantillon Duel depuis
  mtgtop8 et génère 3 index (méta, référence par commandant, synergies
  apprises) ; à lancer par Ben sur son Mac, ou chaque lundi via
  `scripts/install-weekly-duel-meta.sh` (LaunchAgent). `--rebuild-only`
  recalcule sans télécharger. Archive cumulative :
  `analysis/duelcommander/decks-mtgtop8.json` (344 decks au 25/09/2026).
- **`src/lib/duel-reference.ts`** — lit les index de référence et de
  co-occurrence ; utilisé par le constructeur (bonus référence en Duel,
  synergies apprises dans les deux modes) et l'UI.
- **`src/lib/synergy.ts`** — 16 thèmes + tribu, masques de bits,
  `synergySearchQueries`. **`src/lib/combos.ts`** + `src/data/combos.ts` —
  ~35 combos curatées. **`src/lib/duel-meta.ts`** + `src/data/duel-meta.json`.
- **`src/data/game-changers.ts`** (liste au 09/02/2026),
  **`src/data/competitive-staples.ts`** (staples par rôle, commandants haute
  puissance) — des NOMS À ÉVALUER, jamais imposés (légalité/identité
  revérifiées via Scryfall).
- **`src/lib/recent-sets.ts`** + `src/data/recent-set-cards.json`
  (03/10/2026) — cartes NOUVELLES des dernières extensions (Reality
  Fracture : 286). Des noms à faire évaluer : sans ce fichier, une carte
  récente n'est jamais proposée (recherches triées par rang EDHREC). Utilisé
  par `recommend.ts` et `competitive-actions.ts`. Généré depuis Forge
  (`scripts/build-set-cards-from-forge.py`) ou Scryfall
  (`scripts/fetch-set-cards.mjs`, sur le Mac). Section README du 03/10/2026.
- **`src/lib/collection-builder.ts`** — réduit le 25/09/2026 à ses
  utilitaires (`isCommanderEligible`, `isLegalInFormat`,
  `BASIC_LAND_BY_COLOR`). L'ancien moteur de sélection et ses 6 Server
  Actions ont été retirés (remplacés par le constructeur compétitif).
- **`src/lib/recommend.ts`** — suggestions par pilier/archétype
  (tier-aware), évaluation d'une carte cherchée, choix de la carte à retirer.
- **`src/lib/archetype.ts`** — archétypes d'un deck existant.
- **`src/lib/actions.ts`** — Server Actions : `analyzeDeck` (cœur),
  imports Arena/CSV, recherche de carte, traduction, `superOptimizeDeck`.
- **`src/lib/formats.ts`** — registre des formats (cibles/poids, taille,
  copies max). Duel Commander = légalité Scryfall `duel`.
- **`src/components/CompetitiveBuilder.tsx`** — UI du constructeur.
  **`DeckBuilder.tsx`** — le simulateur partagé par toutes les pages deck
  (c'est le fichier qui grossit le plus : le relire avant d'y toucher).

## 5. Limites connues — à lire avant tout changement

- **Aucun accès à `api.scryfall.com`** depuis les environnements de dev
  (cloud ET VM du Mac ; `WebFetch` reçoit aussi un 403). Toute vérification
  touchant Scryfall se fait avec des données simulées. Le site déployé, lui,
  y accède. Inaccessibles aussi : EDHREC, mtgtop8, Commander Spellbook,
  mtgjson. Accessibles : npm, `raw.githubusercontent.com` (utile pour lire le
  code source d'une API, ex. Commander Spellbook), recherche web (WebFetch
  lit mtgtop8 page par page). **Ne pas** extraire des données en masse via
  le navigateur intégré de l'app sur le Mac de Ben : tenté le 25/09/2026,
  bloqué par un garde-fou de sécurité (contournement des restrictions
  réseau). Voies légitimes : appel en direct depuis le site déployé
  (Vercel), ou script que Ben lance lui-même sur son Mac.
- **Textes de cartes sans Scryfall** : le dépôt GitHub de Forge
  (`Card-Forge/forge`, clone partiel de `forge-gui/res/editions` et
  `cardsfolder`) donne la liste de chaque édition et le texte de ~34 000
  cartes. Utile pour tester une regex sur tout le pool
  (`scripts/build-set-cards-from-forge.py` contient le convertisseur). Les
  textes des cartes anciennes n'y sont pas tous à jour.
- **`git status` sur le Mac** : utiliser `git --no-optional-locks status`.
  Sans l'option, git laisse un `.git/index.lock` qu'il ne peut pas supprimer
  (arrivé le 03/10/2026) et GitHub Desktop refuse ensuite de commiter.
- **`/cards/collection` ne reconnaît pas « Recto // Verso »** (03/10/2026) :
  il faut lui envoyer le recto. `getCardsByNames` le fait ; un faux Scryfall
  de test DOIT refuser les noms complets, sinon ce genre de défaut passe
  inaperçu (c'est ce qui est arrivé).
- **Pas d'API EDHREC** : score/suggestions = moteur heuristique interne.
  Décision assumée, ne pas la remettre en cause sans Ben.
- **Tier = heuristique** inspirée des Brackets WotC, pas le système
  officiel ; ne détecte ni stax ni combos hors de la base curatée. Un score
  élevé et un tier modeste sur le même deck ne sont PAS une incohérence
  (deux axes, déjà investigué le 24/09/2026).
- **Le tier est le critère prioritaire en MULTIJOUEUR** (demande de Ben du
  24/09) : un état à tier plus haut mais score plus bas est le résultat
  voulu. **En DUEL, ce n'est plus le cas depuis le 04/10/2026** (retours de
  Ben : cartes contre-productives, toujours le même commandant, decks sans
  cohérence) : cartes, variantes et commandants sont choisis par la qualité
  des cartes, la forme, la cohérence et la note du commandant ; le tier
  affiché reste calculé comme avant et pèse 15 % de l'indice de solidité.
- **Un composant client ne doit pas importer `deck-audit.ts`** (ni
  `deck-optimizer.ts`, `competitive-run.ts`) autrement qu'en `import type` :
  ces modules chargent les données de tournoi (plusieurs centaines de Ko).
  Les libellés dont le client a besoin sont dans `deck-reading.ts`.
- **Spider-Man 2099 est banni comme commandant** depuis le 27/07/2026 :
  ses 61 decks de l'archive sont tous antérieurs. Ne pas s'étonner qu'un
  commandant très présent dans l'archive ne soit pas proposé — vérifier la
  banlist (`src/data/duel-banlist.ts`) d'abord.
- **Constructeur compétitif, non vérifié en réel** : requêtes Scryfall
  (`is:commander`, recherches de synergie), temps total en production,
  limite `maxDuration` du plan Vercel, orthographe exacte de chaque nom
  curaté, format exact des réponses Commander Spellbook (déduit de son code
  source), script mtgtop8 jamais exécuté en réel.
- **Méta Duel** : échantillon court (82 decks, 01→04/09/2026), part calculée
  sur tous les decks (favorise les couleurs dominantes), couleurs/raretés du
  classeur estimées sans Scryfall (ignorées par le générateur).
- Un « rôle non identifié » n'est pas automatiquement un bug : vérifier le
  texte oracle réel avant d'élargir une regex.

**Dépendances entre cartes (03/10/2026 (4))** — `src/lib/dependencies.ts` lit
ce qu'une carte va chercher (type, carte nommée) ou récompense (tribu) ;
`buildDeckForCommander` écarte les recherches sans cible et reconstruit
(≤ 3 passes), malus de 2,5 pour les tribus mal servies. Seuils 3/2/1/4 =
choix de conception. Le moteur compte les cibles, ne juge pas leur qualité.
Détail et mesures : README « 03/10/2026 (4) ».

## 6. Workflow de transfert vers le Mac de Ben

1. Coder/tester dans le cloud (section 7).
2. `git commit` dans le clone cloud (message en français), avec les lignes
   d'attribution demandées par la session en cours.
3. Envoyer les fichiers modifiés (`SendUserFile`), puis
   `mcp__remote-devices__device_commit_files` vers
   `/Users/bensom/Documents/GitHub/mtg-decks/...`. Fichiers supprimés :
   demander la permission de suppression, sinon les lister à Ben.
4. Vérifier : `cd "$HOME/mnt/mtg-decks" && git --no-optional-locks status --short` (via
   `device_bash`).
5. **Ben commite/pousse lui-même.** Ne jamais `git commit`/`git push` sur le
   clone du Mac.

## 7. Méthodologie de vérification

**Niveau 1 — logique pure (`tsx`)** : script `.mts` dans le **scratchpad**
(jamais à la racine du repo : le glob `**/*.mts` de tsconfig le ferait
entrer dans `next build`). Lancer depuis la racine du repo :
`NODE_PATH=$(npm root -g) tsx /chemin/scratchpad/verify-xxx.mts`.
Imports : `const ns = await import(".../src/lib/foo.ts"); const m = ns.default ?? ns;`
(les imports ESM nommés depuis un `.ts` échouent sous tsx dans cet
environnement ; l'import dynamique permet aussi de mocker `global.fetch`
avant le chargement). Les alias `@/…` de tsconfig fonctionnent sous tsx.
Les modules purs (deck-score, deck-tier, competitive-builder, synergy,
combos) se testent avec des objets `ScryfallCard` construits à la main —
fixtures du 25/09/2026 : cartes réelles avec textes oracle écrits de
mémoire (approximations) + cartes de remplissage synthétiques.

**Comparer à l'ancien code** : `git show HEAD:src/lib/x.ts > src/lib/zz-old.ts`,
l'importer depuis le script, puis le supprimer DANS LA MÊME commande.

**Toutes les cartes, sans Scryfall** (04/10/2026) : la collection de Ben
compte ~850 cartes absentes de `cards-scryfall.json`. Cloner Forge
(`git clone --depth 1 --filter=blob:none --sparse
https://github.com/Card-Forge/forge.git`, puis `git sparse-checkout set
forge-gui/res/editions forge-gui/res/cardsfolder`) et lancer
`python3 scripts/dump-forge-cards.py <clone> <sortie.json>` : 34 694 cartes
au format réduit de Scryfall, avec rareté. Un harnais qui fusionne
`cards-scryfall.json`, `cards-forge.json`, `recent-set-cards.json` et cet
index couvre 1 471 des 1 480 cartes (les 9 restantes sont des jetons). Le
même index sert à l'apprentissage (`npm run learn-quality`) et au faux
Scryfall des essais Playwright.

**Comparer deux moteurs** : `git worktree add <dossier> HEAD` puis lien
symbolique vers `node_modules` ; faire construire les decks par chaque
version et les RELIRE avec un seul et même code (sinon on compare deux
formules). Mesures de référence du 04/10/2026 dans le README : cœur des decks
de tournoi retrouvé (16 commandants), et moyennes sur les 5 premiers decks
de la collection de Ben.

**Performance** : toujours rebenchmarker avant/après (`performance.now()`)
— une première hypothèse « évidente » s'est déjà révélée sans effet
(24/09/2026). Repère du 25/09/2026 : 30 commandants × 2 decks sur 1 100
cartes ≈ 0,7 s de calcul pur.

**Niveau 2 — Playwright sur build de prod** : mock Scryfall en CommonJS qui
réassigne `global.fetch` (renvoyer de vrais `new Response(...)`, le cache
Next appelle `.arrayBuffer()`), puis
`rm -rf .next && npm run build` et
`NODE_OPTIONS="--require ./mock.cjs" npm run start -- -p 4173`. Tuer un
ancien serveur par PID (`ps aux | grep '[n]ext-server'`), pas `pkill` —
`pkill -f "next start"` tue aussi le shell qui le lance (arrivé le
03/10/2026). Un faux Scryfall prêt à reconstruire : index des cartes =
`cards-scryfall.json` + `recent-set-cards.json` + scripts Forge, servi sur
`/cards/collection`, `/cards/search` (`is:commander`) et `/cards/named`. Scripts
Playwright dans le scratchpad (`require` du playwright global,
Chromium préinstallé). Pièges connus : attendre la fin des recalculs avec
`waitForFunction` sur un texte (« Recalcul », « Ouverture du deck »), pas
un délai fixe ; plusieurs `<h1>`/`<h2>` par page ; relire les captures
avec `Read`.

## 8. AGENTS.md / CLAUDE.md

`AGENTS.md` (inclus par `CLAUDE.md`) demande de lire la doc Next.js dans
`node_modules/next/dist/docs/` avant d'écrire du code. **Correction du
25/09/2026** : les versions précédentes de ce fichier affirmaient qu'il
s'agissait d'une injection de prompt et que ce dossier n'existait pas —
c'est faux : Next 16 livre bien cette doc (`node_modules/next/dist/docs/`,
après `npm install`) et génère ce bloc
(`node_modules/next/dist/server/lib/generate-agent-files.js`). C'est donc
une consigne légitime et utile (ex. `maxDuration` pour les Server Actions
se lit dans `01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`).

## 9. État actuel

Se fier à `git status`/`git log` réels plutôt qu'à ce paragraphe.

Au 04/10/2026 : moteur Duel refondu (qualité des cartes, forme, cohérence,
commandants notés, justification par carte sur la page de deck, suggestions
Duel) — livré sur le Mac, non commité par Ben au moment de l'écriture. En
attente : retour de Ben sur le site déployé (les commandants proposés lui
paraissent-ils justes ? les justifications par carte sont-elles lisibles ?
durée réelle, passée de ~43 s à ~65 s sur le faux Scryfall).

Même jour, seconde livraison (non commitée non plus) : contresorts étroits
séparés des vrais (`counterspellKind`), plafond des cartes « sans métier »
jamais vues en tournoi (`hasNoJob`), freins de quota non cumulés et bonus de
quota proportionnel à la qualité (`structureNeed`). Détail et mesures :
README, « Suite du 04/10/2026 ». Après tout changement de `cardRoles` ou de
`qualityFeatures` : relancer `npm run learn-trends` et
`npm run learn-quality -- forge-cards.json` (~3 min).

Même jour, troisième livraison : budget strict en euros pour le Duel
(`src/lib/budget.ts`, `buildWithEuroBudget` dans `competitive-builder.ts`,
champ `budgetEur` de `runCompetitiveBuildCore`, étape 3 du formulaire et
section « Pour quelques euros de plus » dans `CompetitiveBuilder.tsx`).
ATTENTION : testé avec des prix FICTIFS (les données locales n'en ont pas) —
à vérifier par Ben avec les vrais prix Scryfall. Détail : README, « Budget
en euros pour le Duel ».

Au 03/10/2026 (soir) : moteur de construction refondu (tendances apprises
des decks connus, plans de jeu, parties simulées, staples manquants,
chargeur à étapes) — livré sur le Mac, non commité par Ben au moment de
l'écriture. En attente : retour de Ben sur le site déployé (le flux d'étapes
passe-t-il sur Vercel ? durée réelle ? pertinence des plans).

Au 03/10/2026 : Reality Fracture ajoutée (cartes nouvelles, piliers,
4 thèmes de synergie, 7 decks précon, Extensions, Glossaire) — livrée sur le
Mac, non commitée par Ben au moment de l'écriture. Les motifs de piliers
corrigés font monter les scores des decks existants (voir README). En
attente : `npm run fetch-set-cards -- fra frc` sur le Mac pour remplacer les
données Forge par celles de Scryfall, et retour de Ben en usage réel.

Au 25/09/2026 (2e passage) : duos, Commander Spellbook en direct,
autocorrection des noms, script méta Duel — livrés sur le Mac, non commités
par Ben au moment de l'écriture. Avant : constructeur de decks compétitif livré sur le Mac (non
commité par Ben au moment de l'écriture). Détail complet dans la section
README « Constructeur de decks compétitif (25/09/2026) ». En attente :
retour de Ben en usage réel (temps de réponse en production, pertinence
des commandants proposés, orthographe des noms curatés). Le correctif de
performance du 24/09/2026 (ancien moteur) est devenu sans objet : ce moteur
a été remplacé.

Fonctionnalités livrées : navigation précons + recherche, import Arena,
import/export CSV, simulateur complet (swap, annulation, cartes retirées),
recherche manuelle de carte, FR/EN, tableau de bord (score, piliers,
courbe, archétype, tier), Glossaire, Extensions, Super Opti, Duel Commander,
constructeur compétitif.

## 10. Pistes (jamais demandées — ne rien lancer sans Ben)

- Confirmer en réel Commander Spellbook et le script mtgtop8 (retour de Ben).
- Recalibrer les seuils de tier sur des decks réels de Ben.
- Duel : un adversaire simplifié dans les parties simulées ; une note de
  commandant apprise sur les commandants de tournoi ; recalibrer les poids de
  l'indice de solidité quand Ben aura joué quelques decks proposés.
- Appliquer au multijoueur les principes du moteur Duel (qualité, forme,
  lecture du deck) : possible dès qu'une source de decks forts existe.
- Vérifier en réel les requêtes Scryfall du constructeur.
- Données équivalentes au méta Duel pour le multijoueur (cEDH), si une
  source accessible existe.
- Sideboard/companion Arena, sauvegarde serveur (hors scope v1).

## 11. Conventions

- **Commentaires en français**, denses, datés quand ils documentent une
  décision (« 25/09/2026, demande de Ben »), avec le pourquoi.
- **Honnêteté épistémique** : ne jamais présenter comme vérifié ce qui ne
  l'est pas (Scryfall, listes curatées, heuristiques) — ni dans le code, ni
  dans l'UI, ni dans les comptes rendus à Ben. Dire explicitement quand un
  test couvre un cas général mais pas un embranchement précis, ou quand il
  repose sur des données synthétiques.
- **Un signalement de Ben n'implique pas forcément un bug** : lire le code,
  reproduire, puis décider (clarté UI vs vrai bug vs performance).
- **Une seule formule, réutilisée** : pas de logique de score/tier
  parallèle. Exemple : le constructeur calcule le gain de tier avec
  `tierComponentsFromCounts`, la même fonction que le badge.
- **Multijoueur : tier d'abord, score en départage** pour toute
  sélection/tout classement de cartes ou de commandants. **Duel : indice de
  solidité et note du commandant** (04/10/2026, voir §5 et le README). Depuis le
  03/10/2026, entre VARIANTES d'un même deck : palier de tier d'abord, puis
  parties simulées et synergies (voir deck-optimizer.ts).
- **Parties simulées ≠ taux de victoire** : ne jamais présenter l'indice de
  playtest comme une chance de gagner (aucun adversaire dans le simulateur).
- `npx eslint .` + `rm -rf .next && npm run build` avant de livrer ;
  aucun fichier scratch dans le repo (`git status --short`).
- Réponses à Ben : concises, livrer plutôt que décrire.

## 12. Note Cowork

Les instructions générales Cowork de Ben (lire `ABOUT ME/`, livrer dans
`OUTPUTS/`) ne s'appliquent pas telles quelles ici : c'est du code dans un
repo Git que Ben gère lui-même, on livre directement dans le repo (section 6).

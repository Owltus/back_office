# Étape 3 — UI : balance, chambres reportées, garde à la clôture

## Objectif

Rendre visible et actionnable la réconciliation dans le board : une **card
Balance** (« Reste à justifier ») avec un état « OK » quand elle tombe à zéro, un
**marquage des chambres reportées** dans la grille (priorité de l'utilisateur :
bien **voir les bloquées**, du jour comme des jours précédents), et une **garde à
la clôture** qui **avertit sans bloquer** (D5).

## Contexte

Le board (`src/components/rapro/RaproBoard.tsx`) affiche 6 cards `.rapro-stat`
(l.336-368), une grille d'étages de pastilles-boutons (l.428-441, un clic =
`cycle` qui fait défiler le statut), une légende, une zone commentaire jour
(l.461-489), et un header avec clôture/impression. La balance résiduelle est déjà
la card « Bloquées » (`stats.todo`), mais rien ne l'affiche comme indicateur
binaire ni ne garde la clôture. Le patron de garde/coloration est la caisse :
`balanced` (`CaisseBoard.tsx:219-222`).

Décisions actées : la raison n'est **pas** structurée (D1/D2) — une « Bloquée » se
pose par le **cycle au clic** existant (4 statuts inchangés), sans sous-catégorie ;
**aucune ergonomie de saisie à ajouter**. Le commentaire du jour reste **général**.
Cette étape consomme l'étape 1 (`reconcile`/`isReconciled`) et l'étape 2
(`carryOver`, réconciliation élargie).

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx` (modifié)
- `src/styles/rapro.css` (modifié — état visuel « reportée », état « OK » de la card balance)

## Travail à réaliser

### 1. Card Balance (« Reste à faire »)

Afficher `reconcile(...).pending` (sur l'occupation **élargie** occupées ∪
reportées) comme **balance**, avec un état « OK » quand `isReconciled` (0 → vert
discret ; > 0 → accent d'alerte). Décider si elle **remplace** la card « Bloquées »
ou s'y **ajoute** (recommandé : relibeller « Bloquées » en portant l'accent
comptable, pour ne pas multiplier les cards). Les cards existantes
(Nettoyées / Refus / No-show) suffisent au détail — pas de card par raison
(décision D2 : pas de raison structurée). Réutiliser le composant `Stat`
(l.548-573).

### 2. Marquage des chambres reportées dans la grille

Croiser la grille du jour avec l'ensemble `carried` (étape 2). Une pastille
reportée reçoit un **marqueur visuel additif** (liseré / point, pas une couleur de
statut — elle garde sa couleur d'état) — **même si la chambre est inoccupée
aujourd'hui**, elle apparaît car elle reste due. Point d'accroche : le rendu par
chambre (l.422-441) applique une classe via `CELL_STATES[cellState(...)].webClass`
→ ajouter une classe additive `cn('rapro-room', cls, carried.has(room) &&
'is-reportee')`. Une chambre reportée inoccupée doit être **rendue** même si elle
n'est pas dans `occupied` (adapter la boucle de rendu).

### 3. Garde à la clôture (D5 — avertir sans bloquer)

Dans le header / `handleClose` (l.220-224) : si `!isReconciled`, afficher un
**avertissement** clair (« N chambres encore à justifier — précisez au commentaire
si besoin »), **sans désactiver** le bouton. Ne pas casser le verrou existant
`canEditFields`. La clôture reste possible ; le résidu assumé est couvert par le
commentaire général.

## Ordre d'exécution

1. Assembler les `DaySnapshot` de la fenêtre (étape 2) via les queries existantes (clés `['rapro','day',d]`, `['pdj','day',d]`), déjà en cache.
2. Brancher `reconcile` sur l'occupation élargie ; ajouter/relibeller la card Balance.
3. Marquer les pastilles reportées (y compris inoccupées du jour) ; classe CSS additive.
4. Ajouter l'avertissement de clôture (non bloquant).
5. `npx tsc --noEmit`.

## Critère de validation

- La card Balance affiche `balance` et bascule en état « OK » à zéro.
- Une chambre reportée est visuellement distinguable, **même inoccupée** aujourd'hui, et **persiste après la clôture** du jour d'origine (D7).
- Nettoyer/justifier une chambre décrémente la balance en temps réel (optimiste).
- La clôture avertit mais reste possible (D5) ; verrou `canEditFields` intact.
- Robuste au cas « PDJ du jour absent » (`noOccupancy`) sans plantage.
- `npx tsc --noEmit` vert.

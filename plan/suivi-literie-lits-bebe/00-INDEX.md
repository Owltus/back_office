# Plan — Suivi literie anti-allergène et lits parapluie bébé

## Contexte

L'hôtel équipe la plupart de ses chambres en oreillers/couette plume, mais garde
en permanence quelques chambres en literie **synthétique** (allergie aux
plumes), plus un **stock de secours** d'oreillers et de couettes synthétiques
à installer à la demande dans une chambre normalement en plume. Il faut savoir
en permanence quelles chambres ont actuellement de la literie synthétique
installée, suivre le niveau de ce stock, et tracer les mouvements (mise en
place / retour).

Séparément, l'hôtel dispose de lits parapluie bébé (4 actuellement, ce nombre
doit rester **ajustable** sans déploiement) à assigner à des chambres sur la
durée d'un séjour.

Décision produit de l'utilisateur : **une seule page**, en reprenant deux
patterns existants —
- la présentation de `/rapro` (grille des 80 chambres par étage, bandeau de
  commentaire + bouton de clôture en bas de page) pour la partie literie ;
- le planning temps réel de `/parking` (lignes = ressources, colonnes = jours,
  sur une plage de dates) pour la partie lits bébé.

L'exploration (5 agents en parallèle) a confirmé un point important : **rien
de tout cela n'a de précédent direct dans le projet**. Aucune table ne porte
aujourd'hui d'attribut permanent par chambre (`hotel_rooms` serait une
première), aucune gestion de stock n'existe nulle part, et le nombre de
ressources du planning Parking (`SPOTS = 14`) est une constante figée en dur
— pas un nombre ajustable. Les deux pages citées en modèle ne sont donc
réutilisables que pour leur **mise en page et leur infrastructure** (grille de
chambres, souscription temps réel + rattrapage, `CloseSheetDialog`
partagé) : toute la logique métier (statuts de literie, stock, planning lits
bébé) est neuve.

Pour rester dans le principe « une seule page », la partie lits bébé est
proposée en **sous-route** (`/literie/lits-bebe`), accessible par un bouton
dans l'en-tête — même mécanique que le bouton « Analytique » de `/rapro` ou
`/parking` — plutôt qu'en onglets internes.

## Angles à clarifier

- **D1 — Une SEULE page, un seul écran (tranché par l'utilisateur le
  2026-08-17)** : le défaut initial retenait une seule clé de page (`literie`)
  mais DEUX vues (`/literie` pour la grille+stock, `/literie/lits-bebe` pour
  le planning, bascule par bouton). L'utilisateur a explicitement demandé que
  les deux soient mélangés dans la MÊME page, le planning lits bébé sous la
  grille+stock — pas de bouton de bascule, pas de sous-route. Fait : route
  `/literie/lits-bebe` supprimée, `BabyCotBoard` rendu directement en bas de
  `LiterieBoard`. Une seule clé de permission (`literie`) pour l'ensemble,
  inchangé.
- **D2 — La page trace un état, elle ne pilote pas de tâche (recommandé)** :
  aucun mécanisme de tâche assignée (« à faire » / « fait », notification à
  un rôle) n'existe ailleurs dans le projet. La page se contente de refléter
  l'état courant (chambre synthétique ou non, stock, planning) et l'historique
  des mouvements ; l'action de cocher/décocher EST l'action physique déjà
  effectuée, pas une consigne à exécuter plus tard. Si l'hôtel veut au
  contraire un système de tâches à faire, le modèle de données change
  (colonne de statut supplémentaire) — à confirmer avant l'étape 1.
- **D3 — Stock : plancher à zéro, pas de blocage dur (recommandé)** :
  contrainte `check (>= 0)` en base (le compteur ne peut pas devenir négatif
  côté données), mais le bouton « installer » se contente d'un avertissement
  visuel quand le stock est à 0 plutôt que d'un blocage total — un stock
  applicatif peut être temporairement désynchronisé de la réalité physique
  (couette récupérée à la main sans passer par l'écran), et bloquer
  durement gênerait le métier plus que ça ne protège. Étape 2.
- **D4 — Lit bébé = entité libre, pas de lien PMS (recommandé)** : comme les
  réservations du planning Parking, une assignation de lit bébé est saisie à
  la main (chambre + nom optionnel + dates), sans clé étrangère vers une
  réservation PMS — aucune table de réservations n'est disponible en base
  pour un tel lien aujourd'hui (rapro/pdj ne consomment que des imports CSV).
  Étape 4.
- **D5 — Clôture journalière ET commentaire RETIRÉS de la literie (tranché par
  l'utilisateur le 2026-08-17)** : le défaut initial de ce plan reprenait le
  principe « commentaire + bouton de clôture en bas » façon Rapro pour la
  grille literie (feuille du jour `literie_sheets`). L'utilisateur a
  explicitement refusé ce principe une fois la V1 en place : « je veux pas
  voir de notion de clôture de feuille de literie, pas de commentaire non
  plus ». Étape 8 RETIRÉE (voir tableau des phases) ; `LiterieCommentCard.tsx`,
  `lib/literie/editability.ts` et `lib/literie/day.ts` supprimés ;
  `service.ts`/`types.ts` allégés des fonctions/types `*Sheet*`. La table
  `literie_sheets` reste en base (déjà créée en prod à ce stade) mais n'est
  plus consommée par l'app — orpheline, conservée sans action tant que
  l'utilisateur ne demande pas explicitement sa suppression (DROP = opération
  destructrice, confirmation requise). Le planning lits bébé n'a jamais eu de
  notion de clôture (inchangé).
- **D6 — Lits bébé : vraie table de ressources, pas un simple entier
  (recommandé)** : `baby_cots(id, label, active)` plutôt qu'une constante ou
  une colonne `hotel_config`. Permet de nommer chaque lit, d'en désactiver un
  temporairement (en réparation) sans le supprimer, et fait du nombre
  ajustable un simple `count(active)` — cohérent avec un planning à la
  Parking où chaque ligne doit être une ressource identifiable. Étape 4.
- **D7 — Fenêtre de grâce partagée (recommandé)** : une seule constante
  `LITERIE_GRACE_DAYS` (proposée à 2 jours, comme `RAPRO_GRACE_DAYS`) borne
  l'édition des assignations lits bébé au niveau `ecriture` ; `gestion` reste
  toujours illimité. Ne borne plus la feuille literie (retirée, D5). Étapes 5, 9.
- **D8 — Planning lits bébé aligné sur le SYSTÈME COMPLET de Parking (tranché
  par l'utilisateur le 2026-08-17)** : la V1 de l'étape 9 livrait un planning
  volontairement simplifié (formulaire dialog, pas de glisser-déposer, pas de
  redimensionnement, pas d'undo/redo) — jugé suffisant par ce plan vu le faible
  volume (4 ressources). L'utilisateur a demandé explicitement le même système
  que `/parking` : glisser-déposer pour créer/déplacer un bloc, poignées de
  redimensionnement aux bords (arrivée/départ), et undo/redo (Ctrl+Z/Ctrl+Y).
  Étape 9 reprise pour répliquer fidèlement `ParkingBoard.tsx` (interaction
  pointeur, `useParkingHistory`-like) adapté aux lits bébé — le bloc temps réel
  (souscription + fusion par id + rattrapage) déjà construit est conservé tel
  quel, seule l'interaction change.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-hotel-rooms-sql.md](./1-hotel-rooms-sql.md) | Table `hotel_rooms` (état permanent par chambre) + RLS + seed 80 chambres | — | P0 | 2h | statut literie par chambre en base | ⚠ |
| 2 | [2-literie-stock-sql.md](./2-literie-stock-sql.md) | Tables `literie_stock` + `literie_stock_movements` + RLS | 1 | P0 | 2h30 | stock + historique des mouvements en base | ⚠ |
| 3 | [3-literie-sheets-sql.md](./3-literie-sheets-sql.md) | Table `literie_sheets` (commentaire + clôture du jour) + trigger d'estampillage | — | P0 | 1h30 | feuille du jour cloturable en base | ⚠ |
| 4 | [4-baby-cots-sql.md](./4-baby-cots-sql.md) | Tables `baby_cots` + `baby_cot_assignments` + realtime + RLS | — | P0 | 3h | planning lits bébé en base, temps réel actif | ⚠ |
| 5 | [5-permissions-page.md](./5-permissions-page.md) | Clé de page `literie`, `LITERIE_GRACE_DAYS`, `PageGuard` | 1, 2, 3, 4 | P0 | 1h | page déclarée dans le système de permissions | |
| 6 | [6-route-squelette.md](./6-route-squelette.md) | Routes `/literie` + `/literie/lits-bebe`, en-tête, squelette de chargement | 5 | P1 | 1h30 | page accessible, vide mais gardée | |
| 7 | [7-grille-literie.md](./7-grille-literie.md) | Grille des 80 chambres (statut synthétique/plume, action installer/retirer) | 1, 2, 6 | P1 | 4h | grille fonctionnelle, stock décrémenté/incrémenté | |
| ~~8~~ | [8-stock-commentaire-cloture.md](./8-stock-commentaire-cloture.md) | RETIRÉE (D5, 2026-08-17) — commentaire + clôture literie refusés par l'utilisateur | 2, 3, 7 | — | — | — | |
| 9 | [9-planning-lits-bebe.md](./9-planning-lits-bebe.md) | Planning lits bébé — système COMPLET Parking (drag/resize/undo, D8) | 4, 6 | P1 | 6h | planning lits bébé fonctionnel | ⚠ |
| 10 | [10-validation-globale.md](./10-validation-globale.md) | tsc + build + lint + tests + vérification RLS + recette bout en bout | 1-9 | P0 | 2h | chantier vérifié | ⚠ |

## Ordre d'exécution

- **À acter avant l'étape 1** : D2 (trace vs pilote une tâche), D3
  (comportement du stock à zéro), D5 (clôture conservée pour la literie
  seule) — ces trois points figent directement le schéma des étapes 1-3.
- **Sprint 1 (parallélisable)** : étapes 1, 3 et 4 sont indépendantes entre
  elles (tables distinctes, aucune ne dépend d'une autre pour exister).
  L'étape 2 dépend de l'étape 1 (le mouvement de stock référence une
  chambre déjà déclarée dans `hotel_rooms`).
- **Sprint 2** : étape 5 (permissions), une fois les 4 tables posées — la
  clé de page et sa fenêtre de grâce doivent correspondre à ce qui est câblé
  dans les RLS des étapes 1-4.
- **Sprint 3** : étape 6 (route + squelette), puis en parallèle étape 7
  (grille literie) et étape 9 (planning lits bébé) — deux écrans
  indépendants une fois la route en place.
- **Sprint 4** : étape 8 (stock + commentaire + clôture), après l'étape 7
  (vient compléter le même écran).
- **Sprint 5** : étape 10 (validation globale), après tout le reste.
- Premier livrable de valeur : à l'issue de l'étape 7, la grille literie
  reflète et modifie l'état réel des chambres.

## Architecture cible

```
supabase/
├── hotel_rooms.sql               [nouveau]  statut literie synthétique par chambre
├── literie_stock.sql             [nouveau]  compteur + mouvements de stock
├── literie_sheets.sql            [nouveau]  feuille du jour (commentaire + clôture)
├── baby_cots.sql                 [nouveau]  ressources lits bébé (nombre ajustable)
├── baby_cot_assignments.sql      [nouveau]  planning d'assignation + realtime
└── literie_rls.sql               [nouveau]  policies page 'literie' (fichier dédié)

src/lib/permissions/
├── pages.ts                      [modifié]  PageKey + entrée PAGES 'literie'
└── actions.ts                    [modifié]  LITERIE_GRACE_DAYS

src/lib/literie/
├── types.ts                      [nouveau]  DbHotelRoom, LiterieStock, mouvements
├── model.ts                      [nouveau]  constantes, dérivations pures (FLOORS)
├── service.ts                    [nouveau]  accès Supabase (chambres, stock)
└── format.ts                     [nouveau]  formatage affichage (mouvements)

src/lib/baby-cots/
├── types.ts                      [nouveau]  BabyCot, CotAssignment
├── model.ts                      [nouveau]  constantes, hasOverlap
├── service.ts                    [nouveau]  accès Supabase (ressources, assignations)
├── editability.ts                [nouveau]  fenêtre de grâce édition
└── format.ts                     [nouveau]  formatage affichage

src/routes/
├── literie.tsx                   [nouveau]  layout `/literie`
└── literie/index.tsx             [nouveau]  page unique (grille+stock+planning, D1)

src/components/literie/
├── LiterieBoard.tsx               [nouveau]  grille des 80 chambres + stock
├── StockCard.tsx                  [nouveau]  compteur + historique mouvements
└── BabyCotBoard.tsx                [nouveau]  planning lits bébé (temps réel + drag/undo, D8)

src/styles/
└── literie.css                    [nouveau]  styles préfixés .literie-*
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|--------------------|--------------------|
| DB (SQL) | — | `hotel_rooms`, `literie_stock`, `literie_sheets`, `baby_cots`, `baby_cot_assignments`, `literie_rls` |
| Permissions (lib) | `pages.ts`, `actions.ts` | — |
| Métier (lib) | — | `lib/literie/{types,model,service,editability,format}.ts`, `lib/baby-cots/{types,model,service,editability,format}.ts` |
| Routes | — | `routes/literie.tsx`, `routes/literie/index.tsx`, `routes/literie/lits-bebe.tsx` |
| Composants (UI) | — | `LiterieBoard`, `StockCard`, `LiterieCommentCard`, `BabyCotBoard` |
| Styles | `styles.css` (ajout `@import`) | `styles/literie.css` |
| Tests | — | `lib/literie/*.test.ts`, `lib/baby-cots/*.test.ts` |

| **Total** | **~4 modifiés** | **~20 nouveaux** |

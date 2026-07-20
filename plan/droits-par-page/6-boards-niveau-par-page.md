# Étape 6 — Boards : brancher les actions sur le niveau de la page

## Objectif

Remplacer, dans chaque board et chaque service, les dérivations de droit fondées sur le **rôle global** (`role === 'super_utilisateur' || role === 'admin'`, `role === 'admin'`) par le **niveau de l'utilisateur sur LA page courante** (`can(page, 'ecriture')`, `can(page, 'gestion')`). La logique métier des actions ne change pas — seule leur condition d'affichage/exécution change de source.

## Contexte

C'est l'étape la plus étendue (8+ fichiers) mais la plus mécanique : la correspondance est directe et homogène.

| Dérivation actuelle | Devient | Signification |
|---|---|---|
| `canEdit`/`isWriter` = super\|admin | `can('<page>', 'ecriture')` | saisie / import |
| `isAdmin` = admin | `can('<page>', 'gestion')` | suppression, clôture/réouverture, gestion destinataires |
| lecture (implicite) | `can('<page>', 'lecture')` | consultation (déjà garanti par `PageGuard`) |

Chaque board connaît sa page (constante locale, ex. `const PAGE = 'parking'`). Les logiques orthogonales au rôle (fenêtre de grâce `canEditSheet`, bornes de date `businessDay`, verrou `isValidated`) sont **conservées** : on ne remplace que le test de rôle qu'elles combinent.

## Fichier(s) impacté(s)

- `src/components/parking/ParkingBoard.tsx` (`canEdit`, l.177)
- `src/components/pdj/BreakfastBoard.tsx` (`canEdit`/`isAdmin`, l.80-81)
- `src/components/rapro/RaproBoard.tsx` (`isWriter`, l.79 ; transitions d'état)
- `src/components/caisse/CaisseBoard.tsx` (`isWriter`/`editable`, l.273-274)
- `src/components/affiche/AffichageBoard.tsx` (`canEdit`, l.97)
- `src/components/repjour/boards/DashboardBoard.tsx` (`isAdmin`/`canImport`, l.140-141)
- `src/components/repjour/ImportSection.tsx` (`isAdmin`, l.161)
- `src/components/repjour/boards/GestionBoard.tsx` (`readOnly`, l.31 — voir note grade)
- `src/lib/repjour/services/data.ts` (`assertWriteRole`/`WRITE_ROLES`, l.92-110)
- `src/lib/caisse/service.ts` (`canEditSheet`, l.239)

## Travail à réaliser

### 1. Boards « simples » (parking, pdj, affichage)

Exemple parking :
```ts
const PAGE = 'parking'
const { can } = useAuth()
const canEdit = can(PAGE, 'ecriture')     // remplace: role === 'super_utilisateur' || role === 'admin'
const canManage = can(PAGE, 'gestion')    // pour supprimer, etc. (là où isAdmin était utilisé)
```
PDJ : `canEdit = can('pdj','ecriture')`, suppression `can('pdj','gestion')`. Affichage : `canEdit = can('affichage','ecriture')` (création/édition/suppression de modèle).

### 2. RepJour (Dashboard + ImportSection)

```ts
const canImport = can('repjour', 'ecriture')   // import du rapport
const canManage = can('repjour', 'gestion')    // supprimer le jour, gérer les destinataires
```
`ImportSection` reçoit le niveau (ou lit `useAuth().can`) : les règles d'import « Comparison seul » et bornes de date réservées à l'admin passent sur `can('repjour','gestion')`.

### 3. Rapro / Caisse (état + verrou + grâce)

- Rapro : `isWriter → can('rapro','ecriture')` ; réserver la réouverture à `can('rapro','gestion')` si aligné avec l'Étape 2. `canEditFields = can('rapro','ecriture') && !isValidated` (verrou conservé).
- Caisse : `canEditSheet(sheet, level)` — refactorer la signature pour prendre le **niveau de page** au lieu du rôle global. La fenêtre de grâce reste : Écriture pendant 24 h, Gestion sans limite (l'admin ou un « Gestion sur caisse » rouvre hors grâce). `editable = canEditSheet(sheet, pageLevel('caisse'))`.

### 4. Services métier

- `data.ts` : `assertWriteRole` refait aujourd'hui un fetch `profiles.role`. Le remplacer par une vérification du niveau de page passé en argument (évite un aller-retour réseau supplémentaire ; la RLS reste le garde-fou serveur). Décider la page de rattachement des écritures budget/données (`gestion` budgétaire relève du **grade**, cf. `GestionBoard`).
- `caisse/service.ts` : `canEditSheet(sheet, level: PageLevel | null)` — logique de grâce inchangée, test super/admin remplacé par `levelRank(level) >= 2` (+ `= 3` pour hors grâce).

### 5. GestionBoard (cas grade, pas page)

`/gestion` (gestion budgétaire) est hors navbar et reste gouverné par le **grade** : `readOnly = grade !== 'admin'`. On aligne juste la source (`grade` au lieu de `role`), sans l'intégrer au système par page. Réconcilier au passage le décalage actuel (UI admin-only vs `WRITE_ROLES` incluant super) : lecture pour tous, édition pour le grade admin.

## Ordre d'exécution

1. Introduire `const PAGE` + bascule `canEdit`/`canManage` board par board (indépendants entre eux).
2. Migrer les deux services (`data.ts`, `caisse/service.ts`).
3. Retirer les usages résiduels de `role ===` (grep de contrôle) ; ne garder `role`/`grade` que pour `/gestion` et l'affichage.
4. `npx tsc --noEmit` + `pnpm build`.

## Critère de validation

- Un compte « Lecture sur Parking » : aucun menu contextuel, aucun bouton d'écriture ; la page reste consultable.
- Un compte « Écriture sur PDJ » : peut saisir/importer, mais pas supprimer le jour (Gestion).
- Un compte « Gestion sur Caisse » : peut rouvrir une feuille hors grâce ; « Écriture sur Caisse » : bloqué après 24 h.
- Aucune régression des logiques orthogonales (bornes de date, verrou `isValidated`, grâce).
- `grep 'role ===' src/components` ne renvoie plus que `/gestion` et l'affichage du libellé.
- `tsc` + `build` verts.

## Contrôle /borg

Étape critique (touche >5 fichiers, cœur des droits d'action). /borg doit auditer : chaque board utilise la BONNE clé de page (pas de copier-coller `'parking'` sur PDJ) ; aucune action d'écriture n'est restée branchée sur l'ancien `role` (sinon incohérence UI/RLS) ; la fenêtre de grâce caisse et le verrou rapro fonctionnent toujours ; les impressions/PDF restent accessibles en Lecture (elles l'étaient à tous) ; pas de plantage quand `can` renvoie `false` sur un board monté (garde `PageGuard` déjà passée, mais robustesse au changement de droits en séance).

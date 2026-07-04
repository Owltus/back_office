# Étape 6 — Composants transverses partagés

## Objectif

Créer `src/components/shared/` et y factoriser les quatre motifs d'interface dupliqués entre features : avatar utilisateur (×3), bouton « Imprimer / PDF » (×3), canvas pointillé (×3), header de page (ad hoc). Toutes les features consomment ensuite ces composants.

## Fichier(s) impacté(s)

- `src/components/shared/UserAvatar.tsx` (nouveau)
- `src/components/shared/PrintButton.tsx` (nouveau)
- `src/components/shared/EmptyCanvas.tsx` (nouveau)
- `src/components/shared/PageHeader.tsx` (nouveau)
- `src/components/Navbar.tsx` (modification : ×2 avatars remplacés)
- `src/components/UserMenu.tsx` (modification : avatar remplacé)
- `src/components/ComingSoon.tsx` (modification : rebâti sur `EmptyCanvas`)
- `src/components/parking/ParkingBoard.tsx` (modification : état de chargement sur `EmptyCanvas`)
- `src/components/pdj/BreakfastBoard.tsx` (modification : header, dropzone, bouton d'impression)
- `src/components/affiche/AffichageBoard.tsx` (modification : boutons d'impression ×2)

## Travail à réaliser

### 1. `UserAvatar`

Centraliser l'avatar « PL » dupliqué (`Navbar.tsx:110-115`, `:172-177`, `UserMenu.tsx:36-40`) : composant unique portant le fallback et les classes (`bg-primary/15 … text-primary`), avec prop de taille. L'identité (« Pierre-Louis », « PL ») devient une constante unique dans ce fichier, en attendant un vrai profil utilisateur.

### 2. `PrintButton`

Factoriser le bouton « Imprimer / PDF » (`AffichageBoard.tsx:280-288`, `:296-304`, `BreakfastBoard.tsx:367-374`) : icône `Printer`, `aria-label`/`title`, prop `onClick` (les boards gardent le calcul de leur nom de document et appellent `printWithTitle` de l'étape 2).

### 3. `EmptyCanvas`

Factoriser le motif pointillé centré (`ComingSoon.tsx:5`, `ParkingBoard.tsx:356`, `BreakfastBoard.tsx:323`) : conteneur `border-2 border-dashed border-border rounded-2xl` centré, props `minHeight` (variantes 300/340 px observées) et `children`. `ComingSoon` devient un consommateur trivial.

### 4. `PageHeader`

Généraliser le header ad hoc de `BreakfastBoard.tsx:350-376` : props `title`, `meta` (ligne secondaire) et `actions` (zone de droite). Adopté par le PDJ dès cette étape ; les autres boards l'adopteront lorsqu'ils auront un header (pas de refonte forcée de leur mise en page actuelle).

## Ordre d'exécution

1. Créer les quatre composants dans `shared/`.
2. Basculer les consommateurs fichier par fichier (Navbar, UserMenu, ComingSoon, puis les trois boards).
3. Typecheck et revue visuelle de chaque page.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Rendu visuel inchangé sur toutes les pages (avatar, boutons, canvas, header PDJ).
- Recherche textuelle : plus aucune occurrence en dur de `AvatarFallback` hors `UserAvatar`, ni de `border-dashed` hors `EmptyCanvas`, ni de libellé « Imprimer / PDF » hors `PrintButton`.

## Contrôle /borg

Étape critique (10 fichiers touchés, traverse toutes les features). Audit post-exécution :

- Aucune régression visuelle sur les 4 pages actives (Dashboard/ComingSoon, Parking, PDJ, Affichage).
- Les props des nouveaux composants couvrent bien les variantes observées (tailles d'avatar, hauteurs de canvas, versions mobile/desktop du bouton d'impression).
- Pas d'import circulaire introduit entre `shared/` et les features.

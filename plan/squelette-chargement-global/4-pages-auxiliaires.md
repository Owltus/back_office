# Étape 4 — Pages auxiliaires

## Objectif

Remplacer les spinners centrés et les états vides par des squelettes-reflets sur
les pages Profil, Gestion (Budget + Data) et Comptes, pour supprimer le flash
« formulaire/tableau vide → rempli ».

## Contexte

Ces pages n'utilisent pas TanStack Query mais un `loading` local (`useState` +
`useEffect`) — on GARDE ce `loading` (D2) et on remplace seulement le rendu de
chargement :
- `ProfilBoard` : pas de fetch propre ; lit `profile` de `useAuth()` et hydrate le
  state local via `useEffect` → inputs vides, nom `—`, badge de rôle vide, initiales
  `?` au premier frame. Le plus visible.
- `GestionBoard` : coquille à onglets (en-tête + sélecteur stables). `BudgetContent`
  (`loading` initial `true`, spinner `Loader2 py-12`) et `DataContent` (idem) : le
  sélecteur d'années est momentanément vide.
- `ComptesBoard` : `loading` initial `true`, spinner `Loader2 py-12` → liste ou état
  vide ; en-tête (« Comptes » + Ajouter) stable.

## Fichier(s) impacté(s)

- `src/components/repjour/boards/ProfilBoard.tsx`
- `src/components/repjour/boards/GestionBoard.tsx` (si un état de chargement de coquille est utile)
- `src/components/repjour/boards/BudgetContent.tsx`
- `src/components/repjour/boards/DataContent.tsx`
- `src/components/repjour/boards/ComptesBoard.tsx`

## Travail à réaliser

### 1. Profil

Éviter le flash de formulaire vide : soit gater le rendu du formulaire sur la
présence de `profile` (`profileLoading`) avec un `SkeletonForm` (identité + inputs)
tant que `profile` n'est pas là, soit initialiser les inputs directement depuis
`profile` (pas au tick suivant). Conserver le comportement d'édition/sauvegarde.

### 2. Budget / Data (Gestion)

Remplacer le spinner `Loader2 py-12` par un `SkeletonTable` (cols alignées sur la
grille budget / le tableau data) pendant `loading`. L'en-tête et le sélecteur
d'onglets restent hors branche. Pour le sélecteur d'années vide au départ : le
laisser désactivé/placeholder pendant le chargement plutôt que vide et cliquable.

### 3. Comptes

Remplacer le spinner `Loader2 py-12` par un `SkeletonList` (avatars + lignes)
pendant `loading` ; conserver l'état vide « Aucun compte » pour le cas réellement
vide (distinct du chargement). En-tête stable.

## Ordre d'exécution

1. Profil (le plus visible).
2. Budget, Data.
3. Comptes.

## Critère de validation

- `npx tsc --noEmit` ; `pnpm lint`.
- Profil : plus de formulaire vide / `?` / nom `—` au chargement (squelette ou
  hydratation immédiate).
- Gestion / Comptes : plus de spinner centré — un squelette-reflet du tableau/liste,
  puis les données, sans saut de silhouette.
- Les états VIDES réels (aucun compte, aucune donnée) restent distincts du
  chargement.

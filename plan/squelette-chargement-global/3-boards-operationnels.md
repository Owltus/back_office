# Étape 3 — Boards opérationnels

## Objectif

Brancher un squelette-reflet sur les boards opérationnels qui n'en ont pas, en
appliquant la règle « en-tête toujours rendu + un `loading` unique bascule le
contenu en squelette », pour supprimer les flashs vide→données et les sauts.

## Contexte (par board, d'après la reconnaissance)

- `DashboardBoard` : DÉJÀ conforme (`BoardSkeleton` piloté par `reportPending`).
  Amélioration mineure possible : étendre le gate pour couvrir budget/forecast et
  éviter un flash « état vide → projection » sur un jour sans rapport.
- `CaisseBoard` : gate `ready` DÉJÀ défini (`:286`), en-tête déjà rendu tout de
  suite. Le corps (tableau montants, dénominations) démarre en `emptyInput` →
  valeurs vides → hydratées. Conversion la plus simple.
- `RaproBoard` : en-tête déjà immédiat. Gate composite recommandé
  (`pdjRows === undefined || sheet === undefined`) ; sinon grille/valeurs par défaut
  affichées puis corrigées (staggered). Squelette « cartes + grille étages ».
- `BreakfastBoard` : PAS de gate ; en-tête conditionné à `(hasData || canNavigate)`.
  Il faut (a) capturer `isPending` (retirer le défaut `data = []` qui masque
  `undefined`), (b) SORTIR le `PageHeader` de la condition pour le rendre tout de
  suite, (c) squelette « stats + tableaux par étage ».
- `ParkingBoard` : early-return « Chargement du planning… » (texte, sans en-tête).
  Gate réel = `!startDate || rows === undefined || visibleDays === 0`. Remplacer
  l'early-return par un squelette INCLUANT l'en-tête (grille placeholder). Attention
  au realtime (`staleTime: 0`, patch optimiste) : ne pas dériver l'affichage du cache
  après montage (cf. CLAUDE.md).
- `AffichageBoard` : cas à part (ni en-tête ni tableau). Option légère : masquer /
  mettre en squelette l'aperçu tant que `templates === undefined` (flash
  pristine→modèle au tout premier chargement ; le store persiste ensuite).

## Fichier(s) impacté(s)

- `src/components/caisse/CaisseBoard.tsx`
- `src/components/rapro/RaproBoard.tsx`
- `src/components/pdj/BreakfastBoard.tsx`
- `src/components/parking/ParkingBoard.tsx`
- `src/components/affiche/AffichageBoard.tsx`
- `src/components/repjour/boards/DashboardBoard.tsx` (amélioration mineure du gate, optionnel)

## Travail à réaliser

### 1. Caisse (pilote — le plus simple)

Utiliser `ready` : `{!ready ? <SkeletonCardsRow/> + <SkeletonTable .../> : <corps>}`,
en gardant l'en-tête (déjà immédiat) hors de la branche. Composer un squelette qui
reflète le tableau de montants + la grille de dénominations (via `SkeletonTable` +
`SkeletonBlock`).

### 2. Rapro

Définir `loading = pdjRows === undefined || sheet === undefined`. Entre l'en-tête
(déjà immédiat) et le contenu : `{loading ? <squelette 6 cartes + grille> : <corps>}`.
Ne plus afficher de valeurs par défaut « en dur » pendant le chargement.

### 3. PDJ

Capturer `isPending` de la query `day` (retirer `data = []`, utiliser `data ?? []`).
Sortir le `PageHeader` de `(hasData || canNavigate)` pour le rendre toujours.
`{loading ? <squelette stats + tableaux étages> : hasData ? <contenu> : <EmptyCanvas>}`.
Bien distinguer « chargement » (squelette) de « vide » (dropzone/EmptyCanvas).

### 4. Parking

Remplacer l'early-return `!startDate` par un rendu qui inclut l'en-tête + un
squelette de grille, et étendre le gate à `!startDate || rows === undefined ||
visibleDays === 0`. Préserver le realtime et les mises à jour optimistes (le
squelette ne concerne que l'état AVANT premier affichage).

### 5. Affichage (léger)

Tant que `templates === undefined`, mettre l'aperçu central en `SkeletonBlock` (les
deux `aside` de contrôle restent, structure déjà stable). Optionnel : pré-remplir le
store pour éviter le pop pristine→modèle.

## Ordre d'exécution

1. Caisse (pilote), vérifier le rendu.
2. Rapro, PDJ, Parking.
3. Affichage (léger). Dashboard : ajuster le gate seulement si le flash vide→projection
   est confirmé gênant.

## Critère de validation

- `npx tsc --noEmit` ; `pnpm lint`.
- Chaque board rend son en-tête immédiatement puis un squelette-reflet pendant le
  chargement, sans flash vide→données ni saut de layout.
- PDJ/Parking : plus d'écran « dropzone »/« Chargement… » affiché à la place du
  contenu pendant le fetch initial (squelette à la place).
- Realtime et saisies optimistes (parking, caisse) intacts.

## Contrôle /borg

Étape critique (> 5 fichiers, boards de production). `/borg` indisponible → audit
manuel : (a) distinction stricte `undefined` (chargement) vs `[]`/vide (aucune
donnée) — pas de faux « vide » pendant le fetch ; (b) realtime/optimiste non altérés
(parking `staleTime:0`, patch local ligne à ligne) ; (c) aucun gate qui bloquerait
l'affichage au-delà du chargement (pas de squelette persistant) ; (d) en-têtes
rendus hors branche loading partout.

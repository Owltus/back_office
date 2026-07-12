# Plan — Squelette de chargement généralisé (toute l'app)

## Contexte

L'utilisateur voit « des choses étranges » pendant le chargement des pages :
flashs d'écran vide, sauts de layout, spinners qui se remplacent, valeurs par
défaut affichées puis corrigées. Le pattern « bien pensé » existe déjà sur les 10
pages analytique (`AnalytiqueShell` : `PageHeader` toujours rendu hors de la branche
`loading`, colonne flex bornée, squelette reflet 1:1 des classes de layout, piloté
par `isPending` + `staleTime` 60 s → zéro saut, pas de flash en revisite). L'objectif
est de généraliser cette logique à TOUTE l'app, en plus de ce qui est fait.

La reconnaissance (4 agents) a localisé les causes, par ordre d'impact ressenti :

1. Couche app/auth (la plus visible) : le `<main key={pathname}>` avec
   `animate-in fade-in-0 duration-300` REJOUE le fondu depuis l'opacité 0 à CHAQUE
   navigation (remontage sur `key`) → flash d'écran vide entre deux pages ; le
   spinner plein écran nu au boot ; un second spinner `GuardSpinner` mal aligné
   (première visite / cache vide) ; l'identité Navbar (avatar `?`, nom, item admin)
   qui apparaît après coup ; le formulaire de login qui flashe pour un utilisateur
   déjà connecté.
2. Boards opérationnels sans squelette : `CaisseBoard` (valeurs vides → hydratées ;
   gate `ready` déjà prêt), `RaproBoard` (grille/valeurs par défaut → corrigées ;
   gate composite), `BreakfastBoard` (flash dropzone/vide + en-tête qui apparaît
   après), `ParkingBoard` (early-return « Chargement… » texte → planning d'un bloc,
   grille vide une frame). `DashboardBoard` est déjà conforme (`BoardSkeleton`) ;
   `AffichageBoard` est un cas à part (ni en-tête ni tableau).
3. Pages auxiliaires : `ProfilBoard` (formulaire vide qui se remplit),
   `GestionBoard`/`BudgetContent`/`DataContent` et `ComptesBoard` (spinner centré →
   tableau/liste), en `useState`+`useEffect` manuels (pas TanStack Query).

Contrainte forte à préserver (CLAUDE.md) : **auth non bloquante** — ne JAMAIS
remettre un `await fetchProfile` avant de lever `loading` ; le SSR/premier rendu
client doivent rester identiques (pas de divergence d'hydratation) ; réglages
TanStack Query inchangés (`staleTime` 60 s garantit l'absence de flash en revisite).

## Angles à clarifier

- **D1 — Squelette au niveau ROUTE vs au niveau COMPOSANT (divergence des agents).**
  L'agent « socle » recommande de NE PAS ajouter de `pendingComponent` routeur tant
  que le fetch reste dans les composants (les routes n'ont pas de `loader`, le
  pending ne s'afficherait quasi jamais). L'agent « app/auth » le suggère comme
  fallback de navigation. **Option A retenue (recommandée)** : rester au niveau
  composant/layout (squelette dans le Shell de page, piloté par `isPending`) +
  traiter la transition de navigation au niveau app (D3). Option B : introduire un
  `defaultPendingComponent` routeur — écarté car sans `loader` il ne se déclenche
  pas.
- **D2 — Pages auxiliaires en `useState`+`useEffect` (Gestion, Comptes).**
  **Option A retenue (recommandée)** : garder le `loading` local existant et
  remplacer seulement le spinner centré par un squelette-reflet (léger, faible
  risque). Option B : migrer ces pages vers TanStack Query pour un état de
  chargement homogène — plus propre mais chantier séparé, non retenu ici.
- **D3 — Transition de navigation (`animate-in fade-in-0` + `key={pathname}`).**
  C'est le plus fort levier contre le « flash entre deux pages ». **Option A
  retenue (recommandée)** : neutraliser le rejeu du fondu à chaque nav (ne jouer le
  fondu qu'au premier montage, ou retirer le fade-from-0 qui part d'un écran
  transparent), sans casser l'entrée initiale. C'est un changement de comportement
  global VISIBLE (à valider à l'œil).
- **D4 — Périmètre / ordre.** Le plus gros du ressenti vient de la couche app/auth
  (D3 + spinner→squelette). **Recommandation** : traiter le socle puis l'app/auth
  EN PREMIER, puis évaluer si les « choses étranges » sont déjà résolues avant
  d'investir dans tous les boards et pages auxiliaires. On garde néanmoins le plan
  complet.
- **D5 — `/rodin` et `/borg` indisponibles.** Remise en question assurée ci-dessus ;
  audits des étapes critiques faits manuellement (`tsc`/`lint`/`build` + parcours
  visuel avec throttling réseau + `/verify`).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-socle-squelettes.md](./1-socle-squelettes.md) | Socle | — | P0 | 1h30 | Primitives de squelette composables (cartes, tableau, formulaire, liste) |  |
| 2 | [2-couche-app-auth.md](./2-couche-app-auth.md) | App / Auth | 1 | P0 | 2h30 | Boot en squelette, fondu de nav lissé, spinners alignés, Navbar/login sans flash | ⚠ |
| 3 | [3-boards-operationnels.md](./3-boards-operationnels.md) | Boards | 1 | P1 | 3h | Caisse, Rapro, PDJ, Parking (+ Affichage léger) branchés en squelette | ⚠ |
| 4 | [4-pages-auxiliaires.md](./4-pages-auxiliaires.md) | Auxiliaires | 1 | P1 | 2h | Profil, Gestion, Comptes en squelette (fin des spinners centrés) |  |
| 5 | [5-validation.md](./5-validation.md) | Validation | 1,2,3,4 | P1 | 1h | tsc + build + parcours de chargement throttlé, zéro flash/saut | ⚠ |

## Ordre d'exécution

- Étape 1 (socle) d'abord : primitives réutilisables, aucune page ne change encore.
- Étape 2 (app/auth) ensuite — le plus fort levier : lisser le boot et les
  transitions. À évaluer à l'œil AVANT d'enchaîner (cf. D4) : si l'essentiel du
  ressenti disparaît, les étapes 3-4 restent utiles mais moins urgentes.
- Étapes 3 et 4 : boards opérationnels puis pages auxiliaires, parallélisables entre
  elles (fichiers disjoints) une fois le socle figé.
- Étape 5 : validation globale, parcours de chargement throttlé sur toutes les pages.

## Architecture cible

```
src/components/
├── shared/
│   └── skeleton/                       ← NOUVEAU kit composable (sur ui/skeleton)
│       ├── SkeletonCardsRow.tsx        ← rangée de N cartes de synthèse
│       ├── SkeletonTable.tsx           ← tableau borné (en-tête + lignes), cols param
│       ├── SkeletonForm.tsx            ← carte de formulaire (labels + champs)
│       ├── SkeletonList.tsx            ← liste de lignes (comptes)
│       └── SkeletonBlock.tsx           ← bloc générique (aperçu, grille)
├── analytique/AnalytiqueSkeleton.tsx   ← peut consommer le kit (refactor optionnel)
├── repjour/BoardSkeleton.tsx           ← aligné sur la colonne bornée (dashboard)
└── auth/AppAuthGate.tsx                ← boot = squelette de layout, fondu de nav lissé
```

Règle générale appliquée partout (le geste anti-« chose étrange ») :
1. le conteneur de page + l'en-tête sont rendus IMMÉDIATEMENT (hors branche loading) ;
2. un `loading`/`isPending` unique bascule zone de contenu → squelette-reflet
   (mêmes classes de layout que le contenu, dans la même colonne bornée) ;
3. pas de valeur par défaut affichée « en dur » qui serait corrigée après coup
   (distinguer `undefined` = chargement de `[]`/vide) ;
4. pas de fondu qui rejoue à chaque navigation depuis un écran transparent.

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Socle | `analytique/AnalytiqueSkeleton.tsx` (optionnel), `repjour/BoardSkeleton.tsx` | `shared/skeleton/SkeletonCardsRow.tsx`, `SkeletonTable.tsx`, `SkeletonForm.tsx`, `SkeletonList.tsx`, `SkeletonBlock.tsx` |
| App / Auth | `components/auth/AppAuthGate.tsx`, `components/repjour/ProtectedRoute.tsx`, `components/Navbar.tsx`, `components/shared/UserAvatar.tsx`, `routes/login.tsx` (+ `router.tsx` si besoin) | — |
| Boards | `caisse/CaisseBoard.tsx`, `rapro/RaproBoard.tsx`, `pdj/BreakfastBoard.tsx`, `parking/ParkingBoard.tsx`, `affiche/AffichageBoard.tsx` | — |
| Auxiliaires | `boards/ProfilBoard.tsx`, `boards/GestionBoard.tsx`, `boards/BudgetContent.tsx`, `boards/DataContent.tsx`, `boards/ComptesBoard.tsx` | — |
| **Total** | **~16 modifiés** | **~5 nouveaux** |

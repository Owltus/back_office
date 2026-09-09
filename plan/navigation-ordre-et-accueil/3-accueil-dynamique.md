# Étape 3 — Page d'accueil dynamique

## Objectif

Remplacer les quatre cibles `/repjour` codées en dur par la page d'accueil du
compte, sans introduire de boucle de redirection, d'écran blanc ni de saut
visible.

## Contexte

C'est l'étape délicate du chantier, et elle solde une dette : le plan
`droits-par-page`, étape 5, prévoyait déjà ce branchement. Il n'a jamais été
fait, et un compte n'ayant droit qu'à Parking subit aujourd'hui un double saut
à chaque connexion.

Les quatre cibles :

| Fichier | Ligne | Nature |
|---|---|---|
| `src/routes/index.tsx` | 7 | `beforeLoad` de la racine |
| `src/routes/login.tsx` | 28 | `beforeLoad`, session déjà ouverte |
| `src/routes/login.tsx` | 46 | `useEffect`, après connexion |
| `src/components/Navbar.tsx` | 166 | logo, `aria-label="Accueil"` |

La difficulté tient à un fait d'architecture : `beforeLoad` est un hook du
routeur, exécuté hors de React. Le contexte du routeur (`src/lib/query.ts:36`)
ne contient que `queryClient` ; `AuthProvider` est monté dans le
`shellComponent` (`src/routes/__root.tsx:86`). La préférence n'est donc pas
lisible par le contexte au moment du `beforeLoad`.

Deux voies. La première lit le cache `localStorage` du profil
(`bo.auth.profile.v1`, `AuthContext.tsx:86`) directement dans le `beforeLoad` :
lecture synchrone, instantanée, sans aller-retour réseau, avec repli sur
l'ordre du registre si le cache est froid. La seconde transforme `/` en
composant qui rend `<Navigate>` une fois les droits résolus : plus orthodoxe,
mais elle coûte une frame de squelette et **oblige à recopier exactement** la
garde de `PageGuard.tsx:94`.

La première voie suppose que le `beforeLoad` s'exécute côté client. C'est la
divergence signalée dans l'index : à confirmer avant d'écrire le code.

## Fichier(s) impacté(s)

- `src/routes/index.tsx` (modifié)
- `src/routes/login.tsx` (modifié)
- `src/components/Navbar.tsx` (modifié)
- `src/components/auth/PageGuard.tsx` (modifié)
- `src/components/auth/AuthContext.tsx` (modifié)

## Travail à réaliser

### 1. Confirmer le contexte d'exécution

Vérifier, en lançant l'application, si le `beforeLoad` de `/` s'exécute côté
client. Éléments à l'appui : `vite.config.ts` active `spa: { enabled: true }`,
`vercel.json` réécrit toutes les URL vers `_shell.html`, et `dist/client` ne
contient aucune page prérendue. Le comportement peut différer en `pnpm dev` —
c'est le comportement de production qui tranche.

### 2. Exposer la préférence

`AuthContext` expose déjà `can` et `pageLevel` : y ajouter l'ordre effectif et
la page d'accueil, dérivés des fonctions de l'étape 2. Ne rien changer à la
mécanique de résilience : single-flight, cadence de trois minutes avec
soixante secondes minimum, aucune relecture sur `TOKEN_REFRESHED`, et une
erreur réseau qui n'efface jamais le cache local.

### 3. Aligner `PageGuard`

`PageGuard.tsx:96` redirige aujourd'hui vers `firstAllowedPage`. Il doit
utiliser **la même source d'ordre** que la racine. Deux notions d'accueil qui
divergent est le scénario qui produirait un aller-retour entre deux pages.

Conserver intacte la garde de la ligne 94 —
`profileLoading || permissionsLoading || (backendDown && !permsResolved)` —
qui affiche un squelette plutôt que de conclure « aucun accès ». Toute
redirection dynamique doit se taire dans les mêmes conditions.

### 4. Les quatre cibles

Brancher les quatre sur `homeRoute`. Le logo garde son `aria-label="Accueil"`.
Repli sur `/repjour` uniquement si aucune préférence ni aucun droit n'est
connu — jamais une redirection « nulle part ».

### 5. Le préchargement

`defaultPreload: 'intent'` exécute le `beforeLoad` au survol d'un lien, et
`defaultPreloadStaleTime` vaut 60 s (`src/router.tsx:21`). Une cible d'accueil
calculée peut donc être servie périmée jusqu'à une minute après un changement.
Vérifier le comportement d'une redirection levée pendant un préchargement dans
la version de `@tanstack/react-router` du projet. Le seul lien vers `/` est
`ProtectedRoute.tsx:46`.

## Ordre d'exécution

1. Confirmer le point 1 avant d'écrire quoi que ce soit.
2. Exposer la préférence dans `AuthContext`.
3. Aligner `PageGuard` sur la même source.
4. Brancher les quatre cibles.
5. Vérifier le préchargement.

## Critère de validation

- Le compte n'ayant que `parking:lecture` arrive sur `/parking` **en un seul
  saut**, sans passer par `/repjour` ni voir de squelette intermédiaire.
- Un compte sans préférence se comporte exactement comme avant.
- Une préférence désignant une page non autorisée mène à la première page
  autorisée, en deux sauts au plus, jamais en boucle.
- Backend en panne, poste sans cache : squelette et bandeau, aucune
  redirection hasardeuse, aucun « Aucun accès » abusif.
- Rechargement direct d'une URL de page : comportement inchangé.
- `npx tsc --noEmit`, `pnpm test` et `pnpm build` au vert.

## Contrôle qualité (revue)

Étape critique (chemin de démarrage de l'application, risque de boucle). Revue
manuelle : (1) vérifier qu'aucun chemin de repli ne relit la préférence
stockée — c'est la condition qui interdit la boucle ; (2) rejouer à la main
les quatre parcours (racine, connexion avec session, connexion sans session,
logo) sur un compte à une seule page ; (3) couper le réseau et confirmer que
la racine affiche un squelette au lieu de rediriger ; (4) confirmer qu'aucun
`/repjour` en dur ne subsiste — `grep -rn "'/repjour'" src/` ne doit plus
renvoyer que le registre `pages.ts`.

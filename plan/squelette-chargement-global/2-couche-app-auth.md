# Étape 2 — Couche app / auth (cause racine)

## Objectif

Lisser le premier rendu et les transitions de navigation — le plus fort levier
contre les « choses étranges » : remplacer le spinner de boot nu par un squelette
de layout, neutraliser le fondu qui rejoue à chaque navigation, aligner les
spinners de garde, et supprimer les flashs d'identité Navbar et du formulaire de
login. Sans jamais violer la règle « auth non bloquante ».

## Contexte

- `AppAuthGate.tsx:33-39` : tant que la session n'est pas résolue → `Loader2` plein
  écran `h-dvh` (rendu aussi en SSR, seul first-paint). 
- `AppAuthGate.tsx:50-53` : `<main key={pathname} … motion-safe:animate-in fade-in-0
  duration-300>` — le remontage sur `key={pathname}` REJOUE le fondu depuis
  l'opacité 0 à chaque navigation → flash d'écran vide entre deux pages (cause #1
  ressentie).
- `ProtectedRoute.tsx:11-17` : `GuardSpinner` (`flex-1 py-24`) à une position
  différente du spinner global → saut spinner→spinner→contenu (première visite /
  cache vide).
- `Navbar.tsx:39-40` + `UserAvatar.tsx` : nom/avatar/rôle vides tant que `profile`
  n'est pas résolu → flash `?` → initiales, « Utilisateur » → nom, item admin qui
  apparaît après coup (surtout premier accès / cache vidé).
- `login.tsx:28-32` : un utilisateur déjà connecté voit le formulaire de login
  s'afficher avant la redirection `useEffect`.

Contrainte (CLAUDE.md) : `loading` (session) reste le SEUL verrou bloquant, levé par
`getSession()` (localStorage), jamais par un `await` profil. Le SSR et le premier
rendu client doivent rester identiques (pas de divergence d'hydratation).

## Fichier(s) impacté(s)

- `src/components/auth/AppAuthGate.tsx` (boot squelette + transition de nav)
- `src/components/repjour/ProtectedRoute.tsx` (garde de rôle : squelette au lieu du spinner)
- `src/components/Navbar.tsx` (placeholder d'identité)
- `src/components/shared/UserAvatar.tsx` (fallback d'avatar sans flash `?`)
- `src/routes/login.tsx` (redirection des connectés hors rendu)
- `src/router.tsx` (uniquement si une option de transition est nécessaire)

## Travail à réaliser

### 1. Boot : squelette de layout au lieu du spinner nu

Dans `AppAuthGate` (branche `loading`), rendre déjà la structure : une barre Navbar
figée (silhouette) + une zone de contenu en squelette générique (`SkeletonBlock` /
un squelette de page neutre), au lieu du `Loader2 h-dvh`. Comme le SSR ne rend que
cet état, il définit le first-paint : viser une silhouette proche du chrome réel
pour que l'arrivée du contenu ne déplace rien. Garder un rendu IDENTIQUE côté SSR et
premier rendu client (pas de branchement sur des valeurs non déterministes).

### 2. Transition de navigation : ne plus rejouer le fondu depuis l'opacité 0

Neutraliser le rejeu à chaque nav (`AppAuthGate.tsx:51-52`). Pistes (choisir la plus
sûre) :
- retirer `key={pathname}` (le remontage force le rejeu et un écran transparent) et
  laisser TanStack Router gérer le contenu ; OU
- ne jouer l'`animate-in fade-in-0` qu'au PREMIER montage (pas à chaque `pathname`) ;
  OU
- remplacer par une transition plus douce (pas de départ à opacité 0).

Objectif : plus de « vide transparent » entre deux pages. Vérifier que la
restauration de scroll et le préchargement (`defaultPreload:'intent'`) restent OK.

### 3. Garde de rôle : squelette aligné au lieu du second spinner

`ProtectedRoute` `GuardSpinner` → rendre un squelette dans le `PageContainer` (via le
socle) qui réserve la place du board, plutôt qu'un spinner recentré. But : supprimer
le saut spinner plein écran → spinner `py-24` → contenu. Conserver la logique de
garde (redirections, `NoRoleNotice`).

### 4. Navbar : identité sans flash

`Navbar.tsx` + `UserAvatar.tsx` : afficher un placeholder discret (petit squelette
d'avatar + de nom) tant que `profile`/`user` ne sont pas résolus, au lieu d'un `?`
et d'une chaîne vide. Pour l'habitué (cache localStorage présent), rien ne change
(identité immédiate). L'item admin conditionné au rôle reste géré par le rôle (ne
pas le faire clignoter : ne l'afficher qu'une fois le rôle connu, sans placeholder
trompeur).

### 5. Login : pas de flash pour un utilisateur déjà connecté

Déplacer la redirection des connectés hors du rendu de `LoginPage`
(`login.tsx:28-32`) vers un `beforeLoad` de la route `/login` (rediriger vers
`ROLE_HOME`/`/repjour` si une session existe), pour ne plus peindre le formulaire.
Vérifier l'interaction avec le court-circuit `AppAuthGate.tsx:26` (login toujours
accessible sans chrome).

## Ordre d'exécution

1. Étape 1 disponible (socle).
2. Boot squelette (1) puis transition de nav (2) — les deux plus impactants.
3. Garde de rôle (3), Navbar (4), login (5).

## Critère de validation

- `npx tsc --noEmit` ; `pnpm lint`.
- Boot : plus de spinner nu — une silhouette de layout, identique SSR ↔ client.
- Navigation entre pages : plus de flash d'écran vide transparent.
- Première visite : plus de double spinner mal aligné (squelette réservant la place).
- Navbar : plus de `?`/nom vide qui pop pour un utilisateur avec cache ; placeholder
  discret sinon.
- `/login` en étant connecté : redirection sans flash du formulaire.

## Contrôle /borg

Étape critique (couche auth/app sensible, > 5 fichiers). `/borg` indisponible →
audit manuel : (a) `loading` toujours levé par la SEULE session, aucun `await`
profil réintroduit avant (CLAUDE.md) ; (b) aucun avertissement de divergence
d'hydratation (SSR = premier rendu client) ; (c) aucune régression de garde
(routes protégées, `NoRoleNotice`, redirections de rôle) ; (d) préchargement et
restauration de scroll intacts après le changement de transition.

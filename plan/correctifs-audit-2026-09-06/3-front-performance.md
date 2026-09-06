# Étape 3 — Front : boot auth, purge, clés, RepJour

## Objectif

Brancher le front sur `get_my_access()`, ne lancer la purge PDJ qu'une fois
par jour hôtelier et par poste, fusionner les deux clés de cache identiques,
retirer le code mort `fetchRange`, retirer l'abonnement Realtime mort du
RepJour et le remplacer par un refetch au retour d'onglet avec écart minimal.

## Fichier(s) impacté(s)

- `src/lib/auth/access.ts` (nouveau) : `fetchMyAccess()`, types `MyAccess`.
- `src/components/auth/AuthContext.tsx` (modifié) : `resolveProfile` +
  `resolvePermissions` → `resolveAccess(userId)` ; `refreshProfile` /
  `refreshPermissions` alignés ; caches localStorage et flags inchangés.
- `src/lib/pdj/service.ts` (modifié) : verrou module-scope
  `lastPurgeDay` ; `fetchRange` retiré.
- `src/components/pdj/BreakfastBoard.tsx` (modifié) : appel purge gaté ;
  clé `['pdj','analytics','all-history']` partagée avec `PdjAnalytiqueMoisBoard`.
- `src/components/pdj/PdjAnalytiqueBoard.tsx`,
  `src/components/pdj/PdjAnalytiqueMoisBoard.tsx` (modifiés : commentaires).
- `src/components/repjour/boards/DashboardBoard.tsx` (modifié) : canal
  retiré, listeners visibilité/focus/online avec écart 30 s.
- `src/components/repjour/DayCrossSummary.tsx` (modifié : commentaire).

## Travail à réaliser

### 1. `fetchMyAccess`

Trois issues distinctes : `error` → propagée ; `data == null` → traité comme
erreur (jamais comme éjection) ; `data.profile === null` → éjection ;
`permissions` toujours tableau.

### 2. AuthContext

Un seul single-flight par `userId`, `backendHealth.shouldSkip()` en tête,
écriture des deux caches dans la même passe, `profileLoading` et
`permissionsLoading` levés ensemble, chemin `!profile → clearProfile + signOut`
intact, erreur réseau ne touche rien.

### 3. Purge une fois par jour

```ts
let lastPurgeDay: string | null = null
export function shouldPurgeToday(day: string): boolean
```
Testé dans `service.test.ts` (fonction pure). L'appel dans `BreakfastBoard`
reste dans un effet mais n'écrit que si le jour a changé.

### 4. RepJour

Retirer `supabase.channel('repjour-daily-reports')` ; ajouter
`visibilitychange`/`focus`/`online` → `scheduleInvalidate()` gaté par un
écart minimal de 30 s (patron `ParkingBoard`).

## Ordre d'exécution

1. `access.ts` + test, puis `AuthContext`.
2. `service.ts` + `BreakfastBoard`.
3. `DashboardBoard` + commentaires.
4. `npx tsc --noEmit`, `pnpm test`, `pnpm lint`, `pnpm build`.

## Critère de validation

- tsc, tests (suite existante + nouveaux), lint, build verts.
- Navigateur : ouverture de l'app = 1 appel `get_my_access` (onglet Réseau),
  0 appel `profiles`/`user_page_permissions` au boot.
- Deux visites successives de `/pdj` = 1 seule requête UPDATE de purge.

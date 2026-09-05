# Étape 2 — AuthContext et PageGuard : dedup, cache indestructible, panne différente de révocation

## Objectif

Supprimer la tempête de lectures `profiles` / `user_page_permissions`
(déduplication, cadence maîtrisée, disjoncteur), faire qu'une panne ne vide
JAMAIS le cache local et ne se présente JAMAIS comme une révocation de
droits, et garder l'utilisateur connecté quand seul le backend est en panne.
Le chemin d'éjection d'un compte supprimé reste STRICTEMENT identique.

## Contexte

`src/components/auth/AuthContext.tsx` :

- `resolveProfile` 154-191 et `resolvePermissions` 195-221 : aucun garde
  contre un appel déjà en vol ; sur `error`, no-op silencieux (170-173,
  208-211) mais `setPermissionsLoading(false)` sans droits, ce qui fait
  tomber `PageGuard.tsx:83-91` sur `NoAccessNotice`.
- `onAuthStateChange` 262-275 relance les deux lectures à CHAQUE événement,
  y compris `TOKEN_REFRESHED` (toutes les ~55 min) et `INITIAL_SESSION`
  (doublon du `getSession` de 239).
- `revalidate` 281-290 : `getSession()` (prend le verrou auth-js) + deux
  lectures en fire-and-forget ; déclenché par `setInterval` 120 s (296) ET
  `visibilitychange` (292-295), qui s'ajoute au listener interne d'auth-js.
- `refreshProfile` 344-355 et `refreshPermissions` 356-369 ne testent pas
  `error` : une panne écrit `null` / `{}` dans le cache local.
- **Anti-escalade à préserver** (175-184) : `if (!data) { clearProfile();
  await supabase.auth.signOut() }` est la seule chose qui déconnecte un
  compte supprimé avant l'expiration du JWT. Tout court-circuit intervient
  AVANT l'appel réseau ou sur le chemin `error`, jamais sur `!data`.

Ce matin, `getSession()` a pendu plus d'une minute (rafraîchissement d'un
jeton expiré contre un backend en 504) puis a renvoyé une session nulle :
l'utilisateur a été renvoyé sur `/login` alors que sa session était valide.

## Fichier(s) impacté(s)

- `src/components/auth/AuthContext.tsx` (modifié)
- `src/components/auth/PageGuard.tsx` (modifié)
- `src/routes/login.tsx` (modifié)

## Travail à réaliser

### 1. Déduplication et disjoncteur dans `resolveProfile` / `resolvePermissions`

- Deux `createSingleFlight<void>()` (un par lecture) créés dans l'effet
  principal ; clé = `userId`. Deux déclencheurs simultanés (tick + retour
  d'onglet + événement d'auth) produisent UNE requête.
- En tête de chaque fonction : `if (backendHealth.shouldSkip()) return` —
  AVANT l'appel réseau, en laissant `profileLoading` / `permissionsLoading`
  tels quels. C'est le chemin « erreur » : rien n'est écrit, rien n'est
  effacé.
- Sur `error` : mémoriser `lastAuthReadError` dans un state exposé, ne
  toucher ni au profil ni aux permissions ni au cache. Ne PAS passer
  `permissionsLoading` à `false` si aucune permission n'a jamais été résolue
  pour cet utilisateur (nouveau `permsResolvedRef`, vrai après un succès ou
  quand le cache local était présent au boot) : le guard doit continuer à
  afficher un squelette, pas un refus.
- Le chemin `!data` (175-184) est INCHANGÉ, à l'octet près.

### 2. Cadence de revalidation

- `revalidate` (281-290) n'appelle plus `getSession()` : l'identifiant
  vient d'un `userIdRef` tenu à jour par `setUser`. Plus de prise de verrou
  auth-js pour une simple relecture.
- Un seul point d'entrée `scheduleRevalidate(reason)` avec :
  - `MIN_GAP_MS = 60_000` entre deux revalidations (horodatage
    `lastRevalidateAt`) ;
  - exécution seulement si `document.visibilityState === 'visible'` ;
  - intervalle porté à `180_000` (3 min). Le `visibilitychange` applicatif
    est conservé mais passe par le même garde-fou (60 s).
- `onAuthStateChange` : ne relit profil et permissions que sur `SIGNED_IN`,
  `USER_UPDATED` et `SIGNED_OUT` (nettoyage). `TOKEN_REFRESHED` met à jour
  `user` sans relecture ; `INITIAL_SESSION` est ignoré (déjà couvert par
  `getSession` à 239).

### 3. `refreshProfile` / `refreshPermissions` (344-369)

Tester `error` : sur erreur, `throw` (les appelants de `/profil` et
`/comptes` affichent déjà leurs propres messages) et ne rien écrire. Le
cache local n'est effacé QUE par `signOut` et par l'éjection (`!data`).

### 4. Session conservée pendant une panne

Dans le `getSession().then(...)` de 239-257, ajouter la branche `error` :

```ts
supabase.auth.getSession().then(({ data: { session }, error }) => {
  if (!active) return
  if (error && isOutageError(error) && !session) {
    // Panne backend pendant le rafraîchissement : la session persistée est
    // probablement encore valide. On garde l'utilisateur connecté (lecture
    // de la session stockée par auth-js) ; l'auto-refresh d'auth-js
    // retentera et onAuthStateChange remettra tout d'aplomb au retour.
    const stored = readPersistedSessionUser()
    if (stored) { setUser(stored); setLoading(false); return }
  }
  … inchangé …
})
```

`readPersistedSessionUser()` lit `localStorage['sb-<ref>-auth-token']`
(clé dérivée de `VITE_SUPABASE_URL`, même dérivation qu'auth-js :
`sb-` + sous-domaine + `-auth-token`) et renvoie `session.user` ou `null`,
dans un `try/catch`. Un jeton RÉVOQUÉ (400 `invalid_grant`,
`refresh_token_not_found`) n'est pas une panne : la branche ne s'applique
pas, l'utilisateur est renvoyé sur `/login` comme aujourd'hui.

### 5. Nouvel état exposé par le contexte

Ajouter à `AuthContextType` : `backendDown: boolean` (dérivé d'un
`useSyncExternalStore` sur `backendHealth.subscribe`) et
`authReadError: string | null`. Consommés par `PageGuard` (ci-dessous) et
par le bandeau de l'étape 3.

### 6. `PageGuard.tsx:83-91` : panne différente de « aucun accès »

```ts
if (!atLeast(permissions, grade, page, min)) {
  // Droits pas encore résolus, OU backend en panne sans jamais avoir eu les
  // droits : squelette (le bandeau de l'étape 3 explique pourquoi). Jamais
  // « Aucune page accessible » sur une simple panne.
  if (profileLoading || permissionsLoading || (backendDown && !permsResolved))
    return <GuardSkeleton pathname={pathname} />
  …
}
```

`permsResolved` est exposé par le contexte (booléen dérivé de
`permsResolvedRef`).

### 7. `src/routes/login.tsx:20` : `beforeLoad` borné

`await Promise.race([supabase.auth.getSession(), timeout(2_000)])` : si la
session ne se résout pas en 2 s (verrou auth-js occupé par un refresh en
panne), on rend le formulaire de connexion au lieu de bloquer la navigation.
Le `useEffect` 40-44 redirige de toute façon dès que `user` existe.

## Ordre d'exécution

1. Points 1, 3, 5 (sans changement de comportement visible).
2. Point 2 (cadence), vérifier en dev dans l'onglet Réseau : au plus deux
   requêtes profil/droits par 3 min et par onglet, une seule au retour
   d'onglet, aucune sur `TOKEN_REFRESHED`.
3. Point 4 puis 6 puis 7.
4. `npx tsc --noEmit`.

## Critère de validation

- `npx tsc --noEmit` vert ; `npx vitest run` vert (aucun test ne couvre ces
  composants : la validation est manuelle, ci-dessous).
- Onglet Réseau, fonctionnement normal : au retour d'onglet, UNE requête
  `profiles` et UNE `user_page_permissions` maximum ; rien pendant 60 s
  ensuite ; `TOKEN_REFRESHED` (forcer via `supabase.auth.refreshSession()`
  en console) ne déclenche aucune lecture.
- Panne simulée (blocage `*.supabase.co`) sur un navigateur SANS cache local
  (`localStorage.clear()` puis connexion, puis blocage) : squelette, jamais
  « Aucune page accessible ».
- Panne simulée avec jeton expiré (modifier `expires_at` dans le
  `localStorage` puis blocage) : l'utilisateur reste sur sa page, pas de
  redirection `/login` ; au déblocage, `TOKEN_REFRESHED` arrive et les
  droits se relisent.
- Éjection : depuis `/comptes` dans un autre navigateur, supprimer un compte
  de test connecté ; dans les 3 min (onglet visible), la session est fermée
  et renvoyée sur `/login`. Comportement identique à avant.
- Cache local : après une panne, `localStorage['bo.auth.profile.v1']` et
  `['bo.auth.perms.v1']` sont intacts.

## Contrôle qualité (revue)

Étape marquée critique : elle touche le chemin d'anti-escalade et le
comportement de session. `/borg` n'étant pas installé, revue manuelle
ciblée :

- (1) le bloc `if (!data) { clearProfile(); await supabase.auth.signOut() }`
  est inchangé et toujours atteint après un `select` réussi renvoyant 0
  ligne ;
- (2) aucune branche ne transforme un `error` en `!data` ni l'inverse ;
- (3) `readPersistedSessionUser` n'est utilisé QUE sur `isOutageError` et
  n'écrit jamais dans le `localStorage` ;
- (4) `loading` est toujours levé sans `await` réseau (règle CLAUDE.md) ;
- (5) un compte dont le profil existe mais sans permissions (état légitime)
  voit toujours `NoAccessNotice` quand le backend est joignable.

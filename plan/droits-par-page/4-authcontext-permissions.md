# Étape 4 — AuthContext : charger et exposer les permissions

## Objectif

Faire de l'`AuthContext` la source unique du couple (grade, permissions par page) pour toute l'app, en respectant scrupuleusement l'**auth non bloquante** : la carte de permissions se charge comme le profil (cache localStorage + hydratation optimiste + signal de chargement séparé), jamais en `await` bloquant avant de lever `loading`.

## Contexte

`AuthContext` expose aujourd'hui `role` (dérivé de `profile?.role`). On ajoute `grade` (le `role` réduit à `admin`/`utilisateur`) et `permissions` (la carte `PagePermissions`), plus des helpers prêts à l'emploi (`can`, `levelOf`) qui injectent grade + permissions. La contrainte CLAUDE.md est explicite : « Ne JAMAIS remettre un `await fetchProfile` bloquant avant de lever `loading` ». La carte de permissions suit donc **exactement** le modèle de `profileLoading` : clé de cache versionnée, lecture optimiste au boot, résolution réseau en arrière-plan, signal `permissionsLoading` distinct.

## Fichier(s) impacté(s)

- `src/components/auth/AuthContext.tsx` (modification : chargement + exposition des permissions)

## Travail à réaliser

### 1. Cache localStorage sœur du profil

Sur le modèle de `PROFILE_CACHE_KEY = 'bo.auth.profile.v1'` :

```ts
const PERMS_CACHE_KEY = 'bo.auth.perms.v1'
// readCachedPerms / writeCachedPerms : mêmes try/catch silencieux que le profil
```

### 2. Résolution en arrière-plan

Charger les permissions dans le même flux que `resolveProfile` (après session), sans bloquer `loading` :

```ts
async function resolvePermissions(userId: string) {
  const { data, error } = await supabase
    .from('user_page_permissions')
    .select('page, level')
    .eq('user_id', userId)
  if (error) return                      // aléa réseau → on garde le cache, pas d'éjection
  const map: PagePermissions = {}
  for (const row of data ?? []) map[row.page as PageKey] = row.level as PageLevel
  setPermissions(map)
  writeCachedPerms(userId, map)
}
```

- Hydratation optimiste : `permissions` initialisé depuis `readCachedPerms` au boot (rôle et droits disponibles sans réseau).
- Signal `permissionsLoading` distinct de `profileLoading`.
- Revalidation : brancher `resolvePermissions` sur les mêmes déclencheurs que le profil (`onAuthStateChange`, `visibilitychange`, intervalle 120 s) pour propager en séance un changement de droits fait par l'admin.
- **Ne pas** déclencher `signOut` si la requête renvoie 0 permission (0 ligne = utilisateur sans droit, pas compte supprimé — distinct de la détection profil absent).

### 3. Grade dérivé + helpers exposés

```ts
const grade: Grade = profile?.role === 'admin' ? 'admin' : 'utilisateur'

// helpers injectant grade + permissions (les boards n'auront qu'à passer page/niveau)
const can = (page: PageKey, min: PageLevel) => atLeast(permissions, grade, page, min)
const pageLevel = (page: PageKey) => levelOf(permissions, grade, page)
```

Ajouter `grade`, `permissions`, `permissionsLoading`, `can`, `pageLevel`, `refreshPermissions` à `AuthContextType` et à la valeur du provider. `role` reste exposé le temps de la migration (retiré en fin de chantier une fois tous les boards migrés).

### 4. Bump de version de cache

Comme le cache profil est déjà en `.v1`, la nouvelle clé perms démarre en `.v1` ; si la forme du profil change, bumper les deux (invalidation propre).

## Ordre d'exécution

1. Ajouter les helpers de cache perms.
2. Ajouter `resolvePermissions` + états `permissions` / `permissionsLoading`.
3. Câbler sur les déclencheurs existants (boot, authStateChange, visibilitychange, intervalle).
4. Étendre `AuthContextType` + valeur du provider (`grade`, `permissions`, `can`, `pageLevel`, `permissionsLoading`, `refreshPermissions`).

## Critère de validation

- `npx tsc --noEmit` vert ; `pnpm build` vert.
- Au boot avec cache présent : grade + permissions disponibles immédiatement, sans attendre le réseau (mesurer : pas de régression du temps au premier rendu).
- `loading` (session) n'attend jamais `resolvePermissions`.
- Un changement de droits par l'admin se propage au bout d'un cycle de revalidation (retour d'onglet ou 120 s) sans reconnexion.
- Réseau en échec : l'utilisateur garde ses droits en cache, aucune éjection.

## Contrôle /borg

Étape critique (touche le cœur de l'auth, risque de régression de perf et d'éjection). /borg doit auditer : `loading` est bien levé indépendamment de `resolvePermissions` (pas de `await` bloquant) ; le cas 0 permission ne déclenche PAS `signOut` (à distinguer du cas profil absent qui, lui, éjecte) ; le rendu SSR reste `null`-safe (permissions vides côté serveur, pas de divergence d'hydratation avec `BootSkeleton`) ; la clé de cache est bien versionnée et par `userId` (pas de fuite de droits d'un compte à l'autre sur un poste partagé).

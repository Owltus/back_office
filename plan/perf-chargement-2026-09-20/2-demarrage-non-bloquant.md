# Étape 2 — Démarrage : borner l'attente du jeton, corriger les réessais

## Objectif

Supprimer le pire cas de **40 secondes d'écran de squelette** au démarrage et celui
de **87 secondes** sur une requête de page, sans toucher au comportement de sécurité
dans le cas courant.

## Contexte

C'est l'étape qui explique le mot « parfois » de la demande initiale.

**Le commentaire du code est faux.** `AuthContext.tsx:142-144` affirme que
`getSession` « lit le `localStorage` : c'est quasi instantané → l'app s'affiche sans
attendre le réseau ». La lecture d'`auth-js` installé
(`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2526-2554`) montre
autre chose :

```js
const hasExpired = currentSession.expires_at * 1000 - Date.now() < EXPIRY_MARGIN_MS
if (!hasExpired) { /* ...rend la session locale... */ }
const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token)
```

`EXPIRY_MARGIN_MS` vaut 90 s (`lib/constants.js:6,9,13`) et le JWT Supabase vit
1 h. **Toute ouverture de l'app plus d'une heure après la dernière activité passe
donc par un rafraîchissement réseau bloquant**, avant `setLoading(false)`
(`AuthContext.tsx:320-322, 339`) — soit chaque premier accès de la journée, chaque
retour de pause, chaque onglet laissé ouvert la nuit.

**Le timeout se multiplie.** `lib/supabase.ts:35,49` applique
`REQUEST_TIMEOUT_MS = 20_000` à **toutes** les requêtes via `global.fetch`, y
compris celles de GoTrue. Or `_refreshAccessToken` retente tant que
`Date.now() + nextBackOff - startedAt < 30_000` : une première tentative de 20 s
laisse passer la condition, une seconde la fait échouer. **Plafond ≈ 40 s.**

**Effet d'entraînement.** `supabase-js`
(`node_modules/@supabase/supabase-js/dist/index.mjs:806-812`) fait
`await this.auth.getSession()` dans `_getAccessToken`, donc avant **chaque**
`.from()` et `.rpc()`. Tant que le rafraîchissement n'est pas rendu, toutes les
données de la page sont derrière lui.

**Les réessais ne font pas ce que le commentaire annonce.** `lib/query.ts:30` :

```ts
retry: (count, err) => (isOutageError(err) ? count < 3 : count < 1),
```

`count` est le nombre de réessais **déjà effectués** : `count < 3` en autorise
trois, soit **quatre tentatives**. Le commentaire des lignes 18-19 en annonce
trois. Pire cas réel : `4 × 20 s + ~7 s de temporisation ≈ 87 s` avant qu'une
erreur ne s'affiche.

Dernier point, à ne pas casser : si le rafraîchissement échoue, `_getAccessToken`
retombe sur la clé anonyme, la RLS refuse, et la page se remplit de vides plutôt
que d'un message clair — avec un `REFRESH_FAILURE_COOLDOWN_MS` de 60 s qui fige
cet état. Toute solution doit conduire à l'éjection explicite, jamais au silence.

## Fichier(s) impacté(s)

- `src/lib/supabase.ts` (modifié : un timeout distinct pour l'authentification)
- `src/lib/query.ts` (modifié : réessais alignés sur l'intention)
- `src/components/auth/AuthContext.tsx` (modifié : attente d'authentification bornée)

## Travail à réaliser

### 1. Un timeout court pour l'authentification — ÉCARTÉ à l'exécution

*Décision du 2026-09-20, en cours d'exécution.* L'idée était d'appliquer un
timeout de 3 s aux seuls appels `/auth/v1/` dans le `global.fetch` de
`lib/supabase.ts`. **Elle est dangereuse et n'a pas été retenue.**

Couper le `fetch` à 3 s ne se contente pas d'écourter l'attente : il fait
**échouer** un renouvellement de jeton qui aurait abouti en 5 s sur un réseau
lent mais fonctionnel. `getSession()` rend alors une session nulle,
`_getAccessToken` retombe sur la clé anonyme, la RLS refuse tout, et la page se
remplit de vides pendant les 60 s de `REFRESH_FAILURE_COOLDOWN_MS`. On
échangerait une attente visible contre une panne silencieuse.

Le point 3 ci-dessous atteint le même objectif sans ce risque : on borne
**l'attente de l'affichage**, pas la requête. Le renouvellement garde ses 20 s
et se termine tranquillement en arrière-plan.

### 2. Aligner les réessais sur ce que dit le commentaire

```ts
// Une PANNE est réessayée trois fois au total (1 s, 1-2 s, 1-4 s) ; une erreur
// métier une seule fois. `count` est le nombre de réessais DÉJÀ effectués, donc
// `count < 2` donne bien trois tentatives — pas quatre.
retry: (count, err) => (isOutageError(err) ? count < 2 : count < 1),
```

Avec le timeout de données inchangé à 20 s, le pire cas passe de ~87 s à ~67 s ;
combiné au point 3, la panne est de toute façon détectée par le disjoncteur bien
avant.

### 3. Borner l'attente d'authentification au démarrage

Dans `AuthContext.tsx`, autour de l'appel `getSession()` de la ligne 339 : courir
`getSession()` contre une temporisation, et si elle gagne, lever `loading` avec ce
que le stockage local sait déjà, en laissant la promesse se terminer.

Le point délicat : **il ne faut pas lever `loading` si aucune session n'existe
localement**, sinon on affiche l'app à quelqu'un qui n'est pas connecté. Le motif
existe déjà dans le projet — `routes/login.tsx:23-31` fait exactement cette course
à 2 s.

```ts
/** Le premier affichage ne doit pas dépendre du réseau. Si GoTrue met plus de
 *  trois secondes à renouveler le jeton, on affiche à partir de la session déjà
 *  en mémoire locale et le renouvellement se poursuit derrière. Une session
 *  absente ou invalide conduit toujours à l'éjection : on ne fait qu'avancer le
 *  premier rendu, on ne relâche aucune vérification. */
```

Au retour du `getSession()` lent, si la session est finalement `null`, il faut
passer par le chemin d'éjection existant — ne pas l'inventer, le réutiliser.

### 4. Vérifier que le chemin d'éjection reste intact

Relire `AuthContext.tsx` autour de `applyUser` et `resolveAll`, ainsi que
`lib/auth/access.ts` : la règle du projet est que **seul `profile === null` éjecte**,
et qu'une réponse vide pour cause de réseau n'éjecte jamais. Aucune modification de
cette étape ne doit la déplacer.

## Ordre d'exécution

1. `src/lib/query.ts` — corriger `count < 3` en `count < 2` et le commentaire.
2. `src/lib/supabase.ts` — séparer les deux timeouts.
3. `src/components/auth/AuthContext.tsx` — borner l'attente, corriger le
   commentaire mensonger des lignes 142-144.
4. `npx tsc --noEmit`
5. `pnpm test`
6. `pnpm lint`
7. `pnpm build`

## Critère de validation

- Ouverture de l'app après plus d'une heure d'inactivité : le contenu apparaît en
  **moins de 3 s** même si `/auth/v1/token` met plus longtemps (observable dans
  l'onglet Réseau : la page est peinte avant la fin de l'appel).
- Déconnexion forcée côté serveur (suppression de la session dans le tableau de
  bord Supabase) : l'app éjecte toujours vers `/login`, jamais d'écran de données
  vides.
- Une coupure réseau simulée (DevTools, blocage de `*.supabase.co`) produit le
  bandeau de panne, pas un renvoi vers `/login`, et **au plus trois tentatives**
  par requête — vérifiable au compteur de l'onglet Réseau.
- `AuthContext.tsx:142-144` ne prétend plus que `getSession` est local.

## Contrôle qualité (revue)

`/borg` n'étant pas installé, revue manuelle ciblée après exécution :

1. **Le chemin d'éjection n'a pas bougé** : `profile === null` éjecte, une réponse
   vide pour cause de réseau n'éjecte pas, et rien ne renvoie vers `/login` sur une
   erreur réseau.
2. **Le cache local n'est jamais effacé par une erreur réseau** (règle du
   2026-09-05), y compris sur le nouveau chemin de temporisation.
3. **Aucune relecture n'a été ajoutée sur `TOKEN_REFRESHED`** — c'est une
   interdiction explicite du projet, et le nouveau code touche précisément cette
   zone.
4. **Le single-flight de `resolveAccess` tient toujours** : deux montages
   rapprochés ne doivent produire qu'un seul `get_my_access()`.
5. Relire que `AUTH_TIMEOUT_MS` ne s'applique bien qu'à `/auth/v1/` et pas à
   `/rest/v1/` — une erreur de test d'URL couperait toutes les lectures à 3 s.

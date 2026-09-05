# Étape 1 — Socle de résilience client (timeout, disjoncteur, backoff)

## Objectif

Donner à TOUTE requête Supabase (PostgREST, GoTrue, Storage) un timeout
borné, et fournir un module pur et testé qui sait dire « le backend est
tombé », espacer les tentatives en backoff exponentiel avec jitter, et
garantir qu'une même lecture n'est jamais deux fois en vol. Rien de visible
pour l'utilisateur à cette étape : c'est la fondation des étapes 2 à 6.

## Contexte

`src/lib/supabase.ts:26-43` crée le client avec les seules options `auth`.
Aucun `global.fetch`, donc aucun timeout : sous 522 Cloudflare la promesse
pend ~100 s (observé ce matin : `AuthRetryableFetchError: HTTP 504` après
plus d'une minute). `src/lib/query.ts:16-25` règle `retry: 1` sans
`retryDelay` ni distinction entre erreur métier (400, 403 : inutile de
réessayer) et panne (5xx, timeout : réessayer en s'espaçant).

Le module est pur (pas de React, pas de Supabase) pour être testable avec
vitest tel que configuré (pas d'environnement jsdom : `vite.config.ts` n'en
déclare aucun).

## Fichier(s) impacté(s)

- `src/lib/backendHealth.ts` (nouveau)
- `src/lib/backendHealth.test.ts` (nouveau)
- `src/lib/supabase.ts` (modifié)
- `src/lib/query.ts` (modifié)

## Travail à réaliser

### 1. Module pur `src/lib/backendHealth.ts`

Un petit disjoncteur observable, sans dépendance :

```ts
export type BackendStatus = 'up' | 'down'

export interface BackendHealthState {
  status: BackendStatus
  /** Échecs consécutifs classés « panne » (5xx, timeout, réseau). */
  failures: number
  /** Prochaine tentative autorisée (ms epoch), null si `up`. */
  nextRetryAt: number | null
  lastError: string | null
}

/** Backoff exponentiel plein-jitter : base 1 s, plafond 30 s. */
export function backoffMs(failures: number, random = Math.random): number

/** 5xx, 52x/544 Cloudflare, AbortError (timeout), TypeError fetch. */
export function isOutageError(err: unknown): boolean
export function isOutageStatus(status: number): boolean

export function createBackendHealth(now = () => Date.now()) {
  return {
    getState(): BackendHealthState,
    subscribe(listener: (s: BackendHealthState) => void): () => void,
    reportSuccess(): void,           // status up, failures 0
    reportFailure(err: unknown): void, // failures+1, nextRetryAt = now + backoff
    /** Vrai tant que `nextRetryAt` est dans le futur : les lectures
     *  NON critiques s'abstiennent (elles retenteront à l'échéance). */
    shouldSkip(): boolean,
    /** Réouverture manuelle (bouton Réessayer) : nextRetryAt = now. */
    retryNow(): void,
  }
}

/** Instance partagée de l'application. */
export const backendHealth = createBackendHealth()

/** Une seule exécution en vol par clé ; les appelants concurrents
 *  reçoivent la même promesse. */
export function createSingleFlight<T>() {
  const inFlight = new Map<string, Promise<T>>()
  return (key: string, run: () => Promise<T>): Promise<T> => { … }
}
```

Règles :

- **Ouverture** dès le premier échec de type panne (`failures >= 1`), avec
  `nextRetryAt = now + backoffMs(failures)`. Un succès quelconque referme.
- Un 4xx n'est PAS une panne : `reportSuccess()` (le backend a répondu).
- Le plafond de 30 s garantit que l'app resonde le backend au plus toutes les
  30 s par onglet, jamais moins d'une seconde.
- `subscribe` renvoie une fonction de désabonnement ; les listeners sont
  appelés de façon synchrone à chaque changement d'état.

### 2. Tests `src/lib/backendHealth.test.ts`

Avec `now` injecté (pas de timers réels) :

- `backoffMs` : croissant en moyenne, borné par 30 000, jamais négatif, jitter
  effectif (deux tirages différents avec `random` contrôlé).
- `isOutageError` : vrai pour `{ status: 503 }`, `{ status: 522 }`,
  `DOMException AbortError`, `TypeError('Failed to fetch')` ; faux pour
  `{ status: 403 }`, `{ code: '23505' }` (PostgREST), `null`.
- Séquence échec, échec, succès : `failures` 1, 2, 0 ; `shouldSkip()` vrai
  entre deux, faux après succès ; `retryNow()` remet `shouldSkip()` à faux
  sans toucher `failures`.
- `createSingleFlight` : deux appels concurrents même clé = une seule
  exécution ; clé libérée après résolution ET après rejet.

### 3. `src/lib/supabase.ts` : `global.fetch` avec timeout et observation

```ts
import { backendHealth, isOutageStatus } from '#/lib/backendHealth.ts'

/** Délai maximal d'une requête vers Supabase. Au-delà, la promesse est
 *  rejetée (AbortError) : plus jamais une attente de ~100 s sous 522. Doit
 *  rester SUPÉRIEUR au tick d'auto-refresh d'auth-js (30 s) pour ne pas
 *  couper un refresh sain sur réseau lent. */
const REQUEST_TIMEOUT_MS = 20_000

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  // Respecter un signal fourni par l'appelant (TanStack Query en passe un).
  init?.signal?.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const res = await fetch(input, { ...init, signal: controller.signal })
    if (isOutageStatus(res.status)) backendHealth.reportFailure(res)
    else backendHealth.reportSuccess()
    return res
  } catch (err) {
    backendHealth.reportFailure(err)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export const supabase = createClient(url, key, {
  auth: { … inchangé … },
  global: { fetch: fetchWithTimeout },
})
```

Points de vigilance :

- auth-js classe un `fetch` qui rejette en `AuthRetryableFetchError`
  (`@supabase/auth-js/dist/module/lib/fetch.js`, fonction `_request`) : le
  refresh continue donc de retenter selon sa propre logique (tick 30 s,
  cooldown 60 s). Ne rien ajouter côté auth.
- `reportSuccess()` sur 2xx/4xx : un 401/403 prouve que le backend répond.
- Ne PAS appeler `reportFailure` sur un `AbortError` provoqué par le signal
  de l'APPELANT (annulation TanStack au démontage) : tester
  `init?.signal?.aborted` avant de classer l'erreur.
- Pas de `timeout` sur les WebSockets Realtime (hors `fetch`).

### 4. `src/lib/query.ts` : retry selon la nature de l'erreur

```ts
import { backoffMs, isOutageError } from '#/lib/backendHealth.ts'

defaultOptions: {
  queries: {
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    // Erreur métier (RLS, 4xx) : un seul réessai comme avant. Panne : trois
    // réessais espacés (1 s, 2 s, 4 s avec jitter), puis l'erreur remonte et
    // le disjoncteur (backendHealth) prend le relais.
    retry: (count, err) => (isOutageError(err) ? count < 3 : count < 1),
    retryDelay: (count) => backoffMs(count),
  },
}
```

`networkMode` reste `'online'` (défaut) : hors ligne, les requêtes se
mettent en pause au lieu d'échouer, ce qui est le comportement voulu.

## Ordre d'exécution

1. Écrire `backendHealth.ts` puis ses tests, `npx vitest run src/lib/backendHealth.test.ts`.
2. Brancher `supabase.ts`, vérifier en dev que la connexion et une page
   fonctionnent à l'identique (aucune différence attendue).
3. Modifier `query.ts`.
4. `npx tsc --noEmit`, `npx vitest run`.

## Critère de validation

- `npx vitest run` : tous verts, dont les nouveaux tests du disjoncteur.
- `npx tsc --noEmit` : vert.
- En dev, DevTools onglet Réseau, bloquer `*.supabase.co` (Block request
  URL) : une requête PostgREST échoue en moins de 21 s (et non ~100 s) ;
  `backendHealth.getState().status` passe à `down` (exposer temporairement
  sur `window` en dev si besoin, retirer avant commit).
- Aucun changement visible en fonctionnement normal.

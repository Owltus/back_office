/*
 * Disjoncteur backend — module PUR (ni React, ni Supabase), testable.
 *
 * Pourquoi : le 2026-09-05 la base Supabase a été saturée ~1h30. Chaque échec
 * relançait immédiatement un rafraîchissement de jeton + deux lectures de
 * droits, par onglet, sans espacement : l'application a empêché la base de se
 * relever et n'a rien montré à l'utilisateur. Ce module fournit les trois
 * amortisseurs classiques :
 *
 *   - un ÉTAT partagé « up / down » observable (bandeau, gardes) ;
 *   - un BACKOFF exponentiel avec jitter (1 s → 30 s) qui espace les tentatives ;
 *   - un SINGLE-FLIGHT : une même lecture n'est jamais deux fois en vol.
 *
 * Seules les erreurs de type PANNE ouvrent le disjoncteur (5xx, 52x Cloudflare,
 * timeout, réseau). Un 4xx prouve que le backend répond : c'est un succès pour
 * le disjoncteur, l'erreur métier remonte normalement à l'appelant.
 */

export type BackendStatus = 'up' | 'down'

export interface BackendHealthState {
  status: BackendStatus
  /** Échecs consécutifs classés « panne ». */
  failures: number
  /** Prochaine tentative autorisée (ms epoch), null quand `up`. */
  nextRetryAt: number | null
  /** Dernière erreur de panne, message court, null quand `up`. */
  lastError: string | null
}

/** Base du backoff (premier délai) et plafond : jamais moins d'une seconde
 *  entre deux tentatives, jamais plus de 30 s sans resonder le backend. */
export const BACKOFF_BASE_MS = 1_000
export const BACKOFF_MAX_MS = 30_000

/**
 * Backoff exponentiel « plein jitter » (AWS) : tirage uniforme dans
 * [base, min(max, base·2^failures)]. `failures` = nombre d'échecs déjà subis
 * (0 → entre 1 s et 1 s, 1 → 1 à 2 s, 2 → 1 à 4 s, … 5+ → 1 à 30 s).
 */
export function backoffMs(failures: number, random: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures))
  const r = Math.min(1, Math.max(0, random()))
  return Math.round(BACKOFF_BASE_MS + r * (exp - BACKOFF_BASE_MS))
}

/** 5xx (dont 502/503/504) et codes Cloudflare 52x / 544 = backend injoignable. */
export function isOutageStatus(status: number): boolean {
  return status >= 500 && status <= 599
}

/**
 * Une erreur est-elle une PANNE (et non une erreur métier) ?
 *   - `Response` ou objet porteur d'un `status` 5xx ;
 *   - AbortError (timeout du wrapper fetch) ;
 *   - TypeError levé par `fetch` (DNS, connexion refusée, hors ligne) ;
 *   - erreurs auth-js « AuthRetryableFetchError » (status 0 ou 5xx).
 * Tout le reste (PostgrestError avec `code`, 4xx, null…) = non.
 */
export function isOutageError(err: unknown): boolean {
  if (err === null || err === undefined) return false
  if (typeof err === 'object') {
    const o = err as { status?: unknown; name?: unknown; message?: unknown; code?: unknown }
    if (typeof o.status === 'number') {
      return isOutageStatus(o.status) || (o.status === 0 && o.name === 'AuthRetryableFetchError')
    }
    if (o.name === 'AbortError' || o.name === 'TimeoutError') return true
    if (o.name === 'AuthRetryableFetchError') return true
    if (err instanceof TypeError) return true
    if (typeof o.message === 'string' && /failed to fetch|networkerror|load failed/i.test(o.message)) {
      return true
    }
  }
  return false
}

/** Message court d'une erreur de panne, pour le bandeau. */
function outageMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const o = err as { status?: unknown; name?: unknown }
    if (typeof o.status === 'number' && o.status > 0) return `HTTP ${o.status}`
    if (o.name === 'AbortError' || o.name === 'TimeoutError') return 'délai dépassé'
  }
  return 'réseau'
}

export interface BackendHealth {
  getState(): BackendHealthState
  subscribe(listener: (state: BackendHealthState) => void): () => void
  /** Le backend a répondu (2xx ou 4xx) : disjoncteur refermé. */
  reportSuccess(): void
  /** Échec : ne compte QUE s'il s'agit d'une panne (`isOutageError`). */
  reportFailure(err: unknown): void
  /** Vrai tant que la prochaine tentative n'est pas due : les lectures NON
   *  critiques s'abstiennent et retenteront à l'échéance. */
  shouldSkip(): boolean
  /** Réouverture manuelle (bouton Réessayer) : la prochaine tentative est
   *  due immédiatement, sans remettre `failures` à zéro. */
  retryNow(): void
}

export function createBackendHealth(
  now: () => number = () => Date.now(),
  random: () => number = Math.random,
): BackendHealth {
  let state: BackendHealthState = { status: 'up', failures: 0, nextRetryAt: null, lastError: null }
  const listeners = new Set<(s: BackendHealthState) => void>()

  const emit = (next: BackendHealthState) => {
    state = next
    for (const l of listeners) l(state)
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    reportSuccess() {
      if (state.status === 'up' && state.failures === 0) return
      emit({ status: 'up', failures: 0, nextRetryAt: null, lastError: null })
    },
    reportFailure(err) {
      if (!isOutageError(err)) return
      const failures = state.failures + 1
      emit({
        status: 'down',
        failures,
        nextRetryAt: now() + backoffMs(failures - 1, random),
        lastError: outageMessage(err),
      })
    },
    shouldSkip() {
      return state.status === 'down' && state.nextRetryAt !== null && state.nextRetryAt > now()
    },
    retryNow() {
      if (state.status !== 'down') return
      emit({ ...state, nextRetryAt: now() })
    },
  }
}

/** Instance partagée de l'application (client Supabase, gardes, bandeau). */
export const backendHealth: BackendHealth = createBackendHealth()

/**
 * Single-flight : une seule exécution en vol par clé ; les appelants
 * concurrents reçoivent la même promesse. La clé est libérée à la résolution
 * comme au rejet (le prochain appel relance).
 */
export function createSingleFlight<T>() {
  const inFlight = new Map<string, Promise<T>>()
  return (key: string, run: () => Promise<T>): Promise<T> => {
    const existing = inFlight.get(key)
    if (existing) return existing
    const p = run().finally(() => {
      inFlight.delete(key)
    })
    inFlight.set(key, p)
    return p
  }
}

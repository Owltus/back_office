import { describe, expect, it } from 'vitest'

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  backoffMs,
  createBackendHealth,
  createSingleFlight,
  isOutageError,
} from './backendHealth.ts'

describe('backoffMs', () => {
  it('reste borné entre la base et le plafond, jitter compris', () => {
    for (let f = 0; f < 12; f++) {
      const lo = backoffMs(f, () => 0)
      const hi = backoffMs(f, () => 1)
      expect(lo).toBe(BACKOFF_BASE_MS)
      expect(hi).toBeLessThanOrEqual(BACKOFF_MAX_MS)
      expect(hi).toBeGreaterThanOrEqual(lo)
    }
  })

  it('croît avec le nombre d échecs puis plafonne à 30 s', () => {
    expect(backoffMs(0, () => 1)).toBe(1_000)
    expect(backoffMs(1, () => 1)).toBe(2_000)
    expect(backoffMs(2, () => 1)).toBe(4_000)
    expect(backoffMs(4, () => 1)).toBe(16_000)
    expect(backoffMs(5, () => 1)).toBe(30_000)
    expect(backoffMs(20, () => 1)).toBe(30_000)
  })

  it('applique un jitter effectif', () => {
    expect(backoffMs(3, () => 0.5)).toBe(4_500)
    expect(backoffMs(3, () => 0.25)).toBe(2_750)
  })
})

describe('isOutageError', () => {
  it('classe les 5xx, les abandons et les erreurs réseau en panne', () => {
    expect(isOutageError({ status: 503 })).toBe(true)
    expect(isOutageError({ status: 522 })).toBe(true)
    expect(isOutageError({ status: 544 })).toBe(true)
    expect(isOutageError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isOutageError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isOutageError({ name: 'AuthRetryableFetchError', status: 0, message: 'x' })).toBe(true)
  })

  it('ne classe PAS une erreur métier en panne', () => {
    expect(isOutageError({ status: 403 })).toBe(false)
    expect(isOutageError({ status: 401, name: 'AuthApiError' })).toBe(false)
    expect(isOutageError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isOutageError(new Error('boom'))).toBe(false)
    expect(isOutageError(null)).toBe(false)
    expect(isOutageError(undefined)).toBe(false)
  })
})

describe('createBackendHealth', () => {
  it('ouvre sur une panne, espace les tentatives, referme sur succès', () => {
    let t = 1_000_000
    const h = createBackendHealth(() => t, () => 1)
    expect(h.getState().status).toBe('up')
    expect(h.shouldSkip()).toBe(false)

    h.reportFailure({ status: 504 })
    expect(h.getState()).toMatchObject({ status: 'down', failures: 1, lastError: 'HTTP 504' })
    expect(h.getState().nextRetryAt).toBe(t + 1_000)
    expect(h.shouldSkip()).toBe(true)

    t += 1_000
    expect(h.shouldSkip()).toBe(false)

    h.reportFailure(new DOMException('aborted', 'AbortError'))
    expect(h.getState().failures).toBe(2)
    expect(h.getState().nextRetryAt).toBe(t + 2_000)

    h.reportSuccess()
    expect(h.getState()).toEqual({ status: 'up', failures: 0, nextRetryAt: null, lastError: null })
    expect(h.shouldSkip()).toBe(false)
  })

  it('ignore une erreur métier et retryNow rend la tentative due sans effacer les échecs', () => {
    let t = 5_000
    const h = createBackendHealth(() => t, () => 1)
    h.reportFailure({ status: 403 })
    expect(h.getState().status).toBe('up')

    h.reportFailure({ status: 502 })
    h.reportFailure({ status: 502 })
    expect(h.shouldSkip()).toBe(true)
    h.retryNow()
    expect(h.shouldSkip()).toBe(false)
    expect(h.getState().failures).toBe(2)
    t += 1
    expect(h.shouldSkip()).toBe(false)
  })

  it('notifie les abonnés et permet le désabonnement', () => {
    const h = createBackendHealth(() => 0, () => 1)
    const seen: string[] = []
    const off = h.subscribe((s) => seen.push(s.status))
    h.reportFailure({ status: 503 })
    h.reportSuccess()
    off()
    h.reportFailure({ status: 503 })
    expect(seen).toEqual(['down', 'up'])
  })
})

describe('createSingleFlight', () => {
  it('partage une exécution en vol par clé, puis libère la clé', async () => {
    const single = createSingleFlight<number>()
    let runs = 0
    let resolve!: (n: number) => void
    const run = () =>
      new Promise<number>((r) => {
        runs++
        resolve = r
      })
    const a = single('k', run)
    const b = single('k', run)
    expect(a).toBe(b)
    expect(runs).toBe(1)
    resolve(42)
    await expect(a).resolves.toBe(42)
    const c = single('k', () => Promise.resolve(7))
    expect(c).not.toBe(a)
    await expect(c).resolves.toBe(7)
    expect(runs).toBe(1)
  })

  it('libère la clé aussi après un rejet', async () => {
    const single = createSingleFlight<number>()
    await expect(single('k', () => Promise.reject(new Error('x')))).rejects.toThrow('x')
    await expect(single('k', () => Promise.resolve(1))).resolves.toBe(1)
  })
})

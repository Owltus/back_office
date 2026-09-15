import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  backoffMs,
  createBackendHealth,
  isOutageError,
} from './backendHealth.ts'

/*
 * Complète backendHealth.test.ts (lu avant d'écrire ce fichier) par des
 * propriétés fast-check : bornes du backoff sur un grand nombre d'échecs (y
 * compris ceux qui font déborder 2**n), croissance jusqu'au plafond, remise à
 * `up` systématique sur succès, et classification panne/métier de
 * isOutageError sur des formes d'erreur variées.
 */

describe('backoffMs — bornes, pour 1 à 2000 échecs (y compris débordement de 2**n)', () => {
  it('reste toujours dans [BACKOFF_BASE_MS, BACKOFF_MAX_MS], jamais NaN ni Infinity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (failures, r) => {
          const delay = backoffMs(failures, () => r)
          expect(Number.isFinite(delay)).toBe(true)
          expect(Number.isNaN(delay)).toBe(false)
          expect(delay).toBeGreaterThanOrEqual(BACKOFF_BASE_MS)
          expect(delay).toBeLessThanOrEqual(BACKOFF_MAX_MS)
        },
      ),
      { numRuns: 3000 },
    )
  })

  it('à 2000 échecs, 2**failures a largement débordé en Infinity côté JS — le délai reste pourtant fini et plafonné', () => {
    // Vérifie explicitement le cas limite documenté dans la mission : au-delà
    // d'environ 1024 échecs, `2 ** failures` vaut Infinity en flottant IEEE
    // 754. `Math.min(MAX, BASE * Infinity)` doit rester borné.
    expect(2 ** 2000).toBe(Infinity)
    const delay = backoffMs(2000, () => 1)
    expect(delay).toBe(BACKOFF_MAX_MS)
    expect(Number.isFinite(delay)).toBe(true)
  })
})

describe('backoffMs — croissance jusqu au plafond', () => {
  it('pour un jitter fixé quelconque, le délai ne décroît jamais quand le nombre d échecs augmente', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1999 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (failures, r) => {
          const a = backoffMs(failures, () => r)
          const b = backoffMs(failures + 1, () => r)
          expect(b).toBeGreaterThanOrEqual(a)
        },
      ),
      { numRuns: 3000 },
    )
  })

  it('à jitter maximal (r=1), le délai est strictement croissant jusqu au plafond puis y reste', () => {
    let previous = backoffMs(0, () => 1)
    for (let f = 1; f <= 20; f++) {
      const current = backoffMs(f, () => 1)
      expect(current).toBeGreaterThanOrEqual(previous)
      if (previous < BACKOFF_MAX_MS) {
        // Encore sous le plafond : la croissance doit être stricte (le
        // backoff exponentiel double effectivement le délai).
        expect(current).toBeGreaterThan(previous)
      } else {
        expect(current).toBe(BACKOFF_MAX_MS)
      }
      previous = current
    }
  })
})

describe('reportSuccess — remet toujours l état à up', () => {
  it('fast-check : quel que soit l enchaînement d échecs préalable, un succès referme le disjoncteur', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 500, max: 599 }), { minLength: 0, maxLength: 30 }),
        (statuses) => {
          const h = createBackendHealth(() => 0, () => 0.5)
          for (const status of statuses) h.reportFailure({ status })
          h.reportSuccess()
          expect(h.getState()).toEqual({ status: 'up', failures: 0, nextRetryAt: null, lastError: null })
          expect(h.shouldSkip()).toBe(false)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('un succès immédiat (aucun échec préalable) est un no-op idempotent vers up', () => {
    const h = createBackendHealth(() => 0, () => 0.5)
    h.reportSuccess()
    h.reportSuccess()
    expect(h.getState()).toEqual({ status: 'up', failures: 0, nextRetryAt: null, lastError: null })
  })
})

describe('isOutageError — classification, sur des formes d erreur variées', () => {
  it('un statut HTTP 1xx/2xx/3xx n est jamais une panne', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 399 }), (status) => {
        expect(isOutageError({ status })).toBe(false)
      }),
      { numRuns: 300 },
    )
  })

  it('un statut HTTP 4xx (erreur métier) n est JAMAIS classé en panne — règle documentée du disjoncteur', () => {
    fc.assert(
      fc.property(fc.integer({ min: 400, max: 499 }), (status) => {
        expect(isOutageError({ status })).toBe(false)
      }),
      { numRuns: 300 },
    )
  })

  it('un statut HTTP 5xx est toujours une panne', () => {
    fc.assert(
      fc.property(fc.integer({ min: 500, max: 599 }), (status) => {
        expect(isOutageError({ status })).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it('TypeError (échec réseau fetch) est toujours une panne, quel que soit le message', () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        expect(isOutageError(new TypeError(message))).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('AbortError (timeout) est toujours une panne, quel que soit le message', () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        expect(isOutageError(new DOMException(message, 'AbortError'))).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('objet Supabase avec un `code` Postgres mais SANS `status` n est jamais une panne', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99999 }).map((n) => String(n).padStart(5, '0')),
        fc.string(),
        (code, message) => {
          expect(isOutageError({ code, message })).toBe(false)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('AuthRetryableFetchError à status 0 est une panne ; à un autre statut non-5xx, non', () => {
    expect(isOutageError({ name: 'AuthRetryableFetchError', status: 0 })).toBe(true)
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 499 }), (status) => {
        expect(isOutageError({ name: 'AuthRetryableFetchError', status })).toBe(false)
      }),
      { numRuns: 200 },
    )
  })
})

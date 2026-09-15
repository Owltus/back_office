import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { computePdjCA } from '#/lib/pdj/breakdown.ts'

/*
 * Tests basés sur les propriétés pour computePdjCA (breakdown.ts).
 * Voir l'en-tête du fichier source : `totalHt` est la somme des inclus et des
 * extras (cf. `return { ..., totalHt: round2(includedHt + extrasHt), ... }`) —
 * c'est un CONTRAT du type de retour, pas un détail d'implémentation : toute
 * évolution future du calcul doit continuer à honorer cette conservation.
 */

const codeArb = fc.constantFrom('PDJ', 'PDJBB', 'PDJGROUP10')

const rowArb = fc.record({
  addons: fc.oneof(
    fc.constant(null),
    fc.constantFrom('PDJ INCL', 'PDJBB', 'PDJGROUP10', 'TAXE DE SEJOUR'),
  ),
  breakfasts_included: fc.integer({ min: 0, max: 4 }),
  breakfasts_served: fc.integer({ min: 0, max: 6 }),
  manual_kind: fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constantFrom('inclus', 'extra', 'offert'),
  ),
  rate_plan: fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constantFrom(
      'STANDARD',
      'GRATUITE - STAFF',
      'TARIF STAFF – 1 PDJ',
      'TARIF STAFF – CH SEULE',
    ),
  ),
  channel: fc.oneof(fc.constant(undefined), fc.constant(null), fc.string()),
  breakfasts_offert: fc.integer({ min: 0, max: 4 }),
})

const rowsArb = fc.array(rowArb, { minLength: 0, maxLength: 30 })

// Tarifs : au moins PDJ, éventuellement PDJBB/PDJGROUP10, prix TTC positifs.
const tarifsArb = fc
  .dictionary(codeArb, fc.double({ min: 0.5, max: 100, noNaN: true }), {
    minKeys: 0,
    maxKeys: 3,
  })
  .map((dict) => new Map(Object.entries(dict)))

const externalsArb = fc.integer({ min: -5, max: 20 })

const billedTtcArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.double({ min: 0, max: 5000, noNaN: true }),
)

describe('computePdjCA — conservation du total', () => {
  // Invariant : le total facturé est TOUJOURS la somme des inclus et des
  // extras, à l'arrondi au centime près.
  it('totalHt === includedHt + extrasHt (au centime près)', () => {
    fc.assert(
      fc.property(
        rowsArb,
        tarifsArb,
        externalsArb,
        billedTtcArb,
        (rows, tarifs, externals, billedTtc) => {
          const ca = computePdjCA(rows, tarifs, externals, billedTtc)
          expect(ca.totalHt).toBeCloseTo(ca.includedHt + ca.extrasHt, 2)
        },
      ),
      { numRuns: 1000 },
    )
  })
})

describe('computePdjCA — les extras ne sont jamais négatifs', () => {
  // Invariant métier : un couvert offert (gratuit) est retiré du nombre
  // d'extras FACTURABLES avant valorisation (`Math.max(0, extraNb - offertNb)`)
  // — les offerts ne peuvent donc jamais faire passer `extrasHt` sous zéro,
  // quel que soit le nombre de couverts offerts saisi.
  it('extrasHt >= 0', () => {
    fc.assert(
      fc.property(
        rowsArb,
        tarifsArb,
        externalsArb,
        billedTtcArb,
        (rows, tarifs, externals, billedTtc) => {
          const ca = computePdjCA(rows, tarifs, externals, billedTtc)
          expect(ca.extrasHt).toBeGreaterThanOrEqual(0)
        },
      ),
      { numRuns: 1000 },
    )
  })
})

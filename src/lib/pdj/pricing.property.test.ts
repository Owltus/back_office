import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { cardPrices, topPrice } from '#/lib/pdj/pricing.ts'
import type { DailyCodeRow } from '#/lib/pdj/pricing.ts'

/*
 * Tests basés sur les propriétés pour pricing.ts (voir l'en-tête du fichier
 * source pour le contexte métier : carte des tarifs relue dans la facturation).
 */

const CODES = ['PDJ', 'PDJBB', 'PDJGROUP10']

/** Date 'YYYY-MM-DD' à `offset` jours d'une origine fixe — une date DISTINCTE
 *  par index, pour ne jamais introduire d'ex æquo de date dans un même code
 *  (l'algorithme départage les ex æquo par position dans la fenêtre triée : un
 *  doublon de date rendrait le résultat sensible à l'ordre d'INSERTION, ce qui
 *  casserait à tort l'invariant de permutation ci-dessous sans être un vrai bug). */
function dateAt(offset: number): string {
  const d = new Date(2025, 0, 1)
  d.setDate(d.getDate() + offset)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Ligne exploitable (code non nul, included > 0, revenue_ttc > 0) — une date
 *  distincte par position, assignée après coup via l'index dans le tableau. */
const rowArb = fc
  .array(
    fc.record({
      code: fc.constantFrom(...CODES),
      included: fc.integer({ min: 1, max: 40 }),
      unitCents: fc.integer({ min: 1, max: 4000 }), // prix unitaire en centimes
    }),
    { minLength: 1, maxLength: 60 },
  )
  .map((entries) =>
    entries.map(
      (e, i): DailyCodeRow => ({
        service_date: dateAt(i),
        code: e.code,
        included: e.included,
        revenue_ttc: (e.unitCents * e.included) / 100,
      }),
    ),
  )

describe('cardPrices — permuter l’ordre des lignes ne change pas le résultat', () => {
  // Invariant métamorphique : la fonction trie par date en interne (cf. le
  // commentaire de pricing.ts, « obs.sort(...) ») — le résultat ne doit donc
  // dépendre que du CONTENU des lignes, jamais de leur ordre d'arrivée.
  it('cardPrices(rows) === cardPrices(shuffle(rows))', () => {
    fc.assert(
      fc.property(
        rowArb.chain((rows) =>
          fc
            .shuffledSubarray(rows, {
              minLength: rows.length,
              maxLength: rows.length,
            })
            .map((shuffled) => ({ rows, shuffled })),
        ),
        ({ rows, shuffled }) => {
          const a = cardPrices(rows)
          const b = cardPrices(shuffled)
          // Comparaison de CONTENU (l'ordre d'insertion de la Map dépend de
          // l'ordre de première apparition des codes dans `rows`, ce qui n'a
          // rien à voir avec l'invariant testé ici).
          expect(b).toEqual(a)
        },
      ),
      { numRuns: 1000 },
    )
  })
})

describe('cardPrices — toute valeur retournée est strictement positive', () => {
  // Invariant : un prix de carte est un prix, jamais 0 ni négatif — sinon
  // l'appelant (extras, inclus manuels) valoriserait à 0 ou en négatif.
  it('aucune entrée de la Map n’est ≤ 0', () => {
    fc.assert(
      fc.property(rowArb, (rows) => {
        const prices = cardPrices(rows)
        for (const p of prices.values()) expect(p).toBeGreaterThan(0)
      }),
      { numRuns: 1000 },
    )
  })
})

describe('cardPrices — frontière de CARD_MIN_OBSERVATIONS (3)', () => {
  // Invariant de frontière : en dessous de 3 observations exploitables pour un
  // code, la fenêtre « ne dit rien de fiable » (cf. l'en-tête) → repli conservé
  // à l'identique ; à partir de 3, la carte est lue (ici sans ambiguïté de mode
  // puisque toutes les observations valent le MÊME prix, construit en centimes
  // entiers pour une comparaison exacte).
  it('2 observations gardent le repli, 3 font basculer sur le prix observé', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CODES),
        fc.integer({ min: 100, max: 5000 }), // prix unitaire, en centimes
        fc.integer({ min: 1, max: 30 }), // couverts inclus par jour
        fc.integer({ min: 1, max: 9999 }), // prix de repli (centimes), code distinct
        (code, unitCents, included, fallbackCents) => {
          const unit = unitCents / 100
          const fallback = fallbackCents / 100
          const rowsOf = (n: number): DailyCodeRow[] =>
            Array.from({ length: n }, (_, i) => ({
              service_date: dateAt(i),
              code,
              included,
              revenue_ttc: unit * included,
            }))

          const withFallback = new Map([[code, fallback]])

          // En dessous du seuil : repli conservé tel quel.
          expect(cardPrices(rowsOf(2), withFallback).get(code)).toBe(fallback)
          expect(cardPrices(rowsOf(0), withFallback).get(code)).toBe(fallback)
          // Sans repli fourni, la fenêtre insuffisante ne renseigne rien.
          expect(cardPrices(rowsOf(2)).has(code)).toBe(false)

          // Au seuil : la fenêtre parle, le prix observé remplace le repli.
          expect(cardPrices(rowsOf(3), withFallback).get(code)).toBeCloseTo(
            unit,
            2,
          )
          expect(cardPrices(rowsOf(3)).get(code)).toBeCloseTo(unit, 2)
        },
      ),
      { numRuns: 1000 },
    )
  })
})

describe('topPrice — appartenance et maximum', () => {
  // Invariant : le prix rendu est l'un des prix fournis (jamais une valeur
  // inventée), et c'est bien le PLUS ÉLEVÉ d'entre eux.
  it('appartient à l’ensemble des prix et en est le maximum', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom(...CODES, 'AUTRE'),
          fc.double({ min: 0.01, max: 500, noNaN: true }),
          { minKeys: 1 },
        ),
        (dict) => {
          const prices = new Map(Object.entries(dict))
          const result = topPrice(prices)
          const values = [...prices.values()]
          expect(result).not.toBeNull()
          expect(values).toContain(result)
          expect(result).toBe(Math.max(...values))
        },
      ),
      { numRuns: 1000 },
    )
  })
})

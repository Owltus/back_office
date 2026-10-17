import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { ALL_ROOMS } from '#/lib/hotel/rooms.ts'
import { SPOTS } from '#/lib/parking/model.ts'
import { breakfastCode, computePdjCA, isStaffRow } from '#/lib/pdj/breakdown.ts'
import { billedRevenueTtc, cardPrices } from '#/lib/pdj/pricing.ts'
import { detectTarifs } from '#/lib/pdj/tarif.ts'
import { stayKind } from '#/lib/pdj/csv.ts'
import {
  ALL_ROOMS as ALL_ROOMS_MONTRE,
  PARKING_TOTAL,
  stayKind as stayKindMontre,
} from '../../../supabase/functions/montre-resume/regles.ts'
import * as ca from '../../../supabase/functions/montre-resume/ca.ts'

/*
 * L'Edge Function `montre-resume` tourne sous Deno et ne peut pas importer
 * `src/` (alias `#/`) : elle porte une COPIE de l'inventaire des chambres et de
 * la règle des séjours. Ce test échoue au premier écart, pour que la montre
 * dise toujours la même chose que la page PDJ. S'il casse, reporter la
 * modification de l'autre côté, ne jamais ajuster ce test.
 */
describe('montre-resume — les copies Edge ne doivent pas diverger', () => {
  it('même inventaire des chambres', () => {
    expect(ALL_ROOMS_MONTRE).toEqual(ALL_ROOMS)
  })

  it('même nombre de places de parking', () => {
    expect(PARKING_TOTAL).toBe(SPOTS)
  })

  it('même nature de séjour pour les statuts connus', () => {
    for (const s of [
      'IN HOUSE',
      'DUE OUT',
      'CHECKED OUT',
      'DUE IN',
      'RESERVED',
      '',
    ])
      expect(stayKindMontre(s)).toBe(stayKind(s))
  })

  it('même nature de séjour pour tout statut', () => {
    const statut = fc.oneof(
      fc.string(),
      fc
        .tuple(
          fc.string(),
          fc.constantFrom('IN HOUSE', 'DUE OUT', 'CHECKED OUT'),
          fc.string(),
        )
        .map(([a, b, c]) => a + b + c),
    )
    fc.assert(
      fc.property(statut, (s) => stayKindMontre(s) === stayKind(s)),
      { numRuns: 1000 },
    )
  })
})

// Le CA de la montre doit être EXACTEMENT celui de l'écran Petit-déjeuner :
// mêmes entrées générées, mêmes sorties (bit à bit).
describe('montre-resume — copie du CA petit-déjeuner', () => {
  const code = fc.constantFrom('PDJ', 'PDJBB', 'PDJGROUP10', 'AUTRE', null)
  const addons = fc.oneof(
    fc.constant(null),
    fc.constantFrom('PDJ', 'PDJBB', 'PDJGROUP10', 'PARKING,PDJ', 'pdjbb', ''),
    fc.string(),
  )
  const ligne = fc.record({
    addons,
    breakfasts_included: fc.integer({ min: 0, max: 4 }),
    breakfasts_served: fc.integer({ min: 0, max: 6 }),
    breakfasts_offert: fc.integer({ min: 0, max: 4 }),
    manual_kind: fc.constantFrom(null, 'inclus', 'extra', 'offert'),
    rate_plan: fc.constantFrom(
      null,
      'BAR',
      'GRATUITE - STAFF',
      'TARIF STAFF – 1 PDJ',
      'staff',
    ),
  })
  const prix = fc.constantFrom(10, 19, 25, 9.5, 0)
  const tarifs = fc
    .array(fc.tuple(fc.constantFrom('PDJ', 'PDJBB', 'PDJGROUP10'), prix), {
      maxLength: 3,
    })
    .map((t) => new Map(t))
  const jour = fc
    .integer({ min: 0, max: 60 })
    .map((n) => new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10))
  const agg = fc.array(
    fc.record({
      service_date: jour,
      code,
      included: fc.integer({ min: -1, max: 20 }),
      revenue_ttc: fc.oneof(
        fc.constant(null),
        fc.constantFrom(0, -5, 190, 100, 95, 296),
        fc.double({ min: -50, max: 500, noNaN: true }),
      ),
    }),
    { maxLength: 60 },
  )
  const recettes = fc.array(
    fc.record({
      code: fc.constantFrom('PDJ', 'PDJBB', 'PDJGROUP10'),
      revenue_ttc: fc.oneof(
        fc.constantFrom(19, 38, 57, 10, 20, 0, -19, 296),
        fc.double({ min: -100, max: 1000, noNaN: true }),
      ),
    }),
    { maxLength: 40 },
  )

  it('breakfastCode et isStaffRow identiques', () => {
    fc.assert(
      fc.property(addons, fc.option(fc.string()), (a, r) => {
        expect(ca.breakfastCode(a)).toBe(breakfastCode(a))
        expect(ca.isStaffRow(r)).toBe(isStaffRow(r))
      }),
      { numRuns: 2000 },
    )
  })

  it('total HT identique à computePdjCA', () => {
    fc.assert(
      fc.property(
        fc.array(ligne, { maxLength: 30 }),
        tarifs,
        fc.integer({ min: -2, max: 10 }),
        fc.option(fc.double({ min: -100, max: 2000, noNaN: true })),
        (lignes, t, ext, billed) => {
          expect(ca.caTotalHt(lignes, t, ext, billed)).toBe(
            computePdjCA(
              lignes.map((l) => ({ ...l, channel: null })),
              t,
              ext,
              billed,
            ).totalHt,
          )
        },
      ),
      { numRuns: 3000 },
    )
  })

  it('carte des prix et repli identiques', () => {
    fc.assert(
      fc.property(
        agg,
        recettes,
        fc.option(jour, { nil: undefined }),
        (a, rec, asOf) => {
          const repliApp = detectTarifs(rec)
          expect([...ca.detectTarifs(rec)]).toEqual([...repliApp])
          expect([...ca.cardPrices(a, repliApp, asOf)]).toEqual([
            ...cardPrices(a, repliApp, asOf),
          ])
          expect(ca.billedRevenueTtc(rec)).toBe(billedRevenueTtc(rec))
        },
      ),
      { numRuns: 2000 },
    )
  })

  it('fenêtre de 21 jours : 11 jours à 19 € puis 10 à 25 € → 19 €', () => {
    // À 20 jours, 10 contre 10 : l'ex aequo irait au plus récent (25 €).
    const a = Array.from({ length: 21 }, (_, i) => ({
      service_date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      code: 'PDJ',
      included: 1,
      revenue_ttc: i < 11 ? 19 : 25,
    }))
    expect(ca.cardPrices(a).get('PDJ')).toBe(19)
    expect(cardPrices(a).get('PDJ')).toBe(19)
  })

  it('repli : une recette atypique ne renverse pas 19 € (incident du 2026-09-12)', () => {
    const rec = [
      ...Array.from({ length: 253 }, (_, i) => ({
        code: 'PDJ',
        revenue_ttc: 19 * (1 + (i % 7)),
      })),
      { code: 'PDJ', revenue_ttc: 296 },
    ]
    expect(ca.detectTarifs(rec).get('PDJ')).toBe(19)
    expect(detectTarifs(rec).get('PDJ')).toBe(19)
  })
})

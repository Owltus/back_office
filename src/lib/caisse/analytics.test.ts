import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  aggregateCaisseDaily,
  aggregateCaisseMonthly,
  summarize,
  yearsFromSheets,
} from '#/lib/caisse/analytics.ts'
import { computeEcarts, fundEcart, fundTotal, hasCountedFund } from '#/lib/caisse/calc.ts'
import { activeCautionsTotal, effectiveFundTarget } from '#/lib/caisse/cautions.ts'
import { DENOMINATIONS, ECART_KEYS, EPSILON, FUND_TARGET } from '#/lib/caisse/constants.ts'
import type {
  CaisseSheet,
  Caution,
  CautionStatus,
  Counts,
  Shift,
  SheetStatus,
} from '#/lib/caisse/types.ts'

/*
 * Tests d'agrégation analytique caisse (métier pur, aucun React/Supabase). Le
 * fichier n'avait ZÉRO test alors que ses analogues PDJ et parking en ont — on
 * comble le trou avec des propriétés fast-check plutôt que des cas isolés, pour
 * balayer un espace large de feuilles (mélange clôturé/brouillon, montants,
 * dates, cautions actives), au lieu de figer quelques exemples à la main.
 */

// ---------------------------------------------------------------------------
// Générateurs
// ---------------------------------------------------------------------------

const YEAR = 2026
const RUNS = 1000

/** Montant en euros, généré en CENTIMES entiers : évite le bruit flottant d'un
 * float arbitraire — round2 (source) travaille lui-même en centimes. */
const amountArb = fc.integer({ min: 0, max: 100_000 }).map((c) => c / 100)

/** 'YYYY-MM-DD'. Jours bornés à 1..28 : valides dans tous les mois, la longueur
 * d'un mois n'entre dans aucune des propriétés testées ici. */
function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Comptage de coupures arbitraire (0..9 par dénomination). */
const countsArb: fc.Arbitrary<Counts> = fc
  .array(fc.integer({ min: 0, max: 9 }), {
    minLength: DENOMINATIONS.length,
    maxLength: DENOMINATIONS.length,
  })
  .map((vals) => {
    const c = {} as Counts
    DENOMINATIONS.forEach((d, i) => {
      c[d.key] = vals[i]
    })
    return c
  })

/** Comptage vierge (toutes coupures à 0), pour les feuilles minimales. */
function emptyCounts(): Counts {
  return DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.key]: 0 }), {} as Counts)
}

/** Feuille de caisse arbitraire, datée dans `year` (mois/jour/statut aléatoires). */
function sheetArb(year: number): fc.Arbitrary<CaisseSheet> {
  return fc
    .record({
      id: fc.uuid(),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
      shift: fc.constantFrom<Shift>('matin', 'soir', 'nuit'),
      status: fc.constantFrom<SheetStatus>('draft', 'validated'),
      sntCash: amountArb,
      sntCb: amountArb,
      sntCvac: amountArb,
      sntCbweb: amountArb,
      lsCash: amountArb,
      lsCb: amountArb,
      lsCvac: amountArb,
      caisseCash: amountArb,
      caisseCb: amountArb,
      caisseCvac: amountArb,
      caisseAdyen: amountArb,
      counts: countsArb,
    })
    .map(
      (r): CaisseSheet => ({
        id: r.id,
        reportDate: dateStr(year, r.month, r.day),
        shift: r.shift,
        operatorInitials: 'AB',
        snt: { cash: r.sntCash, cb: r.sntCb, cvac: r.sntCvac, cbweb: r.sntCbweb },
        ls: { cash: r.lsCash, cb: r.lsCb, cvac: r.lsCvac },
        caisse: { cash: r.caisseCash, cb: r.caisseCb, cvac: r.caisseCvac, adyen: r.caisseAdyen },
        counts: r.counts,
        fundOrigin: FUND_TARGET,
        comment: '',
        status: r.status,
        validatedAt: null,
        validatedBy: null,
        countersignedBy: null,
        createdBy: 'test',
        createdAt: '',
        updatedAt: '',
      }),
    )
}

/** Caution arbitraire, prise et (éventuellement) remboursée dans `year`. */
function cautionArb(year: number): fc.Arbitrary<Caution> {
  return fc
    .record({
      id: fc.uuid(),
      room: fc.integer({ min: 100, max: 499 }),
      amount: amountArb,
      takenMonth: fc.integer({ min: 1, max: 12 }),
      takenDay: fc.integer({ min: 1, max: 28 }),
      status: fc.constantFrom<CautionStatus>('active', 'refunded'),
      refundedMonth: fc.integer({ min: 1, max: 12 }),
      refundedDay: fc.integer({ min: 1, max: 28 }),
      hasRefund: fc.boolean(),
    })
    .map(
      (r): Caution => ({
        id: r.id,
        room: r.room,
        amount: r.amount,
        comment: '',
        takenDate: dateStr(year, r.takenMonth, r.takenDay),
        status: r.status,
        refundedDate: r.hasRefund ? dateStr(year, r.refundedMonth, r.refundedDay) : null,
        createdBy: 'test',
        createdAt: '',
      }),
    )
}

// ---------------------------------------------------------------------------
// Propriété 1 — seules les feuilles clôturées comptent
// ---------------------------------------------------------------------------

describe('aggregateCaisseMonthly / aggregateCaisseDaily — feuilles clôturées seules', () => {
  it('retirer les brouillons ne change jamais le résultat (relation métamorphique)', () => {
    // Un brouillon porte des montants provisoires (comptage en cours) : il ne
    // doit influencer AUCUN agrégat. On vérifie qu'agréger un mélange
    // clôturé/brouillon donne EXACTEMENT le même résultat qu'agréger les seules
    // feuilles clôturées, aussi bien côté mensuel que journalier.
    fc.assert(
      fc.property(
        fc.array(sheetArb(YEAR), { maxLength: 25 }),
        fc.integer({ min: 1, max: 12 }),
        fc.array(cautionArb(YEAR), { maxLength: 5 }),
        (sheets, month, cautions) => {
          const onlyValidated = sheets.filter((s) => s.status === 'validated')
          expect(aggregateCaisseMonthly(sheets, YEAR, cautions)).toEqual(
            aggregateCaisseMonthly(onlyValidated, YEAR, cautions),
          )
          expect(aggregateCaisseDaily(sheets, YEAR, month, cautions)).toEqual(
            aggregateCaisseDaily(onlyValidated, YEAR, month, cautions),
          )
        },
      ),
      { numRuns: RUNS },
    )
  })
})

// ---------------------------------------------------------------------------
// Propriété 2 — conservation (oracle indépendant)
// ---------------------------------------------------------------------------

describe('summarize(aggregateCaisseDaily(...)) — conservation', () => {
  it('reconstitue les mêmes totaux que la somme directe des feuilles clôturées du mois', () => {
    // Oracle INDÉPENDANT : on resomme nous-mêmes les feuilles clôturées qui
    // matchent (année, mois) directement depuis `s.caisse`, sans passer par
    // addSheet ni aggregateCaisseDaily — pure vérification de conservation.
    fc.assert(
      fc.property(
        fc.array(sheetArb(YEAR), { maxLength: 25 }),
        fc.integer({ min: 1, max: 12 }),
        (sheets, month) => {
          const prefix = `${YEAR}-${String(month).padStart(2, '0')}-`
          const matching = sheets.filter(
            (s) => s.status === 'validated' && s.reportDate.startsWith(prefix),
          )
          const expectedTotals = matching.reduce(
            (acc, s) => {
              acc.cash += s.caisse.cash
              acc.cb += s.caisse.cb
              acc.cvac += s.caisse.cvac
              acc.adyen += s.caisse.adyen
              return acc
            },
            { cash: 0, cb: 0, cvac: 0, adyen: 0 },
          )

          const summary = summarize(aggregateCaisseDaily(sheets, YEAR, month))

          expect(summary.sheets).toBe(matching.length)
          expect(summary.cash).toBeCloseTo(expectedTotals.cash, 6)
          expect(summary.cb).toBeCloseTo(expectedTotals.cb, 6)
          expect(summary.cvac).toBeCloseTo(expectedTotals.cvac, 6)
          expect(summary.adyen).toBeCloseTo(expectedTotals.adyen, 6)
          expect(summary.encaisse).toBeCloseTo(
            expectedTotals.cash + expectedTotals.cb + expectedTotals.cvac + expectedTotals.adyen,
            6,
          )
        },
      ),
      { numRuns: RUNS },
    )
  })
})

// ---------------------------------------------------------------------------
// Propriété 3 — cohérence des modes de paiement
// ---------------------------------------------------------------------------

describe('cohérence des modes de paiement', () => {
  it('encaisse = cash + cb + cvac + adyen, pour chaque ligne mensuelle et journalière', () => {
    fc.assert(
      fc.property(fc.array(sheetArb(YEAR), { maxLength: 25 }), (sheets) => {
        for (const m of aggregateCaisseMonthly(sheets, YEAR)) {
          expect(m.encaisse).toBeCloseTo(m.cash + m.cb + m.cvac + m.adyen, 6)
        }
        for (let month = 1; month <= 12; month++) {
          for (const d of aggregateCaisseDaily(sheets, YEAR, month)) {
            expect(d.encaisse).toBeCloseTo(d.cash + d.cb + d.cvac + d.adyen, 6)
          }
        }
      }),
      { numRuns: RUNS },
    )
  })
})

// ---------------------------------------------------------------------------
// Propriété 4 — yearsFromSheets
// ---------------------------------------------------------------------------

describe('yearsFromSheets', () => {
  it('trié, sans doublon, exactement les années présentes dans les feuilles + fallback', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 2000, max: 2100 }), { maxLength: 25 }),
        fc.integer({ min: 2000, max: 2100 }),
        (years, fallback) => {
          const sheets: CaisseSheet[] = years.map((y, i) => ({
            id: `s${i}`,
            reportDate: dateStr(y, 1, 1),
            shift: 'matin',
            operatorInitials: '',
            snt: { cash: 0, cb: 0, cvac: 0, cbweb: 0 },
            ls: { cash: 0, cb: 0, cvac: 0 },
            caisse: { cash: 0, cb: 0, cvac: 0, adyen: 0 },
            counts: emptyCounts(),
            fundOrigin: FUND_TARGET,
            comment: '',
            status: 'validated',
            validatedAt: null,
            validatedBy: null,
            countersignedBy: null,
            createdBy: 'test',
            createdAt: '',
            updatedAt: '',
          }))
          const result = yearsFromSheets(sheets, fallback)

          // Trié.
          expect(result).toEqual([...result].sort((a, b) => a - b))
          // Sans doublon.
          expect(new Set(result).size).toBe(result.length)
          // Exactement les années présentes + fallback.
          const expected = new Set(years)
          expected.add(fallback)
          expect(new Set(result)).toEqual(expected)
        },
      ),
      { numRuns: RUNS },
    )
  })
})

// ---------------------------------------------------------------------------
// Propriété 5 — hasAnomaly (fonction non exportée, testée via son effet observable)
// ---------------------------------------------------------------------------

describe('détection d’anomalie (hasAnomaly, via aggregateCaisseMonthly)', () => {
  it('correspond au recalcul indépendant depuis les briques exportées de calc.ts', () => {
    // hasAnomaly n'est pas exportée : on la retraverse à partir des briques
    // publiques (computeEcarts / fundEcart / hasCountedFund / effectiveFundTarget),
    // exactement comme le fait addSheet en interne — c'est l'oracle indépendant
    // demandé pour ce point, qui isole une éventuelle régression de COMPOSITION
    // (mauvais countedTotal/target passés à hasAnomaly depuis l'agrégation).
    fc.assert(
      fc.property(
        sheetArb(YEAR).map((s) => ({ ...s, status: 'validated' as const })),
        fc.array(cautionArb(YEAR), { maxLength: 5 }),
        (sheet, cautions) => {
          const month = Number(sheet.reportDate.slice(5, 7))
          const row = aggregateCaisseMonthly([sheet], YEAR, cautions)[month - 1]

          const ecarts = computeEcarts(sheet)
          const target = effectiveFundTarget(cautions, sheet.reportDate, FUND_TARGET)
          const countedTotal = fundTotal(sheet) + activeCautionsTotal(cautions, sheet.reportDate)
          const expectedAnomaly =
            ECART_KEYS.some((k) => Math.abs(ecarts[k]) >= EPSILON) ||
            (hasCountedFund(sheet) && Math.abs(fundEcart(countedTotal, target)) >= EPSILON)

          expect(row.anomalies).toBe(expectedAnomaly ? 1 : 0)
        },
      ),
      { numRuns: RUNS },
    )
  })
})

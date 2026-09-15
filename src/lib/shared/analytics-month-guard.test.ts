import { describe, expect, it } from 'vitest'

import { aggregateCaisseMonthly } from '#/lib/caisse/analytics.ts'
import type { CaisseSheet, Counts } from '#/lib/caisse/types.ts'
import { DENOMINATIONS, FUND_TARGET } from '#/lib/caisse/constants.ts'
import { aggregatePdjMonthly } from '#/lib/pdj/analytics.ts'
import type { PdjAggRow } from '#/lib/pdj/service.ts'
import { aggregateParkingMonthly } from '#/lib/parking/analytics.ts'
import type { ParkingArrivalsRow } from '#/lib/parking/service.ts'

/*
 * Robustesse d'une garde de date RÉPÉTÉE TROIS FOIS (lib/caisse/analytics.ts,
 * lib/pdj/analytics.ts, lib/parking/analytics.ts) :
 *
 *   const m = Number(date.slice(5, 7)) - 1
 *   if (m < 0 || m > 11) continue
 *
 * Si `Number(...)` renvoie NaN, les DEUX comparaisons (`NaN < 0`, `NaN > 11`)
 * sont fausses : le `continue` n'est PAS pris. L'exécution retombe donc sur
 * `months[NaN]`, qui vaut `undefined` (un tableau JS n'a pas d'indice "NaN"),
 * puis plante à la première affectation de champ dessus.
 *
 * Ce fichier n'établit RIEN sur la correction du code : il OBSERVE le
 * comportement réel avec une ligne dont la date commence par le bon préfixe
 * d'année (le `startsWith(prefix)` juste avant ne l'écarte donc pas) mais dont
 * le mois est malformé — un scénario qu'un import externe mal formé (CSV,
 * PMS, vue SQL en dérive) peut produire.
 */

const YEAR = 2026
const MALFORMED_DATE = `${YEAR}-XX-01` // passe le startsWith(`${YEAR}-`), mois non numérique

describe('garde de mois malformé — atteignabilité réelle du chemin NaN', () => {
  it('caisse : aggregateCaisseMonthly avec une reportDate à mois malformé', () => {
    const sheet: CaisseSheet = {
      id: 's1',
      reportDate: MALFORMED_DATE,
      shift: 'matin',
      operatorInitials: '',
      snt: { cash: 0, cb: 0, cvac: 0, cbweb: 0 },
      ls: { cash: 0, cb: 0, cvac: 0 },
      caisse: { cash: 0, cb: 0, cvac: 0, adyen: 0 },
      counts: DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.key]: 0 }), {} as Counts),
      fundOrigin: FUND_TARGET,
      comment: '',
      status: 'validated',
      validatedAt: null,
      validatedBy: null,
      countersignedBy: null,
      createdBy: 'test',
      createdAt: '',
      updatedAt: '',
    }

    let thrown: unknown = null
    try {
      aggregateCaisseMonthly([sheet], YEAR)
    } catch (e) {
      thrown = e
    }

    // FAIT BRUT observé (voir aussi le rapport final) : ÇA PLANTE — TypeError
    // "Cannot read properties of undefined (reading 'sheets')" dans addSheet,
    // appelée avec months[NaN] (= undefined). Le `continue` de la garde n'a pas
    // été pris : NaN < 0 et NaN > 11 sont tous deux faux.
    expect(thrown).toBeInstanceOf(TypeError)
    expect((thrown as TypeError).message).toBe(
      "Cannot read properties of undefined (reading 'sheets')",
    )
  })

  it('pdj : aggregatePdjMonthly avec une service_date à mois malformé', () => {
    const row: PdjAggRow = {
      service_date: MALFORMED_DATE,
      code: 'PDJ',
      rooms: 1,
      guests: 1,
      included: 1,
      served: 1,
      extra: 0,
      no_show: 0,
      offert: 0,
      revenue_ttc: null,
    }

    let thrown: unknown = null
    try {
      aggregatePdjMonthly([row], YEAR)
    } catch (e) {
      thrown = e
    }

    // FAIT BRUT observé : ÇA PLANTE — TypeError "Cannot read properties of
    // undefined (reading 'guests')", au tout premier champ affecté sur
    // months[NaN] dans la boucle d'agrégation.
    expect(thrown).toBeInstanceOf(TypeError)
    expect((thrown as TypeError).message).toBe(
      "Cannot read properties of undefined (reading 'guests')",
    )
  })

  it('parking : aggregateParkingMonthly avec un start_date à mois malformé', () => {
    const row: ParkingArrivalsRow = {
      start_date: MALFORMED_DATE,
      reservations: 1,
      nights: 1,
      client_nights: 1,
      paid: 1,
      reserved: 0,
      unpaid: 0,
    }

    let thrown: unknown = null
    try {
      aggregateParkingMonthly([row], YEAR)
    } catch (e) {
      thrown = e
    }

    // FAIT BRUT observé : ÇA PLANTE — TypeError "Cannot read properties of
    // undefined (reading 'reservations')", même mécanisme que caisse/pdj.
    expect(thrown).toBeInstanceOf(TypeError)
    expect((thrown as TypeError).message).toBe(
      "Cannot read properties of undefined (reading 'reservations')",
    )
  })
})

import { describe, expect, it } from 'vitest'

import {
  buildTvaRef,
  buildTvaRefFrom,
  validateForecast,
} from '#/lib/repjour/calc/validate.ts'
import type { DailyReport, ForecastRow } from '#/lib/repjour/types.ts'

/** Ligne forecast d'août 2026 : occ chambres à un ADR (HT) donné. */
function fRow(day: number, occ: number, adr: number): ForecastRow {
  return {
    date: `2026-08-${String(day).padStart(2, '0')}`,
    month: 8,
    year: 2026,
    occ,
    revHT: occ * adr,
  }
}

/** Mois complet (31 jours) à occ/ADR constants. */
function month(occ: number, adr: number): ForecastRow[] {
  return Array.from({ length: 31 }, (_, i) => fRow(i + 1, occ, adr))
}

const hasTvaError = (alerts: { type: string; message: string }[]) =>
  alerts.some((a) => a.type === 'error' && a.message.includes('TTC'))

describe('buildTvaRefFrom — référence HT (réalisé)', () => {
  it('assez de jours réalisés → référence', () => {
    expect(buildTvaRefFrom(900, 10, 10)).toEqual({ adrHT: 90, throughDay: 10 })
  })
  it('moins de 5 nuitées → null', () => {
    expect(buildTvaRefFrom(360, 4, 10)).toBeNull()
  })
  it('revenu nul → null', () => {
    expect(buildTvaRefFrom(0, 10, 10)).toBeNull()
  })
  it('jour de coupure nul → null', () => {
    expect(buildTvaRefFrom(900, 10, 0)).toBeNull()
  })
})

describe('buildTvaRef — depuis un DailyReport', () => {
  it('dérive l’ADR MTD et le jour de coupure', () => {
    const report = {
      rmtd_room_revenue: 900,
      rmtd_nuitees: 10,
      day_of_month: 10,
    } as unknown as DailyReport
    expect(buildTvaRef(report)).toEqual({ adrHT: 90, throughDay: 10 })
  })
  it('null si pas de rapport', () => {
    expect(buildTvaRef(null)).toBeNull()
  })
})

describe('validateForecast — détection TVA en trop (forecast resté en TTC)', () => {
  const ref = { adrHT: 90, throughDay: 10 } // réalisé : ADR 90 HT, 10 jours

  it('forecast en TTC (~10 % au-dessus du réalisé) → erreur bloquante', () => {
    const alerts = validateForecast(month(40, 99), 31, ref) // 99/90 = 1,10
    expect(hasTvaError(alerts)).toBe(true)
  })

  it('bornes de la bande : 1/0,93 et 1/0,83 exclues, juste dedans incluses', () => {
    // Oracle : bande ouverte ]1/0,93 ; 1/0,83[, inverse de l'ancienne 0,83–0,93.
    const avec = (adr: number) =>
      hasTvaError(validateForecast(month(40, adr), 31, ref))
    expect(avec(90 / 0.93 - 0.01)).toBe(false)
    expect(avec(90 / 0.93 + 0.01)).toBe(true)
    expect(avec(90 / 0.83 - 0.01)).toBe(true)
    expect(avec(90 / 0.83 + 0.01)).toBe(false)
    // L'ancien cas (forecast HT face à un réalisé TTC) n'est plus une erreur.
    expect(avec(81)).toBe(false)
  })

  it('forecast correct (≈ réalisé) → aucune erreur TVA', () => {
    const alerts = validateForecast(month(40, 90), 31, ref)
    expect(hasTvaError(alerts)).toBe(false)
  })

  it('forecast très au-dessus (hors zone TVA) → pas d’erreur TVA', () => {
    const alerts = validateForecast(month(40, 120), 31, ref) // 1,333 > 1/0,83
    expect(hasTvaError(alerts)).toBe(false)
  })

  it('aucune référence (mois futur) → aucune détection', () => {
    const alerts = validateForecast(month(40, 99), 31, null)
    expect(hasTvaError(alerts)).toBe(false)
  })

  it('périmètre égal : jours passés corrects + fin de mois moins chère → pas de faux positif', () => {
    // Jours 1-10 (réalisés) à l’ADR du réalisé (90) ; jours 11-31 projetés à
    // 110 (saisonnalité : le mois entier ferait 1,15, dans la bande). Restreint
    // aux jours ≤ throughDay=10 → ratio 1,0 → pas d’erreur.
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => fRow(i + 1, 40, 90)),
      ...Array.from({ length: 21 }, (_, i) => fRow(i + 11, 40, 110)),
    ]
    const alerts = validateForecast(rows, 31, ref)
    expect(hasTvaError(alerts)).toBe(false)
  })
})

describe('validateForecast — non-régression des autres contrôles', () => {
  it('fichier vide → erreur', () => {
    const alerts = validateForecast([], 31, null)
    expect(alerts.some((a) => a.type === 'error')).toBe(true)
  })
  it('chiffres impossibles (revenu sans occupation) → erreur', () => {
    const alerts = validateForecast(
      [fRow(1, 0, 0), { ...fRow(2, 0, 0), revHT: 100 }],
      31,
      null,
    )
    expect(alerts.some((a) => a.type === 'error')).toBe(true)
  })
  it('occupation sans revenu → avertissement', () => {
    const rows = month(40, 90).map((r) => ({ ...r, revHT: 0 }))
    const alerts = validateForecast(rows, 31, null)
    expect(alerts.some((a) => a.type === 'warning')).toBe(true)
  })
  it('mois incomplet → avertissement', () => {
    const alerts = validateForecast([fRow(1, 40, 90)], 31, null)
    expect(alerts.some((a) => a.type === 'warning')).toBe(true)
  })
  it('un mois complet correct ne lève aucune alerte', () => {
    expect(
      validateForecast(month(40, 90), 31, { adrHT: 90, throughDay: 31 }),
    ).toEqual([])
  })
})

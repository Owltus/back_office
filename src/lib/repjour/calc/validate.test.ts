import { describe, expect, it } from 'vitest'

import {
  buildTvaRef,
  buildTvaRefFrom,
  validateForecast,
} from '#/lib/repjour/calc/validate.ts'
import type { DailyReport, ForecastRow } from '#/lib/repjour/types.ts'

/** Ligne forecast d'août 2026 : occ chambres à un ADR (TTC) donné. */
function fRow(day: number, occ: number, adr: number): ForecastRow {
  const revTTC = occ * adr
  return {
    date: `2026-08-${String(day).padStart(2, '0')}`,
    month: 8,
    year: 2026,
    occ,
    revHT: revTTC / 1.1,
    revTTC,
  }
}

/** Mois complet (31 jours) à occ/ADR constants. */
function month(occ: number, adr: number): ForecastRow[] {
  return Array.from({ length: 31 }, (_, i) => fRow(i + 1, occ, adr))
}

const hasTvaError = (alerts: { type: string; message: string }[]) =>
  alerts.some((a) => a.type === 'error' && a.message.includes('HT'))

describe('buildTvaRefFrom — référence TTC (réalisé)', () => {
  it('assez de jours réalisés → référence', () => {
    expect(buildTvaRefFrom(900, 10, 10)).toEqual({ adrTTC: 90, throughDay: 10 })
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
    expect(buildTvaRef(report)).toEqual({ adrTTC: 90, throughDay: 10 })
  })
  it('null si pas de rapport', () => {
    expect(buildTvaRef(null)).toBeNull()
  })
})

describe('validateForecast — détection TVA manquante (forecast HT)', () => {
  const ref = { adrTTC: 90, throughDay: 10 } // réalisé : ADR 90 TTC, 10 jours

  it('forecast en HT (~10% sous le réalisé) → erreur bloquante', () => {
    const alerts = validateForecast(month(40, 81), 31, ref) // 81/90 = 0,90
    expect(hasTvaError(alerts)).toBe(true)
  })

  it('forecast correct (≈ réalisé) → aucune erreur TVA', () => {
    const alerts = validateForecast(month(40, 90), 31, ref)
    expect(hasTvaError(alerts)).toBe(false)
  })

  it('forecast très en dessous (hors zone TVA) → pas d’erreur TVA', () => {
    const alerts = validateForecast(month(40, 60), 31, ref) // 0,667 < 0,83
    expect(hasTvaError(alerts)).toBe(false)
  })

  it('aucune référence (mois futur) → aucune détection', () => {
    const alerts = validateForecast(month(40, 81), 31, null)
    expect(hasTvaError(alerts)).toBe(false)
  })

  it('périmètre égal : jours passés corrects + fin de mois moins chère → pas de faux positif', () => {
    // Jours 1-10 (réalisés) à l’ADR du réalisé (90) ; jours 11-31 projetés à 60
    // (saisonnalité). Restreint aux jours ≤ throughDay=10 → ratio 1,0 → pas d’erreur.
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => fRow(i + 1, 40, 90)),
      ...Array.from({ length: 21 }, (_, i) => fRow(i + 11, 40, 60)),
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
    const alerts = validateForecast([fRow(1, 0, 0), { ...fRow(2, 0, 0), revTTC: 100 }], 31, null)
    expect(alerts.some((a) => a.type === 'error')).toBe(true)
  })
  it('occupation sans revenu → avertissement', () => {
    const rows = month(40, 90).map((r) => ({ ...r, revTTC: 0 }))
    const alerts = validateForecast(rows, 31, null)
    expect(alerts.some((a) => a.type === 'warning')).toBe(true)
  })
  it('mois incomplet → avertissement', () => {
    const alerts = validateForecast([fRow(1, 40, 90)], 31, null)
    expect(alerts.some((a) => a.type === 'warning')).toBe(true)
  })
  it('un mois complet correct ne lève aucune alerte', () => {
    expect(validateForecast(month(40, 90), 31, { adrTTC: 90, throughDay: 31 })).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'

import { checkPmsFilesReceived } from '#/lib/repjour/pmsStatus.ts'

describe('checkPmsFilesReceived', () => {
  it('ne montre rien pendant la fenêtre d\'ingestion [02h,04h[', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T03:00:00'),
      comparisonReceived: false,
      forecastImportedAt: null,
    })
    expect(result.show).toBe(false)
  })

  it('ne montre rien hors fenêtre si les deux fichiers sont là', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: '2026-08-15T02:30:00',
    })
    expect(result.show).toBe(false)
    expect(result.message).toBe('')
  })

  it('une phrase unique, sans retour à la ligne, quand seul le Comparison manque', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T04:01:00'),
      comparisonReceived: false,
      forecastImportedAt: '2026-08-15T02:30:00',
    })
    expect(result.show).toBe(true)
    expect(result.message).not.toContain('\n')
    expect(result.message).toBe(
      "Le PMS n'a pas transmis les chiffres du jour (Comparison) : le rapport du 2026-08-14 ne sera pas envoyé automatiquement.",
    )
  })

  it('une phrase unique quand seul le Forecast manque (absent)', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: null,
    })
    expect(result.show).toBe(true)
    expect(result.message).not.toContain('\n')
    expect(result.message).toBe(
      "Le PMS n'a pas transmis les prévisions (Forecast) : le rapport du 2026-08-14 ne sera pas envoyé automatiquement.",
    )
  })

  it('une phrase unique quand le Forecast est périmé (>12h, cycle précédent)', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: '2026-08-13T02:30:00',
    })
    expect(result.show).toBe(true)
    expect(result.message).toContain('les prévisions (Forecast)')
  })

  it('une phrase unique quand les deux manquent, sans retour à la ligne ni liste', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: false,
      forecastImportedAt: null,
    })
    expect(result.show).toBe(true)
    expect(result.message).not.toContain('\n')
    expect(result.message).toBe(
      "Le PMS n'a transmis ni les chiffres du jour (Comparison) ni les prévisions (Forecast) : le rapport du 2026-08-14 ne sera pas envoyé automatiquement.",
    )
  })

  it('jonction de mois : un Forecast périmé mais PRÉSENT suffit (dernier jour du mois)', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-31',
      now: new Date('2026-09-01T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: '2026-08-20T02:30:00',
    })
    expect(result.show).toBe(false)
    expect(result.message).toBe('')
  })
})

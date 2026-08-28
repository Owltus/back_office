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
    expect(result.files.every((f) => f.received)).toBe(true)
  })

  it('montre le bandeau si le Comparison manque après 04h', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T04:01:00'),
      comparisonReceived: false,
      forecastImportedAt: '2026-08-15T02:30:00',
    })
    expect(result.show).toBe(true)
    expect(result.files[0]).toEqual({
      label: 'Chiffres du jour (Comparison)',
      received: false,
    })
    expect(result.files[1].received).toBe(true)
  })

  it('montre le bandeau si le Forecast est absent', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: null,
    })
    expect(result.show).toBe(true)
    expect(result.files[1]).toEqual({
      label: 'Prévisions (Forecast)',
      received: false,
    })
  })

  it('montre le bandeau si le Forecast est périmé (>12h, importé le cycle précédent)', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: '2026-08-13T02:30:00',
    })
    expect(result.show).toBe(true)
    expect(result.files[1].received).toBe(false)
  })

  it('jonction de mois : un Forecast périmé mais PRÉSENT suffit (dernier jour du mois)', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-31',
      now: new Date('2026-09-01T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: '2026-08-20T02:30:00',
    })
    expect(result.show).toBe(false)
    expect(result.files[1].received).toBe(true)
  })
})

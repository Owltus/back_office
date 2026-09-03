import { describe, expect, it } from 'vitest'

import { checkPmsFilesReceived } from '#/lib/repjour/pmsStatus.ts'

describe('checkPmsFilesReceived', () => {
  it("ne montre rien pendant la fenêtre d'ingestion [02h,04h[", () => {
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

  it('une phrase unique quand le Forecast est celui du cycle précédent', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: '2026-08-14T02:30:00',
    })
    expect(result.show).toBe(true)
    expect(result.message).toContain('les prévisions (Forecast)')
  })

  it("la fraîcheur se juge sur le cycle, pas sur l'heure de consultation (après-midi)", () => {
    // Forecast bien arrivé à 02h30 : consulté à 18h (>12h plus tard), il reste
    // celui du cycle → aucun bandeau. C'était le faux positif systématique.
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T18:00:00'),
      comparisonReceived: true,
      forecastImportedAt: '2026-08-15T02:30:00',
    })
    expect(result.show).toBe(false)
    expect(result.message).toBe('')
  })

  it('un Forecast importé la veille au soir (>= 14h) compte pour le cycle', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: '2026-08-14T15:00:00',
    })
    expect(result.show).toBe(false)
  })

  it('un Forecast importé la veille avant 14h ne compte pas pour le cycle', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: '2026-08-14T13:00:00',
    })
    expect(result.show).toBe(true)
    expect(result.message).toContain('les prévisions (Forecast)')
  })

  it('rapport envoyé : aucun bandeau même si un fichier semble manquer', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: null,
      sent: true,
    })
    expect(result.show).toBe(false)
    expect(result.message).toBe('')
  })

  it('rappel ignoré : aucun bandeau', () => {
    const result = checkPmsFilesReceived({
      date: '2026-08-14',
      now: new Date('2026-08-15T09:00:00'),
      comparisonReceived: true,
      forecastImportedAt: null,
      dismissed: true,
    })
    expect(result.show).toBe(false)
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

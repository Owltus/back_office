import { describe, expect, it } from 'vitest'

import { lastTouchLabel } from '#/lib/parking/format.ts'

/*
 * Survol d'une barre du planning : « quand cette réservation a-t-elle été
 * touchée pour la dernière fois ? ». Les horodatages arrivent en ISO depuis
 * Supabase (`timestamptz`), l'affichage est en heure locale française.
 */
describe('lastTouchLabel', () => {
  it('dit « Créée » tant que la ligne n a pas été modifiée', () => {
    // À l'insertion, created_at et updated_at prennent le même `now()`.
    const stamp = '2026-09-09T17:04:00.000Z'
    expect(lastTouchLabel({ createdAt: stamp, updatedAt: stamp })).toMatch(
      /^Créée le 09\/09\/2026 à \d{2}:\d{2}$/,
    )
  })

  it('dit « Modifiée » dès que les deux horodatages diffèrent', () => {
    expect(
      lastTouchLabel({
        createdAt: '2026-09-01T08:00:00.000Z',
        updatedAt: '2026-09-09T17:04:00.000Z',
      }),
    ).toMatch(/^Modifiée le 09\/09\/2026 à \d{2}:\d{2}$/)
  })

  it('rend la date et l heure au format français', () => {
    // Séparateurs `/` pour la date, `:` pour l'heure, « à » entre les deux —
    // sans dépendre du séparateur qu'Intl choisit selon la version d'ICU.
    const label = lastTouchLabel({
      createdAt: '2026-01-02T10:30:00.000Z',
      updatedAt: '2026-01-02T10:30:00.000Z',
    })
    expect(label).toContain('02/01/2026')
    expect(label).toContain(' à ')
  })

  it('rend null quand l horodatage manque (création locale non confirmée)', () => {
    expect(lastTouchLabel({})).toBeNull()
    expect(lastTouchLabel({ createdAt: '2026-09-09T17:04:00.000Z' })).toBeNull()
  })

  it('rend null plutôt qu une date fausse si la valeur est illisible', () => {
    expect(lastTouchLabel({ createdAt: 'x', updatedAt: 'pas-une-date' })).toBeNull()
  })
})

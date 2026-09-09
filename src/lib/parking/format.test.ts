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

  it('dit encore « Créée » quand le nom est saisi dans la foulée', () => {
    // Le flux de création pose la barre SANS nom, puis ouvre la saisie : cet
    // enregistrement est un `update` une ou deux secondes plus tard. Sans
    // fenêtre de grâce, presque aucune réservation ne serait jamais « créée ».
    expect(
      lastTouchLabel({
        createdAt: '2026-09-09T17:04:00.000Z',
        updatedAt: '2026-09-09T17:04:03.000Z',
      }),
    ).toMatch(/^Créée le 09\/09\/2026/)
  })

  it('dit « Modifiée » pour une retouche postérieure à la fenêtre', () => {
    expect(
      lastTouchLabel({
        createdAt: '2026-09-01T08:00:00.000Z',
        updatedAt: '2026-09-09T17:04:00.000Z',
      }),
    ).toMatch(/^Modifiée le 09\/09\/2026 à \d{2}:\d{2}$/)
  })

  it('bascule sur « Modifiée » juste après la fenêtre de deux minutes', () => {
    const createdAt = '2026-09-09T17:00:00.000Z'
    expect(
      lastTouchLabel({ createdAt, updatedAt: '2026-09-09T17:02:00.000Z' }),
    ).toMatch(/^Créée /)
    expect(
      lastTouchLabel({ createdAt, updatedAt: '2026-09-09T17:02:01.000Z' }),
    ).toMatch(/^Modifiée /)
  })

  it('date la CRÉATION quand elle dit « Créée », la retouche sinon', () => {
    // Créée à 17:00, nommée à 17:01 → on affiche 17:00, pas 17:01.
    const label = lastTouchLabel({
      createdAt: '2026-09-09T15:00:00.000Z',
      updatedAt: '2026-09-09T15:01:00.000Z',
    })
    const heure = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date('2026-09-09T15:00:00.000Z'))
    expect(label).toBe(`Créée le 09/09/2026 à ${heure}`)
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

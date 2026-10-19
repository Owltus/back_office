import { describe, expect, it } from 'vitest'

import { agregerStats } from '#/lib/classeur/statsClasseurs.ts'
import type { LigneStatsChapitre } from '#/lib/classeur/statsClasseurs.ts'

const ligne = (
  classeur_id: number,
  updated_at: string,
  dernier?: string,
): LigneStatsChapitre => ({
  classeur_id,
  updated_at,
  dernier: dernier ? [{ updated_at: dernier }] : [],
})

describe('agregerStats', () => {
  it('une entrée par classeur, dans l’ordre de première apparition', () => {
    const s = agregerStats([
      ligne(2, '2026-09-01T00:00:00Z'),
      ligne(5, '2026-09-03T00:00:00Z'),
      ligne(2, '2026-09-02T00:00:00Z'),
    ])
    expect(s).toEqual([
      { classeurId: 2, misAJour: '2026-09-02T00:00:00Z' },
      { classeurId: 5, misAJour: '2026-09-03T00:00:00Z' },
    ])
  })

  it('date de mise à jour = la plus récente, chapitre ou document', () => {
    const [s] = agregerStats([
      ligne(1, '2026-09-10T00:00:00Z', '2026-09-20T08:00:00Z'),
      ligne(1, '2026-10-02T00:00:00Z'),
      ligne(1, '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z'),
    ])
    expect(s.misAJour).toBe('2026-10-02T00:00:00Z')
  })

  it('compare les instants, pas le texte (fuseaux différents)', () => {
    const [s] = agregerStats([
      ligne(1, '2026-10-02T01:00:00+02:00'),
      ligne(1, '2026-10-01T23:30:00Z'),
    ])
    // 01:00+02:00 = 23:00Z la veille : la seconde est plus récente.
    expect(s.misAJour).toBe('2026-10-01T23:30:00Z')
  })

  it('document absent ou embarqué vide : date du chapitre', () => {
    const [s] = agregerStats([
      {
        classeur_id: 3,
        updated_at: 'illisible',
        dernier: null,
      },
      {
        classeur_id: 3,
        updated_at: '2026-09-05T00:00:00Z',
        dernier: [],
      },
    ])
    expect(s).toEqual({
      classeurId: 3,
      misAJour: '2026-09-05T00:00:00Z',
    })
  })

  it('aucune ligne : aucun classeur', () => {
    expect(agregerStats([])).toEqual([])
  })
})

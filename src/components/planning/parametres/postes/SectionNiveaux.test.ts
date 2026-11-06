import { describe, expect, it } from 'vitest'

import {
  cleNiveauNeuve,
  usagesNiveau,
} from '#/components/planning/parametres/postes/SectionNiveaux.tsx'
import type { Besoin, Salarie } from '#/lib/planning/types.ts'

describe('les niveaux dans Postes (2026-11-06)', () => {
  it('une clé neuve ne reprend jamais une clé prise', () => {
    expect(cleNiveauNeuve([{ id: 'a' }])).toBe('niveau_1')
    expect(cleNiveauNeuve([{ id: 'niveau_1' }, { id: 'niveau_2' }])).toBe(
      'niveau_3',
    )
  })
  it('un niveau est utilisé par une fiche ou par un besoin', () => {
    const r = {
      salaries: [
        { competences: [{ poste_id: 1, niveau: 'chef' }] },
      ] as Salarie[],
      besoins: [
        { niveau_min: 'chef' },
        { niveaux: [{ niveau: 'aide', nombre: 2 }] },
      ] as Besoin[],
    }
    expect(usagesNiveau(r, 'chef')).toEqual({ personnes: 1, besoins: 1 })
    expect(usagesNiveau(r, 'aide')).toEqual({ personnes: 0, besoins: 1 })
    expect(usagesNiveau(r, 'libre')).toEqual({ personnes: 0, besoins: 0 })
  })
})

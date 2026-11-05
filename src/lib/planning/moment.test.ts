import { describe, expect, it } from 'vitest'

import { avecMomentCalcule, momentPropose } from '#/lib/planning/moment.ts'

describe('moment calculé (2026-11-05)', () => {
  it('le moment vient des heures, jamais de la base', () => {
    // Une nuit enregistrée « matin » par erreur redevient une nuit.
    const h = {
      debut: '23:00',
      fin: '07:00',
      pause: 0,
      periode: 'matin' as const,
    }
    expect(avecMomentCalcule(h).periode).toBe('nuit')
    // Déjà juste : le même objet (aucune copie inutile).
    const m = {
      debut: '07:00',
      fin: '15:45',
      pause: 45,
      periode: 'matin' as const,
    }
    expect(avecMomentCalcule(m)).toBe(m)
    // Un moment null (ancien « à part ») prend celui des heures.
    expect(
      avecMomentCalcule({
        debut: '11:00',
        fin: '19:45',
        pause: 45,
        periode: null,
      }).periode,
    ).toBe('middle')
  })

  it('le nom de l’horaire n’y est pour rien', () => {
    const base = { debut: '14:00', fin: '22:45', pause: 45, nom: 'Courgette' }
    expect(momentPropose(base)).toBe('soir')
    expect(momentPropose({ ...base, nom: 'Matin' } as typeof base)).toBe('soir')
  })
})

import { describe, expect, it } from 'vitest'
import { messageGeneration, parGroupe } from '#/lib/planning/affichage.ts'

describe('messageGeneration', () => {
  it('complet seulement sans place à pourvoir', () => {
    expect(messageGeneration(0)).toBe('Planning complet généré.')
    expect(messageGeneration(0, 'Mois')).toBe('Mois complet généré.')
  })

  it('jamais complet quand une place reste, accord du nombre', () => {
    expect(messageGeneration(1)).toBe(
      'Planning généré. 1 place reste à pourvoir.',
    )
    expect(messageGeneration(3, 'Mois')).toBe(
      'Mois généré. 3 places restent à pourvoir.',
    )
    expect(messageGeneration(3)).not.toMatch(/complet/)
  })
})

describe('parGroupe', () => {
  it('range les personnes sans groupe sous « Sans groupe »', () => {
    const r = parGroupe([{ groupe_id: null }, { groupe_id: 9 }], [])
    expect(r).toEqual([
      {
        id: 0,
        nom: 'Sans groupe',
        membres: [{ groupe_id: null }, { groupe_id: 9 }],
      },
    ])
  })
})

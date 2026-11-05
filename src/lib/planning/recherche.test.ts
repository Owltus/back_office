import { describe, expect, it } from 'vitest'

import { lireReglagesSearch } from '#/lib/planning/recherche.ts'

describe('lireReglagesSearch', () => {
  it('garde les cibles des points À vérifier, partie de fiche comprise', () => {
    for (const ouvrir of [
      'poste-3',
      'salarie-10.semaine',
      'presence',
      'releve',
      'regles',
      'moments',
    ])
      expect(lireReglagesSearch({ ouvrir })).toEqual({ ouvrir })
  })

  it('refuse une cible mal formée', () => {
    for (const ouvrir of ['Poste-3', 'salarie-.x', 'a-1.b.c', 3])
      expect(lireReglagesSearch({ ouvrir })).toEqual({})
  })
})

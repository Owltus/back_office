import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  basculerMode,
  modeDe,
  modificationPermise,
} from '#/components/planning/parametres/reglages/tousOuCertains.ts'
import { competencesPerdues } from '#/components/planning/parametres/equipe/GestionCategories.tsx'
import type { Salarie } from '#/lib/planning/types.ts'

/*
 * « Tous » ou « Seulement ceux-ci » (étape 3) : le mode se lit dans la
 * liste, « Tous » garde la sélection de côté, « Seulement ceux-ci » ne
 * produit jamais une liste vide (qui voudrait dire « tous » en base).
 */

describe('tous ou certains', () => {
  it('le mode se lit dans la liste : vide = tous', () => {
    expect(modeDe([])).toBe('tous')
    expect(modeDe([3])).toBe('certains')
  })

  it('Tous vide la liste et garde la sélection de côté', () => {
    expect(basculerMode('tous', [1, 2], [], [1, 2, 3])).toEqual({
      choisis: [],
      memoire: [1, 2],
    })
  })

  it('revenir à Seulement reprend la sélection gardée', () => {
    const tous = basculerMode('tous', [1, 2], [], [1, 2, 3])
    expect(basculerMode('certains', [], tous.memoire, [1, 2, 3])).toEqual({
      choisis: [1, 2],
      memoire: [1, 2],
    })
  })

  it('sans sélection gardée, Seulement démarre avec tout coché', () => {
    expect(basculerMode('certains', [], [], [1, 2, 3]).choisis).toEqual([
      1, 2, 3,
    ])
  })

  it('une sélection gardée qui n est plus proposée est ignorée', () => {
    expect(basculerMode('certains', [], [9], [1, 2]).choisis).toEqual([1, 2])
    expect(basculerMode('certains', [], [9, 2], [1, 2]).choisis).toEqual([2])
  })

  it('décocher le dernier est refusé, un code mort ne compte pas', () => {
    expect(modificationPermise([], [1, 2])).toBeNull()
    expect(modificationPermise([9], [1, 2])).toBeNull()
    expect(modificationPermise([2], [1, 2])).toEqual([2])
  })

  it('propriété : décocher un par un ne produit jamais une liste vide', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 40 }), {
          minLength: 1,
          maxLength: 12,
        }),
        fc.array(fc.nat(), { maxLength: 30 }),
        (proposes, coups) => {
          let choisis = basculerMode('certains', [], [], proposes).choisis
          for (const c of coups) {
            const id = proposes[c % proposes.length]
            const suivante = choisis.includes(id)
              ? choisis.filter((x) => x !== id)
              : [...choisis, id]
            choisis = modificationPermise(suivante, proposes) ?? choisis
            expect(choisis.length).toBeGreaterThan(0)
            expect(modeDe(choisis)).toBe('certains')
          }
        },
      ),
    )
  })
})

describe('competencesPerdues', () => {
  const membre = (id: number, groupe: number, postes: number[]) =>
    ({
      id,
      groupe_id: groupe,
      competences: postes.map((poste_id) => ({
        poste_id,
        niveau: 'titulaire',
      })),
    }) as unknown as Salarie
  const equipe = [
    membre(1, 7, [1, 2]),
    membre(2, 7, [2]),
    membre(3, 7, [3]),
    membre(4, 8, [1, 3]),
  ]

  it('passer à Tous ne retire rien', () => {
    expect(competencesPerdues(7, [], equipe)).toEqual({
      personnes: 0,
      competences: 0,
    })
  })

  it('compte les postes tenus que la restriction retire, groupe seul', () => {
    expect(competencesPerdues(7, [2], equipe)).toEqual({
      personnes: 2,
      competences: 2,
    })
    expect(competencesPerdues(8, [1], equipe)).toEqual({
      personnes: 1,
      competences: 1,
    })
  })

  it('revenir de Tous à une sélection gardée compte ce qu elle retire', () => {
    const gardee = basculerMode('tous', [1, 2], [], [1, 2, 3]).memoire
    const reprise = basculerMode('certains', [], gardee, [1, 2, 3]).choisis
    // Le membre 3 a pris le poste 3 pendant que le groupe était sur Tous.
    expect(competencesPerdues(7, reprise, equipe)).toEqual({
      personnes: 1,
      competences: 1,
    })
  })

  it('tout coché ne retire rien', () => {
    expect(competencesPerdues(7, [1, 2, 3], equipe).competences).toBe(0)
  })
})

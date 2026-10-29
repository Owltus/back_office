import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  codesDeSesPostes,
  codesMorts,
  codesParPoste,
  codesSemaineType,
} from '#/components/planning/parametres/equipe/codesFiche.ts'
import { codesPermis } from '#/lib/planning/eligibilite.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { JourType, Salarie } from '#/lib/planning/types.ts'

/*
 * Les codes vus depuis la fiche (étape 4) : union des postes, ce qui reste
 * par poste, codes morts, et la semaine type qui ne propose que ce que la
 * règle unique permet. Hôtel fictif : M=1, MI=2, AM=3, N=4, D=5, T=6, TV=7 ;
 * Réception=2 et Club=3 (M, MI, AM), Veille de nuit=4 (N).
 */

const { referentiel } = hotelDemo('2026-11-02')
const { postes, horaires } = referentiel
const ids = (hs: Array<{ id: number }>) => hs.map((h) => h.id)
const libre: JourType = {
  mode: 'auto',
  type_shift_id: null,
  type_absence_id: null,
}

function fiche(
  postesTenus: number[],
  shifts_autorises: number[] = [],
  semaine_type: JourType[] = Array.from({ length: 7 }, () => ({ ...libre })),
): Pick<
  Salarie,
  'competences' | 'shifts_autorises' | 'semaine_type' | 'mineur'
> {
  return {
    competences: postesTenus.map((poste_id) => ({
      poste_id,
      niveau: 'titulaire' as const,
    })),
    shifts_autorises,
    semaine_type,
    mineur: false,
  }
}

describe('codes de la fiche', () => {
  it('union des codes de ses postes, tous sans poste', () => {
    expect(ids(codesDeSesPostes(fiche([2, 4]), postes, horaires))).toEqual([
      1, 2, 3, 4,
    ])
    expect(codesDeSesPostes(fiche([]), postes, horaires)).toHaveLength(7)
  })

  it('par poste : ses codes, et ce qui en reste pour elle', () => {
    const lignes = codesParPoste(fiche([2, 4], [3]), postes, horaires)
    expect(
      lignes.map((l) => [l.poste.id, ids(l.codes), ids(l.utilisables)]),
    ).toEqual([
      [2, [1, 2, 3], [3]],
      [4, [4], []],
    ])
  })

  it('codes morts : cochés, prévus par aucun de ses postes', () => {
    expect(ids(codesMorts(fiche([2], [1, 6]), postes, horaires))).toEqual([6])
    expect(codesMorts(fiche([2], []), postes, horaires)).toEqual([])
  })

  it('semaine type : seulement ce que la règle permet, le code du jour mis de côté', () => {
    const semaine = Array.from({ length: 7 }, () => ({ ...libre }))
    semaine[0] = { mode: 'travail', type_shift_id: 3, type_absence_id: null }
    // Fiche restreinte à M et AM : le lundi fixé sur AM propose M et AM.
    expect(
      ids(codesSemaineType(fiche([2], [1, 3], semaine), postes, horaires, 0)),
    ).toEqual([1, 3])
    // Un code fixé hors de ses postes n'est pas proposé.
    semaine[1] = { mode: 'travail', type_shift_id: 4, type_absence_id: null }
    expect(
      ids(codesSemaineType(fiche([2], [], semaine), postes, horaires, 1)),
    ).toEqual([1, 2, 3])
  })

  it('propriété : chaque code proposé passe codesPermis sur un de ses postes, aucun code mort', () => {
    const postesIds = postes.map((p) => p.id)
    const horairesIds = horaires.map((h) => h.id)
    fc.assert(
      fc.property(
        fc.subarray(postesIds),
        fc.subarray(horairesIds),
        fc.integer({ min: 0, max: 6 }),
        (tenus, autorises, jour) => {
          const b = fiche(tenus, autorises)
          const proposes = codesSemaineType(b, postes, horaires, jour)
          const morts = new Set(ids(codesMorts(b, postes, horaires)))
          for (const h of proposes) {
            expect(morts.has(h.id)).toBe(false)
            const surUnPoste = (tenus.length ? tenus : [undefined]).some((id) =>
              codesPermis({
                personne: b,
                poste: postes.find((p) => p.id === id),
                jour,
                horaires,
              }).codes.some((c) => c.id === h.id),
            )
            expect(surUnPoste).toBe(true)
          }
        },
      ),
    )
  })
})

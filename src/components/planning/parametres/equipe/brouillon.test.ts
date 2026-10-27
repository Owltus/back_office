import { describe, expect, it } from 'vitest'

import {
  brouillonVierge,
  erreurBrouillon,
  fusionnerAbsences,
  horsSemainesVerrouillees,
  joursDesPeriodes,
  joursFusionnes,
  periodesDe,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import type { PeriodeBrouillon } from '#/components/planning/parametres/equipe/brouillon.ts'

/*
 * Absences de la fiche : enregistrement en trois temps (base relue, jours à
 * l'ouverture, saisie), semaines verrouillées laissées telles quelles, et
 * périodes refusées pour la bonne raison (jamais une période lue en base).
 */

const jours = (...l: Array<[string, number]>) => new Map(l)

describe('fusionnerAbsences', () => {
  it('garde un jour posé en base depuis l’ouverture de la fiche', () => {
    const base = jours(['2026-11-10', 1], ['2026-11-12', 2])
    const initial = jours(['2026-11-12', 2])
    const voulu = jours(['2026-11-12', 2], ['2026-11-13', 1])
    const d = fusionnerAbsences(base, initial, voulu)
    expect(d.retirer).toEqual([])
    expect([...d.poser]).toEqual([[1, ['2026-11-13']]])
    expect([...joursFusionnes(base, initial, voulu)].sort()).toEqual([
      ['2026-11-10', 1],
      ['2026-11-12', 2],
      ['2026-11-13', 1],
    ])
  })
  it('retire ce que la saisie retire, s’il est encore en base', () => {
    const initial = jours(['2026-11-12', 2], ['2026-11-13', 2])
    const base = jours(['2026-11-12', 2])
    const d = fusionnerAbsences(base, initial, new Map())
    expect(d.retirer).toEqual(['2026-11-12'])
    expect(d.poser.size).toBe(0)
  })
  it('ne réécrit pas un jour déjà au bon motif', () => {
    const base = jours(['2026-11-12', 3])
    const d = fusionnerAbsences(base, new Map(), jours(['2026-11-12', 3]))
    expect(d.poser.size).toBe(0)
  })
})

describe('horsSemainesVerrouillees', () => {
  it('retire les jours des semaines verrouillées et les compte', () => {
    const { diff, gardes } = horsSemainesVerrouillees(
      {
        poser: new Map([[1, ['2026-11-04', '2026-11-10']]]),
        retirer: ['2026-11-08', '2026-11-09'],
      },
      ['2026-11-02'],
    )
    expect([...diff.poser]).toEqual([[1, ['2026-11-10']]])
    expect(diff.retirer).toEqual(['2026-11-09'])
    // Le dimanche 8 appartient à la semaine du lundi 2.
    expect(gardes).toEqual(['2026-11-04', '2026-11-08'])
  })
})

describe('périodes d’absence', () => {
  const avec = (absences: PeriodeBrouillon[]) => ({
    ...brouillonVierge(),
    prenom: 'Léa',
    absences,
  })

  it('une longue période lue en base ne bloque pas, et compte tous ses jours', () => {
    const lues = periodesDe(
      Array.from({ length: 4 * 366 }, (_, i) => ({
        id: i,
        salarie_id: 1,
        jour: new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10),
        motif_id: 1,
      })),
    )
    expect(lues).toHaveLength(1)
    expect(erreurBrouillon(avec(lues))).toBeNull()
    expect(joursDesPeriodes(lues).size).toBe(4 * 366)
  })
  it('la même période, retouchée, est refusée pour sa longueur', () => {
    const p: PeriodeBrouillon = {
      cle: 1,
      debut: '2026-11-02',
      fin: '2030-12-31',
      motif_id: 1,
      lue: '2026-11-02|2030-11-01|1',
    }
    expect(erreurBrouillon(avec([p]))).toMatch(/dépasse trois ans/)
  })
  it('chaque défaut a son message', () => {
    const p = (debut: string, fin: string): PeriodeBrouillon => ({
      cle: 1,
      debut,
      fin,
      motif_id: 1,
    })
    expect(erreurBrouillon(avec([p('', '2026-11-02')]))).toMatch(/incomplète/)
    expect(erreurBrouillon(avec([p('2026-11-05', '2026-11-02')]))).toMatch(
      /finit avant de commencer/,
    )
    expect(erreurBrouillon(avec([p('2026-11-02', '2026-11-05')]))).toBeNull()
  })
})

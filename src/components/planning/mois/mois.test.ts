import { describe, expect, it } from 'vitest'

import { analyser } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Affectation } from '#/lib/planning/types.ts'
import {
  caseDe,
  cleBandeau,
  compter,
  etatSemaine,
  joursDuMois,
  listeSemaines,
  lundisDe,
  moisDecale,
} from '#/components/planning/mois/mois.ts'

describe('calendrier du mois', () => {
  it('jours, semaines et décalage de mois', () => {
    const jours = joursDuMois('2026-11')
    expect(jours).toHaveLength(30)
    expect(lundisDe(jours)).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
    expect(moisDecale('2026-12', 1)).toBe('2027-01')
    expect(moisDecale('2026-01', -1)).toBe('2025-12')
    expect(
      listeSemaines(['2026-11-02', '2026-11-09', '2026-11-16'], (l) =>
        Number(l.slice(8)),
      ),
    ).toBe('S2, S9 et S16')
  })

  it('état d’une semaine : passée, verrouillée, avant le réalisé, ouverte', () => {
    const verrous = ['2026-11-16']
    expect(etatSemaine('2026-10-26', verrous, '2026-11-04')).toMatchObject({
      passee: true,
      ouverte: false,
    })
    expect(etatSemaine('2026-11-02', verrous, '2026-11-04')).toMatchObject({
      avantLeRealise: true,
      ouverte: false,
    })
    expect(etatSemaine('2026-11-16', verrous, '2026-11-04')).toMatchObject({
      verrouillee: true,
      ouverte: false,
    })
    expect(etatSemaine('2026-11-23', verrous, '2026-11-04').ouverte).toBe(true)
  })
})

describe('cases et compteurs', () => {
  const lundi = '2026-10-26'
  const { referentiel, absences } = hotelDemo(lundi)
  const shift = (id: number, jour: number, epinglee: boolean): Affectation => ({
    id,
    lundi,
    salarie_id: 3,
    poste_id: 2,
    jour,
    horaire_id: 1,
    debut: '07:00',
    fin: '15:45',
    epinglee,
    court: false,
    pause: 45,
  })
  const sem = analyser({
    lundi,
    referentiel,
    absences,
    // Jour 0 = 26 octobre, jour 6 = 1er novembre.
    affectations: [shift(1, 0, false), shift(2, 6, true)],
    avant: [],
    apres: [],
  })
  const semaines = new Map([[lundi, sem]])

  it('le compteur de validation ne compte que les jours du mois', () => {
    const c = compter('2026-11', [sem])
    expect(c).toMatchObject({ propositions: 0, valides: 1, verrouilles: 0 })
    expect(compter('2026-10', [sem])).toMatchObject({
      propositions: 1,
      valides: 0,
    })
  })

  it('une case lit le shift, un jour vide non sûr reste non attribué', () => {
    expect(caseDe(semaines, referentiel.motifs, 3, '2026-10-26')?.type).toBe(
      'shift',
    )
    // Lucas a des shifts cette semaine, mais pas sa semaine complète : ses
    // autres jours restent « non attribués » (un repos n'est pas posé).
    expect(caseDe(semaines, referentiel.motifs, 3, '2026-10-28')).toBeNull()
    expect(cleBandeau({ type: 'repos', fixe: false })).toBe('repos')
    expect(
      cleBandeau(caseDe(semaines, referentiel.motifs, 3, '2026-10-26')),
    ).toBeNull()
  })
})

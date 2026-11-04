import { describe, expect, it } from 'vitest'

import { analyser } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { reposProposesParJour } from '#/components/planning/semaine/edition.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Affectation } from '#/lib/planning/types.ts'
import {
  caseDe,
  cleBandeau,
  compter,
  etatSemaine,
  joursAffiches,
  joursDuMois,
  listeSemaines,
  lundisDe,
  moisDecale,
  placesAPourvoir,
  validationDeCase,
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

  it('la grille montre toujours des semaines entières (2026-11-04)', () => {
    // Novembre 2026 : du dimanche 1er au lundi 30. La grille va du lundi
    // 26 octobre au dimanche 6 décembre : 6 semaines de 7 jours.
    const jours = joursAffiches('2026-11')
    expect(jours).toHaveLength(42)
    expect(jours[0]).toBe('2026-10-26')
    expect(jours.at(-1)).toBe('2026-12-06')
    expect(lundisDe(jours)).toEqual(lundisDe(joursDuMois('2026-11')))
    // Un mois qui commence un lundi et finit un dimanche : rien de plus.
    expect(joursAffiches('2027-02')).toEqual(joursDuMois('2027-02'))
  })

  it('état d’une semaine : passée, verrouillée, ouverte (U8)', () => {
    const verrous = ['2026-11-16']
    expect(etatSemaine('2026-10-26', verrous, '2026-11-04')).toMatchObject({
      passee: true,
      ouverte: false,
    })
    // Avant le dernier verrou mais ni passée ni verrouillée : ouverte.
    expect(etatSemaine('2026-11-02', verrous, '2026-11-04').ouverte).toBe(true)
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

  it('double-clic : ce qui se valide dans une case (2026-10-31)', () => {
    const c = (date: string) => caseDe(semaines, referentiel.motifs, 3, date)
    // Shift proposé, puis shift validé.
    expect(validationDeCase(c('2026-10-26'))).toEqual({
      valide: false,
      deduit: false,
    })
    expect(validationDeCase(c('2026-11-01'))).toEqual({
      valide: true,
      deduit: false,
    })
    // Case vide, repos fixe, hors contrat : rien à basculer.
    expect(validationDeCase(c('2026-10-28'))).toBeNull()
    expect(
      validationDeCase({ type: 'repos', fixe: true, proposition: false }),
    ).toBeNull()
    expect(validationDeCase({ type: 'hors', fixe: true })).toBeNull()
    // Repos déduit : proposition, écrit en base à la validation.
    expect(
      validationDeCase({ type: 'repos', fixe: false, proposition: true }),
    ).toEqual({ valide: false, deduit: true })
  })

  it('le compteur de validation ne compte que les jours du mois', () => {
    // Les repos en proposition (déduits) comptent avec les shifts proposés,
    // jour par jour (2026-10-31).
    const repos = reposProposesParJour(sem)
    const c = compter('2026-11', [sem])
    expect(c).toMatchObject({
      propositions: repos[6],
      valides: 1,
      verrouilles: 0,
    })
    expect(compter('2026-10', [sem])).toMatchObject({
      propositions: 1 + repos.slice(0, 6).reduce((a, b) => a + b, 0),
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
    expect(cleBandeau({ type: 'repos', fixe: true, proposition: false })).toBe(
      'repos',
    )
    // Repos déduit : une proposition, son bandeau à part (2026-10-31).
    expect(cleBandeau({ type: 'repos', fixe: false, proposition: true })).toBe(
      'repos-proposition',
    )
    expect(
      cleBandeau(caseDe(semaines, referentiel.motifs, 3, '2026-10-26')),
    ).toBeNull()
  })
})

describe('placesAPourvoir', () => {
  it('seulement les jours du mois, à partir d’aujourd’hui', () => {
    const sem = (lundi: string, jours: number[]) =>
      ({
        lundi,
        a_pourvoir: jours.map((jour) => ({ jour, manquant: 1 })),
      }) as unknown as SemaineOut
    // Semaine du 26/10 au 01/11 : lundi 26 passé, dimanche 1er en novembre.
    const semaines = [sem('2026-10-26', [0, 1, 6]), sem('2026-11-02', [0, 3])]
    expect(placesAPourvoir('2026-11', '2026-10-27', semaines)).toBe(3)
    expect(placesAPourvoir('2026-10', '2026-10-27', semaines)).toBe(1)
    expect(placesAPourvoir('2026-11', '2026-11-05', semaines)).toBe(1)
  })
})

describe('couverture du mois', () => {
  it('une semaine à cheval ne compte que ses jours du mois', () => {
    const sem = (lundi: string, places: number[], pourvues: number[]) =>
      ({
        lundi,
        affectations: [],
        a_pourvoir: [],
        presence: [],
        bilan: [],
        stats: {
          places: 0,
          pourvues: 0,
          places_jour: places,
          pourvues_jour: pourvues,
          infractions: 0,
          alertes_organisation: 0,
        },
      }) as unknown as SemaineOut
    // Semaine du 26 octobre : seul le dimanche 1er est en novembre.
    const s1 = sem('2026-10-26', [5, 5, 5, 5, 5, 5, 5], [0, 5, 5, 5, 5, 5, 4])
    const s2 = sem('2026-11-02', [5, 5, 5, 5, 5, 5, 5], [5, 5, 5, 5, 5, 5, 5])
    expect(compter('2026-11', [s1, s2])).toMatchObject({
      places: 40,
      pourvues: 39,
    })
    expect(compter('2026-10', [s1])).toMatchObject({ places: 30, pourvues: 25 })
  })
})

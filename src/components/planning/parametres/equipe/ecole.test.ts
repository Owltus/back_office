import { describe, expect, it } from 'vitest'

import {
  diffAbsences,
  joursDesPeriodes,
  planEvolution,
  brouillonVierge,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import {
  appliquerRythme,
  avecJoursEcole,
  basculerSemaine,
  etatSemaine,
  joursEcole,
  lundisEcole,
} from '#/components/planning/parametres/equipe/ecole.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'

/*
 * Calendrier d'école et absences jour par jour : logique pure. Oracles
 * écrits à la main (lundis du calendrier 2026).
 */

const ECOLE = 2
const lundis = lundisEcole('2026-10-28') // un mercredi : la semaine du 26/10

describe('calendrier d école', () => {
  it('26 lundis à partir de la semaine courante', () => {
    expect(lundis).toHaveLength(26)
    expect(lundis[0]).toBe('2026-10-26')
    expect(lundis[1]).toBe('2026-11-02')
    expect(lundis[25]).toBe('2027-04-19')
  })

  it('rythme 1 semaine d école, 2 à l hôtel : une semaine sur trois, du lundi au vendredi', () => {
    const jours = appliquerRythme(new Set(), lundis, {
      ecole: 1,
      hotel: 2,
      depart: lundis[0],
    })
    const ecole = lundis.filter((l) => etatSemaine(jours, l) === 'ecole')
    expect(ecole).toEqual(lundis.filter((_, k) => k % 3 === 0))
    expect(jours.has('2026-10-30')).toBe(true) // vendredi
    expect(jours.has('2026-10-31')).toBe(false) // samedi
    expect(jours.size).toBe(9 * 5)
  })

  it('rythme 2 puis 1, dès la 3e semaine : remplit et EFFACE à partir de là seulement', () => {
    const avant = basculerSemaine(
      basculerSemaine(new Set(), lundis[0]),
      lundis[3],
    )
    const jours = appliquerRythme(avant, lundis, {
      ecole: 2,
      hotel: 1,
      depart: lundis[2],
    })
    const etats = lundis.slice(0, 8).map((l) => etatSemaine(jours, l))
    // S0 gardée (avant le départ), S1 vide, puis école, école, hôtel…
    expect(etats).toEqual([
      'ecole',
      '',
      'ecole',
      'ecole',
      '',
      'ecole',
      'ecole',
      '',
    ])
  })

  it('une semaine pleine se vide au clic, une partielle se remplit', () => {
    const plein = basculerSemaine(new Set(), lundis[1])
    expect(etatSemaine(plein, lundis[1])).toBe('ecole')
    expect(etatSemaine(basculerSemaine(plein, lundis[1]), lundis[1])).toBe('')
    const partiel = new Set(['2026-11-03'])
    expect(etatSemaine(partiel, lundis[1])).toBe('partielle')
    expect(etatSemaine(basculerSemaine(partiel, lundis[1]), lundis[1])).toBe(
      'ecole',
    )
  })

  it('les jours d école deviennent des périodes ; les autres absences restent', () => {
    const conges = {
      cle: 1,
      debut: '2026-12-21',
      fin: '2026-12-27',
      motif_id: 1,
    }
    const encours = {
      cle: 2,
      debut: '2026-11-',
      fin: '2026-11-20',
      motif_id: ECOLE,
    }
    const jours = basculerSemaine(new Set(), lundis[1])
    const periodes = avecJoursEcole([conges, encours], ECOLE, jours)
    expect(
      periodes.map(({ debut, fin, motif_id }) => [debut, fin, motif_id]),
    ).toEqual([
      ['2026-12-21', '2026-12-27', 1],
      ['2026-11-', '2026-11-20', ECOLE],
      ['2026-11-02', '2026-11-06', ECOLE],
    ])
    expect(joursEcole(periodes, ECOLE).size).toBe(5)
  })
})

describe('absences jour par jour', () => {
  it('une période couvre chaque jour, week-end compris', () => {
    const jours = joursDesPeriodes([
      { cle: 1, debut: '2026-11-06', fin: '2026-11-09', motif_id: 1 },
    ])
    expect([...jours.keys()]).toEqual([
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
    ])
  })

  it('le diff ne touche que les jours qui changent', () => {
    const avant = new Map([
      ['2026-11-02', 1],
      ['2026-11-03', 1],
      ['2026-11-04', 3],
    ])
    const apres = new Map([
      ['2026-11-03', 1],
      ['2026-11-04', 1],
      ['2026-11-05', 1],
    ])
    const d = diffAbsences(avant, apres)
    expect(d.retirer).toEqual(['2026-11-02'])
    expect([...d.poser]).toEqual([[1, ['2026-11-04', '2026-11-05']]])
  })

  it('évolution de contrat : l ancien se ferme la veille, le nouveau reprend les congés à venir sans l école', () => {
    const { referentiel } = hotelDemo('2026-11-02')
    const b = {
      ...brouillonVierge(3),
      id: 11,
      prenom: 'Chloé',
      type_contrat: 'apprenti' as const,
      heures_hebdo: 35,
      competences: [
        { poste_id: 2, niveau: 'titulaire' as const },
        { poste_id: 3, niveau: 'soutien' as const },
      ],
      absences: [
        { cle: 1, debut: '2026-11-02', fin: '2026-11-13', motif_id: 1 },
        { cle: 2, debut: '2026-11-16', fin: '2026-11-20', motif_id: ECOLE },
      ],
    }
    const plan = planEvolution(
      b,
      {
        date: '2026-11-10',
        type_contrat: 'cdi',
        groupe_id: 2,
        heures_hebdo: 39,
      },
      referentiel.postes,
      referentiel.groupes,
      referentiel.motifs,
    )
    expect(plan.finAncien).toBe('2026-11-09')
    expect(plan.ancien.date_sortie).toBe('2026-11-09')
    expect(plan.nouveau).toMatchObject({
      suite_de: 11,
      date_entree: '2026-11-10',
      type_contrat: 'cdi',
      heures_hebdo: 39,
      groupe_id: 2,
      competences: [
        { poste_id: 2, niveau: 'titulaire' },
        { poste_id: 3, niveau: 'titulaire' },
      ],
    })
    expect([...plan.joursAncien.keys()].at(-1)).toBe('2026-11-09')
    expect([...plan.joursNouveau.keys()]).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ])
  })
})

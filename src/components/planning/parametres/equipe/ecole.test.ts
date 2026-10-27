import { describe, expect, it } from 'vitest'

import {
  diffAbsences,
  joursDesPeriodes,
  planEvolution,
  brouillonVierge,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import {
  anneeScolaire,
  appliquerCfa,
  avecJoursEcole,
  basculerSemaine,
  etatSemaine,
  joursEcole,
  lireDatesCfa,
  moisEntre,
  peindre,
  periodesEcole,
  plage,
  prochainePeriode,
  shiftsSurEcole,
} from '#/components/planning/parametres/equipe/ecole.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'

/*
 * Calendrier d'école et absences jour par jour : logique pure. Oracles
 * écrits à la main (calendrier 2026-2027 : le 28/09/2026 est un lundi).
 */

const ECOLE = 2
const AUJ = '2026-10-28' // un mercredi
const L = '2026-11-02' // un lundi

describe('calendrier d école', () => {
  it('année scolaire : du 1er septembre au 31 août', () => {
    expect(anneeScolaire(AUJ)).toEqual({
      debut: '2026-09-01',
      fin: '2027-08-31',
    })
    expect(anneeScolaire('2027-08-31').debut).toBe('2026-09-01')
    expect(anneeScolaire('2027-09-01').debut).toBe('2027-09-01')
  })

  it('les mois en grilles du lundi au dimanche, jours hors du mois vides', () => {
    const mois = moisEntre('2026-09-01', '2027-08-31')
    expect(mois).toHaveLength(12)
    const sept = mois[0]
    // Le 1er septembre 2026 est un mardi : la grille commence le lundi 31/08.
    expect(sept.semaines[0].lundi).toBe('2026-08-31')
    expect(sept.semaines[0].jours[0]).toBeNull()
    expect(sept.semaines[0].jours[1]).toBe('2026-09-01')
    expect(sept.semaines.at(-1)?.jours.filter(Boolean).at(-1)).toBe(
      '2026-09-30',
    )
    expect(mois[11].mois).toBe('2027-08')
  })

  it('un jour seul, un samedi compris, se pose et se retire', () => {
    const j = peindre(new Set(), ['2026-11-07'], true)
    expect([...j]).toEqual(['2026-11-07'])
    expect(peindre(j, ['2026-11-07'], false).size).toBe(0)
  })

  it('peindre respecte les jours qu on ne peut pas changer, dans les deux sens de glisser', () => {
    const j = peindre(
      new Set(),
      plage('2026-11-06', '2026-11-02'),
      true,
      (d) => d !== '2026-11-04',
    )
    expect([...j].sort()).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-05',
      '2026-11-06',
    ])
  })

  it('une semaine pleine se vide au clic, une partielle se remplit, le samedi ne bouge pas', () => {
    const plein = basculerSemaine(new Set(['2026-11-07']), L)
    expect(etatSemaine(plein, L)).toBe('ecole')
    expect(plein.has('2026-11-07')).toBe(true)
    const vide = basculerSemaine(plein, L)
    expect(etatSemaine(vide, L)).toBe('')
    expect([...vide]).toEqual(['2026-11-07'])
    const partiel = new Set(['2026-11-03'])
    expect(etatSemaine(partiel, L)).toBe('partielle')
    expect(etatSemaine(basculerSemaine(partiel, L), L)).toBe('ecole')
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
    const jours = basculerSemaine(new Set(), L)
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

  it('périodes lisibles : le week-end libre ne coupe pas, un jour de semaine libre si', () => {
    const deuxSemaines = [
      ...plage('2026-11-16', '2026-11-20'),
      ...plage('2026-11-23', '2026-11-27'),
    ]
    expect(periodesEcole(deuxSemaines)).toEqual([
      { debut: '2026-11-16', fin: '2026-11-27', jours: 10 },
    ])
    // Mardi et jeudi : le mercredi à l'hôtel coupe.
    expect(periodesEcole(['2026-11-03', '2026-11-05'])).toHaveLength(2)
    // Samedi d'examen puis lundi : une seule période.
    expect(periodesEcole(['2026-11-07', '2026-11-09'])).toHaveLength(1)
    // Dimanche puis mardi : deux.
    expect(periodesEcole(['2026-11-08', '2026-11-10'])).toHaveLength(2)
  })

  it('prochaine période : celle en cours, sinon la suivante', () => {
    const j = [...plage('2026-10-26', '2026-10-30'), '2026-11-17']
    expect(prochainePeriode(j, AUJ)?.debut).toBe('2026-10-26')
    expect(prochainePeriode(j, '2026-10-31')?.debut).toBe('2026-11-17')
    expect(prochainePeriode(j, '2026-11-18')).toBeNull()
  })
})

describe('dates du document du CFA', () => {
  it('formes courantes : du … au …, tirets, jours nommés, mois en lettres', () => {
    const lus = lireDatesCfa(
      [
        'Période 1 : du 28/09 au 02/10/2026',
        '19/10/2026 - 23/10/2026',
        'du lundi 16 novembre au vendredi 20 novembre 2026',
        '1er décembre',
        'Examen le samedi 12/12/26',
      ].join('\n'),
      AUJ,
    )
    expect(lus.illisibles).toEqual([])
    expect(periodesEcole(lus.jours)).toEqual([
      { debut: '2026-09-28', fin: '2026-10-02', jours: 5 },
      { debut: '2026-10-19', fin: '2026-10-23', jours: 5 },
      { debut: '2026-11-16', fin: '2026-11-20', jours: 5 },
      { debut: '2026-12-01', fin: '2026-12-01', jours: 1 },
      { debut: '2026-12-12', fin: '2026-12-12', jours: 1 },
    ])
    expect(lus.debut).toBe('2026-09-28')
    expect(lus.fin).toBe('2026-12-12')
  })

  it('une période sur deux semaines : pas de week-end, sauf écrit', () => {
    const lus = lireDatesCfa('du 16/11 au 27/11', AUJ)
    expect(lus.jours.size).toBe(10)
    expect(lus.jours.has('2026-11-21')).toBe(false)
    const sam = lireDatesCfa('du 16/11 au samedi 21/11', AUJ)
    expect(sam.jours.size).toBe(6)
    expect(sam.jours.has('2026-11-21')).toBe(true)
  })

  it('sans année : l année en cours ou la suivante, à cheval sur deux années', () => {
    const lus = lireDatesCfa('du 28/12 au 08/01\n05/04', AUJ)
    expect([...lus.jours].sort()).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-04',
      '2027-01-05',
      '2027-01-06',
      '2027-01-07',
      '2027-01-08',
      '2027-04-05',
    ])
  })

  it('« 28/09 - 02/10 » sans année : deux dates, pas l an 2002', () => {
    const lus = lireDatesCfa('28/09 - 02/10', AUJ)
    expect(lus.debut).toBe('2026-09-28')
    expect(lus.fin).toBe('2026-10-02')
  })

  it('lignes entreprise ou vacances écartées, chiffres sans date signalés', () => {
    const lus = lireDatesCfa(
      [
        'Calendrier BTS MHR',
        'En entreprise du 05/10 au 16/10',
        'Vacances du 21/12 au 01/01',
        'Semaine 47',
        '31/02',
        'du 02/11 au 06/11',
      ].join('\n'),
      AUJ,
    )
    expect(lus.ignorees).toHaveLength(2)
    expect(lus.illisibles).toEqual(['Semaine 47', '31/02'])
    expect(lus.jours.size).toBe(5)
  })

  it('le document fait foi sur ce qu il couvre, le reste ne bouge pas', () => {
    const avant = new Set([
      ...plage('2026-09-28', '2026-10-02'), // avant le document : gardé
      ...plage('2026-11-09', '2026-11-13'), // couvert, absent du document
      '2027-03-01', // après le document : gardé
    ])
    const lus = lireDatesCfa('du 02/11 au 06/11\ndu 16/11 au 20/11', AUJ)
    const { suite, ajoutes, retires } = appliquerCfa(avant, lus)
    expect(ajoutes).toHaveLength(10)
    expect(retires).toEqual(plage('2026-11-09', '2026-11-13'))
    expect(suite.has('2026-09-28')).toBe(true)
    expect(suite.has('2027-03-01')).toBe(true)
    expect(suite.has('2026-11-10')).toBe(false)
    // Une semaine verrouillée reste telle quelle.
    const garde = appliquerCfa(
      avant,
      lus,
      (j) => j < '2026-11-09' || j > '2026-11-13',
    )
    expect(garde.retires).toEqual([])
  })
})

describe('shifts touchés par l école', () => {
  it('seuls les shifts d un jour qui DEVIENT jour d école, dans l ordre des dates', () => {
    const shifts = [
      { id: 1, lundi: L, jour: 1 }, // mardi 03/11, devient école
      { id: 2, lundi: L, jour: 2 }, // mercredi 04/11, déjà école
      { id: 3, lundi: L, jour: 3 }, // jeudi, pas d'école
      { id: 4, lundi: '2026-10-26', jour: 6 }, // dimanche 01/11, devient école
    ]
    const avant = new Set(['2026-11-04'])
    const apres = new Set(['2026-11-01', '2026-11-03', '2026-11-04'])
    expect(shiftsSurEcole(shifts, avant, apres).map((s) => s.id)).toEqual([
      4, 1,
    ])
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

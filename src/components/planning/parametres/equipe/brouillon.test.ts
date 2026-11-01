import { describe, expect, it } from 'vitest'

import {
  brouillonVierge,
  changerCategorie,
  changerContrat,
  CONTRATS_MINEUR,
  erreurBrouillon,
  forfaitPossible,
  heuresSansObjet,
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

describe('heures du contrat (audit RH du 2026-11-01)', () => {
  const fiche = (kw: Partial<ReturnType<typeof brouillonVierge>>) => ({
    ...brouillonVierge(),
    prenom: 'Léa',
    ...kw,
  })
  it('un contrat mesuré a des heures ; un extra et un forfait jours non', () => {
    expect(erreurBrouillon(fiche({ heures_hebdo: 35 }))).toBeNull()
    expect(erreurBrouillon(fiche({ heures_hebdo: 0 }))).toBe(
      'Indiquez les heures par semaine (plus de 0 h).',
    )
    expect(
      erreurBrouillon(fiche({ type_contrat: 'extra', heures_hebdo: 0 })),
    ).toBeNull()
    expect(
      erreurBrouillon(fiche({ forfait_jours: true, heures_hebdo: 0 })),
    ).toBeNull()
    expect(heuresSansObjet(fiche({ type_contrat: 'extra' }))).toBe(true)
    expect(heuresSansObjet(fiche({}))).toBe(false)
  })
  it('un mineur : 35 h au plus', () => {
    expect(
      erreurBrouillon(fiche({ mineur: true, heures_hebdo: 35 })),
    ).toBeNull()
    expect(erreurBrouillon(fiche({ mineur: true, heures_hebdo: 39 }))).toBe(
      'Un mineur ne peut pas dépasser 35 h par semaine.',
    )
  })
})

describe('fin de contrat et bouton Actif (U2 du 2026-11-01)', () => {
  const fiche = (kw: Partial<ReturnType<typeof brouillonVierge>>) => ({
    ...brouillonVierge(),
    prenom: 'Léa',
    ...kw,
  })
  it('CDD, apprenti, stagiaire : la fin est obligatoire', () => {
    for (const type_contrat of ['cdd', 'apprenti', 'stagiaire'] as const) {
      expect(erreurBrouillon(fiche({ type_contrat }))).toMatch(
        /fin du contrat : elle est obligatoire/,
      )
      expect(
        erreurBrouillon(fiche({ type_contrat, date_sortie: '2027-06-30' })),
      ).toBeNull()
    }
    // Refusé : un CDI ou un extra n'y sont pas tenus.
    expect(erreurBrouillon(fiche({ type_contrat: 'cdi' }))).toBeNull()
    expect(
      erreurBrouillon(fiche({ type_contrat: 'extra', heures_hebdo: 0 })),
    ).toBeNull()
  })
  it('passer en extra retire la fin ; quitter extra rend la fiche active', () => {
    const extra = changerContrat(
      fiche({ type_contrat: 'cdd', date_sortie: '2027-06-30' }),
      'extra',
    )
    expect(extra.date_sortie).toBeNull()
    const cdi = changerContrat({ ...extra, actif: false }, 'cdi')
    expect(cdi.actif).toBe(true)
    // Refusé : un extra inactif le reste en changeant d'avis sur rien.
    expect(changerContrat({ ...extra, actif: false }, 'extra').actif).toBe(
      false,
    )
  })
})

describe('cadre au forfait jours : la direction seule (2026-11-01)', () => {
  const groupes = [
    { id: 1, nom: 'Direction', ordre: 0, postes_autorises: [] },
    { id: 2, nom: 'Hôteliers', ordre: 1, postes_autorises: [] },
  ]
  const fiche = (kw: Partial<ReturnType<typeof brouillonVierge>>) => ({
    ...brouillonVierge(),
    prenom: 'Léa',
    ...kw,
  })
  it('un CDI ou un CDD du groupe Direction', () => {
    expect(forfaitPossible(fiche({ groupe_id: 1 }), groupes)).toBe(true)
    expect(
      forfaitPossible(fiche({ groupe_id: 1, type_contrat: 'cdd' }), groupes),
    ).toBe(true)
    // Refusé : un autre groupe, un apprenti, un stagiaire, un extra.
    expect(forfaitPossible(fiche({ groupe_id: 2 }), groupes)).toBe(false)
    for (const type_contrat of ['apprenti', 'stagiaire', 'extra'] as const)
      expect(
        forfaitPossible(fiche({ groupe_id: 1, type_contrat }), groupes),
      ).toBe(false)
  })
  it('quitter la direction ou passer apprenti retire le forfait', () => {
    const cadre = fiche({ groupe_id: 1, forfait_jours: true })
    expect(changerContrat(cadre, 'apprenti').forfait_jours).toBe(false)
    expect(changerContrat(cadre, 'cdd').forfait_jours).toBe(true)
    expect(
      changerCategorie(cadre, 2, [], groupes as never).brouillon.forfait_jours,
    ).toBe(false)
    expect(
      changerCategorie(cadre, 1, [], groupes as never).brouillon.forfait_jours,
    ).toBe(true)
  })
})

describe('mineur : apprenti ou stagiaire seulement (2026-11-01)', () => {
  const fiche = (kw: Partial<ReturnType<typeof brouillonVierge>>) => ({
    ...brouillonVierge(),
    prenom: 'Léa',
    ...kw,
  })
  it('passer en CDI, CDD ou extra retire « mineur »', () => {
    const jeune = fiche({ type_contrat: 'apprenti', mineur: true })
    expect(changerContrat(jeune, 'stagiaire').mineur).toBe(true)
    for (const t of ['cdi', 'cdd', 'extra'] as const)
      expect(changerContrat(jeune, t).mineur).toBe(false)
    expect([...CONTRATS_MINEUR].sort()).toEqual(['apprenti', 'stagiaire'])
  })
})

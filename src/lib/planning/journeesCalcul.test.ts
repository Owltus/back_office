import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau as creneauModele,
  probleme,
  travail,
} from '#/lib/planning/modele.ts'
import type { Creneau, SalarieSolveur } from '#/lib/planning/modele.ts'
import {
  heuresDues,
  journeesDuCalcul,
  versSolveur,
} from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import { raisonsBlocage, violations } from '#/lib/planning/verificateur.ts'

/*
 * Les journées du calcul (décisions d'une responsable du 2026-11-04) :
 * « en 35 h, uniquement des horaires de 7 h ; en 39 h, des journées de 8 h
 * sauf une à 7 h ; les autres horaires ne seront placés que manuellement ».
 * Un congé, l'école, un JFR : la journée étoile saute, tous les jours
 * travaillés sont pleins. Jamais d'heures en plus posées par le calcul.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

/** Un service de `heures` de travail le jour `jour`, à partir de 8 h. */
const cr = (jour: number, heures: number): Creneau =>
  creneauModele({
    id: `j${jour}h${heures}`,
    poste: 'r',
    debut: jour * MINUTES_PAR_JOUR + 8 * H,
    fin: jour * MINUTES_PAR_JOUR + (8 + heures) * H,
    effectif: 1,
  })

const fiche = (heures: number, kw: Partial<Fiche> = {}): Fiche => ({
  id: 'a',
  postes: new Set(['r']),
  typeContrat: 'cdi',
  minutesHebdo: heures * H,
  ...kw,
})

const resoudre = (
  s: SalarieSolveur,
  creneaux: Creneau[],
  imposes: string[] = [],
) => {
  const p = probleme({
    salaries: [s],
    creneaux,
    imposees: new Set(imposes.map((id) => `${s.id}|${id}`)),
    graine: 1,
  })
  return { p, r: generer(p, highs) }
}
const durees = (x: ReturnType<typeof resoudre>) =>
  x.r.affectations
    .map((a) => travail(x.p.creneaux.find((c) => c.id === a.creneauId)!) / H)
    .sort((a, b) => b - a)

// Chaque jour, un service de 7 h, un de 8 h et un de 9 h.
const offre = (jours: number[], heures = [7, 8, 9]) =>
  jours.flatMap((j) => heures.map((h) => cr(j, h)))
const SEMAINE = [0, 1, 2, 3, 4, 5, 6]

describe('journeesDuCalcul : qui est concerné', () => {
  it('35 h : 7 h ; 39 h : 8 h et 7 h ; 39 h avec congé ou école : 8 h', () => {
    expect([...journeesDuCalcul(fiche(35))!]).toEqual([7 * H])
    expect([...journeesDuCalcul(fiche(39))!].sort()).toEqual([7 * H, 8 * H])
    expect([
      ...journeesDuCalcul(fiche(39, { joursAbsenceDecomptes: 1 }))!,
    ]).toEqual([8 * H])
    expect([
      ...journeesDuCalcul(fiche(39, { joursEcole: new Set([0]) }))!,
    ]).toEqual([8 * H])
    // Un 35 h avec congé : toujours des 7 h.
    expect([
      ...journeesDuCalcul(fiche(35, { joursAbsenceDecomptes: 1 }))!,
    ]).toEqual([7 * H])
  })

  it('refusé : ni forfait jours, ni extra, ni un autre contrat', () => {
    expect(journeesDuCalcul(fiche(39, { forfaitJours: true }))).toBeNull()
    expect(journeesDuCalcul(fiche(0, { typeContrat: 'extra' }))).toBeNull()
    for (const h of [24, 30, 37, 42])
      expect(journeesDuCalcul(fiche(h))).toBeNull()
  })

  it('heures dues : un congé fait sauter la journée étoile, même fixée', () => {
    const etoile = { etoileFixe: new Set([4]) }
    expect(heuresDues(fiche(39, { ...etoile }))).toBe(39 * H)
    expect(
      heuresDues(
        fiche(39, {
          ...etoile,
          joursAbsenceDecomptes: 1,
          indisponibilites: new Set([0]),
        }),
      ),
    ).toBe(32 * H)
    expect(heuresDues(fiche(35, { joursAbsenceDecomptes: 1 }))).toBe(28 * H)
    // L'étoile fixée disparaît du solveur cette semaine-là.
    expect(
      versSolveur(fiche(39, { ...etoile, joursAbsenceDecomptes: 1 })).etoileFixe
        .size,
    ).toBe(0)
  })
})

describe('le calcul ne pose que ces journées', () => {
  it('accepté : un 35 h fait 5 × 7 h ; refusé : jamais un 8 h ni un 9 h', () => {
    const x = resoudre(versSolveur(fiche(35)), offre(SEMAINE))
    expect(durees(x)).toEqual([7, 7, 7, 7, 7])
  })

  it('accepté : un 39 h fait 4 × 8 h + 7 h ; refusé : 5 × 8 h ou un 9 h', () => {
    const x = resoudre(versSolveur(fiche(39)), offre(SEMAINE))
    expect(durees(x)).toEqual([8, 8, 8, 8, 7])
  })

  it('39 h avec un jour de congé : 4 × 8 h, sans journée de 7 h', () => {
    const s = versSolveur(
      fiche(39, { joursAbsenceDecomptes: 1, indisponibilites: new Set([0]) }),
    )
    const x = resoudre(s, offre(SEMAINE))
    expect(durees(x)).toEqual([8, 8, 8, 8])
  })

  it('35 h avec un jour d’école : 4 × 7 h', () => {
    const s = versSolveur(fiche(35, { joursEcole: new Set([0]) }))
    const x = resoudre(s, offre(SEMAINE))
    expect(durees(x)).toEqual([7, 7, 7, 7])
  })

  it('journée étoile fixée le vendredi : le 7 h tombe ce jour-là', () => {
    const s = versSolveur(fiche(39, { etoileFixe: new Set([4]) }))
    const x = resoudre(s, offre([0, 1, 2, 3, 4]))
    const vendredi = x.r.affectations.find((a) => a.creneauId.startsWith('j4'))
    expect(vendredi?.creneauId).toBe('j4h7')
    expect(durees(x)).toEqual([8, 8, 8, 8, 7])
  })

  it('refusé : pas d’heures en plus, même sans 7 h à poser', () => {
    // Seulement des 8 h : 4 jours (32 h), jamais 5 (40 h).
    const x = resoudre(versSolveur(fiche(39)), offre(SEMAINE, [8]))
    expect(durees(x)).toEqual([8, 8, 8, 8])
  })

  it('un shift posé à la main hors de ces journées reste, sans alerte', () => {
    const s = versSolveur(fiche(39))
    const x = resoudre(s, offre(SEMAINE), ['j0h9'])
    expect(x.r.affectations.map((a) => a.creneauId)).toContain('j0h9')
    expect(violations(x.p, x.r.affectations).map((v) => v.regle)).not.toContain(
      'JOURNEE-TYPE',
    )
    // 9 h posées : le reste garde ses journées (3 × 8 h + 7 h), 40 h.
    expect(durees(x)).toEqual([9, 8, 8, 8, 7])
  })

  it('un JFR pris fait sauter la journée étoile : 4 × 8 h', () => {
    const s = {
      ...versSolveur(fiche(39)),
      jfr: { jours: new Set([2]), reduction: 7 * H },
    }
    // Rien à tenir le mercredi : le JFR y est pris, les 4 autres jours à 8 h.
    const x = resoudre(s, offre([0, 1, 3, 4], [7, 8]))
    expect(x.r.jfr).toEqual([{ salarieId: 'a', jour: 2 }])
    expect(durees(x)).toEqual([8, 8, 8, 8])
    // Refusé : jamais un JFR ET une journée de 7 h dans la même semaine. Le
    // jeudi n'offre qu'un 7 h : la place passe avant le JFR, qui attend.
    const y = resoudre(s, [...offre([0, 1, 4], [8]), cr(3, 7)])
    expect(durees(y)).toEqual([8, 8, 8, 7])
    expect(y.r.jfr).toEqual([])
  })

  it('un contrat ni 35 h ni 39 h : au mieux, sans contrainte de durée', () => {
    // Seulement des 9 h : un 24 h en reçoit, ce qu'un 35 h ou 39 h refuse.
    const x = resoudre(versSolveur(fiche(24)), offre(SEMAINE, [9]))
    expect(durees(x).length).toBeGreaterThan(0)
    expect(new Set(durees(x))).toEqual(new Set([9]))
    expect(
      resoudre(versSolveur(fiche(39)), offre(SEMAINE, [9])).r.affectations,
    ).toEqual([])
  })
})

describe('les places laissées vides le disent', () => {
  it('un 9 h : pas une journée de son contrat', () => {
    const s = versSolveur(fiche(39))
    const x = resoudre(s, [cr(0, 9)])
    expect(x.r.affectations).toEqual([])
    const regles = raisonsBlocage(x.p, x.r.affectations, 'j0h9')
      .get('a')!
      .map((v) => v.regle)
    expect(regles).toEqual(['JOURNEE-TYPE'])
  })

  it('un 7 h la semaine d’un congé : seulement des journées de 8 h', () => {
    const s = versSolveur(fiche(39, { joursAbsenceDecomptes: 1 }))
    const x = resoudre(s, [cr(0, 7)])
    const liste = raisonsBlocage(x.p, x.r.affectations, 'j0h7').get('a')!
    expect(liste.map((v) => v.message)).toEqual([
      'horaire de 7 h : le calcul ne pose que des journées de 8 h',
    ])
  })

  it('une 5e journée de 8 h : dépasserait ses heures de la semaine', () => {
    const x = resoudre(versSolveur(fiche(39)), offre([0, 1, 2, 3, 4], [8]))
    const vide = [0, 1, 2, 3, 4]
      .map((j) => `j${j}h8`)
      .find((id) => !x.r.affectations.some((a) => a.creneauId === id))!
    const regles = raisonsBlocage(x.p, x.r.affectations, vide)
      .get('a')!
      .map((v) => v.regle)
    expect(regles).toContain('HEURES-FAITES')
  })

  it('un shift posé à la main ne cache pas la raison d’une autre place', () => {
    // Un 9 h posé le lundi : la place de 9 h du mardi garde sa raison.
    const s = versSolveur(fiche(39))
    const x = resoudre(s, [cr(0, 9), cr(1, 9)], ['j0h9'])
    const regles = raisonsBlocage(x.p, x.r.affectations, 'j1h9')
      .get('a')!
      .map((v) => v.regle)
    expect(regles).toContain('JOURNEE-TYPE')
  })
})

describe('relecture adverse du 2026-11-04', () => {
  const avecCode = (c: Creneau, code: string): Creneau => ({
    ...c,
    typeShift: code,
  })

  it('la semaine type décide : un 9 h fixé dans la fiche est posé', () => {
    const f = fiche(39, {
      shiftImpose: [0, 1, 2, 3].map((j) => [j, 'c9'] as const),
      travailFixe: new Set([0, 1, 2, 3]),
      journeesFixees: new Set([9 * H]),
    })
    expect(journeesDuCalcul(f)).toBeNull()
    // Des horaires fixés de 8 h (et leur version de 7 h) restent dans la
    // règle : le veilleur, la technique.
    expect(
      journeesDuCalcul({ ...f, journeesFixees: new Set([8 * H, 7 * H]) }),
    ).not.toBeNull()
    const creneaux = [0, 1, 2, 3].map((j) => avecCode(cr(j, 9), 'c9'))
    const x = resoudre(versSolveur(f), creneaux)
    expect(durees(x)).toEqual([9, 9, 9, 9])
  })

  it('refusé : un 35 h sans semaine type fixée ne reçoit jamais ce 8 h', () => {
    const creneaux = [0, 1, 2, 3, 4].map((j) => avecCode(cr(j, 8), 'c8'))
    expect(resoudre(versSolveur(fiche(35)), creneaux).r.affectations).toEqual(
      [],
    )
  })

  it('36 à 38 h : rien ne change, l’étoile fixée reste comptée courte', () => {
    const f = fiche(37, {
      etoileFixe: new Set([4]),
      joursAbsenceDecomptes: 1,
      indisponibilites: new Set([0]),
    })
    expect(heuresDues(f)).toBe(29 * H)
    expect([...versSolveur(f).etoileFixe]).toEqual([4])
    expect(journeesDuCalcul(f)).toBeNull()
  })

  it('un 8 h posé pour un 35 h : le reste de la semaine garde ses 7 h', () => {
    const x = resoudre(versSolveur(fiche(35)), offre(SEMAINE, [7, 8]), ['j0h8'])
    expect(durees(x)).toEqual([8, 7, 7, 7, 7])
  })

  it('changement d’heure : une nuit de 8 h reste une journée de 8 h', () => {
    // Nuit de 23:00 à 07:00 qui compte une heure de plus en réel (posée un
    // lundi : seul le changement d’heure est éprouvé, pas le jour isolé).
    const nuit = creneauModele({
      id: 'n5',
      poste: 'r',
      debut: 23 * H,
      fin: MINUTES_PAR_JOUR + 8 * H,
      effectif: 1,
      travailMural: 8 * H,
    })
    const x = resoudre(versSolveur(fiche(39)), [nuit])
    expect(x.r.affectations.map((a) => a.creneauId)).toEqual(['n5'])
  })

  it('JFR possible et étoile fixée : le vérificateur suit le calcul', () => {
    const s = {
      ...versSolveur(fiche(39, { etoileFixe: new Set([4]) })),
      jfr: { jours: new Set([2]), reduction: 7 * H },
    }
    const x = resoudre(s, offre([0, 1, 3, 4], [7, 8]))
    expect(x.r.jfr).toEqual([{ salarieId: 'a', jour: 2 }])
    expect(durees(x)).toEqual([8, 8, 8, 8])
    expect(violations(x.p, x.r.affectations).map((v) => v.regle)).not.toContain(
      'R-JOURNEE-ETOILE',
    )
  })
})

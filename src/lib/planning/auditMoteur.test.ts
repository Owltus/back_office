import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { compatible, generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  cle,
  creneau as creneauModele,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { heuresDues, versSolveur } from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import { contexte, creneauAffectation } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { hotelReel } from '#/lib/planning/test/hotelReel.ts'
import { PlanningMemoire } from '#/lib/planning/test/planningMemoire.ts'
import { ajouterJours, bornes, MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import { violations } from '#/lib/planning/verificateur.ts'

/*
 * Port de `backend/tests/test_audit_moteur.py` (prototype) : défauts du
 * moteur relevés par l'audit, chacun avec un cas accepté et un cas refusé.
 * Oracles : le fuseau Europe/Paris de l'environnement (Intl, calcul en UTC)
 * pour les durées réelles — indépendant de `temps.ts` —, les règles HCR, et
 * le recomptage à la main.
 *
 * Les cas qui passaient par l'API sur l'hôtel réel (`PLANNING_JEU=hotel`)
 * sont rejoués en mémoire (`PlanningMemoire`) sur `hotelReel()`, mêmes
 * fiches sous des pseudonymes. Date du jour : 2026-09-01 (conftest).
 */

const H = 60
const J = MINUTES_PAR_JOUR
const AUJOURDHUI = '2026-09-01'

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

// ------------------------------------------------- oracle : durée réelle

const FORMAT_PARIS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** Décalage de Paris (minutes) à l'instant UTC `ms`, lu par Intl. */
function decalage(ms: number): number {
  const p = Object.fromEntries(
    FORMAT_PARIS.formatToParts(ms).map((x) => [x.type, x.value]),
  )
  const mural = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return Math.round((mural - ms) / 60_000)
}

/** Instant UTC d'une heure d'horloge de Paris, comme Python `fold=0` : une
 * heure inexistante prend le décalage d'avant, une heure double la première. */
function instant(jour: string, hhmm: string): number {
  const [a, m, d] = jour.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const mural = Date.UTC(a, m - 1, d, h, mi)
  const valides = [60, 120].filter((o) => decalage(mural - o * 60_000) === o)
  if (valides.length === 0)
    return mural - decalage(mural - 6 * 3_600_000) * 60_000
  return mural - Math.max(...valides) * 60_000
}

/** Durée réellement écoulée à Paris entre deux heures d'horloge (fin <= début : le lendemain). */
function dureeReelle(jour: string, debut: string, fin: string): number {
  const a = instant(jour, debut)
  let b = instant(jour, fin)
  if (b <= a) b = instant(ajouterJours(jour, 1), fin)
  return Math.round((b - a) / 60_000)
}

// ------------------------------------------------------------- aides

function receptionniste(
  id = 'r',
  kw: Partial<SalarieSolveur> = {},
): SalarieSolveur {
  return salarieSolveur({
    id,
    postes: new Set(['r']),
    minutesHebdoContrat: 35 * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 5,
    reposQuotidienMin: 11 * H,
    ...kw,
  })
}

function creneau(
  id: string,
  jour: number,
  debutH: number,
  finH: number,
  kw: Partial<Creneau> = {},
): Creneau {
  return creneauModele({
    id,
    poste: 'r',
    debut: jour * J + Math.round(debutH * H),
    fin: jour * J + Math.round(finH * H),
    ...kw,
  })
}

const aff = (
  salarieId: string,
  creneauId: string,
  court = false,
): AffectationSolveur => ({
  salarieId,
  creneauId,
  court,
})

function hotel(): PlanningMemoire {
  const { referentiel, absences } = hotelReel()
  return new PlanningMemoire(referentiel, absences, AUJOURDHUI, highs)
}

function alertesDe(
  sem: SemaineOut,
  salarieId: number,
  jour?: number,
): string[] {
  return sem.affectations
    .filter(
      (a) =>
        a.salarie_id === salarieId && (jour === undefined || a.jour === jour),
    )
    .flatMap((a) => a.alertes.map((x) => x.regle))
}

const bilanDe = (sem: SemaineOut, salarieId: number) =>
  sem.bilan.find((b) => b.salarie_id === salarieId)!

// ------------------------------------------------- 1. changement d'heure

describe('1. changement d’heure', () => {
  it.each([
    ['2026-10-24', 540],
    ['2027-10-30', 540],
    ['2027-03-27', 420],
    ['2026-11-07', 480],
  ])(
    'la nuit du samedi %s compte sa vraie durée (%i min)',
    (samedi, attendu) => {
      const lundi = ajouterJours(samedi, -5)
      const [d, f] = bornes(lundi, 5, '23:00', '07:00')
      expect(f - d).toBe(attendu)
      expect(dureeReelle(samedi, '23:00', '07:00')).toBe(attendu)
    },
  )

  it('toutes les durées de 2026 à 2030 sont les durées réelles', () => {
    const horaires = [
      '07:00-15:45',
      '14:30-23:15',
      '23:00-07:00',
      '11:00-19:45',
      '15:15-00:00',
      '01:00-09:00',
    ]
    let lundi = '2026-01-05'
    while (lundi < '2031-01-01') {
      for (let j = 0; j < 7; j++) {
        const jour = ajouterJours(lundi, j)
        if (jour >= '2031-01-01') break
        for (const h of horaires) {
          const [debut, fin] = h.split('-')
          const [d, f] = bornes(lundi, j, debut, fin)
          if (f - d !== dureeReelle(jour, debut, fin)) {
            expect([jour, h, f - d]).toEqual([
              jour,
              h,
              dureeReelle(jour, debut, fin),
            ])
          }
        }
      }
      lundi = ajouterJours(lundi, 7)
    }
  })

  it('nuit courte du dimanche et semaine voisine', () => {
    const lundi = '2026-10-19'
    expect(bornes(lundi, 6, '24:00', '07:00')).toEqual([
      7 * J + 60,
      7 * J + 60 + 7 * H,
    ])
    expect(bornes(lundi, -1, '15:00', '23:00')).toEqual([-9 * H, -H])
    expect(bornes(lundi, 7, '07:00', '15:00')[0]).toBe(7 * J + 60 + 7 * H)
  })

  it('l’heure inexistante du passage à l’heure d’été ne plante pas', () => {
    const lundi = '2027-03-22'
    const [d, f] = bornes(lundi, 6, '02:30', '07:00')
    expect(f - d).toBe(210)
    expect(d).toBe(bornes(lundi, 6, '03:30', '07:00')[0])
  })

  it('la nuit du veilleur le samedi du changement d’heure', () => {
    const p = hotel()
    const veilleur = p.salarie('Yves').id
    for (const [lundi, samedi] of [
      ['2026-10-19', '2026-10-24'],
      ['2027-03-22', '2027-03-27'],
    ]) {
      const sem = p.generer(lundi)
      const nuit = sem.affectations.find(
        (a) => a.salarie_id === veilleur && a.jour === 5,
      )!
      expect(nuit.duree + nuit.pause).toBe(
        dureeReelle(samedi, nuit.debut, nuit.fin),
      )
      expect(sem.stats.infractions).toBe(0)
    }
  })

  it('repos de 11 h la nuit du passage à l’heure d’été', () => {
    const p = hotel()
    const clara = p.salarie('Clara').id
    const rec = p.poste('Réception')
    p.poser('2027-03-15', clara, rec, 5, { code: 'MI' })
    let sem = p.poser('2027-03-15', clara, rec, 6, { code: 'M' })
    expect(alertesDe(sem, clara)).not.toContain('R-REPOS-QUOTIDIEN')
    p.poser('2027-03-22', clara, rec, 5, { code: 'MI' })
    sem = p.poser('2027-03-22', clara, rec, 6, { code: 'M' })
    expect(dureeReelle('2027-03-27', '19:45', '07:00')).toBeLessThan(11 * H)
    expect(alertesDe(sem, clara, 6)).toContain('R-REPOS-QUOTIDIEN')
  })
})

// ------------------------------------------------ 2. pause figée sur le shift

describe('2. pause figée sur le shift', () => {
  it('la pause est celle du shift, pas celle du code', () => {
    const p = hotel()
    const sem = p.generer('2026-11-02')
    const horaires = new Map(p.referentiel.horaires.map((h) => [h.id, h]))
    const lignes = p.shifts('2026-11-02')
    expect(lignes.length).toBeGreaterThan(0)
    for (const a of lignes) {
      if (a.horaire_id !== null)
        expect(a.pause).toBe(horaires.get(a.horaire_id)!.pause)
    }
    const ctx = contexte(p.donnees('2026-11-02'))
    const a = lignes.find(
      (x) => x.horaire_id !== null && horaires.get(x.horaire_id)!.pause,
    )!
    expect(creneauAffectation(ctx, a).pause).toBe(a.pause)
    expect(creneauAffectation(ctx, { ...a, pause: a.pause + 15 }).pause).toBe(
      a.pause + 15,
    )
    expect(sem.stats.infractions).toBe(0)
  })
})

// --------------------------------------------------- 3. R-REPOS-HEBDO-35H

describe('3. R-REPOS-HEBDO-35H', () => {
  it('le repos hebdomadaire de 35 h dans le planning', () => {
    const p = hotel()
    const clara = p.salarie('Clara').id
    const rec = p.poste('Réception')
    const lundi = '2026-11-02'
    let sem!: SemaineOut
    for (const [jour, code] of [
      [0, 'S'],
      [2, 'M'],
      [3, 'M'],
      [4, 'M'],
      [5, 'M'],
      [6, 'M'],
    ] as const) {
      sem = p.poser(lundi, clara, rec, jour, { code })
    }
    expect(bilanDe(sem, clara).alertes.map((x) => x.regle)).toContain(
      'R-REPOS-HEBDO-35H',
    )
    p.vider(lundi)
    for (const [jour, code] of [
      [0, 'S'],
      [3, 'M'],
      [4, 'M'],
      [5, 'M'],
      [6, 'M'],
    ] as const) {
      sem = p.poser(lundi, clara, rec, jour, { code })
    }
    expect(bilanDe(sem, clara).alertes.map((x) => x.regle)).not.toContain(
      'R-REPOS-HEBDO-35H',
    )
  })

  it('les semaines de l’hôtel sont générées avec le repos de 35 h', () => {
    const p = hotel()
    for (let k = 0; k < 4; k++) {
      const lundi = ajouterJours('2026-11-02', 7 * k)
      const sem = p.generer(lundi)
      expect([lundi, sem.stats.infractions]).toEqual([lundi, 0])
      expect([lundi, sem.stats.pourvues]).toEqual([lundi, sem.stats.places])
    }
  })
})

// ------------------------------- 4. R-JOUR-MAX du poste sur un shift manuel

describe('4. R-JOUR-MAX du poste', () => {
  it('un shift manuel plus long que le maximum du poste', () => {
    const p = hotel()
    const clara = p.salarie('Clara').id
    const club = p.poste('Club')
    let sem = p.poser('2026-11-02', clara, club, 0, {
      debut: '07:00',
      fin: '18:30',
    })
    expect(alertesDe(sem, clara, 0)).not.toContain('R-JOUR-MAX')
    sem = p.poser('2026-11-02', clara, club, 2, {
      debut: '07:00',
      fin: '18:45',
    })
    expect(alertesDe(sem, clara, 2)).toContain('R-JOUR-MAX')
  })

  it('le maximum du poste dans le moteur', () => {
    const s = receptionniste()
    const long = creneau('c', 0, 7, 18.75, { presenceMax: 11 * H + 30 })
    expect(compatible(s, long)).toBe(false)
    expect(
      compatible(s, creneau('c', 0, 7, 18.5, { presenceMax: 11 * H + 30 })),
    ).toBe(true)
    const regles = new Set(
      violations(probleme({ salaries: [s], creneaux: [long] }), [
        aff('r', 'c'),
      ]).map((v) => v.regle),
    )
    expect(regles).toEqual(new Set(['R-JOUR-MAX']))
    const cadre = receptionniste('r', {
      minutesJourMax: 13 * H,
      jourMaxPoste: false,
    })
    expect(compatible(cadre, long)).toBe(true)
  })
})

// --------------------------------- 5. heures dues : étoile fixée et absence

describe('5. heures dues', () => {
  it('heures dues : étoile fixée et congé', () => {
    const base: Fiche = {
      id: 'pl',
      postes: new Set(['1']),
      typeContrat: 'cdi',
      minutesHebdo: 39 * H,
      etoileFixe: new Set([4]),
    }
    expect(
      heuresDues({
        ...base,
        joursAbsenceDecomptes: 1,
        indisponibilites: new Set([0]),
      }),
    ).toBe(31 * H)
    expect(
      heuresDues({
        ...base,
        joursAbsenceDecomptes: 1,
        indisponibilites: new Set([4]),
      }),
    ).toBe(32 * H)
    expect(heuresDues(base)).toBe(39 * H)
  })

  it('le technicien en congé le lundi fait pile ses heures', () => {
    const p = hotel()
    const tech = p.salarie('Paul').id
    p.absent(tech, '2026-11-02', '2026-11-02', 'CP')
    const b = bilanDe(p.generer('2026-11-02'), tech)
    expect(b.minutes_contrat).toBe(31 * H)
    expect(b.minutes).toBe(b.minutes_contrat)
    expect(b.alertes.map((x) => x.regle)).not.toContain('HEURES-CONTRAT')
  })
})

// --------------------------------------- 6. personne oubliée toute la semaine

describe('6. personne oubliée', () => {
  it('une personne sans aucun service est signalée', () => {
    const p = hotel()
    const lundi = '2026-11-02'
    const clara = p.salarie('Clara').id
    expect(bilanDe(p.analyser(lundi), clara).alertes).toEqual([])
    p.generer(lundi)
    for (const a of p.shifts(lundi)) if (a.salarie_id === clara) p.retirer(a.id)
    const b = bilanDe(p.analyser(lundi), clara)
    expect(b.minutes).toBe(0)
    expect(b.minutes_contrat).toBe(39 * H)
    expect(
      b.alertes.some(
        (x) =>
          x.regle === 'HEURES-CONTRAT' && x.message.includes('aucun service'),
      ),
    ).toBe(true)
  })
})

// ------------------------------------- 7. fin de contrat à l'heure réelle

describe('7. fin de contrat à l’heure réelle', () => {
  it('la nuit courte du dimanche après la fin du contrat', () => {
    const p = hotel()
    const yohan = p.salarie('Yohan')
    yohan.date_sortie = '2026-11-08'
    let sem = p.generer('2026-11-02')
    expect(
      sem.affectations.filter((a) => a.salarie_id === yohan.id && a.jour === 6),
    ).toEqual([])
    expect(sem.stats.infractions).toBe(0)
    const nuit = p.poste('Veille de nuit')
    sem = p.poser('2026-11-02', yohan.id, nuit, 6, { code: 'N', court: true })
    expect(alertesDe(sem, yohan.id, 6)).toContain('HORS-CONTRAT')
    p.vider('2026-11-02')
    sem = p.poser('2026-11-02', yohan.id, nuit, 6, {
      debut: '15:00',
      fin: '23:00',
    })
    expect(alertesDe(sem, yohan.id, 6)).not.toContain('HORS-CONTRAT')
  })

  it('les bornes de contrat dans le moteur', () => {
    const s = receptionniste('r', { contratFin: 7 * J })
    const dimanche = creneau('d', 6, 15, 23)
    const nuit = creneauModele({
      id: 'n',
      poste: 'r',
      debut: 7 * J,
      fin: 7 * J + 7 * H,
      jourPlanning: 6,
    })
    expect(compatible(s, dimanche)).toBe(true)
    expect(compatible(s, nuit)).toBe(false)
    const p = probleme({ salaries: [s], creneaux: [dimanche, nuit] })
    expect(violations(p, [aff('r', 'd')])).toEqual([])
    expect(violations(p, [aff('r', 'n')]).map((v) => v.regle)).toEqual([
      'HORS-CONTRAT',
    ])
  })
})

// ------------------------------------ 8. deux fiches d'une même personne

describe('8. deux fiches d’une même personne', () => {
  it('repos et chevauchement entre deux fiches de la même personne', () => {
    const ancien = receptionniste('ancien', { personne: 'p1' })
    const nouveau = receptionniste('nouveau', { personne: 'p1' })
    const soir = creneau('soir', 0, 15, 23.25)
    const matin = creneau('matin', 1, 7, 15)
    const apresMidi = creneau('am', 1, 14.5, 22)
    const p = probleme({
      salaries: [ancien, nouveau],
      creneaux: [soir, matin, apresMidi],
    })
    expect(
      violations(p, [aff('ancien', 'soir'), aff('nouveau', 'matin')]).map(
        (v) => v.regle,
      ),
    ).toEqual(['R-REPOS-QUOTIDIEN'])
    const chevauche = violations(p, [
      aff('ancien', 'matin'),
      aff('nouveau', 'am'),
    ])
    expect(chevauche.map((v) => v.regle)).toContain('CHEVAUCHEMENT')
    expect(
      violations(p, [aff('ancien', 'soir'), aff('nouveau', 'am')]),
    ).toEqual([])
    const r = generer(
      probleme({
        salaries: [ancien, nouveau],
        creneaux: [soir, matin],
        imposees: new Set([cle('ancien', 'soir')]),
      }),
      highs,
    )
    expect(
      r.affectations.map((a) => `${a.salarieId}|${a.creneauId}`),
    ).not.toContain('nouveau|matin')
    const seuls = probleme({
      salaries: [receptionniste('ancien'), receptionniste('nouveau')],
      creneaux: [soir, matin],
    })
    expect(
      violations(seuls, [aff('ancien', 'soir'), aff('nouveau', 'matin')]),
    ).toEqual([])
  })

  it('repos de 11 h entre l’ancien et le nouveau contrat', () => {
    const p = hotel()
    const yohan = p.salarie('Yohan')
    yohan.date_sortie = '2026-11-08'
    const rec = p.poste('Réception')
    const nid = Math.max(...p.referentiel.salaries.map((x) => x.id)) + 1
    p.referentiel.salaries.push({
      ...yohan,
      id: nid,
      date_entree: '2026-11-09',
      date_sortie: null,
      suite_de: yohan.id,
      competences: [
        ...yohan.competences,
        { poste_id: rec, niveau: 'titulaire' },
      ],
      semaine_type: Array.from({ length: 7 }, () => ({
        mode: 'auto' as const,
        type_shift_id: null,
        type_absence_id: null,
      })),
      shifts_autorises: [],
    })
    p.poser('2026-11-02', yohan.id, p.poste('Veille de nuit'), 6, {
      debut: '15:00',
      fin: '23:00',
    })
    let sem = p.poser('2026-11-09', nid, rec, 0, { code: 'S' })
    expect(alertesDe(sem, nid, 0)).not.toContain('R-REPOS-QUOTIDIEN')
    p.vider('2026-11-09')
    sem = p.poser('2026-11-09', nid, rec, 0, { code: 'M' })
    expect(alertesDe(sem, nid, 0)).toContain('R-REPOS-QUOTIDIEN')
  })
})

// ---------------------------------------------------------------- 9. mineurs

describe('9. mineurs', () => {
  it('mineur à temps partiel : plafond des heures complémentaires', () => {
    const plafond = (heures: number) =>
      versSolveur({
        id: 'x',
        postes: new Set(['1']),
        typeContrat: 'apprenti',
        minutesHebdo: heures * H,
        mineur: true,
      }).minutesHebdoMax
    expect(plafond(20)).toBe(20 * H + Math.floor((20 * H) / 3))
    expect(plafond(35)).toBe(35 * H)
  })

  it('un mineur fait le matin en version courte', () => {
    const s = versSolveur({
      id: 'm',
      postes: new Set(['r']),
      typeContrat: 'apprenti',
      minutesHebdo: 35 * H,
      mineur: true,
    })
    const matin = creneauModele({
      id: 'c',
      poste: 'r',
      debut: 7 * H,
      fin: 15 * H + 45,
      pause: 45,
      raccourci: 60,
    })
    const p = probleme({ salaries: [s], creneaux: [matin] })
    const r = generer(p, highs)
    expect(r.affectations).toEqual([aff('m', 'c', true)])
    expect(violations(p, r.affectations)).toEqual([])
    expect(new Set(violations(p, [aff('m', 'c')]).map((v) => v.regle))).toEqual(
      new Set(['R-JOUR-MAX']),
    )
    const sansCourt = creneauModele({
      id: 'c',
      poste: 'r',
      debut: 7 * H,
      fin: 15 * H + 45,
      pause: 45,
    })
    expect(
      generer(probleme({ salaries: [s], creneaux: [sansCourt] }), highs)
        .affectations,
    ).toEqual([])
  })
})

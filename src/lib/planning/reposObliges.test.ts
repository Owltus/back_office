import { describe, expect, it } from 'vitest'

import { creneau, salarieSolveur } from '#/lib/planning/modele.ts'
import type { Creneau } from '#/lib/planning/modele.ts'
import {
  analyser,
  reposAProposer,
  reposObliges,
} from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { ajouterJours, MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import type { Affectation } from '#/lib/planning/types.ts'

/*
 * Repos obligés (2026-11-04, décision utilisateur) : un jour sans shift
 * qu'aucun service ne peut tenir sans enfreindre une règle stricte. Hôtel
 * fictif (`hotelDemo`) : la personne id 3, 39 h, Réception et Club.
 */

const LUNDI = '2026-11-16'
const ID = 3
const H = 60
const J = MINUTES_PAR_JOUR
const demo = hotelDemo(LUNDI)
const x = demo.referentiel.salaries.find((s) => s.id === ID)!
const sol = (
  kw: Parameters<typeof salarieSolveur>[0] extends infer T ? Partial<T> : never,
) =>
  salarieSolveur({
    id: String(ID),
    postes: new Set(),
    minutesHebdoContrat: 39 * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 10 * H,
    joursTravaillesMaxSemaine: 6,
    reposQuotidienMin: 11 * H,
    ...kw,
  })
/** Un service le jour `j`, de `debut` à `fin` (heures, fin > 24 : le lendemain). */
const service = (j: number, debut = 7, fin = 15.75): Creneau =>
  creneau({
    id: `c${j}`,
    poste: '1',
    debut: j * J + debut * H,
    fin: j * J + fin * H,
  })
const obliges = (siens: Creneau[], kw = {}, passes = 0, plusCourt = 7 * H) =>
  reposObliges(
    x,
    sol(kw),
    siens,
    LUNDI,
    new Map(),
    new Set(),
    new Set(),
    passes,
    plusCourt,
  )

describe('repos obligés', () => {
  it('plus de 6 jours d’affilée, semaine d’avant comprise : le jour qui coupe', () => {
    // Vendredi, samedi, dimanche d'avant ; lundi, puis mercredi à vendredi.
    const r = obliges(
      [0, 2, 3, 4].map((j) => service(j)),
      { serieAvant: 3 },
    )
    expect(r).toEqual([
      { jour: 1, raison: "sinon 8 jours de travail d'affilée (6 au plus)" },
    ])
  })
  it('la semaine d’après compte aussi', () => {
    // Mardi à dimanche travaillés : le lundi ferait 7 jours d'affilée.
    expect(
      obliges([1, 2, 3, 4, 5, 6].map((j) => service(j))).map((o) => o.jour),
    ).toEqual([0])
    // Mardi à samedi, puis 2 jours la semaine d'après : le dimanche ferait 8.
    const r = obliges(
      [1, 2, 3, 4, 5].map((j) => service(j)),
      { serieApres: 2 },
    )
    expect(r.map((o) => o.jour)).toEqual([0, 6].filter((j) => j === 6))
  })
  it('refusé : 6 jours tout juste, ou un jour déjà travaillé', () => {
    expect(
      obliges(
        [0, 2, 3, 4].map((j) => service(j)),
        { serieAvant: 1 },
      ),
    ).toEqual([])
    // Le mardi travaillé n'est jamais un repos ; le samedi, lui, en ferait 9.
    expect(
      obliges(
        [0, 1, 2, 3, 4].map((j) => service(j)),
        { serieAvant: 3 },
      ).map((o) => o.jour),
    ).toEqual([5])
  })
  it('refusé : un jour passé, hors contrat, de repos fixe, un extra, une personne placée à la main', () => {
    const siens = [0, 2, 3, 4].map((j) => service(j))
    expect(obliges(siens, { serieAvant: 3 }, 2)).toEqual([])
    expect(
      obliges(siens, { serieAvant: 3, horsContrat: new Set([1]) }),
    ).toEqual([])
    expect(obliges(siens, { serieAvant: 3, reposFixes: new Set([1]) })).toEqual(
      [],
    )
    expect(obliges(siens, { serieAvant: 3, placementManuel: true })).toEqual([])
    expect(
      reposObliges(
        { ...x, type_contrat: 'extra' },
        sol({ serieAvant: 3 }),
        siens,
        LUNDI,
        new Map(),
        new Set(),
        new Set(),
        0,
        7 * H,
      ),
    ).toEqual([])
  })
  it('aucun horaire ne tient entre deux services avec 11 h de repos', () => {
    // Fin lundi à minuit, reprise mercredi à 6 h : mardi n'a que 8 h, pour
    // un horaire de 8 h 45 au plus court.
    const autour = [service(0, 15, 24), service(2, 6, 14)]
    expect(obliges(autour, {}, 0, 8.75 * H)).toEqual([
      { jour: 1, raison: 'sinon moins de 11 h de repos entre deux services' },
    ])
    // Refusé : un horaire de 7 h tiendrait.
    expect(obliges(autour, {}, 0, 7 * H)).toEqual([])
    // Refusé : sans services autour, rien n'empêche de travailler.
    expect(obliges([service(0)])).toEqual([])
  })
})

describe('repos obligés dans la semaine analysée', () => {
  const reception = demo.referentiel.postes.find((p) => p.nom === 'Réception')!
  const matin = demo.referentiel.horaires.find((h) => h.debut === '07:00')!
  let n = 0
  const shifts = (lundi: string, jours: number[]): Affectation[] =>
    jours.map((jour) => ({
      id: ++n,
      lundi,
      salarie_id: ID,
      poste_id: reception.id,
      jour,
      horaire_id: matin.id,
      debut: matin.debut,
      fin: matin.fin,
      epinglee: false,
      pause: matin.pause,
    }))
  const avant = shifts(ajouterJours(LUNDI, -7), [4, 5, 6])
  const d: DonneesSemaine = {
    lundi: LUNDI,
    referentiel: demo.referentiel,
    absences: demo.absences.filter((a) => a.salarie_id !== ID),
    affectations: shifts(LUNDI, [0, 2, 3, 4]),
    avant,
    avantAvant: [],
    apres: [],
    historique: avant,
  }
  it('le bilan le dit et la génération le pose en proposition', () => {
    const s = analyser(d)
    const b = s.bilan.find((y) => y.salarie_id === ID)!
    expect(b.repos_obliges?.map((o) => o.jour)).toEqual([1])
    expect(
      reposAProposer(s, 0, 99).filter((r) => r.salarie_id === ID),
    ).toContainEqual({
      salarie_id: ID,
      jour: 1,
      motif_id: 99,
    })
  })
})

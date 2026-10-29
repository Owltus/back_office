import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau as creneauModele,
  probleme,
  salarieSolveur,
  SEMAINES_EQUITE,
} from '#/lib/planning/modele.ts'
import type { Creneau, Resultat } from '#/lib/planning/modele.ts'
import {
  contexte,
  equitesAvant,
  preparerGeneration,
} from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { ajouterJours, MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import type { Absence, Affectation, Salarie } from '#/lib/planning/types.ts'

/*
 * Équité (D15) sur un mois glissant (décision utilisateur du 2026-10-29) :
 * les 4 semaines d'avant comptent à poids égal ; une semaine où la personne
 * n'était pas là (arrivée récente, congés) compte pour sa part ; les soirs
 * et les matins tôt se comparent, comme les week-ends, à la part de chacun.
 */

const LUNDI = '2026-11-30'
const H = 60

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const { referentiel } = hotelDemo(LUNDI)
const fiche = (id: number, kw: Partial<Salarie> = {}): Salarie => ({
  ...referentiel.salaries[0],
  id,
  date_entree: null,
  date_sortie: null,
  semaine_type: referentiel.salaries[0].semaine_type.map((e) => ({
    ...e,
    mode: 'auto' as const,
  })),
  ...kw,
})

let suivant = 1
/** Un shift `semaines` semaines avant LUNDI, le jour `jour`. */
function shift(
  salarieId: number,
  semaines: number,
  jour: number,
  debut = '08:00',
): Affectation {
  return {
    id: suivant++,
    lundi: ajouterJours(LUNDI, -7 * semaines),
    salarie_id: salarieId,
    poste_id: referentiel.postes[0].id,
    jour,
    horaire_id: null,
    debut,
    fin: debut === '08:00' ? '15:00' : '23:00',
    epinglee: false,
    court: false,
    pause: 0,
  }
}

function faits(
  salaries: Salarie[],
  historique: Affectation[] | undefined,
  absences: Absence[] = [],
  minutes = salaries.map(() => 35 * H),
) {
  const d: DonneesSemaine = {
    lundi: LUNDI,
    referentiel: { ...referentiel, salaries },
    absences,
    affectations: [],
    avant: historique
      ? historique.filter((a) => a.lundi === ajouterJours(LUNDI, -7))
      : [],
    apres: [],
    historique,
  }
  return equitesAvant(
    contexte(d),
    d,
    salaries.map((x, i) => ({ x, minutes: minutes[i] })),
  )
}

describe('équité sur les 4 dernières semaines', () => {
  it('compte les 4 semaines d’avant, à poids égal, et pas la 5e', () => {
    expect(SEMAINES_EQUITE).toBe(4)
    const a = fiche(1)
    const b = fiche(2)
    const hist = [1, 2, 3, 4, 5].map((k) => shift(1, k, 5))
    const r = faits([a, b], hist)
    expect(r.get(1)!.weekends).toBe(4)
    expect(r.get(2)!.weekends).toBe(0)
  })

  it('sans historique lu : la seule semaine d’avant compte', () => {
    const hist = [1, 2, 3].map((k) => shift(1, k, 6))
    const d = faits([fiche(1), fiche(2)], undefined)
    expect(d.get(1)!.weekends).toBe(0)
    const avecAvant = equitesAvant(
      contexte({
        lundi: LUNDI,
        referentiel,
        absences: [],
        affectations: [],
        avant: hist.filter((a) => a.lundi === ajouterJours(LUNDI, -7)),
        apres: [],
      }),
      { avant: hist.filter((a) => a.lundi === ajouterJours(LUNDI, -7)) },
      [{ x: fiche(1), minutes: 35 * H }],
    )
    expect(avecAvant.get(1)!.weekends).toBe(1)
  })

  it('soirs et matins tôt comptés sur les 4 semaines', () => {
    const hist = [1, 2, 3, 4].map((k) => shift(1, k, 2, '16:00'))
    const r = faits([fiche(1), fiche(2)], hist)
    expect(r.get(1)!.soirs).toBe(4)
    expect(r.get(2)!.soirs).toBe(0)
  })

  it('une personne arrivée il y a 2 semaines n’est pas en retard pour les semaines d’avant son arrivée', () => {
    // a et b font un week-end sur deux sur 4 semaines ; c arrive il y a
    // deux semaines et fait un week-end sur ces deux-là.
    const arrivee = ajouterJours(LUNDI, -14)
    const salaries = [fiche(1), fiche(2), fiche(3, { date_entree: arrivee })]
    const hist = [
      shift(1, 1, 5),
      shift(1, 3, 5),
      shift(2, 2, 5),
      shift(2, 4, 5),
      shift(3, 1, 6),
    ]
    const r = faits(salaries, hist)
    // Semaines 3 et 4 : le groupe présent (a, b) a fait 1 week-end chacune ;
    // c en aurait fait sa part, 1 × 35 / 105 = 1/3.
    expect(r.get(3)!.weekends).toBeCloseTo(1 + 2 / 3, 2)
    expect(r.get(1)!.weekends).toBe(2)
    expect(r.get(2)!.weekends).toBe(2)
  })

  it('une semaine entière de congés compte pour sa part, pas pour zéro', () => {
    const lundiConges = ajouterJours(LUNDI, -7)
    const absences: Absence[] = Array.from({ length: 7 }, (_, j) => ({
      id: 100 + j,
      salarie_id: 2,
      jour: ajouterJours(lundiConges, j),
      motif_id: referentiel.motifs[0].id,
    }))
    const hist = [shift(1, 1, 5)]
    const r = faits([fiche(1), fiche(2)], hist, absences)
    expect(r.get(2)!.weekends).toBeCloseTo(0.5, 2)
    // Présent (moins de 4 jours d'absence) : ce qu'il a fait, rien de plus.
    const r2 = faits([fiche(1), fiche(2)], hist, absences.slice(0, 3))
    expect(r2.get(2)!.weekends).toBe(0)
  })

  it('la génération lit l’historique des 4 semaines, pas la seule semaine d’avant', () => {
    // a a fait les week-ends des semaines 2, 3 et 4 ; b celui de la semaine
    // d'avant. Avec la seule semaine d'avant, a serait « en avance » de 0.
    const { referentiel: ref } = hotelDemo(LUNDI)
    const titulaires = ref.salaries.filter(
      (x) =>
        x.actif &&
        x.type_contrat !== 'extra' &&
        !x.forfait_jours &&
        x.competences.some((c) => c.niveau === 'titulaire'),
    )
    const poste = (x: Salarie) =>
      x.competences.find((c) => c.niveau === 'titulaire')!.poste_id
    const a = titulaires.find((x) =>
      titulaires.some((y) => y.id !== x.id && poste(y) === poste(x)),
    )!
    const b = titulaires.find((y) => y.id !== a.id && poste(y) === poste(a))!
    const avec = (x: Salarie, k: number): Affectation => ({
      ...shift(x.id, k, 5),
      poste_id: poste(x),
    })
    const avant = [avec(b, 1)]
    const historique = [avec(a, 2), avec(a, 3), avec(a, 4), ...avant]
    const d: DonneesSemaine = {
      lundi: LUNDI,
      referentiel: ref,
      absences: [],
      affectations: [],
      avant,
      apres: [],
    }
    const de = (g: ReturnType<typeof preparerGeneration>, x: Salarie) =>
      g.probleme.salaries.find((s) => s.id === String(x.id))!.equiteAvant
    const mois = preparerGeneration(
      { ...d, historique },
      { aujourdhui: '2026-09-01' },
    )
    expect(de(mois, a).weekends).toBe(3)
    expect(de(mois, b).weekends).toBe(1)
    const seule = preparerGeneration(d, { aujourdhui: '2026-09-01' })
    expect(de(seule, a).weekends).toBe(0)
    expect(de(seule, b).weekends).toBe(1)
  })
})

describe('soirs et matins tôt : écart à sa part (générateur)', () => {
  const personne = (id: string, contratH: number, soirs: number) =>
    salarieSolveur({
      id,
      postes: new Set(['r']),
      minutesHebdoContrat: contratH * H,
      minutesHebdoMax: 48 * H,
      minutesJourMax: 12 * H,
      joursTravaillesMaxSemaine: 6,
      joursPreferesSemaine: 5,
      reposQuotidienMin: 11 * H,
      groupeEquite: 'g',
      equiteAvant: { weekends: 0, soirs, matinsTot: 0 },
    })
  const creneau = (id: string, debutH: number, kw: Partial<Creneau> = {}) =>
    creneauModele({
      id,
      poste: 'r',
      debut: 2 * MINUTES_PAR_JOUR + debutH * H,
      fin: 2 * MINUTES_PAR_JOUR + (debutH + 7) * H,
      effectif: 1,
      jourPlanning: 2,
      ...kw,
    })
  const qui = (r: Resultat, c: string) =>
    r.affectations.filter((a) => a.creneauId === c).map((a) => a.salarieId)
  const creneaux = [creneau('matin', 7), creneau('soir', 15, { soir: true })]

  it('un temps partiel qui a fait moins de soirs, à sa part, n’est pas en retard', () => {
    // a (35 h) : 6 soirs ; b (17 h 30) : 4. Sur 10 soirs, la part de b est
    // de 3,3 : il en a fait PLUS que sa part. Le soir va à a.
    for (const graine of [0, 1, 2, 3, 4]) {
      const r = generer(
        probleme({
          salaries: [personne('a', 35, 6), personne('b', 17.5, 4)],
          creneaux,
          graine,
        }),
        highs,
      )
      expect(qui(r, 'soir')).toEqual(['a'])
    }
  })

  it('à contrats égaux, le soir va à qui en a fait le moins', () => {
    for (const graine of [0, 1, 2, 3, 4]) {
      const r = generer(
        probleme({
          salaries: [personne('a', 35, 6), personne('b', 35, 4)],
          creneaux,
          graine,
        }),
        highs,
      )
      expect(qui(r, 'soir')).toEqual(['b'])
    }
  })
})

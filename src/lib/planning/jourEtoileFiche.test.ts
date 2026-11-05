import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  choisirJourEtoile,
  jourEtoile,
  texteJourEtoile,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import { horairesEtoileDuJour } from '#/lib/planning/etoile.ts'
import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { creneau, probleme, travail } from '#/lib/planning/modele.ts'
import type { Creneau } from '#/lib/planning/modele.ts'
import { versSolveur } from '#/lib/planning/regles.ts'
import { fiche } from '#/lib/planning/semaine.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import type { Horaire, JourType, Salarie } from '#/lib/planning/types.ts'

/*
 * Étape 6 (D6) : le jour de la journée étoile choisi dans la fiche est
 * imposé chaque semaine (sauf la semaine où elle saute) ; sans jour choisi,
 * le planning la place au mieux, comme avant.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const LIBRE: JourType[] = Array.from({ length: 7 }, (_, j) =>
  j < 5 ? { mode: 'auto' } : { mode: 'repos' },
)

const salarie = (semaine_type: JourType[]): Salarie => ({
  id: 1,
  prenom: 'Essai',
  nom: 'Étoile',
  groupe_id: null,
  type_contrat: 'cdi',
  heures_hebdo: 39,
  forfait_jours: false,
  mineur: false,
  competences: [{ poste_id: 1, niveau: 'titulaire' }],
  semaine_type,
  shifts_autorises: [],
  date_entree: null,
  date_sortie: null,
  actif: true,
  suite_de: null,
})

/** Du lundi au vendredi, un service de 7 h et un de 8 h chaque jour. */
const offre: Creneau[] = [0, 1, 2, 3, 4].flatMap((j) =>
  [7, 8].map((heures) =>
    creneau({
      id: `j${j}h${heures}`,
      poste: '1',
      debut: j * MINUTES_PAR_JOUR + 8 * H,
      fin: j * MINUTES_PAR_JOUR + (8 + heures) * H,
      effectif: 1,
    }),
  ),
)

function semaineDe(semaine: JourType[], absences = new Map()) {
  const f = fiche(salarie(semaine), '2026-11-02', {
    sansDecompte: new Set(),
    ecole: new Set(),
    absences,
  })
  const p = probleme({ salaries: [versSolveur(f)], creneaux: offre, graine: 1 })
  const r = generer(p, highs)
  return r.affectations
    .map((a) => {
      const c = p.creneaux.find((x) => x.id === a.creneauId)!
      return [Math.floor(c.debut / MINUTES_PAR_JOUR), travail(c) / H]
    })
    .sort((a, b) => a[0] - b[0])
}

describe('jour de la journée étoile choisi dans la fiche (D6)', () => {
  it('vendredi choisi : la journée courte tombe le vendredi', () => {
    const r = semaineDe(choisirJourEtoile(LIBRE, 4))
    expect(r).toEqual([
      [0, 8],
      [1, 8],
      [2, 8],
      [3, 8],
      [4, 7],
    ])
    // Lundi choisi : le lundi, pas un autre jour.
    expect(semaineDe(choisirJourEtoile(LIBRE, 0))[0]).toEqual([0, 7])
  })

  it('sans jour choisi : 4 × 8 h et une de 7 h, placée par le planning', () => {
    const r = semaineDe(LIBRE)
    expect(r.map(([, h]) => h).sort()).toEqual([7, 8, 8, 8, 8])
  })

  it('la semaine d’un congé, l’étoile saute : toutes les journées pleines', () => {
    const conge = new Map([[1, new Map([['2026-11-03', 99]])]])
    const r = semaineDe(choisirJourEtoile(LIBRE, 4), conge)
    expect(r.map(([, h]) => h)).toEqual([8, 8, 8, 8])
  })
})

describe('le choix dans la fiche', () => {
  it('un seul jour, jamais un jour de repos ; null : au choix du planning', () => {
    const s = choisirJourEtoile(choisirJourEtoile(LIBRE, 1), 4)
    expect(s.filter((e) => e.etoile)).toHaveLength(1)
    expect(jourEtoile(s)).toBe(4)
    expect(jourEtoile(choisirJourEtoile(LIBRE, 6))).toBeNull()
    expect(jourEtoile(choisirJourEtoile(s, null))).toBeNull()
  })

  it('« Règles appliquées » cite le jour choisi', () => {
    const b = { ...salarie(choisirJourEtoile(LIBRE, 4)) }
    expect(texteJourEtoile(b)).toMatch(/^Journée étoile : le vendredi/)
    expect(texteJourEtoile({ ...b, semaine_type: LIBRE })).toMatch(
      /placée au mieux/,
    )
    expect(texteJourEtoile({ ...b, heures_hebdo: 35 })).toBeNull()
  })

  it('horaires possibles ce jour-là : 7 h pour un 39 h ; aucun si rien', () => {
    const h = (id: number, debut: string, fin: string, pause = 0): Horaire =>
      ({ id, debut, fin, pause, periode: 'matin' }) as unknown as Horaire
    const possibles = [
      h(1, '07:00', '15:00'),
      h(2, '07:00', '14:00'),
      h(3, '07:00', '14:30'),
    ]
    expect(
      horairesEtoileDuJour(possibles, null, 39 * H).map((x) => x.id),
    ).toEqual([2])
    // Un 37 h n'a pas de journées imposées : tout ce qui fait 7 h à 8 h.
    expect(
      horairesEtoileDuJour(possibles, null, 37 * H).map((x) => x.id),
    ).toEqual([2, 3])
    expect(horairesEtoileDuJour([possibles[0]], null, 39 * H)).toEqual([])
  })
})

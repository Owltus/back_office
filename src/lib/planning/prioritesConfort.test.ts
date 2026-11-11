import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { borneNiveau, generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import type { Probleme } from '#/lib/planning/modele.ts'
import { analyser, preparerGeneration } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import {
  AUJOURDHUI_GENERE,
  semaineGeneree,
} from '#/lib/planning/test/hotelGenere.ts'
import type { Affectation } from '#/lib/planning/types.ts'

/*
 * CALCUL PAR NIVEAUX (décisions de l'utilisateur du 2026-11-10 et du
 * 2026-11-11) : aucun déplacement de repos n'est acheté par du confort, ni
 * par l'équilibre. Oracle : le contrôle « sans déplacement »
 * (`Probleme.controle.sansDeplacement`, un repos seul ou un bloc de 4 au
 * rang de 3 repos) ; un déplacement de plus que lui doit gagner une place,
 * un trou ou des heures dues.
 */

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

/** La semaine de l'hôtel tiré par `graine`, calculée avec `controle`. */
function calculer(graine: number, controle?: Probleme['controle']): SemaineOut {
  const d = semaineGeneree(graine)
  const g = preparerGeneration(d, {
    aujourdhui: AUJOURDHUI_GENERE,
    graine: 1,
    horizon: { suivanteRecalculee: false },
  })
  const r = generer({ ...g.probleme, controle }, highs)
  const nouveaux: Affectation[] = g
    .traduire(r)
    .filter((n) => n.jour >= g.depuis)
    .map((n, i) => ({ ...n, id: 100_000 + i, lundi: d.lundi, epinglee: false }))
  return analyser(
    { ...d, affectations: [...d.affectations, ...nouveaux] },
    AUJOURDHUI_GENERE,
  )
}

const compte = (s: SemaineOut, regles: string[]) =>
  s.bilan.reduce(
    (t, b) => t + b.alertes.filter((a) => regles.includes(a.regle)).length,
    0,
  )
/** Ce que les niveaux au-dessus des déplacements regardent. */
const priorites = (s: SemaineOut) => ({
  places: s.stats.places - s.stats.pourvues,
  trous: s.trous.length,
  heures: s.bilan.reduce(
    (t, b) => t + Math.max(0, b.minutes_contrat - b.minutes),
    0,
  ),
  infractions: s.stats.infractions,
})
const DEPLACEMENTS = ['RYTHME-REPOS-SEUL', 'RYTHME-TRANSITION']

describe('calcul par niveaux : le confort n’achète aucun déplacement', () => {
  it('un déplacement de plus que le contrôle gagne une place, un trou ou des heures', () => {
    // Hôtel n° 41 du banc : avant le calcul par priorités, un repos y était
    // déplacé pour un équilibre et du confort ; n° 12 : plusieurs
    // déplacements, chacun pour une place.
    for (const graine of [41, 12]) {
      const n = calculer(graine)
      const c = calculer(graine, { sansDeplacement: true })
      const pn = priorites(n)
      const pc = priorites(c)
      expect(pn.infractions).toBe(0)
      if (compte(n, DEPLACEMENTS) > compte(c, DEPLACEMENTS))
        expect(
          pn.places < pc.places || pn.trous < pc.trous || pn.heures < pc.heures,
        ).toBe(true)
      else expect(pn).toEqual(pc)
      // Jamais moins bien que le contrôle sur ce qui passe avant.
      expect(pn.places).toBeLessThanOrEqual(pc.places)
      expect(pn.heures).toBeLessThanOrEqual(pc.heures)
    }
  }, 120_000)

  it('la borne d’un niveau : exacte pour des poids entiers', () => {
    // Deux solutions d'un niveau à poids entiers diffèrent d'au moins 1 :
    // la borne garde les aussi bonnes, jamais une moins bonne.
    const v = 1e10
    expect(borneNiveau(v, true)).toBeGreaterThan(v)
    expect(borneNiveau(v, true)).toBeLessThan(v + 1)
    expect(borneNiveau(v, false)).toBeGreaterThan(v)
    expect(borneNiveau(v, false)).toBeLessThan(v + 1e5)
    expect(borneNiveau(0, false)).toBeGreaterThan(0)
  })
})

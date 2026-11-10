import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { bornePriorites, generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import { analyser, preparerGeneration } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import {
  AUJOURDHUI_GENERE,
  semaineGeneree,
} from '#/lib/planning/test/hotelGenere.ts'
import type { Affectation } from '#/lib/planning/types.ts'

/*
 * CALCUL PAR PRIORITÉS (décision de l'utilisateur du 2026-11-10) : aucun
 * déplacement de repos n'est acheté par du confort. Oracle : le calcul
 * d'avant, en UN seul temps, s'obtient avec le même HiGHS sans son API
 * persistante (`resoudreModele` retombe alors sur un seul calcul).
 */

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

/** La semaine de l'hôtel tiré par `graine`, calculée par `solveur`. */
function calculer(graine: number, solveur: Highs): SemaineOut {
  const d = semaineGeneree(graine)
  const g = preparerGeneration(d, {
    aujourdhui: AUJOURDHUI_GENERE,
    graine: 1,
    horizon: { suivanteRecalculee: false },
  })
  const r = generer(g.probleme, solveur)
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
/** Ce que les priorités regardent, sauf les déplacements. */
const priorites = (s: SemaineOut) => ({
  places: s.stats.places - s.stats.pourvues,
  trous: s.trous.length,
  heures: s.bilan.reduce(
    (t, b) => t + Math.max(0, b.minutes_contrat - b.minutes),
    0,
  ),
  desequilibres: s.desequilibres?.length ?? 0,
  infractions: s.stats.infractions,
})
const DEPLACEMENTS = ['RYTHME-REPOS-SEUL', 'RYTHME-TRANSITION']

describe('calcul par priorités : le confort n’achète aucun déplacement', () => {
  it('refusé avant, accepté après : un déplacement payé en partie par le confort disparaît', () => {
    // Hôtel fictif n° 41 du banc : en un seul temps, un repos est déplacé
    // sans gagner ni place, ni trou, ni heure due ; il ne gagne qu'un
    // équilibre entre les moments (qui vaut moins qu'un déplacement, ordre
    // de décision) et le confort paie le reste. Par priorités, il n'est
    // plus fait ; places, trous, heures dues et infractions sont les mêmes.
    const avant = calculer(41, {
      solve: (lp, o) => highs.solve(lp, o),
    })
    const apres = calculer(41, highs)
    expect(compte(avant, DEPLACEMENTS)).toBe(1)
    expect(compte(apres, DEPLACEMENTS)).toBe(0)
    const { desequilibres: da, ...pa } = priorites(avant)
    const { desequilibres: dn, ...pn } = priorites(apres)
    expect(pn).toEqual(pa)
    expect(dn).toBe(da + 1)
  }, 60_000)

  it('la borne des priorités : une égalité de 1 au confort, rien de plus', () => {
    // 1 : une place contre le repos seul qui la remplirait, une égalité
    // que le confort départage. 99 (repos seul / bloc de 4), 100, 200 et
    // une minute due (au moins 400) restent des priorités.
    const v = 1e10
    expect(bornePriorites(v, true)).toBeGreaterThan(v + 1)
    expect(bornePriorites(v, true)).toBeLessThan(v + 2)
    expect(bornePriorites(v, false)).toBeLessThan(v + 99)
  })
})

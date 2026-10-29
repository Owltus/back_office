import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  analyser,
  aPoserFixes,
  preparerGeneration,
} from '#/lib/planning/semaine.ts'
import type { DonneesSemaine, NouveauShift } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Affectation } from '#/lib/planning/types.ts'

/*
 * Bout à bout sur l'hôtel fictif : préparer → HiGHS → poser → analyser. Le
 * juge est le VÉRIFICATEUR (via `analyser`), indépendant du solveur : aucune
 * infraction à la loi, toutes les places obligatoires tenues.
 */

let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const LUNDI = '2026-11-02'
const AUJOURDHUI = '2026-10-27'

function poser(
  lundi: string,
  nouveaux: NouveauShift[],
  depart = 1000,
): Affectation[] {
  return nouveaux.map((n, i) => ({
    id: depart + i,
    lundi,
    salarie_id: n.salarie_id,
    poste_id: n.poste_id,
    jour: n.jour,
    horaire_id: n.horaire_id,
    debut: n.debut,
    fin: n.fin,
    epinglee: false,
    court: n.court,
    pause: n.pause,
  }))
}

function donnees(affectations: Affectation[] = []): DonneesSemaine {
  const { referentiel, absences } = hotelDemo(LUNDI)
  return {
    lundi: LUNDI,
    referentiel,
    absences,
    affectations,
    avant: [],
    apres: [],
  }
}

describe('génération bout à bout (hôtel fictif)', () => {
  it('une semaine complète, légale, chaque contrat au plus près', () => {
    const d = donnees()
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI, graine: 1 })
    const r = generer(g.probleme, highs)
    expect(r.statut).toBe('optimal')
    const semaine = analyser({
      ...d,
      affectations: poser(LUNDI, g.traduire(r)),
    })
    expect(semaine.stats.infractions).toBe(0)
    expect(semaine.stats.pourvues).toBe(semaine.stats.places)
    expect(semaine.a_pourvoir).toEqual([])
    // Un shift par personne et par jour.
    const cles = semaine.affectations.map((a) => `${a.salarie_id}|${a.jour}`)
    expect(new Set(cles).size).toBe(cles.length)
  })

  it('deux « Compléter » de suite rebattent les propositions, aussi bien', () => {
    const d = donnees()
    const g1 = preparerGeneration(d, { aujourdhui: AUJOURDHUI })
    const premiers = poser(LUNDI, g1.traduire(generer(g1.probleme, highs)))
    const g2 = preparerGeneration(donnees(premiers), { aujourdhui: AUJOURDHUI })
    const seconds = poser(LUNDI, g2.traduire(generer(g2.probleme, highs)), 2000)
    const sig = (as: Affectation[]) =>
      as
        .map((a) => `${a.salarie_id}|${a.jour}|${a.poste_id}|${a.horaire_id}`)
        .sort()
        .join(',')
    expect(sig(seconds)).not.toBe(sig(premiers))
    const s2 = analyser(donnees(seconds))
    expect(s2.stats.infractions).toBe(0)
    expect(s2.stats.pourvues).toBe(s2.stats.places)
  })

  it('les shifts validés restent tels quels', () => {
    const d = donnees()
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI })
    const poses = poser(LUNDI, g.traduire(generer(g.probleme, highs)))
    const valide = { ...poses[0], epinglee: true }
    const g2 = preparerGeneration(donnees([valide, ...poses.slice(1)]), {
      aujourdhui: AUJOURDHUI,
    })
    const nouveaux = g2.traduire(generer(g2.probleme, highs))
    // Le validé n'est pas reproposé, et personne d'autre ne prend sa case.
    expect(
      nouveaux.some(
        (n) => n.salarie_id === valide.salarie_id && n.jour === valide.jour,
      ),
    ).toBe(false)
  })

  it('les horaires fixes posent seulement le personnel à jours fixes, sur ses postes', () => {
    const d = donnees()
    const seulement = aPoserFixes(d, AUJOURDHUI)
    const g = preparerGeneration(d, {
      aujourdhui: AUJOURDHUI,
      seulement,
      sansEffacer: true,
      titulairesSeulement: true,
    })
    const nouveaux = g.traduire(generer(g.probleme, highs))
    expect(nouveaux.length).toBeGreaterThan(0)
    for (const n of nouveaux) expect(seulement.has(n.salarie_id)).toBe(true)
  })

  it('on ne crée jamais les jours passés de la semaine en cours', () => {
    const d = donnees()
    const g = preparerGeneration(d, { aujourdhui: '2026-11-04' }) // mercredi
    expect(g.depuis).toBe(2)
    const nouveaux = g.traduire(generer(g.probleme, highs))
    expect(nouveaux.every((n) => n.jour >= 2)).toBe(true)
  })
})

// Relecture adverse du 2026-10-29 (étape 10) : le repos de 35 h de la
// semaine d'avant dépend de la semaine d'avant-avant, que l'analyse et la
// génération lisent désormais (`DonneesSemaine.avantAvant`).
describe('repos de 35 h : la semaine d’avant relue avec celle d’avant-avant', () => {
  const AVANT = '2026-10-26'
  const AVANT_AVANT = '2026-10-19'
  const shift = (
    id: number,
    lundi: string,
    jour: number,
    debut: string,
    fin: string,
  ): Affectation => ({
    id,
    lundi,
    salarie_id: 3,
    poste_id: 2, // Réception
    jour,
    horaire_id: null,
    debut,
    fin,
    epinglee: true,
    court: false,
    pause: 0,
  })
  // Semaine d'avant : lundi libre, mardi à vendredi 7 h - 15 h, samedi
  // 14 h - 22 h, dimanche libre.
  const avant = [
    ...[1, 2, 3, 4].map((j) => shift(10 + j, AVANT, j, '07:00', '15:00')),
    shift(15, AVANT, 5, '14:00', '22:00'),
  ]
  const lundi7h = shift(20, LUNDI, 0, '07:00', '15:00')
  const lundi10h = shift(21, LUNDI, 0, '10:00', '18:00')
  const regles = (d: DonneesSemaine) =>
    analyser(d)
      .affectations.filter((a) => a.salarie_id === 3)
      .flatMap((a) => a.alertes.map((x) => x.regle))
  const avec = (avantAvant: Affectation[] | undefined, lundi: Affectation) => ({
    ...donnees([lundi]),
    avant,
    avantAvant,
  })
  const dimanche23h = [shift(1, AVANT_AVANT, 6, '15:00', '23:00')]

  it('avant-avant fini le dimanche à 23 h : lundi 7 h refusé, lundi 10 h accepté', () => {
    expect(regles(avec(dimanche23h, lundi7h))).toContain('R-REPOS-HEBDO-35H')
    expect(regles(avec(dimanche23h, lundi10h))).not.toContain(
      'R-REPOS-HEBDO-35H',
    )
  })

  it('avant-avant sans service : le lundi libre suffit, lundi 7 h accepté', () => {
    expect(regles(avec([], lundi7h))).not.toContain('R-REPOS-HEBDO-35H')
  })

  it('avant-avant non lue : prudence, lundi 7 h refusé', () => {
    expect(regles(avec(undefined, lundi7h))).toContain('R-REPOS-HEBDO-35H')
  })

  it('la génération applique la même borne que le vérificateur', () => {
    const d = { ...donnees(), avant, avantAvant: dimanche23h }
    const g = preparerGeneration(d, { aujourdhui: AUJOURDHUI, graine: 1 })
    const r = generer(g.probleme, highs)
    const poses = poser(LUNDI, g.traduire(r))
    const semaine = analyser({ ...d, affectations: poses })
    expect(semaine.stats.infractions).toBe(0)
    const sien = poses.find((a) => a.salarie_id === 3 && a.jour === 0)
    if (sien) expect(sien.debut >= '09:00').toBe(true)
  })
})

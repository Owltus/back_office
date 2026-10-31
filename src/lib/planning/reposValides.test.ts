import { describe, expect, it } from 'vitest'

import { analyser, preparerGeneration } from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Absence, Motif } from '#/lib/planning/types.ts'

/*
 * Repos validés comme les shifts (demande utilisateur du 2026-10-31). Un
 * repos posé en proposition est montré comme tel (`repos_proposes`), et la
 * génération ne le voit plus : la RPC l'efface avec les shifts proposés
 * (`planning_appliquer_generation`). Un repos validé reste une absence.
 */

const LUNDI = '2026-11-02'
const AUJOURDHUI = '2026-10-31'

function donnees(absences: Absence[]): DonneesSemaine {
  const demo = hotelDemo(LUNDI)
  const repos: Motif = {
    id: 99,
    code: 'R',
    nom: 'Repos',
    couleur: '#64748b',
    decompte: false,
    nature: 'repos',
  }
  return {
    lundi: LUNDI,
    referentiel: {
      ...demo.referentiel,
      motifs: [...demo.referentiel.motifs, repos],
    },
    absences: [...demo.absences, ...absences],
    affectations: [],
    avant: [],
    apres: [],
  }
}

const repos = (id: number, jour: string, epinglee: boolean): Absence => ({
  id,
  salarie_id: 3,
  jour,
  motif_id: 99,
  epinglee,
})

describe('repos validés comme les shifts', () => {
  const d = donnees([
    repos(1, '2026-11-04', false), // mercredi : proposition
    repos(2, '2026-11-05', true), // jeudi : validé
  ])

  it('l’analyse dit quels repos posés sont en proposition', () => {
    const b = analyser(d).bilan.find((x) => x.salarie_id === 3)
    expect(b?.repos_proposes).toEqual([2])
    expect(b?.absences).toMatchObject({ 2: 99, 3: 99 })
  })

  it('la génération ne garde que le repos validé', () => {
    const sol = preparerGeneration(d, {
      aujourdhui: AUJOURDHUI,
    }).probleme.salaries.find((x) => x.id === '3')
    expect(sol?.indisponibilites.has(3)).toBe(true)
    expect(sol?.indisponibilites.has(2)).toBe(false)
  })

  it('« Compléter » sans rien effacer garde aussi le repos proposé', () => {
    const sol = preparerGeneration(d, {
      aujourdhui: AUJOURDHUI,
      sansEffacer: true,
    }).probleme.salaries.find((x) => x.id === '3')
    expect(sol?.indisponibilites.has(2)).toBe(true)
    expect(sol?.indisponibilites.has(3)).toBe(true)
  })
})

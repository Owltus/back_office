import { describe, expect, it } from 'vitest'

import {
  caseDe,
  cleBandeau,
  validationDeCase,
} from '#/components/planning/mois/mois.ts'
import {
  reposProposesParJour,
  statutDuJour,
  validationRepos,
} from '#/components/planning/semaine/edition.ts'
import type { BilanOut, SemaineOut } from '#/lib/planning/semaine.ts'
import type { Motif } from '#/lib/planning/types.ts'

/*
 * Un jour férié rattrapé (JFR, 2026-11-02) posé par la génération est une
 * PROPOSITION, montrée en pointillés et validée comme un repos posé ; un JFR
 * validé ne l'est plus. Une autre absence ne se valide jamais.
 */

const JFR: Motif = {
  id: 77,
  code: 'JFR',
  nom: 'Jour férié rattrapé',
  couleur: '#c084fc',
  decompte: true,
  nature: 'absence',
}
const CP: Motif = { ...JFR, id: 1, code: 'CP', nom: 'Congés' }
const motifs = [JFR, CP]

const bilan = (b: Partial<BilanOut> = {}): BilanOut => ({
  salarie_id: 3,
  minutes: 0,
  minutes_contrat: 0,
  minutes_max: 0,
  jours: 0,
  alertes: [],
  absences: { 1: JFR.id, 2: JFR.id, 4: CP.id },
  absences_semaine_type: [],
  repos_fixes: [],
  hors_contrat: [],
  repos_deduits: [],
  repos_proposes: [],
  jfr_proposes: [1],
  ...b,
})

const semaine = (b: BilanOut, verrouillee = false) =>
  ({
    lundi: '2026-11-16',
    affectations: [],
    bilan: [b],
    verrouillee,
  }) as unknown as SemaineOut

describe('JFR dans la vue semaine', () => {
  it('proposé : en proposition, et se valide', () => {
    const st = statutDuJour(bilan(), 1, motifs)
    expect(st).toMatchObject({ nom: 'Jour férié rattrapé', jfr: true })
    expect(st?.proposition).toBe(true)
    expect(validationRepos(bilan(), 1, motifs)).toEqual({
      valide: false,
      deduit: false,
    })
  })

  it('validé : plus en proposition, se remet en proposition', () => {
    expect(statutDuJour(bilan(), 2, motifs)?.proposition).toBe(false)
    expect(validationRepos(bilan(), 2, motifs)).toEqual({
      valide: true,
      deduit: false,
    })
  })

  it('un congé ne se valide pas, et une semaine verrouillée ne propose rien', () => {
    expect(statutDuJour(bilan(), 4, motifs)?.proposition).toBeUndefined()
    expect(validationRepos(bilan(), 4, motifs)).toBeNull()
    expect(statutDuJour(bilan(), 1, motifs, true)?.proposition).toBe(false)
  })

  it('compte avec les propositions', () => {
    expect(reposProposesParJour(semaine(bilan()))).toEqual([
      0, 1, 0, 0, 0, 0, 0,
    ])
    expect(reposProposesParJour(semaine(bilan(), true))).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ])
  })
})

describe('JFR dans la vue mois', () => {
  const semaines = new Map([['2026-11-16', semaine(bilan())]])
  it('proposé et validé ne fusionnent pas, et se valident', () => {
    const propose = caseDe(semaines, motifs, 3, '2026-11-17')
    const valide = caseDe(semaines, motifs, 3, '2026-11-18')
    expect(propose).toMatchObject({ type: 'absence', proposition: true })
    expect(valide).toMatchObject({ type: 'absence', proposition: false })
    expect(cleBandeau(propose)).not.toBe(cleBandeau(valide))
    expect(validationDeCase(propose)).toEqual({ valide: false, deduit: false })
    expect(validationDeCase(valide)).toEqual({ valide: true, deduit: false })
    expect(validationDeCase(caseDe(semaines, motifs, 3, '2026-11-20'))).toBe(
      null,
    )
  })
})

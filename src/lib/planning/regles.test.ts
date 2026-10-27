import { describe, expect, it } from 'vitest'

import {
  alerteBesoin,
  resume,
  versSolveur,
  type Fiche,
} from '#/lib/planning/regles.ts'

/*
 * Port de `backend/tests/test_regles.py` (prototype) : la traduction des
 * règles HCR en plafonds chiffrés. Valeurs attendues du prototype.
 */

const H = 60

const fiche = (kw: Partial<Fiche> = {}): Fiche => ({
  id: 'x',
  postes: new Set(['1']),
  typeContrat: 'cdi',
  minutesHebdo: 35 * H,
  ...kw,
})

const reglesDu = (f: Fiche) => new Set(resume(f).map((l) => l.regle))

describe('règles HCR → solveur', () => {
  it('temps plein 39 h', () => {
    const s = versSolveur(fiche({ minutesHebdo: 39 * H }))
    expect(s.minutesHebdoContrat).toBe(39 * H)
    expect(s.minutesHebdoMax).toBe(48 * H)
    expect(s.reposQuotidienMin).toBe(11 * H)
    expect(s.joursTravaillesMaxSemaine).toBe(6)
    expect(s.joursPreferesSemaine).toBe(5)
    expect(s.reposDeuxSemaines).toBe(3)
  })

  it('temps partiel plafonné à un tiers et sous 35 h', () => {
    expect(versSolveur(fiche({ minutesHebdo: 24 * H })).minutesHebdoMax).toBe(
      32 * H,
    )
    expect(
      versSolveur(fiche({ minutesHebdo: 30 * H })).minutesHebdoMax,
    ).toBeLessThan(35 * H)
  })

  it('un extra sans heures au contrat est plafonné à 48 h seulement', () => {
    expect(
      versSolveur(fiche({ typeContrat: 'extra', minutesHebdo: 0 }))
        .minutesHebdoMax,
    ).toBe(48 * H)
    expect(versSolveur(fiche({ minutesHebdo: 0 })).minutesHebdoMax).toBe(0)
  })

  it('mineur', () => {
    const s = versSolveur(fiche({ typeContrat: 'apprenti', mineur: true }))
    expect([s.minutesJourMax, s.minutesHebdoMax, s.reposQuotidienMin]).toEqual([
      8 * H,
      35 * H,
      12 * H,
    ])
    expect(s.nuitInterdite).toBe(true)
    expect(s.reposConsecutifs).toBe(true)
  })

  it('stagiaire limité à 10 h par jour', () => {
    expect(
      versSolveur(fiche({ typeContrat: 'stagiaire' })).minutesJourMax,
    ).toBe(10 * H)
  })

  it('besoin trop long pour sa catégorie', () => {
    expect(alerteBesoin('cuisine', 11 * H)).toBeNull()
    expect(alerteBesoin('cuisine', 11 * H + 1)).not.toBeNull()
    expect(alerteBesoin('reception', 12 * H)).toBeNull()
  })

  it('le résumé cite les règles du mineur', () => {
    const r = reglesDu(fiche({ mineur: true }))
    for (const regle of [
      'R-NUIT-MINEUR',
      'R-REPOS-HEBDO-MINEUR',
      'R-SEMAINE-MAX',
    ]) {
      expect(r.has(regle)).toBe(true)
    }
  })

  it('heures dues moins les absences (R-ABSENCE-HEURES)', () => {
    const dues = (heures: number, absences: number) =>
      versSolveur(
        fiche({ minutesHebdo: heures * H, joursAbsenceDecomptes: absences }),
      ).minutesHebdoContrat
    expect(dues(39, 0)).toBe(39 * H)
    expect(dues(39, 1)).toBe(32 * H)
    expect(dues(39, 2)).toBe(24 * H)
    expect(dues(35, 1)).toBe(28 * H)
    expect(dues(39, 7)).toBe(0)
    expect(dues(35, 5)).toBe(0)
  })

  it('repos hebdomadaire de 35 h pour les majeurs', () => {
    expect(versSolveur(fiche()).reposHebdoMin).toBe(35 * H)
    expect(versSolveur(fiche({ mineur: true })).reposHebdoMin).toBe(0)
    expect(reglesDu(fiche()).has('R-REPOS-HEBDO-35H')).toBe(true)
  })

  it('mineur à temps partiel plafonné aux heures complémentaires', () => {
    const s = versSolveur(
      fiche({ typeContrat: 'apprenti', mineur: true, minutesHebdo: 20 * H }),
    )
    expect(s.minutesHebdoMax).toBe(26 * H + 40)
  })
})

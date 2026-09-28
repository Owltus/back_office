import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  NIVEAUX_CLASSEUR,
  capacites,
  niveauEffectif,
  niveauPage,
  peutCreerClasseur,
  peutCreerPrive,
  peutReordonnerListe,
} from '#/lib/classeur/droits.ts'
import type {
  NiveauClasseur,
  NiveauEffectif,
  NiveauPage,
} from '#/lib/classeur/droits.ts'

/*
 * Miroir de `private.classeur_niveau_de` (classeur_acces_2026-09-28.sql) :
 * la même matrice que `supabase/verif_classeur_acces.sql`, qui l'éprouve en
 * base. Si l'un change, l'autre doit changer.
 */

const MOI = '00000000-0000-0000-0000-000000000001'
const AUTRE = '00000000-0000-0000-0000-000000000002'
const pourTous = (
  acces_tous: NiveauClasseur,
  created_by: string | null = AUTRE,
) => ({
  acces_tous,
  created_by,
})

describe('niveauEffectif — la matrice validée par l’utilisateur', () => {
  const cas: [
    string,
    NiveauPage,
    ReturnType<typeof pourTous>,
    NiveauClasseur | null,
    NiveauEffectif,
  ][] = [
    ['sans droit de page', null, pourTous('ecriture'), 'ecriture', 'aucun'],
    [
      'page lecture, lecture pour tous',
      'lecture',
      pourTous('lecture'),
      null,
      'lecture',
    ],
    [
      'page lecture, exception écriture : plafond',
      'lecture',
      pourTous('lecture'),
      'ecriture',
      'lecture',
    ],
    ['page lecture, privé', 'lecture', pourTous('aucun'), null, 'aucun'],
    [
      'page écriture, lecture pour tous',
      'ecriture',
      pourTous('lecture'),
      null,
      'lecture',
    ],
    [
      'page écriture, exception écriture',
      'ecriture',
      pourTous('lecture'),
      'ecriture',
      'ecriture',
    ],
    [
      'page écriture, créateur',
      'ecriture',
      pourTous('lecture', MOI),
      null,
      'ecriture',
    ],
    [
      'page écriture, créateur retiré',
      'ecriture',
      pourTous('lecture', MOI),
      'aucun',
      'aucun',
    ],
    [
      'page écriture, privé ouvert en lecture',
      'ecriture',
      pourTous('aucun'),
      'lecture',
      'lecture',
    ],
    [
      'page écriture, écriture pour tous',
      'ecriture',
      pourTous('ecriture'),
      null,
      'ecriture',
    ],
    ['gestion, privé', 'gestion', pourTous('aucun'), 'aucun', 'gestion'],
  ]
  it.each(cas)('%s', (_nom, page, classeur, exception, attendu) => {
    expect(niveauEffectif(page, classeur, exception, MOI)).toBe(attendu)
  })
  it('classeur non chargé : aucun (on masque)', () => {
    expect(niveauEffectif('ecriture', null, null, MOI)).toBe('aucun')
  })
  it('un orphelin (créateur supprimé) ne donne l’écriture à personne', () => {
    expect(
      niveauEffectif('ecriture', pourTous('lecture', null), null, MOI),
    ).toBe('lecture')
  })
})

describe('propriétés', () => {
  const page = fc.constantFrom<NiveauPage>(
    null,
    'lecture',
    'ecriture',
    'gestion',
  )
  const niveau = fc.constantFrom(...NIVEAUX_CLASSEUR)
  const exception = fc.option(niveau, { nil: null })
  const createur = fc.constantFrom(MOI, AUTRE, null)
  const rang = { aucun: 0, lecture: 1, ecriture: 2, gestion: 3 } as const
  it('jamais au-dessus du droit de page (hors gestion), exception prioritaire', () => {
    fc.assert(
      fc.property(page, niveau, exception, createur, (p, tous, ex, c) => {
        const n = niveauEffectif(
          p,
          { acces_tous: tous, created_by: c },
          ex,
          MOI,
        )
        if (p === null) return n === 'aucun'
        if (p === 'gestion') return n === 'gestion'
        if (rang[n] > rang[p]) return false
        if (ex === 'aucun') return n === 'aucun'
        if (ex !== null) return n === (p === 'lecture' ? 'lecture' : ex)
        return true
      }),
      { numRuns: 1000, seed: 20260928 },
    )
  })
})

describe('capacités — ce que l’écriture ne permet PAS', () => {
  it('écriture : modifier oui ; accès, suppression, restauration, purge non', () => {
    expect(capacites('ecriture')).toEqual({
      lire: true,
      modifier: true,
      gererAcces: false,
      supprimerClasseur: false,
      restaurer: false,
      viderHistorique: false,
    })
  })
  it('gestion : tout ; lecture : lire seulement ; aucun : rien', () => {
    expect(Object.values(capacites('gestion')).every(Boolean)).toBe(true)
    expect(capacites('lecture')).toMatchObject({ lire: true, modifier: false })
    expect(Object.values(capacites('aucun')).some(Boolean)).toBe(false)
  })
  it('création, « privé », ordre de la liste', () => {
    expect(
      [null, 'lecture', 'ecriture', 'gestion'].map((p) =>
        peutCreerClasseur(p as NiveauPage),
      ),
    ).toEqual([false, false, true, true])
    expect(peutCreerPrive('ecriture')).toBe(false)
    expect(peutCreerPrive('gestion')).toBe(true)
    expect(peutReordonnerListe('ecriture')).toBe(false)
    expect(peutReordonnerListe('gestion')).toBe(true)
  })
  it('niveauPage lit le plus haut niveau accordé', () => {
    const can = (max: string) => (_p: 'classeur', n: string) =>
      ['lecture', 'ecriture', 'gestion'].indexOf(n) <=
      ['lecture', 'ecriture', 'gestion'].indexOf(max)
    expect(niveauPage(can('ecriture'))).toBe('ecriture')
    expect(niveauPage(() => false)).toBeNull()
  })
})

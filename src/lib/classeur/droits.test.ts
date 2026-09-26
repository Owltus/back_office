import { describe, expect, it } from 'vitest'

import {
  estProprietaire,
  peutModifierClasseur,
  peutReordonnerClasseurs,
} from '#/lib/classeur/droits.ts'

/*
 * Miroir des policies de classeur_proprietaire_2026-09-26.sql : la matrice
 * niveau × propriété doit donner la même réponse que la base.
 */

const MOI = '872654b7-0000-0000-0000-000000000001'
const AUTRE = '872654b7-0000-0000-0000-000000000002'
const mien = { created_by: MOI }
const sien = { created_by: AUTRE }
const orphelin = { created_by: null }

const LECTURE = { ecriture: false, gestion: false }
const ECRITURE = { ecriture: true, gestion: false }
const GESTION = { ecriture: true, gestion: true }

describe('estProprietaire', () => {
  it('vrai seulement pour son propre classeur, jamais pour un orphelin', () => {
    expect(estProprietaire(mien, MOI)).toBe(true)
    expect(estProprietaire(sien, MOI)).toBe(false)
    expect(estProprietaire(orphelin, MOI)).toBe(false)
    expect(estProprietaire(mien, null)).toBe(false)
    expect(estProprietaire(null, MOI)).toBe(false)
    expect(estProprietaire(undefined, undefined)).toBe(false)
  })
})

describe('peutModifierClasseur — matrice niveau × propriété', () => {
  it('lecture : jamais', () => {
    for (const c of [mien, sien, orphelin]) {
      expect(peutModifierClasseur(LECTURE, c, MOI)).toBe(false)
    }
  })
  it('écriture : le sien seulement', () => {
    expect(peutModifierClasseur(ECRITURE, mien, MOI)).toBe(true)
    expect(peutModifierClasseur(ECRITURE, sien, MOI)).toBe(false)
    expect(peutModifierClasseur(ECRITURE, orphelin, MOI)).toBe(false)
    // Classeur pas encore chargé : on masque, on n'autorise pas.
    expect(peutModifierClasseur(ECRITURE, undefined, MOI)).toBe(false)
  })
  it('gestion : tout, même sans classeur chargé', () => {
    for (const c of [mien, sien, orphelin, null, undefined]) {
      expect(peutModifierClasseur(GESTION, c, MOI)).toBe(true)
    }
  })
})

describe('peutReordonnerClasseurs — un ordre partagé', () => {
  it('gestion toujours ; écriture seulement si tous sont à soi ; jamais en lecture', () => {
    expect(peutReordonnerClasseurs(GESTION, [mien, sien], MOI)).toBe(true)
    expect(peutReordonnerClasseurs(ECRITURE, [mien, mien], MOI)).toBe(true)
    expect(peutReordonnerClasseurs(ECRITURE, [mien, sien], MOI)).toBe(false)
    expect(peutReordonnerClasseurs(ECRITURE, [mien, orphelin], MOI)).toBe(false)
    expect(peutReordonnerClasseurs(ECRITURE, [], MOI)).toBe(false)
    expect(peutReordonnerClasseurs(LECTURE, [mien], MOI)).toBe(false)
  })
})

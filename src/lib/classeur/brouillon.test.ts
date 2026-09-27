import { describe, expect, it } from 'vitest'

import {
  DUREE_BROUILLON_MS,
  brouillonDiffere,
  cleBrouillon,
  ecrireBrouillon,
  effacerBrouillon,
  lireBrouillon,
  purgerBrouillonsPerimes,
} from '#/lib/classeur/brouillon.ts'
import type { Brouillon, Stockage } from '#/lib/classeur/brouillon.ts'

function memoire(): Stockage & { donnees: Map<string, string> } {
  const donnees = new Map<string, string>()
  return {
    donnees,
    getItem: (k) => donnees.get(k) ?? null,
    setItem: (k, v) => void donnees.set(k, v),
    removeItem: (k) => void donnees.delete(k),
    key: (i) => [...donnees.keys()][i] ?? null,
    get length() {
      return donnees.size
    },
  }
}

const B: Brouillon = {
  titre: 'Check-in',
  description: 'Mise à jour : 01/2026',
  contenu: '# Texte',
  base: '2026-09-27T07:35:19.817052+00:00',
  enregistreLe: 1_000,
}

describe('brouillon de secours', () => {
  it('aller-retour, par compte ET par document', () => {
    const s = memoire()
    expect(ecrireBrouillon(s, 'u1', 17, B)).toBe(true)
    expect(lireBrouillon(s, 'u1', 17, 2_000)).toEqual(B)
    expect(lireBrouillon(s, 'u2', 17, 2_000)).toBeNull()
    expect(lireBrouillon(s, 'u1', 18, 2_000)).toBeNull()
    effacerBrouillon(s, 'u1', 17)
    expect(lireBrouillon(s, 'u1', 17, 2_000)).toBeNull()
  })
  it('périmé au-delà de 7 jours : ignoré et effacé', () => {
    const s = memoire()
    ecrireBrouillon(s, 'u1', 17, B)
    expect(
      lireBrouillon(s, 'u1', 17, B.enregistreLe + DUREE_BROUILLON_MS),
    ).toEqual(B)
    expect(
      lireBrouillon(s, 'u1', 17, B.enregistreLe + DUREE_BROUILLON_MS + 1),
    ).toBeNull()
    expect(s.donnees.size).toBe(0)
  })
  it('contenu corrompu ou de mauvaise forme : ignoré et effacé', () => {
    const s = memoire()
    s.setItem(cleBrouillon('u1', 17), '{pas du json')
    expect(lireBrouillon(s, 'u1', 17, 0)).toBeNull()
    s.setItem(cleBrouillon('u1', 17), JSON.stringify({ ...B, contenu: 3 }))
    expect(lireBrouillon(s, 'u1', 17, 0)).toBeNull()
    expect(s.donnees.size).toBe(0)
  })
  it('stockage absent ou qui lève : aucune erreur', () => {
    expect(lireBrouillon(null, 'u1', 17, 0)).toBeNull()
    expect(ecrireBrouillon(null, 'u1', 17, B)).toBe(false)
    const plein = memoire()
    plein.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(ecrireBrouillon(plein, 'u1', 17, B)).toBe(false)
    expect(() => effacerBrouillon(null, 'u1', 17)).not.toThrow()
  })
  it('purge : seuls les brouillons périmés partent, les autres clés restent', () => {
    const s = memoire()
    ecrireBrouillon(s, 'u1', 1, B)
    ecrireBrouillon(s, 'u1', 2, { ...B, enregistreLe: DUREE_BROUILLON_MS + 5 })
    s.setItem('autre.cle', 'x')
    purgerBrouillonsPerimes(s, 2 * DUREE_BROUILLON_MS)
    expect([...s.donnees.keys()].sort()).toEqual(
      ['autre.cle', cleBrouillon('u1', 2)].sort(),
    )
  })
  it('brouillonDiffere compare titre, description et contenu', () => {
    const doc = {
      title: B.titre,
      description: B.description,
      content: B.contenu,
    }
    expect(brouillonDiffere(B, doc)).toBe(false)
    expect(brouillonDiffere({ ...B, contenu: 'x' }, doc)).toBe(true)
    expect(brouillonDiffere({ ...B, titre: 'x' }, doc)).toBe(true)
    expect(brouillonDiffere({ ...B, description: 'x' }, doc)).toBe(true)
  })
})

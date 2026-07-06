import { describe, expect, it } from 'vitest'

import {
  amountText,
  amountValue,
  countValue,
  sanitizeAmount,
  sanitizeCount,
} from '#/lib/caisse/input.ts'

/*
 * Saisie caisse : nettoyage/parsing des montants (décimaux, séparateur FR) et
 * des comptages (entiers ≥ 0). Le point délicat : préserver les états
 * intermédiaires de frappe ("12,", "0,") sans les casser.
 */

describe('sanitizeAmount', () => {
  it('normalise le point en virgule', () => {
    expect(sanitizeAmount('12.5')).toBe('12,5')
  })
  it('préserve un séparateur en fin de frappe', () => {
    expect(sanitizeAmount('12,')).toBe('12,')
  })
  it('ne garde qu’un seul séparateur', () => {
    expect(sanitizeAmount('12,5,3')).toBe('12,53')
  })
  it('retire les caractères non numériques', () => {
    expect(sanitizeAmount('1a2€ 3')).toBe('123')
  })
})

describe('amountValue', () => {
  it('parse un montant FR', () => {
    expect(amountValue('93,60')).toBe(93.6)
  })
  it('vide ou séparateur seul = 0', () => {
    expect(amountValue('')).toBe(0)
    expect(amountValue(',')).toBe(0)
  })
})

describe('amountText', () => {
  it('0 → champ vide', () => {
    expect(amountText(0)).toBe('')
  })
  it('nombre → texte FR', () => {
    expect(amountText(157.6)).toBe('157,6')
  })
  // Boucle saisie → valeur → texte cohérente (pas de perte de la virgule)
  it('round-trip conserve la valeur', () => {
    expect(amountValue(sanitizeAmount('68,86'))).toBe(68.86)
  })
})

describe('countValue', () => {
  it('parse un entier', () => {
    expect(countValue('16')).toBe(16)
  })
  it('ignore les non-chiffres et le vide', () => {
    expect(countValue('1x2')).toBe(12)
    expect(countValue('')).toBe(0)
  })
  it('jamais négatif', () => {
    expect(countValue('-5')).toBe(5)
    expect(sanitizeCount('-5')).toBe('5')
  })
})

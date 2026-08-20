import { describe, expect, it } from 'vitest'

import { titleCaseName } from '#/lib/utils.ts'

describe('titleCaseName', () => {
  it('un mot tout en majuscule devient Titlecase', () => {
    expect(titleCaseName('MARTIN')).toBe('Martin')
  })

  it('prénom composé au tiret, chaque segment capitalisé', () => {
    expect(titleCaseName('JEAN-MICHEL')).toBe('Jean-Michel')
  })

  it('prénom composé à l’espace (au lieu du tiret), même résultat par segment', () => {
    expect(titleCaseName('jean michel')).toBe('Jean Michel')
  })

  it('déjà correctement casé : inchangé', () => {
    expect(titleCaseName('Jean-Michel')).toBe('Jean-Michel')
  })

  it('casse mélangée n’importe comment : normalisée', () => {
    expect(titleCaseName('mArTIN')).toBe('Martin')
  })

  it('un segment de 2 ou 3 lettres reste en majuscule (initiales)', () => {
    expect(titleCaseName('jp')).toBe('JP')
    expect(titleCaseName('ABC')).toBe('ABC')
  })

  it('mélange initiales + nom complet', () => {
    expect(titleCaseName('JP MARTIN')).toBe('JP Martin')
  })

  it('un second segment court (en cours de frappe) n’est PAS traité comme des initiales', () => {
    // Frappe progressive de « Jean-Michel » : les 1-3 premières lettres du
    // second prénom ne doivent jamais flasher en majuscule (Jean-MIC).
    expect(titleCaseName('Jean-M')).toBe('Jean-M')
    expect(titleCaseName('Jean-Mi')).toBe('Jean-Mi')
    expect(titleCaseName('Jean-Mic')).toBe('Jean-Mic')
    expect(titleCaseName('Jean-Miche')).toBe('Jean-Miche')
    // Même chose avec un espace au lieu du tiret.
    expect(titleCaseName('Jean Mic')).toBe('Jean Mic')
  })

  it('apostrophe traitée comme un séparateur', () => {
    expect(titleCaseName("d'ARTAGNAN")).toBe("D'Artagnan")
  })

  it('chaîne vide : inchangée', () => {
    expect(titleCaseName('')).toBe('')
  })
})

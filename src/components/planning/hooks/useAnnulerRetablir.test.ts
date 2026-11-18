// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  cibleDeSaisie,
  messageAnnulation,
  sensDuRaccourci,
} from '#/components/planning/hooks/useAnnulerRetablir.ts'

/*
 * Raccourcis de l'annulation du planning (2026-11-18). Oracle : la demande
 * (Ctrl+Z annule, Ctrl+Y rétablit) et l'usage courant (Cmd sur Mac,
 * Ctrl+Maj+Z rétablit ; un champ de saisie garde ses propres raccourcis).
 */

const touche = (key: string, m: Partial<KeyboardEventInit> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...m,
})

describe('raccourcis', () => {
  it('Ctrl+Z annule, Ctrl+Y et Ctrl+Maj+Z rétablissent, Cmd aussi', () => {
    expect(sensDuRaccourci(touche('z', { ctrlKey: true }))).toBe('annuler')
    expect(sensDuRaccourci(touche('y', { ctrlKey: true }))).toBe('retablir')
    expect(
      sensDuRaccourci(touche('Z', { ctrlKey: true, shiftKey: true })),
    ).toBe('retablir')
    expect(sensDuRaccourci(touche('z', { metaKey: true }))).toBe('annuler')
  })

  it('sans Ctrl, ou avec Alt (AltGr), rien', () => {
    expect(sensDuRaccourci(touche('z'))).toBeNull()
    expect(
      sensDuRaccourci(touche('z', { ctrlKey: true, altKey: true })),
    ).toBeNull()
    expect(sensDuRaccourci(touche('c', { ctrlKey: true }))).toBeNull()
  })

  it('un champ, une zone éditable ou une fenêtre gardent Ctrl+Z', () => {
    expect(cibleDeSaisie(document.createElement('input'))).toBe(true)
    expect(cibleDeSaisie(document.createElement('textarea'))).toBe(true)
    const dialogue = document.createElement('div')
    dialogue.setAttribute('role', 'dialog')
    const bouton = document.createElement('button')
    dialogue.append(bouton)
    expect(cibleDeSaisie(bouton)).toBe(true)
    expect(cibleDeSaisie(document.createElement('div'))).toBe(false)
  })

  it('message en clair, au singulier comme au pluriel', () => {
    expect(messageAnnulation('annuler', 1)).toBe(
      'Annulé : 1 case remise comme avant (Ctrl+Y pour rétablir).',
    )
    expect(messageAnnulation('retablir', 3)).toBe('Rétabli : 3 cases.')
  })
})

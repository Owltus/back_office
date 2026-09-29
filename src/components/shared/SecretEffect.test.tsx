// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

import { SecretEffect } from '#/components/shared/SecretEffect.tsx'
import {
  creerDetecteur,
  estChampSecret,
  estChampTexte,
  normaliser,
} from '#/lib/easter-eggs/detecteur.ts'

/*
 * Easter eggs « partout » (2026-09-29) : hors champ, dans tous les champs de
 * saisie, au clavier virtuel — mais JAMAIS dans un mot de passe.
 */

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function taperTouches(cible: EventTarget, mot: string) {
  for (const key of mot)
    cible.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

/** Ce que fait un navigateur dans un champ : keydown PUIS beforeinput. */
function taperDansChamp(champ: HTMLElement, mot: string, virtuel = false) {
  for (const lettre of mot) {
    champ.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: virtuel ? 'Unidentified' : lettre,
        bubbles: true,
      }),
    )
    champ.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: lettre,
        bubbles: true,
      }),
    )
  }
}

function monter(motCle = 'lina') {
  const load = vi.fn(() => new Promise<never>(() => {}))
  render(<SecretEffect keyword={motCle} load={load} />)
  return load
}

describe('détecteur', () => {
  it('ignore casse, accents et caractères non lettres', () => {
    expect(normaliser('Chloé')).toBe('chloe')
    const d = creerDetecteur('pierre-louis')
    expect([...'pierrelou'].some((c) => d.ajouter(c))).toBe(false)
    expect(d.ajouter('i')).toBe(false)
    expect(d.ajouter('S')).toBe(true)
  })

  it('reconnaît un mot composé au clavier virtuel (texte en cours de frappe)', () => {
    const d = creerDetecteur('lina')
    expect(['l', 'li', 'lin'].some((t) => d.ajouter(t))).toBe(false)
    expect(d.ajouter('lina')).toBe(true)
  })

  it('classe les champs', () => {
    const mdp = document.createElement('input')
    mdp.type = 'password'
    const revele = document.createElement('input')
    revele.type = 'text'
    revele.setAttribute('autocomplete', 'new-password')
    const recherche = document.createElement('input')
    recherche.type = 'search'
    expect(estChampSecret(mdp)).toBe(true)
    expect(estChampSecret(revele)).toBe(true)
    expect(estChampSecret(recherche)).toBe(false)
    expect(estChampTexte(recherche)).toBe(true)
    expect(estChampTexte(document.createElement('textarea'))).toBe(true)
    expect(estChampTexte(document.body)).toBe(false)
  })
})

describe('SecretEffect', () => {
  it('se déclenche hors de tout champ', () => {
    const load = monter()
    act(() => taperTouches(document.body, 'lina'))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('se déclenche dans une zone de texte, une seule fois par frappe', () => {
    const load = monter()
    const zone = document.body.appendChild(document.createElement('textarea'))
    act(() => taperDansChamp(zone, 'lina'))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('se déclenche au clavier virtuel d’un téléphone (touche « Unidentified »)', () => {
    const load = monter()
    const champ = document.body.appendChild(document.createElement('input'))
    act(() => taperDansChamp(champ, 'lina', true))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('n’est pas masqué par un composant qui arrête la propagation', () => {
    const load = monter()
    const editeur = document.body.appendChild(
      document.createElement('textarea'),
    )
    editeur.addEventListener('beforeinput', (e) => e.stopPropagation())
    editeur.addEventListener('keydown', (e) => e.stopPropagation())
    act(() => taperDansChamp(editeur, 'lina'))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('ne lit JAMAIS un mot de passe, même affiché en clair', () => {
    const load = monter()
    const mdp = document.body.appendChild(document.createElement('input'))
    mdp.type = 'password'
    act(() => taperDansChamp(mdp, 'lina'))
    const revele = document.body.appendChild(document.createElement('input'))
    revele.setAttribute('autocomplete', 'current-password')
    act(() => taperDansChamp(revele, 'lina'))
    expect(load).not.toHaveBeenCalled()
  })

  it('ne lit pas un mot de passe affiché, même sans keydown (clavier virtuel)', () => {
    const load = monter()
    const revele = document.body.appendChild(document.createElement('input'))
    revele.setAttribute('autocomplete', 'new-password')
    act(() => {
      for (const data of 'lina')
        revele.dispatchEvent(
          new InputEvent('beforeinput', {
            inputType: 'insertText',
            data,
            bubbles: true,
          }),
        )
    })
    expect(load).not.toHaveBeenCalled()
  })

  it('une frappe dans un mot de passe vide la mémoire', () => {
    const load = monter()
    const mdp = document.body.appendChild(document.createElement('input'))
    mdp.type = 'password'
    act(() => {
      taperTouches(document.body, 'li')
      taperDansChamp(mdp, 'x')
      taperTouches(document.body, 'na')
    })
    expect(load).not.toHaveBeenCalled()
  })
})

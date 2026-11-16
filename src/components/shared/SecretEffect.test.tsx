// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

import { SecretEffect } from '#/components/shared/SecretEffect.tsx'
import {
  DELAI_FIN_DE_MOT_MS,
  creerDetecteur,
  problemeMotCle,
  estChampSecret,
  estChampTexte,
  normaliser,
} from '#/lib/easter-eggs/detecteur.ts'

/*
 * Easter eggs « partout » (2026-09-29) : hors champ, dans tous les champs de
 * saisie, au clavier virtuel — mais JAMAIS dans un mot de passe.
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
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

function monter(...motsCles: string[]) {
  const mots = motsCles.length > 0 ? motsCles : ['lina']
  const loads = mots.map(() => vi.fn(() => new Promise<never>(() => {})))
  render(
    <SecretEffect
      motsCles={mots.map((keyword, i) => ({ keyword, load: loads[i] }))}
    />,
  )
  const load = loads[0]
  return Object.assign(load, { tous: loads })
}

/** Laisse passer la pause qui vaut fin de mot. */
function pause() {
  act(() => {
    vi.advanceTimersByTime(DELAI_FIN_DE_MOT_MS + 10)
  })
}

/** Tape un mot dans le détecteur pur, lettre par lettre ; rend ce qui part. */
function lettres(d: ReturnType<typeof creerDetecteur>, texte: string) {
  const partis: string[] = []
  for (const c of texte) {
    const r = d.ajouter(c)
    if (r) partis.push(r)
  }
  return partis
}

describe('détecteur', () => {
  it('ignore casse, accents ; le tiret fait partie du mot', () => {
    expect(normaliser('Chloé')).toBe('chloe')
    const d = creerDetecteur(['pierre-louis'])
    expect(lettres(d, 'Pierre-Loui')).toEqual([])
    expect(d.enAttente()).toBe(false)
    lettres(d, 'S')
    expect(d.enAttente()).toBe(true)
    expect(d.finirMot()).toBe('pierrelouis')
  })

  it('un mot-clé ne part qu’en mot entier', () => {
    const d = creerDetecteur(['lea'])
    // « nucléaire », « elle a », « lucien » : jamais.
    expect(lettres(d, 'nucléaire ')).toEqual([])
    expect(lettres(d, 'elle a ')).toEqual([])
    expect(lettres(d, 'leanne ')).toEqual([])
    expect(lettres(d, 'lea2 ')).toEqual([])
    expect(lettres(d, 'Léa ')).toEqual(['lea'])
    expect(lettres(d, "d'Léa, ")).toEqual(['lea'])
  })

  it('la fin d’un mot-clé ne forme pas un autre mot-clé (signalement du 2026-11-16)', () => {
    const d = creerDetecteur(['axelle', 'lea'])
    lettres(d, 'axelle')
    expect(d.finirMot()).toBe('axelle')
    lettres(d, 'a')
    expect(d.enAttente()).toBe(false)
    expect(d.finirMot()).toBeNull()
  })

  it('un mot-clé préfixe d’un autre : chacun a sa chance', () => {
    const d = creerDetecteur(['lea', 'leanne'])
    lettres(d, 'lea')
    expect(d.enAttente()).toBe(true)
    lettres(d, 'nne')
    expect(d.finirMot()).toBe('leanne')
    lettres(d, 'lea')
    expect(d.finirMot()).toBe('lea')
  })

  it('ignore un mot-clé de moins de 3 lettres', () => {
    const d = creerDetecteur(['a', 'le'])
    expect(d.actif).toBe(false)
    expect(lettres(d, 'a le ')).toEqual([])
  })

  it('un mot collé à des lettres déjà là ne compte pas', () => {
    const d = creerDetecteur(['lea'])
    d.marquerColle()
    lettres(d, 'lea')
    expect(d.finirMot()).toBeNull()
  })

  it('reconnaît un mot composé au clavier virtuel (texte en cours de frappe)', () => {
    const d = creerDetecteur(['lina'])
    for (const t of ['l', 'li', 'lin', 'lina']) d.composer(t)
    expect(d.enAttente()).toBe(true)
    expect(d.ajouter(' ')).toBe('lina')
  })

  it('refuse un mot-clé inutilisable', () => {
    expect(problemeMotCle('pierre-louis', [])).toBeNull()
    expect(problemeMotCle('pierre louis', [])).toMatch(/Un seul mot/)
    expect(problemeMotCle('lé', [])).toMatch(/Au moins 3/)
    expect(problemeMotCle('Chloe', ['chloé'])).toMatch(/existe déjà/)
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
    pause()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('se déclenche dans une zone de texte, une seule fois par frappe', () => {
    const load = monter()
    const zone = document.body.appendChild(document.createElement('textarea'))
    act(() => taperDansChamp(zone, 'lina'))
    pause()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('se déclenche au clavier virtuel d’un téléphone (touche « Unidentified »)', () => {
    const load = monter()
    const champ = document.body.appendChild(document.createElement('input'))
    act(() => taperDansChamp(champ, 'lina', true))
    pause()
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
    pause()
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
    pause()
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
    pause()
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
    pause()
    expect(load).not.toHaveBeenCalled()
  })

  it('« axelle » puis « a » ne déclenche pas « lea » (signalement du 2026-11-16)', () => {
    const load = monter('axelle', 'lea')
    act(() => taperTouches(document.body, 'axelle'))
    pause()
    act(() => taperTouches(document.body, 'a'))
    pause()
    expect(load.tous[0]).toHaveBeenCalledTimes(1)
    expect(load.tous[1]).not.toHaveBeenCalled()
  })

  it('part tout de suite sur un espace, sans attendre la pause', () => {
    const load = monter()
    act(() => taperTouches(document.body, 'lina '))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('ne part pas au milieu d’une phrase qui contient le mot-clé', () => {
    const load = monter('lea')
    const zone = document.body.appendChild(document.createElement('textarea'))
    act(() => taperDansChamp(zone, 'elle a vu le nucléaire'))
    pause()
    expect(load).not.toHaveBeenCalled()
  })

  it('ne part pas en tapant au milieu d’un mot déjà écrit', () => {
    const load = monter('lea')
    const zone = document.body.appendChild(document.createElement('textarea'))
    zone.value = 'nuc'
    zone.setSelectionRange(3, 3)
    act(() => taperDansChamp(zone, 'lea'))
    pause()
    expect(load).not.toHaveBeenCalled()
  })

  it('un effacement oublie le mot', () => {
    const load = monter()
    act(() => {
      taperTouches(document.body, 'lin')
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }),
      )
      taperTouches(document.body, 'a')
    })
    pause()
    expect(load).not.toHaveBeenCalled()
  })
})

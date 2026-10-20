// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState } from 'react'

import {
  LIBELLE_CHOISIR,
  LIBELLE_COLLER,
  LIBELLE_DEPOSER,
  SaisieImport,
} from '#/components/classeur/dialogs/SaisieImport.tsx'
import type { SourceImport } from '#/lib/classeur/sourceImport.ts'

/*
 * Saisie partagée des deux imports. Depuis le 2026-10-20 (demande
 * utilisateur) : DEUX zones, Coller (champ visible + bouton) et Déposer
 * (glisser-déposer, clic pour choisir) ; puis la ligne repliée et Changer.
 */

const MOTS_INTERDITS = [
  'JSON',
  'fusion',
  'remplacement',
  'uuid',
  'Registre',
  '—',
  '«',
  '»',
]

afterEach(cleanup)

let recu: Array<SourceImport | null> = []
beforeEach(() => {
  recu = []
})

/** La saisie, avec l'état tenu comme dans un dialogue. */
function Banc({ disabled = false }: { disabled?: boolean }) {
  const [source, setSource] = useState<SourceImport | null>(null)
  return (
    <SaisieImport
      source={source}
      onSource={(s) => {
        recu.push(s)
        setSource(s)
      }}
      disabled={disabled}
    />
  )
}

function collerSur(el: Element, texte: string, files: File[] = []) {
  fireEvent.paste(el, { clipboardData: { getData: () => texte, files } })
}

function texteSource(s: SourceImport | null | undefined): string | null {
  return s?.type === 'texte' ? s.texte : null
}

const champ = () =>
  screen.getByRole<HTMLTextAreaElement>('textbox', { name: LIBELLE_COLLER })
const zoneDepot = () =>
  screen.getByRole<HTMLButtonElement>('button', {
    name: `${LIBELLE_DEPOSER}, ${LIBELLE_CHOISIR}`,
  })

describe('SaisieImport — deux zones', () => {
  it('Coller (champ visible, libellé, bouton) et Déposer (zone, consigne)', () => {
    render(<Banc />)
    expect(champ().getAttribute('placeholder')).toBe('Ctrl + V ici')
    expect(screen.getByText(LIBELLE_COLLER).tagName).toBe('LABEL')
    expect(screen.getByRole('button', { name: 'Coller' })).toBeTruthy()
    expect(zoneDepot().textContent).toContain(LIBELLE_DEPOSER)
    expect(zoneDepot().textContent).toContain(LIBELLE_CHOISIR)
    const texte = document.body.textContent
    for (const mot of MOTS_INTERDITS) expect(texte, mot).not.toContain(mot)
    expect(texte).not.toMatch(/\bIA\b/)
  })

  it('les deux zones ont la même hauteur minimale, côte à côte dès sm', () => {
    render(<Banc />)
    const coller = document.querySelector('[data-zone="coller"]')
    const deposer = document.querySelector('[data-zone="deposer"]')
    expect(coller?.className).toContain('min-h-56')
    expect(deposer?.className).toContain('min-h-56')
    expect(coller?.parentElement?.className).toContain('sm:grid-cols-2')
    expect(coller?.parentElement).toBe(deposer?.parentElement)
  })
})

describe('SaisieImport — zone Coller', () => {
  it('un collage dans le champ devient la source tout de suite, la saisie se replie', () => {
    render(<Banc />)
    champ().focus()
    collerSur(champ(), '{"a": 1}')
    expect(recu).toHaveLength(1)
    expect(texteSource(recu[0])).toBe('{"a": 1}')
    expect(screen.getByText('Réponse collée')).toBeTruthy()
    expect(screen.getByText('8 octets')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(LIBELLE_DEPOSER)).toBeNull()
  })

  it('une frappe devient la source une fois finie (délai)', () => {
    vi.useFakeTimers()
    try {
      render(<Banc />)
      fireEvent.change(champ(), { target: { value: 'tapé' } })
      act(() => vi.advanceTimersByTime(300))
      expect(recu).toHaveLength(0)
      act(() => vi.advanceTimersByTime(400))
      expect(texteSource(recu[0])).toBe('tapé')
    } finally {
      vi.useRealTimers()
    }
  })

  it('Ctrl + V hors de tout champ : pris aussi', () => {
    render(<Banc />)
    collerSur(document.body, 'réponse')
    expect(texteSource(recu[0])).toBe('réponse')
  })

  it('Ctrl + V dans un AUTRE champ : ignoré (il garde son collage)', () => {
    render(
      <>
        <input aria-label="Recherche" />
        <Banc />
      </>,
    )
    const autre = screen.getByLabelText('Recherche')
    autre.focus()
    collerSur(autre, 'texte')
    expect(recu).toHaveLength(0)
    expect(champ()).toBeTruthy()
  })

  it('un collage vide ne donne rien', () => {
    render(<Banc />)
    collerSur(champ(), '   ')
    collerSur(document.body, '   ')
    expect(recu).toHaveLength(0)
  })

  it('un fichier copié puis collé est pris comme fichier', () => {
    render(<Banc />)
    const f = new File(['{}'], 'reponse.json')
    collerSur(champ(), '', [f])
    expect(recu[0]).toEqual({ type: 'fichier', file: f })
    expect(screen.getByText('reponse.json')).toBeTruthy()
  })

  it('désactivée : champ et boutons inertes, collage ignoré', () => {
    render(<Banc disabled />)
    expect(champ().disabled).toBe(true)
    expect(zoneDepot().disabled).toBe(true)
    collerSur(document.body, 'texte')
    expect(recu).toHaveLength(0)
  })
})

describe('SaisieImport — bouton Coller', () => {
  const lire = vi.fn<() => Promise<string>>()
  beforeEach(() => {
    lire.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: lire },
      configurable: true,
    })
  })

  it('lit le presse-papiers', async () => {
    lire.mockResolvedValue('réponse du LLM')
    render(<Banc />)
    fireEvent.click(screen.getByRole('button', { name: 'Coller' }))
    await screen.findByText('Réponse collée')
    expect(texteSource(recu[0])).toBe('réponse du LLM')
  })

  it('refusé : le champ prend le focus, sans message', async () => {
    lire.mockRejectedValue(new Error('NotAllowedError'))
    render(<Banc />)
    const avant = document.body.textContent
    fireEvent.click(screen.getByRole('button', { name: 'Coller' }))
    await waitFor(() => expect(document.activeElement).toBe(champ()))
    expect(recu).toHaveLength(0)
    expect(document.body.textContent).toBe(avant)
    collerSur(champ(), 'collé à la main')
    expect(texteSource(recu[0])).toBe('collé à la main')
  })

  it('presse-papiers vide : le champ prend le focus aussi', async () => {
    lire.mockResolvedValue('')
    render(<Banc />)
    fireEvent.click(screen.getByRole('button', { name: 'Coller' }))
    await waitFor(() => expect(document.activeElement).toBe(champ()))
    expect(recu).toHaveLength(0)
  })
})

describe('SaisieImport — zone Déposer', () => {
  it('déposé : survol visible, puis la source', () => {
    render(<Banc />)
    const zone = zoneDepot()
    const f = new File(['x'.repeat(12 * 1024)], 'chapitre.json')
    fireEvent.dragEnter(zone, { dataTransfer: { files: [f] } })
    expect(zone.getAttribute('data-survol')).toBe('true')
    expect(screen.getByText('Relâchez pour importer')).toBeTruthy()
    fireEvent.drop(zone, {
      dataTransfer: { files: [f], getData: () => '' },
    })
    expect(recu[0]).toEqual({ type: 'fichier', file: f })
    expect(screen.getByText('chapitre.json')).toBeTruthy()
    expect(screen.getByText('12 ko')).toBeTruthy()
  })

  it('déposé sur la zone Coller : accepté aussi', () => {
    render(<Banc />)
    const f = new File(['{}'], 'reponse.json')
    fireEvent.drop(champ(), {
      dataTransfer: { files: [f], getData: () => '' },
    })
    expect(recu[0]).toEqual({ type: 'fichier', file: f })
  })

  it('le survol s’efface en quittant la zone', () => {
    render(<Banc />)
    const zone = zoneDepot()
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } })
    fireEvent.dragLeave(zone.parentElement as HTMLElement, {
      relatedTarget: document.body,
    })
    expect(zone.getAttribute('data-survol')).toBeNull()
    expect(screen.getByText(LIBELLE_CHOISIR)).toBeTruthy()
  })

  it('clic sur la zone : ouvre le choix d’un fichier ; choisi = la source', () => {
    render(<Banc />)
    const input = screen.getByLabelText<HTMLInputElement>('Choisir un fichier')
    const ouvrir = vi.spyOn(input, 'click')
    fireEvent.click(zoneDepot())
    expect(ouvrir).toHaveBeenCalledTimes(1)
    const f = new File(['{}'], 'reponse.txt')
    fireEvent.change(input, { target: { files: [f] } })
    expect(recu[0]).toEqual({ type: 'fichier', file: f })
  })

  it('la zone est un vrai bouton (Entrée et Espace au clavier)', () => {
    render(<Banc />)
    expect(zoneDepot().tagName).toBe('BUTTON')
    expect(zoneDepot().getAttribute('type')).toBe('button')
  })
})

describe('SaisieImport — ligne repliée', () => {
  it('Changer rend les deux zones', () => {
    render(<Banc />)
    collerSur(champ(), 'texte')
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }))
    expect(recu).toEqual([{ type: 'texte', texte: 'texte' }, null])
    expect(champ().value).toBe('')
    expect(zoneDepot()).toBeTruthy()
    // La saisie écoute de nouveau.
    collerSur(document.body, 'autre')
    expect(texteSource(recu[2])).toBe('autre')
  })

  it('repliée, un Ctrl + V n’écrase pas la source', () => {
    render(<Banc />)
    collerSur(document.body, 'premier')
    collerSur(document.body, 'second')
    expect(recu).toHaveLength(1)
  })
})

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
  LIBELLE_ZONE,
  SaisieImport,
} from '#/components/classeur/dialogs/SaisieImport.tsx'
import type { SourceImport } from '#/lib/classeur/sourceImport.ts'

/*
 * Saisie partagée des deux imports (refonte du 2026-10-20) : coller
 * (Ctrl + V hors champ, bouton Coller, champ de secours si le navigateur
 * refuse), déposer, choisir un fichier ; puis la ligne repliée et Changer.
 */

const MOTS_INTERDITS = [
  'JSON',
  'LLM',
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

describe('SaisieImport — la grande zone', () => {
  it('une icône, une phrase, Coller et Choisir un fichier ; rien d’autre', () => {
    render(<Banc />)
    expect(screen.getByText(LIBELLE_ZONE)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Coller' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Choisir un fichier' }),
    ).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    const texte = document.body.textContent
    for (const mot of MOTS_INTERDITS) expect(texte, mot).not.toContain(mot)
  })

  it('Ctrl + V hors de tout champ : la réponse devient la source, la zone se replie', () => {
    render(<Banc />)
    collerSur(document.body, '{"a": 1}')
    expect(recu).toHaveLength(1)
    expect(texteSource(recu[0])).toBe('{"a": 1}')
    expect(screen.getByText('Réponse collée')).toBeTruthy()
    expect(screen.getByText('8 octets')).toBeTruthy()
    expect(screen.queryByText(LIBELLE_ZONE)).toBeNull()
  })

  it('Ctrl + V dans un autre champ : ignoré (il garde son collage)', () => {
    render(
      <>
        <input aria-label="Recherche" />
        <Banc />
      </>,
    )
    const champ = screen.getByLabelText('Recherche')
    champ.focus()
    collerSur(champ, 'texte')
    expect(recu).toHaveLength(0)
    expect(screen.getByText(LIBELLE_ZONE)).toBeTruthy()
  })

  it('un collage vide ne donne rien', () => {
    render(<Banc />)
    collerSur(document.body, '   ')
    expect(recu).toHaveLength(0)
  })

  it('désactivée : le collage est ignoré', () => {
    render(<Banc disabled />)
    collerSur(document.body, 'texte')
    expect(recu).toHaveLength(0)
  })

  it('un fichier copié puis collé est pris comme fichier', () => {
    render(<Banc />)
    const f = new File(['{}'], 'reponse.json')
    collerSur(document.body, '', [f])
    expect(recu[0]).toEqual({ type: 'fichier', file: f })
    expect(screen.getByText('reponse.json')).toBeTruthy()
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
    lire.mockResolvedValue('réponse de l’IA')
    render(<Banc />)
    fireEvent.click(screen.getByRole('button', { name: 'Coller' }))
    await screen.findByText('Réponse collée')
    expect(texteSource(recu[0])).toBe('réponse de l’IA')
  })

  it('refusé : un champ sélectionné apparaît, sans message, et reçoit le collage', async () => {
    lire.mockRejectedValue(new Error('NotAllowedError'))
    render(<Banc />)
    const avant = document.body.textContent
    fireEvent.click(screen.getByRole('button', { name: 'Coller' }))
    const champ = await screen.findByRole('textbox', {
      name: "Réponse de l'IA",
    })
    await waitFor(() => expect(document.activeElement).toBe(champ))
    expect(recu).toHaveLength(0)
    // Aucun message d'erreur : seul le champ s'ajoute.
    expect(document.body.textContent).toBe(
      avant.replace('CollerChoisir un fichier', ''),
    )
    collerSur(champ, 'collé à la main')
    expect(texteSource(recu[0])).toBe('collé à la main')
    expect(screen.getByText('Réponse collée')).toBeTruthy()
  })

  it('presse-papiers vide : le champ aussi', async () => {
    lire.mockResolvedValue('')
    render(<Banc />)
    fireEvent.click(screen.getByRole('button', { name: 'Coller' }))
    await screen.findByRole('textbox', { name: "Réponse de l'IA" })
    expect(recu).toHaveLength(0)
  })

  it('champ de secours : une frappe devient la source une fois finie', async () => {
    vi.useFakeTimers()
    try {
      lire.mockRejectedValue(new Error('refus'))
      render(<Banc />)
      fireEvent.click(screen.getByRole('button', { name: 'Coller' }))
      await act(async () => {
        await Promise.resolve()
      })
      const champ = screen.getByRole('textbox', { name: "Réponse de l'IA" })
      fireEvent.change(champ, { target: { value: 'tapé' } })
      act(() => vi.advanceTimersByTime(300))
      expect(recu).toHaveLength(0)
      act(() => vi.advanceTimersByTime(400))
      expect(texteSource(recu[0])).toBe('tapé')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SaisieImport — fichier', () => {
  it('déposé : survol visible, puis la source', () => {
    render(<Banc />)
    const zone = screen.getByText(LIBELLE_ZONE).parentElement as HTMLElement
    const f = new File(['x'.repeat(12 * 1024)], 'chapitre.json')
    fireEvent.dragEnter(zone, { dataTransfer: { files: [f] } })
    expect(screen.getByText('Déposez le fichier ici')).toBeTruthy()
    expect(zone.getAttribute('data-survol')).toBe('true')
    fireEvent.drop(zone, {
      dataTransfer: { files: [f], getData: () => '' },
    })
    expect(recu[0]).toEqual({ type: 'fichier', file: f })
    expect(screen.getByText('chapitre.json')).toBeTruthy()
    expect(screen.getByText('12 ko')).toBeTruthy()
  })

  it('le survol s’efface en quittant la zone', () => {
    render(<Banc />)
    const zone = screen.getByText(LIBELLE_ZONE).parentElement as HTMLElement
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } })
    fireEvent.dragLeave(zone, { relatedTarget: document.body })
    expect(screen.getByText(LIBELLE_ZONE)).toBeTruthy()
    expect(zone.getAttribute('data-survol')).toBeNull()
  })

  it('choisi : la source', () => {
    render(<Banc />)
    const f = new File(['{}'], 'reponse.txt')
    fireEvent.change(screen.getByLabelText('Choisir un fichier'), {
      target: { files: [f] },
    })
    expect(recu[0]).toEqual({ type: 'fichier', file: f })
  })
})

describe('SaisieImport — ligne repliée', () => {
  it('Changer rend la grande zone', () => {
    render(<Banc />)
    collerSur(document.body, 'texte')
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }))
    expect(recu).toEqual([{ type: 'texte', texte: 'texte' }, null])
    expect(screen.getByText(LIBELLE_ZONE)).toBeTruthy()
    // La zone écoute de nouveau.
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

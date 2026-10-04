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

import { DocumentPages } from '#/components/classeur/print/DocumentPages.tsx'
import { PrintPreview } from '#/components/classeur/print/PrintPreview.tsx'
import { printViaIframe } from '#/lib/classeur/print/printIframe.ts'

/*
 * Relecture adverse du 2026-10-04 : cliquer « Imprimer » pendant qu'un
 * document attend encore un schéma Mermaid (ou ses images) imprimait
 * l'aperçu SANS ce document, sans aucun message. Le document B ci-dessous
 * n'a pas fini sa pagination (Mermaid en attente) : aucune impression ne
 * doit partir sans lui.
 */

let resoudreMermaid: (() => void) | null = null

vi.mock('#/lib/classeur/mermaid.ts', () => ({
  renderMermaid: () =>
    new Promise((resolve) => {
      resoudreMermaid = () =>
        resolve({ svg: '<svg></svg>', affichage: 'page', taille: null })
    }),
}))

const { pdfMock } = vi.hoisted(() => ({ pdfMock: vi.fn() }))
vi.mock('#/lib/classeur/print/pdfDirect.ts', () => ({
  telechargerPdf: pdfMock,
}))

/** HTML de chaque impression lancée (lu dans l'iframe au moment de print()). */
let imprimes: string[] = []

beforeEach(() => {
  imprimes = []
  resoudreMermaid = null
  const original = document.body.appendChild.bind(document.body)
  vi.spyOn(document.body, 'appendChild').mockImplementation(
    <T extends Node>(n: T): T => {
      const r = original(n)
      if (n instanceof HTMLIFrameElement && n.contentWindow) {
        const win = n.contentWindow
        Object.defineProperty(win.document, 'fonts', {
          value: { ready: Promise.resolve() },
          configurable: true,
        })
        win.print = () => {
          imprimes.push(win.document.body.innerHTML)
        }
        win.requestAnimationFrame = (cb) => {
          cb(0)
          return 0
        }
      }
      return r
    },
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function Apercu() {
  return (
    <PrintPreview open onOpenChange={() => {}} nomFichier="Essai">
      <div className="a4-page">Document A</div>
      <DocumentPages
        title="Document B"
        content={'Avant\n\n```mermaid\ngraph TD\nA-->B\n```\n'}
      />
    </PrintPreview>
  )
}

const bouton = () =>
  screen.getByRole('button', { name: /Imprimer ou enregistrer en PDF/ })

describe('PrintPreview — jamais d’impression avant la fin de la pagination', () => {
  it('pendant la mesure : bouton « Préparation… » désactivé, aucun print()', async () => {
    render(<Apercu />)
    await waitFor(() => expect(resoudreMermaid).not.toBeNull())
    expect(bouton().textContent).toContain('Préparation…')
    expect(bouton()).toHaveProperty('disabled', true)
    fireEvent.click(bouton())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    // Aucune impression partie sans le document B.
    for (const html of imprimes) expect(html).toContain('Document B')
    expect(imprimes).toEqual([])

    await act(async () => {
      resoudreMermaid?.()
    })
    await waitFor(() => expect(bouton()).toHaveProperty('disabled', false))
    expect(bouton().textContent).toContain('Imprimer / PDF')
    fireEvent.click(bouton())
    await waitFor(() => expect(imprimes.length).toBe(1))
    expect(imprimes[0]).toContain('Document A')
    expect(imprimes[0]).toContain('Document B')
  })

  it('printViaIframe appelé pendant la mesure ATTEND la fin, puis imprime tout', async () => {
    render(<Apercu />)
    await waitFor(() => expect(resoudreMermaid).not.toBeNull())
    const conteneur = document.querySelector<HTMLElement>(
      '.classeur-print-preview-scroll',
    )
    expect(conteneur).not.toBeNull()
    let fini = false
    const impression = printViaIframe(conteneur as HTMLElement).then(() => {
      fini = true
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    // Une impression partie trop tôt n'aurait que le document A.
    for (const html of imprimes) expect(html).toContain('Document B')
    expect(fini).toBe(false)
    expect(imprimes).toEqual([])

    await act(async () => {
      resoudreMermaid?.()
    })
    await act(async () => {
      await impression
    })
    expect(imprimes.length).toBe(1)
    expect(imprimes[0]).toContain('Document A')
    expect(imprimes[0]).toContain('Document B')
  })
})

describe('PrintPreview — « Télécharger le PDF »', () => {
  const pdfBouton = () =>
    screen.getByRole('button', { name: /Télécharger le PDF/ })

  it('désactivé pendant la mesure, puis progression et nom transmis', async () => {
    let finir: (() => void) | null = null
    pdfMock.mockImplementation(
      (
        _c: HTMLElement,
        o: {
          nomFichier?: string
          onProgression?: (f: number, t: number) => void
        },
      ) => {
        o.onProgression?.(0, 12)
        o.onProgression?.(2, 12)
        return new Promise<void>((r) => {
          finir = r
        })
      },
    )
    render(<Apercu />)
    await waitFor(() => expect(resoudreMermaid).not.toBeNull())
    expect(pdfBouton()).toHaveProperty('disabled', true)
    expect(pdfBouton().textContent).toContain('Préparation…')
    await act(async () => {
      resoudreMermaid?.()
    })
    await waitFor(() => expect(pdfBouton()).toHaveProperty('disabled', false))
    expect(pdfBouton().textContent).toContain('Télécharger le PDF')
    fireEvent.click(pdfBouton())
    await waitFor(() =>
      expect(pdfBouton().textContent).toContain('Création du PDF… (3 / 12)'),
    )
    expect(pdfBouton()).toHaveProperty('disabled', true)
    expect(bouton()).toHaveProperty('disabled', true)
    expect(pdfMock.mock.calls[0][1].nomFichier).toBe('Essai')
    await act(async () => {
      finir?.()
    })
    await waitFor(() =>
      expect(pdfBouton().textContent).toContain('Télécharger le PDF'),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('erreur affichée en clair', async () => {
    pdfMock.mockRejectedValue(new Error('boom interne'))
    render(<Apercu />)
    await waitFor(() => expect(resoudreMermaid).not.toBeNull())
    await act(async () => {
      resoudreMermaid?.()
    })
    await waitFor(() => expect(pdfBouton()).toHaveProperty('disabled', false))
    fireEvent.click(pdfBouton())
    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toContain('Création du PDF impossible')
    expect(alerte.textContent).not.toContain('boom')
  })
})

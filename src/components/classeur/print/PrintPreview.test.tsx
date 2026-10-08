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

const bouton = () => screen.getByRole('button', { name: /^Imprimer$/ })

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
    expect(bouton().textContent).toBe('Imprimer')
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

describe('PrintPreview — une seule sortie, Imprimer (PDF en images retiré le 2026-10-08)', () => {
  function PagesSimples({ n }: { n: number }) {
    return (
      <PrintPreview open onOpenChange={() => {}} nomFichier="Essai">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="a4-page">
            Page {i + 1}
          </div>
        ))}
      </PrintPreview>
    )
  }

  it('aucun bouton « Télécharger le PDF » ; Imprimer est le bouton principal', () => {
    render(<PagesSimples n={2} />)
    expect(screen.queryByRole('button', { name: /Télécharger/ })).toBeNull()
    expect(screen.queryByText(/Télécharger le PDF/)).toBeNull()
    expect(bouton().getAttribute('data-variant')).toBe('default')
    expect(bouton()).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: "Fermer l'aperçu" })).toBeTruthy()
  })

  it('aide courte : Enregistrer au format PDF, ni « » ni tiret cadratin', () => {
    render(<PagesSimples n={2} />)
    const aide = document.querySelector('[data-aide-pdf]') as HTMLElement
    expect(aide.textContent).toBe(
      'Pour un fichier PDF, choisissez Enregistrer au format PDF comme imprimante.',
    )
    expect(aide.className).not.toContain('truncate')
    expect(aide.textContent).not.toMatch(/[«»—]/)
  })

  it('beaucoup de pages : aucun avertissement, Imprimer disponible', () => {
    render(<PagesSimples n={41} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(bouton()).toHaveProperty('disabled', false)
  })
})

describe('PrintPreview — écran étroit : pages ajustées, sans toucher aux pages', () => {
  it('371 px de large : enveloppe zoomée à la largeur, page à l’échelle 1', async () => {
    const original = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientWidth',
    )
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('classeur-print-preview-scroll')
          ? 371
          : 0
      },
    })
    try {
      render(
        <PrintPreview open onOpenChange={() => {}}>
          <div className="a4-page">A</div>
        </PrintPreview>,
      )
      const env = document.querySelector<HTMLElement>('[data-zoom-pages]')
      await waitFor(() => expect(env?.style.zoom).not.toBe(''))
      const zoom = Number(env?.style.zoom)
      expect(zoom).toBeGreaterThan(0.45)
      expect(zoom).toBeLessThan(0.48)
      const page = document.querySelector<HTMLElement>('.a4-page')
      expect(page?.style.zoom).toBe('')
      expect(
        screen.getByRole('button', { name: /Zoom de l'aperçu/ }).textContent,
      ).toContain('Ajusté')
    } finally {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', original)
      }
    }
  })
})

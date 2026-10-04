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
  pdfMock.mockReset()
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
      expect(pdfBouton().textContent).toContain('Création du PDF… 3 / 12'),
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

describe('PrintPreview — hiérarchie, état propre à chaque bouton, annulation (audit du 2026-10-04)', () => {
  const pdfBouton = () =>
    screen.getByRole('button', { name: /Télécharger le PDF/ })

  function PagesSimples({
    n,
    onOpenChange = () => {},
  }: {
    n: number
    onOpenChange?: (o: boolean) => void
  }) {
    return (
      <PrintPreview open onOpenChange={onOpenChange} nomFichier="Essai">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="a4-page">
            Page {i + 1}
          </div>
        ))}
      </PrintPreview>
    )
  }

  /** Création suspendue : garde le signal reçu. */
  function creationSuspendue() {
    const etat: { signal: AbortSignal | null } = { signal: null }
    pdfMock.mockImplementation(
      (
        _c: HTMLElement,
        o: {
          signal?: AbortSignal
          onProgression?: (f: number, t: number) => void
        },
      ) => {
        etat.signal = o.signal ?? null
        o.onProgression?.(2, 12)
        return new Promise((_resolve, reject) => {
          o.signal?.addEventListener('abort', () => reject(new Error('annulé')))
        })
      },
    )
    return etat
  }

  it('Télécharger le PDF est le bouton principal, Imprimer le secondaire ; aide complète', () => {
    render(<PagesSimples n={2} />)
    expect(pdfBouton().getAttribute('data-variant')).toBe('default')
    expect(bouton().getAttribute('data-variant')).toBe('outline')
    const aide = document.querySelector('[data-aide-pdf]') as HTMLElement
    expect(aide.textContent).toContain(
      'Télécharger le PDF : un fichier prêt à envoyer.',
    )
    expect(aide.textContent).toContain('Enregistrer au format PDF')
    expect(aide.className).not.toContain('truncate')
    expect(aide.textContent).not.toMatch(/[«»—]/)
    // Fermer toujours là, même sans la croix du dialogue.
    expect(screen.getByRole('button', { name: "Fermer l'aperçu" })).toBeTruthy()
  })

  it('pendant la création : seul le bouton PDF montre n / N, Imprimer garde son libellé ; Annuler arrête sans message', async () => {
    const etat = creationSuspendue()
    render(<PagesSimples n={2} />)
    fireEvent.click(pdfBouton())
    await waitFor(() =>
      expect(pdfBouton().textContent).toContain('Création du PDF… 3 / 12'),
    )
    expect(bouton().textContent).toBe('Imprimer')
    expect(bouton()).toHaveProperty('disabled', true)
    expect(screen.getByRole('status').textContent).toContain(
      "Fermer l'aperçu annule",
    )
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(etat.signal?.aborted).toBe(true)
    await waitFor(() =>
      expect(pdfBouton().textContent).toBe('Télécharger le PDF'),
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
  })

  it('fermer l’aperçu pendant la création ANNULE', async () => {
    const etat = creationSuspendue()
    const fermer = vi.fn()
    render(<PagesSimples n={2} onOpenChange={fermer} />)
    fireEvent.click(pdfBouton())
    await waitFor(() => expect(etat.signal).not.toBeNull())
    fireEvent.click(
      screen.getByRole('button', {
        name: "Fermer l'aperçu et annuler le PDF",
      }),
    )
    expect(etat.signal?.aborted).toBe(true)
    expect(fermer).toHaveBeenCalledWith(false)
  })

  it('démonté pendant la création : annulé', async () => {
    const etat = creationSuspendue()
    const { unmount } = render(<PagesSimples n={2} />)
    fireEvent.click(pdfBouton())
    await waitFor(() => expect(etat.signal).not.toBeNull())
    unmount()
    expect(etat.signal?.aborted).toBe(true)
  })

  it('autoTelecharger : part seul une fois la pagination prête, une seule fois', async () => {
    pdfMock.mockResolvedValue({ pages: 2, nom: 'Essai.pdf' })
    const termine = vi.fn()
    render(
      <PrintPreview
        open
        onOpenChange={() => {}}
        nomFichier="Essai"
        autoTelecharger
        onPdfTermine={termine}
      >
        <div className="a4-page">Document A</div>
        <DocumentPages
          title="Document B"
          content={'Avant\n\n```mermaid\ngraph TD\nA-->B\n```\n'}
        />
      </PrintPreview>,
    )
    await waitFor(() => expect(resoudreMermaid).not.toBeNull())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    // Pagination en cours : rien n'est parti.
    expect(pdfMock).not.toHaveBeenCalled()
    await act(async () => {
      resoudreMermaid?.()
    })
    await waitFor(() => expect(pdfMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(termine).toHaveBeenCalledWith({ pages: 2, nom: 'Essai.pdf' }),
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(pdfMock).toHaveBeenCalledTimes(1)
  })

  it('autoTelecharger : pas relancé quand les pages changent ensuite', async () => {
    pdfMock.mockResolvedValue({ pages: 1, nom: 'Essai.pdf' })
    const Apercu = ({ n }: { n: number }) => (
      <PrintPreview open onOpenChange={() => {}} autoTelecharger>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="a4-page">
            P{i}
          </div>
        ))}
      </PrintPreview>
    )
    const { rerender } = render(<Apercu n={1} />)
    await waitFor(() => expect(pdfMock).toHaveBeenCalledTimes(1))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    rerender(<Apercu n={2} />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(pdfMock).toHaveBeenCalledTimes(1)
  })

  it('sans autoTelecharger : rien ne part seul', async () => {
    pdfMock.mockResolvedValue({ pages: 2, nom: 'Essai.pdf' })
    render(<PagesSimples n={2} />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(pdfMock).not.toHaveBeenCalled()
  })

  it('au-delà de 40 pages : avertissement de durée et de poids, sans bloquer', () => {
    const { unmount } = render(<PagesSimples n={40} />)
    expect(screen.queryByRole('status')).toBeNull()
    unmount()
    render(<PagesSimples n={41} />)
    expect(screen.getByRole('status').textContent).toContain('41 pages')
    expect(pdfBouton()).toHaveProperty('disabled', false)
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

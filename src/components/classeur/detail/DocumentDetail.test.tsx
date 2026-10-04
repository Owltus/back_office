// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'

/*
 * Page d'un document (audit du 2026-10-04) : le zoom existe en LECTURE
 * comme en ÉDITION (A4), sa barre vit HORS des pages (B6), son libellé
 * montre le pourcentage réel (C7), et « Télécharger le PDF » ouvre l'aperçu
 * d'impression avec `autoTelecharger` (A2). Tout ce qui lit la base est
 * remplacé par un bouchon : seul l'assemblage de la page est jugé ici.
 */

const etat = vi.hoisted(() => ({ editing: false }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

vi.mock('#/components/classeur/hooks/useDetailPage.ts', () => ({
  useDetailPage: () => ({
    isPending: false,
    isError: false,
    error: null,
    canWrite: true,
    backParams: { classeurId: '24', chapterId: '34' },
    item: {
      id: 104,
      title: 'Doc',
      description: 'Desc',
      content: '# Titre\n\nTexte.',
      updated_at: '2026-10-04T10:00:00Z',
      version_majeure: 1,
      version_mineure: 0,
    },
    classeur: { id: 24 },
    classeurName: 'Essai',
    establishment: '',
    chapter: { id: 34, label: 'Chapitre' },
  }),
}))

vi.mock('#/components/classeur/detail/useEditionDocument.ts', () => ({
  useEditionDocument: () => ({
    editing: etat.editing,
    titre: 'Doc',
    setTitre: () => {},
    description: 'Desc',
    setDescription: () => {},
    contenu: '# Titre\n\nTexte.',
    setContenu: () => {},
    sauvegarder: () => {},
    saving: false,
    modifie: false,
    brouillonEcritLe: null,
    brouillonPropose: null,
    erreur: null,
    confirmation: null,
    conflit: null,
    commencer: () => {},
    annuler: () => {},
  }),
}))

vi.mock('#/components/classeur/hooks/useImages.ts', () => ({
  useImages: () => ({ data: undefined }),
}))

vi.mock('#/components/classeur/detail/InsertionImage.tsx', () => ({
  BoutonsImage: () => null,
  DialoguesImage: () => null,
  EtatImageLigne: () => null,
  useInsertionImage: () => ({ editeurProps: {} }),
}))

vi.mock('#/components/classeur/detail/BarreMiseEnForme.tsx', () => ({
  BarreMiseEnForme: () => null,
  useMiseEnForme: () => ({ editeurProps: {} }),
}))

vi.mock('#/components/classeur/print/DocumentPages.tsx', () => ({
  DocumentPages: () => <div data-testid="pages-a4" className="a4-page" />,
}))

// L'aperçu d'impression : on ne lit que ce qu'il reçoit.
vi.mock('#/components/classeur/print/PrintPreview.tsx', () => ({
  PrintPreview: (p: { open: boolean; autoTelecharger?: boolean }) =>
    p.open ? (
      <div
        data-testid="apercu-impression"
        data-auto={String(p.autoTelecharger === true)}
      />
    ) : null,
}))

const vide = () => null
vi.mock('#/components/classeur/dialogs/AbandonModificationsDialog.tsx', () => ({
  AbandonModificationsDialog: vide,
}))
vi.mock('#/components/classeur/dialogs/ConflitDocumentDialog.tsx', () => ({
  ConflitDocumentDialog: vide,
}))
vi.mock('#/components/classeur/dialogs/HistoriqueDocumentDialog.tsx', () => ({
  HistoriqueDocumentDialog: vide,
}))
vi.mock('#/components/classeur/dialogs/EchangeJsonDialog.tsx', () => ({
  EchangeJsonDialog: vide,
}))
vi.mock('#/components/classeur/dialogs/AideMiseEnFormeDialog.tsx', () => ({
  AideMiseEnFormeDialog: vide,
}))
vi.mock('#/components/classeur/dialogs/TitreDocumentDialog.tsx', () => ({
  TitreDocumentDialog: vide,
}))

const { DocumentDetail } =
  await import('#/components/classeur/detail/DocumentDetail.tsx')

function monter() {
  return render(
    <TooltipProvider>
      <DocumentDetail />
    </TooltipProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  etat.editing = false
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  // Colonne mesurée à 448 px : « ajusté » = 400 ÷ 793,7 ≈ 50 %.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 448,
    bottom: 600,
    width: 448,
    height: 600,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** La zone qui écoute Ctrl + molette : la carte qui porte l'aperçu. */
function zoneZoom(): HTMLElement {
  const defilement = document.querySelector('[data-apercu-defilement]')
  expect(defilement).not.toBeNull()
  return defilement!.parentElement!
}

function pagesZoomees(): HTMLElement {
  return screen.getByTestId('pages-a4').parentElement!
}

/** Ctrl + molette vers le haut (agrandir) ; rend l'événement envoyé. */
function ctrlMolette(cible: HTMLElement): WheelEvent {
  const e = new WheelEvent('wheel', {
    deltaY: -100,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })
  act(() => {
    cible.dispatchEvent(e)
  })
  return e
}

describe('DocumentDetail : zoom de l’aperçu (Ctrl + molette, sans contrôle)', () => {
  it('en LECTURE : aucun contrôle à l’écran, ajusté par défaut, Ctrl + molette agrandit', () => {
    monter()
    // Décision utilisateur du 2026-10-04 : comme la grille d'un chapitre,
    // pas de barre ni de bouton de zoom.
    expect(document.querySelector('[data-zoom-apercu]')).toBeNull()
    expect(
      screen.queryByRole('button', { name: /^Zoom de l'aperçu/ }),
    ).toBeNull()
    // Ajusté : 400 px utiles ÷ 793,7 px de page A4.
    expect(Number(pagesZoomees().style.zoom)).toBeCloseTo(0.504, 2)
    const e = ctrlMolette(zoneZoom())
    expect(e.defaultPrevented).toBe(true)
    expect(Number(pagesZoomees().style.zoom)).toBeGreaterThan(0.504)
  })

  it('molette SANS Ctrl : défilement normal, aucun zoom', () => {
    monter()
    const e = new WheelEvent('wheel', {
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      zoneZoom().dispatchEvent(e)
    })
    expect(e.defaultPrevented).toBe(false)
    expect(Number(pagesZoomees().style.zoom)).toBeCloseTo(0.504, 2)
  })

  it('en ÉDITION : même réglage mémorisé, aucun contrôle à l’écran', () => {
    window.localStorage.setItem('bo.classeur.zoomApercu.v1', '1.25')
    etat.editing = true
    monter()
    expect(document.querySelector('[data-zoom-apercu]')).toBeNull()
    expect(pagesZoomees().style.zoom).toBe('1.25')
    // Le texte d'édition est bien là : c'est la page d'édition.
    expect(screen.getByLabelText('Contenu du document')).toBeTruthy()
  })
})

describe('DocumentDetail : accès direct au PDF', () => {
  it('« Imprimer » ouvre l’aperçu SANS téléchargement automatique', () => {
    monter()
    fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }))
    expect(
      screen.getByTestId('apercu-impression').getAttribute('data-auto'),
    ).toBe('false')
  })

  it('« Télécharger le PDF » ouvre l’aperçu avec autoTelecharger', () => {
    monter()
    expect(screen.queryByTestId('apercu-impression')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le PDF' }))
    expect(
      screen.getByTestId('apercu-impression').getAttribute('data-auto'),
    ).toBe('true')
  })
})

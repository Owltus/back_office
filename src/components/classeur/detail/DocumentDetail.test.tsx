// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

/** Le bouton central du zoom (son nom accessible commence ainsi). */
function boutonZoom(): HTMLElement {
  return screen.getByRole('button', { name: /^Zoom de l'aperçu/ })
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

/** La barre du zoom n'est PAS dans la partie qui défile (B6). */
function verifierBarreHorsPages() {
  const barre = document.querySelector('[data-zoom-apercu]')
  const defilement = document.querySelector('[data-apercu-defilement]')
  expect(barre).not.toBeNull()
  expect(defilement).not.toBeNull()
  expect(defilement?.contains(barre)).toBe(false)
  expect(barre?.contains(boutonZoom())).toBe(true)
  // Et la barre suit les pages, dans la même carte.
  expect(defilement?.parentElement).toBe(barre?.parentElement)
  expect(defilement?.nextElementSibling).toBe(barre)
}

describe('DocumentDetail : zoom de l’aperçu', () => {
  it('en LECTURE : contrôle présent, pourcentage visible, échelle appliquée', () => {
    monter()
    expect(boutonZoom().textContent).toBe('Ajusté · 50 %')
    expect(boutonZoom().getAttribute('aria-label')).toBe(
      "Zoom de l'aperçu : Ajusté · 50 %",
    )
    verifierBarreHorsPages()
    const pages = screen.getByTestId('pages-a4').parentElement
    expect(Number(pages?.style.zoom)).toBeCloseTo(0.504, 2)
    fireEvent.click(screen.getByRole('button', { name: "Agrandir l'aperçu" }))
    expect(boutonZoom().textContent).toBe('75 %')
    expect(pages?.style.zoom).toBe('0.75')
  })

  it('en ÉDITION : même contrôle, même réglage mémorisé', () => {
    window.localStorage.setItem('bo.classeur.zoomApercu.v1', '1.25')
    etat.editing = true
    monter()
    expect(boutonZoom().textContent).toBe('125 %')
    verifierBarreHorsPages()
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

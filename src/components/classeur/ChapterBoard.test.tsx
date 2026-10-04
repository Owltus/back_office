// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'

/*
 * Page d'un chapitre : accès direct « Télécharger le PDF » (audit du
 * 2026-10-04, A2) — barre du chapitre (≥ 640 px), menu « ⋯ » (< 640 px) et
 * barre de sélection ouvrent l'aperçu AVEC `autoTelecharger` ; Imprimer
 * l'ouvre SANS. Titres d'aperçu sans tiret cadratin. Aperçu simulé : on
 * lit les props qu'il reçoit. Services simulés : la base n'est pas touchée.
 */

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({ createItem: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: unknown }) => children,
  useNavigate: () => vi.fn(),
}))
vi.mock('#/components/classeur/ChapterDrawer.tsx', () => ({
  ChapterDrawerButton: () => null,
}))
vi.mock('#/components/classeur/print/PrintPreview.tsx', () => ({
  PrintPreview: ({
    open,
    title,
    autoTelecharger,
  }: {
    open: boolean
    title?: string
    autoTelecharger?: boolean
  }) =>
    open ? (
      <div
        data-testid="apercu"
        data-auto={String(autoTelecharger === true)}
        data-titre={title}
      />
    ) : null,
}))
vi.mock('#/components/classeur/print/ItemPages.tsx', () => ({
  ItemPages: () => null,
  ChapterPrintPages: () => null,
}))
const carte = ({
  doc,
  onToggleSelect,
}: {
  doc: { title: string }
  onToggleSelect: () => void
}) => (
  <button type="button" onClick={onToggleSelect}>
    cocher {doc.title}
  </button>
)
vi.mock('#/components/classeur/cards/DocumentCard.tsx', () => ({
  DocumentCard: carte,
}))
for (const [chemin, nom] of [
  ['#/components/classeur/dialogs/CreateItemDialog.tsx', 'CreateItemDialog'],
  ['#/components/classeur/dialogs/EditItemDialog.tsx', 'EditItemDialog'],
  ['#/components/classeur/dialogs/DeleteItemDialog.tsx', 'DeleteItemDialog'],
  ['#/components/classeur/dialogs/BulkDeleteDialog.tsx', 'BulkDeleteDialog'],
  ['#/components/classeur/dialogs/ChapterDialog.tsx', 'ChapterDialog'],
]) {
  vi.doMock(chemin, () => ({ [nom]: () => null }))
}
vi.mock('#/components/classeur/dialogs/EchangeJsonDialog.tsx', () => ({
  EchangeJsonDialog: () => null,
}))
vi.mock('#/components/classeur/dialogs/SuppressionChapitreDialog.tsx', () => ({
  SuppressionChapitreDialog: () => null,
}))
vi.mock('#/components/classeur/dialogs/EditTrackingSheetDialog.tsx', () => ({
  EditTrackingSheetDialog: () => null,
}))
vi.mock('#/components/classeur/hooks/useDroitsClasseur.ts', () => ({
  useDroitsClasseur: () => ({
    canWrite: true,
    niveau: 'ecriture',
    isError: false,
    error: null,
  }),
  useClasseursCibles: () => ({
    cibles: [],
    isPending: false,
    isError: false,
    niveauDe: () => 'ecriture',
  }),
}))

const DATE = '2026-09-01T00:00:00Z'
const doc = (id: number, title: string) => ({
  id,
  uuid: `d${String(id)}`,
  chapter_id: 3,
  title,
  description: '',
  content: '',
  sort_order: id,
  deleted_at: null,
  created_at: DATE,
  updated_at: DATE,
})
const mutation = () => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
})
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useClasseur: () => ({
    data: {
      id: 24,
      name: 'Essai',
      etablissement: '',
      etablissement_complement: '',
    },
    isPending: false,
    isError: false,
  }),
  useChapter: () => ({
    data: {
      id: 3,
      classeur_id: 24,
      label: 'Accueil',
      icon: 'FileText',
      description: '',
    },
    isPending: false,
    isSuccess: true,
    isError: false,
  }),
  useChapterContent: () => ({
    data: {
      documents: [doc(1, 'Ouverture'), doc(2, 'Fermeture')],
      tracking_sheets: [],
      signature_sheets: [],
      intercalaires: [],
    },
    isPending: false,
    isError: false,
  }),
  useChapters: () => ({ data: [], isPending: false, isError: false }),
  usePeriodicites: () => ({ data: [] }),
  useReorderItems: mutation,
  useDeplacerItems: mutation,
  useInvaliderClasseur: () => vi.fn(),
}))

const { ChapterBoard, TELECHARGER_CHAPITRE, TELECHARGER_SELECTION } =
  await import('#/components/classeur/ChapterBoard.tsx')

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function monter() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ChapterBoard classeurId={24} chapterId={3} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const apercu = () => screen.getByTestId('apercu')

describe('ChapterBoard, accès direct au PDF (A2)', () => {
  it('barre du chapitre : Télécharger ouvre l’aperçu en téléchargement automatique', () => {
    monter()
    fireEvent.click(screen.getByRole('button', { name: TELECHARGER_CHAPITRE }))
    expect(apercu().dataset.auto).toBe('true')
    expect(apercu().dataset.titre).toBe('Accueil : chapitre complet')
  })

  it('Imprimer, lui, ouvre l’aperçu SANS téléchargement automatique', () => {
    monter()
    fireEvent.click(
      screen.getByRole('button', {
        name: "Imprimer le chapitre ou l'enregistrer en PDF",
      }),
    )
    expect(apercu().dataset.auto).toBe('false')
  })

  it('sous 640 px : l’entrée est dans le menu ⋯', async () => {
    monter()
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Autres actions du chapitre' }),
      { key: 'Enter' },
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: TELECHARGER_CHAPITRE }),
    )
    expect(apercu().dataset.auto).toBe('true')
  })

  it('barre de sélection : la sélection seule, téléchargée, titre sans tiret cadratin', () => {
    monter()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Sélectionner des éléments' })[0],
    )
    const bouton = screen.getByRole('button', { name: TELECHARGER_SELECTION })
    expect(bouton).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'cocher Fermeture' }))
    fireEvent.click(screen.getByRole('button', { name: TELECHARGER_SELECTION }))
    expect(apercu().dataset.auto).toBe('true')
    expect(apercu().dataset.titre).toBe('Accueil : 1 élément sélectionné')
    expect(apercu().dataset.titre).not.toMatch(/[«»—]/)
  })
})

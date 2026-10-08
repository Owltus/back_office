// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'

/*
 * Page d'un chapitre : Imprimer (barre du chapitre ≥ 640 px, menu « ⋯ »
 * < 640 px, barre de sélection) ouvre l'aperçu ; aucun bouton « Télécharger
 * le PDF » (PDF en images retiré le 2026-10-08). Titres d'aperçu sans tiret
 * cadratin. Aperçu simulé : on lit les props qu'il reçoit. Services simulés :
 * la base n'est pas touchée.
 */

const etatTest = vi.hoisted(() => ({ ordreEnErreur: false }))

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
  PrintPreview: ({ open, title }: { open: boolean; title?: string }) =>
    open ? <div data-testid="apercu" data-titre={title} /> : null,
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
  useReorderItems: () => ({
    ...mutation(),
    isError: etatTest.ordreEnErreur,
    error: etatTest.ordreEnErreur ? new Error('refus') : null,
  }),
  useDeplacerItems: mutation,
  useInvaliderClasseur: () => vi.fn(),
}))

const { ChapterBoard } = await import('#/components/classeur/ChapterBoard.tsx')

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
  etatTest.ordreEnErreur = false
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

describe('ChapterBoard, impression (PDF en images retiré le 2026-10-08)', () => {
  it('aucun bouton ni entrée « Télécharger le PDF »', async () => {
    monter()
    expect(screen.queryByRole('button', { name: /Télécharger/ })).toBeNull()
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Autres actions du chapitre' }),
      { key: 'Enter' },
    )
    await screen.findByRole('menuitem', { name: /Imprimer ou PDF/ })
    expect(screen.queryByRole('menuitem', { name: /Télécharger/ })).toBeNull()
  })

  it('barre du chapitre : Imprimer ouvre l’aperçu du chapitre complet', () => {
    monter()
    fireEvent.click(
      screen.getByRole('button', {
        name: "Imprimer le chapitre ou l'enregistrer en PDF",
      }),
    )
    expect(apercu().dataset.titre).toBe('Accueil : chapitre complet')
  })

  it('sous 640 px : Imprimer est dans le menu ⋯', async () => {
    monter()
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Autres actions du chapitre' }),
      { key: 'Enter' },
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Imprimer ou PDF/ }),
    )
    expect(apercu().dataset.titre).toBe('Accueil : chapitre complet')
  })

  it('barre de sélection : la sélection seule, titre sans tiret cadratin', () => {
    monter()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Sélectionner des éléments' })[0],
    )
    fireEvent.click(screen.getByRole('button', { name: 'cocher Fermeture' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Imprimer la sélection (1)' }),
    )
    expect(apercu().dataset.titre).toBe('Accueil : 1 élément sélectionné')
    expect(apercu().dataset.titre).not.toMatch(/[«»—]/)
  })
})

/*
 * Cadre « en-tête fixe + contenu qui défile » (décision utilisateur du
 * 2026-10-04) : titre, recherche et boutons dans l'en-tête, HORS de la zone
 * qui défile ; messages et grille DANS la zone, messages au-dessus.
 */
describe('ChapterBoard, en-tête fixe et zone qui défile', () => {
  it('recherche et boutons dans l’en-tête, grille et messages dans la zone', () => {
    etatTest.ordreEnErreur = true
    monter()
    const entete = document.querySelector<HTMLElement>('[data-page-en-tete]')
    const zone = document.querySelector<HTMLElement>('[data-page-zone]')
    expect(entete).not.toBeNull()
    expect(zone).not.toBeNull()
    expect(zone!.className).toContain('overflow-y-auto')
    expect(zone!.className).toContain('min-h-0')
    // L'en-tête ne défile pas : il n'est ni dans la zone, ni l'inverse.
    expect(zone!.contains(entete)).toBe(false)
    expect(entete!.contains(zone)).toBe(false)
    expect(entete!.className).toContain('shrink-0')

    const recherche = screen.getByRole('searchbox', {
      name: 'Rechercher dans le chapitre',
    })
    expect(entete!.contains(recherche)).toBe(true)
    expect(
      entete!.contains(
        screen.getByRole('button', {
          name: "Imprimer le chapitre ou l'enregistrer en PDF",
        }),
      ),
    ).toBe(true)

    const ouverture = screen.getByRole('button', { name: 'cocher Ouverture' })
    expect(zone!.contains(ouverture)).toBe(true)
    const message = screen.getByText(/Ordre non enregistré/)
    expect(zone!.contains(message)).toBe(true)
    expect(entete!.contains(message)).toBe(false)
    // Le message passe AVANT la grille.
    expect(
      message.compareDocumentPosition(ouverture) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

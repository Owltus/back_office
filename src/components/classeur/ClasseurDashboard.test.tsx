// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'

/*
 * Carte « Corbeille » de l'accueil (étape 6, D16) : visible avec le droit
 * d'ÉCRITURE sur le classeur, masquée sinon — et aucune lecture de la
 * corbeille au premier rendu (base Nano : sans compteur).
 */

const droits = vi.hoisted(() => ({
  canWrite: true,
  canManage: false,
  pret: true,
  isError: false,
  error: null,
}))
const droitsPage = vi.hoisted(() => ({ page: 'ecriture' }))
const service = vi.hoisted(() => ({ fetchCorbeille: vi.fn() }))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({
  softDeleteClasseur: vi.fn(),
  fetchCorbeille: service.fetchCorbeille,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: unknown }) => children,
  useNavigate: () => vi.fn(),
}))
vi.mock('#/components/classeur/ChapterDrawer.tsx', () => ({
  ChapterDrawerButton: () => null,
}))
vi.mock('#/components/classeur/dialogs/AccesClasseurDialog.tsx', () => ({
  AccesClasseurDialog: () => null,
}))
vi.mock('#/components/classeur/dialogs/ChapterDialog.tsx', () => ({
  ChapterDialog: () => null,
}))
vi.mock('#/components/classeur/dialogs/ClasseurDialog.tsx', () => ({
  ClasseurDialog: () => null,
}))
vi.mock('#/components/classeur/hooks/useDroitsClasseur.ts', () => ({
  useDroitsClasseur: () => droits,
  useDroitsPageClasseur: () => droitsPage,
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useClasseur: () => ({
    data: {
      id: 24,
      name: 'Essai',
      icon: 'BookOpen',
      etablissement: '',
      etablissement_complement: '',
      acces_tous: 'lecture',
    },
    isPending: false,
    isError: false,
  }),
  useChapters: () => ({ data: [], isPending: false, isError: false }),
  useClasseurContent: () => ({
    data: {
      chapters: [],
      content: {
        documents: [],
        tracking_sheets: [],
        signature_sheets: [],
        intercalaires: [],
      },
    },
    isPending: false,
    isError: false,
  }),
  useInvaliderClasseur: () => vi.fn(),
}))

const { ClasseurDashboard } =
  await import('#/components/classeur/ClasseurDashboard.tsx')

function monter(onCorbeille = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ClasseurDashboard
          classeurId={24}
          onHistorique={() => {}}
          onCorbeille={onCorbeille}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return onCorbeille
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  Object.assign(droits, {
    canWrite: true,
    pret: true,
    isError: false,
    error: null,
  })
  droitsPage.page = 'ecriture'
})

describe('ClasseurDashboard — carte Corbeille', () => {
  it('visible avec l’écriture, juste après les points de restauration', () => {
    droits.canWrite = true
    const ouvrir = monter()
    const carte = screen.getByRole('button', { name: /Corbeille/ })
    const historique = screen.getByRole('button', {
      name: /Points de restauration/,
    })
    expect(historique.nextElementSibling).toBe(carte)
    fireEvent.click(carte)
    expect(ouvrir).toHaveBeenCalledTimes(1)
    // Sans compteur : aucune lecture de la corbeille au premier rendu.
    expect(service.fetchCorbeille).not.toHaveBeenCalled()
  })

  it('masquée sans droit d’écriture', () => {
    droits.canWrite = false
    monter()
    expect(screen.queryByRole('button', { name: /Corbeille/ })).toBeNull()
    expect(
      screen.getByRole('button', { name: /Points de restauration/ }),
    ).toBeTruthy()
  })
})

/*
 * Audit du 2026-10-04 : les trois cartes d'écriture (Nouveau chapitre,
 * Importer, Corbeille) n'arrivent qu'avec les droits du classeur, lus APRÈS
 * le premier rendu. Leur place est réservée en silhouette pour qui peut
 * écrire sur la page (sinon la colonne grandissait de deux cartes), jamais
 * pour un lecteur de la page, et jamais une fois les droits connus.
 */
describe('ClasseurDashboard — places des cartes d’écriture', () => {
  function monterComplet() {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <ClasseurDashboard
            classeurId={24}
            onHistorique={() => {}}
            onCorbeille={() => {}}
            onExporterJson={() => {}}
            onImporter={() => {}}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    )
    return container.querySelectorAll('[data-carte-squelette]').length
  }

  it('droits en lecture, page en écriture : trois places réservées', () => {
    Object.assign(droits, { canWrite: false, pret: false })
    expect(monterComplet()).toBe(3)
    expect(screen.queryByRole('button', { name: /Corbeille/ })).toBeNull()
  })

  it('lecteur de la page : rien de réservé, même avant les droits', () => {
    Object.assign(droits, { canWrite: false, pret: false })
    droitsPage.page = 'lecture'
    expect(monterComplet()).toBe(0)
  })

  it('droits connus : les vraies cartes, ou rien', () => {
    expect(monterComplet()).toBe(0)
    expect(screen.getByRole('button', { name: /Corbeille/ })).toBeTruthy()
    cleanup()
    Object.assign(droits, { canWrite: false, pret: true })
    expect(monterComplet()).toBe(0)
    expect(
      screen.queryByRole('button', { name: /Nouveau chapitre/ }),
    ).toBeNull()
  })

  it('exceptions illisibles : le dit, sans place réservée', () => {
    Object.assign(droits, {
      canWrite: false,
      pret: false,
      isError: true,
      error: new Error('Failed to fetch'),
    })
    expect(monterComplet()).toBe(0)
    expect(
      screen.getByText(/Droits indisponibles, modifications désactivées/),
    ).toBeTruthy()
  })
})

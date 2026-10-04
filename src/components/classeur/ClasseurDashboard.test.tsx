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

const droits = vi.hoisted(() => ({ canWrite: true, canManage: false }))
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

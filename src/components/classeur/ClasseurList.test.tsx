// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import type { DbClasseur } from '#/lib/classeur/types.ts'

/*
 * Tableau des classeurs (2026-10-19) : une ligne par classeur, colonnes
 * chiffrées lues après la liste, colonne Accès selon le droit, poignée et
 * suppression pour la gestion seule, ligne entière qui ouvre le classeur.
 */

const etat = vi.hoisted(() => ({
  page: 'gestion' as 'lecture' | 'ecriture' | 'gestion',
  statsPending: false,
  navigate: vi.fn(),
}))

const classeur = (id: number, x: Partial<DbClasseur> = {}): DbClasseur => ({
  id,
  uuid: `u${id}`,
  name: `Classeur ${id}`,
  icon: 'book',
  etablissement: 'OKKO Nantes',
  etablissement_complement: '',
  sort_order: id,
  deleted_at: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  created_by: 'autre',
  acces_tous: 'lecture',
  ...x,
})

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/auth/AuthContext.tsx', () => ({
  useAuth: () => ({ user: { id: 'moi' } }),
}))
vi.mock('#/components/classeur/hooks/useDroitsClasseur.ts', () => ({
  useDroitsPageClasseur: () => ({
    page: etat.page,
    canCreate: etat.page !== 'lecture',
    canManage: etat.page === 'gestion',
    canReorderList: etat.page === 'gestion',
  }),
  useMesAcces: () => ({ isPending: false, parClasseur: new Map() }),
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useClasseurs: () => ({
    isPending: false,
    isSuccess: true,
    isError: false,
    data: [
      classeur(2, { acces_tous: 'aucun' }),
      classeur(5, { acces_tous: 'ecriture', created_by: 'moi' }),
      classeur(9),
    ],
  }),
  useStatsClasseurs: () => ({
    isPending: etat.statsPending,
    isError: false,
    data: etat.statsPending
      ? undefined
      : [
          {
            classeurId: 2,
            chapitres: 10,
            documents: 13,
            misAJour: '2026-10-02T10:00:00Z',
          },
          { classeurId: 5, chapitres: 8, documents: 33, misAJour: null },
        ],
  }),
  useReorderClasseurs: () => ({ mutate: vi.fn(), isError: false }),
  useInvaliderClasseur: () => vi.fn(),
}))
vi.mock('#/components/classeur/dialogs/ClasseurDialog.tsx', () => ({
  ClasseurDialog: () => null,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => etat.navigate,
}))

const { ClasseurList } = await import('#/components/classeur/ClasseurList.tsx')

function rendre() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ClasseurList onImporterJson={vi.fn()} onExporterJson={vi.fn()} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const entetes = (c: HTMLElement) =>
  [...c.querySelectorAll('thead th')].map((th) => th.textContent)
const cellules = (c: HTMLElement, ligne: number) =>
  [...c.querySelectorAll(`tbody tr:nth-child(${ligne}) td`)].map(
    (td) => td.textContent,
  )

afterEach(cleanup)
beforeEach(() => {
  etat.page = 'gestion'
  etat.statsPending = false
  etat.navigate.mockClear()
})

describe('ClasseurList — tableau', () => {
  it('gestion : poignée, colonnes chiffrées, accès donné à tous', () => {
    const { container, getByText } = rendre()
    expect(entetes(container)).toEqual([
      'Ordre',
      'Classeur',
      'Chapitres',
      'Documents',
      'Modifié le',
      'Accès',
      'Actions',
    ])
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3)
    const l1 = cellules(container, 1)
    expect(l1[2]).toBe('10')
    expect(l1[3]).toBe('13')
    expect(l1[5]).toBe('Privé')
    expect(cellules(container, 2)[5]).toBe('Tous en écriture')
    // Un classeur sans chapitre : zéro connu, pas un tiret.
    expect(cellules(container, 3).slice(2, 4)).toEqual(['0', '0'])
    expect(getByText('Nouveau classeur')).toBeTruthy()
    expect(getByText('Importer')).toBeTruthy()
    expect(
      container.querySelectorAll('[aria-label^="Supprimer"]'),
    ).toHaveLength(3)
    expect(container.querySelectorAll('[aria-label^="Déplacer"]')).toHaveLength(
      3,
    )
  })

  it('écriture : son propre niveau, ni poignée ni suppression', () => {
    etat.page = 'ecriture'
    const { container } = rendre()
    expect(entetes(container)).not.toContain('Ordre')
    expect(cellules(container, 1)[4]).toBe('Lecture')
    expect(cellules(container, 2)[4]).toBe('Modification')
    expect(
      container.querySelectorAll('[aria-label^="Supprimer"]'),
    ).toHaveLength(0)
  })

  it('lecture : ni colonne Accès, ni boutons de création', () => {
    etat.page = 'lecture'
    const { container, queryByText } = rendre()
    expect(entetes(container)).not.toContain('Accès')
    expect(queryByText('Nouveau classeur')).toBeNull()
  })

  it('compteurs en cours de lecture : place réservée, jamais un faux zéro', () => {
    etat.statsPending = true
    const { container } = rendre()
    const l1 = cellules(container, 1)
    expect(l1[2]).toBe('')
    expect(l1[3]).toBe('')
  })

  it('un clic sur la ligne ouvre le classeur, pas un clic sur un bouton', () => {
    const { container } = rendre()
    fireEvent.click(
      container.querySelector('tbody tr:nth-child(2) td:nth-child(3)')!,
    )
    expect(etat.navigate).toHaveBeenCalledWith({
      to: '/classeur/$classeurId',
      params: { classeurId: '5' },
    })
    etat.navigate.mockClear()
    fireEvent.click(
      container.querySelector(
        '[aria-label="Supprimer le classeur Classeur 5"]',
      )!,
    )
    expect(etat.navigate).not.toHaveBeenCalled()
  })
})

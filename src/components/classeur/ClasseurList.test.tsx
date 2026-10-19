// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
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
  it('gestion : lignes glissables, colonnes chiffrées, accès donné à tous', () => {
    const { container, getByText } = rendre()
    expect(entetes(container)).toEqual([
      'Classeur',
      'Chapitres',
      'Documents',
      'Modifié le',
      'Accès',
      'Actions',
    ])
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3)
    const l1 = cellules(container, 1)
    expect(l1[1]).toBe('10')
    expect(l1[2]).toBe('13')
    expect(l1[4]).toBe('Privé')
    expect(cellules(container, 2)[4]).toBe('Tous en écriture')
    // Un classeur sans chapitre : zéro connu, pas un tiret.
    expect(cellules(container, 3).slice(1, 3)).toEqual(['0', '0'])
    expect(getByText('Nouveau classeur')).toBeTruthy()
    expect(getByText('Importer')).toBeTruthy()
    expect(
      container.querySelectorAll('[aria-label^="Supprimer"]'),
    ).toHaveLength(3)
    // Plus de poignée : c'est la ligne entière qui se glisse, et elle reste
    // une ligne de tableau (pas de role="button").
    expect(container.querySelectorAll('[aria-label^="Déplacer"]')).toHaveLength(
      0,
    )
    const lignes = container.querySelectorAll('tbody tr')
    for (const tr of lignes) {
      expect(tr.getAttribute('aria-roledescription')).toBe('sortable')
      expect(tr.getAttribute('role')).toBeNull()
    }
  })

  it('écriture : son propre niveau, lignes non glissables, pas de suppression', () => {
    etat.page = 'ecriture'
    const { container } = rendre()
    expect(
      container.querySelector('tbody tr')!.getAttribute('aria-roledescription'),
    ).toBeNull()
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
    expect(l1[1]).toBe('')
    expect(l1[2]).toBe('')
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

  it('glisser une ligne puis la lâcher ne l’ouvre pas', () => {
    const { container } = rendre()
    const ligne = container.querySelector('tbody tr:nth-child(2)')!
    const cellule = ligne.querySelector('td:nth-child(2)')!
    // Souris : appui, déplacement au-delà des 5 px, relâchement, puis le
    // clic que le navigateur émet sur le même élément.
    act(() => {
      fireEvent.mouseDown(cellule, { button: 0, clientX: 10, clientY: 10 })
    })
    act(() => {
      fireEvent.mouseMove(document, { clientX: 10, clientY: 40 })
    })
    act(() => {
      fireEvent.mouseUp(document, { clientX: 10, clientY: 40 })
    })
    fireEvent.click(cellule)
    expect(etat.navigate).not.toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  exporter: vi.fn(),
  copier: vi.fn(),
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
            misAJour: '2026-10-02T10:00:00Z',
          },
          { classeurId: 5, misAJour: null },
        ],
  }),
  useReorderClasseurs: () => ({ mutate: vi.fn(), isError: false }),
  useInvaliderClasseur: () => vi.fn(),
}))
vi.mock('#/components/classeur/dialogs/ClasseurDialog.tsx', () => ({
  ClasseurDialog: () => null,
}))
vi.mock('#/components/classeur/dialogs/AccesClasseurDialog.tsx', () => ({
  AccesClasseurDialog: ({ classeur: c }: { classeur: DbClasseur | null }) =>
    c ? <div data-testid="acces">{c.name}</div> : null,
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
        <ClasseurList
          onImporterJson={vi.fn()}
          onExporterJson={etat.exporter}
          onCopierJson={etat.copier}
        />
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  etat.page = 'gestion'
  etat.statsPending = false
  etat.navigate.mockClear()
  etat.exporter.mockClear()
  etat.copier.mockClear()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

/** Ouvre le menu d'une ligne par clic droit ; rend les entrées et leur état. */
async function menuDe(ligne: number) {
  fireEvent.contextMenu(
    document.querySelector(`tbody tr:nth-child(${ligne}) td:nth-child(2)`)!,
  )
  await screen.findAllByRole('menuitem')
  return Object.fromEntries(
    screen
      .getAllByRole('menuitem')
      .map((m) => [
        m.textContent,
        m.getAttribute('aria-disabled') === 'true' ? 'grisé' : 'actif',
      ]),
  )
}

describe('ClasseurList — tableau', () => {
  it('gestion : lignes glissables, colonnes chiffrées, accès donné à tous', () => {
    const { container, getByText } = rendre()
    expect(entetes(container)).toEqual(['Classeur', 'Modifié le', 'Accès'])
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3)
    // Comme l'analytique : en-tête collant dans une zone qui défile.
    const thead = container.querySelector('thead')!
    expect(thead.className).toContain('sticky')
    expect(thead.parentElement!.parentElement!.className).toContain(
      'lg:overflow-y-auto',
    )
    const l1 = cellules(container, 1)
    // Date au format jj/mm/aa, la plus récente du contenu.
    expect(l1[1]).toBe('02/10/26')
    expect(l1[2]).toBe('Privé')
    expect(cellules(container, 2)[2]).toBe('Tous en écriture')
    // Aucun contenu lu (pas de chapitre) : la date du classeur lui-même.
    expect(cellules(container, 3)[1]).toBe('01/09/26')
    // Colonne Accès : une icône seule, le libellé n'est lu que par les
    // lecteurs d'écran ; intitulé de colonne invisible.
    const cellAcces = container.querySelector('tbody tr td:nth-child(3)')!
    expect(cellAcces.querySelector('svg')).not.toBeNull()
    expect(cellAcces.querySelector('.sr-only')!.textContent).toBe('Privé')
    expect(
      container.querySelector('thead th:nth-child(3) .sr-only'),
    ).not.toBeNull()
    expect(getByText('Nouveau classeur')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Importer un classeur' }),
    ).toBeTruthy()
    // Aucun bouton « ⋯ » : le menu est au clic droit seulement.
    expect(
      container.querySelectorAll('button[aria-label^="Actions"]'),
    ).toHaveLength(0)
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
    expect(cellules(container, 1)[2]).toBe('Lecture')
    expect(cellules(container, 2)[2]).toBe('Modification')
  })

  it('lecture : ni colonne Accès, ni boutons de création', () => {
    etat.page = 'lecture'
    const { container, queryByText } = rendre()
    expect(entetes(container)).not.toContain('Accès')
    expect(queryByText('Nouveau classeur')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Importer un classeur' }),
    ).toBeNull()
    // Le « ? » est pour tout le monde.
    expect(
      screen.getByRole('button', { name: 'Comment ça marche' }),
    ).toBeTruthy()
  })

  it('aide en lecture : ni création, ni rangement, ni légende des accès', async () => {
    etat.page = 'lecture'
    rendre()
    fireEvent.click(screen.getByRole('button', { name: 'Comment ça marche' }))
    await screen.findByText('Comment fonctionnent les classeurs')
    expect(screen.getByText('À quoi sert cette page')).toBeTruthy()
    expect(screen.queryByText('Créer ou importer')).toBeNull()
    expect(screen.queryByText(/changer l'ordre/)).toBeNull()
    expect(screen.queryByText('Tous le lisent.')).toBeNull()
    // Copier pour une IA est ouvert à la lecture ; reprendre ses modifications non.
    expect(screen.getByText('Travailler avec une IA')).toBeTruthy()
    expect(screen.getByText(/jamais dans le classeur/)).toBeTruthy()
    expect(screen.queryByText(/Pour reprendre ses modifications/)).toBeNull()
  })

  it('aide en gestion : tout, dont le rangement et la légende des accès', async () => {
    rendre()
    fireEvent.click(screen.getByRole('button', { name: 'Comment ça marche' }))
    await screen.findByText('Comment fonctionnent les classeurs')
    expect(screen.getByText('Créer ou importer')).toBeTruthy()
    expect(screen.getByText(/changer l'ordre/)).toBeTruthy()
    expect(screen.getByText('Tous le lisent.')).toBeTruthy()
    expect(screen.getByText(/Pour reprendre ses modifications/)).toBeTruthy()
    expect(screen.getByText(/Rien n'est supprimé, sauf si/)).toBeTruthy()
    expect(
      screen.getByText(/point de restauration est pris avant/),
    ).toBeTruthy()
  })

  it('date en cours de lecture : place réservée, jamais une fausse date', () => {
    etat.statsPending = true
    const { container } = rendre()
    expect(cellules(container, 1)[1]).toBe('')
  })

  it('un clic sur la ligne ouvre le classeur', () => {
    const { container } = rendre()
    fireEvent.click(
      container.querySelector('tbody tr:nth-child(2) td:nth-child(2)')!,
    )
    expect(etat.navigate).toHaveBeenCalledWith({
      to: '/classeur/$classeurId',
      params: { classeurId: '5' },
    })
  })

  it('menu, gestion : tout est permis', async () => {
    rendre()
    expect(await menuDe(2)).toEqual({
      Ouvrir: 'actif',
      'Modifier le classeur': 'actif',
      Accès: 'actif',
      'Copier pour une IA': 'actif',
      'Exporter en JSON': 'actif',
      Supprimer: 'actif',
    })
  })

  it('menu, écriture : modifier ce qu’on peut écrire, accès et suppression grisés', async () => {
    etat.page = 'ecriture'
    rendre()
    expect(await menuDe(2)).toEqual({
      Ouvrir: 'actif',
      'Modifier le classeur': 'actif',
      'AccèsGestion seule': 'grisé',
      'Copier pour une IA': 'actif',
      'Exporter en JSON': 'actif',
      'SupprimerGestion seule': 'grisé',
    })
    cleanup()
    rendre()
    // Classeur 2 : privé, créé par un autre, aucune exception.
    expect((await menuDe(1))['Modifier le classeurLecture seule']).toBe('grisé')
  })

  it('menu, lecture : on ouvre et on exporte, rien d’autre', async () => {
    etat.page = 'lecture'
    rendre()
    expect(await menuDe(3)).toEqual({
      Ouvrir: 'actif',
      'Modifier le classeurLecture seule': 'grisé',
      'AccèsGestion seule': 'grisé',
      'Copier pour une IA': 'actif',
      'Exporter en JSON': 'actif',
      'SupprimerGestion seule': 'grisé',
    })
  })

  it('menu : une entrée choisie agit sans ouvrir le classeur', async () => {
    rendre()
    await menuDe(2)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exporter en JSON' }))
    expect(etat.exporter).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5 }),
    )
    expect(etat.copier).not.toHaveBeenCalled()
    await menuDe(2)
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Copier pour une IA' }),
    )
    expect(etat.copier).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
    expect(etat.exporter).toHaveBeenCalledTimes(1)
    await menuDe(2)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Accès' }))
    expect(screen.getByTestId('acces').textContent).toBe('Classeur 5')
    expect(etat.navigate).not.toHaveBeenCalled()
  })

  it('menu : Supprimer demande confirmation sans ouvrir le classeur', async () => {
    rendre()
    await menuDe(3)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }))
    expect(screen.getByText(/Supprimer le classeur Classeur 9/)).toBeTruthy()
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

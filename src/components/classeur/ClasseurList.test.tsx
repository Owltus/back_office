// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import type { DbClasseur } from '#/lib/classeur/types.ts'

/*
 * Tableaux des classeurs (2026-11-16) : un tableau par type (Publics, Mes
 * privés, Gestion pour la gestion, Privés des autres pour l'admin), colonne
 * Auteur, lignes glissables pour qui peut les ranger ou les réordonner,
 * ligne entière qui ouvre le classeur, menu au clic droit.
 */

const etat = vi.hoisted(() => ({
  page: 'gestion',
  admin: false,
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
  visibilite: 'public',
  ...x,
})

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({
  rangerClasseur: vi.fn(),
  softDeleteClasseur: vi.fn(),
}))
vi.mock('#/components/classeur/hooks/useDroitsClasseur.ts', () => ({
  useDroitsPageClasseur: () => ({
    page: etat.page,
    moi: { page: etat.page, userId: 'moi', admin: etat.admin },
    canCreate: etat.page !== 'lecture',
    canManage: etat.page === 'gestion',
    canReorderList: etat.page === 'gestion',
  }),
  usePersonnesClasseur: () => ({
    isPending: false,
    data: [
      {
        id: 'moi',
        prenom: 'Ana',
        nom: 'Moi',
        nom_affiche: '',
        niveau_page: etat.page,
      },
      {
        id: 'autre',
        prenom: 'Bob',
        nom: 'Autre',
        nom_affiche: '',
        niveau_page: 'gestion',
      },
    ],
  }),
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useClasseurs: () => ({
    isPending: false,
    isSuccess: true,
    isError: false,
    data: [
      classeur(2, { visibilite: 'prive' }),
      classeur(5, { created_by: 'moi' }),
      classeur(7, { visibilite: 'prive', created_by: 'moi' }),
      classeur(8, { visibilite: 'gestion' }),
      classeur(9),
    ],
  }),
  useStatsClasseurs: () => ({
    isPending: etat.statsPending,
    isError: false,
    data: etat.statsPending
      ? undefined
      : [
          { classeurId: 5, misAJour: '2026-10-02T10:00:00Z' },
          { classeurId: 9, misAJour: null },
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
        <ClasseurList
          onImporterJson={vi.fn()}
          onExporterJson={etat.exporter}
          onCopierJson={etat.copier}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const titres = () =>
  screen.queryAllByRole('region').map((r) => r.getAttribute('aria-label'))
const tableau = (nom: string) => screen.getByRole('region', { name: nom })
const lignes = (nom: string) => [...tableau(nom).querySelectorAll('tbody tr')]
const noms = (nom: string) =>
  lignes(nom).map(
    (tr) => tr.querySelector('td a')?.textContent ?? tr.textContent,
  )
const ligneDe = (id: number) =>
  [...document.querySelectorAll('tbody tr')].find(
    (tr) => tr.querySelector('td a')?.textContent === `Classeur ${id}`,
  )!

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  etat.page = 'gestion'
  etat.admin = false
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

/** Ouvre le menu d'un classeur par clic droit ; rend les entrées et leur état. */
async function menuDe(id: number) {
  fireEvent.contextMenu(ligneDe(id).querySelector('td:nth-child(2)')!)
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

describe('ClasseurList — tableaux par type', () => {
  it('gestion : Publics, Mes privés, Gestion ; le privé d’un autre n’apparaît pas', () => {
    const { getByText } = rendre()
    expect(titres()).toEqual(['Publics', 'Mes privés', 'Gestion'])
    expect(noms('Publics')).toEqual(['Classeur 5', 'Classeur 9'])
    expect(noms('Mes privés')).toEqual(['Classeur 7'])
    expect(noms('Gestion')).toEqual(['Classeur 8'])
    expect(document.body.textContent).not.toContain('Classeur 2')
    const entetes = [...tableau('Publics').querySelectorAll('thead th')].map(
      (th) => th.textContent,
    )
    expect(entetes).toEqual(['Classeur', 'Auteur', 'Modifié le'])
    // Auteur : « Vous » pour soi, le nom sinon. Date au format jj/mm/aa.
    const c5 = [...lignes('Publics')[0].querySelectorAll('td')].map(
      (td) => td.textContent,
    )
    expect(c5[1]).toBe('Vous')
    expect(c5[2]).toBe('02/10/26')
    const c9 = [...lignes('Publics')[1].querySelectorAll('td')].map(
      (td) => td.textContent,
    )
    expect(c9[1]).toBe('Bob Autre')
    // Aucun contenu lu : la date du classeur lui-même.
    expect(c9[2]).toBe('01/09/26')
    expect(getByText('Nouveau classeur')).toBeTruthy()
    // La gestion réordonne : toutes les lignes se glissent, et restent des
    // lignes de tableau (pas de role="button").
    for (const tr of document.querySelectorAll('tbody tr')) {
      expect(tr.getAttribute('aria-roledescription')).toBe('sortable')
      expect(tr.getAttribute('role')).toBeNull()
    }
  })

  it('admin : un quatrième tableau, les privés des autres', () => {
    etat.admin = true
    rendre()
    expect(titres()).toEqual([
      'Publics',
      'Mes privés',
      'Privés des autres',
      'Gestion',
    ])
    expect(noms('Privés des autres')).toEqual(['Classeur 2'])
  })

  it('écriture : pas de tableau Gestion ; seules ses lignes se glissent', () => {
    etat.page = 'ecriture'
    rendre()
    expect(titres()).toEqual(['Publics', 'Mes privés'])
    expect(ligneDe(5).getAttribute('aria-roledescription')).toBe('sortable')
    expect(ligneDe(7).getAttribute('aria-roledescription')).toBe('sortable')
    expect(ligneDe(9).getAttribute('aria-roledescription')).toBeNull()
  })

  it('lecture : rien ne se glisse, ni création ni import', () => {
    etat.page = 'lecture'
    const { queryByText } = rendre()
    expect(titres()).toEqual(['Publics', 'Mes privés'])
    for (const tr of document.querySelectorAll('tbody tr'))
      expect(tr.getAttribute('aria-roledescription')).toBeNull()
    expect(queryByText('Nouveau classeur')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Importer un classeur' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Comment ça marche' }),
    ).toBeTruthy()
  })

  it('un tableau vide le dit', () => {
    etat.page = 'lecture'
    rendre()
    // Lecture : son privé (7) est le sien, Mes privés n'est pas vide.
    expect(noms('Mes privés')).toEqual(['Classeur 7'])
    cleanup()
    etat.page = 'gestion'
    etat.admin = true
    rendre()
    expect(lignes('Gestion')).toHaveLength(1)
  })

  it('aide en lecture : ni création, ni rangement', async () => {
    etat.page = 'lecture'
    rendre()
    fireEvent.click(screen.getByRole('button', { name: 'Comment ça marche' }))
    await screen.findByText('Comment fonctionnent les classeurs')
    expect(screen.getByText('À quoi sert cette page')).toBeTruthy()
    expect(screen.queryByText('Créer ou importer')).toBeNull()
    expect(screen.getByText('Les tableaux')).toBeTruthy()
    expect(screen.queryByText(/change son type/)).toBeNull()
    expect(screen.getByText('Travailler avec un LLM')).toBeTruthy()
    expect(screen.queryByText(/Pour reprendre ses modifications/)).toBeNull()
  })

  it('aide en gestion : création, rangement, tableau Gestion', async () => {
    rendre()
    fireEvent.click(screen.getByRole('button', { name: 'Comment ça marche' }))
    await screen.findByText('Comment fonctionnent les classeurs')
    expect(screen.getByText('Créer ou importer')).toBeTruthy()
    expect(screen.getByText(/change son type/)).toBeTruthy()
    expect(screen.getByText(/devient le vôtre/)).toBeTruthy()
    expect(screen.queryByText(/Privés des autres/)).toBeNull()
    expect(screen.getByText(/Pour reprendre ses modifications/)).toBeTruthy()
  })

  it('date en cours de lecture : place réservée, jamais une fausse date', () => {
    etat.statsPending = true
    rendre()
    expect(lignes('Publics')[0].querySelectorAll('td')[2].textContent).toBe('')
  })

  it('un clic sur la ligne ouvre le classeur', () => {
    rendre()
    fireEvent.click(ligneDe(9).querySelector('td:nth-child(2)')!)
    expect(etat.navigate).toHaveBeenCalledWith({
      to: '/classeur/$classeurId',
      params: { classeurId: '9' },
    })
  })

  it('menu, gestion : tout est permis', async () => {
    rendre()
    expect(await menuDe(9)).toEqual({
      Ouvrir: 'actif',
      'Modifier le classeur': 'actif',
      'Copier pour un LLM': 'actif',
      'Exporter en JSON': 'actif',
      Supprimer: 'actif',
    })
  })

  it('menu, écriture : un public se modifie, ne se supprime pas ; son privé se supprime', async () => {
    etat.page = 'ecriture'
    rendre()
    expect(await menuDe(9)).toEqual({
      Ouvrir: 'actif',
      'Modifier le classeur': 'actif',
      'Copier pour un LLM': 'actif',
      'Exporter en JSON': 'actif',
      'SupprimerGestion seule': 'grisé',
    })
    cleanup()
    rendre()
    expect((await menuDe(7)).Supprimer).toBe('actif')
  })

  it('menu, lecture : on ouvre et on exporte, rien d’autre', async () => {
    etat.page = 'lecture'
    rendre()
    expect(await menuDe(9)).toEqual({
      Ouvrir: 'actif',
      'Modifier le classeurLecture seule': 'grisé',
      'Copier pour un LLM': 'actif',
      'Exporter en JSON': 'actif',
      'SupprimerGestion seule': 'grisé',
    })
  })

  it('menu : une entrée choisie agit sans ouvrir le classeur', async () => {
    rendre()
    await menuDe(5)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exporter en JSON' }))
    expect(etat.exporter).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5 }),
    )
    expect(etat.copier).not.toHaveBeenCalled()
    await menuDe(5)
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Copier pour un LLM' }),
    )
    expect(etat.copier).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
    expect(etat.exporter).toHaveBeenCalledTimes(1)
    expect(etat.navigate).not.toHaveBeenCalled()
  })

  it('menu : Supprimer demande confirmation sans ouvrir le classeur', async () => {
    rendre()
    await menuDe(9)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }))
    expect(screen.getByText(/Supprimer le classeur Classeur 9/)).toBeTruthy()
    expect(etat.navigate).not.toHaveBeenCalled()
  })

  it('glisser une ligne puis la lâcher ne l’ouvre pas', () => {
    rendre()
    const cellule = ligneDe(5).querySelector('td:nth-child(2)')!
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

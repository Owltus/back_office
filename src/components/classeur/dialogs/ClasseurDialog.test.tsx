// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { typesCreables } from '#/lib/classeur/droits.ts'
import type { NiveauPage } from '#/lib/classeur/droits.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'

/*
 * Dialogue d'un classeur, TYPE et AUTEUR (2026-11-16) : à la création, les
 * types que l'on peut créer ; en édition, l'auteur et la gestion changent le
 * type et l'auteur, les autres lisent l'auteur ; un privé rangé chez soi par
 * la gestion devient le sien.
 */

const etat = vi.hoisted(() => ({
  page: ((): NiveauPage => 'gestion')(),
  admin: false,
  createClasseur: vi.fn(async () => 42),
  updateClasseur: vi.fn(async () => {}),
  rangerClasseur: vi.fn(async () => {}),
}))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({
  createClasseur: etat.createClasseur,
  updateClasseur: etat.updateClasseur,
  rangerClasseur: etat.rangerClasseur,
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useInvaliderClasseur: () => async () => {},
}))
vi.mock('#/components/classeur/IconPicker.tsx', () => ({
  IconPicker: () => null,
}))
vi.mock('#/components/classeur/hooks/useDroitsClasseur.ts', () => ({
  useDroitsPageClasseur: () => {
    const moi = { page: etat.page, userId: 'moi', admin: etat.admin }
    return { moi, typesCreables: typesCreables(moi) }
  },
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
      {
        id: 'ecri',
        prenom: 'Cleo',
        nom: 'Ecriture',
        nom_affiche: '',
        niveau_page: 'ecriture',
      },
      {
        id: 'lect',
        prenom: 'Lou',
        nom: 'Lecture',
        nom_affiche: '',
        niveau_page: 'lecture',
      },
    ],
  }),
}))

const { ClasseurDialog } =
  await import('#/components/classeur/dialogs/ClasseurDialog.tsx')

const classeur = (x: Partial<DbClasseur> = {}): DbClasseur => ({
  id: 7,
  uuid: 'u7',
  name: 'Registre',
  icon: 'BookOpen',
  etablissement: '',
  etablissement_complement: '',
  sort_order: 1,
  deleted_at: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  created_by: 'autre',
  visibilite: 'public',
  couleur: 'violet',
  ...x,
})

function rendre(c?: DbClasseur) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ClasseurDialog open onOpenChange={() => {}} classeur={c} />
    </QueryClientProvider>,
  )
}

/** Les choix du TYPE (les pastilles de couleur sont aussi des radios). */
const radiosType = () => {
  const g = screen.queryByRole('radiogroup', { name: 'Type du classeur' })
  return g ? [...g.querySelectorAll<HTMLElement>('[role="radio"]')] : []
}

const types = () => radiosType().map((r) => r.textContent)

afterEach(cleanup)

describe('ClasseurDialog — couleur', () => {
  it('14 pastilles, la couleur du classeur cochée, envoyée à l’enregistrement', async () => {
    rendre(classeur({ couleur: 'vert' }))
    const g = screen.getByRole('radiogroup', { name: 'Couleur' })
    const pastilles = [...g.querySelectorAll('[role="radio"]')]
    expect(pastilles).toHaveLength(14)
    expect(
      screen.getByRole('radio', { name: 'Vert' }).getAttribute('aria-checked'),
    ).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Fuchsia' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(etat.updateClasseur).toHaveBeenCalled())
    expect(etat.updateClasseur).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ couleur: 'fuchsia' }),
    )
  })
})
beforeEach(() => {
  etat.page = 'gestion'
  etat.admin = false
  etat.createClasseur.mockClear()
  etat.updateClasseur.mockClear()
  etat.rangerClasseur.mockClear()
})

describe('ClasseurDialog — type et auteur', () => {
  it('création en écriture : public ou privé, jamais gestion', async () => {
    etat.page = 'ecriture'
    rendre()
    expect(types().map((t) => t.split(/(?=[A-Z])/)[0])).toEqual([
      'Classeurs publics',
      'Classeurs privés',
    ])
    fireEvent.change(screen.getByLabelText('Nom'), {
      target: { value: 'Mon classeur' },
    })
    fireEvent.click(radiosType()[1])
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    await waitFor(() => expect(etat.createClasseur).toHaveBeenCalled())
    expect(etat.createClasseur.mock.calls[0]).toEqual([
      expect.objectContaining({ name: 'Mon classeur' }),
      'prive',
    ])
  })

  it('création en gestion : les trois types', () => {
    rendre()
    expect(types()).toHaveLength(3)
    expect(screen.queryByLabelText('Auteur')).toBeNull()
  })

  it('édition par un compte en écriture qui n’est pas l’auteur : auteur lu, rien à ranger', () => {
    etat.page = 'ecriture'
    rendre(classeur())
    expect(types()).toHaveLength(0)
    expect(screen.queryByRole('combobox', { name: 'Auteur' })).toBeNull()
    expect(screen.getByText('Bob Autre')).toBeTruthy()
  })

  it('la gestion range le public d’un autre dans Gestion : son auteur a la gestion, enregistré', async () => {
    rendre(classeur())
    expect(screen.getByRole('combobox', { name: 'Auteur' })).toBeTruthy()
    fireEvent.click(radiosType()[2])
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(etat.rangerClasseur).toHaveBeenCalled())
    expect(etat.rangerClasseur).toHaveBeenCalledWith(7, {
      visibilite: 'gestion',
    })
  })

  it('vers Gestion, un auteur sans la gestion bloque l’enregistrement', () => {
    rendre(classeur({ created_by: 'ecri' }))
    fireEvent.click(radiosType()[2])
    expect(
      screen.getByText(/ne peut pas avoir un classeur de ce type/),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Enregistrer' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('la gestion range le public d’un autre dans les privés : il devient le sien', async () => {
    rendre(classeur())
    fireEvent.click(radiosType()[1])
    expect(screen.getByText(/devient le vôtre/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(etat.rangerClasseur).toHaveBeenCalled())
    expect(etat.rangerClasseur).toHaveBeenCalledWith(7, {
      visibilite: 'prive',
      created_by: 'moi',
    })
  })

  it('l’auteur en écriture passe son public en privé, sans changer d’auteur', async () => {
    etat.page = 'ecriture'
    rendre(classeur({ created_by: 'moi' }))
    expect(types()).toHaveLength(2)
    fireEvent.click(radiosType()[1])
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(etat.rangerClasseur).toHaveBeenCalled())
    expect(etat.rangerClasseur).toHaveBeenCalledWith(7, { visibilite: 'prive' })
  })

  it('un auteur en lecture est permis pour un public ou un privé, et le dialogue le dit', () => {
    rendre(classeur({ created_by: 'lect' }))
    expect(
      screen.getByText(/pourra lire ce classeur, pas le modifier/),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Enregistrer' })
        .hasAttribute('disabled'),
    ).toBe(false)
    // Vers Gestion : refusé (la gestion seule y est auteur).
    fireEvent.click(radiosType()[2])
    expect(
      screen.getByText(/ne peut pas avoir un classeur de ce type/),
    ).toBeTruthy()
  })

  it('rien changé dans le type ni l’auteur : aucun rangement écrit', async () => {
    rendre(classeur())
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(etat.updateClasseur).toHaveBeenCalled())
    expect(etat.rangerClasseur).not.toHaveBeenCalled()
  })
})

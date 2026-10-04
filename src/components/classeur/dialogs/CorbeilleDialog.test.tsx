// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import type { DonneesCorbeille } from '#/lib/classeur/corbeille.ts'

/*
 * Corbeille (étape 6) contre un service simulé : la base n'est pas
 * touchée. Vérifié : jamais « vide » pendant le chargement ni après une
 * erreur ; l'état vide seulement après une lecture réussie ; une erreur de
 * restauration s'affiche dans la ligne, qui reste ; l'orphelin revient par
 * défaut AVEC son chapitre ; sans droit d'écriture, aucun bouton.
 */

const service = vi.hoisted(() => ({
  lecture: null as Promise<DonneesCorbeille> | null,
  fetchCorbeille: vi.fn(),
  restaurerItem: vi.fn(),
  restaurerChapter: vi.fn(),
  restaurerAvecChapitre: vi.fn(),
}))

vi.mock('#/lib/classeur/service.ts', () => ({
  fetchCorbeille: service.fetchCorbeille,
  restaurerItem: service.restaurerItem,
  restaurerChapter: service.restaurerChapter,
  restaurerAvecChapitre: service.restaurerAvecChapitre,
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const { CorbeilleDialog } =
  await import('#/components/classeur/dialogs/CorbeilleDialog.tsx')

const DONNEES: DonneesCorbeille = {
  chapitres: [
    { id: 1, label: 'Accueil', sort_order: 1, deleted_at: null },
    { id: 3, label: 'Jeté', sort_order: 2, deleted_at: '2026-09-02T10:00:00Z' },
  ],
  elements: [
    {
      kind: 'document',
      id: 10,
      chapter_id: 1,
      title: 'Procédure',
      deleted_at: '2026-09-01T10:00:00Z',
    },
    {
      kind: 'signature_sheet',
      id: 13,
      chapter_id: 3,
      title: 'Émargement',
      deleted_at: '2026-09-03T10:00:00Z',
    },
  ],
}

function monter(canWrite = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CorbeilleDialog
        open
        onOpenChange={() => {}}
        classeurId={24}
        canWrite={canWrite}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  service.fetchCorbeille.mockImplementation(() => service.lecture)
  service.restaurerItem.mockResolvedValue(undefined)
  service.restaurerChapter.mockResolvedValue(undefined)
  service.restaurerAvecChapitre.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CorbeilleDialog', () => {
  it('pendant le chargement : squelette, jamais « vide »', async () => {
    service.lecture = new Promise(() => {})
    monter()
    await waitFor(() => expect(service.fetchCorbeille).toHaveBeenCalledWith(24))
    expect(screen.queryByText(/corbeille est vide/i)).toBeNull()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('après une erreur de lecture : message, jamais « vide »', async () => {
    service.lecture = Promise.reject(
      Object.assign(new Error('x'), { code: '08006' }),
    )
    monter()
    await screen.findByText(/Lecture impossible/)
    expect(screen.queryByText(/corbeille est vide/i)).toBeNull()
  })

  it('lecture réussie sans supprimé : état vide', async () => {
    service.lecture = Promise.resolve({
      chapitres: [{ id: 1, label: 'A', sort_order: 1, deleted_at: null }],
      elements: [],
    })
    monter()
    await screen.findByText(/corbeille est vide/i)
  })

  it('liste plus récent d’abord, avec type, chapitre et date', async () => {
    service.lecture = Promise.resolve(DONNEES)
    monter()
    await screen.findByText('Procédure')
    const lignes = Array.from(document.querySelectorAll('li[data-cle]')).map(
      (l) => l.getAttribute('data-cle'),
    )
    expect(lignes).toEqual(['signature_sheet:13', 'chapitre:3', 'document:10'])
    expect(screen.getByText('Document · Accueil')).toBeTruthy()
    expect(screen.getByText('Supprimé le 01/09/2026')).toBeTruthy()
    expect(
      screen.getByText(/Son chapitre est aussi dans la corbeille/),
    ).toBeTruthy()
  })

  it('Restaurer un élément : service appelé en mode corbeille', async () => {
    service.lecture = Promise.resolve(DONNEES)
    monter()
    await screen.findByText('Procédure')
    const ligne = document.querySelector('li[data-cle="document:10"]')!
    fireEvent.click(ligne.querySelector('button')!)
    await waitFor(() =>
      expect(service.restaurerItem).toHaveBeenCalledWith(
        'document',
        10,
        {},
        { classeurId: 24 },
      ),
    )
    await screen.findByText(/Procédure est restauré/)
    // L'état réel est relu après la restauration (audit du 2026-10-04 :
    // l'invalidation retirée ne faisait échouer aucun test).
    await waitFor(() => expect(service.fetchCorbeille).toHaveBeenCalledTimes(2))
  })

  it('orphelin : « Restaurer avec son chapitre » par défaut', async () => {
    service.lecture = Promise.resolve(DONNEES)
    monter()
    const bouton = await screen.findByRole('button', {
      name: /Restaurer avec son chapitre/,
    })
    fireEvent.click(bouton)
    await waitFor(() =>
      expect(service.restaurerAvecChapitre).toHaveBeenCalledWith(
        24,
        'signature_sheet',
        13,
        3,
      ),
    )
    expect(service.restaurerItem).not.toHaveBeenCalled()
  })

  it('Restaurer un chapitre', async () => {
    service.lecture = Promise.resolve(DONNEES)
    monter()
    await screen.findByText('Jeté')
    const ligne = document.querySelector('li[data-cle="chapitre:3"]')!
    fireEvent.click(ligne.querySelector('button')!)
    await waitFor(() =>
      expect(service.restaurerChapter).toHaveBeenCalledWith(
        3,
        {},
        { classeurId: 24 },
      ),
    )
  })

  it('refus à la restauration : erreur dans la ligne, qui reste', async () => {
    service.lecture = Promise.resolve(DONNEES)
    service.restaurerItem.mockRejectedValue(
      Object.assign(new Error('Écriture refusée'), { code: '42501' }),
    )
    monter()
    await screen.findByText('Procédure')
    const ligne = document.querySelector('li[data-cle="document:10"]')!
    fireEvent.click(ligne.querySelector('button')!)
    await waitFor(() =>
      expect(ligne.textContent).toMatch(/Modification refusée/),
    )
    expect(document.querySelector('li[data-cle="document:10"]')).not.toBeNull()
    expect(screen.queryByText(/est restauré/)).toBeNull()
    // Échec aussi : un échec à mi-chemin a pu écrire, l'état réel est relu.
    await waitFor(() => expect(service.fetchCorbeille).toHaveBeenCalledTimes(2))
  })

  it('sans droit d’écriture : aucun bouton', async () => {
    service.lecture = Promise.resolve(DONNEES)
    monter(false)
    await screen.findByText('Procédure')
    expect(
      screen
        .queryAllByRole('button')
        .filter((b) => /Restaurer/.test(b.textContent)),
    ).toHaveLength(0)
  })
})

describe('pied de la corbeille (audit du 2026-10-04, C8)', () => {
  it('un bouton Fermer en pied, en plus de la croix, qui ferme', async () => {
    service.lecture = Promise.resolve(DONNEES)
    const onOpenChange = vi.fn()
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CorbeilleDialog
          open
          onOpenChange={onOpenChange}
          classeurId={24}
          canWrite
        />
      </QueryClientProvider>,
    )
    await screen.findByText('Procédure')
    const fermer = screen.getByRole('button', { name: 'Fermer' })
    // En pied : APRÈS la liste dans l'ordre du document.
    const liste = document.querySelector('li[data-cle]')!
    expect(
      liste.compareDocumentPosition(fermer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    fireEvent.click(fermer)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

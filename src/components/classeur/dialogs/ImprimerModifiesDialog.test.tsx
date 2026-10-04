// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import type { VersionModifiee } from '#/lib/classeur/selectionImpression.ts'
import type { ChapterContent, DbChapter } from '#/lib/classeur/types.ts'

/*
 * « Imprimer les modifications » contre un service simulé (la base n'est
 * pas touchée). Ce qui est vérifié : jamais « aucune modification » pendant
 * le chargement ; l'état vide n'est affirmé qu'après une lecture réussie ;
 * tout est coché par défaut et « Aperçu (N) » rend les éléments cochés dans
 * l'ordre du classeur, avec le nom de leur chapitre.
 */

const DATE = '2026-09-01T00:00:00Z'

const chapitre = (id: number, label: string): DbChapter => ({
  id,
  uuid: `c${id}`,
  classeur_id: 24,
  label,
  icon: 'Folder',
  description: '',
  sort_order: id,
  deleted_at: null,
  created_at: DATE,
  updated_at: DATE,
})

const contenu: ChapterContent = {
  documents: [
    {
      id: 90,
      uuid: 'd90',
      chapter_id: 2,
      title: 'Ouverture du hall',
      description: '',
      content: '',
      sort_order: 0,
      deleted_at: null,
      created_at: DATE,
      updated_at: DATE,
    },
  ],
  tracking_sheets: [],
  signature_sheets: [
    {
      id: 5,
      uuid: 's5',
      chapter_id: 1,
      title: 'Émargement',
      description: '',
      nombre: 10,
      sort_order: 0,
      deleted_at: null,
      created_at: DATE,
      // Bien après toute date choisie dans le test.
      updated_at: '2099-01-01T00:00:00Z',
    },
  ],
  intercalaires: [],
}

const etat = {
  versions: null as Promise<VersionModifiee[]> | null,
  contenu: true,
}

vi.mock('#/lib/classeur/service.ts', () => ({
  MAX_VERSIONS_DEPUIS: 1000,
  fetchVersionsDepuis: vi.fn(() => etat.versions),
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useClasseurContent: () =>
    etat.contenu
      ? {
          data: {
            chapters: [chapitre(1, 'Sécurité'), chapitre(2, 'Accueil')],
            content: contenu,
          },
          isPending: false,
          isSuccess: true,
          isError: false,
          error: null,
        }
      : {
          data: undefined,
          isPending: true,
          isSuccess: false,
          isError: false,
          error: null,
        },
}))

const { ImprimerModifiesDialog } =
  await import('#/components/classeur/dialogs/ImprimerModifiesDialog.tsx')

afterEach(cleanup)

function ouvrir(onApercu = vi.fn()) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ImprimerModifiesDialog
        open
        onOpenChange={() => {}}
        classeurId={24}
        onApercu={onApercu}
      />
    </QueryClientProvider>,
  )
  return onApercu
}

describe('ImprimerModifiesDialog', () => {
  it('pendant le chargement, ne dit JAMAIS « aucune modification »', () => {
    etat.contenu = true
    etat.versions = new Promise(() => {})
    ouvrir()
    expect(screen.queryByText(/Aucune modification/)).toBeNull()
    const bouton = screen.getByRole('button', { name: /Aperçu/ })
    expect(bouton).toHaveProperty('disabled', true)
  })

  it('contenu du classeur pas encore lu : pas d’état vide non plus', async () => {
    etat.contenu = false
    etat.versions = Promise.resolve([])
    ouvrir()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText(/Aucune modification/)).toBeNull()
  })

  it('date préremplie à J − 7, et état vide honnête après une lecture réussie', async () => {
    etat.contenu = true
    etat.versions = Promise.resolve([])
    // La feuille de 2099 est « modifiée » : on la retire pour l'état vide.
    const garde = contenu.signature_sheets
    contenu.signature_sheets = []
    try {
      ouvrir()
      const champ = screen.getByLabelText('Modifiés depuis le')
      expect((champ as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      await screen.findByText(
        /Aucune modification depuis le \d{2}\/\d{2}\/\d{4}/,
      )
    } finally {
      contenu.signature_sheets = garde
    }
  })

  it('liste groupée par chapitre, tout coché ; Aperçu rend les cochés dans l’ordre du classeur', async () => {
    etat.contenu = true
    etat.versions = Promise.resolve([
      {
        id: 1,
        document_id: 90,
        origine: 'enregistrement',
        auteur: 'Camille Martin',
        created_at: '2098-12-31T08:00:00Z',
        version: '2.1',
        raison: 'contenu modifié',
      },
    ])
    const onApercu = ouvrir()
    await screen.findByText('Ouverture du hall')
    expect(screen.getByText(/v2\.1 · contenu modifié/)).toBeTruthy()
    expect(screen.getByText(/contenu, ordre ou restauration/)).toBeTruthy()
    const titres = screen.getAllByRole('heading', { level: 3 })
    expect(titres.map((t) => t.textContent)).toEqual(['Sécurité', 'Accueil'])

    const cases = screen.getAllByRole('checkbox')
    expect(cases.every((c) => (c as HTMLInputElement).checked)).toBe(true)
    screen.getByRole('button', { name: 'Aperçu (2)' })

    // Décocher la feuille : il reste le document.
    fireEvent.click(cases[0])
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu (1)' }))
    await waitFor(() => expect(onApercu).toHaveBeenCalledTimes(1))
    const [elements, depuis] = onApercu.mock.calls[0]
    expect(
      elements.map(
        (e: {
          item: { kind: string; data: { id: number } }
          chapterName: string
        }) => `${e.item.kind}:${e.item.data.id}@${e.chapterName}`,
      ),
    ).toEqual(['document:90@Accueil'])
    expect(depuis).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/)
  })

  it('plafond atteint sans élément visible : prévient, n’affirme pas « aucune modification »', async () => {
    etat.contenu = true
    // 1000 versions (le plafond), toutes d'un document absent du classeur
    // (supprimé) : les plus anciennes, non lues, pouvaient compter.
    etat.versions = Promise.resolve(
      Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        document_id: 999,
        origine: 'enregistrement' as const,
        auteur: '',
        created_at: '2098-12-31T08:00:00Z',
        version: '1.1',
        raison: '',
      })),
    )
    const garde = contenu.signature_sheets
    contenu.signature_sheets = []
    try {
      ouvrir()
      await screen.findByText(/la liste peut être incomplète/)
      expect(screen.queryByText(/Aucune modification/)).toBeNull()
      expect(screen.getByRole('button', { name: /Aperçu/ })).toHaveProperty(
        'disabled',
        true,
      )
    } finally {
      contenu.signature_sheets = garde
    }
  })
})

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
} from '#/lib/classeur/merge/fixtures.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'

/*
 * « Copier pour un LLM » depuis le menu de la liste des classeurs (étape 3
 * du plan `classeur-echange-ia-2026-10-19`). Oracles : le texte copié est
 * exactement l'export du classeur ; un double clic ne lit le contenu qu'une
 * fois ; un refus du navigateur télécharge le fichier et le dit en une
 * phrase ; « Copié » s'affiche après une copie réussie.
 */

const A = chapitre({ id: 10, label: 'Accueil' })
const local = etat([A], {
  documents: [document({ id: 1, chapter_id: 10, title: 'Check-in' })],
})
const C = classeur()

const lectures = vi.fn()
let finirLecture: (() => void) | null = null
vi.mock('#/lib/classeur/service.ts', () => ({
  fetchClasseurContent: () => {
    lectures()
    return new Promise((r) => {
      finirLecture = () => r({ chapters: [A], content: local.content })
    })
  },
  fetchPeriodicites: () => Promise.resolve(PERIODICITES),
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
const creer = vi.fn<(f: unknown) => Promise<number>>()
vi.mock('#/components/classeur/hooks/useMerge.ts', () => ({
  useImporterNouveauClasseur: () => ({ mutateAsync: creer }),
}))
let aImporter: File | null = null
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
const telecharge = vi.fn()
vi.mock('#/lib/classeur/download.ts', () => ({
  telechargerTexte: (...args: unknown[]) => telecharge(...args),
}))
// La liste elle-même est testée ailleurs : ici, un bouton par action.
vi.mock('#/components/classeur/ClasseurList.tsx', () => ({
  ClasseurList: ({
    onCopierJson,
    onExporterJson,
    onImporterJson,
  }: {
    onCopierJson: (c: DbClasseur) => void
    onExporterJson: (c: DbClasseur) => void
    onImporterJson: (f: File) => void
  }) => (
    <>
      <button onClick={() => onCopierJson(C)}>Copier pour un LLM</button>
      <button onClick={() => onExporterJson(C)}>Exporter en JSON</button>
      <button onClick={() => aImporter && onImporterJson(aImporter)}>
        Importer
      </button>
    </>
  ),
}))

const { ClasseurListActions } =
  await import('#/components/classeur/ClasseurListActions.tsx')
const { MESSAGE_COPIE_REFUSEE } =
  await import('#/components/classeur/hooks/useCopieExport.ts')

const ecrit = vi.fn<(t: string) => Promise<void>>()
afterEach(cleanup)
beforeEach(() => {
  lectures.mockReset()
  telecharge.mockReset()
  ecrit.mockReset()
  ecrit.mockResolvedValue(undefined)
  creer.mockReset()
  creer.mockResolvedValue(42)
  aImporter = null
  finirLecture = null
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: ecrit },
    configurable: true,
  })
})

function rendre() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ClasseurListActions />
    </QueryClientProvider>,
  )
}
const sansDate = (t: string) => {
  const o = JSON.parse(t) as { _metadata: Record<string, unknown> }
  delete o._metadata.generated_at
  return o
}
async function lectureFinie() {
  await waitFor(() => expect(finirLecture).not.toBeNull())
  await act(async () => {
    finirLecture?.()
    await Promise.resolve()
  })
}

describe('ClasseurListActions — Copier pour un LLM', () => {
  it('le texte copié est exactement l’export du classeur ; « Copié » s’affiche', async () => {
    rendre()
    fireEvent.click(screen.getByText('Copier pour un LLM'))
    await lectureFinie()
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    const attendu = JSON.stringify(
      construireExport(C, [A], local.content, PERIODICITES),
      null,
      2,
    )
    expect(sansDate(ecrit.mock.calls[0][0])).toEqual(sansDate(attendu))
    expect((await screen.findByRole('status')).textContent).toBe('Copié')
    expect(telecharge).not.toHaveBeenCalled()
  })

  it('double clic : le contenu n’est lu qu’une fois, une seule copie', async () => {
    rendre()
    fireEvent.click(screen.getByText('Copier pour un LLM'))
    fireEvent.click(screen.getByText('Copier pour un LLM'))
    await lectureFinie()
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    expect(lectures).toHaveBeenCalledTimes(1)
  })

  it('copie refusée : une phrase, le fichier téléchargé, aucune erreur affichée', async () => {
    ecrit.mockRejectedValue(new Error('NotAllowedError'))
    rendre()
    fireEvent.click(screen.getByText('Copier pour un LLM'))
    await lectureFinie()
    await screen.findByText(MESSAGE_COPIE_REFUSEE)
    expect(telecharge).toHaveBeenCalledTimes(1)
    expect(telecharge.mock.calls[0][0]).toBe('Registre de sécurité.json')
    expect(screen.queryByText(/Copie impossible/)).toBeNull()
  })

  it('Exporter en JSON : même texte, téléchargé', async () => {
    rendre()
    fireEvent.click(screen.getByText('Exporter en JSON'))
    await lectureFinie()
    await waitFor(() => expect(telecharge).toHaveBeenCalledTimes(1))
    const [nom, contenu] = telecharge.mock.calls[0] as [string, string]
    expect(nom).toBe('Registre de sécurité.json')
    expect(sansDate(contenu)).toEqual(
      sansDate(
        JSON.stringify(
          construireExport(C, [A], local.content, PERIODICITES),
          null,
          2,
        ),
      ),
    )
    expect(ecrit).not.toHaveBeenCalled()
  })
})

describe('import en nouveau classeur : validation et relecture (étapes 6 et 7, D7)', () => {
  const fichierDe = (
    over: (f: ReturnType<typeof construireExport>) => void,
  ) => {
    const f = construireExport(C, [A], local.content, PERIODICITES)
    // Des uuids de la base (canoniques) : les fixtures en ont de factices.
    f.chapters[0].uuid = '00000000-0000-4000-8000-000000000010'
    f.chapters[0].items[0].uuid = '00000000-0000-4000-8000-000000000001'
    over(f)
    return new File([JSON.stringify(f)], 'classeur.json')
  }

  it('un fichier propre : créé aussitôt, sans étape de plus', async () => {
    aImporter = fichierDe(() => {})
    rendre()
    fireEvent.click(screen.getByText('Importer'))
    await waitFor(() => expect(creer).toHaveBeenCalledTimes(1))
    expect(screen.queryByText("Avant d'importer")).toBeNull()
  })

  it('corrections et phrase sur l’IA : montrées AVANT de créer ; Créer applique le fichier corrigé', async () => {
    aImporter = fichierDe((f) => {
      f.chapters[0].items[0].content = 'Accueillir.\n\nTexte généré par une IA.'
      f.chapters[0].items.push({
        kind: 'signature_sheet',
        title: 'Émargement',
        description: '',
        nombre: 100,
        sort_order: 2,
      })
    })
    rendre()
    fireEvent.click(screen.getByText('Importer'))
    expect(await screen.findByText("Avant d'importer")).toBeTruthy()
    expect(creer).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'Feuille de signature Émargement : 100 lignes demandées, 60 au plus.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('1 élément a des points à vérifier.')).toBeTruthy()
    expect(
      screen.getByText(
        /Phrase sur le LLM dans le texte\. Elle serait imprimée\./,
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByText('Créer le classeur'))
    await waitFor(() => expect(creer).toHaveBeenCalledTimes(1))
    const f = creer.mock.calls[0][0] as {
      chapters: Array<{ items: Array<{ nombre?: number }> }>
    }
    expect(f.chapters[0].items[1].nombre).toBe(60)
  })

  it('Annuler : rien n’est créé', async () => {
    aImporter = fichierDe((f) => {
      f.chapters[0].label = 'Accueil (brouillon)'
    })
    rendre()
    fireEvent.click(screen.getByText('Importer'))
    fireEvent.click(await screen.findByText('Annuler'))
    await waitFor(() =>
      expect(screen.queryByText("Avant d'importer")).toBeNull(),
    )
    expect(creer).not.toHaveBeenCalled()
  })
})

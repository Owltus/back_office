// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
} from '#/lib/classeur/merge/fixtures.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type { OptionsFusion } from '#/lib/classeur/merge/merge.ts'
import {
  chapitresDesLignes,
  lignesImport,
} from '#/lib/classeur/merge/portee.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'

/*
 * Import JSON du classeur COMPLET (audit du 2026-10-04) : même aperçu que
 * le réimport d'un chapitre, groupé par chapitre. Le VRAI planificateur sur
 * un état local écrit ici ; seules la lecture de la base, la médiathèque et
 * l'écriture sont simulées. Oracles posés à la main.
 */

const A = chapitre({ id: 10, label: 'Accueil', sort_order: 1 })
const B = chapitre({ id: 20, label: 'Sécurité', sort_order: 2 })
const d1 = document({
  id: 1,
  chapter_id: 10,
  title: 'Check-in',
  content: 'Accueillir le client\nRemettre la clé',
  sort_order: 1,
})
const d2 = document({
  id: 2,
  chapter_id: 10,
  title: 'Check-out',
  content: 'Rendre la clé',
  sort_order: 2,
})
const d3 = document({
  id: 3,
  chapter_id: 20,
  title: 'Extincteur',
  content: 'Vérifier la pression chaque mois',
  sort_order: 1,
  version_majeure: 3,
  version_mineure: 1,
})
const local = etat([A, B], { documents: [d1, d2, d3] })
const PLUS_TARD = '2026-05-01T00:00:00+00:00'

const appliquer = vi.fn()
let retenir: Promise<void> | null = null

vi.mock('#/lib/classeur/merge/apply.ts', () => ({
  previsualiserFusionComplete: async (
    _id: number,
    fichier: ClasseurJson,
    options: OptionsFusion,
  ) => {
    if (retenir) await retenir
    const plan = planifierFusion(local, fichier, options)
    return {
      plan,
      lignes: lignesImport(local, plan),
      chapitres: chapitresDesLignes(local, plan),
    }
  },
  appliquerFusion: (...args: unknown[]) => appliquer(...args),
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useInvaliderClasseur: () => () => Promise.resolve(),
}))
vi.mock('#/components/classeur/hooks/useImages.ts', () => ({
  useImages: () => ({ data: [], isPending: false }),
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const { MergePreviewDialog, VERROU_CHAPITRE_SUPPRIME } =
  await import('#/components/classeur/dialogs/MergePreviewDialog.tsx')

/** Le classeur exporté, retravaillé : d1 réécrit, d3 en forme seule, un chapitre neuf. */
function fichierLlm(over: (f: ClasseurJson) => void = () => {}): File {
  const f = construireExport(classeur(), [A, B], local.content, PERIODICITES)
  const [ca, cb] = f.chapters
  ca.items[0] = {
    ...ca.items[0],
    content: 'Accueillir le client avec le sourire\nRemettre la clé',
    updated_at: PLUS_TARD,
  }
  cb.items[0] = {
    ...cb.items[0],
    content: 'Vérifier la **pression** chaque mois',
    updated_at: PLUS_TARD,
  }
  f.chapters.push({
    uid: 'annexes',
    label: 'Annexes',
    icon: 'FileText',
    description: '',
    sort_order: 3,
    items: [
      {
        kind: 'document',
        title: 'Plan du hall',
        description: '',
        content: 'Voici le plan.\n\n![](a-inserer-pas)\n',
        sort_order: 1,
      },
    ],
  })
  over(f)
  return new File([JSON.stringify(f)], 'classeur.json', {
    type: 'application/json',
  })
}

afterEach(cleanup)
beforeEach(() => {
  appliquer.mockReset()
  retenir = null
})

const onDone = vi.fn()

function ouvrir(file: File) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MergePreviewDialog
        open
        onOpenChange={() => {}}
        classeurId={1}
        file={file}
        onDone={onDone}
      />
    </QueryClientProvider>,
  )
}

const bouton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: /^Importer|^Aucun/ })

async function ouvrirAvecApercu(file = fichierLlm()) {
  ouvrir(file)
  await waitFor(() => screen.getByLabelText('Importer Check-in'), {
    timeout: 3000,
  })
}

describe('MergePreviewDialog — aperçu du classeur complet', () => {
  it('groupé par chapitre, chapitre neuf en ligne à part sans case', async () => {
    await ouvrirAvecApercu()
    const accueil = screen.getByRole('list', { name: 'Accueil' })
    expect(within(accueil).getByText('Check-in')).toBeTruthy()
    const securite = screen.getByRole('list', { name: 'Sécurité' })
    expect(within(securite).getByText('Extincteur')).toBeTruthy()
    const annexes = screen.getByRole('list', { name: 'Annexes' })
    expect(within(annexes).getByText(/Chapitre : Annexes/)).toBeTruthy()
    expect(within(annexes).getByText('Plan du hall')).toBeTruthy()
    // Une seule case par document, aucune pour le chapitre.
    expect(within(annexes).getAllByRole('checkbox')).toHaveLength(1)
    // Check-out n'a pas changé : pas de ligne.
    expect(screen.queryByText('Check-out')).toBeNull()
  })

  it('le compteur suit les cases ; les refus partent à l’import', async () => {
    await ouvrirAvecApercu()
    expect(bouton().textContent).toBe('Importer 3 documents')
    fireEvent.click(screen.getByLabelText('Importer Check-in'))
    expect(bouton().textContent).toBe('Importer 2 documents')
    expect(
      screen.getByText(/2 ajouts, 1 modification, 4 inchangés/),
    ).toBeTruthy()
    appliquer.mockResolvedValue({
      inserted: 2,
      updated: 1,
      unchanged: 2,
      skipped: 0,
      deleted: 0,
      ignores: 1,
    })
    fireEvent.click(bouton())
    await waitFor(() => expect(appliquer).toHaveBeenCalledTimes(1))
    const [id, , options] = appliquer.mock.calls[0] as [
      number,
      unknown,
      { replace: boolean; exclus: ReadonlySet<string> },
    ]
    expect(id).toBe(1)
    expect(options.replace).toBe(false)
    expect([...options.exclus]).toEqual(['document:1'])
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect((onDone.mock.calls[0][0] as { ignores: number }).ignores).toBe(1)
  })

  it('tout décoché : le bouton reste possible pour le chapitre neuf', async () => {
    await ouvrirAvecApercu()
    for (const t of ['Check-in', 'Extincteur', 'Plan du hall'])
      fireEvent.click(screen.getByLabelText(`Importer ${t}`))
    expect(bouton().textContent).toBe('Importer les chapitres')
    expect(bouton().disabled).toBe(false)
  })

  it('tout décoché sans action de chapitre : désactivé', async () => {
    await ouvrirAvecApercu(fichierLlm((f) => f.chapters.pop()))
    for (const t of ['Check-in', 'Extincteur'])
      fireEvent.click(screen.getByLabelText(`Importer ${t}`))
    expect(bouton().textContent).toBe('Importer 0 document')
    expect(bouton().disabled).toBe(true)
  })

  it('C5 : une retouche de forme annonce « version inchangée (3.1) »', async () => {
    await ouvrirAvecApercu()
    expect(screen.getByText(/version inchangée \(3\.1\)/)).toBeTruthy()
    expect(screen.queryByText(/version prévue 3\.1/)).toBeNull()
  })

  it('C3 : l’alerte d’image propose un geste possible APRÈS l’import', async () => {
    await ouvrirAvecApercu(
      fichierLlm((f) => {
        f.chapters[2].items[0].content = 'Le hall.\n\n![](24/plan.webp)\n'
      }),
    )
    fireEvent.click(screen.getByText('Plan du hall'))
    const alerte = await screen.findByText(/image sans légende/)
    expect(alerte.textContent).toContain("après l'import, ouvrez le document")
    expect(alerte.textContent).not.toContain('dans l’aperçu')
    expect(alerte.textContent).not.toContain("dans l'aperçu")
  })

  it('B8 : pendant la lecture, bouton neutre et désactivé (jamais « Importer 0 »)', async () => {
    let lacher!: () => void
    retenir = new Promise<void>((r) => {
      lacher = r
    })
    ouvrir(fichierLlm())
    await screen.findByText(/Lecture du fichier/)
    expect(bouton().textContent).toBe('Importer')
    expect(bouton().disabled).toBe(true)
    lacher()
    await waitFor(() =>
      expect(bouton().textContent).toBe('Importer 3 documents'),
    )
  })

  it('remplacement : un document supprimé AVEC son chapitre ne peut pas être refusé', async () => {
    ouvrir(fichierLlm((f) => f.chapters.splice(1, 1)))
    fireEvent.click(await screen.findByRole('switch'))
    await waitFor(() => screen.getByText(VERROU_CHAPITRE_SUPPRIME))
    const caseExt = screen.getByLabelText<HTMLInputElement>(
      'Importer Extincteur',
    )
    expect(caseExt.disabled).toBe(true)
    expect(caseExt.checked).toBe(true)
  })
})

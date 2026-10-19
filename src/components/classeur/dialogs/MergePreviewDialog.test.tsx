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
import {
  controlerPorteeClasseur,
  planifierImportIa,
} from '#/lib/classeur/merge/importIa.ts'
import type { OptionsImportIa } from '#/lib/classeur/merge/importIa.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type { OptionsFusion, PlanFusion } from '#/lib/classeur/merge/merge.ts'
import {
  chapitresDesLignes,
  construireExportChapitre,
  lignesImport,
} from '#/lib/classeur/merge/portee.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'

/*
 * Import JSON du classeur COMPLET (audit du 2026-10-04) : même aperçu que
 * le réimport d'un chapitre, groupé par chapitre. Le VRAI planificateur sur
 * un état local écrit ici ; seules la lecture de la base, la médiathèque et
 * l'écriture sont simulées. Oracles posés à la main.
 *
 * Étape 5 du plan `classeur-echange-ia-2026-10-19` : « Fichier rendu par une
 * IA » par défaut (le fichier fait foi, rien n'est supprimé sans la case),
 * « Fichier de Registre ou d'un autre poste » garde fusion et remplacement ;
 * la réponse de l'IA peut être COLLÉE.
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
const appliquerIa = vi.fn()
let retenir: Promise<void> | null = null

const apercu = (plan: PlanFusion) => ({
  plan,
  lignes: lignesImport(local, plan),
  chapitres: chapitresDesLignes(local, plan),
})

vi.mock('#/lib/classeur/merge/apply.ts', () => ({
  previsualiserFusionComplete: async (
    _id: number,
    fichier: ClasseurJson,
    options: OptionsFusion,
  ) => {
    if (retenir) await retenir
    return apercu(planifierFusion(local, fichier, options))
  },
  // Même composition que `apply.ts` (portée contrôlée, puis le plan IA).
  previsualiserImportIa: async (
    _id: number,
    fichier: ClasseurJson,
    options: OptionsImportIa,
  ) => {
    if (retenir) await retenir
    const avertissements = controlerPorteeClasseur(fichier, classeur())
    const plan = planifierImportIa(local, fichier, options)
    return apercu({
      ...plan,
      warnings: [...avertissements, ...plan.warnings],
    })
  },
  appliquerFusion: (...args: unknown[]) => appliquer(...args),
  appliquerImportIa: (...args: unknown[]) => appliquerIa(...args),
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
  return new File([texteLlm(over)], 'classeur.json', {
    type: 'application/json',
  })
}

function texteLlm(over: (f: ClasseurJson) => void = () => {}): string {
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
  return JSON.stringify(f)
}

afterEach(cleanup)
beforeEach(() => {
  appliquer.mockReset()
  appliquerIa.mockReset()
  retenir = null
})

const onDone = vi.fn()

function ouvrir(file: File | null) {
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

const choisirRegistre = () =>
  fireEvent.click(
    screen.getByLabelText("Fichier de Registre ou d'un autre poste"),
  )

async function ouvrirAvecApercu(file = fichierLlm(), registre = false) {
  ouvrir(file)
  if (registre) choisirRegistre()
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

  it('le compteur suit les cases ; les refus partent à l’import (Registre)', async () => {
    await ouvrirAvecApercu(fichierLlm(), true)
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
    choisirRegistre()
    fireEvent.click(await screen.findByRole('switch'))
    await waitFor(() => screen.getByText(VERROU_CHAPITRE_SUPPRIME))
    const caseExt = screen.getByLabelText<HTMLInputElement>(
      'Importer Extincteur',
    )
    expect(caseExt.disabled).toBe(true)
    expect(caseExt.checked).toBe(true)
  })
})

describe('MergePreviewDialog — fichier rendu par une IA (étape 5)', () => {
  /** L'IA a gardé l'`updated_at` de l'export : rien n'est « plus récent ». */
  const dateExport = (f: ClasseurJson) => {
    f.chapters[0].items[0].updated_at = '2020-01-01T00:00:00+00:00'
    f.chapters[1].items[0].updated_at = '2020-01-01T00:00:00+00:00'
  }

  it('choix par défaut : IA ; un horodatage ancien n’empêche rien', async () => {
    await ouvrirAvecApercu(fichierLlm(dateExport))
    expect(
      screen.getByLabelText<HTMLInputElement>('Fichier rendu par une IA')
        .checked,
    ).toBe(true)
    expect(bouton().textContent).toBe('Importer 3 documents')
    // Le même fichier en fusion Registre : les deux modifications, plus
    // anciennes que le local, sont ignorées (R7).
    choisirRegistre()
    await waitFor(() =>
      expect(bouton().textContent).toBe('Importer 1 document'),
    )
  })

  it('l’import part en mode IA, sans suppression par défaut', async () => {
    await ouvrirAvecApercu()
    appliquerIa.mockResolvedValue({
      inserted: 2,
      updated: 1,
      unchanged: 2,
      skipped: 0,
      deleted: 0,
      ignores: 0,
    })
    fireEvent.click(bouton())
    await waitFor(() => expect(appliquerIa).toHaveBeenCalledTimes(1))
    expect(appliquer).not.toHaveBeenCalled()
    const [id, , options] = appliquerIa.mock.calls[0] as [
      number,
      unknown,
      { supprimerAbsents: boolean; sourceName: string },
    ]
    expect(id).toBe(1)
    expect(options.supprimerAbsents).toBe(false)
    expect(options.sourceName).toBe('classeur.json')
  })

  it('un chapitre retiré par l’IA : rien supprimé, sauf case cochée', async () => {
    await ouvrirAvecApercu(fichierLlm((f) => f.chapters.splice(1, 1)))
    expect(screen.queryByText('Extincteur')).toBeNull()
    expect(screen.queryByText(/suppression/)).toBeNull()
    fireEvent.click(
      screen.getByRole('switch', {
        name: "Supprimer ce qui n'est plus dans le fichier",
      }),
    )
    await waitFor(() => screen.getByText(VERROU_CHAPITRE_SUPPRIME))
    expect(screen.getByText(/2 suppressions/)).toBeTruthy()
  })

  it('la réponse de l’IA se COLLE, même entourée de texte', async () => {
    ouvrir(null)
    expect(bouton().disabled).toBe(true)
    const bloc = '```'
    fireEvent.change(screen.getByLabelText('JSON à importer'), {
      target: {
        value: `Voici le classeur :\n${bloc}json\n${texteLlm()}\n${bloc}\nBonne journée.`,
      },
    })
    await waitFor(() => screen.getByLabelText('Importer Check-in'), {
      timeout: 3000,
    })
    expect(bouton().textContent).toBe('Importer 3 documents')
    appliquerIa.mockResolvedValue({
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      deleted: 0,
    })
    fireEvent.click(bouton())
    await waitFor(() => expect(appliquerIa).toHaveBeenCalledTimes(1))
    const options = appliquerIa.mock.calls[0][2] as { sourceName: string }
    expect(options.sourceName).toBe('Réponse collée d’une IA')
  })

  it('l’export d’un chapitre est refusé ici', async () => {
    const f = construireExportChapitre(
      classeur(),
      A,
      local.content,
      PERIODICITES,
    )
    ouvrir(new File([JSON.stringify(f)], 'chapitre.json'))
    expect(
      await screen.findByText(/export du chapitre Accueil/, undefined, {
        timeout: 3000,
      }),
    ).toBeTruthy()
    expect(bouton().disabled).toBe(true)
  })

  it('D10 : le fichier d’un autre classeur est accepté avec un avertissement', async () => {
    await ouvrirAvecApercu(
      fichierLlm((f) => {
        if (f._metadata?.portee?.type === 'classeur') {
          f._metadata.portee.classeur_uuid = 'autre-uuid'
          f._metadata.portee.classeur_name = 'Carnet sanitaire'
        }
      }),
    )
    expect(
      screen.getByText(/vient du classeur Carnet sanitaire, pas de celui-ci/),
    ).toBeTruthy()
    expect(bouton().disabled).toBe(false)
  })
})

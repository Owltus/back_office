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

import { LIBELLE_COLLER } from '#/components/classeur/dialogs/SaisieImport.tsx'
import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
} from '#/lib/classeur/merge/fixtures.ts'
import {
  destinationImport,
  planifierVers,
} from '#/lib/classeur/merge/importIa.ts'
import type { ContexteImport } from '#/lib/classeur/merge/importIa.ts'
import {
  chapitresDesLignes,
  construireExportChapitre,
  lignesImport,
} from '#/lib/classeur/merge/portee.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import { planAvecValidation } from '#/lib/classeur/merge/validationImport.ts'

/*
 * Import dans le classeur COMPLET (ligne Importer de l'accueil). Le VRAI
 * planificateur sur un état local écrit ici ; seules la lecture de la base,
 * la médiathèque et l'écriture sont simulées. Oracles posés à la main.
 *
 * Décision utilisateur du 2026-10-20 (étape 9 du plan
 * `classeur-echange-ia-2026-10-19`) : AUCUN choix à l'écran, ni provenance
 * ni case de suppression ; rien d'absent n'est supprimé ; `"supprimer":
 * true` met à la corbeille, refusable ; la portée est déduite du fichier.
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
  // Même composition que `apply.ts::planImport` (portée déduite, validation,
  // plan de la destination).
  previsualiserImport: async (
    _id: number,
    fichier: ClasseurJson,
    contexte: ContexteImport,
  ) => {
    if (retenir) await retenir
    const destination = destinationImport(local, fichier, classeur(), contexte)
    const brut = planAvecValidation(local, fichier, (f) =>
      planifierVers(local, f, destination.cible),
    )
    const plan = {
      ...brut,
      warnings: [...destination.avertissements, ...brut.warnings],
    }
    return {
      plan,
      lignes: lignesImport(local, plan),
      chapitres: chapitresDesLignes(local, plan),
      cible: destination.cible,
      note: destination.note,
    }
  },
  appliquerImport: (...args: unknown[]) => appliquer(...args),
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useInvaliderClasseur: () => () => Promise.resolve(),
}))
vi.mock('#/components/classeur/hooks/useImages.ts', () => ({
  useImages: () => ({ data: [], isPending: false }),
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const { MergePreviewDialog } =
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
  screen.getByRole<HTMLButtonElement>('button', { name: /^Importer/ })
/** Nom accessible du bouton : le libellé visible reste « Importer ». */
const nom = () => bouton().getAttribute('aria-label')
/** Les compteurs du résumé, dans l'ordre. */
const resume = () =>
  within(screen.getByRole('list', { name: 'Résumé de l’import' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent)
/** Ctrl + V dans le dialogue, aucun champ sélectionné. */
function coller(texte: string) {
  fireEvent.paste(screen.getByRole('dialog'), {
    clipboardData: { getData: () => texte, files: [] },
  })
}

async function ouvrirAvecApercu(file = fichierLlm()) {
  ouvrir(file)
  await waitFor(() => screen.getByLabelText('Importer Check-in'), {
    timeout: 3000,
  })
}

/**
 * Tout le texte affiché du document (contenu, infobulles, libellés
 * accessibles, textes d'aide des champs). Décision utilisateur du
 * 2026-10-20 : « LLM » et non « IA » dans l'interface.
 */
function textesAffiches(): string {
  const morceaux = [window.document.body.textContent]
  for (const el of window.document.querySelectorAll('*'))
    for (const a of ['aria-label', 'title', 'placeholder', 'alt'])
      morceaux.push(el.getAttribute(a) ?? '')
  return morceaux.join(' ')
}
const MOT_IA = /(?<![\p{L}\d])IA(?![\p{L}\d])/u

describe('MergePreviewDialog — LLM et non IA (2026-10-20)', () => {
  it('ni en saisie, ni avec l’aperçu, « IA » n’apparaît comme mot', async () => {
    ouvrir(null)
    expect(textesAffiches()).toContain('LLM')
    expect(textesAffiches()).not.toMatch(MOT_IA)
    cleanup()
    await ouvrirAvecApercu()
    expect(textesAffiches()).not.toMatch(MOT_IA)
  })
})

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
    expect(nom()).toBe('Importer 3 documents')
    // Libellé STABLE, le nombre en badge.
    expect(bouton().textContent).toBe('Importer3')
    expect(resume()).toEqual(['2 ajoutés', '2 modifiés', '3 inchangés'])
    fireEvent.click(screen.getByLabelText('Importer Check-in'))
    expect(nom()).toBe('Importer 2 documents')
    expect(bouton().textContent).toBe('Importer2')
    expect(resume()).toEqual([
      '2 ajoutés',
      '1 modifié',
      '3 inchangés',
      '1 non importé',
    ])
    expect(
      screen.getByText('Un point de restauration est pris avant.'),
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
    const [id, , contexte, options] = appliquer.mock.calls[0] as [
      number,
      unknown,
      ContexteImport,
      { exclus: ReadonlySet<string>; sourceName: string },
    ]
    expect(id).toBe(1)
    expect(contexte).toEqual({ type: 'classeur' })
    expect([...options.exclus]).toEqual(['document:1'])
    expect(options.sourceName).toBe('classeur.json')
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect((onDone.mock.calls[0][0] as { ignores: number }).ignores).toBe(1)
  })

  it('tout décoché : le bouton reste possible pour le chapitre neuf', async () => {
    await ouvrirAvecApercu()
    for (const t of ['Check-in', 'Extincteur', 'Plan du hall'])
      fireEvent.click(screen.getByLabelText(`Importer ${t}`))
    expect(nom()).toBe('Importer les chapitres')
    expect(bouton().disabled).toBe(false)
  })

  it('tout décoché sans action de chapitre : désactivé', async () => {
    await ouvrirAvecApercu(fichierLlm((f) => f.chapters.pop()))
    for (const t of ['Check-in', 'Extincteur'])
      fireEvent.click(screen.getByLabelText(`Importer ${t}`))
    expect(nom()).toBe('Importer')
    expect(bouton().textContent).toBe('Importer')
    expect(bouton().disabled).toBe(true)
    // La raison est dite, le point de restauration n'est plus annoncé.
    expect(screen.getByText('Rien à importer : tout est ignoré.')).toBeTruthy()
    expect(screen.queryByText(/point de restauration/)).toBeNull()
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
    // Le squelette, jamais un aperçu vide.
    await screen.findByText('Lecture en cours…')
    expect(
      screen.queryByRole('list', { name: 'Résumé de l’import' }),
    ).toBeNull()
    expect(nom()).toBe('Importer')
    expect(bouton().disabled).toBe(true)
    lacher()
    await waitFor(() => expect(nom()).toBe('Importer 3 documents'))
  })
})

describe('MergePreviewDialog — un seul comportement (décision du 2026-10-20)', () => {
  it('aucun choix ni jargon à l’écran', async () => {
    await ouvrirAvecApercu()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    const texte = window.document.body.textContent
    for (const mot of [
      'Registre',
      'JSON',
      'fusion',
      'remplacement',
      'Remplacer',
      'uuid',
      'Supprimer ce qui',
    ])
      expect(texte, mot).not.toContain(mot)
  })

  it('un horodatage ancien (recopié par l’IA) n’empêche rien', async () => {
    await ouvrirAvecApercu(
      fichierLlm((f) => {
        f.chapters[0].items[0].updated_at = '2020-01-01T00:00:00+00:00'
        f.chapters[1].items[0].updated_at = '2020-01-01T00:00:00+00:00'
      }),
    )
    expect(nom()).toBe('Importer 3 documents')
  })

  it('un chapitre ABSENT de la réponse : rien n’est supprimé', async () => {
    await ouvrirAvecApercu(fichierLlm((f) => f.chapters.splice(1, 1)))
    expect(screen.queryByText('Extincteur')).toBeNull()
    expect(screen.queryByText(/corbeille/)).toBeNull()
    expect(nom()).toBe('Importer 2 documents')
  })

  it('`"supprimer": true` : « mis à la corbeille », refusable comme le reste', async () => {
    await ouvrirAvecApercu(
      fichierLlm((f) => {
        f.chapters[0].items[1].supprimer = true
        f.chapters[1].supprimer = true
      }),
    )
    // Check-out : une ligne à case.
    const accueil = screen.getByRole('list', { name: 'Accueil' })
    expect(within(accueil).getByText('Check-out')).toBeTruthy()
    // Le chapitre Sécurité : refusable, son document le suit sans ligne.
    const caseChapitre =
      screen.getByLabelText<HTMLInputElement>('Importer Sécurité')
    expect(caseChapitre.disabled).toBe(false)
    expect(screen.queryByText('Extincteur')).toBeNull()
    expect(screen.getAllByText('mis à la corbeille')).toHaveLength(2)
    expect(resume()).toContain('2 à la corbeille')
    fireEvent.click(caseChapitre)
    appliquer.mockResolvedValue({
      inserted: 1,
      updated: 1,
      unchanged: 3,
      skipped: 0,
      deleted: 1,
      ignores: 1,
    })
    fireEvent.click(bouton())
    await waitFor(() => expect(appliquer).toHaveBeenCalledTimes(1))
    const options = appliquer.mock.calls[0][3] as {
      exclus: ReadonlySet<string>
    }
    expect([...options.exclus]).toEqual(['chapitre:20'])
  })

  it('la réponse de l’IA se COLLE, même entourée de texte', async () => {
    ouvrir(null)
    expect(bouton().disabled).toBe(true)
    const bloc = '```'
    coller(
      `Voici le classeur :\n${bloc}json\n${texteLlm()}\n${bloc}\nBonne journée.`,
    )
    await waitFor(() => screen.getByLabelText('Importer Check-in'), {
      timeout: 3000,
    })
    expect(nom()).toBe('Importer 3 documents')
    appliquer.mockResolvedValue({
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      deleted: 0,
      ignores: 0,
    })
    fireEvent.click(bouton())
    await waitFor(() => expect(appliquer).toHaveBeenCalledTimes(1))
    const options = appliquer.mock.calls[0][3] as { sourceName: string }
    expect(options.sourceName).toBe('Réponse collée d’un LLM')
  })

  it('l’export d’un chapitre de ce classeur : appliqué à ce chapitre, et dit', async () => {
    const f = construireExportChapitre(
      classeur(),
      A,
      local.content,
      PERIODICITES,
    )
    f.chapters[0].items[0].content = 'Réécrit'
    ouvrir(new File([JSON.stringify(f)], 'chapitre.json'))
    expect(
      await screen.findByText(
        'Ce fichier concerne le chapitre Accueil. Le reste du classeur ne change pas.',
        undefined,
        { timeout: 3000 },
      ),
    ).toBeTruthy()
    expect(nom()).toBe('Importer 1 document')
    expect(bouton().disabled).toBe(false)
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

describe('MergePreviewDialog — deux états (refonte du 2026-10-20)', () => {
  const resumeAbsent = () =>
    screen.queryByRole('list', { name: 'Résumé de l’import' }) === null

  it('saisie : la grande zone seule, aucun aperçu ; aperçu : ligne repliée, résumé, liste', async () => {
    ouvrir(null)
    expect(screen.getByText(LIBELLE_COLLER)).toBeTruthy()
    expect(resumeAbsent()).toBe(true)
    expect(screen.queryByText('Lecture en cours…')).toBeNull()
    expect(screen.queryByText(/point de restauration/)).toBeNull()
    coller(texteLlm())
    await waitFor(() => screen.getByLabelText('Importer Check-in'), {
      timeout: 3000,
    })
    expect(screen.getByText('Réponse collée')).toBeTruthy()
    expect(screen.queryByText(LIBELLE_COLLER)).toBeNull()
    expect(resumeAbsent()).toBe(false)
    // Changer : retour à la saisie, l'aperçu disparaît.
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }))
    expect(resumeAbsent()).toBe(true)
    expect(screen.queryByLabelText('Importer Check-in')).toBeNull()
    expect(bouton().disabled).toBe(true)
  })

  it('lecture impossible : message court, la zone revient pour réessayer', async () => {
    ouvrir(null)
    coller('Je ne peux pas faire ça.')
    expect(
      await screen.findByText(/Lecture impossible/, undefined, {
        timeout: 3000,
      }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Coller' })).toBeTruthy()
    expect(screen.queryByText('Réponse collée')).toBeNull()
    expect(bouton().disabled).toBe(true)
    coller(texteLlm())
    await waitFor(() => screen.getByLabelText('Importer Check-in'), {
      timeout: 3000,
    })
    expect(screen.queryByText(/Lecture impossible/)).toBeNull()
  })

  it('un seul avertissement : en clair, pas replié', async () => {
    await ouvrirAvecApercu(
      fichierLlm((f) => {
        if (f._metadata?.portee?.type === 'classeur') {
          f._metadata.portee.classeur_uuid = 'autre-uuid'
          f._metadata.portee.classeur_name = 'Carnet sanitaire'
        }
      }),
    )
    const w = screen.getByText(/vient du classeur Carnet sanitaire/)
    expect(w.closest('details')).toBeNull()
  })

  it('aucun mot interdit, ni tiret cadratin ni guillemets, dans les deux états', async () => {
    ouvrir(null)
    const verifier = () => {
      const texte = window.document.body.textContent
      for (const mot of ['JSON', 'fusion', 'uuid', 'Registre', '—', '«', '»'])
        expect(texte, mot).not.toContain(mot)
      // LLM et non IA (décision du 2026-10-20).
      expect(texte).not.toMatch(MOT_IA)
    }
    verifier()
    coller(texteLlm())
    await waitFor(() => screen.getByLabelText('Importer Check-in'), {
      timeout: 3000,
    })
    verifier()
  })
})

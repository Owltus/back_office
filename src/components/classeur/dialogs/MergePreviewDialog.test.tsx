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

import { MESSAGE_DEPUIS_EXPORT } from '#/components/classeur/dialogs/ApercuImport.tsx'
import { LIBELLE_COLLER } from '#/components/classeur/dialogs/SaisieImport.tsx'
import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
} from '#/lib/classeur/merge/fixtures.ts'
import { MESSAGE_CLASSEUR_COMPLET } from '#/lib/classeur/merge/changements.ts'
import type {
  ContexteImport,
  FichierChangements,
} from '#/lib/classeur/merge/changements.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'

/*
 * Import dans le classeur COMPLET (ligne Importer de l'accueil). Le VRAI
 * planificateur sur un état local écrit ici ; seules la lecture de la base,
 * la médiathèque et l'écriture sont simulées. Oracles posés à la main.
 *
 * Décision utilisateur du 2026-10-20 : AUCUN choix à l'écran. Depuis le
 * 2026-10-23, la réponse du LLM est une liste de CHANGEMENTS balisés
 * (`changements.ts`) : ce qui n'y est pas ne change pas ; une suppression
 * se refuse comme le reste ; un classeur entier est refusé avec un message.
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
/** État lu par l'aperçu (un test peut le remplacer). */
let localCourant = local
const PLUS_TARD = '2026-05-01T00:00:00+00:00'

const appliquer = vi.fn()
let retenir: Promise<void> | null = null

vi.mock('#/lib/classeur/merge/apply.ts', async (original) => {
  // L'aperçu RÉEL (`construireApercu`, pur) sur l'état local écrit ici ;
  // seules la lecture de la base et l'écriture sont simulées.
  const reel = await original<typeof import('#/lib/classeur/merge/apply.ts')>()
  return {
    previsualiserImport: async (
      _id: number,
      fichier: FichierChangements,
      contexte: ContexteImport,
    ) => {
      if (retenir) await retenir
      return reel.construireApercu(localCourant, classeur(), fichier, contexte)
    },
    appliquerImport: (...args: unknown[]) => appliquer(...args),
  }
})
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useInvaliderClasseur: () => () => Promise.resolve(),
}))
vi.mock('#/components/classeur/hooks/useImages.ts', () => ({
  useImages: () => ({ data: [], isPending: false }),
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const { MergePreviewDialog } =
  await import('#/components/classeur/dialogs/MergePreviewDialog.tsx')

/** La réponse d'un LLM, telle qu'elle arrive (JSON nu, modifiable par un test). */
interface Reponse {
  _metadata: Record<string, unknown>
  changements: Array<Record<string, unknown>>
}

/** Check-in et Extincteur réécrits, un chapitre Annexes et son document ajoutés. */
function reponseLlm(): Reponse {
  const m = construireExport(
    classeur(),
    [A, B],
    local.content,
    PERIODICITES,
  )._metadata
  return {
    _metadata: {
      portee: m?.portee,
      periodicites: m?.periodicites,
      generated_at: m?.generated_at,
    },
    changements: [
      {
        action: 'modifier',
        uuid: d1.uuid,
        content: 'Accueillir le client avec le sourire\nRemettre la clé',
      },
      {
        action: 'modifier',
        uuid: d3.uuid,
        content: 'Vérifier la **pression** chaque mois',
      },
      { action: 'ajouter', kind: 'chapitre', ref: 'annexes', label: 'Annexes' },
      {
        action: 'ajouter',
        kind: 'document',
        chapitre: 'annexes',
        title: 'Plan du hall',
        content: 'Voici le plan.\n\n![](a-inserer-pas)\n',
      },
    ],
  }
}

function fichierLlm(over: (f: Reponse) => void = () => {}): File {
  return new File([texteLlm(over)], 'reponse.json', {
    type: 'application/json',
  })
}

function texteLlm(over: (f: Reponse) => void = () => {}): string {
  const f = reponseLlm()
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
    // Un chapitre neuf se dit neuf, jamais « modifié » (2026-10-22).
    expect(within(annexes).getByText('Nouveau chapitre')).toBeTruthy()
    expect(within(annexes).queryByText('Libellé ou description')).toBeNull()
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
    expect(resume()).toEqual(['2 ajoutés', '2 modifiés'])
    fireEvent.click(screen.getByLabelText('Importer Check-in'))
    expect(nom()).toBe('Importer 2 documents')
    expect(bouton().textContent).toBe('Importer2')
    expect(resume()).toEqual(['2 ajoutés', '1 modifié', '1 non importé'])
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
    expect(options.sourceName).toBe('reponse.json')
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
    await ouvrirAvecApercu(fichierLlm((f) => f.changements.splice(2, 2)))
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
        f.changements[3].content = 'Le hall.\n\n![](24/plan.webp)\n'
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

  it('changé dans l’application depuis l’export : proposé non importé, repris d’un clic', async () => {
    // Trouvé au navigateur le 2026-10-22 : une réponse faite AVANT qu'un
    // collègue améliore Check-in effaçait cette amélioration en silence.
    localCourant = etat([A, B], {
      documents: [{ ...d1, updated_at: PLUS_TARD }, d2, d3],
    })
    await ouvrirAvecApercu(
      fichierLlm((f) => {
        f._metadata.generated_at = '2026-03-01T00:00:00Z'
      }),
    )
    localCourant = local
    expect(nom()).toBe('Importer 2 documents')
    expect(
      (screen.getByLabelText('Importer Check-in') as HTMLInputElement).checked,
    ).toBe(false)
    expect(screen.getByText(MESSAGE_DEPUIS_EXPORT)).toBeTruthy()
    expect(
      screen.getByText(/1 élément a changé dans l'application depuis l'export/),
    ).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Importer Check-in'))
    expect(nom()).toBe('Importer 3 documents')
  })

  it('ce qui n’est pas dans la liste ne change pas, et n’est pas montré', async () => {
    await ouvrirAvecApercu(fichierLlm((f) => f.changements.splice(1, 1)))
    expect(screen.queryByText('Extincteur')).toBeNull()
    expect(screen.queryByText(/corbeille/)).toBeNull()
    expect(nom()).toBe('Importer 2 documents')
  })

  it('« supprimer » : mis à la corbeille, refusable comme le reste', async () => {
    await ouvrirAvecApercu(
      fichierLlm((f) => {
        f.changements.splice(1, 1)
        f.changements.push(
          { action: 'supprimer', uuid: d2.uuid, title: 'Check-out' },
          { action: 'supprimer', uuid: B.uuid, label: 'Sécurité' },
        )
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
      inserted: 2,
      updated: 1,
      unchanged: 0,
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

  it('un déplacement vers un autre chapitre : rangé sous l’arrivée, provenance dite', async () => {
    await ouvrirAvecApercu(
      fichierLlm((f) => {
        f.changements.push({
          action: 'deplacer',
          uuid: d2.uuid,
          title: 'Check-out',
          chapitre: B.uuid,
        })
      }),
    )
    const securite = screen.getByRole('list', { name: 'Sécurité' })
    expect(within(securite).getByText('Check-out')).toBeTruthy()
    expect(within(securite).getByText('déplacé')).toBeTruthy()
    expect(within(securite).getByText(/venu du chapitre Accueil/)).toBeTruthy()
  })

  it('un changement sans action : ignoré, et dit', async () => {
    await ouvrirAvecApercu(
      fichierLlm((f) => {
        f.changements.push({ uuid: d2.uuid, content: 'Réécrit en silence' })
      }),
    )
    expect(screen.queryByText('Check-out')).toBeNull()
    expect(
      screen.getByText(/Le document Check-out : aucune action n'est indiquée/),
    ).toBeTruthy()
  })

  it('la réponse de l’IA se COLLE, même entourée de texte', async () => {
    ouvrir(null)
    expect(bouton().disabled).toBe(true)
    const bloc = '```'
    coller(
      `À MODIFIER : Check-in, Extincteur.\n${bloc}json\n${texteLlm()}\n${bloc}\nBonne journée.`,
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

  it('la réponse pour un chapitre de ce classeur : appliquée à ce chapitre, et dit', async () => {
    const reponse = {
      _metadata: {
        portee: {
          type: 'chapitre',
          chapitre_uuid: A.uuid,
          chapitre_label: 'Accueil',
        },
      },
      changements: [{ action: 'modifier', uuid: d1.uuid, content: 'Réécrit' }],
    }
    ouvrir(new File([JSON.stringify(reponse)], 'chapitre.json'))
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

  it('la réponse pour un autre classeur est refusée, et dit pourquoi', async () => {
    ouvrir(
      fichierLlm((f) => {
        f._metadata.portee = {
          type: 'classeur',
          classeur_uuid: 'autre-uuid',
          classeur_name: 'Carnet sanitaire',
        }
      }),
    )
    expect(
      await screen.findByText(
        /vient du classeur Carnet sanitaire, pas de celui-ci/,
        undefined,
        { timeout: 3000 },
      ),
    ).toBeTruthy()
    expect(bouton().disabled).toBe(true)
  })

  it('un classeur entier (sauvegarde, ancien export) est refusé, avec la voie à suivre', async () => {
    const complet = construireExport(
      classeur(),
      [A, B],
      local.content,
      PERIODICITES,
    )
    ouvrir(new File([JSON.stringify(complet)], 'classeur.json'))
    expect(
      await screen.findByText(
        MESSAGE_CLASSEUR_COMPLET,
        { exact: false },
        {
          timeout: 3000,
        },
      ),
    ).toBeTruthy()
    expect(bouton().disabled).toBe(true)
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
        f.changements.push({ uuid: d2.uuid, content: 'x' })
      }),
    )
    const w = screen.getByText(/aucune action n'est indiquée/)
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

describe('MergePreviewDialog — utilisateur pressé (navigateur, 2026-10-22)', () => {
  it('double clic puis Échap : un seul import, le dialogue reste ouvert', async () => {
    const changer = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MergePreviewDialog
          open
          onOpenChange={changer}
          classeurId={1}
          file={fichierLlm()}
        />
      </QueryClientProvider>,
    )
    await waitFor(() => screen.getByLabelText('Importer Check-in'), {
      timeout: 3000,
    })
    let finir: (v: unknown) => void = () => {}
    appliquer.mockImplementation(() => new Promise((r) => (finir = r)))
    // Trois gestes dans le même rendu : `isPending` n'est pas encore à jour.
    fireEvent.click(bouton())
    fireEvent.click(bouton())
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(appliquer).toHaveBeenCalled())
    expect(changer).not.toHaveBeenCalledWith(false)
    finir({
      inserted: 2,
      updated: 2,
      unchanged: 0,
      skipped: 0,
      deleted: 0,
      ignores: 0,
    })
    await waitFor(() => expect(changer).toHaveBeenCalledWith(false))
    expect(appliquer).toHaveBeenCalledTimes(1)
  })
})

describe('MergePreviewDialog — réponse faite avant une suppression', () => {
  afterEach(() => {
    localCourant = local
  })

  it('un élément d’un chapitre mis à la corbeille depuis : ignoré, et dit', async () => {
    localCourant = etat(
      [A, { ...B, deleted_at: '2026-06-01T00:00:00+00:00' }],
      { documents: [d1, d2, d3] },
    )
    await ouvrirAvecApercu()
    expect(screen.queryByText('Extincteur')).toBeNull()
    expect(
      screen.getByText(/Extincteur : son chapitre est à la corbeille/),
    ).toBeTruthy()
  })
})

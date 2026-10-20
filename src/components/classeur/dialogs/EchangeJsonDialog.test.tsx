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
  destinationImport,
  planifierVers,
} from '#/lib/classeur/merge/importIa.ts'
import type { ContexteImport } from '#/lib/classeur/merge/importIa.ts'
import {
  chapitresDesLignes,
  construireExportChapitre,
  construireExportDocument,
  lignesImport,
} from '#/lib/classeur/merge/portee.ts'
import type { SujetJson } from '#/components/classeur/dialogs/EchangeJsonDialog.tsx'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'

/*
 * Aperçu de l'import JSON d'un chapitre (étape 1 du plan
 * `classeur-fonctions-2026-10-04`) : le VRAI planificateur sur un état
 * local écrit ici ; seules la lecture de la base et l'écriture sont
 * simulées. Oracles : le compteur du bouton suit les cases, le bouton est
 * désactivé à 0, les clés refusées partent à l'import, le message dit
 * combien de documents ont été ignorés, le diff s'ouvre au dépliage.
 *
 * Décision du 2026-10-20 : aucune case de suppression ; la portée est
 * déduite du fichier (un autre chapitre ou document de ce classeur
 * s'applique à lui, une ligne le dit).
 */

const A = chapitre({ id: 10, label: 'Accueil' })
const d1 = document({
  id: 1,
  chapter_id: 10,
  title: 'Check-in',
  content: 'Accueillir\nRemettre la clé',
  sort_order: 1,
})
const d2 = document({
  id: 2,
  chapter_id: 10,
  title: 'Check-out',
  content: 'Rendre la clé',
  sort_order: 2,
})
const B = chapitre({ id: 20, label: 'Sécurité', sort_order: 2 })
const d3 = document({
  id: 3,
  chapter_id: 20,
  title: 'Extincteur',
  content: 'Vérifier la pression',
  sort_order: 1,
})
const local = etat([A, B], { documents: [d1, d2, d3] })
const contenuA = etat([A], { documents: [d1, d2] }).content

const appliquer = vi.fn()

vi.mock('#/lib/classeur/merge/apply.ts', () => ({
  previsualiserImport: (
    _id: number,
    fichier: ClasseurJson,
    contexte: ContexteImport,
  ) => {
    const destination = destinationImport(local, fichier, classeur(), contexte)
    const plan = planifierVers(local, fichier, destination.cible)
    return Promise.resolve({
      plan,
      lignes: lignesImport(local, plan),
      chapitres: chapitresDesLignes(local, plan),
      cible: destination.cible,
      note: destination.note,
    })
  },
  appliquerImport: (...args: unknown[]) => appliquer(...args),
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  usePeriodicites: () => ({ data: PERIODICITES }),
  useInvaliderClasseur: () => () => Promise.resolve(),
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
const telecharge = vi.fn()
vi.mock('#/lib/classeur/download.ts', () => ({
  telechargerTexte: (...args: unknown[]) => telecharge(...args),
}))

const { EchangeJsonDialog } =
  await import('#/components/classeur/dialogs/EchangeJsonDialog.tsx')
const { MESSAGE_COPIE_REFUSEE } =
  await import('#/components/classeur/hooks/useCopieExport.ts')

/** Le JSON du chapitre, les deux documents retravaillés. */
function jsonLlm(): string {
  const f = construireExportChapitre(classeur(), A, contenuA, PERIODICITES)
  f.chapters[0].items[0].content = 'Accueillir avec le sourire\nRemettre la clé'
  f.chapters[0].items[1].content = 'Rendre la clé\nDire au revoir'
  return JSON.stringify(f)
}

afterEach(cleanup)
beforeEach(() => {
  appliquer.mockReset()
})

/** Ctrl + V dans le dialogue, aucun champ sélectionné. */
function collerDansDialogue(texte: string) {
  fireEvent.paste(screen.getByRole('dialog'), {
    clipboardData: { getData: () => texte, files: [] },
  })
}

/** Les compteurs du résumé, dans l'ordre. */
const resume = () =>
  within(screen.getByRole('list', { name: 'Résumé de l’import' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent)

async function ouvrirAvecApercu() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EchangeJsonDialog
        open
        onOpenChange={() => {}}
        classeur={classeur()}
        sujet={{ type: 'chapitre', chapitre: A, contenu: contenuA }}
        canWrite
      />
    </QueryClientProvider>,
  )
  collerDansDialogue(jsonLlm())
  await waitFor(() => screen.getByLabelText('Importer Check-in'), {
    timeout: 3000,
  })
}

const bouton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: /^Importer/ })
/** Nom accessible du bouton : le libellé visible reste « Importer ». */
const nomBouton = () => bouton().getAttribute('aria-label')

describe('EchangeJsonDialog — aperçu, refus, import', () => {
  it('le compteur du bouton suit les cases ; désactivé à 0', async () => {
    await ouvrirAvecApercu()
    expect(nomBouton()).toBe('Importer 2 documents')
    expect(bouton().disabled).toBe(false)

    fireEvent.click(screen.getByLabelText('Importer Check-out'))
    expect(nomBouton()).toBe('Importer 1 document')
    // Refusé : la ligne le dit.
    expect(screen.getByText('Ignoré')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Importer Check-in'))
    expect(nomBouton()).toBe('Importer')
    expect(screen.getByText('Rien à importer : tout est ignoré.')).toBeTruthy()
    expect(bouton().disabled).toBe(true)

    fireEvent.click(screen.getByLabelText('Importer Check-out'))
    expect(nomBouton()).toBe('Importer 1 document')
    expect(bouton().disabled).toBe(false)
  })

  it('bilan replié, diff au dépliage, version prévue', async () => {
    await ouvrirAvecApercu()
    // Check-in : une ligne remplacée ; Check-out : une ligne ajoutée.
    expect(screen.getByText('+1 −1')).toBeTruthy()
    expect(screen.getByText('+1 −0')).toBeTruthy()
    expect(screen.queryByText('Accueillir avec le sourire')).toBeNull()
    const ligne = screen.getByRole('button', { name: /Check-in/ })
    expect(ligne.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(ligne)
    expect(ligne.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Accueillir avec le sourire')).toBeTruthy()
    expect(screen.getAllByText(/version prévue 1\.\d/).length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Tout déplier' }))
    expect(screen.getByText('Dire au revoir')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tout replier' }))
    expect(screen.queryByText('Dire au revoir')).toBeNull()
  })

  it('les refus partent à l’import, le message compte les ignorés', async () => {
    appliquer.mockResolvedValue({
      inserted: 0,
      updated: 1,
      unchanged: 2,
      skipped: 0,
      deleted: 0,
      ignores: 1,
    })
    await ouvrirAvecApercu()
    fireEvent.click(screen.getByLabelText('Importer Check-out'))
    fireEvent.click(bouton())
    await waitFor(() => screen.getByRole('status'))
    expect(appliquer).toHaveBeenCalledTimes(1)
    const options = appliquer.mock.calls[0][3] as { exclus: Set<string> }
    expect([...options.exclus]).toEqual(['document:2'])
    expect(screen.getByRole('status').textContent).toBe(
      'Import appliqué : 0 ajout, 1 modification. 1 document ignoré à votre demande.',
    )
  })

  it('sans refus : aucune mention d’ignoré, exclus vide', async () => {
    appliquer.mockResolvedValue({
      inserted: 0,
      updated: 2,
      unchanged: 1,
      skipped: 0,
      deleted: 0,
      ignores: 0,
    })
    await ouvrirAvecApercu()
    fireEvent.click(bouton())
    await waitFor(() => screen.getByRole('status'))
    const options = appliquer.mock.calls[0][3] as { exclus: Set<string> }
    expect(options.exclus.size).toBe(0)
    expect(screen.getByRole('status').textContent).toBe(
      'Import appliqué : 0 ajout, 2 modifications.',
    )
  })
})

describe('EchangeJsonDialog — export en un clic (étape 3, 2026-10-19)', () => {
  const ecrit = vi.fn<(t: string) => Promise<void>>()
  beforeEach(() => {
    ecrit.mockReset()
    ecrit.mockResolvedValue(undefined)
    telecharge.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: ecrit },
      configurable: true,
    })
  })

  function dialogue(open: boolean, sujet?: SujetJson) {
    return (
      <QueryClientProvider client={new QueryClient()}>
        <EchangeJsonDialog
          open={open}
          onOpenChange={() => {}}
          classeur={classeur()}
          sujet={sujet ?? { type: 'chapitre', chapitre: A, contenu: contenuA }}
          canWrite={false}
        />
      </QueryClientProvider>
    )
  }
  const copier = () =>
    fireEvent.click(screen.getByRole('button', { name: /^Copier$/ }))
  const sansDate = (t: string) => {
    const o = JSON.parse(t) as { _metadata: Record<string, unknown> }
    delete o._metadata.generated_at
    return o
  }

  it('aucune case ; une phrase ; Copier et Télécharger rendent exactement l’export du chapitre', async () => {
    render(dialogue(true))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText('Collez-le dans une IA : elle vous guide.'))
    copier()
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    const texte = ecrit.mock.calls[0][0]
    const attendu = JSON.stringify(
      construireExportChapitre(classeur(), A, contenuA, PERIODICITES),
      null,
      2,
    )
    expect(sansDate(texte)).toEqual(sansDate(attendu))
    expect('demande' in sansDate(texte)._metadata).toBe(false)
    await screen.findByRole('button', { name: /Copié/ })
    fireEvent.click(screen.getByRole('button', { name: /Télécharger/ }))
    const [nom, contenu] = telecharge.mock.calls[0] as [string, string]
    expect(nom).toBe('Registre de sécurité - Accueil.json')
    expect(sansDate(contenu)).toEqual(sansDate(texte))
  })

  it('document : l’export reste limité au document (D5)', async () => {
    render(dialogue(true, { type: 'document', chapitre: A, document: d1 }))
    copier()
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    const brut = JSON.parse(ecrit.mock.calls[0][0]) as ClasseurJson
    expect(brut.chapters).toHaveLength(1)
    expect(brut.chapters[0].items.map((i) => i.title)).toEqual(['Check-in'])
  })

  it('copie refusée : une phrase, le fichier téléchargé à la place', async () => {
    ecrit.mockRejectedValue(new Error('NotAllowedError'))
    render(dialogue(true))
    copier()
    await screen.findByText(MESSAGE_COPIE_REFUSEE)
    expect(telecharge).toHaveBeenCalledTimes(1)
    expect(telecharge.mock.calls[0][0]).toBe(
      'Registre de sécurité - Accueil.json',
    )
  })
})

describe('EchangeJsonDialog — résumé du plan (relecture adverse 2026-10-04)', () => {
  it('le résumé sous l’aperçu compte les refus', async () => {
    await ouvrirAvecApercu()
    expect(resume()).toEqual(['2 modifiés', '1 inchangé'])
    fireEvent.click(screen.getByLabelText('Importer Check-out'))
    expect(resume()).toEqual(['1 modifié', '1 inchangé', '1 non importé'])
    expect(
      screen.getByText('Un point de restauration est pris avant.'),
    ).toBeTruthy()
  })
})

describe('EchangeJsonDialog — tout refuser', () => {
  it('n’annonce plus de point de restauration', async () => {
    await ouvrirAvecApercu()
    expect(screen.getByText(/Un point de restauration/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Importer Check-out'))
    fireEvent.click(screen.getByLabelText('Importer Check-in'))
    expect(screen.queryByText(/Un point de restauration/)).toBeNull()
  })
})

describe('EchangeJsonDialog — audit du 2026-10-04 (B8, C4)', () => {
  it('B8 : sans aperçu, bouton neutre et désactivé, jamais « Importer 0 document »', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EchangeJsonDialog
          open
          onOpenChange={() => {}}
          classeur={classeur()}
          sujet={{ type: 'chapitre', chapitre: A, contenu: contenuA }}
          canWrite
        />
      </QueryClientProvider>,
    )
    expect(nomBouton()).toBe('Importer')
    expect(bouton().disabled).toBe(true)
    collerDansDialogue(jsonLlm())
    // Pendant l'attente puis la lecture : toujours neutre.
    expect(nomBouton()).toBe('Importer')
    await waitFor(() => expect(nomBouton()).toBe('Importer 2 documents'))
  })

  it('C4 : l’aperçu est amené à l’écran quand il apparaît', async () => {
    const defile = vi.fn()
    Element.prototype.scrollIntoView = defile
    try {
      await ouvrirAvecApercu()
      await waitFor(() => expect(defile).toHaveBeenCalledTimes(1))
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })
})

describe('EchangeJsonDialog — sans case, portée déduite (2026-10-20)', () => {
  function ouvrirChapitreA() {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EchangeJsonDialog
          open
          onOpenChange={() => {}}
          classeur={classeur()}
          sujet={{ type: 'chapitre', chapitre: A, contenu: contenuA }}
          canWrite
        />
      </QueryClientProvider>,
    )
  }
  const coller = (texte: string) => {
    // Changer : la zone revient, puis le collage.
    const changer = screen.queryByRole('button', { name: 'Changer' })
    if (changer) fireEvent.click(changer)
    collerDansDialogue(texte)
  }

  it('aucune case « supprimer », aucun mot technique', async () => {
    await ouvrirAvecApercu()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    // Le texte de l'écran, sans la réponse collée dans la zone de saisie.
    const copie = window.document.body.cloneNode(true) as HTMLElement
    for (const t of copie.querySelectorAll('textarea')) t.remove()
    const texte = copie.textContent
    for (const mot of ['Supprimer ce qui', 'JSON', 'LLM', 'uuid'])
      expect(texte, mot).not.toContain(mot)
  })

  it('un document absent de la réponse : gardé ; marqué « supprimer » : mis à la corbeille', async () => {
    ouvrirChapitreA()
    const f = construireExportChapitre(classeur(), A, contenuA, PERIODICITES)
    f.chapters[0].items = [f.chapters[0].items[0]]
    coller(JSON.stringify(f))
    await screen.findByText('Tout est déjà à jour.', undefined, {
      timeout: 3000,
    })
    const g = construireExportChapitre(classeur(), A, contenuA, PERIODICITES)
    g.chapters[0].items[1].supprimer = true
    coller(JSON.stringify(g))
    await waitFor(() => screen.getByLabelText('Importer Check-out'), {
      timeout: 3000,
    })
    expect(screen.getByText('mis à la corbeille')).toBeTruthy()
    expect(resume()).toContain('1 à la corbeille')
  })

  it('le fichier d’un AUTRE chapitre de ce classeur : appliqué à lui, et dit', async () => {
    ouvrirChapitreA()
    const f = construireExportChapitre(
      classeur(),
      B,
      etat([B], { documents: [d3] }).content,
      PERIODICITES,
    )
    f.chapters[0].items[0].content = 'Vérifier la pression chaque mois'
    coller(JSON.stringify(f))
    await screen.findByText(
      'Ce fichier concerne le chapitre Sécurité. Le reste du classeur ne change pas.',
      undefined,
      { timeout: 3000 },
    )
    expect(screen.getByLabelText('Importer Extincteur')).toBeTruthy()
    appliquer.mockResolvedValue({
      inserted: 0,
      updated: 1,
      unchanged: 0,
      skipped: 0,
      deleted: 0,
      ignores: 0,
    })
    fireEvent.click(bouton())
    await waitFor(() => expect(appliquer).toHaveBeenCalledTimes(1))
    // Le contexte d'origine est transmis ; la portée se redéduit à l'import.
    expect(appliquer.mock.calls[0][2]).toEqual({
      type: 'chapitre',
      chapitreId: 10,
    })
  })

  it('le fichier d’un document de ce classeur : appliqué à ce document', async () => {
    ouvrirChapitreA()
    const f = construireExportDocument(classeur(), B, d3, PERIODICITES)
    f.chapters[0].items[0].content = 'Nouveau'
    coller(JSON.stringify(f))
    await screen.findByText(
      'Ce fichier concerne le document Extincteur. Le reste du classeur ne change pas.',
      undefined,
      { timeout: 3000 },
    )
    expect(nomBouton()).toBe('Importer 1 document')
  })
})

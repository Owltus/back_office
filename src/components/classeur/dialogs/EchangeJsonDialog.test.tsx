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

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
} from '#/lib/classeur/merge/fixtures.ts'
import {
  construireExportChapitre,
  lignesImport,
  planifierFusionPortee,
} from '#/lib/classeur/merge/portee.ts'
import type { CiblePortee } from '#/lib/classeur/merge/portee.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'

/*
 * Aperçu de l'import JSON d'un chapitre (étape 1 du plan
 * `classeur-fonctions-2026-10-04`) : le VRAI planificateur sur un état
 * local écrit ici ; seules la lecture de la base et l'écriture sont
 * simulées. Oracles : le compteur du bouton suit les cases, le bouton est
 * désactivé à 0, les clés refusées partent à l'import, le message dit
 * combien de documents ont été ignorés, le diff s'ouvre au dépliage.
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
const local = etat([A], { documents: [d1, d2] })

const appliquer = vi.fn()

vi.mock('#/lib/classeur/merge/apply.ts', () => ({
  previsualiserFusionPortee: (
    _id: number,
    fichier: ClasseurJson,
    cible: CiblePortee,
    options: { supprimerAbsents: boolean },
  ) => {
    const plan = planifierFusionPortee(local, fichier, cible, options)
    return Promise.resolve({ plan, lignes: lignesImport(local, plan) })
  },
  appliquerFusionPortee: (...args: unknown[]) => appliquer(...args),
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

/** Le JSON du chapitre, les deux documents retravaillés. */
function jsonLlm(): string {
  const f = construireExportChapitre(classeur(), A, local.content, PERIODICITES)
  f.chapters[0].items[0].content = 'Accueillir avec le sourire\nRemettre la clé'
  f.chapters[0].items[1].content = 'Rendre la clé\nDire au revoir'
  return JSON.stringify(f)
}

afterEach(cleanup)
beforeEach(() => {
  appliquer.mockReset()
})

async function ouvrirAvecApercu() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EchangeJsonDialog
        open
        onOpenChange={() => {}}
        classeur={classeur()}
        sujet={{ type: 'chapitre', chapitre: A, contenu: local.content }}
        canWrite
      />
    </QueryClientProvider>,
  )
  fireEvent.change(screen.getByLabelText('JSON à réimporter'), {
    target: { value: jsonLlm() },
  })
  await waitFor(() => screen.getByLabelText('Importer Check-in'), {
    timeout: 3000,
  })
}

const bouton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: /^Importer/ })

describe('EchangeJsonDialog — aperçu, refus, import', () => {
  it('le compteur du bouton suit les cases ; désactivé à 0', async () => {
    await ouvrirAvecApercu()
    expect(bouton().textContent).toBe('Importer 2 documents')
    expect(bouton().disabled).toBe(false)

    fireEvent.click(screen.getByLabelText('Importer Check-out'))
    expect(bouton().textContent).toBe('Importer 1 document')
    // Refusé : la ligne le dit.
    expect(screen.getByText('ignoré')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Importer Check-in'))
    expect(bouton().textContent).toBe('Importer 0 document')
    expect(bouton().disabled).toBe(true)

    fireEvent.click(screen.getByLabelText('Importer Check-out'))
    expect(bouton().textContent).toBe('Importer 1 document')
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
      'Import appliqué : 0 ajout(s), 1 modification(s), 0 suppression(s). 1 document ignoré à votre demande.',
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
      'Import appliqué : 0 ajout(s), 2 modification(s), 0 suppression(s).',
    )
  })
})

describe('EchangeJsonDialog — demandes toutes prêtes (étape 3)', () => {
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

  function dialogue(open: boolean) {
    return (
      <QueryClientProvider client={new QueryClient()}>
        <EchangeJsonDialog
          open={open}
          onOpenChange={() => {}}
          classeur={classeur()}
          sujet={{ type: 'chapitre', chapitre: A, contenu: local.content }}
          canWrite={false}
        />
      </QueryClientProvider>
    )
  }
  const copier = () =>
    fireEvent.click(screen.getByRole('button', { name: /Copier le JSON/ }))
  const caseDe = (libelle: RegExp) =>
    screen.getByRole<HTMLInputElement>('checkbox', { name: libelle })

  it('rien de coché : le presse-papiers reçoit le JSON seul, sans demande', async () => {
    render(dialogue(true))
    copier()
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    const texte = ecrit.mock.calls[0][0]
    expect(texte.startsWith('{')).toBe(true)
    const brut = JSON.parse(texte) as { _metadata: Record<string, unknown> }
    expect('demande' in brut._metadata).toBe(false)
  })

  it('« Corriger » coché : le texte copié commence par la demande, le JSON la porte', async () => {
    render(dialogue(true))
    fireEvent.click(caseDe(/^Corriger/))
    copier()
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    const texte = ecrit.mock.calls[0][0]
    expect(texte.startsWith('Demande :\n- Corrige l')).toBe(true)
    const json = texte.slice(texte.indexOf('\n\n{') + 2)
    const brut = JSON.parse(json) as { _metadata: { demande?: string } }
    expect(brut._metadata.demande).toMatch(/^- Corrige l/)
    expect(texte.indexOf(brut._metadata.demande!)).toBe('Demande :\n'.length)
  })

  it('champ libre seul : recopié en tête ; le fichier téléchargé est du JSON valide qui le porte', async () => {
    const libre = 'Tutoyer "le" client \\ 😀 </script>'
    render(dialogue(true))
    fireEvent.change(screen.getByLabelText('Autre demande'), {
      target: { value: `  ${libre}  ` },
    })
    copier()
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    expect(
      ecrit.mock.calls[0][0].startsWith(`Demande :\n- ${libre}\n\n{`),
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Télécharger/ }))
    const contenu = telecharge.mock.calls[0][1] as string
    expect(contenu.startsWith('{')).toBe(true)
    expect(
      (JSON.parse(contenu) as { _metadata: { demande?: string } })._metadata
        .demande,
    ).toBe(`- ${libre}`)
  })

  it('note de version majeure seulement pour Traduire / Raccourcir', () => {
    render(dialogue(true))
    expect(screen.queryByText(/version majeure/)).toBeNull()
    fireEvent.click(caseDe(/^Corriger/))
    expect(screen.queryByText(/version majeure/)).toBeNull()
    fireEvent.click(caseDe(/^Raccourcir/))
    expect(screen.getByText(/version majeure/)).toBeTruthy()
  })

  it('rien n’est mémorisé : fermer puis rouvrir décoche tout et vide le champ', () => {
    const { rerender } = render(dialogue(true))
    fireEvent.click(caseDe(/^Traduire/))
    fireEvent.change(screen.getByLabelText('Autre demande'), {
      target: { value: 'x' },
    })
    expect(caseDe(/^Traduire/).checked).toBe(true)
    rerender(dialogue(false))
    rerender(dialogue(true))
    expect(caseDe(/^Traduire/).checked).toBe(false)
    expect(
      screen.getByLabelText<HTMLTextAreaElement>('Autre demande').value,
    ).toBe('')
  })
})

describe('EchangeJsonDialog — résumé du plan (relecture adverse 2026-10-04)', () => {
  it('le résumé sous l’aperçu compte les refus', async () => {
    await ouvrirAvecApercu()
    expect(screen.getByText(/0 ajout, 2 modifications/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Importer Check-out'))
    expect(screen.queryByText(/2 modifications/)).toBeNull()
    expect(
      screen.getByText(/^0 ajout, 1 modification, 2 inchangés. Un point/),
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
          sujet={{ type: 'chapitre', chapitre: A, contenu: local.content }}
          canWrite
        />
      </QueryClientProvider>,
    )
    expect(bouton().textContent).toBe('Importer')
    expect(bouton().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('JSON à réimporter'), {
      target: { value: jsonLlm() },
    })
    // Pendant l'attente puis la lecture : toujours neutre.
    expect(bouton().textContent).toBe('Importer')
    await waitFor(() =>
      expect(bouton().textContent).toBe('Importer 2 documents'),
    )
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

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { FileText } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

import type {
  ChapterItem,
  DbChapter,
  DbClasseur,
} from '#/lib/classeur/types.ts'

/*
 * Transfert vers un autre classeur — interface (étape 7c). Services
 * simulés : la base n'est JAMAIS touchée. Oracles écrits à la main :
 *   - le dialogue et le menu ne proposent QUE les classeurs où l'on peut
 *     écrire (règle `niveauEffectif`), jamais le classeur courant ;
 *   - la mutation reçoit exactement la demande attendue ;
 *   - attente, erreur (via `messageErreur`), absence de cible ;
 *   - menu et bouton de carte ne démarrent ni glisser ni navigation ;
 *   - sans droit d'écriture, la carte n'a pas d'entrée « Déplacer vers… ».
 */

const USER = 'u-moi'
const ORIGINE = 5

const classeur = (
  id: number,
  name: string,
  acces_tous: DbClasseur['acces_tous'],
  created_by: string | null = 'u-autre',
  deleted_at: string | null = null,
): DbClasseur => ({
  id,
  uuid: `c${String(id)}`,
  name,
  icon: 'Book',
  etablissement: '',
  etablissement_complement: '',
  sort_order: id,
  deleted_at,
  created_at: '',
  updated_at: '',
  created_by,
  acces_tous,
})

let classeurs: DbClasseur[] = []
const fetchClasseurs = vi.fn(() => Promise.resolve(classeurs))
const fetchMesAcces = vi.fn(() =>
  Promise.resolve([
    // Exception qui OUVRE l'écriture sur un classeur « lecture pour tous ».
    { id: 1, classeur_id: 9, user_id: USER, niveau: 'ecriture' },
    // Exception qui la RETIRE sur un classeur « écriture pour tous ».
    { id: 2, classeur_id: 10, user_id: USER, niveau: 'lecture' },
  ]),
)
const chapitre = (id: number, classeur_id: number, label: string) =>
  ({ id, classeur_id, label }) as DbChapter
const fetchChapters = vi.fn((id: number) =>
  Promise.resolve(
    id === 6
      ? [chapitre(61, 6, 'Procédures'), chapitre(62, 6, 'Annexes')]
      : id === 9
        ? []
        : [],
  ),
)
const transfererItems = vi.fn()

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/auth/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: USER },
    // Écriture sur la page Classeur, pas gestion.
    can: (_page: string, niveau: string) => niveau !== 'gestion',
  }),
}))
vi.mock('#/lib/classeur/service.ts', () => ({
  fetchClasseurs: () => fetchClasseurs(),
  fetchMesAcces: () => fetchMesAcces(),
  fetchChapters: (id: number) => fetchChapters(id),
}))
vi.mock('#/lib/classeur/transfertExecution.ts', () => ({
  transfererItems: (d: unknown) => transfererItems(d),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

const { TransfertDialog, messageTransfert, resumeTransfert } =
  await import('#/components/classeur/dialogs/TransfertDialog.tsx')
const { MenuDeplacerVers, AUCUNE_CIBLE } =
  await import('#/components/classeur/MenuDeplacerVers.tsx')
const { ItemCardShell } =
  await import('#/components/classeur/cards/ItemCardShell.tsx')
const { TooltipProvider } = await import('#/components/ui/tooltip.tsx')

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const UUID_AUTRE = '33333333-3333-4333-8333-333333333333'

const elements = [
  {
    kind: 'document',
    data: {
      id: 11,
      title: 'Doc',
      deleted_at: null,
      // Deux images de l'origine (A deux fois), une d'un autre classeur, un
      // emplacement vide : 2 images à copier.
      content: [
        `![a](${String(ORIGINE)}/${UUID_A}.webp)`,
        `![a encore](${String(ORIGINE)}/${UUID_A}.webp "petite")`,
        `![b](${String(ORIGINE)}/${UUID_B}.webp)`,
        `![autre](7/${UUID_AUTRE}.webp)`,
        '![vide](a-inserer)',
      ].join('\n\n'),
    },
  },
  {
    kind: 'intercalaire',
    data: { id: 12, title: 'Inter', description: '', deleted_at: null },
  },
] as unknown as ChapterItem[]

function avecClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}

function ouvrirDialogue() {
  const onTransfere = vi.fn()
  const onOpenChange = vi.fn()
  render(
    avecClient(
      <TransfertDialog
        open
        onOpenChange={onOpenChange}
        origineId={ORIGINE}
        elements={elements}
        niveauOrigine="ecriture"
        onTransfere={onTransfere}
      />,
    ),
  )
  return { onTransfere, onOpenChange }
}

async function choisirArrivee() {
  fireEvent.click(await screen.findByRole('radio', { name: 'Arrivée' }))
  fireEvent.click(await screen.findByRole('radio', { name: 'Annexes' }))
}

beforeEach(() => {
  classeurs = [
    classeur(ORIGINE, 'Courant', 'ecriture', USER),
    classeur(6, 'Arrivée', 'ecriture'),
    classeur(7, 'Lecture seule', 'lecture'),
    classeur(8, 'Privé', 'aucun'),
    classeur(9, 'Ouvert à moi', 'lecture'),
    classeur(10, 'Fermé à moi', 'ecriture'),
    classeur(11, 'Mon privé', 'aucun', USER),
  ]
  fetchClasseurs.mockClear()
  fetchChapters.mockClear()
  transfererItems.mockReset()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TransfertDialog', () => {
  it('ne propose QUE les classeurs où l’on peut écrire, jamais le courant', async () => {
    ouvrirDialogue()
    await screen.findByRole('radio', { name: 'Arrivée' })
    const noms = screen
      .getAllByRole('radio')
      .map((r) => r.closest('label')?.textContent)
      .filter((t) => t !== 'Déplacer' && t !== 'Copier')
    expect(noms).toEqual(['Arrivée', 'Ouvert à moi', 'Mon privé'])
  })

  it('chapitres lus à la sélection du classeur, pas avant', async () => {
    ouvrirDialogue()
    await screen.findByRole('radio', { name: 'Arrivée' })
    expect(fetchChapters).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'Arrivée' }))
    await screen.findByRole('radio', { name: 'Procédures' })
    expect(fetchChapters).toHaveBeenCalledWith(6)
  })

  it('résumé : éléments, images à copier, classeur et chapitre', async () => {
    ouvrirDialogue()
    await choisirArrivee()
    expect(screen.getByTestId('resume-transfert').textContent).toBe(
      '2 éléments · 2 images seront copiées dans « Arrivée », chapitre « Annexes ».',
    )
    // L'historique suit un document déplacé (D8).
    expect(screen.getByText(/historique des versions suit/)).toBeTruthy()
  })

  it('bouton grisé tant que classeur et chapitre ne sont pas choisis', async () => {
    ouvrirDialogue()
    const bouton = screen.getByRole('button', { name: 'Déplacer' })
    expect(bouton).toHaveProperty('disabled', true)
    fireEvent.click(await screen.findByRole('radio', { name: 'Arrivée' }))
    await screen.findByRole('radio', { name: 'Annexes' })
    expect(bouton).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('radio', { name: 'Annexes' }))
    expect(bouton).toHaveProperty('disabled', false)
  })

  it('Copier : la mutation reçoit exactement la demande, puis succès', async () => {
    const resultat = {
      mode: 'copier',
      deplaces: 0,
      copies: 2,
      imagesCopiees: 2,
      introuvables: [],
    }
    transfererItems.mockResolvedValue(resultat)
    const { onTransfere, onOpenChange } = ouvrirDialogue()
    await choisirArrivee()
    fireEvent.click(screen.getByRole('radio', { name: 'Copier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copier' }))
    await waitFor(() => expect(onTransfere).toHaveBeenCalled())
    expect(transfererItems).toHaveBeenCalledTimes(1)
    expect(transfererItems).toHaveBeenCalledWith({
      mode: 'copier',
      elements: [
        { kind: 'document', id: 11 },
        { kind: 'intercalaire', id: 12 },
      ],
      origine: ORIGINE,
      arrivee: 6,
      chapitreArrivee: 62,
      niveaux: { origine: 'ecriture', arrivee: 'ecriture' },
    })
    expect(onTransfere.mock.calls[0][0]).toMatchObject({
      resultat,
      classeur: { id: 6 },
      chapitre: { id: 62 },
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('Déplacer par défaut ; en cours : libellé et bouton désactivé', async () => {
    transfererItems.mockReturnValue(new Promise(() => {}))
    ouvrirDialogue()
    await choisirArrivee()
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }))
    const enCours = await screen.findByRole('button', { name: 'Déplacement…' })
    expect(enCours).toHaveProperty('disabled', true)
    expect(transfererItems.mock.calls[0][0]).toMatchObject({ mode: 'deplacer' })
  })

  it('erreur affichée dans le dialogue, lisible (jamais le message brut)', async () => {
    transfererItems.mockRejectedValue({
      code: '42501',
      message: 'new row violates row-level security policy for table x',
    })
    const { onTransfere } = ouvrirDialogue()
    await choisirArrivee()
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }))
    expect(await screen.findByText(/Modification refusée/)).toBeTruthy()
    expect(screen.queryByText(/row-level security/)).toBeNull()
    expect(onTransfere).not.toHaveBeenCalled()
  })

  it('aucune cible : phrase claire, pas de liste', async () => {
    classeurs = [classeur(ORIGINE, 'Courant', 'ecriture', USER)]
    ouvrirDialogue()
    expect(await screen.findByText(`${AUCUNE_CIBLE}.`)).toBeTruthy()
  })

  it('classeur sans chapitre : le dit, bouton grisé', async () => {
    ouvrirDialogue()
    fireEvent.click(await screen.findByRole('radio', { name: 'Ouvert à moi' }))
    expect(await screen.findByText(/aucun chapitre/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Déplacer' })).toHaveProperty(
      'disabled',
      true,
    )
  })
})

describe('textes', () => {
  it('résumé : singulier, pluriel, zéro, inconnu', () => {
    expect(resumeTransfert(1, 1, 'X')).toBe(
      '1 élément · 1 image sera copiée dans « X »',
    )
    expect(resumeTransfert(3, 0, 'X')).toBe(
      '3 éléments · aucune image à copier dans « X »',
    )
    expect(resumeTransfert(2, null, 'X')).toBe(
      '2 éléments · les images utilisées seront copiées dans « X »',
    )
  })
  it('confirmation : mode, images copiées, introuvables', () => {
    const base = {
      classeur: classeur(6, 'Arrivée', 'ecriture'),
      chapitre: chapitre(62, 6, 'Annexes'),
    }
    expect(
      messageTransfert({
        ...base,
        resultat: {
          mode: 'deplacer',
          deplaces: 3,
          copies: 0,
          imagesCopiees: 2,
          introuvables: ['5/x.webp', '5/y.webp'],
        },
      }),
    ).toBe(
      '3 éléments déplacés vers « Arrivée », chapitre « Annexes » (2 images copiées). 2 images introuvables n’ont pas été copiées.',
    )
    expect(
      messageTransfert({
        ...base,
        resultat: {
          mode: 'copier',
          deplaces: 0,
          copies: 1,
          imagesCopiees: 0,
          introuvables: [],
        },
      }),
    ).toBe('1 élément copié vers « Arrivée », chapitre « Annexes ».')
  })
})

describe('MenuDeplacerVers', () => {
  function monterMenu() {
    const onChapitre = vi.fn()
    const onAutreClasseur = vi.fn()
    const parent = {
      mouseDown: vi.fn(),
      touchStart: vi.fn(),
      click: vi.fn(),
      keyDown: vi.fn(),
    }
    render(
      avecClient(
        <div
          onMouseDown={parent.mouseDown}
          onTouchStart={parent.touchStart}
          onClick={parent.click}
          onKeyDown={parent.keyDown}
        >
          <MenuDeplacerVers
            origineId={ORIGINE}
            autresChapitres={[chapitre(51, ORIGINE, 'Voisin')]}
            onChapitre={onChapitre}
            onAutreClasseur={onAutreClasseur}
          >
            <button type="button">Déplacer vers</button>
          </MenuDeplacerVers>
        </div>,
      ),
    )
    return { onChapitre, onAutreClasseur, parent }
  }
  const ouvrirMenu = () =>
    fireEvent.keyDown(screen.getByRole('button', { name: 'Déplacer vers' }), {
      key: 'Enter',
    })

  it('ne lit la liste des classeurs qu’à l’ouverture', async () => {
    monterMenu()
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchClasseurs).not.toHaveBeenCalled()
    ouvrirMenu()
    await waitFor(() => expect(fetchClasseurs).toHaveBeenCalled())
  })

  it('chapitres du classeur puis « Vers un autre classeur… »', async () => {
    const { onChapitre, onAutreClasseur } = monterMenu()
    ouvrirMenu()
    const autre = await screen.findByRole('menuitem', {
      name: 'Vers un autre classeur…',
    })
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Voisin',
      'Vers un autre classeur…',
    ])
    fireEvent.click(autre)
    expect(onAutreClasseur).toHaveBeenCalled()
    ouvrirMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Voisin' }))
    expect(onChapitre).toHaveBeenCalledWith(51)
  })

  it('sans cible : entrée grisée avec sa raison', async () => {
    classeurs = [
      classeur(ORIGINE, 'Courant', 'ecriture', USER),
      classeur(7, 'Lecture seule', 'lecture'),
    ]
    const { onAutreClasseur } = monterMenu()
    ouvrirMenu()
    const entree = await screen.findByRole('menuitem', {
      name: /^Vers un autre classeur…/,
    })
    await waitFor(() => expect(entree.textContent).toContain(AUCUNE_CIBLE))
    expect(entree.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(entree)
    expect(onAutreClasseur).not.toHaveBeenCalled()
  })

  it('le contenu du menu ne démarre ni glisser ni clic de carte', async () => {
    const { parent } = monterMenu()
    ouvrirMenu()
    const item = await screen.findByRole('menuitem', { name: 'Voisin' })
    parent.keyDown.mockClear()
    fireEvent.mouseDown(item)
    fireEvent.touchStart(item)
    fireEvent.keyDown(item, { key: 'ArrowDown' })
    fireEvent.click(item)
    expect(parent.mouseDown).not.toHaveBeenCalled()
    expect(parent.touchStart).not.toHaveBeenCalled()
    expect(parent.keyDown).not.toHaveBeenCalled()
    expect(parent.click).not.toHaveBeenCalled()
  })
})

describe('carte d’un élément', () => {
  function carte(canWrite: boolean) {
    const onCarte = { mouseDown: vi.fn(), click: vi.fn() }
    render(
      avecClient(
        <div onMouseDown={onCarte.mouseDown} onClick={onCarte.click}>
          <ItemCardShell
            kind="document"
            id={11}
            title="Doc"
            icon={FileText}
            classeurId={ORIGINE}
            chapterId={50}
            canWrite={canWrite}
            menuDeplacer={
              <MenuDeplacerVers
                origineId={ORIGINE}
                autresChapitres={[]}
                onChapitre={() => {}}
                onAutreClasseur={() => {}}
              >
                <button
                  type="button"
                  aria-label="Déplacer vers un autre chapitre ou classeur"
                />
              </MenuDeplacerVers>
            }
          >
            <p>miniature</p>
          </ItemCardShell>
        </div>,
      ),
    )
    return onCarte
  }

  it('sans droit d’écriture : aucune entrée « Déplacer vers… »', () => {
    carte(false)
    expect(
      screen.queryByRole('button', {
        name: 'Déplacer vers un autre chapitre ou classeur',
      }),
    ).toBeNull()
  })

  it('avec le droit : le bouton ne démarre ni glisser ni page de détail', async () => {
    const onCarte = carte(true)
    const bouton = screen.getByRole('button', {
      name: 'Déplacer vers un autre chapitre ou classeur',
    })
    fireEvent.mouseDown(bouton)
    fireEvent.click(bouton)
    expect(onCarte.mouseDown).not.toHaveBeenCalled()
    expect(onCarte.click).not.toHaveBeenCalled()
    fireEvent.keyDown(bouton, { key: 'Enter' })
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Vers un autre classeur…')).toBeTruthy()
  })
})

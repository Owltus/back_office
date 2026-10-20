// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'

/*
 * Carte « Corbeille » de l'accueil (étape 6, D16) : visible avec le droit
 * d'ÉCRITURE sur le classeur, masquée sinon — et aucune lecture de la
 * corbeille au premier rendu (base Nano : sans compteur).
 */

const droits = vi.hoisted(() => ({
  canWrite: true,
  canManage: false,
  pret: true,
  isError: false,
  error: null,
}))
const droitsPage = vi.hoisted(() => ({ page: 'ecriture' }))
const service = vi.hoisted(() => ({ fetchCorbeille: vi.fn() }))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({
  softDeleteClasseur: vi.fn(),
  fetchCorbeille: service.fetchCorbeille,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: unknown }) => children,
  useNavigate: () => vi.fn(),
}))
vi.mock('#/components/classeur/ChapterDrawer.tsx', () => ({
  ChapterDrawerButton: () => null,
}))
vi.mock('#/components/classeur/dialogs/AccesClasseurDialog.tsx', () => ({
  AccesClasseurDialog: () => null,
}))
vi.mock('#/components/classeur/dialogs/ChapterDialog.tsx', () => ({
  ChapterDialog: () => null,
}))
vi.mock('#/components/classeur/dialogs/ClasseurDialog.tsx', () => ({
  ClasseurDialog: () => null,
}))
vi.mock('#/components/classeur/hooks/useDroitsClasseur.ts', () => ({
  useDroitsClasseur: () => droits,
  useDroitsPageClasseur: () => droitsPage,
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useClasseur: () => ({
    data: {
      id: 24,
      name: 'Essai',
      icon: 'BookOpen',
      etablissement: '',
      etablissement_complement: '',
      acces_tous: 'lecture',
    },
    isPending: false,
    isError: false,
  }),
  useChapters: () => ({ data: [], isPending: false, isError: false }),
  useClasseurContent: () => ({
    data: {
      chapters: [],
      content: {
        documents: [],
        tracking_sheets: [],
        signature_sheets: [],
        intercalaires: [],
      },
    },
    isPending: false,
    isError: false,
  }),
  useInvaliderClasseur: () => vi.fn(),
}))

const { ClasseurDashboard } =
  await import('#/components/classeur/ClasseurDashboard.tsx')

function monter(onCorbeille = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ClasseurDashboard
          classeurId={24}
          onHistorique={() => {}}
          onCorbeille={onCorbeille}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return onCorbeille
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  Object.assign(droits, {
    canWrite: true,
    pret: true,
    isError: false,
    error: null,
  })
  droitsPage.page = 'ecriture'
})

describe('ClasseurDashboard — carte Corbeille', () => {
  it('visible avec l’écriture, juste après les points de restauration', () => {
    droits.canWrite = true
    const ouvrir = monter()
    const carte = screen.getByRole('button', { name: /Corbeille/ })
    const historique = screen.getByRole('button', {
      name: /Points de restauration/,
    })
    expect(historique.nextElementSibling).toBe(carte)
    fireEvent.click(carte)
    expect(ouvrir).toHaveBeenCalledTimes(1)
    // Sans compteur : aucune lecture de la corbeille au premier rendu.
    expect(service.fetchCorbeille).not.toHaveBeenCalled()
  })

  it('masquée sans droit d’écriture', () => {
    droits.canWrite = false
    monter()
    expect(screen.queryByRole('button', { name: /Corbeille/ })).toBeNull()
    expect(
      screen.getByRole('button', { name: /Points de restauration/ }),
    ).toBeTruthy()
  })
})

/*
 * Audit du 2026-10-04 : les trois cartes d'écriture (Nouveau chapitre,
 * Importer, Corbeille) n'arrivent qu'avec les droits du classeur, lus APRÈS
 * le premier rendu. Leur place est réservée en silhouette pour qui peut
 * écrire sur la page (sinon la colonne grandissait de deux cartes), jamais
 * pour un lecteur de la page, et jamais une fois les droits connus.
 */
describe('ClasseurDashboard — places des cartes d’écriture', () => {
  function monterComplet() {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <ClasseurDashboard
            classeurId={24}
            onHistorique={() => {}}
            onCorbeille={() => {}}
            onExporterJson={() => {}}
            onImporter={() => {}}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    )
    return container.querySelectorAll('[data-ligne-squelette]').length
  }

  it('droits en lecture, page en écriture : trois places réservées', () => {
    Object.assign(droits, { canWrite: false, pret: false })
    expect(monterComplet()).toBe(3)
    expect(screen.queryByRole('button', { name: /Corbeille/ })).toBeNull()
  })

  it('lecteur de la page : rien de réservé, même avant les droits', () => {
    Object.assign(droits, { canWrite: false, pret: false })
    droitsPage.page = 'lecture'
    expect(monterComplet()).toBe(0)
  })

  it('droits connus : les vraies cartes, ou rien', () => {
    expect(monterComplet()).toBe(0)
    expect(screen.getByRole('button', { name: /Corbeille/ })).toBeTruthy()
    cleanup()
    Object.assign(droits, { canWrite: false, pret: true })
    expect(monterComplet()).toBe(0)
    expect(
      screen.queryByRole('button', { name: /Nouveau chapitre/ }),
    ).toBeNull()
  })

  it('exceptions illisibles : le dit, sans place réservée', () => {
    Object.assign(droits, {
      canWrite: false,
      pret: false,
      isError: true,
      error: new Error('Failed to fetch'),
    })
    expect(monterComplet()).toBe(0)
    expect(
      screen.getByText(/Droits indisponibles, modifications désactivées/),
    ).toBeTruthy()
  })
})

/*
 * Disposition du 2026-10-04 (décision utilisateur) : en-tête FIXE hors de
 * la zone qui défile (comme un chapitre), puis UN panneau en liste en quatre
 * sections, en-tête et panneau sur la même largeur. La silhouette
 * `FormeClasseurDashboard` doit suivre CE DOM, section par section.
 */
describe('ClasseurDashboard — en-tête fixe et panneau', () => {
  function monterTout() {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <ClasseurDashboard
            classeurId={24}
            onSommaire={() => {}}
            onExporterPdf={() => {}}
            onExporterMarkdown={() => {}}
            onExporterJson={() => {}}
            onImporter={() => {}}
            onFichierDepose={() => {}}
            onHistorique={() => {}}
            onImages={() => {}}
            onCorbeille={() => {}}
            messages={<p>Fusion terminée</p>}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    )
    return container
  }

  function groupes(container: HTMLElement) {
    return Array.from(container.querySelectorAll('[data-section-actions]')).map(
      (g) => ({
        titre: g.querySelector('h2')?.textContent,
        cartes: Array.from(g.querySelectorAll('button')).map((b) =>
          b.textContent.trim(),
        ),
        reservees: g.querySelectorAll('[data-ligne-squelette]').length,
      }),
    )
  }

  it('en-tête (titre, recherche, boutons) hors de la zone qui défile ; messages dans la zone', () => {
    const container = monterTout()
    const entete = container.querySelector('[data-page-en-tete]')
    const zone = container.querySelector('[data-page-zone]')
    expect(entete).not.toBeNull()
    expect(zone).not.toBeNull()
    const recherche = screen.getByRole('searchbox', {
      name: 'Rechercher dans le classeur',
    })
    expect(entete?.contains(recherche)).toBe(true)
    expect(zone?.contains(recherche)).toBe(false)
    expect(entete?.textContent).toContain('Essai')
    const modifier = screen.getByRole('button', {
      name: 'Modifier le classeur',
    })
    expect(entete?.contains(modifier)).toBe(true)
    expect(zone?.contains(screen.getByText('Fusion terminée'))).toBe(true)
    // Toutes les lignes sont dans la zone, aucune dans l'en-tête.
    expect(entete?.querySelector('[data-section-actions]')).toBeNull()
    expect(zone?.querySelectorAll('[data-section-actions]').length).toBe(4)
  })

  it('UN panneau, sous les messages, aligné sur l’en-tête ; lignes de même hauteur', () => {
    const container = monterTout()
    const panneaux = container.querySelectorAll('[data-accueil-panneau]')
    expect(panneaux.length).toBe(1)
    const panneau = panneaux[0]
    // Les quatre sections sont les enfants directs du panneau (un trait
    // plein entre deux), dans une carte.
    expect(
      Array.from(panneau.children).every((s) =>
        s.hasAttribute('data-section-actions'),
      ),
    ).toBe(true)
    // 2026-10-05 : un espace entre les sections, une carte par section.
    expect(panneau.className).toContain('gap-6')
    expect(panneau.className).not.toContain('rounded-xl')
    for (const s of Array.from(panneau.children)) {
      expect(s.lastElementChild?.className).toContain('rounded-xl')
      expect(s.lastElementChild?.className).toContain('border')
    }
    // Alertes au-dessus du panneau, dans la même colonne.
    const message = screen.getByText('Fusion terminée')
    expect(message.parentElement).toBe(panneau.parentElement)
    expect(
      message.compareDocumentPosition(panneau) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // Même largeur pour l'en-tête et le panneau : bords alignés.
    const colEntete = container.querySelector('[data-page-en-tete] > div')
    expect(colEntete?.className).toContain('max-w-3xl')
    expect(panneau.parentElement?.className).toContain('max-w-3xl')
    // Toutes les lignes ont la même hauteur, description sur une ligne.
    const lignes = Array.from(
      panneau.querySelectorAll<HTMLElement>('[data-ligne-action]'),
    )
    expect(lignes.length).toBe(9)
    for (const l of lignes) {
      expect(l.className).toMatch(/(^| )h-14( |$)/)
      const d = l.querySelector('[data-testid="ligne-action-description"]')
      expect(d?.className).toContain('truncate')
      // Descriptions COURTES : elles tiennent sans troncature.
      expect(d?.textContent.length).toBeLessThanOrEqual(52)
    }
    // Plus de phrase d'aide sous les intitulés : la section n'a que son
    // titre et ses lignes.
    for (const s of panneau.children) {
      expect(s.children.length).toBe(2)
    }
  })

  it('dépôt d’un fichier sur Importer : la ligne l’annonce', () => {
    monterTout()
    const ligne = screen.getByRole('button', { name: /^Importer/ })
    fireEvent.dragOver(ligne, { dataTransfer: { types: ['Files'] } })
    expect(ligne.textContent).toContain('Déposez le fichier ici')
    expect(ligne.className).toContain('bg-primary/10')
    fireEvent.dragLeave(ligne)
    expect(ligne.textContent).toContain("Réponse d'un LLM ou fichier")
  })

  it('écriture : quatre sections, neuf lignes, comme la silhouette', () => {
    const container = monterTout()
    expect(groupes(container)).toEqual([
      {
        titre: 'Contenu',
        cartes: [
          expect.stringContaining('Nouveau chapitre'),
          expect.stringContaining('Images du classeur'),
        ],
        reservees: 0,
      },
      {
        titre: 'Imprimer',
        cartes: [
          expect.stringContaining('Classeur complet'),
          expect.stringContaining('Sommaire'),
        ],
        reservees: 0,
      },
      {
        titre: 'Échanger et sauvegarder',
        cartes: [
          expect.stringMatching(/Exporter en JSON.*À coller dans un LLM/),
          expect.stringMatching(/^Importer.*Réponse d'un LLM ou fichier/),
          expect.stringContaining('Exporter en Markdown'),
        ],
        reservees: 0,
      },
      {
        titre: 'Historique et sécurité',
        cartes: [
          expect.stringContaining('Points de restauration'),
          expect.stringContaining('Corbeille'),
        ],
        reservees: 0,
      },
    ])
  })

  it('lecteur : ni Nouveau chapitre, ni Importer, ni Corbeille', () => {
    Object.assign(droits, { canWrite: false, pret: true })
    const container = monterTout()
    const g = groupes(container)
    expect(g.map((x) => x.cartes.length)).toEqual([1, 2, 2, 1])
    const tout = g.flatMap((x) => x.cartes).join(' | ')
    expect(tout).not.toMatch(/Nouveau chapitre|Importer|Corbeille/)
    expect(
      screen.queryByRole('button', { name: 'Modifier le classeur' }),
    ).toBeNull()
  })

  it('droits pas encore lus : les places réservées tombent dans LEUR section', () => {
    Object.assign(droits, { canWrite: false, pret: false })
    const container = monterTout()
    expect(groupes(container).map((x) => x.reservees)).toEqual([1, 0, 1, 1])
    expect(
      groupes(container).map((x) => x.cartes.length + x.reservees),
    ).toEqual([2, 2, 3, 2])
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import type * as ModPlanning from '#/components/planning/hooks/usePlanning.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import {
  ECOLE_VEILLE_FIN,
  NUITS_AFFILEES_MAX,
  REPOS_CONFORT,
  REPOS_QUOTIDIEN,
  SEMAINE_MAX,
} from '#/lib/planning/regles.ts'
import { heuresLisibles } from '#/lib/planning/temps.ts'

/*
 * Aide du planning (bouton « ? », 2026-11-02) : toutes les parties du sommaire sont rendues, les
 * cases montrent les vraies cartes de la grille, les chiffres viennent de
 * `regles.ts`, et le texte respecte les règles d'écriture de l'app (jamais
 * le mot IA, ni guillemets français, ni tiret cadratin).
 */

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...p }: { children: React.ReactNode }) => (
    <a {...p}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock(
  '#/components/planning/hooks/usePlanning.ts',
  async (importOriginal) => ({
    ...(await importOriginal<typeof ModPlanning>()),
    useDroitsPlanning: () => ({
      pret: true,
      lire: true,
      ecrire: false,
      gerer: false,
    }),
    useAujourdhui: () => '2026-11-02',
    useReferentiel: () => ({ data: hotelDemo('2026-11-02').referentiel }),
  }),
)

const { AidePlanningContenu, SECTIONS_FONCTIONNEMENT } =
  await import('#/components/planning/AidePlanningContenu.tsx')

afterEach(cleanup)

function rendre() {
  return render(
    <TooltipProvider>
      <AidePlanningContenu gestes={['Clic : modifier le jour']} />
    </TooltipProvider>,
  )
}

describe('AidePlanningContenu (aide du bouton ?)', () => {
  it('commence par les gestes de la vue ouverte', () => {
    rendre()
    const g = screen.getByRole('region', { name: 'Les gestes' })
    expect(g.textContent).toContain('Clic : modifier le jour')
  })

  it('rend chaque partie du sommaire, avec son lien', () => {
    rendre()
    const sommaire = screen.getByRole('navigation', { name: 'Sommaire' })
    for (const s of SECTIONS_FONCTIONNEMENT) {
      expect(
        screen.getByRole('heading', { level: 2, name: s.titre }),
      ).toBeTruthy()
      const lien = within(sommaire).getByRole('link', { name: s.titre })
      expect(lien.getAttribute('href')).toBe(`#fonctionnement-${s.id}`)
      expect(document.getElementById(`fonctionnement-${s.id}`)).toBeTruthy()
    }
  })

  it('explique tous les statuts d’une case, avec les vraies cartes', () => {
    const { container } = rendre()
    const cases = document.getElementById('fonctionnement-cases')!
    for (const nom of [
      'Shift proposé',
      'Shift validé',
      'Semaine verrouillée',
      'Journée étoile',
      'Repos de la semaine type',
      'Repos proposé',
      'Repos posé',
      'Repos sur un jour de congé',
      'Absence',
      'Jour férié rattrapé (JFR)',
      'École',
      'Hors contrat',
      'Non attribué',
    ])
      expect(within(cases).getAllByText(nom).length).toBeGreaterThan(0)
    // Pointillés d'une proposition, plein d'un validé, étoile : les cartes
    // de la grille elles-mêmes.
    expect(
      container.querySelector('.planning-carte[data-proposition]'),
    ).toBeTruthy()
    expect(
      container.querySelector('.planning-carte:not([data-proposition])'),
    ).toBeTruthy()
    expect(container.querySelector('.planning-etoile-badge')).toBeTruthy()
    expect(
      container.querySelector('.planning-statut[data-proposition]'),
    ).toBeTruthy()
  })

  it('cite les chiffres de la loi depuis regles.ts', () => {
    rendre()
    const loi = document.getElementById('fonctionnement-loi')!
    expect(loi.textContent).toContain(
      `Au moins ${heuresLisibles(REPOS_QUOTIDIEN)}`,
    )
    expect(loi.textContent).toContain(`Au plus ${heuresLisibles(SEMAINE_MAX)}`)
  })

  it('décrit le jour férié rattrapé', () => {
    rendre()
    const feries = document.getElementById('fonctionnement-feries')!
    expect(feries.textContent).toContain('11 jours fériés')
    expect(feries.textContent).toContain('JFR')
    expect(feries.textContent).toContain('il reste dû')
    expect(feries.textContent).toContain('direction au forfait jours')
    expect(feries.textContent).toContain('Date d’entrée vide')
  })

  it('décrit le bien-être de l’équipe et sa place dans le calcul', () => {
    rendre()
    const bien = document.getElementById('fonctionnement-bien-etre')!
    const t = bien.textContent
    expect(t).toContain('Ce n’est pas parce que l’on peut que l’on doit')
    expect(t).toContain(`Au moins ${heuresLisibles(REPOS_CONFORT)}`)
    expect(t).toContain('week-end complet libre')
    expect(t).toContain(`Pas plus de ${NUITS_AFFILEES_MAX} nuits`)
    expect(t).toContain(`${heuresLisibles(ECOLE_VEILLE_FIN)} la veille`)
    expect(t).toContain('retour en douceur')
    expect(t).toContain('Pas encore appliqué')
    // L'ordre du calcul (Q1 du PRD) : les heures dues, puis le bien-être,
    // puis le confort.
    const ordre = document.getElementById('fonctionnement-generation')!
    const items = [...ordre.querySelectorAll('ol > li')].map(
      (li) => li.textContent,
    )
    const rang = (mot: string) => items.findIndex((x) => x.startsWith(mot))
    expect(rang('Les contrats')).toBeLessThan(rang('Le bien-être'))
    // Les heures avant la fatigue (décision utilisateur du 2026-11-04).
    expect(rang('Les contrats')).toBeLessThan(rang('La fatigue'))
    expect(rang('Le bien-être')).toBeLessThan(rang('Le confort'))
  })

  it('respecte les règles d’écriture de l’app', () => {
    const { container } = rendre()
    const texte = container.textContent ?? ''
    expect(texte).not.toMatch(/\bIA\b/)
    expect(texte).not.toMatch(/[«»—]/)
  })

  it('page en lecture seule : aucun champ ni bouton d’écriture', () => {
    rendre()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
  })
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'

/*
 * Écran Équipe contre un service simulé. Oracles : la liste range le staff
 * par catégorie avec ses puces ; en lecture, aucun geste d'écriture actif ;
 * en gestion, les catégories se rangent, se suppriment (confirmation) et
 * restreindre leurs postes prévient avant de retirer des compétences.
 */

const etat = vi.hoisted(() => ({
  niveau: 'gestion',
}))
const service = vi.hoisted(() => ({
  enregistrerGroupe: vi.fn(async () => 1),
  ordonnerGroupes: vi.fn(async () => {}),
  supprimerGroupe: vi.fn(async () => {}),
}))

const demo = hotelDemo('2026-11-02')
// Une personne partie, une désactivée, une qui arrive : leurs puces.
demo.referentiel.salaries[2].date_sortie = '2020-01-31'
demo.referentiel.salaries[3].actif = false
demo.referentiel.salaries[4].date_entree = '2099-03-01'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/planning/solveur.ts', () => ({ resoudre: vi.fn() }))
vi.mock('#/components/auth/AuthContext.tsx', () => ({
  useAuth: () => ({
    permsResolved: true,
    can: (_page: string, min: string) => {
      const rang: Record<string, number> = {
        lecture: 1,
        ecriture: 2,
        gestion: 3,
      }
      return rang[etat.niveau] >= rang[min]
    },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...p }: { children: React.ReactNode }) => (
    <a {...p}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock('#/lib/planning/service.ts', () => ({
  fetchReferentiel: async () => structuredClone(demo.referentiel),
  fetchAbsencesSalarie: async () => [],
  fetchSemaine: vi.fn(),
  fetchEtatSemaine: vi.fn(),
  appliquerGeneration: vi.fn(),
  enregistrerSalarie: vi.fn(),
  poserAbsences: vi.fn(),
  supprimerSalarie: vi.fn(),
  enregistrerGroupe: (...a: unknown[]) =>
    service.enregistrerGroupe(...(a as [])),
  ordonnerGroupes: (...a: unknown[]) => service.ordonnerGroupes(...(a as [])),
  supprimerGroupe: (...a: unknown[]) => service.supprimerGroupe(...(a as [])),
}))

const { EquipePage } =
  await import('#/components/planning/parametres/EquipePage.tsx')
const { Enveloppe, preparerJsdom } =
  await import('#/components/planning/parametres/equipe/testOutils.tsx')

preparerJsdom()
afterEach(cleanup)
beforeEach(() => {
  etat.niveau = 'gestion'
  vi.clearAllMocks()
})

async function ouvrirCategories() {
  await screen.findByRole('region', { name: 'Hôteliers' })
  fireEvent.click(screen.getByRole('button', { name: /Groupes/ }))
}

const rendre = () =>
  render(
    <Enveloppe>
      <EquipePage />
    </Enveloppe>,
  )

describe('EquipePage', () => {
  it('range le staff par catégorie, avec contrats et départs', async () => {
    rendre()
    const hoteliers = await screen.findByRole('region', { name: 'Hôteliers' })
    // Parti ou désactivé : rangé dans « Anciens membres », replié en bas.
    expect(
      within(hoteliers).queryByRole('button', { name: /Lucas Petit/ }),
    ).toBeNull()
    expect(
      screen.getByText(/10 membres dans l'équipe · 2 anciens/),
    ).toBeTruthy()
    fireEvent.click(screen.getByText('Anciens membres'))
    // Ordre des catégories : Direction, Hôteliers, Apprentis, Stagiaires.
    const titres = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.firstChild?.textContent)
    expect(titres).toEqual([
      'Direction',
      'Hôteliers',
      'Apprentis',
      'Stagiaires',
    ])
    const ligne = (nom: RegExp) =>
      screen.getByRole('button', { name: nom }).closest('tr')!
    const lucas = ligne(/Lucas Petit/)
    expect(lucas.getAttribute('data-parti')).toBe('true')
    expect(lucas.textContent).toContain('Parti(e) le 31/01/2020')
    expect(ligne(/Nadia Haddad/).textContent).toContain('Désactivé')
    expect(ligne(/Emma Durand/).textContent).toContain('Arrive le 01/03/2099')
    expect(ligne(/Claire Martin/).textContent).toContain('Forfait jours')
    expect(ligne(/Léa Fontaine/).textContent).toContain('Stagiaire')
  })

  it('en lecture : Ajouter grisé, catégories en lecture seule', async () => {
    etat.niveau = 'lecture'
    rendre()
    await screen.findByRole('region', { name: 'Hôteliers' })
    expect(
      screen.getByRole('button', { name: /Ajouter/ }).hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Groupes/ }))
    expect(
      await screen.findByRole('heading', { name: "Groupes de l'équipe" }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /Supprimer Direction/ }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Ajouter un groupe/ }),
    ).toBeNull()
    expect(
      screen.getByLabelText('Nom du groupe Direction').hasAttribute('disabled'),
    ).toBe(true)
    // Ouvrir une fiche reste possible.
    fireEvent.click(screen.getByRole('button', { name: 'Terminé' }))
    fireEvent.click(
      screen.getByRole('button', { name: /Ouvrir la fiche de Karim Benali/ }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Karim Benali' }),
    ).toBeTruthy()
  })

  it('gestion : descendre une catégorie renumérote l ordre', async () => {
    rendre()
    await ouvrirCategories()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Descendre Direction' }),
    )
    await waitFor(() =>
      expect(service.ordonnerGroupes).toHaveBeenCalledWith([2, 1, 3, 4]),
    )
  })

  it('gestion : supprimer une catégorie passe par une confirmation', async () => {
    rendre()
    await ouvrirCategories()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Supprimer Apprentis' }),
    )
    expect(
      await screen.findByText(/Ses 2 membres passent sans groupe/),
    ).toBeTruthy()
    expect(service.supprimerGroupe).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(service.supprimerGroupe).toHaveBeenCalledWith(3))
  })

  it('gestion : retirer un poste à une catégorie prévient des compétences perdues', async () => {
    rendre()
    await ouvrirCategories()
    const postes = await screen.findByLabelText(
      'Postes autorisés pour Hôteliers',
    )
    // Hôteliers : Réception, Club, Veille de nuit. Retirer la veille de nuit.
    fireEvent.click(
      within(postes).getByRole('button', { name: /Veille de nuit/ }),
    )
    expect(
      await screen.findByText(/2 personnes de ce groupe perdent 2 compétences/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restreindre' }))
    await waitFor(() =>
      expect(service.enregistrerGroupe).toHaveBeenCalledWith(
        { nom: 'Hôteliers', ordre: 1, postes_autorises: [2, 3] },
        2,
      ),
    )
  })

  it('gestion : ajouter une catégorie la crée en dernier', async () => {
    rendre()
    await ouvrirCategories()
    fireEvent.click(
      await screen.findByRole('button', { name: /Ajouter un groupe/ }),
    )
    await waitFor(() =>
      expect(service.enregistrerGroupe).toHaveBeenCalledWith(
        { nom: 'Nouveau groupe', ordre: 4, postes_autorises: [] },
        null,
      ),
    )
  })
})

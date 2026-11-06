// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'

import type { Referentiel } from '#/lib/planning/types.ts'

/*
 * Tiroir « Règles des contrats » (page Équipe) et section « Moments » (page
 * Horaires) contre un service simulé : lecture seule sans aucun geste
 * d'écriture ; un réglage changé n'envoie que lui, après Enregistrer ;
 * l'aperçu des moments liste les horaires qui changent avant l'envoi.
 */

const etat = vi.hoisted(() => ({
  droits: { pret: true, lire: true, ecrire: true, gerer: true },
}))
const service = vi.hoisted(() => ({
  enregistrerReglages: vi.fn(),
  enregistrerModeleContrat: vi.fn(),
  ajouterModeleContrat: vi.fn(),
  supprimerModeleContrat: vi.fn(),
  enregistrerMomentsHoraires: vi.fn(),
  enregistrerMoments: vi.fn(),
  supprimerMoment: vi.fn(),
}))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/planning/service.ts', () => service)
vi.mock('#/components/planning/hooks/usePlanning.ts', async () => {
  const { messageErreur } = await import('#/lib/planning/erreurs.ts')
  return {
    useDroitsPlanning: () => etat.droits,
    useEcriture:
      () => async (action: () => Promise<unknown>, echec?: string) => {
        try {
          await action()
          return { ok: true }
        } catch (err) {
          return { ok: false, message: messageErreur(err, echec) }
        }
      },
  }
})

const { ReglesContrats } =
  await import('#/components/planning/parametres/equipe/ReglesContrats.tsx')
const { SectionMoments } =
  await import('#/components/planning/parametres/reglages/SectionMoments.tsx')
const { monter, referentielDemo } =
  await import('#/components/planning/parametres/reglages/test/monter.tsx')

let ref: Referentiel
beforeEach(() => {
  ref = referentielDemo()
  etat.droits = { pret: true, lire: true, ecrire: true, gerer: true }
  service.enregistrerReglages.mockReset().mockResolvedValue(undefined)
  service.enregistrerModeleContrat.mockReset().mockResolvedValue(undefined)
  service.enregistrerMomentsHoraires.mockReset().mockResolvedValue(undefined)
  service.enregistrerMoments.mockReset().mockResolvedValue(undefined)
  service.supprimerMoment.mockReset().mockResolvedValue(undefined)
  service.ajouterModeleContrat.mockReset().mockResolvedValue(undefined)
  service.supprimerModeleContrat.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

const tiroir = () =>
  monter(<ReglesContrats ouvert onFermer={() => {}} referentiel={ref} />)

describe('Règles des contrats', () => {
  it('lecture seule : tout se lit, rien ne s’écrit', () => {
    etat.droits = { pret: true, lire: true, ecrire: true, gerer: false }
    tiroir()
    expect(screen.getByText('Lecture seule')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    expect(
      screen.getByRole('radio', { name: 'Souhaité' }).hasAttribute('disabled'),
    ).toBe(true)
    expect(screen.getByRole('region', { name: 'La loi' })).toBeTruthy()
    // Jamais le nombre de veilleurs : le tableau de l'accueil le dit.
    expect(screen.queryByText(/personnes la nuit/i)).toBeNull()
  })

  it('deux repos souhaités : seul ce réglage part, aucun type de contrat', async () => {
    tiroir()
    const enregistrer = screen.getByRole('button', { name: 'Enregistrer' })
    expect(enregistrer.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Souhaité' }))
    expect(
      screen.getByText(/peut les séparer s'il manque du monde/),
    ).toBeTruthy()
    fireEvent.click(enregistrer)
    await waitFor(() =>
      expect(service.enregistrerReglages).toHaveBeenCalledTimes(1),
    )
    const envoye = service.enregistrerReglages.mock.calls[0][0]
    expect(envoye.deux_repos_de_suite).toBe('souhaite')
    expect(envoye.jours_affiles_max).toBe(6)
    expect(envoye).not.toHaveProperty('personnes_nuit')
    expect(envoye).not.toHaveProperty('releve_minutes')
    expect(service.enregistrerModeleContrat).not.toHaveBeenCalled()
  })

  it('un type de contrat changé est envoyé seul', async () => {
    tiroir()
    fireEvent.click(screen.getByRole('radio', { name: 'Extra' }))
    fireEvent.click(screen.getByRole('switch', { name: /Journée étoile/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(service.enregistrerModeleContrat).toHaveBeenCalledTimes(1),
    )
    expect(service.enregistrerModeleContrat.mock.calls[0][0]).toMatchObject({
      type_contrat: 'extra',
      journee_etoile: true,
    })
  })
})

describe('Types de contrat de l’établissement (2026-11-06)', () => {
  it('créer « Saisonnier » posé à la main, puis l’enregistrer', async () => {
    tiroir()
    fireEvent.click(screen.getByRole('button', { name: /Nouveau contrat/ }))
    const nom = screen.getByRole('textbox', { name: 'Nom du contrat' })
    expect((nom as HTMLInputElement).value).toBe('Nouveau contrat')
    fireEvent.change(nom, { target: { value: 'Saisonnier' } })
    fireEvent.click(
      screen.getByRole('switch', { name: /Posé à la main seulement/ }),
    )
    expect(screen.getByRole('radio', { name: 'Saisonnier' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(service.ajouterModeleContrat).toHaveBeenCalledTimes(1),
    )
    expect(service.ajouterModeleContrat.mock.calls[0][0]).toMatchObject({
      type_contrat: 'contrat_1',
      nom: 'Saisonnier',
      placement_manuel: true,
      ordre: 5,
    })
    expect(service.enregistrerModeleContrat).not.toHaveBeenCalled()
    expect(service.supprimerModeleContrat).not.toHaveBeenCalled()
  })

  it('renommer un contrat n’envoie que lui', async () => {
    tiroir()
    fireEvent.click(screen.getByRole('radio', { name: 'CDD' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nom du contrat' }), {
      target: { value: 'Contrat court' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(service.enregistrerModeleContrat).toHaveBeenCalledTimes(1),
    )
    expect(service.enregistrerModeleContrat.mock.calls[0][0]).toMatchObject({
      type_contrat: 'cdd',
      nom: 'Contrat court',
    })
  })

  it('un contrat utilisé ne se retire pas ; un contrat libre, si', async () => {
    tiroir()
    // Le jeu d'essai a des CDI : le bouton est grisé.
    expect(
      screen
        .getByRole('button', { name: /Retirer ce contrat/ })
        .hasAttribute('disabled'),
    ).toBe(true)
    // Sans aucun CDD : il se retire.
    ref.salaries = ref.salaries.filter((x) => x.type_contrat !== 'cdd')
    cleanup()
    tiroir()
    fireEvent.click(screen.getByRole('radio', { name: 'CDD' }))
    fireEvent.click(screen.getByRole('button', { name: /Retirer ce contrat/ }))
    expect(screen.queryByRole('radio', { name: 'CDD' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(service.supprimerModeleContrat).toHaveBeenCalledWith('cdd'),
    )
  })

  it('deux contrats ne portent pas le même nom', () => {
    tiroir()
    fireEvent.click(screen.getByRole('radio', { name: 'CDD' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nom du contrat' }), {
      target: { value: 'cdi' },
    })
    expect(
      screen.getByText(/deux contrats ne portent pas le même nom/),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Enregistrer' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('jours fériés : ancienneté réglée, la phrase la suit', () => {
    tiroir()
    expect(
      screen.getAllByText(/Après 1 an, un jour férié travaillé/).length,
    ).toBeGreaterThan(0)
    fireEvent.click(
      screen.getByRole('button', {
        name: /Ancienneté qui ouvre le rattrapage, en mois : un de plus/,
      }),
    )
    expect(
      screen.getAllByText(/Après 13 mois, un jour férié travaillé/).length,
    ).toBeGreaterThan(0)
  })
})

describe('Règles des contrats : relecture adverse du 2026-11-05', () => {
  it('1. « Heures indicatives » n’est offert qu’au contrat posé à la main', () => {
    tiroir()
    // CDI par défaut : la case n'est pas là.
    expect(
      screen.queryByRole('switch', { name: /Heures indicatives/ }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Extra' }))
    expect(
      screen.getByRole('switch', { name: /Heures indicatives/ }),
    ).toBeTruthy()
  })

  it('8. second temps en échec : l’écran le dit et garde la saisie', async () => {
    service.enregistrerModeleContrat.mockRejectedValue(new Error('panne'))
    tiroir()
    fireEvent.click(screen.getByRole('radio', { name: 'Souhaité' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Extra' }))
    fireEvent.click(screen.getByRole('switch', { name: /Journée étoile/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toMatch(/types de contrat/)
    expect(alerte.textContent).toMatch(/mais pas tous/)
    // Le brouillon reste : la saisie est encore là, Enregistrer encore actif.
    expect(
      screen
        .getByRole('switch', { name: /Journée étoile/ })
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: 'Enregistrer' })
        .hasAttribute('disabled'),
    ).toBe(false)
  })
})

describe('Moments', () => {
  it('aperçu avant l’envoi, puis moments et moments des horaires', async () => {
    monter(<SectionMoments referentiel={ref} modifiable />)
    const champ = screen.getByRole('textbox', { name: 'Nuit commence de' })
    fireEvent.change(champ, { target: { value: '23:30' } })
    fireEvent.blur(champ)
    const liste = await screen.findByRole('list', {
      name: 'Horaires qui changeraient de moment',
    })
    expect(liste.textContent).toMatch(/Nuit/)
    expect(service.enregistrerMoments).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(service.enregistrerMomentsHoraires).toHaveBeenCalledTimes(1),
    )
    expect(service.enregistrerMoments.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'nuit', debut_de: 23 * 60 + 30 }),
    ])
    expect(service.enregistrerReglages).not.toHaveBeenCalled()
    expect(
      service.enregistrerMomentsHoraires.mock.calls[0][0].length,
    ).toBeGreaterThan(0)
  })

  it('créer un moment, puis l’enregistrer', async () => {
    monter(<SectionMoments referentiel={ref} modifiable />)
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Nom du nouveau moment' }),
      { target: { value: 'Midi' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(screen.getByRole('listitem', { name: 'Midi' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(service.enregistrerMoments).toHaveBeenCalledTimes(1),
    )
    expect(service.enregistrerMoments.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'midi', nom: 'Midi' }),
    ])
  })

  it('lecture seule : pas de bouton, champs grisés', () => {
    monter(<SectionMoments referentiel={ref} modifiable={false} />)
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    expect(
      screen
        .getByRole('textbox', { name: 'Nuit commence de' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })
})

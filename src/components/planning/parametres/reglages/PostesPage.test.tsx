// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

import type { Referentiel } from '#/lib/planning/types.ts'

/*
 * Postes contre un service simulé. Vérifié : lecture seule sans aucun geste
 * d'écriture ; codes horaires possibles et poste à part envoyés à
 * Enregistrer ; durée maximale de la catégorie affichée ; un refus de la
 * base à la suppression s'affiche en clair.
 */

const etat = vi.hoisted(() => ({
  droits: { pret: true, lire: true, ecrire: true, gerer: true },
  referentiel: null as Referentiel | null,
}))
const service = vi.hoisted(() => ({
  enregistrerPoste: vi.fn(),
  supprimerPoste: vi.fn(),
}))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/planning/service.ts', () => service)
vi.mock('#/components/planning/EnTeteParametres.tsx', () => ({
  MenuParametres: () => null,
  RetourPlanning: () => null,
}))
vi.mock('#/components/planning/hooks/usePlanning.ts', async () => {
  const { messageErreur } = await import('#/lib/planning/erreurs.ts')
  return {
    useDroitsPlanning: () => etat.droits,
    useReferentiel: () => ({
      data: etat.referentiel,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    }),
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

const { PostesPage } =
  await import('#/components/planning/parametres/PostesPage.tsx')
const { monter, referentielDemo } =
  await import('#/components/planning/parametres/reglages/test/monter.tsx')

beforeEach(() => {
  etat.referentiel = referentielDemo()
  etat.droits = { pret: true, lire: true, ecrire: true, gerer: true }
  service.enregistrerPoste.mockReset().mockResolvedValue(2)
  service.supprimerPoste.mockReset()
})
afterEach(cleanup)

const carte = (nom: string) =>
  within(screen.getByRole('region', { name: `Poste ${nom}` }))

describe('Postes', () => {
  it('en lecture : tout se lit, rien ne se modifie', () => {
    etat.droits = { pret: true, lire: true, ecrire: false, gerer: false }
    monter(<PostesPage />)
    expect(screen.getByText(/Lecture seule/)).toBeTruthy()
    for (const champ of screen.getAllByRole('textbox')) {
      expect((champ as HTMLInputElement).disabled).toBe(true)
    }
    for (const b of screen.getAllByRole('button')) {
      expect((b as HTMLButtonElement).disabled).toBe(true)
    }
    for (const s of screen.getAllByRole('switch'))
      expect((s as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.queryByRole('button', { name: /Nouveau|Supprimer|Enregistrer/ }),
    ).toBeNull()
  })

  it('montre la durée maximale de la catégorie et les chiffres du poste', () => {
    monter(<PostesPage />)
    const r = carte('Réception')
    expect(
      r.getByText('Un service dure au plus 12h sur ce poste (convention HCR).'),
    ).toBeTruthy()
    expect(
      r.getByText('Seuls ces horaires sont proposés pour ce poste.'),
    ).toBeTruthy()
  })

  it('codes horaires et poste à part envoyés à Enregistrer', async () => {
    monter(<PostesPage />)
    const r = carte('Réception')
    fireEvent.click(r.getByRole('button', { name: 'N Nuit' }))
    fireEvent.click(r.getByRole('switch', { name: 'Poste à part' }))
    expect(service.enregistrerPoste).not.toHaveBeenCalled()
    fireEvent.click(r.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(service.enregistrerPoste).toHaveBeenCalledWith(
        {
          nom: 'Réception',
          categorie: 'reception',
          couleur: '#000000',
          horaires_autorises: [1, 2, 3, 4],
          a_part: true,
        },
        2,
      ),
    )
  })

  it('refuse un nom vide', () => {
    monter(<PostesPage />)
    const r = carte('Club')
    fireEvent.change(r.getByLabelText('Nom du poste'), {
      target: { value: '  ' },
    })
    expect(r.getByText('Donnez un nom au poste.')).toBeTruthy()
    expect(
      r.getByRole<HTMLButtonElement>('button', { name: 'Enregistrer' })
        .disabled,
    ).toBe(true)
  })

  it('montre le refus de la base à la suppression', async () => {
    service.supprimerPoste.mockRejectedValue({
      code: 'PL409',
      message:
        'Le poste Club figure dans des plannings réalisés : il ne peut plus être supprimé.',
    })
    monter(<PostesPage />)
    fireEvent.click(carte('Club').getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(service.supprimerPoste).toHaveBeenCalledWith(3))
    expect(
      await screen.findByText(/figure dans des plannings réalisés/),
    ).toBeTruthy()
  })
})

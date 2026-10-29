// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GroupeARanger } from '#/lib/planning/donneesARanger.ts'
import type { Poste } from '#/lib/planning/types.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const { SectionDonneesARanger, dateLisible } =
  await import('#/components/planning/parametres/DonneesARanger.tsx')

afterEach(cleanup)

const POSTE = { id: 10, nom: 'Réception' } as Poste

function groupe(p: Partial<GroupeARanger>): GroupeARanger {
  return {
    id: 'rattacher:10:1',
    sorte: 'rattacher',
    poste: POSTE,
    shifts: [
      {
        id: 1,
        lundi: '2026-09-14',
        salarie_id: 7,
        poste_id: 10,
        jour: 2,
        horaire_id: null,
        debut: '07:00',
        fin: '15:00',
        pause: 30,
      },
    ],
    verrouilles: [],
    texte: 'Texte du groupe.',
    action: 'Rattacher au code M',
    correction: {
      type: 'code',
      horaireId: 1,
      debut: '07:00',
      fin: '15:00',
      pause: 30,
    },
    lien: { page: '/planning/horaires', cible: 'horaire-1' },
    ...p,
  }
}

function rendre(
  groupes: GroupeARanger[] | null,
  p: Partial<Parameters<typeof SectionDonneesARanger>[0]> = {},
) {
  const props = {
    groupes,
    depuis: '2026-04-27',
    salaries: [{ id: 7, prenom: 'Alpha', nom: 'Un' }],
    isPending: false,
    isError: false,
    peutCorriger: true,
    onAller: vi.fn(),
    onCorriger: vi.fn(async () => null),
    ...p,
  }
  render(<SectionDonneesARanger {...props} />)
  return props
}

describe('SectionDonneesARanger', () => {
  it('dit simplement ce qui est montré', () => {
    rendre([])
    expect(
      screen.getByText(
        'Les shifts déjà posés depuis le 27/04/2026 qui ne suivent plus les réglages.',
      ),
    ).toBeTruthy()
  })

  it('cinq groupes, puis « N de plus » qui montre le reste', () => {
    rendre(
      Array.from({ length: 16 }, (_, i) =>
        groupe({ id: `g${i}`, texte: `Groupe ${i}.` }),
      ),
    )
    expect(screen.getAllByText(/^Groupe \d+\.$/)).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: '11 de plus' }))
    expect(screen.getAllByText(/^Groupe \d+\.$/)).toHaveLength(16)
    expect(screen.queryByRole('button', { name: /de plus/ })).toBeNull()
  })

  it('cinq groupes ou moins : pas de bouton', () => {
    rendre(
      Array.from({ length: 5 }, (_, i) =>
        groupe({ id: `g${i}`, texte: `Groupe ${i}.` }),
      ),
    )
    expect(screen.queryByRole('button', { name: /de plus/ })).toBeNull()
  })

  it('dit la plage relue, et rien pendant la lecture', () => {
    rendre(null, { isPending: true })
    expect(screen.getByText(/depuis le 27\/04\/2026/)).toBeTruthy()
    expect(screen.getByText(/Lecture des shifts/)).toBeTruthy()
    expect(screen.queryByText(/Aucun shift/)).toBeNull()
  })

  it('dit quand rien ne contredit les réglages', () => {
    rendre([])
    expect(
      screen.getByText('Aucun shift ne contredit les réglages.'),
    ).toBeTruthy()
  })

  it('rien ne s’écrit sans Confirmer, après l’aperçu des dates', async () => {
    const props = rendre([groupe({})])
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher au code M' }))
    expect(props.onCorriger).not.toHaveBeenCalled()
    expect(screen.getByText(/1 shift sera modifié/)).toBeTruthy()
    expect(
      screen.getByText(/mer\. 16\/09\/26 · Alpha · 07:00 - 15:00/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(props.onCorriger).toHaveBeenCalledTimes(1))
    expect(vi.mocked(props.onCorriger).mock.calls[0][0].id).toBe(
      'rattacher:10:1',
    )
  })

  it('Annuler referme l’aperçu sans écrire', () => {
    const props = rendre([groupe({})])
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher au code M' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(props.onCorriger).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull()
  })

  it('montre l’échec de l’écriture', async () => {
    rendre([groupe({})], {
      onCorriger: vi.fn(async () => 'Correction impossible : refus.'),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher au code M' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(
      await screen.findByText('Correction impossible : refus.'),
    ).toBeTruthy()
  })

  it('un groupe seulement signalé n’a pas de bouton de correction', () => {
    rendre([groupe({ action: null, correction: null })])
    expect(screen.queryByRole('button', { name: /Rattacher/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Voir le réglage/ })).toBeTruthy()
  })

  it('sans droit d’écriture, le bouton est grisé', () => {
    rendre([groupe({})], { peutCorriger: false })
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Rattacher au code M',
      }).disabled,
    ).toBe(true)
  })
})

describe('dateLisible', () => {
  it('jour abrégé et date', () => {
    expect(dateLisible('2026-10-29')).toBe('jeu. 29/10/26')
  })
})

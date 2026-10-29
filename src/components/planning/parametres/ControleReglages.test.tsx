// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PointReglage } from '#/lib/planning/coherence.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const { PanneauControle, VISIBLES_PAR_GROUPE } =
  await import('#/components/planning/parametres/ControleReglages.tsx')
const { idCible } =
  await import('#/components/planning/parametres/reglages/ouvrirCible.ts')

afterEach(cleanup)

function point(
  i: number,
  ecran: PointReglage['ecran'],
  gravite: PointReglage['gravite'] = 'a-voir',
): PointReglage {
  return {
    id: `${ecran}:${i}`,
    gravite,
    ecran,
    texte: `Point ${ecran} ${i}`,
    lien: { page: `/planning/${ecran}`, cible: `poste-${i}` },
  }
}

describe('PanneauControle', () => {
  it('dit quand tout est cohérent', () => {
    render(<PanneauControle points={[]} onAller={vi.fn()} />)
    expect(screen.getByText(/Rien à vérifier/)).toBeTruthy()
  })

  it('groupe par écran, bloquants en tête, 5 visibles puis « N de plus »', () => {
    const points = [
      ...Array.from({ length: 8 }, (_, i) => point(i, 'equipe')),
      point(0, 'horaires'),
      point(9, 'besoins', 'bloquant'),
    ]
    render(<PanneauControle points={points} onAller={vi.fn()} />)
    const sections = screen.getAllByRole('region')
    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Besoins',
      'Horaires',
      'Équipe',
    ])
    expect(within(sections[0]).getByText('Bloquant.')).toBeTruthy()
    const equipe = sections[2]
    expect(within(equipe).getAllByRole('listitem')).toHaveLength(
      VISIBLES_PAR_GROUPE,
    )
    fireEvent.click(within(equipe).getByRole('button', { name: '3 de plus' }))
    expect(within(equipe).getAllByRole('listitem')).toHaveLength(8)
    expect(within(equipe).queryByText(/de plus/)).toBeNull()
  })

  it('le bouton Corriger mène au réglage du point', () => {
    const onAller = vi.fn()
    render(<PanneauControle points={[point(4, 'postes')]} onAller={onAller} />)
    fireEvent.click(screen.getByRole('button', { name: /Corriger/ }))
    expect(onAller).toHaveBeenCalledWith({
      page: '/planning/postes',
      cible: 'poste-4',
    })
  })
})

describe('idCible', () => {
  it('lit le type et l’id, et rien d’autre', () => {
    expect(idCible('poste-12', 'poste')).toBe(12)
    expect(idCible('poste-12', 'salarie')).toBeUndefined()
    expect(idCible('presence', 'poste')).toBeUndefined()
    expect(idCible(undefined, 'poste')).toBeUndefined()
  })
})

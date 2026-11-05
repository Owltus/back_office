import { describe, expect, it } from 'vitest'

import {
  phrasesOrdreDecision,
  postesParImportance,
} from '#/components/planning/parametres/besoins/ordreDecision.ts'
import type { Poste } from '#/lib/planning/types.ts'

/*
 * Oracle : D11 du 2026-11-05, « quand il manque du monde, Si possible reste
 * vide en premier » ; le texte de la page Besoins suit les réglages, jamais
 * de poids en chiffres, ni tiret cadratin ni guillemets.
 */

const poste = (id: number, nom: string, kw: Partial<Poste> = {}): Poste => ({
  id,
  nom,
  categorie: 'autre',
  couleur: '#000',
  horaires_autorises: [],
  presence: false,
  ...kw,
})

describe('ordre de décision écrit d’après l’importance', () => {
  it('trois niveaux : souhaités, Si possible, Important, Indispensable', () => {
    const p = phrasesOrdreDecision([
      poste(1, 'Direction', { importance: 'si_possible' }),
      poste(2, 'Réception', { importance: 'indispensable' }),
      poste(3, 'Club', { importance: 'indispensable' }),
      poste(4, 'Technique'),
      poste(5, 'Ancien', { importance: 'si_possible', ferme: true }),
    ])
    expect(p[1]).toBe(
      "Quand il manque du monde, une place reste vide dans cet ordre : d'abord les besoins souhaités, puis les postes Si possible (Direction), puis les postes Important (Technique), et les postes Indispensable (Réception et Club) en dernier.",
    )
    for (const x of p) expect(x).not.toMatch(/[«»—]|\d{3}/)
  })
  it('deux niveaux, puis un seul', () => {
    expect(
      phrasesOrdreDecision([
        poste(1, 'Direction', { importance: 'si_possible' }),
        poste(2, 'Réception', { importance: 'indispensable' }),
      ])[1],
    ).toContain(
      'puis les postes Si possible (Direction), et les postes Indispensable (Réception) en dernier.',
    )
    expect(phrasesOrdreDecision([poste(1, 'A'), poste(2, 'B')])[1]).toContain(
      'Tous les postes ont la même importance',
    )
  })
  it('un poste fermé ne compte pas ; sans importance : Important', () => {
    expect(
      postesParImportance([poste(1, 'A'), poste(2, 'B', { ferme: true })]),
    ).toEqual({ indispensable: [], important: ['A'], si_possible: [] })
  })
})

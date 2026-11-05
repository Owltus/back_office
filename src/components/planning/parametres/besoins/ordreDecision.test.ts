import { describe, expect, it } from 'vitest'

import {
  phrasesOrdreDecision,
  postesParImportance,
  sectionsBesoins,
} from '#/components/planning/parametres/besoins/ordreDecision.ts'
import type { Poste } from '#/lib/planning/types.ts'

/*
 * Oracle : décision utilisateur du 2026-11-05, « soit un poste est
 * important, soit il ne l'est pas… je n'ai pas envie de devoir refabriquer
 * un moteur » : un réglage oui / non, aucun nom de poste en dur. Le texte de
 * la page Besoins suit les réglages, jamais de poids en chiffres, ni tiret
 * cadratin ni guillemets.
 */

const poste = (id: number, nom: string, kw: Partial<Poste> = {}): Poste => ({
  id,
  nom,
  jour_max_minutes: 690,
  couleur: '#000',
  horaires_autorises: [],
  presence: false,
  ...kw,
})

const noms = (ps: Poste[]) => ps.map((p) => p.nom)

describe('ordre de décision écrit d’après le réglage indispensable', () => {
  it('les postes indispensables en dernier, les autres avant', () => {
    const ph = phrasesOrdreDecision([
      poste(1, 'Direction', { importance: 'si_possible' }),
      poste(2, 'Réception', { importance: 'indispensable' }),
      poste(3, 'Club', { importance: 'indispensable' }),
      poste(4, 'Technique', { importance: 'important' }),
      poste(5, 'Ancien', { importance: 'si_possible', ferme: true }),
    ])
    expect(ph[1]).toBe(
      "Quand il manque du monde, une place reste vide dans cet ordre : d'abord les besoins souhaités, puis les autres postes (Direction et Technique), et les postes indispensables (Réception et Club) en dernier.",
    )
    for (const p of ph) {
      expect(p).not.toMatch(/[—«»]/)
      expect(p).not.toMatch(/\d{3,}/)
    }
  })
  it('tous au même réglage : une seule phrase', () => {
    const ph = phrasesOrdreDecision([
      poste(1, 'A', { importance: 'indispensable' }),
      poste(2, 'B', { importance: 'indispensable' }),
    ])
    expect(ph[1]).toContain("Aucun poste n'est plus indispensable")
  })
  it('un poste fermé ne compte pas ; sans réglage ou « important » : non', () => {
    const r = postesParImportance([
      poste(1, 'A'),
      poste(2, 'B', { ferme: true }),
      poste(3, 'C', { importance: 'important' }),
    ])
    expect(noms(r.indispensables)).toEqual([])
    expect(noms(r.autres)).toEqual(['A', 'C'])
  })
})

describe('sections de la page Besoins', () => {
  const accueil = [
    poste(1, 'Réception', { presence: true, importance: 'indispensable' }),
    poste(2, 'Veille', { accueil_nuit: true, importance: 'indispensable' }),
  ]
  it('un poste neuf se range tout seul selon son réglage', () => {
    const s = sectionsBesoins([
      ...accueil,
      poste(3, 'Zéphyr', { importance: 'indispensable' }),
      poste(4, 'Direction', { importance: 'si_possible' }),
      poste(5, 'Fermé', { importance: 'indispensable', ferme: true }),
    ])
    expect(s.accueil).toBe(true)
    expect(s.accueilIndispensable).toBe(true)
    expect(noms(s.indispensables)).toEqual(['Zéphyr'])
    expect(noms(s.autres)).toEqual(['Direction'])
  })
  it('un accueil sans poste indispensable va dans les autres postes', () => {
    const s = sectionsBesoins([
      poste(1, 'Réception', { presence: true, importance: 'si_possible' }),
    ])
    expect(s.accueil).toBe(true)
    expect(s.accueilIndispensable).toBe(false)
  })
  it('sans poste du matin et du soir : pas de tableau, tous ont leur grille', () => {
    const s = sectionsBesoins([
      poste(2, 'Veille', { accueil_nuit: true, importance: 'indispensable' }),
      poste(4, 'Direction'),
    ])
    expect(s.accueil).toBe(false)
    expect(noms(s.indispensables)).toEqual(['Veille'])
    expect(noms(s.autres)).toEqual(['Direction'])
  })
})

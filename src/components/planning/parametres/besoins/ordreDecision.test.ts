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
  zone_id: null,
  ...kw,
})

const noms = (ps: Poste[]) => ps.map((p) => p.nom)

describe('ordre de décision écrit d’après le réglage indispensable', () => {
  it('les postes indispensables en dernier, les autres avant', () => {
    const ph = phrasesOrdreDecision([
      poste(1, 'Direction', { indispensable: false }),
      poste(2, 'Réception', { indispensable: true }),
      poste(3, 'Club', { indispensable: true }),
      poste(4, 'Technique', { indispensable: false }),
      poste(5, 'Ancien', { indispensable: false, ferme: true }),
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
      poste(1, 'A', { indispensable: true }),
      poste(2, 'B', { indispensable: true }),
    ])
    expect(ph[1]).toContain("Aucun poste n'est plus indispensable")
  })
  it('un poste fermé ne compte pas ; sans réglage ou « important » : non', () => {
    const r = postesParImportance([
      poste(1, 'A'),
      poste(2, 'B', { ferme: true }),
      poste(3, 'C', { indispensable: false }),
    ])
    expect(noms(r.indispensables)).toEqual([])
    expect(noms(r.autres)).toEqual(['A', 'C'])
  })
})

describe('sections de la page Besoins', () => {
  const accueil = [
    poste(1, 'Réception', { zone_id: 1, indispensable: true }),
    poste(2, 'Veille', { zone_id: 1, indispensable: true }),
  ]
  it('un poste neuf se range tout seul selon son réglage', () => {
    const s = sectionsBesoins([
      ...accueil,
      poste(3, 'Zéphyr', { indispensable: true }),
      poste(4, 'Direction', { indispensable: false }),
      poste(5, 'Fermé', { indispensable: true, ferme: true }),
    ])
    expect(s.accueil).toBe(true)
    expect(s.accueilIndispensable).toBe(true)
    expect(noms(s.indispensables)).toEqual(['Zéphyr'])
    expect(noms(s.autres)).toEqual(['Direction'])
  })
  it('un accueil sans poste indispensable va dans les autres postes', () => {
    const s = sectionsBesoins([
      poste(1, 'Réception', { zone_id: 1, indispensable: false }),
    ])
    expect(s.accueil).toBe(true)
    expect(s.accueilIndispensable).toBe(false)
  })
  it('sans poste dans une zone : pas de tableau, tous ont leur grille', () => {
    const s = sectionsBesoins([
      poste(2, 'Veille', { zone_id: null, indispensable: true }),
      poste(4, 'Direction'),
    ])
    expect(s.accueil).toBe(false)
    expect(noms(s.indispensables)).toEqual(['Veille'])
    expect(noms(s.autres)).toEqual(['Direction'])
  })
})

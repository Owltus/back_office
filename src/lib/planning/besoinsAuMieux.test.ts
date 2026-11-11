import { describe, expect, it } from 'vitest'

import { besoinsLus, rempliAuMieux } from '#/lib/planning/besoinsAuMieux.ts'
import type { Besoin, Horaire, Poste, Zone } from '#/lib/planning/types.ts'

/*
 * Oracle : décision utilisateur du 2026-11-11, « des postes pas jugés
 * importants d'un point de vue planning… tu remplis au mieux suivant chaque
 * personne ». Un poste non indispensable n'a plus de grille : une place
 * facultative par horaire permis et par jour, jamais une place à pourvoir.
 */

const h = (id: number, debut: string, fin: string): Horaire =>
  ({ id, debut, fin, pause: 45, periode: 'matin', nom: '' }) as Horaire
const poste = (id: number, kw: Partial<Poste> = {}): Poste =>
  ({
    id,
    nom: `P${id}`,
    horaires_autorises: [],
    ferme: false,
    indispensable: false,
    zone_id: null,
    ...kw,
  }) as Poste
const ecrit = (id: number, posteId: number): Besoin => ({
  id,
  poste_id: posteId,
  jour: 0,
  horaire_id: 1,
  debut: '08:00',
  fin: '16:45',
  effectif: 1,
  soutien: 0,
  renfort: 0,
})
const ZONE: Zone = { id: 1, nom: 'Personnel', ordre: 0, continue: true }
const HORAIRES = [h(1, '08:00', '16:45'), h(2, '11:00', '19:45')]

describe('besoinsLus', () => {
  it('un poste non indispensable : une place facultative par horaire et par jour', () => {
    const r = besoinsLus({
      zones: [ZONE],
      horaires: HORAIRES,
      postes: [poste(7, { horaires_autorises: [2] })],
      besoins: [ecrit(50, 7)],
    })
    expect(r).toHaveLength(7)
    expect(r.every((b) => b.horaire_id === 2)).toBe(true)
    expect(r.every((b) => b.effectif === 0 && b.renfort === 1)).toBe(true)
    expect(r.map((b) => b.jour)).toEqual([0, 1, 2, 3, 4, 5, 6])
    // La grille en base n'est plus lue ; les places déduites ont un id négatif.
    expect(r.some((b) => b.id === 50)).toBe(false)
    expect(r.every((b) => b.id < 0)).toBe(true)
  })
  it('« Tous » les horaires : chacun, chaque jour', () => {
    const r = besoinsLus({
      zones: [ZONE],
      horaires: HORAIRES,
      postes: [poste(7)],
      besoins: [],
    })
    expect(r).toHaveLength(14)
  })
  it('poste indispensable ou fermé : rien de déduit, ses lignes gardées', () => {
    const r = besoinsLus({
      zones: [ZONE],
      horaires: HORAIRES,
      postes: [
        poste(4, { indispensable: true, zone_id: 1 }),
        poste(8, { ferme: true }),
      ],
      besoins: [ecrit(51, 4)],
    })
    expect(r.map((b) => b.id)).toEqual([51])
    expect(rempliAuMieux(poste(4, { indispensable: true }))).toBe(false)
    expect(rempliAuMieux(poste(8, { ferme: true }))).toBe(false)
  })
  it('sans zone en base (jeux de test) : les besoins écrits, tels quels', () => {
    const besoins = [ecrit(52, 7)]
    expect(
      besoinsLus({ horaires: HORAIRES, postes: [poste(7)], besoins }),
    ).toEqual(besoins)
  })
})

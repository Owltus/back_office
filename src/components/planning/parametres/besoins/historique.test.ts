import { describe, expect, it } from 'vitest'

import {
  HISTORIQUE_VIDE,
  JOURS_COPIE,
  ajouter,
  annuler,
  inverser,
  retablir,
  sansEffet,
} from '#/components/planning/parametres/besoins/historique.ts'
import type {
  Changement,
  Entree,
} from '#/components/planning/parametres/besoins/historique.ts'

/*
 * Oracle : la demande du 2026-10-31 (« je ne sais pas comment revenir ») —
 * chaque action est une entrée qui garde les valeurs avant / après des cases
 * touchées ; Annuler réécrit les valeurs avant, Rétablir les valeurs après ;
 * une nouvelle action efface ce qui pouvait être rétabli.
 */

const ligne = { cle: 't1', horaire_id: 1, debut: '07:00', fin: '15:45' }
const besoin = (jour: number, avant: number, apres: number): Changement => ({
  type: 'besoin',
  posteId: 2,
  ligne,
  jour,
  avant: { effectif: avant, soutien: 0, renfort: 0 },
  apres: { effectif: apres, soutien: 0, renfort: 0 },
})
const entree = (libelle: string, ...changements: Changement[]): Entree => ({
  libelle,
  changements,
})

describe('historique', () => {
  it('annuler rend les valeurs avant, rétablir les valeurs après', () => {
    let h = ajouter(
      HISTORIQUE_VIDE,
      entree('copie', besoin(5, 1, 2), besoin(6, 1, 2)),
    )
    const a = annuler(h)
    expect(a.entree?.changements.map((c) => [c.jour, c.apres])).toEqual([
      [5, { effectif: 1, soutien: 0, renfort: 0 }],
      [6, { effectif: 1, soutien: 0, renfort: 0 }],
    ])
    h = a.historique
    expect(h.passe).toHaveLength(0)
    expect(h.futur).toHaveLength(1)
    const r = retablir(h)
    expect(r.entree?.changements.map((c) => c.apres)).toEqual([
      { effectif: 2, soutien: 0, renfort: 0 },
      { effectif: 2, soutien: 0, renfort: 0 },
    ])
    expect(r.historique.passe).toHaveLength(1)
    expect(r.historique.futur).toHaveLength(0)
  })

  it('annule dans l’ordre inverse des actions', () => {
    let h = ajouter(HISTORIQUE_VIDE, entree('un', besoin(0, 0, 1)))
    h = ajouter(h, entree('deux', besoin(0, 1, 2)))
    const a1 = annuler(h)
    expect(a1.entree?.libelle).toBe('deux')
    const a2 = annuler(a1.historique)
    expect(a2.entree?.libelle).toBe('un')
    expect(annuler(a2.historique).entree).toBeUndefined()
  })

  it('une nouvelle action efface ce qui pouvait être rétabli', () => {
    let h = ajouter(HISTORIQUE_VIDE, entree('un', besoin(0, 0, 1)))
    h = annuler(h).historique
    expect(h.futur).toHaveLength(1)
    h = ajouter(h, entree('deux', besoin(1, 0, 1)))
    expect(h.futur).toHaveLength(0)
    expect(retablir(h).entree).toBeUndefined()
  })

  it('une action sans effet n’est pas gardée, ses cases inchangées retirées', () => {
    const vide = ajouter(HISTORIQUE_VIDE, entree('rien', besoin(0, 1, 1)))
    expect(vide).toBe(HISTORIQUE_VIDE)
    const h = ajouter(
      HISTORIQUE_VIDE,
      entree('copie', besoin(0, 1, 1), besoin(1, 1, 3)),
    )
    expect(h.passe[0].changements.map((c) => c.jour)).toEqual([1])
  })

  it('les présences minimum s’annulent comme les besoins', () => {
    const c: Changement = {
      type: 'consigne',
      zone: 1,
      jour: 5,
      periode: 'matin',
      avant: { minimum: 2, maximum: null },
      apres: { minimum: 3, maximum: 3 },
    }
    expect(sansEffet(c)).toBe(false)
    expect(inverser(c)).toMatchObject({
      avant: { minimum: 3, maximum: 3 },
      apres: { minimum: 2, maximum: null },
    })
  })

  it('garde au plus la limite, oublie les plus anciennes', () => {
    let h = HISTORIQUE_VIDE
    for (let i = 0; i < 5; i++)
      h = ajouter(h, entree(`n${i}`, besoin(0, i, i + 1)), 3)
    expect(h.passe.map((e) => e.libelle)).toEqual(['n2', 'n3', 'n4'])
  })

  it('les jours des copies', () => {
    expect(JOURS_COPIE.semaine).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(JOURS_COPIE.ouvres).toEqual([0, 1, 2, 3, 4])
    expect(JOURS_COPIE.weekend).toEqual([5, 6])
  })
})

describe('options de la case (2026-11-05)', () => {
  const ligne = { cle: 't1', horaire_id: 1, debut: '07:00', fin: '15:00' }
  const c = (
    avant: Record<string, unknown>,
    apres: Record<string, unknown>,
  ): Changement => ({
    type: 'besoin',
    posteId: 1,
    ligne,
    jour: 0,
    avant: { effectif: 1, soutien: 0, renfort: 0, ...avant },
    apres: { effectif: 1, soutien: 0, renfort: 0, ...apres },
  })
  it('souhaité ou titulaire seulement est un changement ; les défauts n’en sont pas', () => {
    expect(sansEffet(c({}, { obligatoire: false }))).toBe(false)
    expect(sansEffet(c({}, { niveau_min: 'titulaire' }))).toBe(false)
    expect(sansEffet(c({}, { obligatoire: true, niveau_min: null }))).toBe(true)
  })
})

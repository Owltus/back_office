import { describe, expect, it } from 'vitest'

import { couvre, dansLEquipe, parcours } from '#/lib/planning/parcours.ts'

/*
 * Parcours d'une personne (2026-11-03) : l'exemple de l'utilisateur, un CDD,
 * un CDI une semaine après, une rupture, puis un CDD trois mois plus tard,
 * est UNE personne à quatre dates. Données fictives.
 */

const contrat = (
  id: number,
  date_entree: string | null,
  date_sortie: string | null,
  suite_de: number | null = null,
  actif = true,
) => ({ id, date_entree, date_sortie, suite_de, actif })

const PARCOURS = [
  contrat(1, '2026-01-05', '2026-03-31'),
  contrat(2, '2026-04-07', '2026-06-30', 1),
  contrat(3, '2026-10-01', '2026-10-31', 2),
  contrat(9, '2026-01-01', null),
]

describe('parcours', () => {
  it('des contrats liés font UNE personne, dans l’ordre de leurs dates', () => {
    const r = parcours(
      [PARCOURS[2], PARCOURS[0], PARCOURS[3], PARCOURS[1]],
      '2026-08-15',
    )
    expect(r).toHaveLength(2)
    const p = r.find((x) => x.contrats.length === 3)!
    expect(p.contrats.map((c) => c.id)).toEqual([1, 2, 3])
  })

  it('entre deux contrats : le prochain est celui du moment, la personne reste', () => {
    const p = parcours(PARCOURS, '2026-08-15').find(
      (x) => x.contrats.length === 3,
    )!
    expect(p.courant.id).toBe(3)
    expect(p.suivant).toBeNull()
    expect(dansLEquipe(p, '2026-08-15')).toBe(true)
  })

  it('pendant le CDI : le CDI est courant, le retour en CDD est le suivant', () => {
    const p = parcours(PARCOURS, '2026-05-01').find(
      (x) => x.contrats.length === 3,
    )!
    expect(p.courant.id).toBe(2)
    expect(p.suivant?.id).toBe(3)
  })

  it('refusé : après le dernier contrat, la personne est partie', () => {
    const p = parcours(PARCOURS, '2026-12-01').find(
      (x) => x.contrats.length === 3,
    )!
    expect(p.courant.id).toBe(3)
    expect(dansLEquipe(p, '2026-12-01')).toBe(false)
  })

  it('un contrat sans lien reste une personne seule', () => {
    const p = parcours(PARCOURS, '2026-05-01').find(
      (x) => x.contrats.length === 1,
    )!
    expect(p.courant.id).toBe(9)
    expect(couvre(p.courant, '2026-05-01')).toBe(true)
    // Désactivé : il ne couvre plus rien.
    expect(couvre({ ...p.courant, actif: false }, '2026-05-01')).toBe(false)
  })
})

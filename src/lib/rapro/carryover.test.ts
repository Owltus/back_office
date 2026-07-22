import { describe, expect, it } from 'vitest'

import { carryOver, carryoverWindow } from '#/lib/rapro/carryover.ts'
import type { DaySnapshot } from '#/lib/rapro/carryover.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

/** Instantané d'un jour : uniquement les lignes de statut posées. Une chambre
 * absente est au défaut « nettoyée » (aucune ligne), exactement comme en base. Le
 * roulement ne regarde QUE ça — pas l'occupation. */
function snap(statuses: Array<[number, RoomStatus]>): DaySnapshot {
  return { statuses: new Map(statuses) }
}

describe('carryOver — roulement des chambres bloquées', () => {
  it('reporte une chambre bloquée la veille', () => {
    // J-1 : 305 bloquée → liseré « bloquée la veille » à J.
    expect(carryOver([snap([[305, 'non_nettoyee']])])).toEqual(new Set([305]))
  })

  it('cesse de rouler dès que la chambre repasse au vert le lendemain', () => {
    // Le bug rapporté (chambre 414) : bloquée l'avant-veille (J-2), repassée au
    // vert hier (J-1) — donc AUCUNE ligne. Elle NE doit plus porter le liseré
    // aujourd'hui, peu importe qu'elle soit encore occupée ou non (départ).
    const past = [
      snap([[305, 'non_nettoyee']]), // J-2 : bloquée
      snap([]), // J-1 : plus de ligne → nettoyée par défaut → résolue
    ]
    expect(carryOver(past)).toEqual(new Set())
  })

  it('continue de rouler tant que la chambre reste marquée bloquée', () => {
    const past = [
      snap([[305, 'non_nettoyee']]), // J-2 : bloquée
      snap([[305, 'non_nettoyee']]), // J-1 : encore bloquée
    ]
    expect(carryOver(past)).toEqual(new Set([305]))
  })

  it('un refus le lendemain résout (hors charge, ne roule pas)', () => {
    const past = [snap([[305, 'non_nettoyee']]), snap([[305, 'refus']])]
    expect(carryOver(past)).toEqual(new Set())
  })

  it('une ligne nettoyée explicite le lendemain résout', () => {
    const past = [snap([[305, 'non_nettoyee']]), snap([[305, 'nettoyee']])]
    expect(carryOver(past)).toEqual(new Set())
  })

  it('le liseré ne dépend jamais du statut du jour courant', () => {
    // Bloquée hier (J-1), elle porte le liseré aujourd'hui même si aujourd'hui
    // elle est nettoyée/refus : le jour courant n'entre pas dans `past`.
    expect(carryOver([snap([[305, 'non_nettoyee']])])).toEqual(new Set([305]))
  })

  it('ne reporte jamais une chambre qui n’a jamais été bloquée', () => {
    const past = [snap([]), snap([[305, 'refus']])]
    expect(carryOver(past)).toEqual(new Set())
  })

  it('rouvre un cycle : bloquée, repassée au vert, puis re-bloquée', () => {
    const past = [
      snap([[305, 'non_nettoyee']]), // J-3 : bloquée
      snap([]), // J-2 : repassée au vert → résout le 1er blocage
      snap([[305, 'non_nettoyee']]), // J-1 : re-bloquée → roule à nouveau
    ]
    expect(carryOver(past)).toEqual(new Set([305]))
  })

  it('traite chaque chambre indépendamment', () => {
    // 210 bloquée avant-hier puis nettoyée hier (ne roule plus) ; 305 bloquée
    // hier (roule). Seule 305 porte le liseré.
    const past = [snap([[210, 'non_nettoyee']]), snap([[305, 'non_nettoyee']])]
    expect(carryOver(past)).toEqual(new Set([305]))
  })

  it('une fenêtre vide ne reporte rien', () => {
    expect(carryOver([])).toEqual(new Set())
  })
})

describe('carryoverWindow — fenêtre bornée de jours', () => {
  it('liste les jours du plus ancien à J-1, borne du dernier jour connu', () => {
    expect(carryoverWindow('2026-07-21', '2026-07-19')).toEqual([
      '2026-07-19',
      '2026-07-20',
    ])
  })

  it('ne remonte jamais au-delà de la profondeur maximale', () => {
    const days = carryoverWindow('2026-07-21', '2020-01-01', 7)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-07-14')
    expect(days[days.length - 1]).toBe('2026-07-20')
  })

  it('renvoie une fenêtre vide quand il n’y a pas de veille disponible', () => {
    expect(carryoverWindow('2026-07-21', '2026-07-21')).toEqual([])
  })
})

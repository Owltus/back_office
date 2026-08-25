import { describe, expect, it } from 'vitest'

import {
  aggregatePdjDaily,
  aggregatePdjLoadPoints,
  aggregatePdjMonthly,
  computeRuptureThreshold,
  yearsFromDates,
} from '#/lib/pdj/analytics.ts'
import type { PdjAggRow } from '#/lib/pdj/service.ts'

/*
 * Agrégation analytique depuis la VUE `pdj_daily_agg` (une ligne par jour × code).
 *
 * Point sensible vérifié ici : `extra` / `no_show` de la vue sont DÉJÀ sommés par
 * chambre (greatest(...,0) avant somme). Les fonctions doivent les additionner
 * tels quels entre codes, JAMAIS les recalculer depuis `Σservi − Σinclus` (qui
 * annulerait un extra et un non-venu du même jour).
 */

function row(partial: Partial<PdjAggRow> & { service_date: string }): PdjAggRow {
  return {
    code: 'PDJ',
    rooms: 0,
    guests: 0,
    included: 0,
    served: 0,
    extra: 0,
    no_show: 0,
    ...partial,
  }
}

describe('aggregatePdjDaily', () => {
  it('somme entre codes et garde extra/no_show pré-calculés (pas de recompute)', () => {
    // Un seul jour, un code : inclus 3 / servi 3, mais extra 1 ET non-venu 1
    // (chambre A inc2/srv3, chambre B inc1/srv0). Un recompute max(0,3−3)=0 serait
    // faux : on doit lire extra=1 et no_show=1 tels quels.
    const rows: PdjAggRow[] = [
      row({
        service_date: '2026-08-10',
        rooms: 2,
        guests: 4,
        included: 3,
        served: 3,
        extra: 1,
        no_show: 1,
      }),
    ]
    const [d] = aggregatePdjDaily(rows, 2026, 8)
    expect(d.day).toBe(10)
    expect(d.rooms).toBe(2)
    expect(d.guests).toBe(4)
    expect(d.included).toBe(3)
    expect(d.served).toBe(3)
    expect(d.extra).toBe(1)
    expect(d.noShow).toBe(1)
    expect(d.potential).toBe(1) // max(0, 4 − 3)
    expect(d.occupancy).toBeCloseTo((2 / 80) * 100)
    expect(d.conversion).toBeCloseTo(((3 + 1) / 4) * 100)
  })

  it('additionne plusieurs codes d’un même jour', () => {
    const rows: PdjAggRow[] = [
      row({ service_date: '2026-08-10', code: 'PDJ', rooms: 2, guests: 3, included: 3, served: 2, extra: 0, no_show: 1 }),
      row({ service_date: '2026-08-10', code: 'PDJBB', rooms: 1, guests: 2, included: 1, served: 1, extra: 0, no_show: 0 }),
      row({ service_date: '2026-08-10', code: null, rooms: 1, guests: 1, included: 0, served: 1, extra: 1, no_show: 0 }),
    ]
    const [d] = aggregatePdjDaily(rows, 2026, 8)
    expect(d.rooms).toBe(4)
    expect(d.guests).toBe(6)
    expect(d.included).toBe(4)
    expect(d.served).toBe(4)
    expect(d.extra).toBe(1)
    expect(d.noShow).toBe(1)
  })

  it('jour non saisi (servi 0) → extra/noShow null, conversion depuis l’inclus', () => {
    const rows: PdjAggRow[] = [
      row({ service_date: '2026-08-11', rooms: 1, guests: 2, included: 2, served: 0, extra: 0, no_show: 2 }),
    ]
    const [d] = aggregatePdjDaily(rows, 2026, 8)
    expect(d.extra).toBeNull()
    expect(d.noShow).toBeNull()
    expect(d.conversion).toBeCloseTo((2 / 2) * 100)
  })

  it('externes : s’ajoutent à l’extra d’un jour déjà saisi (servi > 0)', () => {
    const rows: PdjAggRow[] = [
      row({
        service_date: '2026-08-10',
        rooms: 2,
        guests: 4,
        included: 3,
        served: 3,
        extra: 1,
        no_show: 1,
      }),
    ]
    const [d] = aggregatePdjDaily(
      rows,
      2026,
      8,
      new Map([['2026-08-10', 2]]),
    )
    expect(d.extra).toBe(3) // 1 (chambre) + 2 (externes)
    expect(d.noShow).toBe(1) // inchangé
    expect(d.conversion).toBeCloseTo(((3 + 3) / 4) * 100)
  })

  it('externes seuls (jour non saisi côté chambre) : extra connu, noShow reste null', () => {
    const rows: PdjAggRow[] = [
      row({ service_date: '2026-08-11', rooms: 1, guests: 2, included: 2, served: 0, extra: 0, no_show: 2 }),
    ]
    const [d] = aggregatePdjDaily(
      rows,
      2026,
      8,
      new Map([['2026-08-11', 3]]),
    )
    expect(d.extra).toBe(3)
    expect(d.noShow).toBeNull() // pas de conso chambre saisie : non fiable
  })

  it('ignore les lignes hors du mois demandé', () => {
    const rows: PdjAggRow[] = [
      row({ service_date: '2026-08-10', rooms: 1, guests: 1 }),
      row({ service_date: '2026-07-10', rooms: 1, guests: 1 }),
      row({ service_date: '2025-08-10', rooms: 1, guests: 1 }),
    ]
    const out = aggregatePdjDaily(rows, 2026, 8)
    expect(out).toHaveLength(1)
    expect(out[0].date).toBe('2026-08-10')
  })
})

describe('aggregatePdjMonthly', () => {
  it('12 mois, occupation = moyenne des taux quotidiens, extra/noShow sur jours saisis', () => {
    const rows: PdjAggRow[] = [
      // Août : 2 jours. J10 saisi (servi 3, extra 1, non-venu 1) ; J11 NON saisi.
      row({ service_date: '2026-08-10', rooms: 2, guests: 4, included: 3, served: 3, extra: 1, no_show: 1 }),
      row({ service_date: '2026-08-11', rooms: 4, guests: 6, included: 5, served: 0, extra: 0, no_show: 5 }),
    ]
    const months = aggregatePdjMonthly(rows, 2026)
    expect(months).toHaveLength(12)
    const aug = months[7] // mois 8
    expect(aug.days).toBe(2)
    expect(aug.recordedDays).toBe(1) // seul J10 a du servi
    expect(aug.rooms).toBe(6) // 2 + 4
    expect(aug.guests).toBe(10) // 4 + 6
    expect(aug.included).toBe(8) // 3 + 5
    expect(aug.served).toBe(3)
    // extra/noShow : uniquement les jours saisis → J10.
    expect(aug.extra).toBe(1)
    expect(aug.noShow).toBe(1)
    // Occupation moyenne = moyenne de (2/80) et (4/80) en %.
    expect(aug.avgOccupancy).toBeCloseTo((((2 / 80) + (4 / 80)) / 2) * 100)
    // Captage mensuel = (inclus + extra) / clients.
    expect(aug.conversion).toBeCloseTo(((8 + 1) / 10) * 100)
  })

  it('mois sans aucun jour saisi → extra/noShow restent null', () => {
    const rows: PdjAggRow[] = [
      row({ service_date: '2026-09-01', rooms: 1, guests: 2, included: 2, served: 0, extra: 0, no_show: 2 }),
    ]
    const sep = aggregatePdjMonthly(rows, 2026)[8]
    expect(sep.recordedDays).toBe(0)
    expect(sep.extra).toBeNull()
    expect(sep.noShow).toBeNull()
  })

  it('externes : s’ajoutent à l’extra d’un jour déjà saisi (servi > 0)', () => {
    const rows: PdjAggRow[] = [
      row({ service_date: '2026-08-10', rooms: 2, guests: 4, included: 3, served: 3, extra: 1, no_show: 1 }),
    ]
    const aug = aggregatePdjMonthly(
      rows,
      2026,
      new Map([['2026-08-10', 2]]),
    )[7]
    expect(aug.extra).toBe(3) // 1 (chambre) + 2 (externes)
    expect(aug.conversion).toBeCloseTo(((3 + 3) / 4) * 100)
  })

  it('externes seuls (jour non saisi côté chambre) : ignorés au niveau mensuel, pas de faux non-venus', () => {
    const rows: PdjAggRow[] = [
      row({ service_date: '2026-09-01', rooms: 1, guests: 2, included: 2, served: 0, extra: 0, no_show: 2 }),
    ]
    const sep = aggregatePdjMonthly(
      rows,
      2026,
      new Map([['2026-09-01', 4]]),
    )[8]
    expect(sep.recordedDays).toBe(0)
    expect(sep.extra).toBeNull()
    expect(sep.noShow).toBeNull()
  })
})

describe('yearsFromDates', () => {
  it('années distinctes triées + fallback', () => {
    expect(yearsFromDates(['2026-08-10', '2025-01-02', '2026-12-31'], 2027)).toEqual([
      2025, 2026, 2027,
    ])
  })
})

describe('aggregatePdjLoadPoints', () => {
  it('somme entre codes du même jour', () => {
    const rows: PdjAggRow[] = [
      row({ service_date: '2026-08-10', code: 'PDJ', included: 3, served: 3, no_show: 1 }),
      row({ service_date: '2026-08-10', code: 'PDJBB', included: 1, served: 1, no_show: 0 }),
    ]
    expect(aggregatePdjLoadPoints(rows)).toEqual([
      { date: '2026-08-10', included: 4, noShow: 1 },
    ])
  })

  it('écarte un jour non renseigné (servi = 0) — le non-venu ne serait pas fiable', () => {
    const rows: PdjAggRow[] = [
      row({ service_date: '2026-08-11', included: 2, served: 0, no_show: 2 }),
    ]
    expect(aggregatePdjLoadPoints(rows)).toEqual([])
  })

  it('écarte un jour sans PDJ inclus — dénominateur du taux', () => {
    const rows: PdjAggRow[] = [
      row({ service_date: '2026-08-12', included: 0, served: 1, extra: 1 }),
    ]
    expect(aggregatePdjLoadPoints(rows)).toEqual([])
  })
})

describe('computeRuptureThreshold', () => {
  it('null si l’historique est trop court', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      included: 30 + i,
      noShow: 1,
    }))
    expect(computeRuptureThreshold(points)).toBeNull()
  })

  it('null si le taux de non-servis ne varie pas avec le volume (pas de signal)', () => {
    // Ratio constant (~5 %) quel que soit le volume : aucune coupure ne devrait
    // révéler d'écart franc entre jours calmes et chargés.
    const points = Array.from({ length: 25 }, (_, i) => {
      const included = 10 + i
      return { date: `2026-08-${String(i + 1).padStart(2, '0')}`, included, noShow: Math.round(included * 0.05) }
    })
    expect(computeRuptureThreshold(points)).toBeNull()
  })

  it('détecte une rupture nette entre jours calmes et jours chargés', () => {
    // 20 jours calmes (30-49 inclus, non-venu quasi nul) puis 20 jours chargés
    // (50-69 inclus, non-venu élevé) : la coupure doit tomber pile entre les
    // deux groupes, avec un écart de taux net.
    const calm = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      included: 30 + i,
      noShow: 1,
    }))
    const busy = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-02-${String(i + 1).padStart(2, '0')}`,
      included: 50 + i,
      noShow: 15,
    }))
    const result = computeRuptureThreshold([...calm, ...busy])
    expect(result).not.toBeNull()
    expect(result?.threshold).toBe(50)
    expect(result?.sampleSize).toBe(40)
    expect(result?.belowRate).toBeLessThan(5)
    expect(result?.aboveRate).toBeGreaterThan(20)
  })
})

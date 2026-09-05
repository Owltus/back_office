import { describe, expect, it } from 'vitest'

import { snapRangeToMonths } from '#/lib/parking/model.ts'

// Comparaison en 'YYYY-MM-DD' LOCAL (pas `toISOString`, qui bascule en UTC et
// décalerait d'un jour selon le fuseau de la machine de test).
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('snapRangeToMonths — arrondi aux bornes de mois', () => {
  it('milieu de mois → 1er du mois de from, dernier jour du mois de to', () => {
    const r = snapRangeToMonths(local(2026, 9, 14), local(2026, 11, 3))
    expect(ymd(r.from)).toBe('2026-09-01')
    expect(ymd(r.to)).toBe('2026-11-30')
  })

  it('from et to dans le même mois → le mois entier', () => {
    const r = snapRangeToMonths(local(2026, 4, 10), local(2026, 4, 20))
    expect(ymd(r.from)).toBe('2026-04-01')
    expect(ymd(r.to)).toBe('2026-04-30')
  })

  it('février bissextile (2028) → 29, non bissextile (2026) → 28', () => {
    expect(ymd(snapRangeToMonths(local(2028, 2, 3), local(2028, 2, 3)).to)).toBe('2028-02-29')
    expect(ymd(snapRangeToMonths(local(2026, 2, 3), local(2026, 2, 3)).to)).toBe('2026-02-28')
  })

  it('décembre → 31 décembre de la MÊME année (pas de débordement sur janvier)', () => {
    const r = snapRangeToMonths(local(2026, 11, 20), local(2026, 12, 5))
    expect(ymd(r.from)).toBe('2026-11-01')
    expect(ymd(r.to)).toBe('2026-12-31')
  })

  it('bornes déjà sur un 1er / un dernier jour → inchangées', () => {
    const r = snapRangeToMonths(local(2026, 3, 1), local(2026, 5, 31))
    expect(ymd(r.from)).toBe('2026-03-01')
    expect(ymd(r.to)).toBe('2026-05-31')
  })

  it("idempotente : arrondir une fenêtre déjà arrondie ne change rien (sinon l'effet d'agrandissement boucle)", () => {
    const once = snapRangeToMonths(local(2026, 7, 17), local(2027, 1, 9))
    const twice = snapRangeToMonths(once.from, once.to)
    expect(ymd(twice.from)).toBe(ymd(once.from))
    expect(ymd(twice.to)).toBe(ymd(once.to))
  })

  it("n'élargit jamais dans le mauvais sens : from ≤ demande, to ≥ demande", () => {
    const from = local(2026, 8, 31)
    const to = local(2026, 9, 1)
    const r = snapRangeToMonths(from, to)
    expect(r.from.getTime()).toBeLessThanOrEqual(from.getTime())
    expect(r.to.getTime()).toBeGreaterThanOrEqual(to.getTime())
    expect(ymd(r.from)).toBe('2026-08-01')
    expect(ymd(r.to)).toBe('2026-09-30')
  })

  it("ignore l'heure des bornes reçues (résultat à minuit local)", () => {
    const r = snapRangeToMonths(
      new Date(2026, 8, 14, 23, 59, 59),
      new Date(2026, 8, 14, 0, 0, 1),
    )
    expect(r.from.getHours()).toBe(0)
    expect(r.to.getHours()).toBe(0)
    expect(ymd(r.from)).toBe('2026-09-01')
    expect(ymd(r.to)).toBe('2026-09-30')
  })

  it('la clé reste STABLE d’un jour à l’autre au sein du mois (deux « aujourd’hui » différents)', () => {
    // Deux fenêtres glissantes [J-135, J+180] pour deux jours du même mois.
    const win = (today: Date) =>
      snapRangeToMonths(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() - 135),
        new Date(today.getFullYear(), today.getMonth(), today.getDate() + 180),
      )
    const a = win(local(2026, 9, 5))
    const b = win(local(2026, 9, 6))
    expect(ymd(a.from)).toBe(ymd(b.from))
    expect(ymd(a.to)).toBe(ymd(b.to))
  })
})

import { describe, expect, it } from 'vitest'

import { detectTarifs, detectUnitPrice } from '#/lib/pdj/tarif.ts'

/*
 * Détection du tarif : valeurs RÉELLES tirées de doc/Addon Production _….csv.
 * PDJ → multiples de 19 ; PDJBB → base 10 avec remises (184,99…) ; PDJGROUP10 →
 * base 10 avec gratuités/avoirs (0, négatifs). La détection doit rester robuste.
 */

// Revenus PDJ réels (extrait) : tous multiples de 19.
const PDJ = [380, 418, 456, 570, 190, 171, 209, 38, 152, 114, 95, 342, 323, 475, 494, 266, 532, 247, 76, 57, 133, 19]
// Revenus PDJBB réels (extrait) : base 10, avec des remises non rondes.
const PDJBB = [300, 140, 250, 170, 60, 220, 160, 260, 120, 184.99, 227.53, 280, 190, 240, 500, 370, 30, 270.54]
// Revenus PDJGROUP10 réels (extrait) : base 10, avec 0 et négatifs (avoirs).
const GROUP = [200, 80, 10, 20, 240, 260, 180, 330, 770, 90, 100, 0, -540, -20.02, 610, 550, 130]

describe('detectUnitPrice', () => {
  it('PDJ : détecte 19 € (revenus tous multiples de 19)', () => {
    expect(detectUnitPrice(PDJ)).toBe(19)
  })

  it('PDJBB : détecte 10 € malgré les remises (184,99…)', () => {
    expect(detectUnitPrice(PDJBB)).toBe(10)
  })

  it('PDJGROUP10 : détecte 10 € en ignorant 0 et avoirs négatifs', () => {
    expect(detectUnitPrice(GROUP)).toBe(10)
  })

  it("s'adapte si le prix change (25 €) — rien en dur", () => {
    expect(detectUnitPrice([500, 250, 25, 75, 125, 1000])).toBe(25)
  })

  it('trop peu de données → null', () => {
    expect(detectUnitPrice([38, 19])).toBeNull()
  })
})

describe('detectTarifs', () => {
  it('renvoie un tarif par code, code indétectable absent', () => {
    const t = detectTarifs([
      ...PDJ.map((r) => ({ code: 'PDJ', revenue_ttc: r })),
      ...PDJBB.map((r) => ({ code: 'PDJBB', revenue_ttc: r })),
    ])
    expect(t.get('PDJ')).toBe(19)
    expect(t.get('PDJBB')).toBe(10)
  })
})

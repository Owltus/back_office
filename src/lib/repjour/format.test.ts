import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { fmt } from '#/lib/repjour/format.ts'

// Espace insécable fine (U+202F, utilisée par `Intl.NumberFormat('fr-FR')` comme
// séparateur de milliers) et espace insécable classique (U+00A0, parfois utilisée
// devant certaines unités). Le générateur de PDF doit les remplacer par une espace
// normale ; ce test fige leur présence pour que cette contrainte ne soit pas
// oubliée si `format.ts` évolue.
const NNBSP = ' '
const NBSP = ' '
const hasInsecableSpace = (s: string) => s.includes(NNBSP) || s.includes(NBSP)

describe('fmt — séparateur décimal virgule (locale fr-FR)', () => {
  it('eur/pct utilisent la virgule comme séparateur décimal, jamais le point', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100_000, noNaN: true }), (n) => {
        // La partie décimale, si affichée, doit être séparée par une virgule.
        expect(fmt.eur(n)).not.toMatch(/\d\.\d/)
        expect(fmt.pct(n)).not.toMatch(/\d\.\d/)
      }),
      { numRuns: 100 },
    )
  })

  it('cas concret : 1234.5 → "1 234,5 €" (virgule, pas point)', () => {
    expect(fmt.eur(1234.5)).toContain(',5')
    expect(fmt.eur(1234.5)).not.toContain('.5')
  })
})

describe('fmt — signe explicite des écarts', () => {
  it('un écart positif porte un "+" explicite (le négatif porte déjà son "-")', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 10_000, noNaN: true }), (n) => {
        expect(fmt.ecartNuitees(n).startsWith('+')).toBe(true)
        expect(fmt.ecartPts(n).startsWith('+')).toBe(true)
        expect(fmt.ecartEur(n).startsWith('+')).toBe(true)
        expect(fmt.ecartEurInt(n).startsWith('+')).toBe(true)
        expect(fmt.compactEcart(n).startsWith('+')).toBe(true)
        expect(fmt.compactEcartDec(n).startsWith('+')).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('un écart négatif ne porte QUE le signe "-" natif (pas de "+" ajouté)', () => {
    fc.assert(
      fc.property(fc.double({ min: -10_000, max: -0.01, noNaN: true }), (n) => {
        expect(fmt.ecartNuitees(n).startsWith('-')).toBe(true)
        expect(fmt.ecartNuitees(n).startsWith('+')).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('zéro est traité comme positif : signe "+" (cohérent avec `n >= 0` dans le code)', () => {
    expect(fmt.ecartNuitees(0)).toBe('+0')
    expect(fmt.compactEcart(0).startsWith('+')).toBe(true)
  })
})

describe('fmt — espaces insécables dans les nombres formatés', () => {
  it('les grands nombres (séparateur de milliers) contiennent une espace insécable', () => {
    // Au-delà de 999, `Intl.NumberFormat('fr-FR')` insère une espace fine
    // insécable (U+202F) comme séparateur de milliers.
    expect(hasInsecableSpace(fmt.nuitees(12345))).toBe(true)
    expect(hasInsecableSpace(fmt.eurInt(12345))).toBe(true)
    expect(hasInsecableSpace(fmt.compact(12345))).toBe(true)
  })

  it('l’espace avant l’unité ("€"/"%") est une espace ORDINAIRE, pas insécable', () => {
    // Fait vérifié à la source : eur/pct construisent la chaîne avec
    // `+ ' €'` / `+ ' %'`, une espace U+0020 littérale dans le code — ce
    // N'EST PAS le séparateur de milliers inséré par Intl.NumberFormat
    // (celui-ci, lui, est bien insécable, cf. test précédent). Un nombre
    // < 1000 (pas de séparateur de milliers) contient une espace ordinaire
    // mais AUCUNE espace insécable.
    expect(fmt.eur(10)).toBe('10,0 €')
    expect(fmt.pct(10)).toBe('10,0 %')
    expect(hasInsecableSpace(fmt.eur(10))).toBe(false)
    expect(hasInsecableSpace(fmt.pct(10))).toBe(false)
  })
})

describe('fmt — cas particuliers documentés par le code', () => {
  it('keur arrondit en kilo-euros', () => {
    expect(fmt.keur(1_245_000)).toBe('1' + NNBSP + '245 k€')
  })

  it('dateFr formate en jj/mm/aaaa', () => {
    expect(fmt.dateFr('2026-09-15')).toBe('15/09/2026')
  })

  it('dayName renvoie un jour abrégé en français', () => {
    // 2026-09-15 est un mardi.
    expect(fmt.dayName('2026-09-15').toLowerCase()).toContain('mar')
  })
})

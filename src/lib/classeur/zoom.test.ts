import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  A4_HAUTEUR_PX,
  A4_LARGEUR_PX,
  ECHELLE_MAX,
  ECHELLE_MIN,
  FACTEUR_MOLETTE_MAX,
  PALIERS,
  PALIERS_MENU,
  bornerEchelle,
  defilementPointFixe,
  echelleAjustee,
  echelleApresMolette,
  echelleEffective,
  echellePage,
  ecrireModeZoom,
  facteurMolette,
  lireModeZoom,
  palierPrecedent,
  palierSuivant,
  pourcentage,
} from '#/lib/classeur/zoom.ts'

/*
 * Oracles écrits à la main (jamais recopiés du module) : une page A4 fait
 * 210 × 297 mm, soit 793,7 × 1122,5 px à 96 DPI ; les paliers sont ceux de
 * Word (50 à 200 %) prolongés jusqu'aux bornes 25 et 400 %.
 */
const RUNS = { numRuns: 1000 }
const A4W = (210 * 96) / 25.4
const A4H = (297 * 96) / 25.4
const ATTENDUS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

const echelleQuelconque = fc.double({
  min: 0.01,
  max: 10,
  noNaN: true,
  noDefaultInfinity: true,
})
const place = fc.double({ min: 0, max: 5000, noNaN: true })

describe('constantes', () => {
  it('A4 à 96 DPI, bornes 25-400 %, paliers croissants', () => {
    expect(A4_LARGEUR_PX).toBeCloseTo(A4W, 3)
    expect(A4_HAUTEUR_PX).toBeCloseTo(A4H, 3)
    expect(ECHELLE_MIN).toBe(0.25)
    expect(ECHELLE_MAX).toBe(4)
    expect([...PALIERS]).toEqual(ATTENDUS)
    expect([...PALIERS_MENU]).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2])
  })
})

describe('bornerEchelle', () => {
  it('dans les bornes, identique ailleurs', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (e) => {
        const b = bornerEchelle(e)
        if (!Number.isFinite(e)) return b === 1
        if (e < 0.25) return b === 0.25
        if (e > 4) return b === 4
        return b === e
      }),
      RUNS,
    )
    expect(bornerEchelle(Number.NaN)).toBe(1)
    expect(bornerEchelle(0.25)).toBe(0.25)
    expect(bornerEchelle(4)).toBe(4)
  })
})

describe('paliers', () => {
  it('toute suite de « + » et « − » reste dans 25-400 %', () => {
    fc.assert(
      fc.property(
        echelleQuelconque,
        fc.array(fc.boolean(), { maxLength: 40 }),
        (depart, pas) => {
          let e = bornerEchelle(depart)
          for (const plus of pas) {
            e = plus ? palierSuivant(e) : palierPrecedent(e)
            if (e < 0.25 || e > 4) return false
          }
          return true
        },
      ),
      RUNS,
    )
  })

  it('« + » puis « − » ramène au palier de départ (hors 400 %)', () => {
    for (const p of ATTENDUS.slice(0, -1)) {
      expect(palierPrecedent(palierSuivant(p))).toBe(p)
    }
    for (const p of ATTENDUS.slice(1)) {
      expect(palierSuivant(palierPrecedent(p))).toBe(p)
    }
  })

  it('« + » donne le plus petit palier STRICTEMENT supérieur', () => {
    fc.assert(
      fc.property(echelleQuelconque, (e) => {
        const s = palierSuivant(e)
        const attendu = ATTENDUS.find((p) => p > e + 1e-6) ?? 4
        return s === attendu
      }),
      RUNS,
    )
  })

  it('« − » donne le plus grand palier STRICTEMENT inférieur', () => {
    fc.assert(
      fc.property(echelleQuelconque, (e) => {
        const s = palierPrecedent(e)
        const sous = ATTENDUS.filter((p) => p < e - 1e-6)
        return s === (sous.length > 0 ? sous[sous.length - 1] : 0.25)
      }),
      RUNS,
    )
  })

  it('valeurs connues, y compris entre deux paliers et au bord', () => {
    expect(palierSuivant(1)).toBe(1.25)
    expect(palierSuivant(0.9)).toBe(1)
    expect(palierSuivant(0.7499999999)).toBe(1)
    expect(palierSuivant(2)).toBe(3)
    expect(palierSuivant(4)).toBe(4)
    expect(palierSuivant(10)).toBe(4)
    expect(palierPrecedent(1)).toBe(0.75)
    expect(palierPrecedent(1.1)).toBe(1)
    expect(palierPrecedent(0.25)).toBe(0.25)
    expect(palierPrecedent(0.1)).toBe(0.25)
    expect(palierPrecedent(4)).toBe(3)
  })
})

describe('modes ajustés', () => {
  it('« ajuster » = largeur ÷ A4, plafonné à 100 %, borné', () => {
    fc.assert(
      fc.property(place, (l) => {
        const brut = Math.min(1, l / A4W)
        const attendu = Math.min(4, Math.max(0.25, brut))
        return Math.abs(echelleAjustee(l) - attendu) < 1e-9
      }),
      RUNS,
    )
    expect(echelleAjustee(A4W / 2)).toBeCloseTo(0.5, 9)
    expect(echelleAjustee(A4W * 3)).toBe(1)
    expect(echelleAjustee(10)).toBe(0.25)
  })

  it('« page entière » = min(largeur ÷ A4, hauteur ÷ A4), borné', () => {
    fc.assert(
      fc.property(place, place, (l, h) => {
        const brut = Math.min(l / A4W, h / A4H)
        const attendu = Math.min(4, Math.max(0.25, brut))
        return Math.abs(echellePage(l, h) - attendu) < 1e-9
      }),
      RUNS,
    )
    // Colonne haute et étroite : la largeur décide ; basse : la hauteur.
    expect(echellePage(A4W / 2, 5000)).toBeCloseTo(0.5, 9)
    expect(echellePage(5000, A4H * 0.6)).toBeCloseTo(0.6, 9)
    expect(echellePage(A4W * 2, A4H * 2)).toBeCloseTo(2, 9)
  })

  it('échelle effective : chaque mode et ses bornes', () => {
    fc.assert(
      fc.property(place, place, echelleQuelconque, (l, h, n) => {
        const p = { largeur: l, hauteur: h }
        return (
          echelleEffective('ajuster', p) === echelleAjustee(l) &&
          echelleEffective('page', p) === echellePage(l, h) &&
          echelleEffective(n, p) === Math.min(4, Math.max(0.25, n))
        )
      }),
      RUNS,
    )
  })
})

describe('point fixe (Ctrl + molette)', () => {
  it('le point du document sous la souris ne bouge pas (0,5 px)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 20000, noNaN: true }),
        fc.double({ min: 0, max: 2000, noNaN: true }),
        fc.double({ min: 0.25, max: 4, noNaN: true }),
        fc.double({ min: 0.25, max: 4, noNaN: true }),
        (defilement, pointeur, avant, apres) => {
          const nouveau = defilementPointFixe(
            defilement,
            pointeur,
            avant,
            apres,
          )
          // Coordonnée document, en px de page à 100 %, puis à l'écran.
          const docAvant = (defilement + pointeur) / avant
          const docApres = (nouveau + pointeur) / apres
          return Math.abs(docAvant - docApres) * apres <= 0.5
        },
      ),
      RUNS,
    )
  })

  it('exemple chiffré : 100 % → 200 %, souris à 100 px, défilé de 300', () => {
    // Point document 400 ; à 200 % il est à 800, la souris reste à 100.
    expect(defilementPointFixe(300, 100, 1, 2)).toBe(700)
    expect(defilementPointFixe(700, 100, 2, 1)).toBe(300)
    expect(defilementPointFixe(0, 0, 1, 3)).toBe(0)
  })
})

describe('molette', () => {
  it('facteur borné à ×2 / ÷2, > 1 vers le haut, < 1 vers le bas', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.constantFrom(0, 1, 2),
        (dy, mode) => {
          const f = facteurMolette(dy, mode)
          if (f < 0.5 || f > 2) return false
          if (dy < 0) return f >= 1
          if (dy > 0) return f <= 1
          return f === 1
        },
      ),
      RUNS,
    )
    expect(FACTEUR_MOLETTE_MAX).toBe(2)
  })

  it('un cran (100 px) ≈ ×1,22 ; lignes et pages converties', () => {
    expect(facteurMolette(-100)).toBeCloseTo(Math.exp(0.2), 9)
    expect(facteurMolette(100)).toBeCloseTo(Math.exp(-0.2), 9)
    // 3 lignes de 16 px = 48 px.
    expect(facteurMolette(3, 1)).toBeCloseTo(Math.exp(-0.096), 9)
    // Un quart de page de 800 px = 200 px.
    expect(facteurMolette(-0.25, 2)).toBeCloseTo(Math.exp(0.4), 9)
    expect(facteurMolette(-10000)).toBe(2)
    expect(facteurMolette(10000)).toBe(0.5)
    expect(facteurMolette(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('molette multiplicative et toujours dans les bornes', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.25, max: 4, noNaN: true }),
        fc.array(fc.double({ min: -500, max: 500, noNaN: true }), {
          maxLength: 30,
        }),
        (depart, deltas) => {
          let e = depart
          for (const d of deltas) {
            const attendu = Math.min(4, Math.max(0.25, e * facteurMolette(d)))
            e = echelleApresMolette(e, d)
            if (Math.abs(e - attendu) > 1e-12 || e < 0.25 || e > 4) return false
          }
          return true
        },
      ),
      RUNS,
    )
    expect(echelleApresMolette(1, -100, 0)).toBeCloseTo(Math.exp(0.2), 9)
    expect(echelleApresMolette(1, 1, 1)).toBeCloseTo(Math.exp(-0.032), 9)
  })
})

describe('libellés', () => {
  it('pourcentage arrondi et borné', () => {
    expect(pourcentage(9)).toBe('400 %')
    expect(pourcentage(0.1)).toBe('25 %')
  })
})

describe('mémorisation (localStorage)', () => {
  it('aller-retour exact pour tout mode', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant<'ajuster'>('ajuster'),
          fc.constant<'page'>('page'),
          fc.double({ min: 0.25, max: 4, noNaN: true }),
        ),
        (mode) => lireModeZoom(ecrireModeZoom(mode)) === mode,
      ),
      RUNS,
    )
  })

  it('valeur absente, illisible ou hors bornes → ajuster', () => {
    for (const brut of [
      null,
      '',
      '  ',
      'abc',
      'NaN',
      'Infinity',
      '0.1',
      '5',
      '-1',
    ]) {
      expect(lireModeZoom(brut)).toBe('ajuster')
    }
    expect(lireModeZoom('page')).toBe('page')
    expect(lireModeZoom('0.25')).toBe(0.25)
    expect(lireModeZoom('4')).toBe(4)
    expect(lireModeZoom('1.5')).toBe(1.5)
    expect(ecrireModeZoom(7)).toBe('4')
    expect(ecrireModeZoom('page')).toBe('page')
  })
})

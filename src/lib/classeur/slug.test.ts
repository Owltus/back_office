import { describe, expect, it } from 'vitest'

import {
  contientSansAccents,
  sanitizeFilename,
  slugify,
  stripAccents,
} from '#/lib/classeur/slug.ts'

/*
 * `slugify` est une clé de fusion (import JSON, appariement des chapitres
 * sans uuid). Ces cas sont ceux de l'implémentation Rust de Registre : un
 * export produit là-bas doit s'apparier ici à l'identique.
 */
describe('slugify — miroir de Registre', () => {
  it('retire les accents et passe en minuscules', () => {
    expect(slugify('Sécurité incendie')).toBe('securite-incendie')
    expect(slugify('Élévateurs & Ascenseurs')).toBe('elevateurs-ascenseurs')
  })

  it('fusionne les séparateurs et rogne les tirets', () => {
    expect(slugify('  Carnet   sanitaire !! ')).toBe('carnet-sanitaire')
    expect(slugify('---a---')).toBe('a')
  })

  it('rend une chaîne vide pour un libellé sans lettre ni chiffre', () => {
    expect(slugify('***')).toBe('')
  })

  it('conserve les chiffres', () => {
    expect(slugify('Chapitre 12 - Gaz')).toBe('chapitre-12-gaz')
  })
})

describe('stripAccents / contientSansAccents', () => {
  it('retire les diacritiques sans toucher au reste', () => {
    expect(stripAccents('àéîõü ÇŒ')).toBe('aeiou CŒ')
  })

  it('cherche sans casse ni accents, et tout est trouvé par une recherche vide', () => {
    expect(contientSansAccents('Vérification extincteurs', 'verif')).toBe(true)
    expect(contientSansAccents('Vérification extincteurs', 'EXTIN')).toBe(true)
    expect(contientSansAccents('Vérification extincteurs', 'gaz')).toBe(false)
    expect(contientSansAccents('n importe quoi', '   ')).toBe(true)
  })
})

describe('sanitizeFilename', () => {
  it('retire les caractères interdits et borne à 200', () => {
    expect(sanitizeFilename('Rapport: "test" <2026>/09\\25 ?*|')).toBe(
      'Rapport test 20260925',
    )
    expect(sanitizeFilename('x'.repeat(300))).toHaveLength(200)
  })
})

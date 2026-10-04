import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  LONGUEUR_MAX,
  NOM_REPLI,
  nettoyerNomFichier,
  nomFichierImpression,
} from '#/lib/classeur/print/nomFichierImpression.ts'

/*
 * Nom proposé par « Enregistrer au format PDF » (étape 9, D19 = A).
 * Exemples écrits à la main, puis propriétés.
 */

describe('nomFichierImpression — exemples', () => {
  it('« Classeur - Titre »', () => {
    expect(
      nomFichierImpression({
        classeur: 'Registre de sécurité',
        titre: 'Extincteurs',
      }),
    ).toBe('Registre de sécurité - Extincteurs')
  })

  it('une barre oblique devient un tiret (date jj/mm/aaaa)', () => {
    expect(
      nomFichierImpression({
        classeur: 'Procédures',
        titre: 'Modifications depuis le 04/10/2026',
      }),
    ).toBe('Procédures - Modifications depuis le 04-10-2026')
  })

  it('deux-points, guillemets, étoile, chevrons, barre verticale, antislash', () => {
    expect(
      nomFichierImpression({
        classeur: 'Carnet',
        titre: 'Note : "eau chaude" <55 °C> a|b c\\d e*f g?',
      }),
    ).toBe('Carnet - Note - eau chaude - 55 °C- a-b c-d e-f g')
  })

  it('« Titre : sous-titre » donne un seul tiret entouré d’espaces', () => {
    expect(
      nomFichierImpression({ classeur: 'A', titre: 'Accueil : arrivée' }),
    ).toBe('A - Accueil - arrivée')
  })

  it('garde les émojis et les accents', () => {
    expect(
      nomFichierImpression({ classeur: 'Été 🌞', titre: 'Piscine 🏊 ouverte' }),
    ).toBe('Été 🌞 - Piscine 🏊 ouverte')
  })

  it('retire les caractères de contrôle et de direction', () => {
    expect(
      nomFichierImpression({ classeur: 'A\u0000B', titre: 'fac‮txt.exe' }),
    ).toBe('AB - factxt.exe')
  })

  it('fusionne les espaces, retours et tabulations', () => {
    expect(
      nomFichierImpression({
        classeur: '  Mon   classeur ',
        titre: 'Ligne\n\tdeux',
      }),
    ).toBe('Mon classeur - Ligne deux')
  })

  it('ni point ni tiret en tête ou en fin', () => {
    expect(nomFichierImpression({ classeur: '.cache', titre: 'Fin...' })).toBe(
      'cache - Fin',
    )
    expect(nomFichierImpression({ titre: '- liste -' })).toBe('liste')
  })

  it('titre vide → classeur seul ; classeur vide → titre seul', () => {
    expect(nomFichierImpression({ classeur: 'Registre', titre: '' })).toBe(
      'Registre',
    )
    expect(nomFichierImpression({ classeur: null, titre: 'Sommaire' })).toBe(
      'Sommaire',
    )
  })

  it('titre identique au classeur : pas de doublon', () => {
    expect(
      nomFichierImpression({ classeur: 'Registre', titre: 'registre' }),
    ).toBe('Registre')
  })

  it('rien d’utilisable → « Classeur »', () => {
    expect(nomFichierImpression({})).toBe(NOM_REPLI)
    expect(nomFichierImpression({ classeur: '   ', titre: '///' })).toBe(
      NOM_REPLI,
    )
    expect(nomFichierImpression({ classeur: '...', titre: '\u0007' })).toBe(
      NOM_REPLI,
    )
  })

  it('nom réservé par Windows → préfixé', () => {
    expect(nomFichierImpression({ titre: 'CON' })).toBe('Classeur - CON')
  })

  it('nom réservé AVEC une extension, quelle que soit la casse → préfixé', () => {
    for (const titre of [
      'NUL.txt',
      'COM1.x',
      'con.pdf',
      'Lpt9.tar.gz',
      'aux.',
      'PrN.doc',
      'nul .txt',
    ]) {
      const nom = nomFichierImpression({ titre })
      expect(nom.startsWith(`${NOM_REPLI} - `)).toBe(true)
    }
    expect(nomFichierImpression({ titre: 'NUL.txt' })).toBe(
      'Classeur - NUL.txt',
    )
    // Pas un nom réservé : seulement un préfixe commun.
    expect(nomFichierImpression({ titre: 'Console.pdf' })).toBe('Console.pdf')
    expect(nomFichierImpression({ titre: 'COM.txt' })).toBe('COM.txt')
    expect(nomFichierImpression({ titre: 'auxiliaire' })).toBe('auxiliaire')
  })

  it('très long : borné, sans couper un émoji ni finir par une espace', () => {
    const titre = `${'mot '.repeat(29)}🌞🌞 suite`
    const nom = nomFichierImpression({ titre })
    expect(Array.from(nom).length).toBeLessThanOrEqual(LONGUEUR_MAX)
    expect(nom).toBe(`${'mot '.repeat(29)}🌞🌞 s`)
    expect(nom.endsWith(' ')).toBe(false)
    expect(nom).not.toMatch(/[\ud800-\udbff]$/)
  })
})

// eslint-disable-next-line no-control-regex
const INTERDIT = /[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/

describe('nomFichierImpression — propriétés', () => {
  const texte = fc.oneof(
    fc.string({ unit: 'binary', maxLength: 200 }),
    fc.string({ maxLength: 200 }),
    fc.constantFrom('', ' ', '/', ':', '"', '..', '-', 'CON', '🌞'),
  )
  const entree = fc.record({
    classeur: fc.option(texte, { nil: undefined }),
    titre: fc.option(texte, { nil: undefined }),
  })

  it('jamais de caractère interdit, jamais vide, borné, bords propres', () => {
    fc.assert(
      fc.property(entree, (e) => {
        const nom = nomFichierImpression(e)
        expect(nom.length).toBeGreaterThan(0)
        expect(nom).not.toMatch(INTERDIT)
        expect(Array.from(nom).length).toBeLessThanOrEqual(LONGUEUR_MAX)
        expect(nom).not.toMatch(/^[\s.-]|[\s.-]$/)
      }),
      { numRuns: 1000 },
    )
  })

  it('idempotent : renommer un nom propre ne change rien', () => {
    fc.assert(
      fc.property(entree, (e) => {
        const nom = nomFichierImpression(e)
        expect(nomFichierImpression({ titre: nom })).toBe(nom)
        expect(nettoyerNomFichier(nom)).toBe(nom)
      }),
      { numRuns: 1000 },
    )
  })
})

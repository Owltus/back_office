import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  estPossible,
  RAISON_LIBRE,
  raisonClaire,
  raisonsClaires,
  REGLES_BLOCAGE,
} from '#/lib/planning/raisonsPlaces.ts'
import type { Mention } from '#/lib/planning/raisonsPlaces.ts'

/*
 * Étape 8 : chaque raison d'une place vide a une phrase, et un lien vers le
 * réglage OU une mention (limite légale, au-delà de son contrat…). Oracles
 * écrits à la main, et la liste des règles relue dans le SOURCE du
 * vérificateur : une règle ajoutée là sans phrase ici fait rougir le test.
 */

const MENTIONS: readonly Mention[] = [
  'limite légale',
  'au-delà de son contrat',
  'absence posée',
  'déjà placé',
  'à appeler',
  'à placer',
]

/** Chaque message que `violationsSalarie` et `raisonsBlocage` écrivent,
 * recopié du vérificateur (une règle peut en avoir plusieurs). */
const MESSAGES: Record<(typeof REGLES_BLOCAGE)[number], string[]> = {
  POSTE: ['ne tient pas ce poste'],
  'HORS-CONTRAT': ['en dehors de son contrat (arrivée ou fin de contrat)'],
  ABSENCE: ['est absent(e) ce jour-là'],
  'REPOS-FIXE': ["c'est un de ses jours de repos fixes"],
  'HORAIRE-PERSO': [
    'cet horaire ne fait pas partie des siens',
    'un autre horaire est prévu ce jour-là',
  ],
  'R-JOUR-MAX': ['journée de 11 h, maximum 10 h'],
  'R-NUIT-MINEUR': ['mineur : travail interdit entre 22 h et 6 h'],
  'R-REPOS-QUOTIDIEN': [
    'seulement 9 h de repos depuis son dernier service de la semaine précédente (minimum 11 h)',
    'seulement 9 h de repos avant son premier service de la semaine suivante (minimum 11 h)',
    'seulement 8 h 30 de repos entre deux services (minimum 11 h)',
  ],
  CHEVAUCHEMENT: ['deux services se chevauchent'],
  'UN-SERVICE-PAR-JOUR': ['a déjà un service ce jour-là'],
  'R-SIX-JOURS-MAX': ['7 jours travaillés, maximum 6'],
  'R-REPOS-HEBDO-HCR': [
    '6 jours travaillés, maximum 5',
    '11 jours travaillés sur deux semaines (avec la semaine précédente) : au moins 4 jours de repos',
  ],
  'SIXIEME-JOUR': [
    '6 jours travaillés : un seul jour de repos cette semaine, la semaine voisine doit en compter au moins 2',
  ],
  'R-SEMAINE-MAX': ['50 h dans la semaine, maximum 48 h'],
  'R-JOURNEE-ETOILE': [
    'sa journée étoile (courte) est fixée ce jour-là',
    '2 journées courtes dans la semaine, une seule prévue au contrat',
  ],
  'R-REPOS-HEBDO-35H': [
    'pas de repos de 35 h consécutives dans la semaine',
    'reprend trop tôt : la semaine précédente perdrait son repos de 35 h consécutives',
  ],
  'R-REPOS-HEBDO-MINEUR': ['mineur : pas deux jours de repos consécutifs'],
  EXTRA: ['extra disponible : à appeler et poser à la main'],
}

/** Les règles écrites dans `violationsSalarie` et `raisonsBlocage`. */
function reglesDuVerificateur(): Set<string> {
  const src = readFileSync(join(import.meta.dirname, 'verificateur.ts'), 'utf8')
  const debut = src.indexOf('export function violationsSalarie')
  const fin = src.indexOf('export function reposHebdoTrouve')
  const blocage = src.slice(src.indexOf('export function raisonsBlocage'))
  const corps = src.slice(debut, fin) + blocage
  const r = new Set<string>()
  for (const m of corps.matchAll(/ajoute\(\s*'([A-Z0-9-]+)'/g)) r.add(m[1])
  for (const m of corps.matchAll(/regle: '([A-Z0-9-]+)'/g)) r.add(m[1])
  for (const m of corps.matchAll(/\? '([A-Z0-9-]+)'\s*: '([A-Z0-9-]+)'/g)) {
    r.add(m[1])
    r.add(m[2])
  }
  return r
}

describe('raisons des places à pourvoir', () => {
  it('la liste couvre exactement les règles du vérificateur', () => {
    const lues = reglesDuVerificateur()
    expect(lues.size).toBeGreaterThan(10)
    expect([...lues].sort()).toEqual([...REGLES_BLOCAGE].sort())
  })

  it('exhaustif : chaque raison a une phrase, et un lien ou une mention', () => {
    const vues = new Set<string>()
    for (const regle of REGLES_BLOCAGE) {
      for (const message of MESSAGES[regle]) {
        const r = raisonClaire(regle, message, 7)
        expect(r.phrase.length, `${regle} : ${message}`).toBeGreaterThan(3)
        // Une phrase en clair, pas l'identifiant de la règle.
        expect(r.phrase).not.toMatch(/[A-Z]-[A-Z]/)
        expect(r.phrase).not.toMatch(/[«»—]/)
        if (r.issue.genre === 'lien') {
          expect(r.issue.lien.page).toBe('/planning/equipe')
          expect(r.issue.lien.cible).toMatch(/^salarie-7(\.[a-z]+)?$/)
          expect(r.issue.action.length).toBeGreaterThan(3)
        } else {
          expect(MENTIONS).toContain(r.issue.mention)
        }
        vues.add(r.cle)
      }
    }
    // Deux sens d'une même règle ne se confondent pas au regroupement.
    expect(vues.size).toBe(
      Object.values(MESSAGES).reduce((n, l) => n + l.length, 0) - 2,
    )
  })

  it('où agir, règle par règle (exemples du plan)', () => {
    const issue = (regle: string, message: string) =>
      raisonClaire(regle, message, 3).issue
    expect(issue('REPOS-FIXE', MESSAGES['REPOS-FIXE'][0])).toEqual({
      genre: 'lien',
      lien: { page: '/planning/equipe', cible: 'salarie-3.semaine' },
      action: 'Semaine type',
    })
    expect(issue('HORAIRE-PERSO', MESSAGES['HORAIRE-PERSO'][0])).toMatchObject({
      genre: 'lien',
      action: 'Codes de la fiche',
    })
    expect(issue('HORAIRE-PERSO', MESSAGES['HORAIRE-PERSO'][1])).toMatchObject({
      genre: 'lien',
      action: 'Semaine type',
    })
    const semaine = raisonClaire(
      'R-SEMAINE-MAX',
      MESSAGES['R-SEMAINE-MAX'][0],
      3,
    )
    expect(semaine.phrase).toBe('48 h atteintes dans la semaine')
    expect(semaine.issue).toEqual({
      genre: 'mention',
      mention: 'limite légale',
    })
    // L'école compte dans la semaine : la phrase le dit.
    expect(
      raisonClaire(
        'R-SEMAINE-MAX',
        '36 h dans la semaine, école comprise (14 h), maximum 35 h',
        3,
      ).phrase,
    ).toBe('35 h atteintes dans la semaine, école comprise')
    // Chaque lien mène à la partie de la fiche qui débloque.
    const cible = (regle: string, message: string) => {
      const i = raisonClaire(regle, message, 3).issue
      return i.genre === 'lien' ? i.lien.cible : null
    }
    expect(cible('POSTE', MESSAGES.POSTE[0])).toBe('salarie-3.postes')
    expect(cible('HORS-CONTRAT', MESSAGES['HORS-CONTRAT'][0])).toBe(
      'salarie-3.identite',
    )
    expect(cible('HORAIRE-PERSO', MESSAGES['HORAIRE-PERSO'][0])).toBe(
      'salarie-3.horaires',
    )
    expect(cible('HORAIRE-PERSO', MESSAGES['HORAIRE-PERSO'][1])).toBe(
      'salarie-3.semaine',
    )
    expect(issue('SIXIEME-JOUR', MESSAGES['SIXIEME-JOUR'][0])).toEqual({
      genre: 'mention',
      mention: 'au-delà de son contrat',
    })
    expect(
      raisonClaire('R-JOUR-MAX', MESSAGES['R-JOUR-MAX'][0], 3).phrase,
    ).toBe('Journée trop longue (maximum 10 h)')
    expect(
      raisonClaire('R-REPOS-HEBDO-HCR', MESSAGES['R-REPOS-HEBDO-HCR'][0], 3)
        .phrase,
    ).toBe('Trop de jours dans la semaine (maximum 5 jours)')
    for (const loi of [
      'R-NUIT-MINEUR',
      'R-REPOS-QUOTIDIEN',
      'R-REPOS-HEBDO-35H',
      'R-REPOS-HEBDO-MINEUR',
      'R-SIX-JOURS-MAX',
    ] as const) {
      expect(issue(loi, MESSAGES[loi][0])).toEqual({
        genre: 'mention',
        mention: 'limite légale',
      })
    }
  })

  it('sans règle enfreinte : libre, sans rien affirmer de ses heures', () => {
    const [r] = raisonsClaires(4, [], [])
    expect(r.cle).toBe(RAISON_LIBRE)
    expect(r.phrase).toBe('Libre ce jour-là')
    expect(r.phrase).not.toMatch(/heure|contrat/)
    expect(r.issue).toEqual({ genre: 'mention', mention: 'à placer' })
    expect(estPossible([r])).toBe(true)
  })

  it("repos de 35 h : la semaine elle-même ou la reprise après la semaine d'avant", () => {
    const [dans, avant] = MESSAGES['R-REPOS-HEBDO-35H']
    const a = raisonClaire('R-REPOS-HEBDO-35H', dans, 3)
    const b = raisonClaire('R-REPOS-HEBDO-35H', avant, 3)
    expect(a.phrase).toBe('Pas de repos de 35 h dans la semaine')
    expect(b.phrase).toBe(
      "Reprise trop tôt après le repos de 35 h de la semaine d'avant",
    )
    expect(a.cle).not.toBe(b.cle)
  })

  it('règle inconnue : le message, avec la fiche (jamais muet)', () => {
    const r = raisonClaire('NOUVELLE', 'quelque chose de neuf', 2)
    expect(r.phrase).toBe('Quelque chose de neuf')
    expect(r.issue).toMatchObject({
      genre: 'lien',
      lien: { cible: 'salarie-2' },
    })
  })

  it('doublons retirés ; possible = seulement heures ou appel', () => {
    const l = raisonsClaires(
      1,
      ['R-REPOS-QUOTIDIEN', 'R-REPOS-QUOTIDIEN'],
      [MESSAGES['R-REPOS-QUOTIDIEN'][0], MESSAGES['R-REPOS-QUOTIDIEN'][2]],
    )
    expect(l).toHaveLength(1)
    expect(estPossible(l)).toBe(false)
    expect(estPossible(raisonsClaires(1, [], []))).toBe(true)
    expect(estPossible(raisonsClaires(1, ['EXTRA'], [MESSAGES.EXTRA[0]]))).toBe(
      true,
    )
    expect(
      estPossible(
        raisonsClaires(1, ['SIXIEME-JOUR'], [MESSAGES['SIXIEME-JOUR'][0]]),
      ),
    ).toBe(true)
    expect(
      estPossible(
        raisonsClaires(1, ['REPOS-FIXE'], [MESSAGES['REPOS-FIXE'][0]]),
      ),
    ).toBe(false)
  })
})

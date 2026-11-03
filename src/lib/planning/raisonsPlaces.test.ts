import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  estPossible,
  phraseCommune,
  phrasePlaceAccueil,
  placeAccueilClaire,
  RAISON_LIBRE,
  raisonClaire,
  raisonsClaires,
  REGLES_BLOCAGE,
} from '#/lib/planning/raisonsPlaces.ts'
import type { Mention } from '#/lib/planning/raisonsPlaces.ts'
import {
  analyser,
  idPlaceAccueil,
  POSTE_ID_ACCUEIL,
} from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'
import {
  chiffreHotelAccueil,
  hotelAccueil,
} from '#/lib/planning/test/hotelAccueil.ts'
import type { Referentiel } from '#/lib/planning/types.ts'

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
  'à éviter',
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
  'JOURS-AFFILES': [
    "8 jours de travail d'affilée sans repos (au plus 6 conseillés)",
  ],
  'MINEUR-FERIE': [
    'mineur : travaille un jour férié (permis en hôtellerie, à éviter)',
  ],
  'JOUR-FERIE': ['jour férié du 11/11 travaillé : à rattraper'],
  'R-SEMAINE-MAX': ['50 h dans la semaine, maximum 48 h'],
  'R-JOURNEE-ETOILE': [
    'sa journée étoile est fixée ce jour-là : un horaire de moins de 8 h',
    '2 journées de moins de 8 h dans la semaine, une seule journée étoile prévue au contrat',
  ],
  'R-REPOS-HEBDO-35H': [
    'pas de repos de 35 h consécutives dans la semaine',
    'reprend trop tôt : la semaine précédente perdrait son repos de 35 h consécutives',
  ],
  'R-REPOS-HEBDO-MINEUR': ['mineur : pas deux jours de repos consécutifs'],
  'REPOS-SEPARES': ['ses jours de repos de la semaine ne se suivent pas'],
  'JOUR-ISOLE': ['un jour de travail seul entre deux jours sans travail'],
  'REPOS-COURT': [
    'seulement 12 h 15 de repos entre deux services (13 h conseillées)',
  ],
  'WEEKEND-LIBRE': ['aucun week-end complet libre depuis 4 semaines'],
  MOMENTS: ['3 changements de moment dans la semaine (1 au plus conseillé)'],
  NUITS: ["6 nuits d'affilée (au plus 5 conseillées)"],
  'MEMES-REPOS': [
    'ne garde aucun de ses jours de repos de la semaine précédente',
  ],
  'HEURES-PLUS': [
    'au-delà de son contrat 3 semaines sur 4 : les heures en plus se partagent',
  ],
  'RETOUR-CONGE': ['reprend un week-end après son congé'],
  'ECOLE-ABORDS': ["finit après 21 h la veille d'un jour d'école"],
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
      action: 'Horaires de la fiche',
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

  it('horaire hors de sa fiche : la seule raison montrée, le reste en découle', () => {
    const regles = [
      'HORAIRE-PERSO',
      'R-JOUR-MAX',
      'R-REPOS-QUOTIDIEN',
      'R-SEMAINE-MAX',
      'SIXIEME-JOUR',
      'UN-SERVICE-PAR-JOUR',
    ]
    const l = raisonsClaires(
      1,
      regles,
      regles.map((r) => MESSAGES[r as keyof typeof MESSAGES][0]),
    )
    expect(l.map((r) => r.phrase)).toEqual([
      "Cet horaire n'est pas dans ses horaires",
    ])
    expect(estPossible(l)).toBe(false)
  })

  it('deux raisons de fiche : les deux restent, sans les limites', () => {
    const l = raisonsClaires(
      1,
      ['ABSENCE', 'R-JOUR-MAX', 'HORAIRE-PERSO'],
      [
        MESSAGES.ABSENCE[0],
        MESSAGES['R-JOUR-MAX'][0],
        MESSAGES['HORAIRE-PERSO'][1],
      ],
    )
    expect(l.map((r) => r.cle)).toEqual(['ABSENCE', 'HORAIRE-PERSO:impose'])
  })

  it('déjà placé : une seule phrase, et rien des limites qui en découlent', () => {
    const l = raisonsClaires(
      1,
      [
        'CHEVAUCHEMENT',
        'UN-SERVICE-PAR-JOUR',
        'R-JOUR-MAX',
        'R-REPOS-QUOTIDIEN',
      ],
      [
        MESSAGES.CHEVAUCHEMENT[0],
        MESSAGES['UN-SERVICE-PAR-JOUR'][0],
        MESSAGES['R-JOUR-MAX'][0],
        MESSAGES['R-REPOS-QUOTIDIEN'][2],
      ],
    )
    expect(l.map((r) => r.phrase)).toEqual(['A déjà un shift ce jour-là'])
    // Le chevauchement seul (shift de la veille qui déborde) reste dit.
    expect(
      raisonsClaires(
        1,
        ['CHEVAUCHEMENT', 'R-REPOS-QUOTIDIEN'],
        [MESSAGES.CHEVAUCHEMENT[0], MESSAGES['R-REPOS-QUOTIDIEN'][2]],
      ).map((r) => r.phrase),
    ).toEqual(['Déjà en service à cette heure'])
  })

  it('sans raison décisive : toutes les limites restent', () => {
    const l = raisonsClaires(
      1,
      ['R-JOUR-MAX', 'R-SEMAINE-MAX'],
      [MESSAGES['R-JOUR-MAX'][0], MESSAGES['R-SEMAINE-MAX'][0]],
    )
    expect(l).toHaveLength(2)
  })
})

/*
 * Étape 12 : la table complète, écrite à la main (clé, phrase, issue), pour
 * chaque règle et chaque sens. Le test de mutation laissait passer les clés
 * de regroupement et les règles qui tombaient sans bruit dans le cas par
 * défaut.
 */
describe('table complète des raisons (test de mutation)', () => {
  const lien = (partie: string | null, action: string) => ({
    genre: 'lien',
    lien: {
      page: '/planning/equipe',
      cible: partie ? `salarie-3.${partie}` : 'salarie-3',
    },
    action,
  })
  const mention = (m: Mention) => ({ genre: 'mention', mention: m })
  const CAS: Array<[string, string, string, string, unknown]> = [
    [
      'POSTE',
      'ne tient pas ce poste',
      'POSTE',
      'Ne tient pas ce poste',
      lien('postes', 'Postes de la fiche'),
    ],
    [
      'HORS-CONTRAT',
      'x',
      'HORS-CONTRAT',
      'Hors des dates de son contrat',
      lien('identite', 'Dates du contrat'),
    ],
    [
      'ABSENCE',
      'x',
      'ABSENCE',
      "Absent ou à l'école ce jour-là",
      mention('absence posée'),
    ],
    [
      'REPOS-FIXE',
      'x',
      'REPOS-FIXE',
      'En repos fixe ce jour-là',
      lien('semaine', 'Semaine type'),
    ],
    [
      'HORAIRE-PERSO',
      'un autre horaire est prévu ce jour-là',
      'HORAIRE-PERSO:impose',
      'Un autre horaire est fixé ce jour-là',
      lien('semaine', 'Semaine type'),
    ],
    [
      'HORAIRE-PERSO',
      'cet horaire ne fait pas partie des siens',
      'HORAIRE-PERSO:fiche',
      "Cet horaire n'est pas dans ses horaires",
      lien('horaires', 'Horaires de la fiche'),
    ],
    [
      'R-JOUR-MAX',
      'journée de 11 h, maximum 10 h 30',
      'R-JOUR-MAX',
      'Journée trop longue (maximum 10 h 30)',
      mention('limite légale'),
    ],
    [
      'R-JOUR-MAX',
      'journée trop longue',
      'R-JOUR-MAX',
      'Journée trop longue',
      mention('limite légale'),
    ],
    [
      'R-NUIT-MINEUR',
      'x',
      'R-NUIT-MINEUR',
      'Mineur : pas de travail de nuit',
      mention('limite légale'),
    ],
    [
      'R-REPOS-QUOTIDIEN',
      'x',
      'R-REPOS-QUOTIDIEN',
      'Pas assez de repos avec un autre shift',
      mention('limite légale'),
    ],
    [
      'CHEVAUCHEMENT',
      'x',
      'CHEVAUCHEMENT',
      'Déjà en service à cette heure',
      mention('déjà placé'),
    ],
    [
      'UN-SERVICE-PAR-JOUR',
      'x',
      'UN-SERVICE-PAR-JOUR',
      'A déjà un shift ce jour-là',
      mention('déjà placé'),
    ],
    [
      'R-SIX-JOURS-MAX',
      '7 jours travaillés, maximum 6',
      'R-SIX-JOURS-MAX',
      'Trop de jours dans la semaine (maximum 6 jours)',
      mention('limite légale'),
    ],
    [
      'R-SIX-JOURS-MAX',
      'trop de jours',
      'R-SIX-JOURS-MAX',
      'Trop de jours dans la semaine',
      mention('limite légale'),
    ],
    [
      'R-REPOS-HEBDO-HCR',
      '11 jours sur deux semaines',
      'R-REPOS-HEBDO-HCR:deux',
      'Trop de jours sur deux semaines',
      mention('limite légale'),
    ],
    [
      'SIXIEME-JOUR',
      'x',
      'SIXIEME-JOUR',
      'Ce serait un 6e jour',
      mention('au-delà de son contrat'),
    ],
    [
      'R-SEMAINE-MAX',
      'trop d’heures',
      'R-SEMAINE-MAX',
      'Heures de la semaine atteintes',
      mention('limite légale'),
    ],
    [
      'R-JOURNEE-ETOILE',
      'sa journée étoile est fixée ce jour-là : un horaire de moins de 8 h',
      'R-JOURNEE-ETOILE:fixee',
      'Sa journée étoile est fixée ce jour-là',
      lien('semaine', 'Semaine type'),
    ],
    [
      'R-JOURNEE-ETOILE',
      '2 journées de moins de 8 h',
      'R-JOURNEE-ETOILE:nombre',
      'Une seule journée étoile au contrat',
      mention('au-delà de son contrat'),
    ],
    [
      'R-REPOS-HEBDO-35H',
      'x',
      'R-REPOS-HEBDO-35H',
      'Pas de repos de 35 h dans la semaine',
      mention('limite légale'),
    ],
    [
      'R-REPOS-HEBDO-MINEUR',
      'x',
      'R-REPOS-HEBDO-MINEUR',
      'Mineur : deux jours de repos de suite',
      mention('limite légale'),
    ],
    ['EXTRA', 'x', 'EXTRA', 'Extra libre', mention('à appeler')],
    [
      'INCONNUE',
      'règle à venir',
      'INCONNUE|règle à venir',
      'Règle à venir',
      lien(null, 'Fiche'),
    ],
    ['LIBRE', '', 'LIBRE', 'Libre ce jour-là', mention('à placer')],
  ]

  it.each(CAS)('%s (%s)', (regle, message, cle, phrase, issue) => {
    expect(raisonClaire(regle, message, 3)).toEqual({ cle, phrase, issue })
  })

  it('RAISON_LIBRE vaut LIBRE', () => {
    expect(RAISON_LIBRE).toBe('LIBRE')
  })

  it('raisonsClaires : doublons retirés, règle manquante = message seul', () => {
    const l = raisonsClaires(
      3,
      ['R-NUIT-MINEUR', 'R-NUIT-MINEUR', 'R-JOUR-MAX'],
      ['nuit', 'nuit encore', 'journée de 11 h', 'cas sans règle'],
    )
    expect(l.map((r) => r.cle)).toEqual([
      'R-NUIT-MINEUR',
      'R-JOUR-MAX',
      '|cas sans règle',
    ])
    expect(l[2].phrase).toBe('Cas sans règle')
  })

  it('estPossible : toutes les raisons doivent le permettre', () => {
    const libre = raisonClaire('LIBRE', '', 3)
    const sixieme = raisonClaire('SIXIEME-JOUR', 'x', 3)
    const loi = raisonClaire('R-NUIT-MINEUR', 'x', 3)
    const poste = raisonClaire('POSTE', 'x', 3)
    expect(estPossible([libre, sixieme])).toBe(true)
    expect(estPossible([sixieme, loi])).toBe(false)
    expect(estPossible([poste])).toBe(false)
    expect(estPossible([raisonClaire('EXTRA', 'x', 3)])).toBe(true)
  })
})

describe('place que rien ne remplit : la raison commune en clair', () => {
  // Ne bloquent pas : quelqu'un peut prendre la place (ses heures ou un
  // appel mis à part), « Je ne peux pas » serait faux.
  const NON_BLOQUANTES = [
    'SIXIEME-JOUR',
    'JOURS-AFFILES',
    'MINEUR-FERIE',
    'JOUR-FERIE',
    'R-JOURNEE-ETOILE',
    'EXTRA',
    // Règles morales du PRD : à éviter, jamais bloquantes.
    'REPOS-SEPARES',
    'JOUR-ISOLE',
    'REPOS-COURT',
    'WEEKEND-LIBRE',
    'MOMENTS',
    'NUITS',
    'MEMES-REPOS',
    'HEURES-PLUS',
    'RETOUR-CONGE',
    'ECOLE-ABORDS',
  ]

  it('exhaustif : une phrase courte pour chaque règle qui bloque', () => {
    for (const regle of REGLES_BLOCAGE) {
      const p = phraseCommune(regle)
      if (NON_BLOQUANTES.includes(regle)) {
        expect(p, regle).toBeNull()
        continue
      }
      expect(p, regle).toMatch(/^[A-Z][^«»—]{8,70}\.$/)
      expect(p).not.toMatch(/[A-Z]-[A-Z]|\bIA\b/)
    }
  })

  it('exemples', () => {
    expect(phraseCommune('R-REPOS-QUOTIDIEN')).toBe(
      "Personne n'a assez de repos avec ses autres shifts.",
    )
    expect(phraseCommune('UN-SERVICE-PAR-JOUR')).toBe(
      'Tout le monde a déjà un shift ce jour-là.',
    )
    expect(phraseCommune('R-SIX-JOURS-MAX')).toBe(
      'Tout le monde a déjà trop de jours de travail.',
    )
  })

  it('inconnue, vide ou héritée de l’objet : rien', () => {
    expect(phraseCommune(null)).toBeNull()
    expect(phraseCommune(undefined)).toBeNull()
    expect(phraseCommune('')).toBeNull()
    expect(phraseCommune('R-INCONNUE')).toBeNull()
    expect(phraseCommune('toString')).toBeNull()
  })
})

/*
 * Moment de l'accueil incomplet (plan planning-accueil-2026-11-01, étape 4) :
 * la place n'est plus un besoin mais le chiffre d'un moment. Phrase lisible,
 * raison, et « Prenez un extra ou changez un shift. » si personne ne peut.
 * Oracles écrits à la main ; l'analyse est celle d'un hôtel fictif.
 */
describe('places de l’accueil à pourvoir', () => {
  const LUNDI = '2026-09-07'
  const donnees = (r: Referentiel): DonneesSemaine => ({
    lundi: LUNDI,
    referentiel: r,
    absences: [],
    affectations: [],
    avant: [],
    apres: [],
  })
  const deLAccueil = (r: Referentiel) =>
    analyser(donnees(r)).a_pourvoir.filter((a) => a.moment !== undefined)

  it('phrases : singulier, pluriel, la nuit', () => {
    expect(phrasePlaceAccueil({ jour: 1, manquant: 1, moment: 'matin' })).toBe(
      "Il manque 1 personne mardi matin à l'accueil.",
    )
    expect(phrasePlaceAccueil({ jour: 6, manquant: 2, moment: 'soir' })).toBe(
      "Il manque 2 personnes dimanche soir à l'accueil.",
    )
    expect(phrasePlaceAccueil({ jour: 0, manquant: 1, moment: 'nuit' })).toBe(
      "Il manque 1 personne la nuit de lundi à l'accueil.",
    )
  })

  it('une semaine vide : une place par moment demandé, tout le monde libre', () => {
    const r = hotelAccueil(true)
    const places = deLAccueil(r)
    const attendu = [0, 1, 2, 3, 4, 5, 6].flatMap((j) =>
      (['matin', 'soir', 'nuit'] as const).map((m) => ({
        jour: j,
        moment: m,
        manquant: chiffreHotelAccueil(j, m),
      })),
    )
    expect(
      places.map((a) => ({
        jour: a.jour,
        moment: a.moment,
        manquant: a.manquant,
      })),
    ).toEqual(attendu)
    // Identifiants négatifs et uniques, aucun poste, aucun horaire imposé.
    expect(new Set(places.map((a) => a.besoin_id)).size).toBe(places.length)
    expect(places.every((a) => a.besoin_id < 0)).toBe(true)
    expect(places.every((a) => a.poste_id === POSTE_ID_ACCUEIL)).toBe(true)
    expect(places.every((a) => a.type_shift_id === null)).toBe(true)
    const mardiMatin = places.find((a) => a.jour === 1 && a.moment === 'matin')!
    expect(mardiMatin.besoin_id).toBe(idPlaceAccueil(1, 'matin'))
    expect(mardiMatin.raison_commune).toBeNull()
    expect(placeAccueilClaire({ ...mardiMatin, moment: 'matin' })).toEqual({
      phrase: "Il manque 3 personnes mardi matin à l'accueil.",
      raison: null,
      conseil: null,
    })
    // Les apprentis ne sont pas listés (jamais seuls), les extras si.
    const noms = new Map(r.salaries.map((s) => [s.id, s]))
    const listes = mardiMatin.raisons.map((x) => noms.get(x.salarie_id)!)
    expect(listes.some((s) => s.type_contrat === 'apprenti')).toBe(false)
    expect(listes.some((s) => s.type_contrat === 'extra')).toBe(true)
    // La nuit : la Veille et ses dépannages seulement (D10).
    const nuit = places.find((a) => a.jour === 1 && a.moment === 'nuit')!
    const veille = r.postes.find((p) => p.categorie === 'veille_nuit')!.id
    for (const x of nuit.raisons)
      expect(
        noms.get(x.salarie_id)!.competences.some((c) => c.poste_id === veille),
      ).toBe(true)
  })

  it('personne ne peut venir : la raison commune et le conseil', () => {
    const r = hotelAccueil(true)
    for (const s of r.salaries) s.semaine_type[1] = { mode: 'repos' }
    const mardi = deLAccueil(r).filter((a) => a.jour === 1)
    expect(mardi).toHaveLength(3)
    for (const a of mardi) {
      expect(a.raison_commune).toBe('REPOS-FIXE')
      expect(placeAccueilClaire({ ...a, moment: a.moment! })).toEqual({
        phrase: phrasePlaceAccueil({ ...a, moment: a.moment! }),
        raison: 'Tout le monde est en repos fixe ce jour-là.',
        conseil: 'Prenez un extra ou changez un shift.',
      })
    }
    // Refusé : le lundi, quelqu'un peut, ni raison ni conseil.
    const lundi = deLAccueil(r).find((a) => a.jour === 0)!
    expect(
      placeAccueilClaire({ ...lundi, moment: lundi.moment! }).conseil,
    ).toBe(null)
  })

  it('aucun horaire possible ; personne de listé', () => {
    const base = {
      jour: 2,
      manquant: 1,
      moment: 'matin' as const,
      raison_commune: null,
    }
    expect(placeAccueilClaire({ ...base, raisons: [], debut: '' })).toEqual({
      phrase: "Il manque 1 personne mercredi matin à l'accueil.",
      raison: "Aucun horaire du matin n'est possible à l'accueil.",
      conseil: 'Prenez un extra ou changez un shift.',
    })
    expect(
      placeAccueilClaire({ ...base, moment: 'nuit', raisons: [], debut: '' })
        .raison,
    ).toBe("Aucun horaire de nuit n'est possible à l'accueil.")
    expect(
      placeAccueilClaire({ ...base, raisons: [], debut: '07:00' }).raison,
    ).toBe("Personne ne peut venir à l'accueil.")
    // Quelqu'un de libre : rien à conseiller.
    expect(
      placeAccueilClaire({
        ...base,
        debut: '07:00',
        raisons: [{ salarie_id: 1, messages: [], regles: [] }],
      }),
    ).toEqual({
      phrase: "Il manque 1 personne mercredi matin à l'accueil.",
      raison: null,
      conseil: null,
    })
  })

  it('un moment tenu ne donne aucune place ; sans tableau, aucune', () => {
    const r = hotelAccueil(true)
    r.consignes = r.consignes.map((c) => ({ ...c, minimum: 0, maximum: 0 }))
    expect(deLAccueil(r)).toEqual([])
    expect(deLAccueil(hotelAccueil(false))).toEqual([])
  })
})

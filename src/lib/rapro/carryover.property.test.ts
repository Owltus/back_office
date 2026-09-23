import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { carryOver } from '#/lib/rapro/carryover.ts'
import type { DaySnapshot } from '#/lib/rapro/carryover.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

/*
 * Test basé sur les propriétés pour carryOver (carryover.ts).
 *
 * Idempotence : `carryOver` est une fonction PURE d'une fenêtre d'instantanés
 * déjà chargés (aucun horodatage courant, aucun aléa, aucun effet de bord) —
 * appeler deux fois sur EXACTEMENT la même entrée doit donc rendre EXACTEMENT
 * le même ensemble de chambres reportées.
 */

const ROOM_NUMBERS = [101, 102, 103, 210, 211, 305, 414, 512]
const STATUSES: RoomStatus[] = [
  'nettoyee',
  'non_nettoyee',
  'refus',
  'rattrapage',
  'non_vendue',
]

const statusEntryArb = fc.tuple(
  fc.constantFrom(...ROOM_NUMBERS),
  fc.constantFrom(...STATUSES),
)

const snapshotArb: fc.Arbitrary<DaySnapshot> = fc.record({
  statuses: fc
    .uniqueArray(statusEntryArb, { selector: (e) => e[0], maxLength: 8 })
    .map((entries) => new Map(entries)),
  carriedManual: fc
    .uniqueArray(fc.constantFrom(...ROOM_NUMBERS), { maxLength: 8 })
    .map((rooms) => new Set(rooms)),
})

const pastArb = fc.array(snapshotArb, { minLength: 0, maxLength: 10 })

describe('carryOver — idempotence', () => {
  it('appeler deux fois sur la même fenêtre rend le même Set', () => {
    fc.assert(
      fc.property(pastArb, (past) => {
        const first = carryOver(past)
        const second = carryOver(past)
        expect(second).toEqual(first)
      }),
      { numRuns: 1000 },
    )
  })
})

/*
 * Insensibilité aux jours PRÉ-HISTORIQUES — la propriété qui autorise
 * `DayCrossSummary` à se passer de la lecture `['rapro','oldest']`.
 *
 * Le composant bornait sa fenêtre de roulement au plus ancien jour enregistré
 * (`fetchOldestDay`), ce qui créait une CASCADE : tant que cette lecture
 * n'était pas revenue, `carryoverWindow` rendait une fenêtre vide et la lecture
 * des lignes restait désactivée. Mesuré en production le 2026-09-23 sur
 * /repjour : un aller-retour complet perdu, en série, au milieu d'une salve.
 *
 * La borne est inutile au RÉSULTAT, et c'est ce que ce test établit. Un jour
 * antérieur au premier enregistrement n'a, par construction, aucune ligne :
 * son instantané est vide. Or un instantané vide n'origine aucun roulement
 * (ni `non_nettoyee`, ni `carriedManual`) et `isResolved` le traite comme
 * « résolu » — le `status` y vaut `undefined`, donc `undefined !== 'non_nettoyee'`.
 *
 * Préfixer la fenêtre de tels jours ne peut donc rien changer. Si cette
 * propriété tombait un jour, la borne `oldest` devrait être RÉTABLIE dans
 * `DayCrossSummary` avant toute autre correction.
 */
const jourVide = (): DaySnapshot => ({
  statuses: new Map(),
  carriedManual: new Set(),
})

describe('carryOver — insensibilité aux jours pré-historiques', () => {
  it('préfixer des jours vides ne change pas le résultat', () => {
    fc.assert(
      fc.property(pastArb, fc.integer({ min: 0, max: 7 }), (past, combien) => {
        const rembourre = [
          ...Array.from({ length: combien }, jourVide),
          ...past,
        ]
        expect(carryOver(rembourre)).toEqual(carryOver(past))
      }),
      { numRuns: 1000 },
    )
  })

  it('une fenêtre ENTIÈREMENT pré-historique ne reporte rien', () => {
    // Cas de l'hôtel qui vient d'ouvrir : aucun jour antérieur n'a de ligne.
    expect(carryOver(Array.from({ length: 7 }, jourVide))).toEqual(new Set())
  })

  it('un jour vide INTERMÉDIAIRE résout, lui — à ne pas confondre', () => {
    // Contre-exemple délibéré : la propriété ci-dessus vaut pour les jours
    // AJOUTÉS EN TÊTE, jamais pour un trou au milieu. Un jour sans ligne entre
    // l'origine et aujourd'hui vaut « nettoyée par défaut » et CLÔT le
    // roulement. C'est le bug de la chambre 414, corrigé le 2026-07-21.
    const avecTrou: DaySnapshot[] = [
      { statuses: new Map([[305, 'non_nettoyee']]), carriedManual: new Set() },
      jourVide(),
    ]
    expect(carryOver(avecTrou)).toEqual(new Set())
    // Sans le trou, la chambre roule bien.
    expect(carryOver([avecTrou[0]])).toEqual(new Set([305]))
  })
})

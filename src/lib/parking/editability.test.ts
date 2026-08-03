import { describe, expect, it } from 'vitest'

import {
  canCreateReservation,
  canEditReservation,
  clampSpanToEditable,
  isReservationCurrent,
} from '#/lib/parking/editability.ts'
import { PARKING_GRACE_DAYS } from '#/lib/permissions/actions.ts'

// Repère : tout est en décalage de jours vs le lundi de référence. On fixe
// « aujourd'hui » à l'offset 100 ; la borne d'actualité est donc
// departure >= 100 - 7 = 93 (departure = startDay + nights).
const TODAY = 100
const FLOOR = TODAY - PARKING_GRACE_DAYS // 93

describe('isReservationCurrent — borne sur la date de fin', () => {
  it('futur : départ après aujourd’hui → d’actualité', () => {
    expect(isReservationCurrent({ startDay: 105, nights: 2 }, TODAY)).toBe(true)
  })

  it('en cours : séjour long commencé bien avant, départ futur → d’actualité', () => {
    // Commencé il y a 2 j (98), 10 nuits → départ 108, toujours en cours.
    expect(isReservationCurrent({ startDay: 98, nights: 10 }, TODAY)).toBe(true)
  })

  it('terminé il y a 6 j (départ 94 ≥ 93) → encore dans la grâce', () => {
    expect(isReservationCurrent({ startDay: 92, nights: 2 }, TODAY)).toBe(true)
  })

  it('pile à la borne (départ 93) → encore éditable', () => {
    expect(isReservationCurrent({ startDay: 91, nights: 2 }, TODAY)).toBe(true)
    expect(FLOOR).toBe(93)
  })

  it('terminé il y a 8 j (départ 92 < 93) → passé verrouillé', () => {
    expect(isReservationCurrent({ startDay: 90, nights: 2 }, TODAY)).toBe(false)
  })
})

describe('canEditReservation — niveau requis + fenêtre', () => {
  const current = { startDay: 105, nights: 2 } // futur
  const locked = { startDay: 90, nights: 2 } // départ 92, verrouillé

  it('lecture : jamais', () => {
    expect(canEditReservation(current, TODAY, 'lecture')).toBe(false)
    expect(canEditReservation(locked, TODAY, 'lecture')).toBe(false)
  })

  it('null/undefined : jamais', () => {
    expect(canEditReservation(current, TODAY, null)).toBe(false)
    expect(canEditReservation(current, TODAY, undefined)).toBe(false)
  })

  it('ecriture : l’actualité oui, le passé figé non', () => {
    expect(canEditReservation(current, TODAY, 'ecriture')).toBe(true)
    expect(canEditReservation(locked, TODAY, 'ecriture')).toBe(false)
  })

  it('gestion : tout, y compris le passé figé', () => {
    expect(canEditReservation(current, TODAY, 'gestion')).toBe(true)
    expect(canEditReservation(locked, TODAY, 'gestion')).toBe(true)
  })

  it('création/collage : mêmes règles sur le séjour visé', () => {
    // Créer une résa 1 nuit sur un jour passé au-delà de la grâce → gestion requise.
    const farPast = { startDay: TODAY - 9, nights: 1 } // départ 92
    expect(canEditReservation(farPast, TODAY, 'ecriture')).toBe(false)
    expect(canEditReservation(farPast, TODAY, 'gestion')).toBe(true)
  })
})

describe('canCreateReservation — l’arrivée doit être dans la zone éditable', () => {
  it('ecriture : arrivée avant le plancher refusée, à partir du plancher acceptée', () => {
    expect(canCreateReservation(FLOOR - 1, TODAY, 'ecriture')).toBe(false)
    expect(canCreateReservation(FLOOR, TODAY, 'ecriture')).toBe(true)
    expect(canCreateReservation(TODAY + 3, TODAY, 'ecriture')).toBe(true)
  })

  it('gestion : peut créer dans le passé verrouillé ; lecture : jamais', () => {
    expect(canCreateReservation(FLOOR - 30, TODAY, 'gestion')).toBe(true)
    expect(canCreateReservation(TODAY + 3, TODAY, 'lecture')).toBe(false)
  })
})

describe('clampSpanToEditable — le geste ne réécrit pas le passé (écriture)', () => {
  it('gestion : aucun bornage', () => {
    const proposed = { startDay: TODAY - 40, nights: 2 }
    expect(clampSpanToEditable(proposed, { startDay: TODAY, nights: 2 }, 'move', TODAY, 'gestion')).toEqual(proposed)
  })

  it('move : le début est ramené au plancher, la durée est conservée', () => {
    // Résa présente (start 98) tirée à 70 → bornée au plancher 93, nights inchangé.
    const orig = { startDay: 98, nights: 2 }
    expect(
      clampSpanToEditable({ startDay: 70, nights: 2 }, orig, 'move', TODAY, 'ecriture'),
    ).toEqual({ startDay: FLOOR, nights: 2 })
  })

  it('move : un séjour en cours ne peut pas reculer plus loin que son origine', () => {
    // Ongoing démarré à -20 (avant le plancher) : le début ne peut pas passer sous -20.
    const orig = { startDay: TODAY - 20, nights: 30 }
    expect(
      clampSpanToEditable({ startDay: TODAY - 25, nights: 30 }, orig, 'move', TODAY, 'ecriture'),
    ).toEqual({ startDay: TODAY - 20, nights: 30 })
    // Avancer reste libre.
    expect(
      clampSpanToEditable({ startDay: TODAY - 3, nights: 30 }, orig, 'move', TODAY, 'ecriture'),
    ).toEqual({ startDay: TODAY - 3, nights: 30 })
  })

  it('resize-left : début borné au plancher, la fin reste fixe', () => {
    // Fin fixe = 100 (start 98 + nights 2). Tirer le bord gauche à 70 → start=93,
    // nights recalculé pour garder la fin à 100.
    const orig = { startDay: 98, nights: 2 }
    expect(
      clampSpanToEditable({ startDay: 70, nights: 30 }, orig, 'resize-left', TODAY, 'ecriture'),
    ).toEqual({ startDay: FLOOR, nights: 100 - FLOOR })
  })

  it('resize-right : la fin ne peut pas être ramenée sous le plancher', () => {
    // Séjour en cours (start -20). Réduire jusqu’à finir avant le plancher est borné
    // à une durée qui pose la fin pile au plancher.
    const orig = { startDay: TODAY - 20, nights: 30 }
    const res = clampSpanToEditable(
      { startDay: TODAY - 20, nights: 1 },
      orig,
      'resize-right',
      TODAY,
      'ecriture',
    )
    expect(res.startDay + res.nights).toBe(FLOOR)
  })
})

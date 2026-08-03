import { describe, expect, it } from 'vitest'

import {
  canEditReservation,
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

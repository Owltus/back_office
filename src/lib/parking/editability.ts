import { PARKING_GRACE_DAYS } from '#/lib/permissions/actions.ts'
import { atLeastLevel } from '#/lib/permissions/levels.ts'
import type { PageLevel } from '#/lib/permissions/levels.ts'

/* --------------------------------------------------------------------------
 * Éditabilité temporelle d'une réservation parking (pur : sans React).
 *
 * Règle métier : `ecriture` agit sur l'actualité (présent, futur, passé récent
 * et séjours encore en cours) ; `gestion` débloque en plus le passé verrouillé.
 * La bascule se fait sur la DATE DE FIN de séjour (départ = `startDay + nights`,
 * modèle demi-journées : départ le matin du jour startDay+nights) : une résa
 * dont le départ n'est pas antérieur de plus de PARKING_GRACE_DAYS jours à
 * aujourd'hui reste « d'actualité » — ce qui garde éditables les longs séjours
 * commencés il y a plus de 7 jours mais toujours en cours.
 *
 * Tout est exprimé en décalage de jours par rapport au lundi de référence du
 * board (même repère que Reservation.startDay et todayOffset). Miroir exact de
 * la borne RLS `(start_date + nights) >= current_date - 7`.
 * ------------------------------------------------------------------------ */

type Span = { startDay: number; nights: number }

/** La résa est-elle encore d'actualité (départ ≥ aujourd'hui − grâce) ? */
export function isReservationCurrent(res: Span, todayOffset: number): boolean {
  const departure = res.startDay + res.nights
  return departure >= todayOffset - PARKING_GRACE_DAYS
}

/**
 * Le niveau `level` autorise-t-il à modifier CETTE réservation (existante ou
 * en projet) ? `gestion` peut tout ; `ecriture` seulement l'actualité ; en
 * dessous, jamais. Sert aussi bien à modifier une résa qu'à en créer/coller une
 * (on passe alors le séjour visé).
 */
export function canEditReservation(
  res: Span,
  todayOffset: number,
  level: PageLevel | null | undefined,
): boolean {
  if (atLeastLevel(level, 'gestion')) return true
  if (!atLeastLevel(level, 'ecriture')) return false
  return isReservationCurrent(res, todayOffset)
}

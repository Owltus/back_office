import { PARKING_GRACE_DAYS } from '#/lib/permissions/actions.ts'
import { atLeastLevel } from '#/lib/permissions/levels.ts'
import type { PageLevel } from '#/lib/permissions/levels.ts'
import type { Mode } from '#/lib/parking/model.ts'

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

/**
 * Créer/coller une réservation : l'ARRIVÉE (jour de début) doit être dans la zone
 * éditable (≥ aujourd'hui − grâce). `gestion` peut créer dans le passé verrouillé ;
 * `ecriture` non (on ne back-date pas une arrivée) ; en dessous, jamais.
 */
export function canCreateReservation(
  startDay: number,
  todayOffset: number,
  level: PageLevel | null | undefined,
): boolean {
  if (atLeastLevel(level, 'gestion')) return true
  if (!atLeastLevel(level, 'ecriture')) return false
  return startDay >= todayOffset - PARKING_GRACE_DAYS
}

/**
 * Restreint un déplacement/redimensionnement au domaine éditable en `ecriture` :
 *   - le DÉBUT ne peut pas reculer dans le passé verrouillé plus loin qu'il ne
 *     l'est déjà (empêche d'étirer/glisser une résa présente vers les jours figés) ;
 *   - la FIN ne peut pas être ramenée sous le plancher (redimensionnement droit).
 * `gestion` n'est pas restreinte. La géométrie dépend du `mode` : `move` conserve
 * la durée, `resize-left` conserve la fin, `resize-right` conserve le début.
 * Renvoie le séjour corrigé (jamais au-delà des bornes autorisées).
 */
export function clampSpanToEditable(
  proposed: Span,
  orig: Span,
  mode: Mode,
  todayOffset: number,
  level: PageLevel | null | undefined,
): Span {
  if (atLeastLevel(level, 'gestion')) return proposed
  const floor = todayOffset - PARKING_GRACE_DAYS

  if (mode === 'resize-right') {
    // Début fixe : empêcher la fin (start + nights) de passer sous le plancher.
    const minNights = Math.max(1, floor - orig.startDay)
    return {
      startDay: proposed.startDay,
      nights: Math.max(proposed.nights, minNights),
    }
  }

  // move / resize-left : le début ne peut pas reculer sous min(origine, plancher).
  const minStart = Math.min(orig.startDay, floor)
  if (proposed.startDay >= minStart) return proposed
  if (mode === 'move') {
    // La durée est conservée ; on borne seulement le début.
    return { startDay: minStart, nights: proposed.nights }
  }
  // resize-left : la fin (orig.startDay + orig.nights) reste fixe.
  const end = orig.startDay + orig.nights
  return { startDay: minStart, nights: end - minStart }
}

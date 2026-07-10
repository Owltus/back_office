/*
 * Helpers de navigation par jour du Rapprochement — version « jour seul » de la
 * timeline de la caisse (pas de shift). La date-string 'YYYY-MM-DD' EST la clé :
 * elle se compare lexicalement comme chronologiquement, donc aucune notion de
 * rang. Tout est calculé en heure locale du navigateur (comme la caisse).
 */

import { formatDateStr } from '#/lib/poster/dateFormatter.ts'
import { businessNow } from '#/lib/businessDay.ts'

/**
 * Jour hôtelier courant au format 'YYYY-MM-DD'. La journée bascule à 02h et non à
 * minuit (`businessNow`) : entre minuit et 02h, on reste sur la veille — c'est
 * encore elle qu'on rapproche, et le jour suivant n'est pas « ouvert ». Sert de
 * jour affiché par défaut ET de borne la plus récente de la navigation.
 */
export function today(now = new Date()): string {
  return formatDateStr(businessNow(now))
}

/** 'YYYY-MM-DD' décalé de `delta` jours. */
export function addDays(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return formatDateStr(d)
}

/** Contraint une date dans [min, max] (comparaison lexicale = chronologique). */
export function clampDay(date: string, min: string, max: string): string {
  if (date > max) return max
  if (date < min) return min
  return date
}

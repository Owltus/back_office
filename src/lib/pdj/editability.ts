import { PDJ_GRACE_DAYS } from '#/lib/permissions/actions.ts'
import { atLeastLevel } from '#/lib/permissions/levels.ts'
import type { PageLevel } from '#/lib/permissions/levels.ts'

/* --------------------------------------------------------------------------
 * Éditabilité d'un jour de PDJ (pur : sans React). Même principe que le
 * rapprochement et la caisse — la bascule se fait sur la DATE DE SERVICE.
 *
 *   - lecture  : consultation seule (aucune saisie).
 *   - ecriture : coche/sert les petits-déjeuners uniquement dans la FENÊTRE de
 *     grâce (aujourd'hui et les PDJ_GRACE_DAYS jours précédents). Au-delà dans le
 *     passé : bloqué.
 *   - gestion  : agit sur n'importe quel jour.
 *
 * Dates en 'YYYY-MM-DD' (comparaison lexicale = chronologique). Miroir de la borne
 * RLS `service_date >= current_date - PDJ_GRACE_DAYS`.
 * ------------------------------------------------------------------------ */

/** 'YYYY-MM-DD' décalé de `delta` jours (heure locale). */
function shiftDay(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Le jour de service est-il dans la fenêtre d'action de l'écriture ? */
export function isPdjDayWithinGrace(date: string, today: string): boolean {
  return date >= shiftDay(today, -PDJ_GRACE_DAYS)
}

/**
 * L'utilisateur peut-il cocher/servir ce jour de PDJ ? gestion : toujours ;
 * ecriture : seulement dans la fenêtre ; en dessous (lecture) : jamais.
 */
export function canEditPdjDay(
  date: string,
  today: string,
  level: PageLevel | null | undefined,
): boolean {
  if (atLeastLevel(level, 'gestion')) return true
  if (!atLeastLevel(level, 'ecriture')) return false
  return isPdjDayWithinGrace(date, today)
}

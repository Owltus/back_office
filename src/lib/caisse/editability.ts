import { CAISSE_GRACE_DAYS } from '#/lib/permissions/actions.ts'
import { atLeastLevel } from '#/lib/permissions/levels.ts'
import type { PageLevel } from '#/lib/permissions/levels.ts'
import { addDays, dateStr } from '#/lib/caisse/shift.ts'

/* --------------------------------------------------------------------------
 * Éditabilité d'un jour de caisse (pur : sans React). Même principe que le
 * rapprochement, mais fenêtre plus COURTE — la bascule se fait sur le JOUR de la
 * feuille (report_date), pas sur un délai après validation.
 *
 *   - lecture  : consultation seule (aucune action).
 *   - ecriture : agit uniquement dans la FENÊTRE de grâce — la feuille doit être
 *     dans les CAISSE_GRACE_DAYS derniers jours (aujourd'hui et J-1 SEULEMENT).
 *     Dans cette fenêtre : saisir, clôturer, rouvrir puis re-clôturer. Dès J-2 dans
 *     le passé : AUCUNE modification, même si la feuille n'est pas clôturée.
 *   - gestion  : agit sur n'importe quel jour (dont réouverture d'une caisse
 *     clôturée hors fenêtre — l'ancien « admin »).
 *
 * Dates en 'YYYY-MM-DD' (comparaison lexicale = chronologique). Miroir de la borne
 * RLS `report_date >= current_date - CAISSE_GRACE_DAYS`.
 * ------------------------------------------------------------------------ */

/** Le jour de la feuille est-il dans la fenêtre d'action de l'écriture ? */
export function isCaisseDayWithinGrace(date: string, today: string): boolean {
  return date >= addDays(today, -CAISSE_GRACE_DAYS)
}

/**
 * L'utilisateur peut-il agir sur CE jour de caisse (saisir, clôturer, rouvrir) ?
 * gestion : toujours ; ecriture : seulement dans la fenêtre ; en dessous : jamais.
 */
export function canActOnCaisseDay(
  date: string,
  today: string,
  level: PageLevel | null | undefined,
): boolean {
  if (atLeastLevel(level, 'gestion')) return true
  if (!atLeastLevel(level, 'ecriture')) return false
  return isCaisseDayWithinGrace(date, today)
}

/**
 * « Aujourd'hui » au sens de la fenêtre d'écriture : la date CALENDAIRE locale,
 * miroir de `current_date` dans la RLS. PAS `currentSlot(now).date` : entre 02h
 * et 12h, le shift affiché est la nuit de la VEILLE, et borner sur cette date
 * faisait paraître J-2 modifiable alors que la base refusait chaque sauvegarde.
 */
export function caisseWindowToday(now: Date): string {
  return dateStr(now)
}

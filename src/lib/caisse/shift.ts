/*
 * Logique de shift de la caisse : quel shift selon l'heure, et navigation dans
 * la timeline (date, shift).
 *
 * Cycle d'une journée, dans l'ordre chronologique :
 *   matin  08h → 15h
 *   soir   15h → 23h
 *   nuit   23h → 07h (du lendemain)
 *
 * La nuit est RATTACHÉE au jour où elle commence (23h de J). Ainsi 02h du matin
 * relève de la nuit de J-1. La tranche 07h → 08h (creux entre la fin de nuit et
 * le début du matin) est encore comptée comme la nuit précédente.
 */

import type { Shift } from '#/lib/caisse/types.ts'

/** Ordre chronologique des shifts dans une journée. */
export const SHIFT_ORDER: ReadonlyArray<Shift> = ['matin', 'soir', 'nuit']

/** Clé chronologique d'un couple (date, shift), comparable lexicalement
 * ('YYYY-MM-DD#rang') : rang unique dans la timeline pour comparer / trier /
 * borner des slots. Source unique du « rang de shift » (cf. service.ts). */
export function slotKey(date: string, shift: Shift): string {
  return `${date}#${SHIFT_ORDER.indexOf(shift)}`
}

/** Date locale au format 'YYYY-MM-DD'. */
export function dateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 'YYYY-MM-DD' décalé de `delta` jours. */
export function addDays(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return dateStr(d)
}

/** Shift courant + date de rattachement, selon l'heure locale. */
export function currentSlot(now: Date): { date: string; shift: Shift } {
  const h = now.getHours()
  const today = dateStr(now)
  if (h >= 8 && h < 15) return { date: today, shift: 'matin' }
  if (h >= 15 && h < 23) return { date: today, shift: 'soir' }
  if (h >= 23) return { date: today, shift: 'nuit' }
  // 00h–07h59 : nuit commencée la veille à 23h.
  return { date: addDays(today, -1), shift: 'nuit' }
}

/**
 * Avance (`delta > 0`) ou recule (`delta < 0`) d'un cran dans la timeline des
 * shifts : matin → soir → nuit → matin du lendemain, et inversement.
 */
export function stepSlot(
  date: string,
  shift: Shift,
  delta: number,
): { date: string; shift: Shift } {
  const total = SHIFT_ORDER.indexOf(shift) + delta
  const dayDelta = Math.floor(total / 3)
  const idx = ((total % 3) + 3) % 3
  return {
    date: dayDelta ? addDays(date, dayDelta) : date,
    shift: SHIFT_ORDER[idx],
  }
}

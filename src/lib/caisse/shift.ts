/*
 * Logique de shift de la caisse : quel shift selon l'heure, et navigation dans
 * la timeline (date, shift).
 *
 * Cycle d'une journée, dans l'ordre chronologique :
 *   matin  12h → 21h
 *   soir   21h → 02h (du lendemain)
 *   nuit   02h → 12h (du lendemain)
 *
 * Les créneaux d'AFFICHAGE (quel shift on montre selon l'heure) découpent la
 * pendule sans trou : nuit 02h→12h, matin 12h→21h, soir 21h→02h. C'est ce qui
 * fait tomber l'hôtelier sur le bon shift sans avoir à le choisir.
 *
 * Le RATTACHEMENT de date suit le shift, pas la pendule : le soir de J débute à
 * 21h de J et se prolonge jusqu'à 02h de J+1 ; la nuit de J le suit, de 02h à
 * 12h de J+1. Ainsi la nuit de J (l'audit qui clôt la journée J) se remplit le
 * matin de J+1 mais reste datée J — comme le soir et le matin du même bloc.
 * L'ordre chronologique matin < soir < nuit (dans la date J) est donc conservé.
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
  if (h >= 12 && h < 21) return { date: today, shift: 'matin' }
  if (h >= 21) return { date: today, shift: 'soir' }
  // 00h–01h59 : soir de la veille (débuté à 21h, il court jusqu'à 02h).
  if (h < 2) return { date: addDays(today, -1), shift: 'soir' }
  // 02h–11h59 : nuit de la veille (elle suit ce soir-là et se remplit au matin).
  return { date: addDays(today, -1), shift: 'nuit' }
}

/**
 * Slot à AFFICHER au chargement : le shift courant (selon l'heure), ou — s'il
 * est déjà clôturé — le SUIVANT, pour que l'hôtelier tombe sur celui qu'il doit
 * remplir plutôt que sur un travail déjà fait.
 *
 * On n'avance QUE vers l'avant : jamais on ne le renvoie en arrière sur une nuit
 * oubliée. La nuit est souvent non faite ; la reprendre est une démarche
 * délibérée (navigation manuelle), pas ce qu'on impose au chargement. Borné à un
 * cycle complet (3) pour ne jamais boucler.
 */
export function resolveDisplaySlot(
  now: Date,
  isValidated: (date: string, shift: Shift) => boolean,
): { date: string; shift: Shift } {
  let slot = currentSlot(now)
  for (let i = 0; i < 3 && isValidated(slot.date, slot.shift); i++) {
    slot = stepSlot(slot.date, slot.shift, 1)
  }
  return slot
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

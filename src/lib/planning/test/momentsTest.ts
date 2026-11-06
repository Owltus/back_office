/*
 * Moments d'essai (2026-11-06) : ceux de l'hôtel, retouchés.
 */

import { lireMoments, MOMENTS_PAR_DEFAUT } from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import type { Moment } from '#/lib/planning/types.ts'

/** Les moments de l'hôtel, avec ces cases changées par identifiant, et ces
 * moments en plus. */
export function momentsAvec(
  changes: Readonly<Record<string, Partial<Moment>>> = {},
  enPlus: readonly Moment[] = [],
): Moment[] {
  return [
    ...MOMENTS_PAR_DEFAUT.map((m) => ({ ...m, ...changes[m.id] })),
    ...enPlus,
  ]
}

/** Les mêmes, lus comme le moteur les lit. */
export const lusAvec = (
  changes: Readonly<Record<string, Partial<Moment>>> = {},
  enPlus: readonly Moment[] = [],
): Moments => lireMoments(momentsAvec(changes, enPlus))

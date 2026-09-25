/*
 * Suspension des points de restauration automatiques.
 *
 * Module MINUSCULE et sans dépendance, pour que `merge/apply.ts` et
 * `merge/history.ts` puissent suspendre les points auto pendant qu'ils
 * exécutent un plan (leur instantané est déjà pris) SANS importer
 * `restauration.ts` — qui, lui, importe `merge/*` : ce serait un cycle.
 */

let suspendus = 0

/** `true` pendant qu'une fusion ou une restauration écrit. */
export function pointsAutoSuspendus(): boolean {
  return suspendus > 0
}

/** Exécute `fn` sans déclencher de point auto. */
export async function sansPointsAuto<T>(fn: () => Promise<T>): Promise<T> {
  suspendus += 1
  try {
    return await fn()
  } finally {
    suspendus -= 1
  }
}

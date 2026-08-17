import { LITERIE_GRACE_DAYS } from '#/lib/permissions/actions.ts'
import { atLeastLevel } from '#/lib/permissions/levels.ts'
import type { PageLevel } from '#/lib/permissions/levels.ts'

/* --------------------------------------------------------------------------
 * Éditabilité d'une assignation de lit bébé (pur : sans React). Même principe
 * que rapro/caisse/pdj — fenêtre de grâce `LITERIE_GRACE_DAYS`, partagée avec
 * la feuille literie (cf. lib/permissions/actions.ts).
 *
 * Miroir EXACT de la RLS (supabase/literie_rls.sql, policies sur
 * baby_cot_assignments) :
 *   - INSERT : `start_date >= current_date - LITERIE_GRACE_DAYS` (ou gestion).
 *   - UPDATE/DELETE : `end_date >= current_date - LITERIE_GRACE_DAYS` (ou
 *     gestion) — appliqué à la fois à la ligne EXISTANTE (peut-on la toucher ?)
 *     et à la ligne PROPOSÉE si une modification déplace la fin (le nouvel
 *     `end_date` doit, lui aussi, rester dans la fenêtre pour un compte
 *     `ecriture`).
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

/** Plancher de la fenêtre de grâce (inclus), pour `today` donné. */
export function graceFloor(today: string): string {
  return shiftDay(today, -LITERIE_GRACE_DAYS)
}

/**
 * Créer une assignation dont l'arrivée est `startDate` : `gestion` toujours ;
 * `ecriture` seulement si l'arrivée n'est pas antérieure au plancher de
 * grâce ; en dessous (lecture), jamais.
 */
export function canCreateAssignment(
  startDate: string,
  today: string,
  level: PageLevel | null | undefined,
): boolean {
  if (atLeastLevel(level, 'gestion')) return true
  if (!atLeastLevel(level, 'ecriture')) return false
  return startDate >= graceFloor(today)
}

/**
 * Modifier/supprimer une assignation dont la fin est `endDate` (celle de la
 * ligne existante pour savoir si on peut la toucher, celle de la ligne
 * proposée pour valider une nouvelle date de fin) : `gestion` toujours ;
 * `ecriture` seulement dans la fenêtre ; en dessous, jamais.
 */
export function canEditAssignment(
  assignment: { endDate: string },
  today: string,
  level: PageLevel | null | undefined,
): boolean {
  if (atLeastLevel(level, 'gestion')) return true
  if (!atLeastLevel(level, 'ecriture')) return false
  return assignment.endDate >= graceFloor(today)
}

/*
 * Helpers de navigation par jour du Rapprochement — version « jour seul » de la
 * timeline de la caisse (pas de shift). La date-string 'YYYY-MM-DD' EST la clé :
 * elle se compare lexicalement comme chronologiquement, donc aucune notion de
 * rang. Tout est calculé en heure locale du navigateur (comme la caisse).
 */

/** Date locale au format 'YYYY-MM-DD' (aujourd'hui par défaut). */
export function today(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${day}`
}

/** 'YYYY-MM-DD' décalé de `delta` jours. */
export function addDays(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return today(d)
}

/** Contraint une date dans [min, max] (comparaison lexicale = chronologique). */
export function clampDay(date: string, min: string, max: string): string {
  if (date > max) return max
  if (date < min) return min
  return date
}

// Frontière du « jour hôtelier » côté Edge Function (Deno).
//
// COPIE CONFORME (esprit) de src/lib/businessDay.ts : la journée d'exploitation
// bascule à 02h00 (Europe/Paris), pas à minuit. Entre minuit et 02h, on est
// encore « la veille ». On s'en sert pour caler l'unicité et la récence des
// envois automatiques sur le cycle 2h→2h, et pour juger la fraîcheur du Forecast.
//
// Le runtime Edge tourne en UTC → on lit d'abord l'heure murale de Paris (via
// Intl / toLocaleString), puis on retire DAY_CUTOFF_HOUR pour nommer le cycle.

export const DAY_CUTOFF_HOUR = 2

/**
 * Heure murale (0-23) à Europe/Paris pour l'instant donné. Le runtime Edge tourne
 * en UTC ; on lit l'heure de Paris via la TZ (gère l'heure d'été). Sert à borner
 * l'ingestion automatique à la fenêtre du cycle hôtelier.
 */
export function parisHour(instant: Date = new Date()): number {
  const parisWall = new Date(
    instant.toLocaleString('en-US', { timeZone: 'Europe/Paris' }),
  )
  return parisWall.getHours()
}

// Fenêtre horaire (heure de Paris) où l'ingestion ET l'envoi AUTOMATIQUES sont
// autorisés : [02h, 04h[. Les rapports du pipeline sont tirés vers 02h30 ; hors de
// cette fenêtre, on ignore tout (ni écriture, ni envoi auto). Source UNIQUE de la
// règle — utilisée par la garde en amont (index.ts) ET par la fonction d'envoi
// (autoSend) en défense en profondeur. N'affecte QUE l'automatique :
// l'envoi MANUEL admin (send-report) reste disponible 24h/24.
export const PIPELINE_WINDOW_START_HOUR = 2
export const PIPELINE_WINDOW_END_HOUR = 4

/** Vrai si l'instant tombe dans la fenêtre d'automatisation [02h, 04h[ (Paris). */
export function isWithinPipelineWindow(instant: Date = new Date()): boolean {
  const h = parisHour(instant)
  return h >= PIPELINE_WINDOW_START_HOUR && h < PIPELINE_WINDOW_END_HOUR
}

/**
 * 'YYYY-MM-DD' du jour hôtelier (Europe/Paris, bascule 02h00) correspondant à
 * l'instant donné. Avant 02h Paris, renvoie la date de la veille.
 */
export function businessDateStr(instant: Date = new Date()): string {
  // Heure murale de Paris à cet instant (gère l'heure d'été via la TZ).
  const parisWall = new Date(
    instant.toLocaleString('en-US', { timeZone: 'Europe/Paris' }),
  )
  // Recule de la frontière : avant 02h → jour précédent.
  parisWall.setHours(parisWall.getHours() - DAY_CUTOFF_HOUR)
  const y = parisWall.getFullYear()
  const m = String(parisWall.getMonth() + 1).padStart(2, '0')
  const d = String(parisWall.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

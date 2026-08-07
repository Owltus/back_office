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

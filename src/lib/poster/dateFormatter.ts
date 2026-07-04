/**
 * dateFormatter.ts — Formatage des dates et heures (bilingue FR/EN)
 * Porté à l'identique du fork (assets/js/date-formatter.js).
 * Fonctions pures exportées.
 */

/** Résultat de getDateString */
export interface DateString {
  start: string | null
  end: string | null
  isRange: boolean
}

/** Résultat de getTimeString */
export interface TimeString {
  full: string | null
  isRange: boolean
}

/**
 * Formatte une date au format français (ex: "15 octobre 2024")
 * Accepte le format YYYY-MM-DD (natif du navigateur)
 */
export function formatDateFr(dateStr: string): string {
  if (!dateStr) return ''
  // Format natif: YYYY-MM-DD
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const year = match[1]
    const month = parseInt(match[2])
    const day = parseInt(match[3])
    const months = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
    ]
    return `${day} ${months[month - 1]} ${year}`
  }
  return dateStr
}

/**
 * Formatte une date au format anglais (ex: "October 15, 2024")
 * Accepte le format YYYY-MM-DD (natif du navigateur)
 */
export function formatDateEn(dateStr: string): string {
  if (!dateStr) return ''
  // Format natif: YYYY-MM-DD
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const year = match[1]
    const month = parseInt(match[2])
    const day = parseInt(match[3])
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
    return `${months[month - 1]} ${day}, ${year}`
  }
  return dateStr
}

/**
 * Formatte une heure au format français (ex: "9h00" ou "9h00 - 17h00")
 * Accepte le format HH:MM (natif du navigateur)
 */
export function formatTimeFr(time: string): string {
  if (!time) return ''

  // Gérer les plages d'heures (format: HH:MM - HH:MM)
  const rangeMatch = time.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/)
  if (rangeMatch) {
    const sh = parseInt(rangeMatch[1]), sm = rangeMatch[2]
    const eh = parseInt(rangeMatch[3]), em = rangeMatch[4]
    return `${sh}h${sm} - ${eh}h${em}`
  }

  // Gérer une heure unique (format: HH:MM)
  const singleMatch = time.match(/(\d{2}):(\d{2})/)
  if (singleMatch) {
    const h = parseInt(singleMatch[1]), m = singleMatch[2]
    return `${h}h${m}`
  }

  return time
}

/**
 * Formatte une heure au format anglais (12h avec AM/PM)
 * Accepte le format HH:MM (natif du navigateur)
 */
export function formatTimeEn(time: string): string {
  if (!time) return ''

  // Gérer les plages d'heures (format: HH:MM - HH:MM)
  const rangeMatch = time.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/)
  if (rangeMatch) {
    const sh = parseInt(rangeMatch[1]), sm = rangeMatch[2]
    const eh = parseInt(rangeMatch[3]), em = rangeMatch[4]
    const sap = sh >= 12 ? 'PM' : 'AM'
    const eap = eh >= 12 ? 'PM' : 'AM'
    const sh12 = sh > 12 ? sh - 12 : (sh === 0 ? 12 : sh)
    const eh12 = eh > 12 ? eh - 12 : (eh === 0 ? 12 : eh)
    return `${sh12}:${sm} ${sap} - ${eh12}:${em} ${eap}`
  }

  // Gérer une heure unique (format: HH:MM)
  const singleMatch = time.match(/(\d{2}):(\d{2})/)
  if (singleMatch) {
    const h = parseInt(singleMatch[1]), m = singleMatch[2]
    const ap = h >= 12 ? 'PM' : 'AM'
    const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h)
    return `${h12}:${m} ${ap}`
  }

  return time
}

/**
 * Construit une chaîne de date depuis les inputs natifs (type="date")
 * @param dateStart - Date au format YYYY-MM-DD
 * @param dateEnd - Date au format YYYY-MM-DD
 */
export function getDateString(dateStart: string, dateEnd: string): DateString {
  // Vérifier que la date de début existe
  if (dateStart && dateStart !== '') {
    // Vérifier si on a une date de fin
    if (dateEnd && dateEnd !== '') {
      return { start: dateStart, end: dateEnd, isRange: true }
    }

    return { start: dateStart, end: null, isRange: false }
  }

  return { start: null, end: null, isRange: false }
}

/**
 * Construit une chaîne d'heure depuis les inputs natifs (type="time")
 * @param timeStart - Heure au format HH:MM
 * @param timeEnd - Heure au format HH:MM
 */
export function getTimeString(timeStart: string, timeEnd: string): TimeString {
  // Vérifier que l'heure de début existe
  if (timeStart && timeStart !== '') {
    // Vérifier si on a une heure de fin
    if (timeEnd && timeEnd !== '') {
      const fullTime = `${timeStart} - ${timeEnd}`
      return { full: fullTime, isRange: true }
    }

    return { full: timeStart, isRange: false }
  }

  return { full: null, isRange: false }
}

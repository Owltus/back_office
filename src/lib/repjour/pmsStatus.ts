import {
  PIPELINE_WINDOW_START_HOUR,
  isWithinPipelineWindow,
} from '#/lib/businessDay.ts'

/*
 * Contrôle « fichiers PMS reçus » — bandeau RepJour.
 *
 * Le rapport journalier n'est envoyé (auto) que si DEUX exports StayNTouch sont
 * arrivés pour le cycle courant : le Comparison (chiffres du jour) ET un
 * Forecast FRAIS (voir supabase/functions/import-report/autoSend.ts, même
 * fenêtre de fraîcheur FRESH_WINDOW_MS). Si un incident réseau/DSI coupe l'un
 * des deux, l'auto-envoi reste silencieux : ce module détecte la situation
 * CÔTÉ CLIENT (sans dupliquer l'auto-envoi, en lecture seule) pour prévenir
 * la personne qui consulte RepJour au lieu de la laisser découvrir l'absence
 * de mail sans explication.
 *
 * Le bandeau ne se justifie QUE si le rapport n'est pas parti : dès que le
 * marqueur d'envoi est posé (auto ou manuel), il n'y a plus rien à signaler,
 * quel que soit l'état des fichiers. De même après un « Ignorer » explicite.
 *
 * On n'affiche RIEN pendant la fenêtre d'ingestion [02h,04h[ (le pipeline est
 * encore en train de tourner, un fichier arrivé en second ne doit pas paraître
 * « manquant »).
 *
 * FRAÎCHEUR : elle se juge par rapport au CYCLE du rapport, jamais par rapport
 * à l'heure de consultation. Le serveur exige, au moment de l'envoi (~02h30),
 * un Forecast importé depuis moins de 12 h. Côté client, on reproduit cette
 * borne FIXE : importé après « début de fenêtre du cycle − 12 h » (soit 14h la
 * veille de l'envoi). L'ancienne règle « importé il y a moins de 12 h par
 * rapport à MAINTENANT » faisait passer pour manquant, dès 14h30, un Forecast
 * pourtant bien arrivé à 02h30 : faux positif systématique tous les après-midi.
 */

/** Même fenêtre de fraîcheur que le Forecast côté auto-envoi (12h). */
const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000

export interface PmsFilesCheck {
  /** Faut-il afficher le bandeau (rapport non envoyé + fenêtre passée + fichier manquant). */
  show: boolean
  /** Phrase unique (une ou deux courtes propositions), prête à afficher telle quelle. */
  message: string
}

/** Vrai si `dateStr` ('YYYY-MM-DD') est le dernier jour de son mois. */
function isLastDayOfMonth(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  return d === new Date(y, m, 0).getDate()
}

/**
 * Instant (heure locale) à partir duquel un import de Forecast compte comme
 * « frais » pour le cycle du rapport `dateStr` : début de la fenêtre d'envoi de
 * ce cycle (lendemain à 02h) moins la fenêtre de fraîcheur serveur (12 h).
 */
function forecastFreshSince(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const windowStart = new Date(y, m - 1, d + 1, PIPELINE_WINDOW_START_HOUR)
  return windowStart.getTime() - FRESH_WINDOW_MS
}

/**
 * Phrase unique décrivant ce qui manque, quelle que soit la combinaison
 * (l'un, l'autre, ou les deux) — jamais de liste ni de retour à la ligne.
 */
function buildMessage(date: string, missing: string[]): string {
  const cause =
    missing.length > 1
      ? `n'a transmis ni ${missing.join(' ni ')}`
      : `n'a pas transmis ${missing[0]}`
  return `Le PMS ${cause} : le rapport du ${date} ne sera pas envoyé automatiquement.`
}

/**
 * @param date Date du cycle courant ('YYYY-MM-DD', le rapport attendu ce matin).
 * @param now Instant de référence (heure locale).
 * @param comparisonReceived `daily_reports` a une ligne pour `date`.
 * @param forecastImportedAt Dernier `forecast_days.imported_at` du mois de `date` (null si aucun).
 * @param sent Le rapport de `date` porte un marqueur d'envoi (auto ou manuel).
 * @param dismissed Un rôle habilité a cliqué « Ignorer » pour ce rapport.
 */
export function checkPmsFilesReceived(params: {
  date: string
  now: Date
  comparisonReceived: boolean
  forecastImportedAt: string | null
  sent?: boolean
  dismissed?: boolean
}): PmsFilesCheck {
  const { date, now, comparisonReceived, forecastImportedAt, sent, dismissed } =
    params

  // Rapport parti (auto ou manuel) ou rappel masqué : plus rien à signaler.
  if (sent || dismissed) return { show: false, message: '' }

  // À la jonction de mois (dernier jour du mois qui s'achève), le Forecast frais
  // de CE mois ne viendra plus jamais (StayNTouch a basculé au mois suivant) :
  // sa simple PRÉSENCE suffit, comme côté auto-envoi (isMonthBoundary).
  const monthBoundary = isLastDayOfMonth(date)
  const forecastReceived =
    forecastImportedAt != null &&
    (monthBoundary ||
      new Date(forecastImportedAt).getTime() >= forecastFreshSince(date))

  const missing: string[] = []
  if (!comparisonReceived) missing.push('les chiffres du jour (Comparison)')
  if (!forecastReceived) missing.push('les prévisions (Forecast)')

  return {
    show: !isWithinPipelineWindow(now) && missing.length > 0,
    message: missing.length > 0 ? buildMessage(date, missing) : '',
  }
}

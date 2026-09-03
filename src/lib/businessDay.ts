/*
 * Frontière du « jour hôtelier ».
 *
 * La journée d'exploitation ne bascule PAS à minuit mais à 02h00 (heure locale,
 * Europe/Paris) : le rapport PMS d'une nuit n'est tiré qu'à partir de 02h, et
 * avant cette heure la journée de la veille n'est pas close. Entre minuit et 02h,
 * l'app doit donc continuer d'afficher — et de n'autoriser à importer que — le
 * jour précédent.
 *
 * C'est exactement la frontière que la caisse acte déjà (lib/caisse/shift.ts :
 * 00h–01h59 reste rattaché au « soir » de la veille). On la centralise ici.
 *
 * Usages :
 *   - PDJ : jour de service affiché par défaut (BreakfastBoard) → passé minuit,
 *     on reste sur la veille jusqu'à 02h.
 *   - RepJour : jour AFFICHÉ par défaut ET verrou d'import. Le jour affiché suit
 *     la frontière 02h (getImportDayStr = dernier jour clôturé) : entre minuit et
 *     02h, le rapport de la veille n'est pas encore tiré, on ouvre donc sur
 *     l'avant-veille. Le fichier fraîchement exporté est de même refusé à
 *     l'import avant 02h.
 */

/** Heure locale à laquelle la journée hôtelière bascule (02h00). */
export const DAY_CUTOFF_HOUR = 2

/**
 * Instant de référence décalé pour que ses composantes de date (jour, mois,
 * année) nomment le jour hôtelier COURANT : avant 02h, on est encore « hier ».
 * Renvoie une nouvelle `Date` — l'appelant peut la muter sans risque.
 */
export function businessNow(now = new Date()): Date {
  const d = new Date(now)
  d.setHours(d.getHours() - DAY_CUTOFF_HOUR)
  return d
}

/** 'YYYY-MM-DD' du jour hôtelier courant (jamais avancé avant 02h). */
export function businessDateStr(now = new Date()): string {
  const d = businessNow(now)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Fenêtre horaire où le pipeline d'ingestion AUTOMATIQUE (e-mail StayNTouch →
// Edge Function import-report) tourne : [02h, 04h[. COPIE CONFORME de
// supabase/functions/_shared/businessDay.ts (même constantes), pour que le
// bandeau « fichiers PMS manquants » (pmsStatus.ts) sache quand la fenêtre est
// passée sans attendre un aller-retour serveur.
export const PIPELINE_WINDOW_START_HOUR = 2
export const PIPELINE_WINDOW_END_HOUR = 4

/** Vrai si l'instant tombe dans la fenêtre d'ingestion automatique [02h, 04h[. */
export function isWithinPipelineWindow(now = new Date()): boolean {
  const h = now.getHours()
  return h >= PIPELINE_WINDOW_START_HOUR && h < PIPELINE_WINDOW_END_HOUR
}

// ---------------------------------------------------------------------------
// MODE MANUEL — import de secours par les comptes « écriture ».
//
// L'ingestion des exports StayNTouch (Comparison/Forecast pour RepJour, In-House
// pour PDJ) est AUTOMATIQUE et arrive vers 02h30. Si le PMS ne transmet pas, il
// faut pouvoir faire une extraction manuelle et la déposer dans l'app. La gestion
// a toujours ce droit ; l'écriture ne l'obtient qu'en MODE MANUEL : à partir de
// MANUAL_MODE_HOUR (03h) tant que les données du cycle courant ne sont pas là.
//
// Plage fermée = [02h, 03h[ uniquement : c'est le seul créneau où l'absence de
// données est NORMALE (le pipeline est attendu). Avant 02h, le cycle affiché est
// encore celui de la veille : s'il n'a toujours pas de données, le mode manuel
// reste ouvert (retard non résolu de la veille).
//
// Miroir SQL : public.repjour_manual_forecast_allowed (forecast_days est réservé
// à la gestion en RLS, sauf en mode manuel). daily_reports / pms_daily_metrics /
// pdj_* sont déjà ouverts à l'écriture.
// ---------------------------------------------------------------------------

/** Heure locale à partir de laquelle le mode manuel peut s'ouvrir (03h00). */
export const MANUAL_MODE_HOUR = 3

/** Vrai hors de la plage [02h, 03h[ où l'on attend encore le pipeline. */
export function isManualModeHour(now = new Date()): boolean {
  const h = now.getHours()
  return h < DAY_CUTOFF_HOUR || h >= MANUAL_MODE_HOUR
}

/**
 * Le mode manuel est-il ouvert ? Heure passée ET données du cycle absentes.
 * `dataReceived` = le cycle courant a déjà ses données (rapport RepJour présent,
 * ou lignes In-House du jour de service PDJ) : dès qu'elles arrivent, l'import
 * de secours se referme pour l'écriture.
 */
export function isManualImportOpen(params: {
  now: Date
  dataReceived: boolean
}): boolean {
  return !params.dataReceived && isManualModeHour(params.now)
}

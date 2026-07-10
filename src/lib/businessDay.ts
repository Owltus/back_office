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
 *   - RepJour : verrou d'IMPORT uniquement (ImportSection). Le jour AFFICHÉ y
 *     reste la veille CIVILE (le J-1 est déjà porté par la date des données) ;
 *     seul le fichier fraîchement exporté est refusé à l'import avant 02h.
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

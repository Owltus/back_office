/*
 * Formateurs de la vue parking — réexport de la base partagée `lib/format`.
 * `fmtEur` sert au CA (tarif versionné dans `parking_tarifs`, calculé côté
 * vue SQL). `fmtPct` (1 déc.) et `fmtPctInt` (entier) rendent identiquement
 * à l'ancienne implémentation locale.
 */
import type { Reservation } from '#/lib/parking/model.ts'

export { fmtEur, fmtInt, fmtPct, fmtPctInt } from '#/lib/format/index.ts'


/* Date et heure à la française : « 09/09/2026 à 19:04 ». Deux formateurs
 * séparés plutôt qu'un seul : le séparateur qu'Intl place entre la date et
 * l'heure varie selon la version d'ICU (espace, espace insécable, virgule),
 * et on ne veut pas dépendre de ce détail. Instanciés une fois au module — un
 * `Intl.DateTimeFormat` par barre coûterait cher sur un planning qui en affiche
 * des dizaines. */
const fmtStampDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const fmtStampTime = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Dernière intervention sur une réservation, en clair — ce qu'affiche le survol
 * de sa barre sur le planning.
 *
 * `updated_at` vaut exactement `created_at` tant que la ligne n'a pas été
 * modifiée : les deux prennent `now()`, qui est l'heure de DÉBUT de transaction
 * et rend donc la même valeur. On distingue ainsi « créée » de « modifiée »
 * sans autre information.
 *
 * La table `parking_reservations` ne porte AUCUNE colonne d'auteur : cet
 * horodatage est la seule trace disponible, et savoir QUI est intervenu suppose
 * de le recouper avec le planning du personnel.
 *
 * Rend `null` quand l'horodatage est absent (réservation tout juste créée en
 * local, avant l'écho du serveur) ou illisible — l'appelant n'affiche alors
 * rien plutôt qu'une date fausse.
 */
export function lastTouchLabel(
  r: Pick<Reservation, 'createdAt' | 'updatedAt'>,
): string | null {
  if (!r.updatedAt) return null
  const updated = new Date(r.updatedAt)
  if (Number.isNaN(updated.getTime())) return null
  const verb = r.createdAt === r.updatedAt ? 'Créée' : 'Modifiée'
  return `${verb} le ${fmtStampDate.format(updated)} à ${fmtStampTime.format(updated)}`
}

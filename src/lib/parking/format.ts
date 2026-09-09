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
 * Fenêtre pendant laquelle une modification est encore considérée comme faisant
 * partie de la CRÉATION.
 *
 * Le flux de création pose la barre avec un nom vide, puis ouvre la saisie du
 * nom : l'enregistrement du nom est techniquement un `update`, une seconde ou
 * deux après l'insertion. Sans cette fenêtre, presque aucune réservation ne
 * serait jamais « créée » — mesuré sur les données réelles (2026-09-09) :
 * 545 lignes sur 554 portaient un `updated_at` différent, dont 109 à moins de
 * deux minutes de leur création. Avec la fenêtre, la distinction redevient
 * parlante : ~118 créations contre 436 vraies retouches.
 */
const CREATION_GRACE_MS = 2 * 60_000

/**
 * Dernière intervention sur une réservation, en clair — ce qu'affiche le survol
 * de sa barre sur le planning. Une seule information, la plus récente : soit
 * « Créée le … », soit « Modifiée le … », jamais les deux.
 *
 * La table `parking_reservations` ne porte AUCUNE colonne d'auteur : cet
 * horodatage est la seule trace disponible, et identifier QUI est intervenu
 * suppose de le recouper avec le planning du personnel.
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
  const created = r.createdAt ? new Date(r.createdAt) : null
  const createdOk = created && !Number.isNaN(created.getTime())
  // Jamais retouchée, ou retouchée dans la foulée (la saisie du nom) : c'est
  // une création. On date alors la CRÉATION, pour rester cohérent avec le mot.
  const isCreation =
    createdOk && updated.getTime() - created.getTime() <= CREATION_GRACE_MS
  const stamp = isCreation ? created : updated
  const verb = isCreation ? 'Créée' : 'Modifiée'
  return `${verb} le ${fmtStampDate.format(stamp)} à ${fmtStampTime.format(stamp)}`
}

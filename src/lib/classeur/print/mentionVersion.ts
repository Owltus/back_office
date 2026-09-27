/*
 * Date imprimée sous le pied de page d'un document — amélioration n° 22 de
 * `plan/classeur-editeur-ameliorations`. Forme choisie par l'utilisateur
 * le 2026-09-27 : « sur le papier, ultra discrète, sous le footer, centrée,
 * opacité 0,2 », puis précisée le même jour : « juste la date jj/mm/aaaa,
 * pas d'autre info et surtout pas l'heure ».
 *
 * C'est la date du dernier enregistrement du document (`updated_at`), au
 * fuseau de l'hôtel quel que soit le poste. Pendant l'édition, l'aperçu
 * montre la date du jour : celle que portera le document une fois
 * enregistré.
 */

const FUSEAU = 'Europe/Paris'

/** « 27/09/2026 », ou `undefined` si la date est illisible. */
export function mentionVersion(
  date: string | number | Date,
): string | undefined {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toLocaleDateString('fr-FR', {
    timeZone: FUSEAU,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

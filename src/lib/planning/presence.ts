/*
 * Consignes de présence du matin et du soir (demande utilisateur du
 * 2026-10-27) : « lundi, 2 le matin et 2 le soir ; samedi, 3 ou 4 le
 * matin ». Une consigne compte les personnes AUTONOMES (titulaires et
 * dépannage ; pas les profils « soutien », les apprentis en renfort) posées
 * sur un poste qui compte dans la présence (`Poste.presence`, Réception et
 * Club à l'hôtel), selon la période de leur shift.
 *
 * Période d'un shift : celle de son code (`Horaire.periode`) ; sans code, ou
 * pour un code « middle » ou « court » (familles du 2026-10-28, qui ne
 * changent pas les consignes), elle se déduit de l'heure de début
 * (`periodeLibre`).
 */

import { minutes } from '#/lib/planning/temps.ts'
import type { Besoin, Consigne, Horaire, Poste } from '#/lib/planning/types.ts'

/** Période d'un horaire libre : nuit de 22 h à 5 h, matin avant 12 h 30. */
export function periodeLibre(debut: string): 'matin' | 'soir' | 'nuit' {
  const m = minutes(debut)
  if (m >= 22 * 60 || m < 5 * 60) return 'nuit'
  return m < 12 * 60 + 30 ? 'matin' : 'soir'
}

/** Période d'un shift pour les consignes, ou null s'il n'y compte pas
 * (poste hors présence, code de nuit ou sans période). */
export function periodePresence(
  poste: Pick<Poste, 'presence'> | undefined,
  horaire: Pick<Horaire, 'periode'> | undefined,
  debut: string,
): 'matin' | 'soir' | null {
  if (!poste?.presence) return null
  return periodeShift(horaire, debut)
}

/** Période d'un shift, sur tout poste : celle de son code, ou son heure de
 * début (sans code, ou code « middle » / « court »). Null : nuit ou code
 * sans période. Sert aux consignes et à l'équité du générateur (D15). */
export function periodeShift(
  horaire: Pick<Horaire, 'periode'> | undefined,
  debut: string,
): 'matin' | 'soir' | null {
  const famille = horaire ? horaire.periode : null
  const p =
    !horaire || famille === 'middle' || famille === 'court'
      ? periodeLibre(debut)
      : famille
  return p === 'matin' || p === 'soir' ? p : null
}

/** Une consigne et ce que le planning en fait. */
export interface PresenceOut {
  jour: number
  periode: 'matin' | 'soir'
  compte: number
  minimum: number
  maximum: number | null
  /** < 0 : il manque du monde ; > 0 : du monde en plus ; 0 : conforme. */
  ecart: number
}

export function ecartConsigne(
  compte: number,
  minimum: number,
  maximum: number | null,
): number {
  if (compte < minimum) return compte - minimum
  if (maximum !== null && compte > maximum) return compte - maximum
  return 0
}

/** Bilan des consignes d'une semaine : `presents` = (jour, période) des
 * shifts qui comptent. */
export function bilanPresence(
  consignes: Consigne[],
  presents: ReadonlyArray<{ jour: number; periode: 'matin' | 'soir' }>,
): PresenceOut[] {
  return [...consignes]
    .sort((a, b) => a.jour - b.jour || (a.periode === 'matin' ? -1 : 1))
    .map((c) => {
      const compte = presents.filter(
        (p) => p.jour === c.jour && p.periode === c.periode,
      ).length
      return {
        jour: c.jour,
        periode: c.periode,
        compte,
        minimum: c.minimum,
        maximum: c.maximum,
        ecart: ecartConsigne(compte, c.minimum, c.maximum),
      }
    })
}

/** « 3 », « 3 ou 4 », « 3 à 5 », « au moins 3 ». */
export function libelleConsigne(
  minimum: number,
  maximum: number | null,
): string {
  if (maximum === null) return `au moins ${minimum}`
  if (maximum === minimum) return String(minimum)
  return maximum === minimum + 1
    ? `${minimum} ou ${maximum}`
    : `${minimum} à ${maximum}`
}

/** Clé d'un moment de la semaine type : `5:matin`. */
export const clePresence = (jour: number, periode: 'matin' | 'soir') =>
  `${jour}:${periode}`

/** Somme des personnes nécessaires (`effectif`) des besoins qui comptent dans
 * le matin et le soir, par moment (`clePresence`). Seule source de cette
 * somme : contrôle des réglages (`coherence.ts`) et vue Matin et soir. */
export function sommeBesoinsPresence(
  besoins: ReadonlyArray<
    Pick<Besoin, 'poste_id' | 'jour' | 'horaire_id' | 'debut' | 'effectif'>
  >,
  postes: ReadonlyMap<number, Pick<Poste, 'presence'>>,
  horaires: ReadonlyMap<number, Pick<Horaire, 'periode'>>,
): Map<string, number> {
  const somme = new Map<string, number>()
  for (const b of besoins) {
    if (b.effectif <= 0) continue
    const periode = periodePresence(
      postes.get(b.poste_id),
      b.horaire_id !== null ? horaires.get(b.horaire_id) : undefined,
      b.debut,
    )
    if (!periode) continue
    const cle = clePresence(b.jour, periode)
    somme.set(cle, (somme.get(cle) ?? 0) + b.effectif)
  }
  return somme
}

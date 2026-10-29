/*
 * Codes permis pour une case du planning (vue mois, vue semaine, éditeur) :
 * rassemble ce que l'écran sait du jour (bilan de la semaine, shifts de la
 * veille et du lendemain) et le passe à la règle unique `codesPermis`
 * (`lib/planning/eligibilite.ts`). Aucun repli ici : ce qui n'est pas
 * permis n'est pas proposé, et la raison se lit dans le menu.
 */

import { codesPermis } from '#/lib/planning/eligibilite.ts'
import type { CodesPermis, Voisin } from '#/lib/planning/eligibilite.ts'
import { estEcole } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import type { Horaire, Referentiel, Salarie } from '#/lib/planning/types.ts'

/** Un shift d'une semaine voisine, tel que lu en base (`donnees.avant` /
 * `donnees.apres`) ou analysé. */
export interface ShiftVoisin {
  id: number
  salarie_id: number
  jour: number
  debut: string
  fin: string
}

/** La semaine de la case, et les shifts des semaines voisines (coupure de
 * repos avec le dimanche d'avant ou le lundi d'après, comme le moteur :
 * `finServicePrecedent`, `debutServiceSuivant`). Sans voisines, la coupure
 * n'est vérifiée qu'à l'intérieur de la semaine. */
export interface SourceCase {
  semaine: SemaineOut | null | undefined
  avant?: readonly ShiftVoisin[] | null
  apres?: readonly ShiftVoisin[] | null
}

/** Shifts de cette personne les autres jours, dans le repère de la semaine. */
export function voisinsDe(
  source: SourceCase,
  salarieId: number,
  jour: number,
  sauf?: number,
): Voisin[] {
  const siens = (
    l: readonly ShiftVoisin[] | null | undefined,
    decalage: number,
  ) =>
    (l ?? [])
      .filter((a) => a.salarie_id === salarieId && a.id !== sauf)
      .map((a) => ({ jour: a.jour + decalage, debut: a.debut, fin: a.fin }))
  return [
    ...siens(source.avant, -7),
    ...siens(source.semaine?.affectations, 0),
    ...siens(source.apres, 7),
  ].filter((v) => v.jour !== jour)
}

/** Le code actuel du shift de la case quand il n'est plus permis : montré
 * grisé, marqué actuel, avec la raison (null : il est permis, ou pas de
 * shift). */
export function actuelNonPermis(
  permis: CodesPermis<Horaire>,
  horaires: readonly Horaire[],
  actuel: number | null | undefined,
): { horaire: Horaire; texte: string } | null {
  if (actuel == null || permis.codes.some((h) => h.id === actuel)) return null
  const horaire = horaires.find((h) => h.id === actuel)
  if (!horaire) return null
  const ecarte = permis.ecartes.find((e) => e.horaire.id === actuel)
  return {
    horaire,
    texte: ecarte?.texte ?? permis.texte ?? "N'est plus permis ici",
  }
}

export function codesDeLaCase({
  referentiel,
  personne,
  posteId,
  jour,
  source,
  sauf,
}: {
  referentiel: Pick<Referentiel, 'horaires' | 'postes' | 'motifs'>
  personne: Salarie
  posteId: number | undefined
  jour: number
  source: SourceCase
  /** Shift en cours de modification : il ne compte pas comme voisin. */
  sauf?: number
}): CodesPermis<Horaire> {
  const semaine = source.semaine
  const bilan = semaine?.bilan.find((b) => b.salarie_id === personne.id)
  const motifId = bilan && jour in bilan.absences ? bilan.absences[jour] : null
  const motif = referentiel.motifs.find((m) => m.id === motifId)
  return codesPermis({
    personne,
    poste: referentiel.postes.find((p) => p.id === posteId),
    jour,
    horaires: referentiel.horaires,
    journee: {
      ecole: !!motif && estEcole(motif),
      horsContrat: !!bilan?.hors_contrat.includes(jour),
    },
    lundi: semaine?.lundi,
    voisins: voisinsDe(source, personne.id, jour, sauf),
  })
}

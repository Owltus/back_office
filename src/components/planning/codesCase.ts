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

/** La semaine de la case, et ses voisines quand l'écran les a (coupure de
 * repos avec le dimanche d'avant ou le lundi d'après). */
export interface SourceCase {
  semaine: SemaineOut | null | undefined
  avant?: SemaineOut | null
  apres?: SemaineOut | null
}

/** Shifts de cette personne les autres jours, dans le repère de la semaine. */
export function voisinsDe(
  source: SourceCase,
  salarieId: number,
  jour: number,
  sauf?: number,
): Voisin[] {
  const siens = (s: SemaineOut | null | undefined, decalage: number) =>
    (s?.affectations ?? [])
      .filter((a) => a.salarie_id === salarieId && a.id !== sauf)
      .map((a) => ({ jour: a.jour + decalage, debut: a.debut, fin: a.fin }))
  return [
    ...siens(source.avant, -7),
    ...siens(source.semaine, 0),
    ...siens(source.apres, 7),
  ].filter((v) => v.jour !== jour)
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

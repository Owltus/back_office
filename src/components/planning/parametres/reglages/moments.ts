/*
 * Limites des moments (étape 5 du plan `planning-moteur-configurable-
 * 2026-11-05`, D7 : réglées dans la page Horaires). Le moment d'un horaire
 * se CALCULE d'après ses heures (`momentPropose`) ; ces limites sont les
 * seules choses qu'on règle. Avant d'enregistrer, la page montre les
 * horaires qui changeraient de moment (`changementsDeMoment`).
 */

import { momentPropose } from '#/lib/planning/moment.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import type {
  Horaire,
  Periode,
  Referentiel,
  Reglages,
} from '#/lib/planning/types.ts'

/** Les colonnes de `planning_reglages` des moments (minutes depuis minuit). */
export interface SaisieMoments {
  nuit_debut: number
  nuit_fin: number
  soir_fin: number
  soir_debut: number
  matin_debut_avant: number
  matin_fin_max: number
  libre_matin_avant: number
}

export function momentsDepuis(
  referentiel: Pick<Referentiel, 'reglages' | 'modelesContrat'>,
): SaisieMoments {
  const m = lireRegles(referentiel).moments
  return {
    nuit_debut: m.nuitDebut,
    nuit_fin: m.nuitFin,
    soir_fin: m.soirFin,
    soir_debut: m.soirDebut,
    matin_debut_avant: m.matinDebutAvant,
    matin_fin_max: m.matinFinMax,
    libre_matin_avant: m.libreMatinAvant,
  }
}

/** La saisie lue comme le moteur la lit. */
export function limites(s: SaisieMoments): RegleEtablissement['moments'] {
  return {
    nuitDebut: s.nuit_debut,
    nuitFin: s.nuit_fin,
    soirFin: s.soir_fin,
    soirDebut: s.soir_debut,
    matinDebutAvant: s.matin_debut_avant,
    matinFinMax: s.matin_fin_max,
    libreMatinAvant: s.libre_matin_avant,
  }
}

export const reglagesMoments = (s: SaisieMoments): Partial<Reglages> => ({
  ...s,
})

export interface ChangementMoment {
  horaire: Horaire
  avant: Periode
  apres: Periode
}

/** Les horaires dont le moment changerait avec les nouvelles limites. */
export function changementsDeMoment(
  horaires: readonly Horaire[],
  avant: SaisieMoments,
  apres: SaisieMoments,
): ChangementMoment[] {
  const la = limites(avant)
  const lb = limites(apres)
  return horaires.flatMap((h) => {
    const a = momentPropose(h, la)
    const b = momentPropose(h, lb)
    return a === b ? [] : [{ horaire: h, avant: a, apres: b }]
  })
}

/** Bornes des CHECK de la base : de 00:00 à 23:59, 24:00 permis pour une
 * fin. */
const FINS: ReadonlySet<keyof SaisieMoments> = new Set([
  'soir_fin',
  'matin_fin_max',
])

/** Ce qui empêche d'enregistrer (vide : rien). */
export function erreursMoments(s: SaisieMoments): string[] {
  const erreurs: string[] = []
  for (const [cle, v] of Object.entries(s) as Array<
    [keyof SaisieMoments, number]
  >) {
    const max = FINS.has(cle) ? 1440 : 1439
    if (!Number.isInteger(v) || v < 0 || v > max) {
      erreurs.push('Une heure va de 00:00 à 23:59.')
      break
    }
  }
  if (s.nuit_fin >= s.nuit_debut)
    erreurs.push('La nuit finit le matin, avant de recommencer le soir.')
  if (s.matin_debut_avant <= s.nuit_fin)
    erreurs.push(
      'Le matin commence après la fin de la nuit : sinon aucun horaire ne serait du matin.',
    )
  return erreurs
}

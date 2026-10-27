/*
 * Calendrier d'école d'un apprenti ou d'un stagiaire (prototype
 * `CalendrierEcole.tsx`), pur. Les jours d'école sont des jours d'absence
 * du motif école ; une semaine d'école va du lundi au vendredi (le week-end,
 * on peut travailler à l'hôtel).
 */

import {
  joursDesPeriodes,
  JOUR_LIBRE,
  nouvelleCle,
  periodeLisible,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import type { PeriodeBrouillon } from '#/components/planning/parametres/equipe/brouillon.ts'
import { enPeriodes } from '#/lib/planning/affichage.ts'
import { ajouterJours, lundiDe } from '#/lib/planning/temps.ts'
import type { JourType } from '#/lib/planning/types.ts'

/** Six mois d'avance. */
export const SEMAINES_ECOLE = 26

export function lundisEcole(aujourdhui: string): string[] {
  const premier = lundiDe(aujourdhui)
  return Array.from({ length: SEMAINES_ECOLE }, (_, k) =>
    ajouterJours(premier, 7 * k),
  )
}

/** Du lundi au vendredi. */
export const joursOuvres = (lundi: string) =>
  Array.from({ length: 5 }, (_, i) => ajouterJours(lundi, i))

/** Les jours d'école déjà posés. */
export function joursEcole(
  periodes: PeriodeBrouillon[],
  ecoleId: number,
): Set<string> {
  const r = new Set<string>()
  for (const [jour, motif] of joursDesPeriodes(
    periodes.filter((p) => p.motif_id === ecoleId),
  )) {
    if (motif === ecoleId) r.add(jour)
  }
  return r
}

export type EtatSemaine = 'ecole' | 'partielle' | ''

export function etatSemaine(jours: Set<string>, lundi: string): EtatSemaine {
  const n = joursOuvres(lundi).filter((j) => jours.has(j)).length
  return n === 5 ? 'ecole' : n > 0 ? 'partielle' : ''
}

/** Un clic sur une semaine : la remplit, ou la vide si elle était pleine. */
export function basculerSemaine(
  jours: Set<string>,
  lundi: string,
): Set<string> {
  const suite = new Set(jours)
  const pleine = etatSemaine(jours, lundi) === 'ecole'
  for (const j of joursOuvres(lundi)) {
    if (pleine) suite.delete(j)
    else suite.add(j)
  }
  return suite
}

export interface Rythme {
  ecole: number
  hotel: number
  depart: string
}

/** « N semaines d'école, puis M à l'hôtel » à partir de `depart`, jusqu'à
 * la fin du calendrier : remplit ou efface du lundi au vendredi. */
export function appliquerRythme(
  jours: Set<string>,
  lundis: string[],
  rythme: Rythme,
): Set<string> {
  const suite = new Set(jours)
  const ecole = Math.max(1, Math.floor(rythme.ecole))
  const cycle = ecole + Math.max(0, Math.floor(rythme.hotel))
  lundis
    .filter((l) => l >= rythme.depart)
    .forEach((lundi, k) => {
      for (const j of joursOuvres(lundi)) {
        if (k % cycle < ecole) suite.add(j)
        else suite.delete(j)
      }
    })
  return suite
}

/** Les périodes de la fiche avec ces jours d'école ; les périodes illisibles
 * (en cours de saisie) restent telles quelles avec les autres absences. */
export function avecJoursEcole(
  periodes: PeriodeBrouillon[],
  ecoleId: number,
  jours: Set<string>,
): PeriodeBrouillon[] {
  const autres = periodes.filter(
    (p) => p.motif_id !== ecoleId || !periodeLisible(p),
  )
  const ecole = enPeriodes(
    [...jours].map((jour) => ({ jour, motif_id: ecoleId })),
  ).map((p) => ({
    cle: nouvelleCle(),
    debut: p.debut,
    fin: p.fin,
    motif_id: ecoleId,
  }))
  return [...autres, ...ecole]
}

/** École ce jour-là, toutes les semaines (semaine type). */
export const ecoleFixe = (semaine: JourType[], j: number, ecoleId: number) =>
  semaine[j]?.mode === 'absence' && semaine[j]?.type_absence_id === ecoleId

export function basculerJourEcole(
  semaine: JourType[],
  j: number,
  ecoleId: number,
): JourType[] {
  return semaine.map((e, i) =>
    i !== j
      ? e
      : ecoleFixe(semaine, j, ecoleId)
        ? { ...JOUR_LIBRE }
        : { mode: 'absence', type_shift_id: null, type_absence_id: ecoleId },
  )
}

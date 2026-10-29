/*
 * Codes permis pour une case du planning (vue mois, vue semaine, éditeur) :
 * rassemble ce que l'écran sait du jour (bilan de la semaine, shifts de la
 * veille et du lendemain) et le passe à la règle unique `codesPermis`
 * (`lib/planning/eligibilite.ts`). Aucun repli ici : ce qui n'est pas
 * permis n'est pas proposé, et la raison se lit dans le menu.
 *
 * Mode manuel (`rubriquesDeLaCase`) : tous les codes de la personne, rangés
 * par casquette (un poste de sa fiche), la coupure de repos choisissable
 * avec son alerte.
 */

import { trierHoraires } from '#/lib/planning/affichage.ts'
import { codesPermis } from '#/lib/planning/eligibilite.ts'
import type { CodesPermis, Voisin } from '#/lib/planning/eligibilite.ts'
import { estEcole } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import type {
  Horaire,
  Niveau,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'

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

// ------------------------------------------------- rubriques (mode manuel)

/** Un code proposé dans une rubrique. `alerte` : il est choisissable mais
 * enfreint une règle que l'on peut passer à la main (coupure de repos) ; la
 * phrase est montrée sur la ligne. */
export interface LigneCode {
  horaire: Horaire
  alerte: string | null
}

/** Les codes d'UNE casquette de la personne (un poste de sa fiche). */
export interface Rubrique {
  poste: Poste
  /** Niveau sur ce poste ; null : poste du shift, absent de sa fiche, montré
   * seulement pour pouvoir le garder. */
  niveau: Niveau | null
  lignes: LigneCode[]
  /** Résultat brut de la règle unique pour ce poste. */
  permis: CodesPermis<Horaire>
}

export interface RubriquesCase {
  /** Rubriques non vides : titulaire, puis dépannage, puis soutien, puis
   * l'ordre des postes ; le poste du shift hors fiche en dernier. */
  rubriques: Rubrique[]
  /** Pourquoi aucune rubrique (null : il y en a au moins une). */
  texte: string | null
  /** Code actuel du shift qui n'est plus choisissable sur son poste : montré
   * grisé, marqué actuel, avec la raison (null : rien à montrer). */
  actuel: { horaire: Horaire; texte: string } | null
}

const RANG_NIVEAU: Record<Niveau, number> = {
  titulaire: 0,
  occasionnel: 1,
  soutien: 2,
}

/**
 * Tous les codes que cette personne peut tenir ce jour-là, rangés par
 * casquette : une rubrique par poste de sa fiche, chacune calculée par la
 * règle unique (`codesDeLaCase`), sans repli. Mode MANUEL (décision
 * utilisateur du 2026-10-30) : un code qui casse la coupure de repos
 * quotidien reste choisissable, avec son alerte ; les autres raisons restent
 * bloquantes. Le générateur, lui, ne la passe jamais.
 */
export function rubriquesDeLaCase({
  referentiel,
  personne,
  jour,
  source,
  shift,
  sauf,
  garderActuel = false,
}: {
  referentiel: Pick<Referentiel, 'horaires' | 'postes' | 'motifs'>
  personne: Salarie
  jour: number
  source: SourceCase
  /** Shift de la case : son poste reste montré même hors fiche. */
  shift?: { poste_id: number; type_shift_id: number | null } | null
  /** Shift en cours de modification : il ne compte pas comme voisin. */
  sauf?: number
  /** Éditeur : le code actuel reste choisissable sur son poste (sa raison en
   * alerte) au lieu d'une ligne grisée à part. */
  garderActuel?: boolean
}): RubriquesCase {
  const { postes, horaires } = referentiel
  const rang = (id: number) => postes.findIndex((p) => p.id === id)
  const candidats: Array<{ poste: Poste; niveau: Niveau | null }> = [
    ...personne.competences,
  ]
    .filter((c) => rang(c.poste_id) >= 0)
    .sort(
      (a, b) =>
        RANG_NIVEAU[a.niveau] - RANG_NIVEAU[b.niveau] ||
        rang(a.poste_id) - rang(b.poste_id),
    )
    .filter((c, i, l) => l.findIndex((x) => x.poste_id === c.poste_id) === i)
    .map((c) => ({ poste: postes[rang(c.poste_id)], niveau: c.niveau }))
  if (
    shift &&
    rang(shift.poste_id) >= 0 &&
    !candidats.some((c) => c.poste.id === shift.poste_id)
  ) {
    candidats.push({ poste: postes[rang(shift.poste_id)], niveau: null })
  }

  let actuel: RubriquesCase['actuel'] = null
  const toutes = candidats.map(({ poste, niveau }): Rubrique => {
    const permis = codesDeLaCase({
      referentiel,
      personne,
      posteId: poste.id,
      jour,
      source,
      sauf,
    })
    const alertes = new Map<number, string | null>(
      permis.codes.map((h) => [h.id, null]),
    )
    for (const e of permis.ecartes) alertes.set(e.horaire.id, e.texte)
    if (shift?.poste_id === poste.id && shift.type_shift_id != null) {
      const hors = alertes.has(shift.type_shift_id)
        ? null
        : actuelNonPermis(permis, horaires, shift.type_shift_id)
      if (hors && garderActuel) alertes.set(hors.horaire.id, hors.texte)
      else actuel = hors
    }
    const lignes = trierHoraires(horaires.filter((h) => alertes.has(h.id))).map(
      (h) => ({ horaire: h, alerte: alertes.get(h.id) ?? null }),
    )
    return { poste, niveau, lignes, permis }
  })
  const rubriques = toutes.filter((r) => r.lignes.length > 0)
  const texte = rubriques.length
    ? null
    : !toutes.length
      ? 'Aucun poste dans sa fiche'
      : toutes.every((r) => r.permis.raison === 'aucun-commun')
        ? 'Aucun horaire commun entre sa fiche et ses postes'
        : (toutes[0].permis.texte ?? "Aucun horaire n'est permis ce jour-là")
  return { rubriques, texte, actuel }
}

/** La rubrique et la ligne d'un code sur un poste (null : pas proposé). */
export function ligneDe(
  r: RubriquesCase,
  posteId: number,
  horaireId: number | null | undefined,
): { rubrique: Rubrique; ligne: LigneCode } | null {
  const rubrique = r.rubriques.find((x) => x.poste.id === posteId)
  const ligne = rubrique?.lignes.find((l) => l.horaire.id === horaireId)
  return rubrique && ligne ? { rubrique, ligne } : null
}

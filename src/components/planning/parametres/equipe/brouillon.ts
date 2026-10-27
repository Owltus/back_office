/*
 * Brouillon de la fiche d'un membre du staff (prototype `EquipePage.tsx`,
 * `FicheSalarie`), pur. Différence avec le prototype : en base, les absences
 * sont stockées UN JOUR PAR LIGNE (`planning_absences`). La fiche les montre
 * en périodes (`enPeriodes`), et l'enregistrement ne touche que les jours qui
 * changent (`diffAbsences`) : un jour d'une semaine verrouillée qui ne bouge
 * pas n'est jamais réécrit.
 */

import {
  datesEntre,
  enPeriodes,
  postesDuGroupe,
} from '#/lib/planning/affichage.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import { estEcole } from '#/lib/planning/semaine.ts'
import { ajouterJours, ecartJours } from '#/lib/planning/temps.ts'
import type {
  Absence,
  Competence,
  Groupe,
  JourType,
  Motif,
  Niveau,
  Poste,
  Salarie,
  TypeContrat,
} from '#/lib/planning/types.ts'

/** Une période d'absence telle que la fiche la montre (une ligne). */
export interface PeriodeBrouillon {
  /** Clé d'affichage, stable pendant l'édition. */
  cle: number
  debut: string
  fin: string
  motif_id: number
}

export interface Brouillon extends Omit<Salarie, 'id'> {
  id: number | null
  absences: PeriodeBrouillon[]
}

export type ValeursSalarie = Omit<Salarie, 'id'>

export const ALTERNANCE: ReadonlyArray<TypeContrat> = ['apprenti', 'stagiaire']
export const enAlternance = (contrat: TypeContrat) =>
  ALTERNANCE.includes(contrat)

/** Un jour de semaine type neutre. */
export const JOUR_LIBRE: JourType = {
  mode: 'auto',
  type_shift_id: null,
  type_absence_id: null,
}

let compteur = 0
/** Clé neuve pour une période ajoutée. */
export const nouvelleCle = () => ++compteur

/** Une semaine type de 7 jours, complétée en « Libre » s'il en manque. */
export function semaineComplete(s: JourType[] | null | undefined): JourType[] {
  return Array.from({ length: 7 }, (_, j) => ({
    ...JOUR_LIBRE,
    ...(s?.[j] ?? {}),
  }))
}

/** Fiche vierge : CDI, 39 h, active, semaine type libre, aucun poste. */
export function brouillonVierge(groupeId: number | null = null): Brouillon {
  return {
    id: null,
    prenom: '',
    nom: '',
    groupe_id: groupeId,
    type_contrat: 'cdi',
    heures_hebdo: 39,
    forfait_jours: false,
    mineur: false,
    competences: [],
    semaine_type: semaineComplete(null),
    shifts_autorises: [],
    date_entree: null,
    date_sortie: null,
    actif: true,
    suite_de: null,
    absences: [],
  }
}

/** Les jours d'absence lus en base, regroupés en périodes de même motif. */
export function periodesDe(absences: Absence[]): PeriodeBrouillon[] {
  return enPeriodes(absences).map((p) => ({
    cle: nouvelleCle(),
    debut: p.debut,
    fin: p.fin,
    motif_id: p.motif_id,
  }))
}

export function brouillonDe(s: Salarie, absences: Absence[]): Brouillon {
  return {
    ...s,
    competences: s.competences.map((c) => ({ ...c })),
    semaine_type: semaineComplete(s.semaine_type),
    shifts_autorises: [...s.shifts_autorises],
    absences: periodesDe(absences),
  }
}

/** Les colonnes de `planning_salaries` (les absences vivent à part). */
export function valeursSalarie(b: Brouillon): ValeursSalarie {
  return {
    prenom: b.prenom.trim(),
    nom: b.nom.trim(),
    groupe_id: b.groupe_id,
    type_contrat: b.type_contrat,
    heures_hebdo: b.heures_hebdo,
    forfait_jours: b.forfait_jours,
    mineur: b.mineur,
    competences: b.competences,
    semaine_type: semaineComplete(b.semaine_type),
    shifts_autorises: b.shifts_autorises,
    date_entree: b.date_entree,
    date_sortie: b.date_sortie,
    actif: b.actif,
    suite_de: b.suite_de,
  }
}

// --------------------------------------------------------------- absences

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function dateValide(iso: string | null | undefined): iso is string {
  if (!iso || !ISO.test(iso)) return false
  const [a, m, j] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j))
  return (
    d.getUTCFullYear() === a &&
    d.getUTCMonth() === m - 1 &&
    d.getUTCDate() === j
  )
}

/** Deux vraies dates, dans l'ordre, sur moins de trois ans. Une période en
 * cours de saisie (date effacée, année à moitié tapée) n'en est pas une. */
export function periodeLisible(
  p: Pick<PeriodeBrouillon, 'debut' | 'fin'>,
): boolean {
  return (
    dateValide(p.debut) &&
    dateValide(p.fin) &&
    p.debut <= p.fin &&
    ecartJours(p.debut, p.fin) <= 3 * 366
  )
}

/** Jour → motif, d'après les périodes (une période plus bas l'emporte). */
export function joursDesPeriodes(
  periodes: PeriodeBrouillon[],
): Map<string, number> {
  const r = new Map<string, number>()
  for (const p of periodes) {
    if (!periodeLisible(p)) continue
    for (const j of datesEntre(p.debut, p.fin)) r.set(j, p.motif_id)
  }
  return r
}

export function joursEnBase(absences: Absence[]): Map<string, number> {
  return new Map(absences.map((a) => [a.jour, a.motif_id]))
}

export interface DiffAbsences {
  /** Jours à poser, par motif. */
  poser: Map<number, string[]>
  /** Jours dont l'absence est retirée. */
  retirer: string[]
}

/** Ce qui change entre les jours en base et les jours voulus. */
export function diffAbsences(
  avant: Map<string, number>,
  apres: Map<string, number>,
): DiffAbsences {
  const poser = new Map<number, string[]>()
  for (const [jour, motif] of [...apres].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (avant.get(jour) === motif) continue
    poser.set(motif, [...(poser.get(motif) ?? []), jour])
  }
  const retirer = [...avant.keys()].filter((j) => !apres.has(j)).sort()
  return { poser, retirer }
}

export const diffVide = (d: DiffAbsences) =>
  d.poser.size === 0 && d.retirer.length === 0

/** Les jours d'une carte : filtrés par un prédicat. */
export function filtrerJours(
  jours: Map<string, number>,
  garder: (jour: string, motif: number) => boolean,
): Map<string, number> {
  return new Map([...jours].filter(([j, m]) => garder(j, m)))
}

// ------------------------------------------------------- règles d'édition

/** Niveau proposé à l'ajout d'un poste. */
export const niveauParDefaut = (contrat: TypeContrat): Niveau =>
  enAlternance(contrat) ? 'soutien' : 'titulaire'

/** Journée étoile possible : au-delà de 35 h payé à l'heure. */
export const etoilePossible = (
  b: Pick<Brouillon, 'heures_hebdo' | 'forfait_jours' | 'type_contrat'>,
) => b.heures_hebdo > 35 && !b.forfait_jours && b.type_contrat !== 'extra'

/** Passer en extra : 0 h et pas de forfait ; en sortir : 35 h si c'était 0. */
export function changerContrat(
  b: Brouillon,
  type_contrat: TypeContrat,
): Brouillon {
  return {
    ...b,
    type_contrat,
    heures_hebdo: type_contrat === 'extra' ? 0 : b.heures_hebdo || 35,
    forfait_jours: type_contrat === 'extra' ? false : b.forfait_jours,
  }
}

/** Change de catégorie ; les compétences hors de ses postes tombent. */
export function changerCategorie(
  b: Brouillon,
  groupeId: number | null,
  postes: Poste[],
  groupes: Groupe[],
): { brouillon: Brouillon; perdues: number } {
  const possibles = postesDuGroupe(
    postes,
    groupes.find((g) => g.id === groupeId),
  )
  const gardees = b.competences.filter((c) =>
    possibles.some((p) => p.id === c.poste_id),
  )
  return {
    brouillon: { ...b, groupe_id: groupeId, competences: gardees },
    perdues: b.competences.length - gardees.length,
  }
}

export function reglerNiveau(
  competences: Competence[],
  posteId: number,
  niveau: Niveau | 'aucun',
): Competence[] {
  if (niveau === 'aucun')
    return competences.filter((c) => c.poste_id !== posteId)
  if (competences.some((c) => c.poste_id === posteId)) {
    return competences.map((c) =>
      c.poste_id === posteId ? { ...c, niveau } : c,
    )
  }
  return [...competences, { poste_id: posteId, niveau }]
}

/**
 * Change un jour de la semaine type. Le prototype effaçait l'horaire en mode
 * Libre ; le moteur l'honore pourtant (horaire imposé les jours travaillés,
 * comme le dit l'aide) : il est gardé en Libre et en Travaille.
 */
export function reglerJour(
  semaine: JourType[],
  j: number,
  changement: Partial<JourType>,
  motifs: Motif[],
): JourType[] {
  return semaine.map((e, i) => {
    if (i !== j) return e
    const mode = changement.mode ?? e.mode
    const travaille = mode === 'auto' || mode === 'travail'
    return {
      ...e,
      ...changement,
      mode,
      type_shift_id: travaille
        ? changement.type_shift_id !== undefined
          ? changement.type_shift_id
          : (e.type_shift_id ?? null)
        : null,
      type_absence_id:
        mode === 'absence'
          ? (changement.type_absence_id ??
            e.type_absence_id ??
            (motifs.length ? motifs[0].id : null))
          : null,
      etoile: travaille ? (changement.etoile ?? e.etoile ?? false) : false,
    }
  })
}

/** Une seule étoile par semaine : en poser une retire les autres. */
export function basculerEtoile(semaine: JourType[], j: number): JourType[] {
  const deja = !!semaine[j]?.etoile
  return semaine.map((e, i) => ({ ...e, etoile: i === j ? !deja : false }))
}

/** La fiche pour l'aperçu des règles (prototype `/regles/apercu`). */
export function ficheApercu(
  b: Pick<
    Brouillon,
    'type_contrat' | 'heures_hebdo' | 'forfait_jours' | 'mineur'
  >,
): Fiche {
  return {
    id: 'apercu',
    postes: new Set<string>(),
    typeContrat: b.type_contrat,
    minutesHebdo: Math.round((Number(b.heures_hebdo) || 0) * 60),
    forfaitJours: b.forfait_jours,
    mineur: b.mineur,
  }
}

/** Ce qui empêche d'enregistrer (null : rien). */
export function erreurBrouillon(b: Brouillon): string | null {
  if (!b.prenom.trim()) return 'Indiquez le prénom.'
  if (!(b.heures_hebdo >= 0 && b.heures_hebdo <= 48)) {
    return 'Les heures par semaine vont de 0 à 48.'
  }
  if (b.date_entree && !dateValide(b.date_entree))
    return "La date d'arrivée est incomplète."
  if (b.date_sortie && !dateValide(b.date_sortie))
    return 'La fin de contrat est incomplète.'
  if (b.date_entree && b.date_sortie && b.date_sortie < b.date_entree) {
    return "La fin de contrat ne peut pas précéder l'arrivée."
  }
  if (b.absences.some((p) => !periodeLisible(p))) {
    return "Une période d'absence est incomplète : indiquez ses deux dates."
  }
  return null
}

// --------------------------------------------------- évolution du contrat

export interface Evolution {
  date: string
  type_contrat: TypeContrat
  groupe_id: number | null
  heures_hebdo: number
}

export function evolutionParDefaut(
  b: Brouillon,
  aujourdhui: string,
): Evolution {
  return {
    date: ajouterJours(aujourdhui, 1),
    type_contrat: b.type_contrat === 'apprenti' ? 'cdi' : b.type_contrat,
    groupe_id: b.groupe_id,
    heures_hebdo: b.heures_hebdo || 35,
  }
}

export function erreurEvolution(b: Brouillon, e: Evolution): string | null {
  if (!dateValide(e.date))
    return 'Indiquez la date de début du nouveau contrat.'
  if (b.date_entree && e.date <= b.date_entree) {
    return "La date doit être après l'arrivée sur le contrat actuel."
  }
  if (
    e.type_contrat !== 'extra' &&
    !(e.heures_hebdo > 0 && e.heures_hebdo <= 48)
  ) {
    return 'Indiquez les heures par semaine du nouveau contrat (plus de 0 h).'
  }
  return null
}

export interface PlanEvolution {
  finAncien: string
  ancien: ValeursSalarie
  nouveau: ValeursSalarie
  /** Jours voulus pour l'ancien contrat (jusqu'à sa fin). */
  joursAncien: Map<string, number>
  /** Jours repris par le nouveau contrat. */
  joursNouveau: Map<string, number>
}

/**
 * Évolution du contrat (prototype `evoluer`) : l'ancien se ferme la veille
 * (sauf s'il était déjà fini avant), le nouveau s'ouvre à la date choisie,
 * relié par `suite_de`, avec ses postes (soutien → titulaire hors
 * alternance), ses congés à venir (sans l'école hors alternance) et sa
 * semaine type (jours d'école remis en Libre hors alternance).
 */
export function planEvolution(
  b: Brouillon & { id: number },
  e: Evolution,
  postes: Poste[],
  groupes: Groupe[],
  motifs: Motif[],
): PlanEvolution {
  const veille = ajouterJours(e.date, -1)
  const finAncien =
    b.date_sortie && b.date_sortie < e.date ? b.date_sortie : veille
  const alternance = enAlternance(e.type_contrat)
  const possibles = postesDuGroupe(
    postes,
    groupes.find((g) => g.id === e.groupe_id),
  )
  const ecoleId = (id: number | null | undefined) =>
    !!motifs.find((m) => m.id === id && estEcole(m))
  const jours = joursDesPeriodes(b.absences)
  const base = valeursSalarie(b)
  const ancien: ValeursSalarie = { ...base, date_sortie: finAncien }
  const nouveau: ValeursSalarie = {
    ...base,
    suite_de: b.id,
    type_contrat: e.type_contrat,
    groupe_id: e.groupe_id,
    heures_hebdo: e.type_contrat === 'extra' ? 0 : e.heures_hebdo,
    forfait_jours: e.type_contrat === 'extra' ? false : b.forfait_jours,
    date_entree: e.date,
    date_sortie:
      b.date_sortie && b.date_sortie >= e.date ? b.date_sortie : null,
    actif: true,
    competences: b.competences
      .filter((c) => possibles.some((p) => p.id === c.poste_id))
      .map((c) =>
        !alternance && c.niveau === 'soutien'
          ? { ...c, niveau: 'titulaire' as const }
          : c,
      ),
    semaine_type: semaineComplete(b.semaine_type).map((x) =>
      !alternance && x.mode === 'absence' && ecoleId(x.type_absence_id)
        ? { ...JOUR_LIBRE }
        : x,
    ),
  }
  return {
    finAncien,
    ancien,
    nouveau,
    joursAncien: filtrerJours(jours, (j) => j <= finAncien),
    joursNouveau: filtrerJours(
      jours,
      (j, m) => j >= e.date && (alternance || !ecoleId(m)),
    ),
  }
}

/** « 03/11/2026 ». */
export function dateFr(iso: string): string {
  const [a, m, j] = iso.split('-')
  return `${j}/${m}/${a}`
}

/** « 35 h », « 35,5 h ». */
export const heuresContrat = (h: number) =>
  `${String(Number(h)).replace('.', ',')} h`

/** « Prénom Nom ». */
export const nomBrouillon = (b: Pick<Brouillon, 'prenom' | 'nom'>) =>
  `${b.prenom} ${b.nom}`.trim()

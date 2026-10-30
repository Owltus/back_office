/*
 * Lignes des tables `planning_*` telles que PostgREST les rend (migration
 * 20261027110000). Mêmes noms que le prototype (`backend/src/planning/db.py`),
 * sauf `horaire_id` / `motif_id` (le prototype dit `type_shift_id` /
 * `type_absence_id`) et les absences, stockées jour par jour.
 *
 * La semaine type garde les clés du prototype (`type_shift_id`,
 * `type_absence_id`) : c'est un JSON, recopié tel quel à l'import.
 */

export type Niveau = 'titulaire' | 'occasionnel' | 'soutien'
export type ModeJour = 'auto' | 'travail' | 'repos' | 'absence'
export type NatureMotif = 'absence' | 'ecole'
export type Categorie =
  'reception' | 'veille_nuit' | 'cuisine' | 'administratif_hors_site' | 'autre'
export type TypeContrat = 'cdi' | 'cdd' | 'extra' | 'stagiaire' | 'apprenti'
/** Période d'un code horaire (consignes de présence). */
export type Periode = 'matin' | 'middle' | 'soir' | 'nuit' | 'court'

export interface Horaire {
  id: number
  code: string
  nom: string
  debut: string
  fin: string // fin <= debut : le lendemain
  couleur: string
  pause: number // minutes comprises dans la présence, hors temps de travail
  raccourci: number // minutes en moins en journée courte
  raccourci_debut: number // dont au début : la journée courte commence plus tard
  periode: Periode | null // null : ni matin ni soir (direction…)
  code_rouge: boolean // code écrit en rouge (petit shift à part)
}

export interface Motif {
  id: number
  code: string
  nom: string
  couleur: string
  decompte: boolean // compté dans les heures (R-ABSENCE-HEURES)
  nature: NatureMotif
}

export interface Poste {
  id: number
  nom: string
  categorie: Categorie
  couleur: string
  horaires_autorises: number[] // vide = tous
  a_part: boolean
  presence: boolean // compte dans les consignes de présence matin et soir
}

export interface Groupe {
  id: number
  nom: string
  ordre: number
  postes_autorises: number[] // vide = tous
}

export interface Competence {
  poste_id: number
  niveau: Niveau
}

export interface JourType {
  mode: ModeJour
  type_shift_id?: number | null
  type_absence_id?: number | null
  etoile?: boolean // journée étoile (courte) fixée ce jour-là
}

export interface Salarie {
  id: number
  prenom: string
  nom: string
  groupe_id: number | null
  type_contrat: TypeContrat
  heures_hebdo: number
  forfait_jours: boolean
  mineur: boolean
  competences: Competence[]
  semaine_type: JourType[]
  shifts_autorises: number[] // vide = tous
  date_entree: string | null
  date_sortie: string | null
  actif: boolean
  suite_de: number | null
}

/** Période d'une consigne de présence (la nuit depuis le 2026-10-30). */
export type PeriodePresence = 'matin' | 'soir' | 'nuit'

/** Combien de personnes le matin, le soir ou la nuit d'un jour de la semaine type,
 * sur les postes qui comptent dans la présence. `maximum` null : pas de
 * plafond. « 3 ou 4 » : minimum 3, maximum 4. */
export interface Consigne {
  id: number
  jour: number // 0 = lundi
  periode: PeriodePresence
  minimum: number
  maximum: number | null
}

/** Un jour d'absence (une ligne par jour). */
export interface Absence {
  id: number
  salarie_id: number
  jour: string // AAAA-MM-JJ
  motif_id: number
}

export interface Besoin {
  id: number
  poste_id: number
  jour: number // 0 = lundi
  horaire_id: number | null
  debut: string
  fin: string
  effectif: number // personnes autonomes requises
  soutien: number // places de renfort pour les profils « soutien »
  renfort: number // places en plus, facultatives
}

export interface Affectation {
  id: number
  lundi: string
  salarie_id: number
  poste_id: number
  jour: number
  horaire_id: number | null
  debut: string
  fin: string
  epinglee: boolean
  court: boolean
  pause: number
  updated_at?: string
}

/** Tout ce que le planning lit, hors shifts d'une semaine. */
export interface Referentiel {
  horaires: Horaire[]
  motifs: Motif[]
  postes: Poste[]
  groupes: Groupe[]
  salaries: Salarie[]
  besoins: Besoin[]
  consignes: Consigne[]
  /** Lundis des semaines verrouillées (AAAA-MM-JJ). */
  verrous: string[]
}

export const CATEGORIES: ReadonlyArray<{
  code: Categorie
  libelle: string
}> = [
  { code: 'reception', libelle: 'Réception' },
  { code: 'veille_nuit', libelle: 'Veille de nuit' },
  { code: 'cuisine', libelle: 'Cuisine' },
  { code: 'administratif_hors_site', libelle: 'Administratif hors site' },
  { code: 'autre', libelle: 'Autre (étages, salle, bar, direction…)' },
]

export const TYPES_CONTRAT: ReadonlyArray<{
  code: TypeContrat
  libelle: string
}> = [
  { code: 'cdi', libelle: 'CDI' },
  { code: 'cdd', libelle: 'CDD' },
  { code: 'extra', libelle: 'Extra' },
  { code: 'stagiaire', libelle: 'Stagiaire' },
  { code: 'apprenti', libelle: 'Apprenti' },
]

export const JOURS = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
] as const

export const SEMAINE_TYPE_VIDE: JourType[] = Array.from({ length: 7 }, () => ({
  mode: 'auto' as const,
}))

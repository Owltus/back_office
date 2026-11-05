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
export type NatureMotif = 'absence' | 'ecole' | 'repos'
/** Identifiant d'un type de contrat (`planning_modeles_contrat.type_contrat`).
 * La LISTE des contrats est celle de l'établissement (2026-11-06) : aucun
 * code n'est lu par le calcul, seulement les cases du modèle. */
export type TypeContrat = string
/** Importance d'un poste (D11 du 2026-11-05). */
export type Importance = 'indispensable' | 'important' | 'si_possible'
/** Force d'une règle de l'établissement (colonne texte en base). */
export type ForceRegle = 'obligatoire' | 'souhaite' | 'aucune'
export type JourIsole = 'interdit' | 'a_eviter' | 'aucune'
/** Niveau demandé par un besoin (étape 7) : titulaire exigé, ou dépannage
 * accepté (aujourd'hui). */
export type NiveauDemande = 'titulaire' | 'depannage'
/** Moment d'un horaire (matin, middle, soir, nuit). Plus de « court »
 * depuis le 2026-10-31 : un horaire court se range d'après son début. */
export type Periode = 'matin' | 'middle' | 'soir' | 'nuit'

/** Un horaire se lit par ses heures et son moment : plus de code depuis le
 * 2026-10-31 (décision utilisateur). Deux horaires n'ont jamais les mêmes
 * heures. Plus de raccourci depuis le 2026-11-02 : une journée étoile est un
 * AUTRE horaire, de moins de 8 h (`etoile.ts`). Un horaire qui commence à
 * minuit s'écrit « 24:00 » sur le jour où il est posé (`horaireDe`). */
export interface Horaire {
  id: number
  nom: string
  debut: string
  fin: string // fin <= debut : le lendemain
  couleur: string
  pause: number // minutes comprises dans la présence, hors temps de travail
  periode: Periode | null // proposé d'après les heures, modifiable
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
  couleur: string
  horaires_autorises: number[] // vide = tous
  /** Durée max d'un service sur ce poste (présence, minutes ; 2026-11-06,
   * à la place de la catégorie), bornée par la loi (`JOUR_MAX_LOI`).
   * Absent (données de test) : `JOUR_MAX_POSTE_DEFAUT`. */
  jour_max_minutes?: number
  presence: boolean // poste de l'accueil le matin et le soir
  /** Poste de l'accueil la nuit (U1 du 2026-11-01). Absent : non. */
  accueil_nuit?: boolean
  /** Poste fermé (U3) : plus proposé nulle part, historique gardé. */
  ferme?: boolean
  /** Heure d'ouverture (HH:MM) : ce poste de l'accueil est tenu dès cette
   * heure chaque matin (2026-11-01). Null : aucune. */
  ouverture?: string | null
  /** Rang dans l'organigramme (0 = le plus haut ; 2026-11-03), réglé par
   * Monter / Descendre. À égalité, l'id départage. Absent : 0. */
  ordre?: number
  /** Jours fériés chômés le jour même, sans rattrapage (encadrement :
   * direction, adjoints, technique ; décision utilisateur du 2026-11-04).
   * Vaut pour qui a ce poste en PREMIER poste de titulaire. Absent : faux. */
  feries_chomes?: boolean
  /** Importance du poste quand il manque du monde (D11, 2026-11-05) :
   * « si possible » reste vide en premier. Absent : important. */
  importance?: Importance
  /** Heure de fermeture (HH:MM) : ce poste est tenu jusqu'à cette heure
   * chaque soir (2026-11-05, `fermeturesAccueil`). Null : aucune. */
  fermeture?: string | null
}

/** Une journée imposée au calcul pour une durée de contrat (colonne
 * `planning_reglages.journees_contrats`). */
export interface JourneesContratLigne {
  minutes_hebdo: number
  durees: number[]
  courtes_max: number
}

/** Réglages généraux du planning (table `planning_reglages`, une ligne) : les
 * RÈGLES DE L'ÉTABLISSEMENT globales (2026-11-05), lues par `lireRegles`.
 * Durées et heures en minutes (heures : depuis minuit). Seule la relève est
 * obligatoire : un champ absent (données de test, base pas encore migrée)
 * reprend `REGLES_PAR_DEFAUT`. */
export interface Reglages {
  /** Temps passé ensemble par l'équipe du matin et celle de l'après-midi. */
  releve_minutes: number
  deux_repos_de_suite?: ForceRegle
  jours_affiles_max?: number
  jours_affiles_conseilles?: number
  jour_isole?: JourIsole
  rythme_contrat_min?: number
  repos_confort?: number
  changements_moment_max?: number
  moment_arriere_jours?: number
  nuits_affilees_max?: number
  repos_apres_nuits?: number
  continuite_obligatoire?: boolean
  passation_veilleur?: boolean
  equipe_tolerance?: number
  duree_ouverture?: number
  nuit_debut?: number
  nuit_fin?: number
  soir_fin?: number
  soir_debut?: number
  matin_debut_avant?: number
  matin_fin_max?: number
  libre_matin_avant?: number
  personnes_nuit?: number
  ecole_veille_fin?: number
  ecole_lendemain_debut?: number
  conge_long?: number
  semaines_en_plus_alerte?: number
  journees_contrats?: JourneesContratLigne[]
  journee_pleine?: number
  journee_courte?: number
  journee_etoile_min?: number
  journees_courtes_max?: number
  /** Ancienneté (mois) qui ouvre le rattrapage d'un jour férié travaillé. */
  ferie_anciennete_mois?: number
  /** Un jour férié travaillé reste à rattraper ce nombre de jours. */
  ferie_rattrapage_jours?: number
}

/** Un type de contrat de l'établissement et ses règles (table
 * `planning_modeles_contrat`, une ligne par contrat ; créés, renommés,
 * retirés dans Équipe depuis le 2026-11-06). */
export interface ModeleContrat {
  type_contrat: TypeContrat
  /** Nom affiché. Absent (données de test) : la clé. */
  nom?: string
  /** Rang dans les listes. Absent : 0. */
  ordre?: number
  /** Durée max d'un jour de travail (minutes) ; null : celle du poste. */
  jour_max_minutes?: number | null
  /** Une personne de ce contrat peut être mineure. */
  mineur_possible?: boolean
  /** Une personne de ce contrat peut être au forfait jours. */
  forfait_possible?: boolean
  /** La fiche exige une fin de contrat. */
  fin_obligatoire?: boolean
  /** Le calcul ne pose que les journées de `journees_contrats`. */
  journees_imposees: boolean
  /** Au-delà de 35 h, une journée étoile chaque semaine. */
  journee_etoile: boolean
  /** Jamais placé par le calcul (à appeler, posé à la main). */
  placement_manuel: boolean
  /** Heures du contrat indicatives (aucune heure due). */
  contrat_indicatif: boolean
  /** Un jour férié travaillé ouvre un jour férié rattrapé, après un an. */
  ferie_rattrape: boolean
  /** Jours fériés pris le jour même. */
  feries_jour_meme: boolean
  /** Alternance (école, CFA). */
  alternance: boolean
}

export interface Groupe {
  id: number
  nom: string
  ordre: number
  postes_autorises: number[] // vide = tous
  /** Ses membres peuvent être cadres au forfait jours, si leur contrat le
   * permet (2026-11-06, à la place du nom « Direction »). Absent : non. */
  forfait_possible?: boolean
}

export interface Competence {
  poste_id: number
  niveau: Niveau
}

export interface JourType {
  mode: ModeJour
  type_shift_id?: number | null
  type_absence_id?: number | null
  /** Journée étoile fixée ce jour-là : s'il travaille, un horaire de moins
   * de 8 h (une version étoile de son horaire, `etoile.ts`). */
  etoile?: boolean
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
  /** Repos validé (true) ou proposition (false) ; toujours validé hors motif
   * de nature repos (trigger `planning_absences_epinglee`). Absent : validé. */
  epinglee?: boolean
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
  /** Besoin obligatoire (vrai) ou souhaité (2026-11-05) : un souhaité est
   * tenu si possible, vide en premier, jamais une place à pourvoir.
   * Absent : obligatoire. */
  obligatoire?: boolean
  /** Niveau demandé (2026-11-05) : « titulaire » = jamais tenu en
   * dépannage. Absent : dépannage accepté. */
  niveau_min?: NiveauDemande
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
  /** Réglages généraux ; absents (données de test) : aucune relève. */
  reglages?: Reglages
  /** Règles par type de contrat ; absentes (données de test) : les
   * défauts (`REGLES_PAR_DEFAUT`). */
  modelesContrat?: ModeleContrat[]
}

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

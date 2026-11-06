/*
 * Lignes des tables `planning_*` telles que PostgREST les rend (migration
 * 20261027110000). Mêmes noms que le prototype (`backend/src/planning/db.py`),
 * sauf `horaire_id` / `motif_id` (le prototype dit `type_shift_id` /
 * `type_absence_id`) et les absences, stockées jour par jour.
 *
 * La semaine type garde les clés du prototype (`type_shift_id`,
 * `type_absence_id`) : c'est un JSON, recopié tel quel à l'import.
 */

/** Niveau d'une personne sur un poste : la clé d'un des trois niveaux
 * FIXES (titulaire, dépannage, soutien), écrits dans `niveaux.ts` seul
 * (décision de l'utilisateur du 2026-11-06). */
export type Niveau = string
export type ModeJour = 'auto' | 'travail' | 'repos' | 'absence'
export type NatureMotif = 'absence' | 'ecole' | 'repos'
/** Identifiant d'un type de contrat (`planning_modeles_contrat.type_contrat`).
 * La LISTE des contrats est celle de l'établissement (2026-11-06) : aucun
 * code n'est lu par le calcul, seulement les cases du modèle. */
export type TypeContrat = string
/** Force d'une règle de l'établissement (colonne texte en base). */
export type ForceRegle = 'obligatoire' | 'souhaite' | 'aucune'
export type JourIsole = 'interdit' | 'a_eviter' | 'aucune'
/** Niveau demandé par un besoin : titulaire seulement, ou null (titulaire
 * ou dépannage). */
export type NiveauDemande = string | null

/** Nombre de personnes demandé à un niveau par un besoin. */
export interface BesoinNiveau {
  niveau: string
  nombre: number
}
/** Moment d'un horaire : l'identifiant d'un moment de l'établissement
 * (`planning_moments.id`, 2026-11-06). À l'hôtel : matin, middle, soir,
 * nuit ; aucun n'est lu par son nom (`moment.ts`). */
export type Periode = string

/** Un moment de la journée de l'établissement (`planning_moments`,
 * 2026-11-06). Un horaire s'y range par ses heures (`momentPropose`) :
 * les moments sont essayés par `priorite` croissante, le premier dont les
 * conditions tiennent l'emporte ; un moment sans condition prend le reste.
 * Heures en minutes depuis minuit. */
export interface Moment {
  id: string
  nom: string
  /** Rang dans la journée (écran, tableau, semaine stable). */
  ordre: number
  /** Rang du classement d'un horaire. */
  priorite: number
  /** Commence à cette heure ou plus tard (null : dès minuit)… */
  debut_de: number | null
  /** … et avant celle-ci (null : jusqu'à minuit). Plus tôt que `debut_de` :
   * la plage passe minuit (21 h à 5 h). */
  debut_a: number | null
  /** Finit à cette heure ou plus tard (une fin après minuit est plus tard
   * que tout)… */
  fin_de: number | null
  /** … et au plus tard à celle-ci. */
  fin_a: number | null
  /** Vrai : toutes les conditions posées ; faux : une seule suffit. */
  toutes: boolean
  /** Horaire libre sans fin connue : rangé ici s'il commence avant cette
   * heure (premier moment de jour du tableau qui convient). */
  libre_avant: number | null
  /** Compte dans le tableau de l'accueil (un chiffre par jour). */
  compte_dans_tableau: boolean
  /** C'est la nuit : la seule notion lue par la loi (mineurs, nuits
   * d'affilée, reprise après des nuits) et par la passation. */
  est_nuit: boolean
  couleur: string | null
  /** Article du nom dans une phrase (relecture du 2026-11-06) ; absent ou
   * null : « la » pour la nuit, « le » sinon (l'ancienne règle). */
  article?: ArticleMoment | null
}

/** L'article d'un moment : « le matin », « la soirée », « l'après-midi ». */
export type ArticleMoment = 'le' | 'la' | "l'"

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
  /** Compte comme un jour libre pour le week-end (2026-11-06, à la place
   * des codes CP, JF, JFR). Absent (données de test) : un repos ou un motif
   * sans décompte (`libreWeekend`). */
  libre_weekend?: boolean
  /** Proposé seulement aux personnes au forfait jours (à la place du nom
   * « forfait »). Absent : non. */
  reserve_forfait?: boolean
  /** Rôle du motif pour le planning, un motif par rôle (à la place des
   * codes JF, JFR, R). Absent : aucun. */
  role?: RoleMotif | null
  /** Icône choisie (`ICONES_MOTIF`) ; absente : devinée d'après le nom. */
  icone?: string | null
}

/** Rôle d'un motif : jour férié pris le jour même, jour férié rattrapé,
 * repos posé par le planning. */
export type RoleMotif = 'ferie_chome' | 'ferie_rattrape' | 'repos_defaut'

/** Critère réparti à part égale entre les personnes d'un même groupe. */
export type CritereEquite = 'weekends' | 'soirs' | 'matins_tot' | 'nuits'

/** Un jour férié en plus des 11 calculés (table `planning_feries`). */
export interface FerieAjoute {
  id: number
  jour: string // AAAA-MM-JJ
  nom: string
  /** Chaque année au même jour et au même mois. */
  recurrent: boolean
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
  /** Zone du poste (`planning_zones`, 2026-11-06, lot 2, A5 : remplace
   * `presence` et `accueil_nuit`, gardées en base, plus lues). Null ou
   * absent : hors zone, le poste a ses besoins. */
  zone_id?: number | null
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
  /** Indispensable au fonctionnement (D11, oui / non) : ses places passent
   * devant les autres quand il manque du monde. Absent : non. La colonne
   * `importance` n'est plus lue (2026-11-06). */
  indispensable?: boolean
  /** Heure de fermeture (HH:MM) : ce poste est tenu jusqu'à cette heure
   * chaque soir (2026-11-05, `fermeturesPostes`). Null : aucune. */
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
 * Durées et heures en minutes (heures : depuis minuit). Un champ absent
 * (données de test, base pas encore migrée) reprend `REGLES_PAR_DEFAUT`. Les
 * colonnes de la passation entre les équipes (`continuite_obligatoire`,
 * `releve_minutes`, `passation_veilleur`, `equipe_tolerance`) restent en
 * base, plus lues : règles fixes depuis le 2026-11-06 (`regles.ts`). */
export interface Reglages {
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
  duree_ouverture?: number
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
  /** Jours du week-end (0 = lundi), règle du week-end libre et partage. */
  weekend_jours?: number[]
  /** La nuit de la veille du week-end le rend travaillé. */
  weekend_nuit_veille?: boolean
  /** Ce qui est réparti à part égale. */
  equite_criteres?: CritereEquite[]
  /** Semaines regardées pour le partage et les heures en plus. */
  equite_semaines?: number
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

/** Moment d'une consigne : un moment du tableau
 * (`Moment.compte_dans_tableau`). */
export type PeriodePresence = string

/** Combien de personnes le matin, le soir ou la nuit d'un jour de la semaine type,
 * sur les postes qui comptent dans la présence. `maximum` null : pas de
 * plafond. « 3 ou 4 » : minimum 3, maximum 4. */
export interface Consigne {
  id: number
  jour: number // 0 = lundi
  periode: PeriodePresence
  minimum: number
  maximum: number | null
  /** Zone du chiffre (2026-11-06) ; absent (données de test) : la
   * première zone. */
  zone_id?: number
}

/** Une zone de l'établissement (`planning_zones`, 2026-11-06, `zones.ts`). */
export interface Zone {
  id: number
  nom: string
  ordre: number
  /** Tenue en continu (trous, personne seule, d'un veilleur à l'autre, et
   * la passation fixe du 2026-11-06). `releve_minutes`, `passation_nuit`,
   * `equipe_tolerance` restent en base, plus lues. */
  continue: boolean
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
  /** Niveau demandé (2026-11-05) : le moins préféré des niveaux qui
   * tiennent la place. Absent ou null : tout niveau autonome. */
  niveau_min?: NiveauDemande
  /** Nombre par niveau (2026-11-06) ; vide ou absent : effectif, soutien et
   * niveau_min font foi. */
  niveaux?: BesoinNiveau[]
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
  /** Jours fériés en plus des 11 calculés ; absents : aucun. */
  feriesAjoutes?: FerieAjoute[]
  /** Moments de la journée (`planning_moments`, 2026-11-06) ; absents
   * (données de test) : ceux de l'hôtel (`MOMENTS_PAR_DEFAUT`). */
  moments?: Moment[]
  /** Zones (`planning_zones`, 2026-11-06) ; absentes (données de test) :
   * l'accueil seul, tenu en continu (`zoneParDefaut`). */
  zones?: Zone[]
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

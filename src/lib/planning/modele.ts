/*
 * Entrées et sorties du solveur, indépendantes de la base et de l'écran
 * (prototype `solveur/modele.py`). Le temps est en minutes RÉELLES depuis le
 * lundi 00:00 de la période (voir `temps.ts`).
 */

import { MINUTES_PAR_JOUR, NUIT_DEBUT, NUIT_FIN } from '#/lib/planning/temps.ts'

/** Un poste à tenir sur une plage horaire, avec le nombre de personnes. */
export interface Creneau {
  id: string
  poste: string
  debut: number
  fin: number
  effectif: number
  /** Code horaire (id en texte), null pour un horaire libre. */
  typeShift: string | null
  /** Places de renfort en plus de l'effectif, pour les profils « soutien ». */
  soutien: number
  /** Minutes de pause comprises dans la présence, hors temps de travail. */
  pause: number
  /** Minutes retirées quand le shift est fait en « journée courte ». */
  raccourci: number
  /** Places en plus de l'effectif, jamais obligatoires. */
  facultatif: number
  /** Jour du planning où le shift est écrit, quand ce n'est pas celui où il
   * commence (la nuit du dimanche « 24:00 → 07:00 »). */
  jourPlanning: number | null
  /** Shift posé à la main hors des besoins : un fait, pas une place. */
  ferme: boolean
  /** Présence maximale propre au poste (R-JOUR-MAX) ; null : pas de limite. */
  presenceMax: number | null
  /** Empiète sur 22 h → 6 h en heure locale ; null : calculé ici. */
  nuit: boolean | null
  /** Consigne de présence où ce créneau compte (poste et période), ou null. */
  presence: 'matin' | 'soir' | null
}

export function creneau(
  c: Partial<Creneau> & Pick<Creneau, 'id' | 'poste' | 'debut' | 'fin'>,
): Creneau {
  return {
    effectif: 1,
    typeShift: null,
    soutien: 0,
    pause: 0,
    raccourci: 0,
    facultatif: 0,
    jourPlanning: null,
    ferme: false,
    presenceMax: null,
    nuit: null,
    presence: null,
    ...c,
  }
}

export function jourDe(c: Creneau): number {
  return c.jourPlanning ?? Math.floor(c.debut / MINUTES_PAR_JOUR)
}

/** Présence, pause comprise (chevauchements, repos entre deux services). */
export function duree(c: Creneau): number {
  return c.fin - c.debut
}

/** Temps de travail effectif, pause déduite (plafonds d'heures). */
export function travail(c: Creneau): number {
  return duree(c) - c.pause
}

export function toucheLaNuit(c: Creneau): boolean {
  if (c.nuit !== null) return c.nuit
  for (let j = jourDe(c) - 1; j <= Math.floor(c.fin / MINUTES_PAR_JOUR); j++) {
    const nd = j * MINUTES_PAR_JOUR + NUIT_DEBUT
    const nf = (j + 1) * MINUTES_PAR_JOUR + NUIT_FIN
    if (c.debut < nf && nd < c.fin) return true
  }
  return false
}

/** Ce que le solveur doit savoir d'un membre du staff. Plafonds déjà
 * calculés depuis le contrat et les règles HCR (`regles.ts`). */
export interface SalarieSolveur {
  id: string
  /** Postes tenus seul (dont `postesOccasionnels`, en dépannage). */
  postes: ReadonlySet<string>
  minutesHebdoContrat: number
  minutesHebdoMax: number
  minutesJourMax: number
  joursTravaillesMaxSemaine: number
  reposQuotidienMin: number
  indisponibilites: ReadonlySet<number>
  /** R-ECOLE-JOURS : jours hors site (CFA), comptés comme travaillés. */
  joursHorsSite: ReadonlySet<number>
  reposConsecutifs: boolean
  nuitInterdite: boolean
  reposFixes: ReadonlySet<number>
  travailFixe: ReadonlySet<number>
  /** (jour, code) : horaire imposé ce jour-là. Clé `${jour}|${code}`. */
  shiftImpose: ReadonlyArray<readonly [number, string]>
  shiftsAutorises: ReadonlySet<string>
  postesOccasionnels: ReadonlySet<string>
  postesSoutien: ReadonlySet<string>
  journeesCourtesMax: number | null
  journeePleine: number
  contratIndicatif: boolean
  placementManuel: boolean
  horsContrat: ReadonlySet<number>
  etoileFixe: ReadonlySet<number>
  finServicePrecedent: number | null
  debutServiceSuivant: number | null
  joursPreferesSemaine: number
  reposDeuxSemaines: number
  joursSemainePrecedente: number | null
  joursSemaineSuivante: number | null
  reposHebdoMin: number
  jourMaxPoste: boolean
  contratDebut: number | null
  contratFin: number | null
  personne: string | null
}

export function salarieSolveur(
  s: Partial<SalarieSolveur> &
    Pick<
      SalarieSolveur,
      | 'id'
      | 'postes'
      | 'minutesHebdoContrat'
      | 'minutesHebdoMax'
      | 'minutesJourMax'
      | 'joursTravaillesMaxSemaine'
      | 'reposQuotidienMin'
    >,
): SalarieSolveur {
  const vide = new Set<never>()
  return {
    indisponibilites: vide,
    joursHorsSite: vide,
    reposConsecutifs: false,
    nuitInterdite: false,
    reposFixes: vide,
    travailFixe: vide,
    shiftImpose: [],
    shiftsAutorises: vide,
    postesOccasionnels: vide,
    postesSoutien: vide,
    journeesCourtesMax: null,
    journeePleine: 0,
    contratIndicatif: false,
    placementManuel: false,
    horsContrat: vide,
    etoileFixe: vide,
    finServicePrecedent: null,
    debutServiceSuivant: null,
    joursPreferesSemaine: 7,
    reposDeuxSemaines: 0,
    joursSemainePrecedente: null,
    joursSemaineSuivante: null,
    reposHebdoMin: 0,
    jourMaxPoste: true,
    contratDebut: null,
    contratFin: null,
    personne: null,
    ...s,
  }
}

/** Présence maximale de ce salarié sur ce créneau : la sienne et celle du poste. */
export function presenceMax(s: SalarieSolveur, c: Creneau): number {
  if (s.jourMaxPoste && c.presenceMax !== null) {
    return Math.min(s.minutesJourMax, c.presenceMax)
  }
  return s.minutesJourMax
}

export function dansLeContrat(s: SalarieSolveur, c: Creneau): boolean {
  return (
    (s.contratDebut === null || c.debut >= s.contratDebut) &&
    (s.contratFin === null || c.fin <= s.contratFin)
  )
}

export type Role = 'titulaire' | 'occasionnel' | 'soutien'

export function role(s: SalarieSolveur, poste: string): Role | null {
  if (s.postes.has(poste)) {
    return s.postesOccasionnels.has(poste) ? 'occasionnel' : 'titulaire'
  }
  return s.postesSoutien.has(poste) ? 'soutien' : null
}

/** Consigne de présence d'un jour de la période (`presence.ts`). */
export interface ConsigneSolveur {
  jour: number
  periode: 'matin' | 'soir'
  minimum: number
  maximum: number | null
}

export interface Probleme {
  salaries: SalarieSolveur[]
  creneaux: Creneau[]
  nbJours: number
  tempsMaxSecondes: number
  /** Change la simulation proposée à qualité égale. */
  graine: number
  /** (salarié, créneau) posés à la main et épinglés : gardés tels quels. */
  imposees: ReadonlySet<string>
  /** Imposées faites en journée courte. */
  courtes: ReadonlySet<string>
  /** Propositions de la génération précédente « salarié|jour|poste|code ». */
  aEviter: ReadonlySet<string>
  /** Consignes de présence du matin et du soir, jour par jour. */
  consignes: ConsigneSolveur[]
}

export const cle = (salarie: string, creneauId: string) =>
  `${salarie}|${creneauId}`

export function probleme(
  p: Partial<Probleme> & Pick<Probleme, 'salaries' | 'creneaux'>,
): Probleme {
  return {
    nbJours: 7,
    tempsMaxSecondes: 10,
    graine: 0,
    imposees: new Set(),
    courtes: new Set(),
    aEviter: new Set(),
    consignes: [],
    ...p,
  }
}

export const cleAEviter = (
  salarie: string,
  jour: number,
  poste: string,
  code: string | null,
) => `${salarie}|${jour}|${poste}|${code ?? ''}`

export type Statut = 'optimal' | 'realisable' | 'inconnu'

export interface AffectationSolveur {
  salarieId: string
  creneauId: string
  court: boolean
}

export interface Manque {
  creneauId: string
  manquant: number
}

export interface Resultat {
  statut: Statut
  affectations: AffectationSolveur[]
  manques: Manque[]
  ecartTotalMinutes: number | null
}

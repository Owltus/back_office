/*
 * Entrées et sorties du solveur, indépendantes de la base et de l'écran
 * (prototype `solveur/modele.py`). Le temps est en minutes RÉELLES depuis le
 * lundi 00:00 de la période (voir `temps.ts`).
 */

import { MINUTES_PAR_JOUR, NUIT_DEBUT, NUIT_FIN } from '#/lib/planning/temps.ts'
import type { Periode, PeriodePresence } from '#/lib/planning/types.ts'

/** Un poste à tenir sur une plage horaire, avec le nombre de personnes. */
export interface Creneau {
  id: string
  poste: string
  debut: number
  fin: number
  effectif: number
  /** Horaire (id en texte), null pour un horaire libre. */
  typeShift: string | null
  /** Places de renfort en plus de l'effectif, pour les profils « soutien ». */
  soutien: number
  /** Minutes de pause comprises dans la présence, hors temps de travail. */
  pause: number
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
  /** Moments du tableau de l'accueil où ce créneau compte (vide : aucun).
   * Un middle de l'accueil compte au matin ET au soir (D11 du 2026-11-01,
   * plan planning-accueil-2026-11-01) : d'où une liste. */
  presence: readonly PeriodePresence[]
  /** Créneau CANDIDAT de l'accueil (`p<jour>-<poste>-<horaire>`, D1, D2) :
   * aucune place propre (effectif 0), chacun peut le prendre ; c'est le
   * chiffre du moment (`Probleme.consignes`) qui fixe combien. Les extras y
   * sont placés en dernier recours (D7), les soutiens y comptent (D5). */
  accueil: boolean
  /** Créneau remplaçant (`r…`) : id `b…` du besoin qu'il sert, avec un autre
   * horaire permis du même cycle (plan planning-cycles-2026-10-30, D13). Null
   * pour un besoin ou un shift posé hors besoins. */
  place: string | null
  /** Version étoile (2026-11-02, `etoile.ts`) : un créneau `r…` dont
   * l'horaire est une version étoile de celui de sa place (un horaire de 7 h
   * contenu dans un horaire de 8 h). Il TIENT la place comme
   * l'horaire demandé : aucun coût de remplaçant, ses vraies minutes face au
   * contrat, présent dès le premier temps du calcul. Faux partout ailleurs. */
  etoile: boolean
  /** Équité (D15) : un soir (période soir de l'horaire). */
  soir: boolean
  /** Équité (D15) : un matin tôt (début à l'heure la plus tôt des matins
   * du poste). */
  matinTot: boolean
  /** Moment de l'horaire (matin, middle, soir, nuit ; sans horaire : l'heure
   * de début), pour la semaine stable et les nuits (règles 6 et 7 du PRD,
   * `plan/planning-bonnes-pratiques/PRD.md`). Null : horaire sans moment,
   * aucune de ces deux règles. */
  moment: Periode | null
}

export function creneau(
  c: Partial<Creneau> & Pick<Creneau, 'id' | 'poste' | 'debut' | 'fin'>,
): Creneau {
  return {
    effectif: 1,
    typeShift: null,
    soutien: 0,
    pause: 0,
    facultatif: 0,
    jourPlanning: null,
    ferme: false,
    presenceMax: null,
    nuit: null,
    presence: [],
    accueil: false,
    place: null,
    etoile: false,
    soir: false,
    matinTot: false,
    moment: null,
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
  /** R-ECOLE-HEURES : minutes comptées par jour d'école dans les plafonds de
   * la semaine, une journée de contrat (`journeeContrat`, `regles.ts`). 0 par
   * défaut ici : sans fiche, rien n'est su. */
  minutesEcoleJour: number
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
  /** R-REPOS-HEBDO-35H d'une semaine à l'autre : début au plus tôt du
   * premier service, quand la semaine d'avant n'a son repos de 35 h qu'en
   * le prolongeant sur celle-ci ; null : pas de borne. */
  debutAuPlusTot: number | null
  joursPreferesSemaine: number
  reposDeuxSemaines: number
  joursSemainePrecedente: number | null
  joursSemaineSuivante: number | null
  /** Jours travaillés d'affilée à la fin de la semaine d'avant, et au début
   * de celle d'après (`JOURS_AFFILES_MAX`) ; 0 : inconnus ou aucun. */
  serieAvant: number
  serieApres: number
  reposHebdoMin: number
  jourMaxPoste: boolean
  contratDebut: number | null
  contratFin: number | null
  personne: string | null
  /** Équité (D15) : personnes comparées entre elles (poste principal) ;
   * null : hors équité (extra, forfait jours, sans poste tenu seul). */
  groupeEquite: string | null
  /** Équité : ce qui est déjà fait sur les `SEMAINES_EQUITE` semaines avant
   * la semaine générée, compté avec elle. Une semaine où la personne n'était
   * pas là (hors contrat, absente) compte pour sa part (`equitesAvant`) :
   * peut être fractionnaire. */
  equiteAvant: EquiteFaite
  /** R-FERIE-RATTRAPE : un jour férié rattrapé (JFR) à placer cette
   * semaine, sur l'un de ces `jours` ; il retire `reduction` minutes aux
   * heures dues et un jour au rythme de 5 jours. null : rien à placer. */
  jfr: { jours: ReadonlySet<number>; reduction: number } | null
  /** Jours fériés travaillés encore à rattraper (AAAA-MM-JJ), pour l'alerte
   * du vérificateur (JOUR-FERIE). */
  feriesARattraper: readonly string[]
  /** Mineur : jours fériés de la semaine, évités par le générateur
   * (`POIDS_MINEUR_FERIE`) et signalés par le vérificateur (MINEUR-FERIE). */
  feriesEvites: ReadonlySet<number>
  /** Règle 4 du PRD : un week-end complet libre (samedi et dimanche sans
   * travail ni école) sur les 3 semaines d'avant. false : aucun, la semaine
   * doit en donner un ; null : inconnu ou sans objet (semaines d'avant pas
   * faites, pas toujours sous contrat, extra). */
  weekendLibreAvant: boolean | null
  /** Règle 4 : la semaine type fixe le samedi ou le dimanche Travaille. */
  weekendFixe: boolean
  /** Règle 4, partage d'abord (décision utilisateur du 2026-11-03) : la
   * semaine type fixe le week-end ET la personne n'a eu aucun week-end libre
   * les 3 semaines d'avant. Cette semaine-là, sa semaine type s'efface pour
   * le lui donner : plus de repos fixes (ses repos peuvent passer au
   * week-end), samedi et dimanche ne sont plus des jours habituels. */
  weekendLibere: boolean
  /** Règle 8 du PRD : jours de semaine (lundi 0 à vendredi 4) de repos la
   * semaine d'avant, à garder si possible. Le week-end tourne (règles 4 et
   * 10) : jamais dedans. */
  reposAvant: ReadonlySet<number>
  /** Règle 8 : la personne a travaillé le samedi ou le dimanche de la
   * semaine d'avant. Passer alors ses repos au week-end ne coûte rien : c'est
   * la rotation des week-ends (règle 10), pas un repos perdu. */
  weekendTravailleAvant: boolean
  /** Règle 7 du PRD : jours de la semaine d'avant (-7 à -1) où la personne
   * a fait une nuit. */
  nuitsAvant: ReadonlySet<number>
  /** Règle 13 du PRD : premier jour de la semaine (0 à 6) où la personne
   * peut reprendre après un congé d'au moins `CONGE_LONG` jours ; null : pas
   * de retour cette semaine. */
  retourConge: number | null
  /** Règle 14 du PRD : jour → fin au plus tard (minutes réelles) la veille
   * d'un jour d'école. */
  finAvantEcole: ReadonlyMap<number, number>
  /** Règle 14 du PRD : jour → début au plus tôt (minutes réelles) le
   * lendemain d'un jour d'école. */
  debutApresEcole: ReadonlyMap<number, number>
}

/** Équité (D15) : semaines d'avant comptées, à poids égal (mois glissant,
 * décision utilisateur du 2026-10-29). */
export const SEMAINES_EQUITE = 4

export interface EquiteFaite {
  weekends: number
  soirs: number
  matinsTot: number
  /** Règle 12 du PRD : minutes au-delà du contrat sur les semaines d'avant
   * (absent : 0). */
  minutesEnPlus?: number
  /** Règle 12 du PRD : semaines d'avant au-delà du contrat (absent : 0). */
  semainesEnPlus?: number
}

export const EQUITE_VIDE: EquiteFaite = { weekends: 0, soirs: 0, matinsTot: 0 }

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
    minutesEcoleJour: 0,
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
    debutAuPlusTot: null,
    joursPreferesSemaine: 7,
    reposDeuxSemaines: 0,
    joursSemainePrecedente: null,
    joursSemaineSuivante: null,
    serieAvant: 0,
    serieApres: 0,
    reposHebdoMin: 0,
    jourMaxPoste: true,
    contratDebut: null,
    contratFin: null,
    personne: null,
    groupeEquite: null,
    equiteAvant: EQUITE_VIDE,
    jfr: null,
    feriesARattraper: [],
    feriesEvites: new Set(),
    weekendLibreAvant: null,
    weekendFixe: false,
    weekendLibere: false,
    reposAvant: vide,
    weekendTravailleAvant: false,
    nuitsAvant: vide,
    retourConge: null,
    finAvantEcole: new Map(),
    debutApresEcole: new Map(),
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

/** Un moment du tableau de l'accueil (`presence.ts`). Depuis le 2026-11-01
 * (D3) le chiffre est EXACT : le générateur lit `minimum` comme le nombre
 * voulu ; `maximum` n'est gardé que pour la forme des données (après la
 * migration, minimum = maximum ; s'il diffère, seul `minimum` compte). */
export interface ConsigneSolveur {
  jour: number
  periode: PeriodePresence
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
  /** Propositions de la génération précédente « salarié|jour|poste|code ». */
  aEviter: ReadonlySet<string>
  /** Tableau de l'accueil : le chiffre de chaque moment, jour par jour. */
  consignes: ConsigneSolveur[]
  /** Ouverture (2026-11-01) : la première heure d'un poste de l'accueil qui
   * a une heure d'ouverture, jour par jour (minutes réelles). */
  ouvertures?: Array<{
    poste: string
    jour: number
    debut: number
    fin: number
  }>
  /** Relève entre le matin et le soir, en minutes (0 ou absent : aucune). */
  releveMinutes?: number
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
  /** Jours fériés rattrapés placés (R-FERIE-RATTRAPE) : au plus un par
   * personne. Absent : aucun. */
  jfr?: Array<{ salarieId: string; jour: number }>
}

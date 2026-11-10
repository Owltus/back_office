/*
 * Entrées et sorties du solveur, indépendantes de la base et de l'écran
 * (prototype `solveur/modele.py`). Le temps est en minutes RÉELLES depuis le
 * lundi 00:00 de la période (voir `temps.ts`).
 */

import { MINUTES_PAR_JOUR, NUIT_DEBUT, NUIT_FIN } from '#/lib/planning/temps.ts'
import type { Periode, PeriodePresence } from '#/lib/planning/types.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { NIVEAUX } from '#/lib/planning/niveaux.ts'
import type { NiveauSolveur } from '#/lib/planning/niveaux.ts'

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
   * Une liste : un middle y a compté au matin ET au soir (D11 du
   * 2026-11-01) ; depuis le 2026-11-05 il ne compte nulle part
   * (`momentsAccueil`). */
  presence: readonly PeriodePresence[]
  /** Créneau CANDIDAT de l'accueil (`p<jour>-<poste>-<horaire>`, D1, D2) :
   * aucune place propre (effectif 0), chacun peut le prendre ; c'est le
   * chiffre du moment (`Probleme.consignes`) qui fixe combien. Les extras y
   * sont placés en dernier recours (D7), les soutiens y comptent (D5). */
  accueil: boolean
  /** Zone du poste du créneau (2026-11-06, `zones.ts`) ; null ou absent :
   * hors zone (un candidat sans zone est de la première zone). */
  zone?: string | null
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
  /** Travail de l'HORAIRE (heure murale, pause déduite) : la journée que
   * juge la règle des journées du calcul (`journeesDuCalcul`). Une nuit de
   * 23:00 à 07:00 reste une journée de 8 h la nuit d'un changement d'heure,
   * où ses minutes réelles font 7 h ou 9 h. Null : les minutes réelles. */
  travailMural: number | null
  /** Poste indispensable (D11, oui / non ; booléen depuis le 2026-11-06) :
   * il passe devant les autres quand il manque du monde (`paliersPlaces`,
   * générateur). */
  indispensable: boolean
  /** Besoin souhaité (`obligatoire = false`, 2026-11-05) : rempli si
   * possible, vide avant toute place obligatoire, jamais une place à
   * pourvoir ni une plage de continuité. Faux partout ailleurs. */
  souhaite: boolean
  /** Niveau demandé (2026-11-05 ; niveaux de l'établissement depuis le
   * 2026-11-06) : rang du moins préféré des niveaux autonomes qui tiennent la
   * place, et son nom. Null : tout niveau autonome. Un soutien reste possible
   * sur ses places de soutien. */
  niveauMax: { rang: number; nom: string } | null
  /** Nombre par niveau (2026-11-06, `demandeDe`) : nombre cumulé demandé
   * jusqu'à chaque rang autonome (le dernier = `effectif`). Null : un seul
   * niveau demandé (le modèle d'avant). */
  paliers: ReadonlyArray<{ rang: number; cumul: number; nom: string }> | null
}

/** Le poste est-il indispensable au fonctionnement ? Un choix oui / non
 * (décision utilisateur du 2026-11-05 : « soit un poste est important, soit
 * il ne l'est pas »), la case `indispensable` du poste (2026-11-06). Absente :
 * non. */
export function estIndispensable(
  p: { indispensable?: boolean | null } | null | undefined,
): boolean {
  return p?.indispensable === true
}

/** Rang d'une place : plus il est haut, plus la place reste vide tard. Deux
 * paliers seulement : indispensable (2), le reste (1). */
export function rangImportance(indispensable: boolean): number {
  return indispensable ? 2 : 1
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
    travailMural: null,
    indispensable: false,
    souhaite: false,
    niveauMax: null,
    paliers: null,
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

/** La journée d'un créneau pour les journées du calcul (7 h, 8 h) et la
 * journée étoile : le travail de son horaire en heure murale, ou ses
 * minutes réelles sans horaire connu (`travailMural`). */
export function journeeDe(c: Creneau): number {
  return c.travailMural ?? travail(c)
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
  /** Le contrat lui-même (heures de la fiche), quand les heures DUES de la
   * semaine (`minutesHebdoContrat`) en retirent des absences, l'école ou des
   * jours hors contrat. `rythmeHumain` le lit : un congé ne change pas qui
   * on est. Absent : `minutesHebdoContrat`. */
  minutesContrat?: number
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
  /** Postes tenus à un niveau autonome qui n'est pas le préféré. */
  postesOccasionnels: ReadonlySet<string>
  /** Postes tenus à un niveau non autonome. */
  postesSoutien: ReadonlySet<string>
  /** Niveau de chaque poste tenu (`niveaux.ts`, 2026-11-06). Absent (données
   * de test) : lu sur les trois ensembles, aux niveaux de l'hôtel. */
  niveauxPostes?: ReadonlyMap<string, NiveauSolveur>
  journeesCourtesMax: number | null
  journeePleine: number
  /** Durées de travail que le calcul peut poser (`journeesDuCalcul`,
   * `regles.ts`) ; null : toutes. Les shifts posés n'y sont pas soumis. */
  journeesCalcul: ReadonlySet<number> | null
  contratIndicatif: boolean
  placementManuel: boolean
  /** Jamais sans un salarié confirmé sur son poste (contrat qui a la case,
   * 2026-11-09, `confirmeSur`, `ensemble`). */
  accompagne: boolean
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
  /** Rythme 5 et 2 strict (`rythmeStrict.ts`, 2026-11-09) : jours NEUTRES
   * de la période (hors contrat, absence longue de plus de 5 jours), qui
   * coupent le rythme. Absent (données de test) : lu sur les autres champs
   * (`joursRythmeDe`). */
  joursNeutres?: ReadonlySet<number>
  /** Rythme 5 et 2 strict : jours de TRAVAIL sans shift de la période
   * (école, absence décomptée de 5 jours au plus), comptés dans le bloc de
   * 5. Lu avec `joursNeutres`. */
  joursTravailRythme?: ReadonlySet<number>
  /** Rythme 5 et 2 strict : la semaine d'avant et celle d'après, jour par
   * jour (7 lettres : T travaillé, école ou absence courte, r repos, n
   * neutre) ; null ou absent :
   * inconnue, rien n'est demandé. */
  etatsAvant?: string | null
  etatsApres?: string | null
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
 * décision utilisateur du 2026-10-29). Le DÉFAUT : l'établissement le règle
 * (`regles.equite.semaines`, 2026-11-06). */
export const SEMAINES_EQUITE = 4

export interface EquiteFaite {
  weekends: number
  soirs: number
  matinsTot: number
  /** Nuits faites (partage des nuits, coché dans les règles ; absent : 0). */
  nuits?: number
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
    journeesCalcul: null,
    contratIndicatif: false,
    placementManuel: false,
    accompagne: false,
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

const PREFERE = NIVEAUX.autonomes[0]
const SECOURS = NIVEAUX.autonomes[NIVEAUX.autonomes.length - 1]
const SOUTIEN = [...NIVEAUX.parId.values()].find(
  (n) => !n.autonome,
) as NiveauSolveur

/** Le niveau de cette personne sur ce poste ; null : elle ne le tient pas. */
export function niveauSur(
  s: SalarieSolveur,
  poste: string,
): NiveauSolveur | null {
  const n = s.niveauxPostes?.get(poste)
  if (n !== undefined) return n
  if (s.postes.has(poste))
    return s.postesOccasionnels.has(poste) ? SECOURS : PREFERE
  return s.postesSoutien.has(poste) ? SOUTIEN : null
}

/** La clé du niveau de cette personne sur ce poste (affichage). */
export function role(s: SalarieSolveur, poste: string): string | null {
  return niveauSur(s, poste)?.id ?? null
}

/** Tient une place seul sur ce poste. */
export function autonomeSur(s: SalarieSolveur, poste: string): boolean {
  return niveauSur(s, poste)?.autonome === true
}

/** Tient ce poste à un niveau non autonome (une place de soutien). */
export function soutienSur(s: SalarieSolveur, poste: string): boolean {
  return niveauSur(s, poste)?.autonome === false
}

/** Jamais seul sur ce poste (D9). */
export function jamaisSeulSur(s: SalarieSolveur, poste: string): boolean {
  return niveauSur(s, poste)?.jamaisSeul === true
}

/** Accompagne une personne jamais seule : autonome, et pas elle-même
 * jamais seule. */
export function referentSur(s: SalarieSolveur, poste: string): boolean {
  const n = niveauSur(s, poste)
  return n !== null && n.autonome && !n.jamaisSeul
}

/** Un salarié CONFIRMÉ sur ce poste (décision de l'utilisateur du
 * 2026-11-09) : il accompagne une personne dont le contrat a la case
 * « Jamais sans un salarié confirmé » (`accompagne`). Autonome (titulaire ou
 * dépannage), pas lui-même jamais seul, et son contrat n'a pas la case. */
export function confirmeSur(s: SalarieSolveur, poste: string): boolean {
  return !s.accompagne && referentSur(s, poste)
}

/** Ce que l'accompagnement lit d'un créneau pour le ranger (`GroupeDe`). */
export type CreneauGroupe = Pick<Creneau, 'poste' | 'debut' | 'fin'> &
  Partial<Pick<Creneau, 'zone' | 'accueil'>>

/** La clé du groupe où une personne cherche qui l'accompagne : la zone du
 * poste, sinon le poste (`accompagnement`, zones.ts, 2026-11-09). Par
 * défaut, le poste seul (données de test sans zone). */
export type GroupeDe = (c: CreneauGroupe) => string
export const parPosteSeul: GroupeDe = (c) => `poste:${c.poste}`

/** « En même temps » (soutien jamais seul, salarié confirmé) : deux
 * créneaux du MÊME groupe (`GroupeDe` : la zone du poste, sinon le poste)
 * dont les heures se chevauchent. Lu par le calcul et le vérificateur. */
export function ensemble(
  c: CreneauGroupe,
  d: CreneauGroupe,
  groupe: GroupeDe = parPosteSeul,
): boolean {
  return groupe(d) === groupe(c) && d.debut < c.fin && c.debut < d.fin
}

/** Un morceau d'un créneau et les créneaux qui le couvrent en entier. */
export interface Morceau<C> {
  debut: number
  fin: number
  par: C[]
}

/** « À tout moment » (2026-11-09) : le créneau `c` coupé aux bornes des
 * créneaux de `ds` qui le croisent (même groupe, `ensemble`), chaque morceau
 * avec les créneaux qui le couvrent EN ENTIER. Une personne qui n'est jamais
 * seule est couverte si chaque morceau a au moins une personne qui
 * l'accompagne. La seule définition, pour les DEUX règles (soutien jamais
 * seul, salarié confirmé) : le calcul écrit une contrainte par morceau, le
 * vérificateur et les raisons d'une place cherchent un morceau sans
 * personne. */
export function morceaux<C extends CreneauGroupe>(
  c: CreneauGroupe,
  ds: readonly C[],
  groupe: GroupeDe = parPosteSeul,
): Array<Morceau<C>> {
  const autour = ds.filter((d) => ensemble(c, d, groupe))
  const bornes = new Set([c.debut, c.fin])
  for (const d of autour) {
    if (d.debut > c.debut && d.debut < c.fin) bornes.add(d.debut)
    if (d.fin > c.debut && d.fin < c.fin) bornes.add(d.fin)
  }
  const triees = [...bornes].sort((a, b) => a - b)
  const r: Array<Morceau<C>> = []
  for (let i = 0; i + 1 < triees.length; i++) {
    const debut = triees[i]
    const fin = triees[i + 1]
    r.push({
      debut,
      fin,
      par: autour.filter((d) => d.debut <= debut && d.fin >= fin),
    })
  }
  return r
}

/** Part du prix du dépannage (0 : le niveau préféré ou non autonome). */
export function partSur(s: SalarieSolveur, poste: string): number {
  return niveauSur(s, poste)?.part ?? 0
}

/** Autonome sur ce poste, mais pas au niveau préféré (en dépannage). */
export function enDepannageSur(s: SalarieSolveur, poste: string): boolean {
  const n = niveauSur(s, poste)
  return n !== null && n.autonome && n.rang > 0
}

/** Le niveau tient-il la place (niveau demandé) ? */
export function niveauAccepte(n: NiveauSolveur, c: Creneau): boolean {
  return !n.autonome || c.niveauMax === null || n.rang <= c.niveauMax.rang
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
  /** Zone du chiffre ; absente : la première zone. */
  zone?: string
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
  /** Fermeture (2026-11-05, symétrique de l'ouverture) : la dernière heure
   * d'un poste de l'accueil qui a une heure de fermeture, jour par jour
   * (minutes réelles). Absent ou vide : aucune. */
  fermetures?: Array<{
    poste: string
    jour: number
    debut: number
    fin: number
  }>
  /** Relève entre le matin et le soir, en minutes (0 ou absent : aucune) :
   * `RELEVE_MINUTES` quand l'accueil est en service (fixe, 2026-11-06). */
  releveMinutes?: number
  /** Règles de l'établissement (`lireRegles`), lues par le générateur ET le
   * vérificateur. Absent : les défauts (l'hôtel). */
  regles?: RegleEtablissement

  /** La nuit du dimanche d'avant (shifts de nuit de l'accueil, minutes de
   * cette semaine) : la passation du lundi matin se fait avec elle
   * (`zonesPassation`). Absent : rien à chercher. */
  veilleDuLundi?: ReadonlyArray<{ debut: number; fin: number; zone?: string }>
  /** Horizon glissant (2026-11-04) : la semaine SUIVANTE esquissée dans le
   * même calcul, pour que la semaine écrite ne la mette pas dans une impasse
   * (jours d'affilée, week-end libre, personnes nécessaires). Rien n'en est
   * écrit : seule la semaine du calcul l'est. Absent : le modèle d'avant,
   * au caractère près. */
  suivante?: Suivante
  /** MESURE seulement (bancs, tests de l'ordre de décision, 2026-11-10),
   * jamais posé par l'app : `sansDeplacement` met le repos seul et le bloc
   * court au prix de 3 repos (le calcul ne déplace plus de repos, sauf
   * faits) ; `heuresDabord` met 3 repos au prix d'un bloc (les heures dues
   * passent avant tout le rythme, 6 jours mis à part). Absent : le modèle
   * de l'app, au caractère près. */
  controle?: { sansDeplacement?: boolean; heuresDabord?: boolean }
}

/** L'esquisse de la semaine suivante : un jour travaillé ou non par
 * personne, sans horaire. */
export interface Suivante {
  /** Par salarié (id du solveur). Absent : pas d'esquisse pour lui (extra,
   * placé à la main). */
  personnes: ReadonlyMap<string, SuivantePersonne>
  /** Groupes de personnes et ce qu'il en faut chaque jour (0 à 6), déjà
   * diminué de ce que tiennent les shifts posés hors esquisse. */
  groupes: ReadonlyArray<GroupeSuivante>
}

export interface GroupeSuivante {
  membres: ReadonlySet<string>
  /** Postes (ids du solveur) que le groupe tient : un shift gardé ne compte
   * que pour les groupes de son poste. */
  postes: ReadonlySet<string>
  besoins: readonly number[]
}

export interface SuivantePersonne {
  /** Jour (0 à 6) → 1 : travaillé d'office (shift gardé, école) ; 0 :
   * impossible (absence, hors contrat, repos fixe). Absent : à choisir. */
  fixes: ReadonlyMap<number, 0 | 1>
  /** Rythme 5 et 2 strict : jours neutres (0 à 6 ; hors contrat, absence
   * longue). Absent : aucun. */
  neutres?: ReadonlySet<number>
  /** Rythme 5 et 2 strict : jours de travail sans shift (0 à 6 ; école,
   * absence décomptée de 5 jours au plus). Absent : aucun. */
  travailRythme?: ReadonlySet<number>
  /** Rythme 5 et 2 strict : la semaine d'APRÈS l'esquisse, ses faits
   * seulement (7 lettres : T école ou absence courte, n neutre, u
   * inconnu). Absent : inconnue. */
  apres?: string
  /** Jours de travail attendus (rythme de 5 jours) ; 0 : aucun. */
  attendus: number
  /** Jours d'école (travaillés d'office, mais pas à l'hôtel : ils ne
   * comptent dans aucun groupe). */
  horsSite: ReadonlySet<number>
  /** Jour → poste (id du solveur) du shift gardé : il ne compte que pour
   * les groupes de ce poste. */
  postesGardes: ReadonlyMap<number, string>
  /** Samedi (5) ou dimanche (6) de la semaine suivante, ou du calcul
   * (`nonLibresIci`), pris par une absence qui ne libère pas le week-end
   * (maladie, formation, sans solde, école) : un week-end travaillé pour la
   * règle 4, comme dans `weekendLibreAvantDe`. */
  nonLibres: ReadonlySet<number>
  nonLibresIci: ReadonlySet<number>
  /** Week-end libre dans les 2 semaines d'avant le calcul : false = aucun,
   * le week-end du calcul ou celui d'après doit l'être (règle 4) ; null :
   * règle sans objet ou inconnue. */
  weekendLibreAvant: boolean | null
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

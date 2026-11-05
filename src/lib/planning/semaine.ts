/*
 * Le planning d'une semaine : analyse en direct et préparation d'une
 * génération autour des shifts épinglés (prototype `semaine.py`). Pur : les
 * données arrivent déjà lues (service), les écritures repartent par les RPC.
 * Les créneaux des besoins s'appellent « b<id> », ceux du planning « a<id> »,
 * les candidats de l'accueil « p<jour>-<poste>-<horaire> » (plan
 * planning-accueil-2026-11-01 : l'accueil n'a plus de besoins, D13, c'est
 * le chiffre de chaque moment qui compte, D1-D3).
 *
 * Sorties : mêmes noms de champs que l'API du prototype (`SemaineOut`…), pour
 * que l'écran se porte tel quel.
 */

import {
  cycleDe,
  estCourt,
  nuitDeLaVeille,
  trousAccueilDuJour,
} from '#/lib/planning/cycles.ts'
import type { PresencePoste } from '#/lib/planning/cycles.ts'
import {
  aJourneeCourteImposee,
  lireRegles,
  modeleDe,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import {
  codePrevuAuPoste,
  codesDeLaFiche,
  codesDuPoste,
  codesImposes,
} from '#/lib/planning/eligibilite.ts'
import { travailHoraire, versionsEtoile } from '#/lib/planning/etoile.ts'
import { codeDeLaFiche } from '#/lib/planning/eligibilite.ts'
import {
  estJfr,
  ferieDe,
  feriesARattraper,
  feriesEntre,
} from '#/lib/planning/feries.ts'
import type { JourFerie } from '#/lib/planning/feries.ts'
import {
  creneau,
  duree,
  jourDe,
  probleme,
  role,
  travail,
  cle,
  cleAEviter,
  SEMAINES_EQUITE,
} from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  Probleme,
  Resultat,
  Role,
  GroupeSuivante,
  SalarieSolveur,
  Suivante,
  SuivantePersonne,
  EquiteFaite,
} from '#/lib/planning/modele.ts'
import {
  FERIE_RATTRAPAGE_JOURS,
  JOURS_CONTRAT,
  alerteBesoin,
  droitAuRattrapage,
  presenceMaxPoste,
  reductionJourFerie,
  versSolveur,
} from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import {
  jourIsoleDe,
  rythmeHumain,
  apresContrat,
} from '#/lib/planning/regles.ts'

import {
  accueilActif,
  bilanPresence,
  chiffreAccueil,
  estPosteAccueil,
  momentsAccueil,
  momentLibre,
  periodeShift,
  tientLaNuit,
} from '#/lib/planning/presence.ts'
import type { PresenceOut } from '#/lib/planning/presence.ts'
// Cycle d'import voulu (semaine → raisonsPlaces → coherence → semaine) :
// `phraseCommune` n'est appelée qu'à l'exécution, jamais au chargement.
import { phraseCommune } from '#/lib/planning/raisonsPlaces.ts'
import {
  MINUTES_PAR_JOUR,
  ajouterJours,
  bornes,
  decalageParis,
  ecartJours,
  heuresLisibles,
  hhmm,
  bornesMurales,
  horaireDe,
  lundiDe,
  minuteReelle,
  minutes,
  toucheLaNuit,
  versJour,
} from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type {
  Absence,
  Affectation,
  Besoin,
  Consigne,
  Horaire,
  Motif,
  Periode,
  PeriodePresence,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'
import {
  moraleQuiBloque,
  REGLES_MORALES,
  ouverturesManquees,
  raisonsBlocage,
  raisonsBlocageAccueil,
  relevesManquantes,
  equipesDesynchro,
  transmissions,
  reposHebdoTrouve,
  trous,
  violations,
} from '#/lib/planning/verificateur.ts'
import type { Transmissions, Violation } from '#/lib/planning/verificateur.ts'

// ----------------------------------------------------------------- sorties

export interface AlerteOut {
  regle: string
  message: string
  nature: 'loi' | 'organisation'
}

export interface ShiftOut {
  id: number
  salarie_id: number
  poste_id: number
  jour: number
  type_shift_id: number | null
  debut: string
  fin: string
  duree: number // travail effectif, pause déduite
  pause: number
  /** Journée étoile (D5 du 2026-11-02, calculée, rien n'est stocké) : un
   * contrat à journée étoile (plus de 35 h, ni forfait ni extra) sur un
   * horaire de moins de 8 h. L'écran y met l'étoile. */
  etoile: boolean
  epinglee: boolean
  besoin_id: number | null
  /** Horaire imposé par le besoin quand le shift posé en a un autre du même
   * cycle (« 08:00–16:45 au lieu de 07:00–15:45 », plan planning-cycles-2026-10-30) ; null
   * sinon. Ajouté le 2026-10-30 ; absent de l'API du prototype. */
  code_demande: number | null
  role: Role | null
  alertes: AlerteOut[]
}

export interface RaisonOut {
  salarie_id: number
  messages: string[]
  /** Identifiant de la règle de chaque message, dans le même ordre
   * (`raisonsPlaces.ts` en fait une phrase et un lien). Ajouté le
   * 2026-10-29 ; absent de l'API du prototype. */
  regles: string[]
}

export interface APourvoirOut {
  /** Id du besoin ; pour un moment de l'accueil, `idPlaceAccueil` (< 0,
   * aucun besoin ne le porte). */
  besoin_id: number
  /** Moment de l'ACCUEIL incomplet (plan planning-accueil-2026-11-01,
   * étape 4) : la place n'est pas un besoin mais le chiffre du moment ;
   * `poste_id` vaut `POSTE_ID_ACCUEIL`, `type_shift_id` null, `debut` et
   * `fin` l'étendue des horaires possibles du moment (vides s'il n'y en a
   * aucun), `raisons` celles de `raisonsBlocageAccueil`, `remplacants` vide.
   * Phrase : `phrasePlaceAccueil` (`raisonsPlaces.ts`). Absent pour un
   * besoin. */
  moment?: PeriodePresence
  poste_id: number
  jour: number
  type_shift_id: number | null
  debut: string
  fin: string
  duree: number
  manquant: number
  /** Pourquoi chacun ne peut pas prendre la place avec l'horaire imposé. */
  raisons: RaisonOut[]
  /** Les autres horaires qui pourraient tenir la place : ses versions étoile
   * (`versionsEtoileDe`) puis les autres horaires du même cycle
   * (`remplacantsDe`), et pourquoi chacun ne peut pas les prendre non plus.
   * Vide pour un horaire sans moment ou sans voisin. Ajouté le 2026-10-30
   * (plan planning-cycles-2026-10-30, étape 5) ; absent du prototype. */
  remplacants: Array<{ type_shift_id: number; raisons: RaisonOut[] }>
  /** Règle (identifiant, comme `RaisonOut.regles`) qui bloque TOUT LE MONDE,
   * sur l'horaire imposé comme sur chaque remplaçant : celle de « Je ne peux
   * pas remplir le 07:00–15:45 ». Null : personne à qui la poser, ou quelqu'un
   * qu'aucune règle ne bloque sur au moins un horaire, ou pas de règle commune. Un extra
   * seulement « à appeler » (règle `EXTRA` seule) n'est pas compté. */
  raison_commune: string | null
}

/** `TrouOut.poste_id` d'un trou de l'accueil ENTIER (D15, 2026-11-01) :
 * Réception et Club ensemble, aucun poste en particulier. */
export const POSTE_ID_ACCUEIL = 0

/** `APourvoirOut.besoin_id` d'un moment de l'accueil incomplet : négatif
 * (aucun besoin), unique par jour et moment dans la semaine. */
export const idPlaceAccueil = (jour: number, periode: PeriodePresence) =>
  -(1 + jour * 3 + ORDRE_MOMENTS[periode])
const ORDRE_MOMENTS: Readonly<Record<PeriodePresence, number>> = {
  matin: 0,
  soir: 1,
  nuit: 2,
}

/** Un trou entre deux équipes, pour l'écran. */
export interface TrouOut {
  /** `POSTE_ID_ACCUEIL` (0) pour l'accueil entier. */
  poste_id: number
  /** Jour du planning (0 = lundi) des besoins qui fixent la plage. */
  jour: number
  /** Heures d'horloge (« 15:00 »), fin exclue ; une fin à minuit vaut
   * « 00:00 ». */
  debut: string
  fin: string
}

/** Minutes RÉELLES depuis le lundi (repère du solveur) → heure d'horloge à
 * Paris. Inverse de `minuteReelle` : le lundi 00:00 n'est jamais sur un
 * changement d'heure (il a lieu le dimanche à 01:00 UTC). */
export function heureMurale(lundi: string, reelle: number): string {
  const naif = versJour(lundi) * 86_400_000
  const origine = naif - decalageParis(naif - 3 * 3_600_000) * 60_000
  const instant = origine + reelle * 60_000
  const murale = Math.round(
    (instant + decalageParis(instant) * 60_000 - naif) / 60_000,
  )
  return hhmm(
    ((murale % MINUTES_PAR_JOUR) + MINUTES_PAR_JOUR) % MINUTES_PAR_JOUR,
  )
}

export interface BilanOut {
  salarie_id: number
  minutes: number
  minutes_contrat: number
  minutes_max: number
  jours: number
  alertes: AlerteOut[]
  absences: Record<number, number | null> // jour → motif
  absences_semaine_type: number[]
  repos_fixes: number[]
  hors_contrat: number[]
  repos_deduits: number[]
  /** Repos POSÉS de la semaine (motif de nature repos) encore en
   * proposition : la génération les efface (2026-10-31). Un repos déduit
   * est toujours une proposition, un repos fixe toujours validé. */
  repos_proposes: number[]
  /** Jours fériés rattrapés (JFR) posés et encore en proposition
   * (R-FERIE-RATTRAPE, 2026-11-02) : la génération les efface et les
   * repropose, « Valider » les valide. Absent : données d'avant. */
  jfr_proposes?: number[]
  /** Repos OBLIGÉS (2026-11-04, décision utilisateur) : un jour à venir sans
   * shift où travailler enfreindrait une règle stricte (plus de 6 jours
   * d'affilée, semaines voisines comprises, ou moins que le repos quotidien
   * entre deux services). Montré « Repos » avec sa raison, en proposition ;
   * la génération l'écrit comme ses autres repos. Absent : données d'avant. */
  repos_obliges?: ReposOblige[]
}

export interface ReposOblige {
  jour: number
  raison: string
}

export interface EquipeOut {
  jour: number
  moment: 'matin' | 'soir'
  /** Arrivées étalées : la première et la dernière (heures d'horloge). */
  arrivees: { debut: string; fin: string } | null
  /** Soir : départs étalés. */
  departs: { debut: string; fin: string } | null
  sans_releve: number
}

export interface SemaineOut {
  lundi: string
  affectations: ShiftOut[]
  a_pourvoir: APourvoirOut[]
  bilan: BilanOut[]
  alertes_besoins: Array<{ besoin_id: number; message: string }>
  /** Consignes de présence du matin et du soir, et ce que la semaine en fait. */
  presence: PresenceOut[]
  /** Trous entre deux équipes (étape 6) : moments d'un poste sans personne
   * autonome entre le premier et le dernier besoin du jour
   * (`verificateur.trous`), en heures d'horloge. Ajouté le 2026-10-30 ;
   * absent de l'API du prototype. */
  trous: TrouOut[]
  /** Jours (0 à 6) sans relève entre l'équipe du matin et celle de
   * l'après-midi (2026-11-01). Absent : données d'avant. */
  releves_manquantes?: number[]
  /** Équipes de l'accueil désynchronisées (règle 17 du PRD, 2026-11-03) :
   * arrivées étalées, départs du soir étalés, personnes du soir sans relève,
   * en heures d'horloge. Absent : données d'avant. */
  equipes?: EquipeOut[]
  /** Transmissions de l'accueil d'une équipe à l'autre, jour par jour
   * (`transmissions`). Absent : données d'avant. */
  transmissions?: Transmissions[]
  stats: {
    places: number
    pourvues: number
    /** Places et places pourvues, jour par jour (0 = lundi) : la vue mois ne
     * compte que les jours du mois. */
    places_jour: number[]
    pourvues_jour: number[]
    infractions: number
    alertes_organisation: number
  }
  verrouillee: boolean
}

// ----------------------------------------------------------------- entrées

/** Ce que l'analyse d'une semaine lit (le service le rassemble). */
export interface DonneesSemaine {
  lundi: string
  referentiel: Referentiel
  /** Jours d'absence couvrant au moins la semaine d'avant, celle-ci et celle
   * d'après (les voisines servent à l'école des semaines voisines). */
  absences: Absence[]
  affectations: Affectation[]
  /** Shifts de la semaine d'avant et d'après (repos de 11 h, 3 jours de
   * repos sur deux semaines). */
  avant: Affectation[]
  apres: Affectation[]
  /** Shifts de la semaine d'avant-avant : la fin du dernier service y borne
   * le repos de 35 h de la semaine d'avant (`debutApresReposHebdo`). Absent :
   * non lue, la semaine d'avant est supposée précédée d'un service fini le
   * lundi à 0 h (prudent : un lundi libre ne fait pas à lui seul 35 h). */
  avantAvant?: Affectation[]
  /** Équité (D15) : shifts des `SEMAINES_EQUITE` semaines d'avant (chacun
   * porte son `lundi`), lus pour une génération seulement
   * (`fetchSemainePourGeneration`), avec les absences sur la même étendue.
   * Absent : seule la semaine d'avant compte. */
  historique?: Affectation[]
  /** Shifts des semaines d'avant, jusqu'à `FERIE_RATTRAPAGE_JOURS` avant le
   * lundi (chacun porte son `lundi`) : un jour férié travaillé à rattraper
   * (R-FERIE-RATTRAPE). Les absences doivent couvrir la même étendue. Absent :
   * seules les semaines déjà lues (`avant`, `avantAvant`, `historique`)
   * comptent. */
  anterieures?: Affectation[]
}

export interface Contexte {
  lundi: string
  horaires: Map<number, Horaire>
  postes: Map<number, Poste>
  staff: Salarie[]
  besoins: Besoin[] // heures déjà résolues depuis leur horaire
  consignes: Consigne[]
  affectations: Affectation[]
  sansDecompte: Set<number>
  ecole: Set<number>
  /** Motifs de nature repos (un repos posé à une date). */
  motifsRepos: Set<number>
  /** salarié → (date → motif) */
  absences: Map<number, Map<string, number>>
  /** Repos posés encore en proposition : « salarié|date ». */
  reposProposes: Set<string>
  /** Motifs « Jour férié rattrapé » (code JFR, `estJfr`). */
  motifsJfr: Set<number>
  /** JFR posés encore en proposition : « salarié|date ». */
  jfrProposes: Set<string>
  /** Règles de l'établissement (`lireRegles`). */
  regles: RegleEtablissement
}

export function estEcole(m: Pick<Motif, 'nature' | 'code' | 'nom'>): boolean {
  if (m.nature === 'ecole') return true
  const nom = m.nom.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  return m.code === 'EC' || nom.startsWith('ecole')
}

/** Codes des absences choisies qui laissent un jour vraiment libre :
 * congé payé, jour férié chômé, jour férié rattrapé. */
export const CODES_CONGE_LIBRE: ReadonlySet<string> = new Set([
  'CP',
  'JF',
  'JFR',
])

/** Règle 4 du PRD : une absence qui compte comme un jour libre pour le
 * week-end. Oui : un repos (motif de nature repos), une absence sans
 * décompte (repos exceptionnel, récupération, repos forfait), un congé
 * choisi (`CODES_CONGE_LIBRE`). Non : maladie, formation, sans solde,
 * absence autorisée, congé pour décès, école (relecture du 2026-11-03 :
 * un week-end malade n'est pas un week-end avec les siens). */
export function absenceLibre(
  m: Pick<Motif, 'code' | 'nature' | 'decompte'>,
): boolean {
  if (m.nature === 'ecole') return false
  return (
    m.nature === 'repos' ||
    !m.decompte ||
    CODES_CONGE_LIBRE.has(m.code.trim().toUpperCase())
  )
}

export function indexerAbsences(
  absences: Absence[],
): Map<number, Map<string, number>> {
  const r = new Map<number, Map<string, number>>()
  for (const a of absences) {
    let m = r.get(a.salarie_id)
    if (!m) {
      m = new Map()
      r.set(a.salarie_id, m)
    }
    m.set(a.jour, a.motif_id)
  }
  return r
}

export function contexte(d: DonneesSemaine): Contexte {
  const lundi = lundiDe(d.lundi)
  const motifsRepos = new Set(
    d.referentiel.motifs.filter((m) => m.nature === 'repos').map((m) => m.id),
  )
  const motifsJfr = new Set(
    d.referentiel.motifs.filter(estJfr).map((m) => m.id),
  )
  const horaires = new Map(d.referentiel.horaires.map((h) => [h.id, h]))
  const besoins = [...d.referentiel.besoins]
    .map((b) => {
      const h = b.horaire_id !== null ? horaires.get(b.horaire_id) : undefined
      // Les heures de l'horaire, minuit en début écrit 24:00 (`horaireDe`).
      return h ? { ...b, ...horaireDe(h) } : { ...b }
    })
    .sort(
      (a, b) =>
        a.jour - b.jour || (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0),
    )
  const presents = new Set(d.affectations.map((a) => a.salarie_id))
  return {
    lundi,
    horaires,
    postes: new Map(d.referentiel.postes.map((p) => [p.id, p])),
    // Désactivés : hors du jeu, sauf s'ils ont déjà des shifts cette semaine.
    staff: [...d.referentiel.salaries]
      .sort((a, b) => a.id - b.id)
      .filter((x) => x.actif || presents.has(x.id)),
    besoins,
    consignes: d.referentiel.consignes,
    affectations: d.affectations,
    sansDecompte: new Set(
      d.referentiel.motifs.filter((m) => !m.decompte).map((m) => m.id),
    ),
    ecole: new Set(d.referentiel.motifs.filter(estEcole).map((m) => m.id)),
    motifsRepos,
    absences: avecFeriesDuJour(d, lundi),
    reposProposes: new Set(
      d.absences
        .filter((a) => a.epinglee === false && motifsRepos.has(a.motif_id))
        .map((a) => `${a.salarie_id}|${a.jour}`),
    ),
    motifsJfr,
    jfrProposes: new Set(
      d.absences
        .filter((a) => a.epinglee === false && motifsJfr.has(a.motif_id))
        .map((a) => `${a.salarie_id}|${a.jour}`),
    ),
    regles: lireRegles(d.referentiel),
  }
}

// ------------------------------------------------- jours fériés rattrapés

/** Tous les shifts connus de `d`, semaine `courantes` comprise, sans
 * doublon (les semaines lues se recouvrent). */
export function shiftsConnus(
  d: DonneesSemaine,
  courantes: readonly Affectation[],
): Affectation[] {
  const vus = new Map<number, Affectation>()
  for (const a of [
    ...(d.anterieures ?? []),
    ...(d.historique ?? []),
    ...(d.avantAvant ?? []),
    ...d.avant,
  ])
    if (a.lundi !== d.lundi) vus.set(a.id, a)
  for (const a of courantes) vus.set(a.id, a)
  return [...vus.values()]
}

/**
 * R-FERIE-RATTRAPE : jours fériés travaillés que chaque personne doit encore
 * rattraper, sur les `FERIE_RATTRAPAGE_JOURS` jours avant le lundi et la
 * semaine elle-même (`feriesARattraper`). Un shift du jour férié, proposé ou
 * validé, ouvre le rattrapage ; chaque JFR posé en rattrape un, le plus
 * ancien d'abord. Les jours fériés des `FERIE_RATTRAPAGE_JOURS` jours d'avant
 * la fenêtre prennent leurs JFR en premier (`depuis`) : un JFR ne compte
 * jamais pour deux jours fériés. Personne sans droit (date d'entrée vide, moins d'un an, extra,
 * stagiaire) : rien.
 */
export function feriesEnAttente(
  ctx: Pick<Contexte, 'lundi' | 'staff' | 'absences' | 'motifsJfr'> & {
    postes?: ReadonlyMap<number, Pick<Poste, 'feries_chomes'>>
  } & Partial<Pick<Contexte, 'regles'>>,
  shifts: readonly Affectation[],
): Map<number, JourFerie[]> {
  const du = ajouterJours(ctx.lundi, -FERIE_RATTRAPAGE_JOURS)
  const depuis = ajouterJours(du, -FERIE_RATTRAPAGE_JOURS)
  const au = ajouterJours(ctx.lundi, 6)
  const travailles = new Map<number, Set<string>>()
  for (const a of shifts) {
    const date = ajouterJours(a.lundi, a.jour)
    if (date < depuis || date > au) continue
    let t = travailles.get(a.salarie_id)
    if (!t) {
      t = new Set()
      travailles.set(a.salarie_id, t)
    }
    t.add(date)
  }
  const r = new Map<number, JourFerie[]>()
  for (const x of ctx.staff) {
    const siens = travailles.get(x.id)
    if (!siens) continue
    // Encadrement : le jour férié se prend le jour même, jamais rattrapé.
    if (ctx.postes && feriesChomes(x, ctx.postes)) continue
    const poses = [...(ctx.absences.get(x.id) ?? [])]
      .filter(([, m]) => ctx.motifsJfr.has(m))
      .map(([date]) => date)
    const liste = feriesARattraper({
      salarie: x,
      du,
      au,
      depuis,
      travailles: siens,
      jfrPoses: poses,
      regles: ctx.regles,
    })
    if (liste.length) r.set(x.id, liste)
  }
  return r
}

/** Encadrement (décision utilisateur du 2026-11-04) : le PREMIER poste de
 * titulaire de la fiche a ses jours fériés chômés le jour même
 * (`Poste.feries_chomes`). */
export function feriesChomes(
  x: Pick<Salarie, 'competences'>,
  postes: ReadonlyMap<number, Pick<Poste, 'feries_chomes'>>,
): boolean {
  const principal = x.competences.find((c) => c.niveau === 'titulaire')
  return !!principal && !!postes.get(principal.poste_id)?.feries_chomes
}

/** Un jour férié pris le jour même par l'encadrement : après un an
 * d'ancienneté (comme le rattrapage, « quoi qu'il arrive »), un jour de
 * travail de sa semaine type ; une semaine type sans jour « Travaille » :
 * tous les jours (décision utilisateur du 2026-11-04). Un jour férié qui
 * tombe un jour de repos habituel n'est pas rendu. */
export function ferieDuJour(
  x: Pick<Salarie, 'type_contrat' | 'date_entree' | 'semaine_type'>,
  date: string,
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): boolean {
  if (!droitAuRattrapage(x, date, regles)) return false
  const travail = x.semaine_type.map((e) => e.mode === 'travail')
  if (!travail.some(Boolean)) return true
  return travail[ecartJours(lundiDe(date), date)] ?? false
}

/** Les absences, plus les jours fériés pris LE JOUR MÊME, ajoutés au calcul
 * en absence au motif JF (Jour férié), décomptée comme un congé : jamais
 * placés ce jour-là, une journée de contrat de moins. Rien n'est écrit en
 * base : c'est relu à chaque calcul. Sans motif JF, rien. Pour :
 *   - les STAGIAIRES, tous leurs jours fériés sous contrat (décision
 *     utilisateur du 2026-11-02 : « les stagiaires ont tous leurs jours
 *     fériés ») ;
 *   - l'ENCADREMENT (`feriesChomes`, décision du 2026-11-04) : ceux de
 *     `ferieDuJour`, sans rattrapage.
 * Jamais sur un jour où une absence ou un shift est déjà posé. */
export function avecFeriesDuJour(
  d: DonneesSemaine,
  lundi: string,
): Map<number, Map<string, number>> {
  const r = indexerAbsences(d.absences)
  const jf = d.referentiel.motifs.find((m) => m.code === 'JF')
  if (!jf) return r
  const feries = feriesEntre(ajouterJours(lundi, -28), ajouterJours(lundi, 20))
  const postes = new Map(d.referentiel.postes.map((p) => [p.id, p]))
  const regles = lireRegles(d.referentiel)
  for (const x of d.referentiel.salaries) {
    const stagiaire = modeleDe(regles, x.type_contrat).feriesJourMeme
    const encadrement = !stagiaire && feriesChomes(x, postes)
    if (!stagiaire && !encadrement) continue
    for (const f of feries) {
      if (x.date_entree && f.date < x.date_entree) continue
      if (x.date_sortie && f.date > x.date_sortie) continue
      if (encadrement && !ferieDuJour(x, f.date)) continue
      const posee = d.affectations.some(
        (a) =>
          a.salarie_id === x.id && ajouterJours(a.lundi, a.jour) === f.date,
      )
      const siennes = r.get(x.id) ?? new Map<string, number>()
      if (posee || siennes.has(f.date)) continue
      siennes.set(f.date, jf.id)
      r.set(x.id, siennes)
    }
  }
  return r
}

// ------------------------------------------------------ jours d'une fiche

/** Jours d'absence fixes de la semaine type, avec leur motif. */
export function absencesSemaineType(x: Salarie): Map<number, number | null> {
  const r = new Map<number, number | null>()
  x.semaine_type.forEach((e, j) => {
    if (e.mode === 'absence') r.set(j, e.type_absence_id ?? null)
  })
  return r
}

export function joursHorsContrat(x: Salarie, lundi: string): Set<number> {
  const r = new Set<number>()
  for (let j = 0; j < 7; j++) {
    const jour = ajouterJours(lundi, j)
    if (
      (x.date_entree && jour < x.date_entree) ||
      (x.date_sortie && jour > x.date_sortie)
    ) {
      r.add(j)
    }
  }
  return r
}

/** Journées de contrat perdues par `hors` jours hors contrat dans la
 * semaine : 5 jours de contrat sur 7, donc les 2 premiers jours hors contrat
 * ne coûtent rien (départ le jeudi, 3 jours hors contrat : 1). */
export function joursContratManquants(hors: number): number {
  return Math.max(0, hors - (7 - JOURS_CONTRAT))
}

/** Jours de la semaine où la personne n'est pas là, avec le motif. */
export function joursAbsents(
  x: Salarie,
  lundi: string,
  absences: Map<number, Map<string, number>>,
): Map<number, number | null> {
  const r = new Map<number, number | null>()
  const siennes = absences.get(x.id)
  for (let j = 0; j < 7; j++) {
    const m = siennes?.get(ajouterJours(lundi, j))
    if (m !== undefined) r.set(j, m)
  }
  for (const [j, motif] of absencesSemaineType(x))
    if (!r.has(j)) r.set(j, motif)
  return r
}

/** Repos fixe ou absence de la semaine type : se change dans la fiche. */
export function jourFixe(x: Salarie, jour: number): boolean {
  const e = x.semaine_type.at(jour)
  return e?.mode === 'repos' || e?.mode === 'absence'
}

/** Personnel à jours fixes : sa semaine type a des jours « Travaille » ou « Repos ». */
export function aJoursFixes(x: Salarie): boolean {
  return x.semaine_type.some((e) => e.mode === 'travail' || e.mode === 'repos')
}

/** Début (le jour d'arrivée à 00:00) ou fin (le lendemain du dernier jour)
 * du contrat, en minutes réelles depuis le lundi. */
export function borneContrat(
  lundi: string,
  jour: string | null,
  lendemain: number,
): number | null {
  if (!jour) return null
  const ecart = ecartJours(lundi, jour) + lendemain
  return minuteReelle(lundi, ecart * MINUTES_PAR_JOUR)
}

export function fiche(
  x: Salarie,
  lundi: string,
  ctx: Pick<Contexte, 'sansDecompte' | 'ecole' | 'absences'> &
    Partial<Pick<Contexte, 'horaires' | 'regles'>>,
  exclu = false,
): Fiche {
  const semaine = x.semaine_type
  const absents = joursAbsents(x, lundi, ctx.absences)
  const hors = joursHorsContrat(x, lundi)
  const niveaux = new Map<string, string>()
  for (const c of x.competences) niveaux.set(String(c.poste_id), c.niveau)
  const postes = [...niveaux]
    .filter(([, n]) => n === 'titulaire' || n === 'occasionnel')
    .map(([p]) => p)
  // R-ECOLE-JOURS : les jours d'école sont des jours travaillés hors de l'hôtel.
  const ecole: Set<number> = exclu
    ? new Set()
    : new Set(
        [...absents]
          .filter(([j, m]) => m !== null && ctx.ecole.has(m) && !hors.has(j))
          .map(([j]) => j),
      )
  // Les jours d'école sont comptés à part (`joursEcole`) : `heuresDues` les
  // décompte comme une journée de contrat chacun, quel que soit le réglage
  // du motif (R-ECOLE-HEURES, décision utilisateur du 2026-10-29).
  let decomptes = 0
  for (const [j, m] of absents) {
    if (ecole.has(j) || hors.has(j)) continue
    if (m === null || !ctx.sansDecompte.has(m)) decomptes++
  }
  const reposFixes = new Set<number>()
  semaine.forEach((e, j) => {
    if (e.mode === 'repos') reposFixes.add(j)
  })
  // Plus de repos imposé le week-end entre deux semaines d'école (règle du
  // prototype retirée le 2026-10-27, décision utilisateur : ce repos « fixe
  // mais pas vraiment » paraissait arbitraire). Les règles HCR suffisent.
  const travailFixe = new Set<number>()
  const imposes = codesImposes(
    semaine,
    [...(ctx.horaires?.values() ?? [])],
    ctx.regles,
  )
  const etoile = new Set<number>()
  semaine.forEach((e, j) => {
    if (e.mode === 'travail') travailFixe.add(j)
    if (e.etoile) etoile.add(j)
  })
  return {
    id: String(x.id),
    postes: new Set(postes),
    postesOccasionnels: new Set(
      [...niveaux].filter(([, n]) => n === 'occasionnel').map(([p]) => p),
    ),
    postesSoutien: new Set(
      [...niveaux].filter(([, n]) => n === 'soutien').map(([p]) => p),
    ),
    typeContrat: x.type_contrat,
    regles: ctx.regles,
    minutesHebdo: Math.round(Number(x.heures_hebdo) * 60),
    forfaitJours: x.forfait_jours,
    mineur: x.mineur,
    indisponibilites: exclu
      ? new Set([0, 1, 2, 3, 4, 5, 6])
      : new Set(absents.keys()),
    // Hors contrat (décision utilisateur du 2026-11-02 : « ses jours de
    // présence ») : seuls les jours de contrat qui manquent sont décomptés.
    // Départ le jeudi : 4 jours présents, 1 journée en moins (39 h : 32 h) ;
    // le week-end après le départ ne réduit rien.
    joursAbsenceDecomptes: decomptes + joursContratManquants(hors.size),
    horsContrat: hors,
    joursEcole: ecole,
    reposFixes,
    travailFixe,
    // L'horaire fixé ET ses versions étoile (`codesImposes`) ; un jour de
    // journée étoile fixée, le moteur n'y pose que les secondes (`compatible`).
    shiftImpose: imposes,
    journeesFixees: new Set(
      imposes.flatMap(([, code]) => {
        const h = ctx.horaires?.get(Number(code))
        return h ? [travailHoraire(h)] : []
      }),
    ),
    shiftsAutorises: codesDeLaFiche(x),
    etoileFixe: etoile,
    contratDebut: borneContrat(lundi, x.date_entree, 0),
    contratFin: borneContrat(lundi, x.date_sortie, 1),
    // Mineurs : les jours fériés sont évités (permis en hôtellerie par
    // dérogation, décision utilisateur du 2026-11-02).
    feriesEvites: x.mineur
      ? new Set(
          [0, 1, 2, 3, 4, 5, 6].filter((j) => ferieDe(ajouterJours(lundi, j))),
        )
      : undefined,
  }
}

// --------------------------------------------------------------- créneaux

/** Le tableau de l'accueil est-il en service (`accueilActif`) ? Calculé une
 * fois par contexte. */
const actifParPostes = new WeakMap<Map<number, Poste>, boolean>()
function accueilEnService(ctx: Pick<Contexte, 'postes'>): boolean {
  let v = actifParPostes.get(ctx.postes)
  if (v === undefined) {
    v = accueilActif(ctx.postes.values())
    actifParPostes.set(ctx.postes, v)
  }
  return v
}

/** Le poste est-il de l'accueil (D12) : ses besoins sont ignorés (D13). */
export function posteDeLAccueil(
  ctx: Pick<Contexte, 'postes'>,
  posteId: number,
): boolean {
  return estPosteAccueil(ctx.postes.get(posteId), accueilEnService(ctx))
}

/** Moments du tableau où compte un shift ou un candidat (`momentsAccueil`). */
function presenceDe(
  ctx: Contexte,
  x: {
    poste_id: number
    horaire_id: number | null
    debut: string
    fin?: string
  },
): PeriodePresence[] {
  return momentsAccueil(
    ctx.postes.get(x.poste_id),
    x.horaire_id !== null ? ctx.horaires.get(x.horaire_id) : undefined,
    x.debut,
    accueilEnService(ctx),
    x.fin,
    ctx.regles.moments,
  )
}

/** Début (minutes du jour) des matins les plus tôt de chaque poste, d'après
 * ses besoins : la borne des « matins tôt » de l'équité (D15). */
const matinsTotParBesoins = new WeakMap<Besoin[], Map<number, number>>()
function debutsMatinTot(ctx: Contexte): Map<number, number> {
  let r = matinsTotParBesoins.get(ctx.besoins)
  if (!r) {
    r = new Map()
    for (const b of ctx.besoins) {
      // L'accueil n'a plus de besoins (D13) : ses matins tôt viennent des
      // horaires permis au poste, plus bas.
      if (posteDeLAccueil(ctx, b.poste_id)) continue
      const h =
        b.horaire_id !== null ? ctx.horaires.get(b.horaire_id) : undefined
      if (periodeShift(h, b.debut, ctx.regles.moments) !== 'matin') continue
      const m = minutes(b.debut)
      r.set(b.poste_id, Math.min(r.get(b.poste_id) ?? m, m))
    }
    for (const poste of ctx.postes.values()) {
      if (!posteDeLAccueil(ctx, poste.id)) continue
      for (const h of codesDuPoste(poste, [...ctx.horaires.values()])) {
        if (h.periode !== 'matin') continue
        const m = minutes(h.debut)
        r.set(poste.id, Math.min(r.get(poste.id) ?? m, m))
      }
    }
    matinsTotParBesoins.set(ctx.besoins, r)
  }
  return r
}

/** Équité (D15) : un shift ou un besoin est-il un soir, un matin tôt ? Soir
 * = période soir de son horaire (sans horaire : l'heure de début) ; matin tôt =
 * un matin qui commence au plus tôt des matins prévus pour ce poste. */
export function equiteDe(
  ctx: Contexte,
  x: {
    poste_id: number
    horaire_id: number | null
    debut: string
    fin?: string
  },
): { soir: boolean; matinTot: boolean; moment: Periode | null } {
  const h = x.horaire_id !== null ? ctx.horaires.get(x.horaire_id) : undefined
  // Semaine stable et nuits (règles 6 et 7 du PRD) : le moment de
  // l'horaire, sinon l'heure de début ; un horaire sans moment : aucun.
  // Horaire libre (sans horaire) : ses heures, comme un horaire
  // (`momentPropose`, 2026-11-05) ; sans fin connue, l'heure de début.
  const l = ctx.regles.moments
  const moment = h ? h.periode : momentLibre(x.debut, x.fin, l)
  // L'équité lit le MÊME moment (relecture du 2026-11-05 : un 21:30-07:00
  // libre était une nuit pour les nuits et un soir pour l'équité).
  const periode = periodeShift(h ?? { periode: moment }, x.debut, l)
  const tot = debutsMatinTot(ctx).get(x.poste_id)
  return {
    soir: periode === 'soir',
    matinTot:
      periode === 'matin' && tot !== undefined && minutes(x.debut) <= tot,
    moment,
  }
}

/** Travail d'un horaire en heure murale, pause déduite (`travailMural`). */
function muralDe(jour: number, debut: string, fin: string, pause: number) {
  const [d, f] = bornesMurales(jour, debut, fin)
  return f - d - pause
}

function presenceMaxDe(ctx: Contexte, posteId: number): number | null {
  const p = ctx.postes.get(posteId)
  return p ? presenceMaxPoste(p.categorie) : null
}

export function creneauBesoin(
  ctx: Contexte,
  b: Besoin,
  soutien?: number,
  facultatif?: number,
): Creneau {
  const [d, f] = bornes(ctx.lundi, b.jour, b.debut, b.fin)
  const h = b.horaire_id !== null ? ctx.horaires.get(b.horaire_id) : undefined
  return creneau({
    id: `b${b.id}`,
    poste: String(b.poste_id),
    debut: d,
    fin: f,
    effectif: b.effectif,
    typeShift: b.horaire_id === null ? null : String(b.horaire_id),
    soutien: soutien ?? b.soutien,
    pause: h ? h.pause : 0,
    travailMural: muralDe(b.jour, b.debut, b.fin, h ? h.pause : 0),
    facultatif: facultatif ?? b.renfort,
    jourPlanning: b.jour,
    presenceMax: presenceMaxDe(ctx, b.poste_id),
    nuit: toucheLaNuit(b.jour, b.debut, b.fin),
    presence: presenceDe(ctx, b),
    ...equiteDe(ctx, b),
  })
}

export function creneauAffectation(ctx: Contexte, a: Affectation): Creneau {
  // La pause est celle du shift : changer le code après coup ne réécrit pas
  // les heures d'une semaine déjà faite.
  const [d, f] = bornes(ctx.lundi, a.jour, a.debut, a.fin)
  return creneau({
    id: `a${a.id}`,
    poste: String(a.poste_id),
    debut: d,
    fin: f,
    effectif: 1,
    typeShift: a.horaire_id === null ? null : String(a.horaire_id),
    pause: a.pause,
    travailMural: muralDe(a.jour, a.debut, a.fin, a.pause),
    jourPlanning: a.jour,
    ferme: true,
    presenceMax: presenceMaxDe(ctx, a.poste_id),
    nuit: toucheLaNuit(a.jour, a.debut, a.fin),
    presence: presenceDe(ctx, a),
    ...equiteDe(ctx, a),
  })
}

// ------------------------------------------------------------ remplaçants

/** Codes qui peuvent tenir la place d'un besoin à la place de son horaire
 * (plan planning-cycles-2026-10-30, D12) : les AUTRES codes du poste
 * (`codesDuPoste`) du MÊME cycle (`cycleDe`). Un middle ne remplace qu'un
 * middle (même famille, donc même cycle). Un horaire sans moment
 * (`periode === null` : direction, supervision) n'a jamais de remplaçant et
 * n'en est jamais un ; un besoin en horaire libre non plus. Un horaire court
 * (moins de 7 h de travail, `estCourt`) ne remplace qu'un court et n'est
 * remplacé que par un court. Les versions étoile de l'horaire n'en sont pas :
 * elles tiennent la place comme lui (`versionsEtoileDe`). Aucun code n'est
 * créé ni modifié : on choisit parmi ceux qui existent. Triés par id. */
export function remplacantsDe(
  ctx: Pick<Contexte, 'horaires' | 'postes'> &
    Partial<Pick<Contexte, 'regles'>>,
  b: Pick<Besoin, 'poste_id' | 'horaire_id'>,
): Horaire[] {
  if (b.horaire_id === null) return []
  const h = ctx.horaires.get(b.horaire_id)
  if (!h || h.periode === null) return []
  const R = ctx.regles ?? REGLES_PAR_DEFAUT
  const cycle = cycleDe(h, h.debut, R.moments)
  const court = estCourt(h, R.contrats.journeeCourte)
  const etoiles = new Set(versionsEtoileDe(ctx, b).map((v) => v.id))
  return codesDuPoste(ctx.postes.get(b.poste_id), [...ctx.horaires.values()])
    .filter(
      (c) =>
        c.id !== h.id &&
        c.periode !== null &&
        !etoiles.has(c.id) &&
        cycleDe(c, c.debut, R.moments) === cycle &&
        estCourt(c, R.contrats.journeeCourte) === court,
    )
    .sort((a, c) => a.id - c.id)
}

/** Versions étoile de l'horaire d'un besoin permises au poste (`etoile.ts`,
 * décisions utilisateur du 2026-11-02) : la journée de 7 h d'un horaire de
 * 8 h, sur un horaire qui existe. Elles tiennent la place comme l'horaire
 * demandé (`creneauEtoile`). Vide pour un besoin sans horaire ou de moins de
 * 8 h. Triées par id. */
export function versionsEtoileDe(
  ctx: Pick<Contexte, 'horaires' | 'postes'> &
    Partial<Pick<Contexte, 'regles'>>,
  b: Pick<Besoin, 'poste_id' | 'horaire_id'>,
): Horaire[] {
  if (b.horaire_id === null) return []
  const h = ctx.horaires.get(b.horaire_id)
  if (!h) return []
  return versionsEtoile(
    h,
    codesDuPoste(ctx.postes.get(b.poste_id), [...ctx.horaires.values()]),
    ctx.regles,
  )
}

/** Id du créneau remplaçant d'un besoin pour un horaire. */
export const idRemplacant = (besoinId: number, horaireId: number) =>
  `r${besoinId}-${horaireId}`

/** Créneau remplaçant (`r<besoin>-<horaire>`, contrat de la vague 1, §2) : la
 * place du besoin `b<id>` tenue avec un autre horaire du même cycle. Aucune
 * place propre (effectif, facultatif et soutien à 0) : le moteur compte ses
 * autonomes avec ceux de `b<id>` (`place`). Bornes, pause et
 * présence sont ceux de l'horaire remplaçant, le jour et le poste ceux du
 * besoin. */
export function creneauRemplacant(
  ctx: Contexte,
  b: Besoin,
  h: Horaire,
): Creneau {
  const ecrit = horaireDe(h)
  const [d, f] = bornes(ctx.lundi, b.jour, ecrit.debut, ecrit.fin)
  const x = { poste_id: b.poste_id, horaire_id: h.id, debut: ecrit.debut }
  return creneau({
    id: idRemplacant(b.id, h.id),
    poste: String(b.poste_id),
    debut: d,
    fin: f,
    effectif: 0,
    typeShift: String(h.id),
    soutien: 0,
    pause: h.pause,
    travailMural: muralDe(b.jour, ecrit.debut, ecrit.fin, h.pause),
    facultatif: 0,
    jourPlanning: b.jour,
    ferme: false,
    presenceMax: presenceMaxDe(ctx, b.poste_id),
    nuit: toucheLaNuit(b.jour, ecrit.debut, ecrit.fin),
    presence: presenceDe(ctx, x),
    place: `b${b.id}`,
    ...equiteDe(ctx, x),
  })
}

/** Créneau d'une VERSION ÉTOILE (`r<besoin>-<horaire>`, comme un remplaçant,
 * marqué `etoile`) : la place du besoin tenue sur un horaire de 7 h contenu
 * dans le sien. Sans coût de remplaçant, ses vraies minutes face au contrat,
 * présent dès le premier temps du calcul (`generateur.ts`). Il ouvre aussi
 * les places de SOUTIEN du besoin (`soutien`, plafonnées sur toute la place
 * par le moteur) : un apprenti fait sa journée de 7 h comme les autres,
 * comme l'ancienne journée courte sur le besoin lui-même. */
export function creneauEtoile(ctx: Contexte, b: Besoin, h: Horaire): Creneau {
  return { ...creneauRemplacant(ctx, b, h), soutien: b.soutien, etoile: true }
}

// ------------------------------------------------- candidats de l'accueil

/** Id du créneau candidat de l'accueil (D1) : un jour, un poste, un horaire. */
export const idCandidat = (jour: number, posteId: number, horaireId: number) =>
  `p${jour}-${posteId}-${horaireId}`

/** Un candidat de l'accueil : le poste et l'horaire sur ce jour du
 * planning, aucune place propre (effectif 0) ; ses moments dans `presence`
 * (un middle : aucun, depuis le 2026-11-05). */
export function creneauCandidat(
  ctx: Contexte,
  jour: number,
  poste: Poste,
  h: Horaire,
): Creneau {
  const ecrit = horaireDe(h)
  const [d, f] = bornes(ctx.lundi, jour, ecrit.debut, ecrit.fin)
  const x = { poste_id: poste.id, horaire_id: h.id, debut: ecrit.debut }
  return creneau({
    id: idCandidat(jour, poste.id, h.id),
    poste: String(poste.id),
    debut: d,
    fin: f,
    effectif: 0,
    typeShift: String(h.id),
    pause: h.pause,
    travailMural: muralDe(jour, ecrit.debut, ecrit.fin, h.pause),
    jourPlanning: jour,
    presenceMax: presenceMaxPoste(poste.categorie),
    nuit: toucheLaNuit(jour, ecrit.debut, ecrit.fin),
    presence: presenceDe(ctx, x),
    accueil: true,
    ...equiteDe(ctx, x),
  })
}

/** Candidats de l'accueil d'une semaine (D1, D2, D4, D10, D12) : pour
 * chaque jour à partir de `depuis`, chaque poste de l'accueil et chaque
 * horaire permis au poste (`codesDuPoste` ; la fiche filtre ensuite, comme
 * partout, `codesPermis`), un candidat s'il compte dans au moins un moment
 * demandé ce jour-là (chiffre > 0), ou si c'est un MIDDLE d'un jour où le
 * matin ou le soir est demandé (2026-11-05 : il ne compte dans aucun
 * chiffre, c'est un coup de main, posé s'il reste des heures, et il tient
 * l'horaire qu'une semaine type fixe). Un horaire trop long pour la catégorie
 * du poste est écarté, comme un besoin (`alerteBesoin`). Rien si le tableau
 * n'est pas en service. */
export function candidatsAccueil(ctx: Contexte, depuis = 0): Creneau[] {
  if (!accueilEnService(ctx)) return []
  const demandes = new Set(
    ctx.consignes
      .filter((k) => chiffreAccueil(k) > 0)
      .map((k) => `${k.jour}|${k.periode}`),
  )
  const horaires = [...ctx.horaires.values()].sort((a, b) => a.id - b.id)
  const postes = [...ctx.postes.values()]
    .filter((p) => posteDeLAccueil(ctx, p.id))
    .sort((a, b) => a.id - b.id)
  const r: Creneau[] = []
  for (let jour = depuis; jour < 7; jour++) {
    for (const poste of postes) {
      for (const h of codesDuPoste(poste, horaires)) {
        const c = creneauCandidat(ctx, jour, poste, h)
        const coupDeMain =
          poste.presence &&
          c.moment === 'middle' &&
          (demandes.has(`${jour}|matin`) || demandes.has(`${jour}|soir`))
        if (
          !coupDeMain &&
          !c.presence.some((m) => demandes.has(`${jour}|${m}`))
        )
          continue
        if (alerteBesoin(poste.categorie, duree(c))) continue
        r.push(c)
      }
    }
  }
  return r
}

/** Durée tenue à l'ouverture d'un poste de l'accueil : la première heure. */
export const DUREE_OUVERTURE = REGLES_PAR_DEFAUT.passations.dureeOuverture

/** L'ouverture de chaque poste de l'accueil qui a une heure d'ouverture
 * (2026-11-01, « à 7 h, quelqu'un en réception et quelqu'un au club ») :
 * chaque jour où le matin est demandé, de l'heure d'ouverture à une heure
 * plus tard, en minutes réelles. Rien si le tableau n'est pas en service. */
export function ouverturesAccueil(ctx: Contexte): Probleme['ouvertures'] {
  if (!accueilEnService(ctx)) return []
  const r: NonNullable<Probleme['ouvertures']> = []
  for (const poste of [...ctx.postes.values()].sort((a, b) => a.id - b.id)) {
    if (!poste.ouverture || poste.ferme || !poste.presence) continue
    const m = minutes(poste.ouverture) + ctx.regles.passations.dureeOuverture
    const fin = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    for (let jour = 0; jour < 7; jour++) {
      const matin = ctx.consignes.some(
        (k) =>
          k.jour === jour && k.periode === 'matin' && chiffreAccueil(k) > 0,
      )
      if (!matin) continue
      const [debut, f] = bornes(ctx.lundi, jour, poste.ouverture, fin)
      r.push({ poste: String(poste.id), jour, debut, fin: f })
    }
  }
  return r
}

/** Le tableau de l'accueil tel que le moteur le lit : le chiffre EXACT de
 * chaque moment (D3 : `minimum`, D9 ; le maximum suit), rien si le tableau
 * n'est pas en service. */
function chiffresAccueil(ctx: Contexte): Probleme['consignes'] {
  if (!accueilEnService(ctx)) return []
  // Tous les jours, passés compris : les shifts posés y comptent encore (le
  // moteur n'y place personne, rien n'y bouge).
  return ctx.consignes.map((c) => ({
    jour: c.jour,
    periode: c.periode,
    minimum: chiffreAccueil(c),
    maximum: chiffreAccueil(c),
  }))
}

/** Les besoins que le moteur lit : valides, hors accueil (D13 : ceux de
 * l'accueil sont gardés en base mais ignorés tant que le tableau est en
 * service). */
export function besoinsDuMoteur(ctx: Contexte): {
  valides: Besoin[]
  alertes: Array<{ besoin_id: number; message: string }>
} {
  const { valides, alertes } = besoinsValides(ctx)
  const ici = (b: Besoin) =>
    !posteDeLAccueil(ctx, b.poste_id) && !sansSonCadre(ctx, b)
  const parId = new Map(ctx.besoins.map((b) => [b.id, b]))
  return {
    valides: valides.filter(ici),
    alertes: alertes.filter((a) => {
      const b = parId.get(a.besoin_id)
      return !b || ici(b)
    }),
  }
}

/** Les titulaires actifs d'un poste, s'ils sont TOUS des cadres au forfait
 * jours (la Direction) ; vide sinon. */
function cadresSeulsDe(
  ctx: Pick<Contexte, 'staff'>,
  posteId: number,
): Salarie[] {
  const titulaires = ctx.staff.filter(
    (x) =>
      x.actif !== false &&
      x.competences.some(
        (c) => c.poste_id === posteId && c.niveau !== 'soutien',
      ),
  )
  return titulaires.length && titulaires.every((x) => x.forfait_jours)
    ? titulaires
    : []
}

/**
 * R-FERIE-RATTRAPE pour un cadre au forfait jours seul sur son poste
 * (décision utilisateur du 2026-11-03) : son JFR est choisi ici, avant le
 * calcul, le premier jour permis de la semaine collé à un jour sans travail
 * (repos fixe, absence, bord de la semaine), sinon le premier jour permis.
 * Permis : à venir, après son premier jour férié en attente, sous contrat,
 * sans absence, école, repos fixe, étoile fixée ni shift qui reste. Un par
 * semaine. Rien sans motif JFR.
 */
export function jfrDesCadresSeuls(
  d: DonneesSemaine,
  ctx: Contexte,
  depuis: number,
  exclus: ReadonlySet<number> = new Set(),
): NouvelleAbsence[] {
  const motifJfr = Math.min(...ctx.motifsJfr)
  if (!Number.isFinite(motifJfr)) return []
  const cadres = ctx.staff.filter((x) => {
    if (!x.forfait_jours || exclus.has(x.id)) return false
    const postes = x.competences
      .filter((c) => c.niveau === 'titulaire')
      .map((c) => c.poste_id)
    return (
      postes.length > 0 &&
      postes.every((p) => cadresSeulsDe(ctx, p).some((y) => y.id === x.id))
    )
  })
  if (!cadres.length) return []
  const attente = feriesEnAttente(ctx, shiftsConnus(d, ctx.affectations))
  const r: NouvelleAbsence[] = []
  for (const x of cadres) {
    const liste = attente.get(x.id)
    if (!liste) continue
    const sol = versSolveur(fiche(x, ctx.lundi, ctx))
    const pris = new Set(
      ctx.affectations.filter((a) => a.salarie_id === x.id).map((a) => a.jour),
    )
    const libre = (j: number) =>
      j < 0 ||
      j > 6 ||
      sol.reposFixes.has(j) ||
      sol.indisponibilites.has(j) ||
      sol.horsContrat.has(j)
    const jours: number[] = []
    for (let j = depuis; j < 7; j++) {
      if (ajouterJours(ctx.lundi, j) <= liste[0].date) continue
      if (
        libre(j) ||
        pris.has(j) ||
        sol.joursHorsSite.has(j) ||
        sol.etoileFixe.has(j)
      )
        continue
      jours.push(j)
    }
    const jour = jours.find((j) => libre(j - 1) || libre(j + 1)) ?? jours[0]
    if (jour !== undefined)
      r.push({ salarie_id: x.id, jour, motif_id: motifJfr })
  }
  return r
}

/** Poste tenu SEULEMENT par des cadres au forfait jours (la Direction) :
 * décision utilisateur du 2026-11-02, « un poste qu'on ne peut pas remplacer ;
 * si elle n'est pas là, elle n'est pas là ». Un jour où aucun d'eux n'est là
 * (absence, hors contrat), la place n'existe pas : rien à pourvoir. */
export function sansSonCadre(
  ctx: Pick<Contexte, 'staff' | 'lundi' | 'absences'>,
  b: Pick<Besoin, 'poste_id' | 'jour'>,
): boolean {
  const titulaires = ctx.staff.filter(
    (x) =>
      x.actif !== false &&
      x.competences.some(
        (c) => c.poste_id === b.poste_id && c.niveau !== 'soutien',
      ),
  )
  if (!titulaires.length || !titulaires.every((x) => x.forfait_jours))
    return false
  return titulaires.every(
    (x) =>
      joursAbsents(x, ctx.lundi, ctx.absences).has(b.jour) ||
      joursHorsContrat(x, ctx.lundi).has(b.jour),
  )
}

/** Écarte les besoins trop longs pour leur catégorie et ceux dont le code
 * horaire n'est pas prévu pour le poste. */
export function besoinsValides(ctx: Contexte): {
  valides: Besoin[]
  alertes: Array<{ besoin_id: number; message: string }>
} {
  const valides: Besoin[] = []
  const alertes: Array<{ besoin_id: number; message: string }> = []
  for (const b of ctx.besoins) {
    const presence = duree(creneauBesoin(ctx, b))
    const poste = ctx.postes.get(b.poste_id)
    let message = poste
      ? alerteBesoin(poste.categorie, presence)
      : 'poste supprimé'
    if (poste && !message && !codePrevuAuPoste(poste, b.horaire_id)) {
      message = "cet horaire n'est pas prévu pour ce poste"
    }
    if (message) alertes.push({ besoin_id: b.id, message })
    else valides.push(b)
  }
  return { valides, alertes }
}

/** Ce que `correspondances` rend. */
export interface Correspondances {
  /** shift → besoin dont il tient une place (autonome). */
  lien: Map<number, number>
  /** shift → besoin dont il tient une place de soutien. */
  soutien: Map<number, number>
  /** shift rattaché PAR CYCLE (seconde passe) → horaire imposé par le besoin
   * (`horaire_id`) : « 08:00–16:45 au lieu de 07:00–15:45 ». Absent : rattaché
   * par son horaire exact, par une version étoile,
   * ou pas rattaché. Sous-ensemble des clés de `lien` et `soutien`. */
  demande: Map<number, number>
  /** Shifts rattachés (seconde passe) par une VERSION ÉTOILE de l'horaire du
   * besoin (`versionsEtoileDe`) : ils tiennent la place comme l'horaire
   * demandé, sans « au lieu de ». Sous-ensemble des clés de `lien` et
   * `soutien`, jamais dans `demande`. */
  etoile: Set<number>
}

/** Rattache chaque shift au besoin qu'il couvre, en deux passes (plan
 * planning-cycles-2026-10-30, D6) :
 *
 * 1. horaire exact, comme avant : même poste, jour et horaire (l'horaire, c'est
 *    le code quand il y en a un) ;
 * 2. les shifts encore libres prennent les places encore libres du MÊME
 *    poste et du MÊME jour, quand leur horaire est une version étoile de
 *    l'horaire du besoin (`versionsEtoileDe`, marqués dans `etoile`) ou un
 *    remplaçant (`remplacantsDe` : codes du poste, même cycle, un middle pour
 *    un middle, jamais un horaire sans moment ni un horaire libre ; marqués
 *    dans `demande`). Le début le plus proche d'abord.
 *
 * Dans chaque passe, épinglés d'abord ; un profil soutien ne prend qu'une
 * place de soutien. L'horaire exact passe toujours avant un voisin : la
 * seconde passe ne voit que ce que la première a laissé. */
export function correspondances(
  ctx: Contexte,
  besoins: Besoin[],
  salaries: Map<number, SalarieSolveur>,
): Correspondances {
  const cleDe = (x: {
    poste_id: number
    jour: number
    horaire_id: number | null
    debut: string
    fin: string
  }) =>
    x.horaire_id !== null && ctx.horaires.has(x.horaire_id)
      ? `${x.poste_id}|${x.jour}|c${x.horaire_id}`
      : `${x.poste_id}|${x.jour}|${x.debut}-${x.fin}`
  const places = new Map<string, number[]>()
  const renforts = new Map<string, number[]>()
  for (const b of besoins) {
    const k = cleDe(b)
    places.set(k, [
      ...(places.get(k) ?? []),
      ...Array<number>(b.effectif + b.renfort).fill(b.id),
    ])
    renforts.set(k, [
      ...(renforts.get(k) ?? []),
      ...Array<number>(b.soutien).fill(b.id),
    ])
  }
  const lien = new Map<number, number>()
  const soutien = new Map<number, number>()
  const demande = new Map<number, number>()
  const etoile = new Set<number>()
  const ordre = [...ctx.affectations].sort(
    (a, b) => Number(!a.epinglee) - Number(!b.epinglee) || a.id - b.id,
  )
  const enSoutien = (a: Affectation) => {
    const sol = salaries.get(a.salarie_id)
    return sol !== undefined && role(sol, String(a.poste_id)) === 'soutien'
  }

  // 1. Code exact.
  for (const a of ordre) {
    const k = cleDe(a)
    if (enSoutien(a)) {
      const r = renforts.get(k)
      if (r?.length) soutien.set(a.id, r.pop() as number)
    } else {
      const p = places.get(k)
      if (p?.length) lien.set(a.id, p.pop() as number)
    }
  }

  // 2. Même poste, même jour : version étoile, ou même cycle.
  const etoiles = new Map(
    besoins.map((b) => [
      b.id,
      new Set(versionsEtoileDe(ctx, b).map((h) => h.id)),
    ]),
  )
  const voisins = new Map(
    besoins.map((b) => [
      b.id,
      new Set([
        ...(etoiles.get(b.id) ?? []),
        ...remplacantsDe(ctx, b).map((h) => h.id),
      ]),
    ]),
  )
  for (const a of ordre) {
    if (lien.has(a.id) || soutien.has(a.id) || a.horaire_id === null) continue
    const h = ctx.horaires.get(a.horaire_id)
    if (!h) continue
    const soutienIci = enSoutien(a)
    const reserve = soutienIci ? renforts : places
    let choisi: Besoin | undefined
    let ecart = Infinity
    for (const b of besoins) {
      if (b.poste_id !== a.poste_id || b.jour !== a.jour) continue
      if (b.horaire_id === null || !voisins.get(b.id)?.has(h.id)) continue
      if (!reserve.get(cleDe(b))?.includes(b.id)) continue
      const e = Math.abs(minutes(b.debut) - minutes(a.debut))
      if (e < ecart || (e === ecart && choisi && b.id < choisi.id)) {
        choisi = b
        ecart = e
      }
    }
    if (!choisi || choisi.horaire_id === null) continue
    const pool = reserve.get(cleDe(choisi)) as number[]
    pool.splice(pool.lastIndexOf(choisi.id), 1)
    ;(soutienIci ? soutien : lien).set(a.id, choisi.id)
    if (etoiles.get(choisi.id)?.has(h.id)) etoile.add(a.id)
    else demande.set(a.id, choisi.horaire_id)
  }
  return { lien, soutien, demande, etoile }
}

/** Fiches d'une même personne (contrats liés par `suite_de`) : id → clé. */
export function personnes(salaries: Salarie[]): Map<number, string> {
  const parent = new Map<number, number>()
  const racine = (i: number): number => {
    let r = i
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) as number
    return r
  }
  for (const x of salaries) {
    if (x.suite_de !== null) {
      const a = racine(x.id)
      const b = racine(x.suite_de)
      if (a !== b) parent.set(Math.max(a, b), Math.min(a, b))
    }
  }
  const groupes = new Map<number, number[]>()
  for (const i of new Set([...parent.keys(), ...parent.values()])) {
    const r = racine(i)
    groupes.set(r, [...(groupes.get(r) ?? []), i])
  }
  const cles = new Map<number, string>()
  for (const [r, membres] of groupes) {
    if (membres.length > 1) for (const i of membres) cles.set(i, `p${r}`)
  }
  return cles
}

/** Ajoute à chaque salarié ses services voisins (repos de 11 h d'une
 * semaine à l'autre, 3 jours de repos sur deux semaines). */
export function avecSemainesVoisines(
  d: DonneesSemaine,
  ctx: Contexte,
  salaries: Map<number, SalarieSolveur>,
): Map<number, SalarieSolveur> {
  const cles = personnes(d.referentiel.salaries)
  const k = (id: number): number | string => cles.get(id) ?? id
  const fins = new Map<number | string, number>()
  const debuts = new Map<number | string, number>()
  const joursAvant = new Map<number | string, Set<number>>()
  const joursApres = new Map<number | string, Set<number>>()
  const ajoute = (
    m: Map<number | string, Set<number>>,
    key: number | string,
    j: number,
  ) => {
    const s = m.get(key) ?? new Set<number>()
    s.add(j)
    m.set(key, s)
  }
  const servicesAvant = new Map<number | string, Creneau[]>()
  for (const a of d.avant) {
    const [debut, fin] = bornes(ctx.lundi, a.jour - 7, a.debut, a.fin)
    const key = k(a.salarie_id)
    fins.set(key, Math.max(fins.get(key) ?? fin, fin))
    ajoute(joursAvant, key, a.jour)
    servicesAvant.set(key, [
      ...(servicesAvant.get(key) ?? []),
      creneau({
        id: `avant${a.id}`,
        poste: String(a.poste_id),
        debut,
        fin,
        jourPlanning: a.jour - 7,
      }),
    ])
  }
  // Fin du dernier service de la semaine d'avant-avant, par personne.
  const finsAvantAvant = new Map<number | string, number>()
  for (const a of d.avantAvant ?? []) {
    const fin = bornes(ctx.lundi, a.jour - 14, a.debut, a.fin)[1]
    const key = k(a.salarie_id)
    finsAvantAvant.set(key, Math.max(finsAvantAvant.get(key) ?? fin, fin))
  }
  const prudent = bornes(ctx.lundi, -7, '00:00', '00:00')[0]
  for (const a of d.apres) {
    const debut = bornes(ctx.lundi, a.jour + 7, a.debut, a.fin)[0]
    const key = k(a.salarie_id)
    debuts.set(key, Math.min(debuts.get(key) ?? debut, debut))
    ajoute(joursApres, key, a.jour)
  }
  // R-ECOLE-JOURS : les jours d'école des semaines voisines sont travaillés.
  if (ctx.ecole.size) {
    for (const x of ctx.staff) {
      const key = k(x.id)
      for (const [m, decalage] of [
        [joursAvant, -7],
        [joursApres, 7],
      ] as const) {
        const absents = joursAbsents(
          x,
          ajouterJours(ctx.lundi, decalage),
          ctx.absences,
        )
        for (const [j, motif] of absents) {
          if (motif !== null && ctx.ecole.has(motif)) ajoute(m, key, j)
        }
      }
    }
  }
  const r = new Map<number, SalarieSolveur>()
  for (const [i, x] of salaries) {
    const key = k(i)
    r.set(i, {
      ...x,
      finServicePrecedent: fins.get(key) ?? null,
      debutServiceSuivant: debuts.get(key) ?? null,
      personne: cles.get(i) ?? null,
      joursSemainePrecedente: d.avant.length
        ? (joursAvant.get(key)?.size ?? 0)
        : null,
      joursSemaineSuivante: d.apres.length
        ? (joursApres.get(key)?.size ?? 0)
        : null,
      serieAvant: serie(joursAvant.get(key), [6, 5, 4, 3, 2, 1, 0]),
      serieApres: serie(joursApres.get(key), [0, 1, 2, 3, 4, 5, 6]),
      debutAuPlusTot: debutApresReposHebdo(
        x,
        servicesAvant.get(key) ?? [],
        joursAvant.get(key) ?? new Set(),
        d.avantAvant ? (finsAvantAvant.get(key) ?? null) : prudent,
      ),
    })
  }
  return r
}

/** Règle 4 : la semaine type fixe le samedi ou le dimanche Travaille. */
export function estWeekendFixe(x: Pick<Salarie, 'semaine_type'>): boolean {
  return [5, 6].some((j) => x.semaine_type.at(j)?.mode === 'travail')
}

/** Des repos fixés dans la semaine type : ils passent avant le partage des
 * week-ends (décision utilisateur du 2026-11-03 : « les repos fixes sont
 * nécessairement prioritaires »). La règle 4 ne s'applique pas à cette
 * personne : ni coût, ni alerte, ni week-end libéré. */
export function aDesReposFixes(x: Pick<Salarie, 'semaine_type'>): boolean {
  return x.semaine_type.some((e) => e?.mode === 'repos')
}

/** Règle 4 : un week-end complet libre les 3 semaines d'avant `lundi` ?
 * Un jour du week-end est libre sans shift, et sans absence ou avec une
 * absence qui laisse libre (`absenceLibre`) : un week-end malade, en
 * formation ou d'école ne compte pas. Une nuit écrite le dimanche (23:00 ou
 * 24:00, celle du dimanche au lundi) compte pour le dimanche (Q15, décision
 * utilisateur du 2026-11-03 : elle rend le week-end travaillé). Celle du
 * VENDREDI au samedi aussi (2026-11-03, « le plus logique » : on finit le
 * samedi matin et on dort le samedi) : `estNuit` la reconnaît. Null : une
 * semaine d'avant sans aucun shift (pas encore faite) ou un week-end hors
 * contrat. `semaine(k)` rend les shifts connus de la semaine `lundi - 7k`. */
export function weekendLibreAvantDe(
  x: Salarie,
  lundi: string,
  ctx: Pick<Contexte, 'absences' | 'ecole'>,
  semaine: (k: number) => readonly Affectation[],
  motifs: ReadonlyMap<number, Motif>,
  estNuit: (a: Affectation) => boolean,
  /** Semaines d'avant regardées (3 ; 2 pour la semaine d'après, dont la
   * troisième est celle du calcul : `esquisseSuivante`). */
  semaines = 3,
): boolean | null {
  for (let k = 1; k <= semaines; k++) {
    const l = ajouterJours(lundi, -7 * k)
    const hors = joursHorsContrat(x, l)
    if (!semaine(k).length || hors.has(5) || hors.has(6)) return null
    const siens = semaine(k).filter((a) => a.salarie_id === x.id)
    const pris = new Set(siens.map((a) => a.jour))
    if (siens.some((a) => a.jour === 4 && estNuit(a))) continue
    const absents = joursAbsents(x, l, ctx.absences)
    const libre = (j: number) => {
      if (pris.has(j)) return false
      const m = absents.get(j)
      if (m === undefined || m === null) return true
      const motif = motifs.get(m)
      return motif ? absenceLibre(motif) : !ctx.ecole.has(m)
    }
    if (libre(5) && libre(6)) return true
  }
  return false
}

/** Partage d'abord (règle 4, décision utilisateur du 2026-11-03) : les
 * personnes dont la semaine type fixe le week-end et qui n'en ont eu aucun
 * de libre les 3 semaines d'avant. Cette semaine-là, leur samedi et leur
 * dimanche ne sont pas posés d'office (`aPoserFixes`) : le calcul leur
 * donne le week-end s'il le peut sans laisser de place vide. */
export function weekendsLiberes(d: DonneesSemaine): Set<number> {
  const lundi = lundiDe(d.lundi)
  const ctx = contexte(d)
  const connus = shiftsConnus(d, []).filter((a) => a.lundi < lundi)
  const semaine = (k: number) => {
    const l = ajouterJours(lundi, -7 * k)
    return connus.filter((a) => a.lundi === l)
  }
  const motifs = new Map(d.referentiel.motifs.map((m) => [m.id, m]))
  const r = new Set<number>()
  for (const x of ctx.staff) {
    if (
      modeleDe(ctx.regles, x.type_contrat).placementManuel ||
      !estWeekendFixe(x) ||
      aDesReposFixes(x)
    )
      continue
    const hors = joursHorsContrat(x, lundi)
    if (hors.has(5) || hors.has(6)) continue
    const estNuit = (a: Affectation) => equiteDe(ctx, a).moment === 'nuit'
    if (weekendLibreAvantDe(x, lundi, ctx, semaine, motifs, estNuit) === false)
      r.add(x.id)
  }
  return r
}

/**
 * Ce que les règles morales du PRD lisent des semaines d'avant et autour de
 * l'école (partie 4 de `plan/planning-bonnes-pratiques/PRD.md`), pour le
 * générateur comme pour le vérificateur :
 *   - règle 4 : un week-end complet libre (samedi et dimanche sans shift, et
 *     sans absence ou avec une absence qui laisse libre, `absenceLibre` :
 *     repos, congé payé, jour férié ; jamais maladie, formation, sans solde
 *     ni école) sur les 3 semaines d'avant. Inconnu
 *     (null) si l'une n'a aucun shift de personne (pas encore faite) ou si la
 *     personne n'était pas sous contrat tout ce week-end-là ; jamais pour un
 *     extra. Une nuit écrite le dimanche compte pour le dimanche, comme à
 *     l'écran. Samedi ou dimanche fixé Travaille dans la semaine type :
 *     `weekendFixe` (le vérificateur le dit, le calcul n'y peut rien) ;
 *   - règle 8 : les jours de semaine de repos la semaine d'avant (ni shift,
 *     ni absence, ni école, sous contrat), si elle a travaillé ;
 *   - règle 7 : les nuits de la semaine d'avant ;
 *   - règle 13 : le premier jour où elle peut reprendre après un congé d'au
 *     moins `CONGE_LONG` jours d'absence décomptée (hors école), repos
 *     fixes et repos posés faisant le pont SANS compter, s'il tombe cette
 *     semaine (pas de shift depuis la fin du congé) ;
 *   - règle 14 : la veille et le lendemain de chaque jour d'école (semaines
 *     voisines comprises), les heures à ne pas dépasser ;
 *   - règle 12 : minutes au-delà du contrat et semaines au-delà, sur les
 *     `SEMAINES_EQUITE` semaines d'avant connues (contrat non indicatif).
 */
export function avecHistoire(
  d: DonneesSemaine,
  ctx: Contexte,
  salaries: Map<number, SalarieSolveur>,
): Map<number, SalarieSolveur> {
  const lundi = ctx.lundi
  const connus = shiftsConnus(d, []).filter((a) => a.lundi < lundi)
  const parSemaine = new Map<string, Affectation[]>()
  for (const a of connus)
    parSemaine.set(a.lundi, [...(parSemaine.get(a.lundi) ?? []), a])
  const semaine = (k: number) =>
    parSemaine.get(ajouterJours(lundi, -7 * k)) ?? []
  const parId = new Map(ctx.staff.map((x) => [x.id, x]))
  const motifs = new Map(d.referentiel.motifs.map((m) => [m.id, m]))
  const r = new Map<number, SalarieSolveur>()
  for (const [id, sol] of salaries) {
    const x = parId.get(id)
    if (!x) {
      r.set(id, sol)
      continue
    }
    const siens = (k: number) => semaine(k).filter((a) => a.salarie_id === id)
    const ecoleLe = (date: string) => {
      const m = ctx.absences.get(id)?.get(date)
      return m !== undefined && ctx.ecole.has(m)
    }
    // Règle 4 (`weekendLibreAvantDe`).
    const weekendLibreAvant =
      sol.placementManuel || aDesReposFixes(x)
        ? null
        : weekendLibreAvantDe(
            x,
            lundi,
            ctx,
            semaine,
            motifs,
            (a) => equiteDe(ctx, a).moment === 'nuit',
          )
    const weekendFixe = estWeekendFixe(x)
    const weekendLibere =
      weekendFixe &&
      !aDesReposFixes(x) &&
      weekendLibreAvant === false &&
      !sol.horsContrat.has(5) &&
      !sol.horsContrat.has(6)
    // Règles 8 et 7 : la semaine d'avant.
    const lAvant = ajouterJours(lundi, -7)
    const avant = siens(1)
    const reposAvant = new Set<number>()
    // La nuit du vendredi au samedi rend le week-end travaillé (2026-11-03).
    const weekendTravailleAvant = avant.some(
      (a) =>
        a.jour >= 5 || (a.jour === 4 && equiteDe(ctx, a).moment === 'nuit'),
    )
    if (avant.length) {
      const absents = joursAbsents(x, lAvant, ctx.absences)
      const hors = joursHorsContrat(x, lAvant)
      const pris = new Set(avant.map((a) => a.jour))
      for (let j = 0; j < 5; j++)
        if (!pris.has(j) && !absents.has(j) && !hors.has(j)) reposAvant.add(j)
    }
    const nuitsAvant = new Set(
      avant
        .filter((a) => equiteDe(ctx, a).moment === 'nuit')
        .map((a) => a.jour - 7),
    )
    // Règle 13 : jours de -14 à 6, absents (hors école) ou repos fixes.
    const etat = new Map<number, 'conge' | 'pont' | 'non'>()
    for (const k of [2, 1, 0]) {
      const l = ajouterJours(lundi, -7 * k)
      const absents = joursAbsents(x, l, ctx.absences)
      for (let j = 0; j < 7; j++) {
        const m = absents.get(j)
        const jour = j - 7 * k
        if (m !== undefined && m !== null && ctx.ecole.has(m))
          etat.set(jour, 'non')
        else if (m !== undefined && m !== null && !ctx.sansDecompte.has(m))
          etat.set(jour, ctx.motifsRepos.has(m) ? 'pont' : 'conge')
        else if (m !== undefined || x.semaine_type.at(j)?.mode === 'repos')
          etat.set(jour, 'pont')
        else etat.set(jour, 'non')
      }
    }
    let retourConge: number | null = null
    for (let e = 5; e >= -7; e--) {
      if (etat.get(e) !== 'conge' || etat.get(e + 1) === 'conge') continue
      // Seuls les jours d'absence comptent ; un repos fait le pont sans
      // compter (3 jours de congé collés à 2 repos : pas un congé long).
      let longueur = 0
      for (let j = e; etat.get(j) === 'conge' || etat.get(j) === 'pont'; j--)
        if (etat.get(j) === 'conge') longueur++
      if (longueur < ctx.regles.conges.congeLong) continue
      if (e >= -1) retourConge = e + 1
      else if (!avant.some((a) => a.jour - 7 > e)) retourConge = 0
      break
    }
    // Règle 14 : jours d'école de la veille (-1) au lundi d'après (7).
    const finAvantEcole = new Map<number, number>()
    const debutApresEcole = new Map<number, number>()
    for (let e = -1; e <= 7; e++) {
      if (!ecoleLe(ajouterJours(lundi, e)) && !sol.joursHorsSite.has(e))
        continue
      if (e - 1 >= 0 && e - 1 <= 6)
        finAvantEcole.set(
          e - 1,
          bornes(lundi, e - 1, hhmm(ctx.regles.ecole.veilleFin), '23:59')[0],
        )
      if (e + 1 >= 0 && e + 1 <= 6)
        debutApresEcole.set(
          e + 1,
          bornes(
            lundi,
            e + 1,
            hhmm(ctx.regles.ecole.lendemainDebut),
            '23:59',
          )[0],
        )
    }
    // Règle 12 : heures au-delà du contrat des semaines d'avant connues.
    let minutesEnPlus = 0
    let semainesEnPlus = 0
    if (!sol.contratIndicatif) {
      for (let k = 1; k <= SEMAINES_EQUITE; k++) {
        if (!semaine(k).length) continue
        const l = ajouterJours(lundi, -7 * k)
        const dues = versSolveur(fiche(x, l, ctx)).minutesHebdoContrat
        const faites = siens(k).reduce(
          (t, a) => t + travail(creneauAffectation(ctx, a)),
          0,
        )
        if (faites > dues) {
          minutesEnPlus += faites - dues
          semainesEnPlus++
        }
      }
    }
    r.set(id, {
      ...sol,
      weekendLibreAvant,
      weekendFixe,
      weekendLibere,
      // Partage d'abord (2026-11-03) : les jours habituels du week-end
      // s'effacent pour le week-end libre. Jamais des repos fixes : une
      // personne qui en a n'est pas libérée (`aDesReposFixes`).
      ...(weekendLibere
        ? {
            travailFixe: new Set(
              [...sol.travailFixe].filter((j) => j !== 5 && j !== 6),
            ),
          }
        : {}),
      reposAvant,
      weekendTravailleAvant,
      nuitsAvant,
      retourConge,
      finAvantEcole,
      debutApresEcole,
      equiteAvant: { ...sol.equiteAvant, minutesEnPlus, semainesEnPlus },
    })
  }
  return r
}

/** Jours de `jours` travaillés d'affilée, lus dans l'ordre donné. */
function serie(jours: ReadonlySet<number> | undefined, ordre: number[]) {
  let n = 0
  for (const j of ordre) {
    if (!jours?.has(j)) break
    n++
  }
  return n
}

/** R-REPOS-HEBDO-35H d'une semaine à l'autre. Si la semaine d'avant n'a de
 * repos de 35 h consécutives qu'en se prolongeant sur celle-ci (jours libres
 * après son dernier service, aucun autre repos assez long), le premier
 * service d'ici ne commence pas avant sa fin + 35 h. Sans cette borne, la
 * génération du mois, semaine après semaine, cassait le repos de la semaine
 * qu'elle venait de faire (mesuré le 2026-10-29). `finAvantAvant` = fin du
 * dernier service de la semaine d'avant-avant (null : aucun service, donc
 * une semaine entière de repos) : la semaine d'avant est relue comme le
 * vérificateur la relit avec ses voisines. Sans elle, un lundi libre en
 * tête comptait seul comme repos (relecture adverse du 2026-10-29). */
export function debutApresReposHebdo(
  s: SalarieSolveur,
  services: Creneau[],
  joursTravailles: ReadonlySet<number>,
  finAvantAvant: number | null,
): number | null {
  if (!s.reposHebdoMin || !services.length || joursTravailles.has(6))
    return null
  const fin = Math.max(...services.map((c) => c.fin))
  const seule = reposHebdoTrouve(
    { ...s, finServicePrecedent: finAvantAvant, debutServiceSuivant: fin },
    services,
    [-7, -6, -5, -4, -3, -2, -1],
    new Set([...joursTravailles].map((j) => j - 7)),
  )
  return seule ? null : fin + s.reposHebdoMin
}

/** Équité (D15) : le groupe où l'on compare une personne aux autres.
 * TOUT L'ACCUEIL ensemble (décision utilisateur du 2026-11-03, Q16) :
 * titulaire ou soutien (apprenti, stagiaire) d'un poste ouvert du matin et
 * du soir (`presence` : Réception, Club) → `POSTE_ID_ACCUEIL`, chacun à sa
 * part de contrat. Avant, chacun était comparé sur son premier poste de
 * titulaire, et un apprenti (soutien) n'était comparé à personne. Sinon le
 * premier poste tenu en titulaire (la Veille de nuit garde le sien : ses
 * soirs et matins ne se comparent pas à ceux du jour). Null : hors équité
 * (extra, forfait jours, sans poste tenu). */
export function posteEquite(
  x: Salarie,
  postes?: ReadonlyMap<number, Pick<Poste, 'presence' | 'ferme'>>,
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): number | null {
  if (modeleDe(regles, x.type_contrat).placementManuel || x.forfait_jours)
    return null
  if (
    postes &&
    x.competences.some((c) => {
      const p = postes.get(c.poste_id)
      return (
        (c.niveau === 'titulaire' || c.niveau === 'soutien') &&
        !!p?.presence &&
        !p.ferme
      )
    })
  )
    return POSTE_ID_ACCUEIL
  return x.competences.find((c) => c.niveau === 'titulaire')?.poste_id ?? null
}

/** Jours de la semaine `lundi` où la personne est là : sous contrat et sans
 * absence (jour posé ou absence de la semaine type). */
function joursPresents(
  x: Salarie,
  lundi: string,
  absences: Map<number, Map<string, number>>,
): number {
  const absents = joursAbsents(x, lundi, absences)
  const hors = joursHorsContrat(x, lundi)
  let n = 0
  for (let j = 0; j < 7; j++) if (!absents.has(j) && !hors.has(j)) n++
  return n
}

const arrondi = (v: number) => Math.round(v * 1000) / 1000

/**
 * Ce que chacun d'UN groupe d'équité a déjà fait (week-ends, soirs, matins
 * tôt) sur les `SEMAINES_EQUITE` semaines d'avant, à poids égal : compté
 * avec la semaine générée. En génération du mois, chaque semaine voit celles
 * qu'on vient de faire, d'où la rotation.
 *
 * Poids égal plutôt que décroissant : la fenêtre de 4 semaines oublie déjà
 * le passé lointain, un poids égal se dit en une phrase à l'écran (sur les
 * 4 dernières semaines), et un week-end fait il y a 3 semaines pèse autant
 * pour la personne qu'un week-end fait la semaine dernière.
 *
 * Une semaine où la personne n'était pas là (moins de 4 jours sous contrat
 * et sans absence : arrivée récente, congés) ne la met pas en retard : elle
 * compte pour SA PART de ce que le groupe a fait cette semaine-là, au
 * prorata des heures de contrat (`minutes`), comme si elle avait été là,
 * et au moins pour ce qu'elle a vraiment fait.
 */
export function equitesAvant(
  ctx: Contexte,
  d: Pick<DonneesSemaine, 'avant' | 'historique'>,
  membres: Array<{ x: Salarie; minutes: number }>,
): Map<number, EquiteFaite> {
  const r = new Map<number, EquiteFaite>(
    membres.map(({ x }) => [x.id, { weekends: 0, soirs: 0, matinsTot: 0 }]),
  )
  const champs = ['weekends', 'soirs', 'matinsTot'] as const
  const nb = d.historique ? SEMAINES_EQUITE : 1
  for (let k = 1; k <= nb; k++) {
    const lundi = ajouterJours(ctx.lundi, -7 * k)
    const semaine = d.historique
      ? d.historique.filter((a) => a.lundi === lundi)
      : d.avant
    const faits = membres.map(({ x }) => {
      const siens = semaine.filter((a) => a.salarie_id === x.id)
      const e = { weekends: 0, soirs: 0, matinsTot: 0 }
      if (siens.some((a) => a.jour >= 5)) e.weekends = 1
      for (const a of siens) {
        const q = equiteDe(ctx, a)
        if (q.soir) e.soirs++
        if (q.matinTot) e.matinsTot++
      }
      return e
    })
    const la = membres.map(
      ({ x }) => joursPresents(x, lundi, ctx.absences) >= 4,
    )
    const heures = membres.reduce(
      (t, m, i) => t + (la[i] ? Math.max(0, m.minutes) : 0),
      0,
    )
    membres.forEach((m, i) => {
      const cumul = r.get(m.x.id)!
      const sienne = Math.max(0, m.minutes)
      for (const c of champs) {
        let part = faits[i][c]
        if (!la[i] && heures + sienne > 0) {
          const total = faits.reduce((t, e, j) => t + (la[j] ? e[c] : 0), 0)
          part = Math.max(part, (total * sienne) / (heures + sienne))
        }
        cumul[c] = arrondi(cumul[c] + part)
      }
    })
  }
  return r
}

/** Ce qu'est un jour pour placer les repos (`placerRepos`). L'école compte
 * comme du travail (journée de contrat hors de l'hôtel) ; un jour hors
 * contrat ou une absence non décomptée (repos exceptionnel…), comme `autre`. */
export type EtatJour = 'travail' | 'libre' | 'conge' | 'repos' | 'autre'

/**
 * Deux repos par semaine, toujours (décisions utilisateur du 2026-11-02,
 * congés comptés en jours ouvrés : 5 par semaine). Rend les jours à mettre en
 * repos pour en avoir `voulus`, repos déjà là compris (fiche, repos posé).
 * Pur et déterministe : la même semaine donne toujours les mêmes jours.
 *
 * Règles, de la plus forte à la plus faible :
 *   1. un jour libre avant un jour de congé : un congé ne devient repos que
 *      s'il n'y a pas assez de jours libres (« les jours de congé ne comptent
 *      pas comme des jours de repos » : 3 semaines d'arrêt = 2 repos par
 *      semaine) ;
 *   2. les repos se suivent ;
 *   3. jamais un jour de travail isolé entre deux jours sans travail (le bord
 *      de la semaine compte comme du travail : continuité avec la semaine
 *      d'à côté) ;
 *   4. s'il y a un congé, les repos se collent au bloc d'absence ;
 *   5. à égalité, le plus tard dans la semaine (samedi et dimanche).
 */
export function placerRepos(
  etats: readonly EtatJour[],
  voulus: number,
): number[] {
  const deja = etats.filter((e) => e === 'repos').length
  const candidats = [0, 1, 2, 3, 4, 5, 6].filter(
    (j) => etats[j] === 'libre' || etats[j] === 'conge',
  )
  const n = Math.min(Math.max(0, voulus - deja), candidats.length)
  if (!n) return []
  const choix: number[][] =
    n === 1
      ? candidats.map((a) => [a])
      : candidats.flatMap((a, i) => candidats.slice(i + 1).map((b) => [a, b]))
  const avecConge = etats.includes('conge')
  const cout = (pris: number[]) => {
    const fin = etats.map((e, j) => (pris.includes(j) ? 'repos' : e))
    const sansTravail = (j: number) =>
      j >= 0 && j <= 6 && fin[j] !== 'travail' && fin[j] !== 'libre'
    let c = 0
    for (const j of pris) if (etats[j] === 'conge') c += 1000
    const repos = [0, 1, 2, 3, 4, 5, 6].filter((j) => fin[j] === 'repos')
    let blocs = 0
    for (const j of repos) if (fin[j - 1] !== 'repos') blocs++
    c += 100 * Math.max(0, blocs - 1)
    for (let j = 0; j < 7; j++)
      if (fin[j] === 'travail' && sansTravail(j - 1) && sansTravail(j + 1))
        c += 30
    if (avecConge)
      for (const j of pris)
        if (!sansTravail(j - 1) && !sansTravail(j + 1)) c += 10
    for (const j of pris) c += 6 - j
    return c
  }
  let meilleur = choix[0]
  let coutMin = cout(meilleur)
  for (const k of choix.slice(1)) {
    const v = cout(k)
    if (v < coutMin) {
      meilleur = k
      coutMin = v
    }
  }
  return meilleur
}

/** Repos de la semaine d'une personne : deux par semaine (`placerRepos`),
 * un de moins par jour hors contrat au-delà de 2 ; plus, quand ses heures
 * dues sont faites, ses autres jours libres. Posés sur une semaine REMPLIE
 * (générée ou faite à la main), ou dès que ses heures sont couvertes (congé
 * toute la semaine) ou 5 jours pris (shift, école, absence décomptée).
 * Peut tomber sur un jour de congé en trop (plus de 5 dans la semaine) :
 * l'écran y montre « Repos », « Valider » l'écrit à la place du congé
 * (migration 20261102110000). Jamais pour un extra ; pour un apprenti ou un
 * stagiaire, seulement sur une semaine remplie (décisions utilisateur du
 * 2026-10-27). Affichage et validation : le moteur garde ses règles.
 *
 * Jours passés (`passes` premiers jours de la semaine, décision utilisateur
 * du 2026-11-03, « même règle pour tous ») : un jour passé SANS RIEN (ni
 * shift, ni absence, ni repos fixe) ne reçoit jamais de repos déduit, la
 * case reste vide (le message « Jours passés » le dit) et « Valider » n'y
 * écrit rien. Il sort de la semaine comme un jour hors contrat : le rythme
 * de 5 jours se tient sur les jours qui restent (6 jours à venir : 1 repos,
 * 5 jours de travail, comme le calcul qui ne peut plus le remplir). Pour la
 * place des repos, il compte comme le bord de la semaine (du travail) : un
 * mardi travaillé n'est pas « isolé » parce que le lundi passé est vide. */
export function reposDeduits(
  x: Salarie,
  sol: SalarieSolveur,
  siens: Creneau[],
  lundi: string,
  absences: Map<number, Map<string, number>>,
  remplie = true,
  sansDecompte: ReadonlySet<number> = new Set(),
  motifsRepos: ReadonlySet<number> = new Set(),
  passes = 0,
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): number[] {
  const modele = modeleDe(regles, x.type_contrat)
  if (modele.placementManuel) return []
  if (modele.alternance && !remplie) return []
  const absents = joursAbsents(x, lundi, absences)
  const travailles = new Set([...siens.map(jourDe), ...sol.joursHorsSite])
  const etats: EtatJour[] = [0, 1, 2, 3, 4, 5, 6].map((j) => {
    if (sol.horsContrat.has(j)) return 'autre'
    if (travailles.has(j)) return 'travail'
    if (sol.reposFixes.has(j)) return 'repos'
    if (absents.has(j)) {
      const m = absents.get(j) ?? null
      if (m !== null && motifsRepos.has(m)) return 'repos'
      return m === null || !sansDecompte.has(m) ? 'conge' : 'autre'
    }
    return 'libre'
  })
  // Jour passé vide : hors de la semaine (ni repos ni travail compté).
  const passesVides = new Set(
    [0, 1, 2, 3, 4, 5, 6].filter((j) => j < passes && etats[j] === 'libre'),
  )
  for (const j of passesVides) etats[j] = 'autre'
  const pris = etats.filter((e) => e === 'travail' || e === 'conge').length
  const faites = siens.reduce((t, c) => t + travail(c), 0)
  const couvert =
    !sol.contratIndicatif &&
    Number(x.heures_hebdo) > 0 &&
    (sol.minutesHebdoContrat === 0 ||
      (siens.length > 0 && faites >= sol.minutesHebdoContrat))
  const enContrat = 7 - sol.horsContrat.size - passesVides.size
  const attendus = Math.min(sol.joursPreferesSemaine, enContrat)
  if (!(remplie || couvert || pris >= attendus)) return []
  const voulus = Math.min(2, Math.max(0, enContrat - JOURS_CONTRAT))
  const choisis = new Set(
    placerRepos(
      etats.map((e, j) => (passesVides.has(j) ? 'travail' : e)),
      voulus,
    ),
  )
  if (couvert)
    etats.forEach((e, j) => {
      if (e === 'libre') choisis.add(j)
    })
  return [...choisis].sort((a, b) => a - b)
}

/** Les horaires qu'une personne peut prendre : ceux de ses postes ouverts
 * (liste vide = tous) que sa fiche permet (`codeDeLaFiche`). */
function horairesPermis(
  x: Salarie,
  sol: SalarieSolveur,
  ctx: Pick<Contexte, 'postes' | 'horaires'>,
): Horaire[] {
  const ids = new Set<number>()
  for (const c of x.competences) {
    const poste = ctx.postes.get(c.poste_id)
    if (!poste || poste.ferme) continue
    for (const id of poste.horaires_autorises.length
      ? poste.horaires_autorises
      : ctx.horaires.keys())
      ids.add(id)
  }
  return [...ids]
    .map((id) => ctx.horaires.get(id))
    .filter((h): h is Horaire => !!h && codeDeLaFiche(sol, String(h.id)))
}

/** Repos obligés d'une personne (`BilanOut.repos_obliges`) : chaque jour à
 * venir sans shift (vide, ou déjà un repos posé) où un service enfreindrait
 * une règle STRICTE. Trois raisons, dans cet ordre :
 *   - plus de `JOURS_AFFILES_MAX` jours de travail d'affilée, en comptant
 *     les jours travaillés autour (école comprise) et ceux des semaines
 *     voisines (`serieAvant`, `serieApres`) ;
 *   - le plafond de jours de la semaine atteint (un mineur : 5) ;
 *   - aucun des horaires de la personne (`horairesPermis`) ne tient entre
 *     le service d'avant et celui d'après avec le repos quotidien de chaque
 *     côté (`reposQuotidienMin`).
 * Jamais pour un extra ni une personne placée à la main, ni un jour passé,
 * hors contrat, de repos fixe ou d'absence (autre qu'un repos). */
export function reposObliges(
  x: Salarie,
  sol: SalarieSolveur,
  siens: readonly Creneau[],
  lundi: string,
  absences: Map<number, Map<string, number>>,
  ecole: ReadonlySet<number>,
  motifsRepos: ReadonlySet<number>,
  passes: number,
  /** Horaires que la personne peut prendre (`horairesPermis`) : le repos
   * quotidien n'est jugé que sur eux. */
  horaires: ReadonlyArray<Pick<Horaire, 'debut' | 'fin'>>,
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): ReposOblige[] {
  if (modeleDe(regles, x.type_contrat).placementManuel || sol.placementManuel)
    return []
  const absents = joursAbsents(x, lundi, absences)
  const travaille = new Set(siens.map(jourDe))
  for (const [j, m] of absents) if (m !== null && ecole.has(m)) travaille.add(j)
  const r: ReposOblige[] = []
  for (let j = passes; j < 7; j++) {
    if (travaille.has(j) || sol.horsContrat.has(j) || sol.reposFixes.has(j))
      continue
    if (absents.has(j)) {
      const m = absents.get(j)
      if (m === null || m === undefined || !motifsRepos.has(m)) continue
    }
    let gauche = 0
    while (j - gauche - 1 >= 0 && travaille.has(j - gauche - 1)) gauche++
    if (j - gauche === 0) gauche += sol.serieAvant
    let droite = 0
    while (j + droite + 1 <= 6 && travaille.has(j + droite + 1)) droite++
    if (j + droite === 6) droite += sol.serieApres
    const affiles = gauche + 1 + droite
    // 5 au plus depuis le 2026-11-04 pour un contrat de 35 h et plus
    // (`rythmeHumain`), comme le calcul et JOURS-AFFILES ; 6 sinon.
    const plafondAffiles = rythmeHumain(sol, regles)
      ? regles.repos.joursAffilesConseilles
      : regles.repos.joursAffilesMax
    if (affiles > plafondAffiles) {
      r.push({
        jour: j,
        raison: `sinon ${affiles} jours de travail d'affilée (${plafondAffiles} au plus)`,
      })
      continue
    }
    // Un jour seul entre deux repos certains (2026-11-04, `rythmeHumain`) :
    // le calcul ne le pose pas. Certain : une absence (hors école) ou un
    // repos fixe ; le jour voisin d'une semaine connue et libre. Un jour
    // simplement vide ne l'est pas (il peut encore être travaillé).
    if (jourIsoleDe(sol, regles) === 'interdit') {
      const libreSur = (d: number): boolean => {
        if (apresContrat(sol, d)) return false
        if (d < 0)
          return sol.joursSemainePrecedente !== null && sol.serieAvant === 0
        if (d > 6)
          return sol.joursSemaineSuivante !== null && sol.serieApres === 0
        if (travaille.has(d)) return false
        // Avant l'arrivée (hors contrat, pas après la fin) : du repos.
        return sol.horsContrat.has(d) || sol.reposFixes.has(d) || absents.has(d)
      }
      if (libreSur(j - 1) && libreSur(j + 1)) {
        r.push({
          jour: j,
          raison: 'sinon un jour de travail seul entre deux repos',
        })
        continue
      }
    }
    // Plafond de jours de la semaine (un mineur : 5).
    if (travaille.size >= sol.joursTravaillesMaxSemaine) {
      r.push({
        jour: j,
        raison: `sinon ${travaille.size + 1} jours de travail dans la semaine (${sol.joursTravaillesMaxSemaine} au plus)`,
      })
      continue
    }
    if (!horaires.length) continue
    const avant = siens.filter((c) => jourDe(c) < j).map((c) => c.fin)
    const apres = siens.filter((c) => jourDe(c) > j).map((c) => c.debut)
    const fin = avant.length ? Math.max(...avant) : sol.finServicePrecedent
    const debut = apres.length ? Math.min(...apres) : sol.debutServiceSuivant
    const repos = sol.reposQuotidienMin
    const tient = horaires.some((h) => {
      const [d0, f0] = bornes(lundi, j, h.debut, h.fin)
      return (
        (fin === null || d0 >= fin + repos) &&
        (debut === null || f0 <= debut - repos)
      )
    })
    if (!tient)
      r.push({
        jour: j,
        raison: `sinon moins de ${heuresLisibles(repos)} de repos entre deux services`,
      })
  }
  return r
}

/** La semaine a été remplie (génération ou à la main) : au moins un shift qui
 * n'est pas un horaire fixe de la semaine type. Les fixes se posent tout seuls
 * à l'ouverture d'une semaine : après une purge, il ne reste qu'eux. */
export function semaineRemplie(
  affectations: readonly Affectation[],
  salaries: readonly Salarie[],
): boolean {
  const parId = new Map(salaries.map((x) => [x.id, x]))
  return affectations.some(
    (a) => parId.get(a.salarie_id)?.semaine_type.at(a.jour)?.mode !== 'travail',
  )
}

// ----------------------------------------------------------------- analyse

function raisonsOut(raisons: Map<string, Violation[]>): RaisonOut[] {
  return [...raisons].map(([sid, vs]) => ({
    salarie_id: Number(sid),
    messages: vs.map((v) => v.message),
    regles: vs.map((v) => v.regle),
  }))
}

/** La règle qui bloque tout le monde (étape 5) : présente pour chaque
 * personne sur chaque code essayé (l'horaire imposé, puis chaque remplaçant).
 * Null dès qu'une personne n'a aucune raison sur un horaire (elle pourrait le
 * prendre), sans personne à qui la poser, ou sans règle commune. Un extra
 * seulement « à appeler » (`EXTRA` seule) est laissé de côté : c'est la
 * solution humaine, pas un blocage. Plusieurs règles communes : la première
 * qui BLOQUE (`phraseCommune`, `raisonsPlaces.ts`), sinon la première, dans
 * l'ordre du vérificateur chez la première personne. */
export function raisonCommune(
  parCode: ReadonlyArray<ReadonlyMap<string, readonly Violation[]>>,
): string | null {
  const listes: string[][] = []
  for (const raisons of parCode) {
    for (const vs of raisons.values()) {
      // Une règle morale du PRD ne bloque pas : la personne pourrait venir.
      // Sauf les deux repos de suite et le jour isolé d'un contrat de 35 h
      // et plus, que le calcul ne sacrifie plus (2026-11-04,
      // `moraleQuiBloque`).
      const regles = vs
        .filter((v) => moraleQuiBloque(v) || !REGLES_MORALES.has(v.regle))
        .map((v) => v.regle)
      if (regles.length === 1 && regles[0] === 'EXTRA') continue
      if (!regles.length) return null
      listes.push(regles)
    }
  }
  if (!listes.length) return null
  const communes = listes[0].filter(
    (r) => r !== 'EXTRA' && listes.every((l) => l.includes(r)),
  )
  // Une règle qui BLOQUE vraiment d'abord (`phraseCommune` non nulle) : un
  // 6e jour ou une journée courte au contrat commun ne doit pas cacher un
  // repos de 11 h commun, sinon « Je ne peux pas » disparaît à tort.
  return (
    communes.find((r) => phraseCommune(r) !== null) ?? communes.at(0) ?? null
  )
}

/** `aujourdhui` : les jours d'avant, dans cette semaine, sont passés (repos
 * jamais déduits sur un jour passé vide, `reposDeduits`). Sans lui, aucun
 * jour n'est passé (tests, bouclier). */
export function analyser(d: DonneesSemaine, aujourdhui?: string): SemaineOut {
  const ctx = contexte(d)
  const lundi = ctx.lundi
  const passes = aujourdhui
    ? Math.max(0, Math.min(7, ecartJours(lundi, aujourdhui)))
    : 0
  const remplie = semaineRemplie(ctx.affectations, d.referentiel.salaries)
  const { valides: besoins, alertes: alertesBesoins } = besoinsDuMoteur(ctx)
  let salaries = new Map(
    ctx.staff.map((x) => [x.id, versSolveur(fiche(x, lundi, ctx))]),
  )
  salaries = avecSemainesVoisines(d, ctx, salaries)
  salaries = avecHistoire(d, ctx, salaries)
  // R-FERIE-RATTRAPE : les jours fériés travaillés encore à rattraper
  // deviennent une alerte du vérificateur (JOUR-FERIE).
  for (const [id, liste] of feriesEnAttente(
    ctx,
    shiftsConnus(d, ctx.affectations),
  )) {
    const sol = salaries.get(id)
    if (sol)
      salaries.set(id, {
        ...sol,
        feriesARattraper: liste.map((f) => f.date),
      })
  }
  const {
    lien,
    soutien: enSoutien,
    demande,
  } = correspondances(ctx, besoins, salaries)

  const creneaux = new Map<string, Creneau>()
  for (const a of ctx.affectations)
    creneaux.set(`a${a.id}`, creneauAffectation(ctx, a))
  for (const b of besoins) creneaux.set(`b${b.id}`, creneauBesoin(ctx, b))
  const affs: AffectationSolveur[] = ctx.affectations
    .filter((a) => salaries.has(a.salarie_id))
    .map((a) => ({
      salarieId: String(a.salarie_id),
      creneauId: `a${a.id}`,
    }))
  const p = probleme({
    salaries: [...salaries.values()],
    creneaux: [...creneaux.values()],
    regles: ctx.regles,
  })
  const toutes = violations(p, affs)

  const parCarte = new Map<string, AlerteOut[]>()
  const parPersonne = new Map<string, Map<string, AlerteOut>>()
  for (const v of toutes) {
    const alerte: AlerteOut = {
      regle: v.regle,
      message: v.message,
      nature: v.nature,
    }
    for (const cid of v.creneaux)
      parCarte.set(cid, [...(parCarte.get(cid) ?? []), alerte])
    if (v.salarieId !== null) {
      const m = parPersonne.get(v.salarieId) ?? new Map<string, AlerteOut>()
      m.set(`${v.regle}|${v.message}`, alerte)
      parPersonne.set(v.salarieId, m)
    }
  }

  const sorties: ShiftOut[] = []
  for (const a of ctx.affectations) {
    const sol = salaries.get(a.salarie_id)
    const c = creneaux.get(`a${a.id}`) as Creneau
    const alertes = [...(parCarte.get(`a${a.id}`) ?? [])]
    const poste = ctx.postes.get(a.poste_id)
    if (poste && !codePrevuAuPoste(poste, a.horaire_id)) {
      alertes.push({
        regle: 'HORAIRE-POSTE',
        nature: 'organisation',
        message: "cet horaire n'est pas prévu pour ce poste",
      })
    }
    sorties.push({
      id: a.id,
      salarie_id: a.salarie_id,
      poste_id: a.poste_id,
      jour: a.jour,
      type_shift_id: a.horaire_id,
      debut: a.debut,
      fin: a.fin,
      duree: travail(c),
      pause: c.pause,
      // Contrat à journée étoile (`journeesCourtesMax` posé, `versSolveur`)
      // et horaire de moins de 8 h.
      etoile:
        sol !== undefined &&
        sol.journeesCourtesMax !== null &&
        travail(c) < sol.journeePleine,
      epinglee: a.epinglee,
      besoin_id: lien.get(a.id) ?? enSoutien.get(a.id) ?? null,
      code_demande: demande.get(a.id) ?? null,
      role: sol ? role(sol, String(a.poste_id)) : null,
      alertes,
    })
  }

  const pourvus = new Map<number, number>()
  for (const id of lien.values()) pourvus.set(id, (pourvus.get(id) ?? 0) + 1)
  // Places vides : raisons sur l'horaire imposé ET sur chaque version étoile
  // et chaque remplaçant. Ces créneaux ne servent qu'ici : ils restent hors
  // de `p`, donc hors des alertes de la semaine.
  const vides = besoins.filter((b) => b.effectif - (pourvus.get(b.id) ?? 0) > 0)
  const voisins = new Map(
    vides.map((b) => [
      b.id,
      [
        ...versionsEtoileDe(ctx, b).map((h) => creneauEtoile(ctx, b, h)),
        ...remplacantsDe(ctx, b).map((h) => creneauRemplacant(ctx, b, h)),
      ],
    ]),
  )
  const pRaisons: Probleme = {
    ...p,
    creneaux: [...p.creneaux, ...[...voisins.values()].flat()],
  }
  const aPourvoir: APourvoirOut[] = []
  for (const b of vides) {
    const manquant = b.effectif - (pourvus.get(b.id) ?? 0)
    const raisons = raisonsBlocage(pRaisons, affs, `b${b.id}`)
    const parCode = (voisins.get(b.id) ?? []).map((c) => ({
      type_shift_id: Number(c.typeShift),
      raisons: raisonsBlocage(pRaisons, affs, c.id),
    }))
    aPourvoir.push({
      besoin_id: b.id,
      poste_id: b.poste_id,
      jour: b.jour,
      type_shift_id: b.horaire_id,
      debut: b.debut,
      fin: b.fin,
      duree: travail(creneaux.get(`b${b.id}`) as Creneau),
      manquant,
      raisons: raisonsOut(raisons),
      remplacants: parCode.map((r) => ({
        type_shift_id: r.type_shift_id,
        raisons: raisonsOut(r.raisons),
      })),
      raison_commune: raisonCommune([
        raisons,
        ...parCode.map((r) => r.raisons),
      ]),
    })
  }

  const bilan: BilanOut[] = []
  for (const x of ctx.staff) {
    const sol = salaries.get(x.id) as SalarieSolveur
    const siens = ctx.affectations
      .filter((a) => a.salarie_id === x.id)
      .map((a) => creneaux.get(`a${a.id}`) as Creneau)
    const alertes = [...(parPersonne.get(sol.id)?.values() ?? [])]
    const absents = new Set([
      ...joursAbsents(x, lundi, ctx.absences).keys(),
      ...joursHorsContrat(x, lundi),
    ])
    const travailles = new Set(siens.map(jourDe))
    // Partage d'abord (2026-11-03) : la semaine type a cédé pour le
    // week-end libre, l'écran le dit (le samedi fixé est libre cette
    // semaine-là).
    if (
      sol.weekendLibere &&
      siens.length &&
      !travailles.has(5) &&
      !travailles.has(6)
    )
      alertes.push({
        regle: 'WEEKEND-LIBERE',
        nature: 'organisation',
        message:
          'week-end libre cette semaine à la place de sa semaine type (aucun depuis 4 semaines)',
      })
    for (const j of [...sol.travailFixe].sort((a, b) => a - b)) {
      if (travailles.has(j) || absents.has(j)) continue
      alertes.push({
        regle: 'JOUR-HABITUEL',
        nature: 'organisation',
        message: `ne travaille pas un de ses jours habituels (${JOURS[j].toLowerCase()})`,
      })
    }
    const faites = siens.reduce((t, c) => t + travail(c), 0)
    if (
      !siens.length &&
      ctx.affectations.length &&
      !sol.contratIndicatif &&
      sol.minutesHebdoContrat > 0
    ) {
      alertes.push({
        regle: 'HEURES-CONTRAT',
        nature: 'organisation',
        message: `aucun service planifié : il manque ${heuresLisibles(sol.minutesHebdoContrat)}`,
      })
    }
    if (
      siens.length &&
      !sol.contratIndicatif &&
      faites !== sol.minutesHebdoContrat
    ) {
      const ecart = sol.minutesHebdoContrat - faites
      alertes.push({
        regle: 'HEURES-CONTRAT',
        nature: 'organisation',
        message:
          `${heuresLisibles(faites)} planifiées pour ${heuresLisibles(sol.minutesHebdoContrat)} dues : ` +
          (ecart > 0
            ? `il manque ${heuresLisibles(ecart)}`
            : `${heuresLisibles(-ecart)} de plus`),
      })
    }
    bilan.push({
      salarie_id: x.id,
      minutes: faites,
      minutes_contrat: sol.minutesHebdoContrat,
      minutes_max: sol.minutesHebdoMax,
      jours: travailles.size,
      alertes,
      absences: Object.fromEntries(joursAbsents(x, lundi, ctx.absences)),
      absences_semaine_type: [...absencesSemaineType(x).keys()].sort(
        (a, b) => a - b,
      ),
      repos_fixes: [...sol.reposFixes].sort((a, b) => a - b),
      hors_contrat: [...sol.horsContrat].sort((a, b) => a - b),
      repos_deduits: reposDeduits(
        x,
        sol,
        siens,
        lundi,
        ctx.absences,
        remplie,
        ctx.sansDecompte,
        ctx.motifsRepos,
        passes,
        ctx.regles,
      ),
      repos_proposes: [0, 1, 2, 3, 4, 5, 6].filter((j) =>
        ctx.reposProposes.has(`${x.id}|${ajouterJours(lundi, j)}`),
      ),
      jfr_proposes: [0, 1, 2, 3, 4, 5, 6].filter((j) =>
        ctx.jfrProposes.has(`${x.id}|${ajouterJours(lundi, j)}`),
      ),
      repos_obliges: reposObliges(
        x,
        sol,
        siens,
        lundi,
        ctx.absences,
        ctx.ecole,
        ctx.motifsRepos,
        passes,
        horairesPermis(x, sol, ctx),
        ctx.regles,
      ),
    })
  }

  // Tableau de l'accueil : chaque shift dans chacun de ses moments (un
  // middle au matin et au soir, D11), soutiens compris (D5), contre le
  // chiffre EXACT (D3).
  const presents: Array<{ jour: number; periode: PeriodePresence }> = []
  for (const a of ctx.affectations) {
    for (const periode of presenceDe(ctx, a))
      presents.push({ jour: a.jour, periode })
  }
  const chiffres = ctx.consignes.map((c) => ({
    ...c,
    minimum: chiffreAccueil(c),
    maximum: chiffreAccueil(c),
  }))
  const presence = bilanPresence(chiffres, presents)
  // Places de l'accueil (D1) : le chiffre de chaque moment, pourvu jusqu'à
  // lui ; s'ajoutent aux places des besoins des postes à part.
  const accueil = accueilEnService(ctx)
  const placesAccueil = (j: number) =>
    accueil
      ? presence.filter((x) => x.jour === j).reduce((t, x) => t + x.minimum, 0)
      : 0
  const pourvuesAccueil = (j: number) =>
    accueil
      ? presence
          .filter((x) => x.jour === j)
          .reduce((t, x) => t + Math.min(x.compte, x.minimum), 0)
      : 0

  // Places de l'accueil à pourvoir (étape 4) : un moment au compte sous son
  // chiffre. Raisons sur TOUS les candidats du moment (postes et horaires),
  // pour chaque personne autonome de ces postes (`raisonsBlocageAccueil`).
  const candidatsDuMoment = accueil ? candidatsAccueil(ctx) : []
  if (accueil) {
    const pAccueil: Probleme = {
      ...p,
      creneaux: [...p.creneaux, ...candidatsDuMoment],
    }
    for (const x of presence) {
      if (x.compte >= x.minimum) continue
      const ids = candidatsDuMoment.filter(
        (c) => jourDe(c) === x.jour && c.presence.includes(x.periode),
      )
      const raisons = raisonsBlocageAccueil(
        pAccueil,
        affs,
        ids.map((c) => c.id),
      )
      aPourvoir.push({
        besoin_id: idPlaceAccueil(x.jour, x.periode),
        moment: x.periode,
        poste_id: POSTE_ID_ACCUEIL,
        jour: x.jour,
        type_shift_id: null,
        debut: ids.length
          ? heureMurale(lundi, Math.min(...ids.map((c) => c.debut)))
          : '',
        fin: ids.length
          ? heureMurale(lundi, Math.max(...ids.map((c) => c.fin)))
          : '',
        duree: 0,
        manquant: x.minimum - x.compte,
        raisons: raisonsOut(raisons),
        remplacants: [],
        raison_commune: raisonCommune([raisons]),
      })
    }
  }

  // Trous de l'accueil entier (D15) : Réception et Club ensemble, du premier
  // au dernier moment demandé (`trousAccueilDuJour`, l'oracle de
  // `cycles.ts`) ; présences autonomes, aux heures écrites du shift.
  const trousAccueil: TrouOut[] = []
  if (accueil) {
    const candidats = candidatsDuMoment
    const presences: PresencePoste[] = []
    for (const a of ctx.affectations) {
      const poste = ctx.postes.get(a.poste_id)
      const sol = salaries.get(a.salarie_id)
      // La veille de nuit compte aussi : elle tient le soir jusqu'à 23:00.
      if (!estPosteAccueil(poste, accueil) || !sol) continue
      const c = creneaux.get(`a${a.id}`) as Creneau
      presences.push({
        debut: c.debut,
        fin: c.fin,
        autonome: role(sol, String(a.poste_id)) !== 'soutien',
      })
    }
    const nuitDemandee = (j: number) =>
      ctx.consignes.some(
        (k) => k.jour === j && k.periode === 'nuit' && chiffreAccueil(k) > 0,
      )
    for (let jour = 0; jour < 7; jour++) {
      const demandes = new Set(
        ctx.consignes
          .filter((k) => k.jour === jour && chiffreAccueil(k) > 0)
          .map((k) => k.periode),
      )
      for (const t of trousAccueilDuJour(
        candidats.filter((c) => jourDe(c) === jour),
        demandes,
        presences,
        nuitDeLaVeille(candidats, jourDe, jour, nuitDemandee),
      ))
        trousAccueil.push({
          poste_id: POSTE_ID_ACCUEIL,
          jour,
          debut: heureMurale(lundi, t.debut),
          fin: heureMurale(lundi, t.fin),
        })
    }
  }

  // Ouverture et relève (2026-11-01) : recomptées par l'oracle, sur les
  // shifts posés ; le jour de la relève se lit sur les horaires possibles.
  const pReglages: Probleme = {
    ...p,
    creneaux: [...p.creneaux, ...candidatsDuMoment],
    consignes: chiffresAccueil(ctx),
    ouvertures: ouverturesAccueil(ctx),
    releveMinutes: accueil ? ctx.regles.passations.releveMinutes : 0,
  }
  const ouverturesVides: TrouOut[] = ouverturesManquees(pReglages, affs).map(
    (t) => ({
      poste_id: Number(t.poste),
      jour: t.jour,
      debut: heureMurale(lundi, t.debut),
      fin: heureMurale(lundi, t.fin),
    }),
  )
  const sansReleve = relevesManquantes(pReglages, affs)
  // La nuit du dimanche d'avant (vue mois : le trait continue d'une semaine
  // à l'autre).
  const veilleDuLundi = veilleDuLundiDe(d, lundi)
  const passations = accueil
    ? transmissions(pReglages, affs, sansReleve, veilleDuLundi)
    : []
  const plage = (x: { debut: number; fin: number } | null) =>
    x && { debut: heureMurale(lundi, x.debut), fin: heureMurale(lundi, x.fin) }
  const equipes: EquipeOut[] = accueil
    ? equipesDesynchro(pReglages, affs).map((e) => ({
        jour: e.jour,
        moment: e.moment,
        arrivees: plage(e.arrivees),
        departs: plage(e.departs),
        sans_releve: e.sansReleve,
      }))
    : []

  const infractions = toutes.filter((v) => v.nature === 'loi').length
  return {
    lundi,
    affectations: sorties,
    a_pourvoir: aPourvoir,
    bilan,
    alertes_besoins: alertesBesoins,
    presence,
    trous: [
      ...trous(p, affs).map((t) => ({
        poste_id: Number(t.poste),
        jour: t.jour,
        debut: heureMurale(lundi, t.debut),
        fin: heureMurale(lundi, t.fin),
      })),
      ...trousAccueil,
      ...ouverturesVides,
    ],
    releves_manquantes: sansReleve,
    equipes,
    transmissions: passations,
    stats: {
      places:
        besoins.reduce((t, b) => t + b.effectif, 0) +
        [0, 1, 2, 3, 4, 5, 6].reduce((t, j) => t + placesAccueil(j), 0),
      pourvues:
        besoins.reduce(
          (t, b) => t + Math.min(pourvus.get(b.id) ?? 0, b.effectif),
          0,
        ) + [0, 1, 2, 3, 4, 5, 6].reduce((t, j) => t + pourvuesAccueil(j), 0),
      places_jour: [0, 1, 2, 3, 4, 5, 6].map(
        (j) =>
          besoins
            .filter((b) => b.jour === j)
            .reduce((t, b) => t + b.effectif, 0) + placesAccueil(j),
      ),
      pourvues_jour: [0, 1, 2, 3, 4, 5, 6].map(
        (j) =>
          besoins
            .filter((b) => b.jour === j)
            .reduce(
              (t, b) => t + Math.min(pourvus.get(b.id) ?? 0, b.effectif),
              0,
            ) + pourvuesAccueil(j),
      ),
      infractions,
      alertes_organisation:
        bilan.reduce((t, b) => t + b.alertes.length, 0) - infractions,
    },
    verrouillee: d.referentiel.verrous.includes(lundi),
  }
}

// ------------------------------------------------------------- génération

export interface OptionsGeneration {
  /** Date du jour (AAAA-MM-JJ, Paris). */
  aujourdhui: string
  graine?: number
  /** Repart de zéro, même les shifts épinglés. */
  tout?: boolean
  exclus?: ReadonlySet<number>
  /** Ne place que ces personnes (horaires fixes posés d'avance). */
  seulement?: ReadonlySet<number> | null
  /** Ajoute sans rien retirer. */
  sansEffacer?: boolean
  /** Chacun reste sur ses postes de titulaire. */
  titulairesSeulement?: boolean
  tempsMaxSecondes?: number
  /** Horizon glissant (2026-11-04) : esquisser la semaine suivante dans le
   * calcul (`esquisseSuivante`). `suivanteRecalculee` : elle sera calculée
   * juste après (« Compléter le mois ») ; ses propositions ne comptent pas,
   * seuls ses shifts validés sont des faits. Sinon, tous ses shifts le sont.
   * Jamais pour la pose des horaires fixes (`seulement`). */
  horizon?: { suivanteRecalculee: boolean }
}

/** Un shift à poser (non validé), au format de `planning_appliquer_generation`. */
export interface NouveauShift {
  salarie_id: number
  poste_id: number
  jour: number
  horaire_id: number | null
  debut: string
  fin: string
  pause: number
  /** Remplaçant seulement : l'horaire imposé par le besoin dont il tient la
   * place (« 08:00–16:45 au lieu de 07:00–15:45 »). Absent pour un shift à
   * l'horaire du besoin.
   * Information de l'écran : `planning_appliquer_generation` lit ses clés
   * une à une et ignore celle-ci ; l'analyse la retrouve
   * (`correspondances`, `ShiftOut.code_demande`). */
  code_demande?: number
}

/** Un jour férié rattrapé (JFR) à poser en proposition, au format de
 * `planning_appliquer_generation` (clé `motif_id` : une absence, pas un
 * shift). */
export interface NouvelleAbsence {
  salarie_id: number
  jour: number
  motif_id: number
}

export interface Generation {
  probleme: Probleme
  /** Ce qu'il faut faire du résultat du solveur. */
  traduire: (r: Resultat) => NouveauShift[]
  /** Les JFR choisis par le solveur (R-FERIE-RATTRAPE), en proposition. */
  absences: (r: Resultat) => NouvelleAbsence[]
  /** Premier jour qu'on peut encore créer (0..7). */
  depuis: number
}

/** Nombre stable tiré des propositions précédentes (crc32 du prototype). */
function empreinte(aEviter: Set<string>): number {
  if (!aEviter.size) return 0
  let hash = 0
  for (const k of [...aEviter].sort()) {
    for (let i = 0; i < k.length; i++)
      hash = (Math.imul(hash, 31) + k.charCodeAt(i)) >>> 0
  }
  return hash % 10_000
}

/**
 * Prépare la génération d'une semaine (prototype `generer_semaine`) : retire
 * EN MÉMOIRE ce que la RPC effacera (propositions des jours à venir, ou tout
 * si `tout`, et les shifts des `exclus`), construit le problème autour de ce
 * qui reste (épinglés et jours passés), et dit comment traduire le résultat.
 */
/** La nuit du dimanche d'avant : les shifts des postes de la nuit de
 * l'accueil, vraies heures, en minutes de la semaine de `lundi`. Lue par
 * l'oracle (`transmissions`) et par le calcul (`Probleme.veilleDuLundi`,
 * passation du lundi matin). */
function veilleDuLundiDe(
  d: DonneesSemaine,
  lundi: string,
): Array<{ debut: number; fin: number }> {
  const postesParId = new Map(d.referentiel.postes.map((x) => [x.id, x]))
  return d.avant
    .filter((a) => a.jour === 6 && tientLaNuit(postesParId.get(a.poste_id)))
    .map((a) => {
      const [debut, fin] = bornes(lundi, -1, a.debut, a.fin)
      return { debut, fin }
    })
}

export function preparerGeneration(
  d: DonneesSemaine,
  o: OptionsGeneration,
): Generation {
  const lundi = lundiDe(d.lundi)
  const depuis = Math.max(0, Math.min(7, ecartJours(lundi, o.aujourdhui)))
  const exclus = o.exclus ?? new Set<number>()
  const verrouillee = d.referentiel.verrous.includes(lundi)
  const aEviter = new Set<string>()
  if (!o.sansEffacer && !verrouillee) {
    for (const a of d.affectations) {
      if (a.jour >= depuis && !a.epinglee) {
        aEviter.add(
          cleAEviter(
            String(a.salarie_id),
            a.jour,
            String(a.poste_id),
            a.horaire_id === null ? null : String(a.horaire_id),
          ),
        )
      }
    }
  }
  const restants = o.sansEffacer
    ? d.affectations
    : d.affectations.filter(
        (a) =>
          a.jour < depuis ||
          (!o.tout && a.epinglee && !exclus.has(a.salarie_id)),
      )
  // Un repos en proposition des jours à venir est effacé par la RPC avec les
  // shifts en proposition (2026-10-31) : le calcul ne le voit plus.
  const premierJour = ajouterJours(lundi, depuis)
  const dernierJour = ajouterJours(lundi, 6)
  const absences =
    o.sansEffacer || verrouillee
      ? d.absences
      : d.absences.filter(
          (a) =>
            a.epinglee !== false ||
            a.jour < premierJour ||
            a.jour > dernierJour,
        )
  let d2: DonneesSemaine = { ...d, affectations: restants, absences }
  let ctx = contexte(d2)
  // Un cadre au forfait jours seul sur son poste (la Direction) reçoit son
  // JFR AVANT le calcul, comme une absence : sa place disparaît ce jour-là
  // (`sansSonCadre`). Laissé au solveur, il ne le prenait jamais : sa place
  // vide coûtait plus que le rattrapage (décision utilisateur du
  // 2026-11-03 : « lui donner son jour »).
  const jfrCadres =
    o.seulement == null ? jfrDesCadresSeuls(d2, ctx, depuis, exclus) : []
  if (jfrCadres.length) {
    d2 = {
      ...d2,
      absences: [
        ...d2.absences,
        ...jfrCadres.map((a, i) => ({
          id: -1 - i,
          salarie_id: a.salarie_id,
          jour: ajouterJours(lundi, a.jour),
          motif_id: a.motif_id,
          epinglee: false,
        })),
      ],
    }
    ctx = contexte(d2)
  }
  const { valides: besoins } = besoinsDuMoteur(ctx)
  let salaries = new Map(
    ctx.staff.map((x) => [
      x.id,
      versSolveur(
        fiche(
          x,
          lundi,
          ctx,
          exclus.has(x.id) || (o.seulement != null && !o.seulement.has(x.id)),
        ),
      ),
    ]),
  )
  if (o.titulairesSeulement) {
    salaries = new Map(
      [...salaries].map(([i, x]) => [
        i,
        {
          ...x,
          postes: new Set(
            [...x.postes].filter((p) => !x.postesOccasionnels.has(p)),
          ),
          postesOccasionnels: new Set<string>(),
        },
      ]),
    )
  }
  if (depuis > 0) {
    const passes = Array.from({ length: depuis }, (_, j) => j)
    salaries = new Map(
      [...salaries].map(([i, x]) => [
        i,
        { ...x, indisponibilites: new Set([...x.indisponibilites, ...passes]) },
      ]),
    )
  }
  const horizon = o.seulement == null ? o.horizon : undefined
  // Horizon glissant : une semaine suivante qui va être recalculée n'a que
  // ses shifts validés pour voisins, et perd ses repos et jours fériés
  // rattrapés en proposition (ils vont changer, comme ses propositions).
  if (horizon?.suivanteRecalculee) {
    const debutSuivante = ajouterJours(lundi, 7)
    const finSuivante = ajouterJours(lundi, 13)
    d2 = {
      ...d2,
      apres: d2.apres.filter((a) => a.epinglee),
      absences: d2.absences.filter(
        (a) =>
          a.epinglee !== false ||
          a.jour < debutSuivante ||
          a.jour > finSuivante,
      ),
    }
    ctx = contexte(d2)
  }
  salaries = avecSemainesVoisines(d2, ctx, salaries)
  salaries = avecHistoire(d2, ctx, salaries)
  // R-FERIE-RATTRAPE : un JFR à placer pour chaque personne qui a un jour
  // férié travaillé à rattraper (il reste dû, `FERIE_RATTRAPAGE_JOURS`), sur un jour à venir
  // APRÈS le premier jour férié en attente, ni absent, ni d'école, ni hors
  // contrat, ni fixé par la semaine type, ni jour de la journée étoile fixée
  // (un JFR ce jour-là la rendrait intravaillable : `heuresDues` ne baisserait
  // pas d'autant que `reductionJourFerie`, générateur et vérificateur ne
  // seraient plus d'accord). Un shift du jour férié de cette
  // semaine ne compte que s'il reste (validé, ou jour passé) : une
  // proposition va être recalculée. Pas pour la pose des horaires fixes
  // (`seulement`). Sans motif JFR dans les réglages : rien à écrire, rien
  // de placé.
  const motifJfr = Math.min(...ctx.motifsJfr)
  if (Number.isFinite(motifJfr) && o.seulement == null) {
    const attente = feriesEnAttente(ctx, shiftsConnus(d2, ctx.affectations))
    for (const x of ctx.staff) {
      const liste = attente.get(x.id)
      const sol = salaries.get(x.id)
      if (!liste || !sol || exclus.has(x.id)) continue
      // Un JFR par semaine : celui du cadre est déjà posé.
      if (jfrCadres.some((a) => a.salarie_id === x.id)) continue
      const apres = liste[0].date
      const jours = new Set<number>()
      for (let j = depuis; j < 7; j++) {
        if (ajouterJours(lundi, j) <= apres) continue
        // Un jour « Travaille » de la semaine type est permis (relecture du
        // 2026-11-03) : un JFR rend justement un jour qu'on aurait
        // travaillé. Sans cela, une semaine type entièrement fixée n'avait
        // jamais de jour où le poser, et le droit se perdait en silence. Le
        // jour habituel garde sa prime (`POIDS_JOUR_FIXE`) : un jour libre
        // de la fiche passe d'abord.
        if (
          sol.indisponibilites.has(j) ||
          sol.horsContrat.has(j) ||
          sol.joursHorsSite.has(j) ||
          sol.reposFixes.has(j) ||
          // 39 h : la journée étoile saute avec le JFR, quel que soit son
          // jour (2026-11-04). Sinon, jamais le jour de l'étoile fixée.
          (sol.etoileFixe.has(j) &&
            !aJourneeCourteImposee(
              ctx.regles,
              sol.minutesContrat ?? sol.minutesHebdoContrat,
            ))
        )
          continue
        jours.add(j)
      }
      if (!jours.size) continue
      salaries.set(x.id, {
        ...sol,
        jfr: {
          jours,
          reduction: reductionJourFerie(fiche(x, lundi, ctx)),
        },
      })
    }
  }
  const groupes = new Map<number, Array<{ x: Salarie; minutes: number }>>()
  for (const x of ctx.staff) {
    const sol = salaries.get(x.id)
    const groupe = posteEquite(x, ctx.postes, ctx.regles)
    if (!sol || groupe === null) continue
    groupes.set(groupe, [
      ...(groupes.get(groupe) ?? []),
      { x, minutes: sol.minutesHebdoContrat },
    ])
  }
  for (const [groupe, membres] of groupes) {
    const faits = equitesAvant(ctx, d2, membres)
    for (const { x } of membres)
      salaries.set(x.id, {
        ...salaries.get(x.id)!,
        groupeEquite: String(groupe),
        // Les heures en plus (règle 12, `avecHistoire`) restent.
        equiteAvant: {
          ...salaries.get(x.id)!.equiteAvant,
          ...faits.get(x.id)!,
        },
      })
  }
  const corr = correspondances(ctx, besoins, salaries)
  const { lien, demande } = corr
  // Rattaché par une version étoile ou par cycle : posé sur un créneau `r…`.
  const parAutreHoraire = (aId: number) =>
    demande.has(aId) || corr.etoile.has(aId)
  // Un soutien rattaché par cycle reste un shift posé à part (son créneau
  // `a…`, ses vraies heures) : les remplaçants n'ont pas de place de soutien
  // (contrat de la vague 1, §2), et le poser sur `b…` lui donnerait les
  // heures de l'horaire imposé. Mais il TIENT la place de soutien de son besoin,
  // comme dans `analyser` (`besoin_id`) : cette place est retirée de `b…`,
  // sinon le moteur pouvait y poser un second apprenti (2 pour 1 place).
  const enSoutien = new Map(
    [...corr.soutien].filter(([aId]) => !parAutreHoraire(aId)),
  )
  const deja = new Map<number, number>()
  const dejaSoutien = new Map<number, number>()
  const soutienParCycle = new Map<number, number>()
  for (const id of lien.values()) deja.set(id, (deja.get(id) ?? 0) + 1)
  for (const id of enSoutien.values())
    dejaSoutien.set(id, (dejaSoutien.get(id) ?? 0) + 1)
  for (const [aId, id] of corr.soutien)
    if (parAutreHoraire(aId))
      soutienParCycle.set(id, (soutienParCycle.get(id) ?? 0) + 1)

  const creneaux: Creneau[] = besoins.map((b) =>
    creneauBesoin(
      ctx,
      b,
      Math.max(
        b.soutien - (soutienParCycle.get(b.id) ?? 0),
        dejaSoutien.get(b.id) ?? 0,
      ),
      Math.max(b.renfort, (deja.get(b.id) ?? 0) - b.effectif),
    ),
  )
  // Versions étoile et remplaçants (`r<besoin>-<horaire>`, étape 4) : pour
  // une place encore ouverte, chaque version étoile de son horaire
  // (`creneauEtoile`, dès le premier temps) et chaque autre horaire du même
  // cycle ; pour une place pleine, aucun, sauf celui qui porte un shift posé
  // rattaché ainsi (il y est imposé, avec ses vraies heures).
  const remplacants = new Map<
    string,
    { b: Besoin; h: Horaire; etoile: boolean }
  >()
  const ajouteRemplacant = (b: Besoin, h: Horaire, etoile: boolean) => {
    const id = idRemplacant(b.id, h.id)
    if (remplacants.has(id)) return
    remplacants.set(id, { b, h, etoile })
    creneaux.push(
      etoile ? creneauEtoile(ctx, b, h) : creneauRemplacant(ctx, b, h),
    )
  }
  const parBesoin = new Map(besoins.map((b) => [b.id, b]))
  for (const a of ctx.affectations) {
    const bId = lien.get(a.id)
    const h = a.horaire_id !== null ? ctx.horaires.get(a.horaire_id) : undefined
    if (bId === undefined || !parAutreHoraire(a.id) || !h) continue
    ajouteRemplacant(parBesoin.get(bId) as Besoin, h, corr.etoile.has(a.id))
  }
  for (const b of besoins) {
    if ((deja.get(b.id) ?? 0) >= b.effectif + b.renfort) continue
    for (const h of versionsEtoileDe(ctx, b)) ajouteRemplacant(b, h, true)
    for (const h of remplacantsDe(ctx, b)) ajouteRemplacant(b, h, false)
  }
  // Candidats de l'accueil (D1) : à partir d'aujourd'hui seulement (avant,
  // personne n'est libre ; les shifts posés y restent des faits).
  const candidats = new Map<
    string,
    { jour: number; poste: Poste; h: Horaire }
  >()
  for (const c of candidatsAccueil(ctx, depuis)) {
    creneaux.push(c)
    candidats.set(c.id, {
      jour: c.jourPlanning as number,
      poste: ctx.postes.get(Number(c.poste)) as Poste,
      h: ctx.horaires.get(Number(c.typeShift)) as Horaire,
    })
  }
  const rattache = new Map([...lien, ...enSoutien])
  for (const a of ctx.affectations) {
    if (!rattache.has(a.id)) creneaux.push(creneauAffectation(ctx, a))
  }
  const creneauDe = (a: Affectation) => {
    const bId = rattache.get(a.id)
    if (bId === undefined) return `a${a.id}`
    return parAutreHoraire(a.id) && a.horaire_id !== null
      ? idRemplacant(bId, a.horaire_id)
      : `b${bId}`
  }
  const paire = (a: Affectation) => cle(String(a.salarie_id), creneauDe(a))
  const imposees = new Set(ctx.affectations.map(paire))
  const p = probleme({
    salaries: [...salaries.values()],
    creneaux,
    regles: ctx.regles,
    // Graine propre à la semaine et à l'historique : les repos « libres »
    // changent d'une semaine à l'autre, deux « Compléter » ne tirent pas
    // le même hasard.
    graine:
      (versJour(lundi) * 100 + (o.graine ?? 0) + empreinte(aEviter)) >>> 0,
    imposees,
    aEviter,
    consignes: chiffresAccueil(ctx),
    ouvertures: ouverturesAccueil(ctx),
    ...(horizon
      ? { suivante: esquisseSuivante(d2, ctx, salaries, besoins) }
      : {}),
    releveMinutes: accueilEnService(ctx)
      ? ctx.regles.passations.releveMinutes
      : 0,
    // Passation du lundi matin avec le veilleur du dimanche d'avant.
    veilleDuLundi: veilleDuLundiDe(d, lundi),
    // 60 s au plus par semaine (décision utilisateur du 2026-11-03 ; 40 s
    // depuis le 2026-11-01, 10 s avant) : à 10 s, HiGHS s'arrêtait avant
    // l'optimum sur une semaine réelle (décembre : des contrats à 32 h et des
    // places vides alors que des extras étaient libres) ; avec les règles
    // morales, quelques vraies semaines touchaient les 40 s. Il rend la main
    // dès qu'il a l'optimum.
    tempsMaxSecondes: o.tempsMaxSecondes ?? 60,
  })
  const parId = new Map(besoins.map((b) => [`b${b.id}`, b]))
  const traduire = (r: Resultat): NouveauShift[] => {
    const nouveaux: NouveauShift[] = []
    for (const a of r.affectations) {
      if (imposees.has(cle(a.salarieId, a.creneauId))) continue
      const cand = candidats.get(a.creneauId)
      if (cand) {
        // Un candidat de l'accueil : l'horaire choisi sur le poste choisi.
        nouveaux.push({
          salarie_id: Number(a.salarieId),
          poste_id: cand.poste.id,
          jour: cand.jour,
          horaire_id: cand.h.id,
          ...horaireDe(cand.h),
          pause: cand.h.pause,
        })
        continue
      }
      const rempl = remplacants.get(a.creneauId)
      if (rempl) {
        // Une version étoile ou un remplaçant : l'horaire réel sur le poste
        // et le jour du besoin ; « au lieu de » pour un remplaçant seulement.
        const { b, h, etoile } = rempl
        nouveaux.push({
          salarie_id: Number(a.salarieId),
          poste_id: b.poste_id,
          jour: b.jour,
          horaire_id: h.id,
          ...horaireDe(h),
          pause: h.pause,
          ...(etoile ? {} : { code_demande: b.horaire_id as number }),
        })
        continue
      }
      const b = parId.get(a.creneauId)
      if (!b) continue
      const h =
        b.horaire_id !== null ? ctx.horaires.get(b.horaire_id) : undefined
      const { debut, fin } = h ? horaireDe(h) : { debut: b.debut, fin: b.fin }
      nouveaux.push({
        salarie_id: Number(a.salarieId),
        poste_id: b.poste_id,
        jour: b.jour,
        horaire_id: b.horaire_id,
        debut,
        fin,
        pause: h ? h.pause : 0,
      })
    }
    return nouveaux
  }
  const absencesJfr = (r: Resultat): NouvelleAbsence[] => [
    ...jfrCadres,
    ...(r.jfr ?? []).map((a) => ({
      salarie_id: Number(a.salarieId),
      jour: a.jour,
      motif_id: motifJfr,
    })),
  ]
  return { probleme: p, traduire, absences: absencesJfr, depuis }
}

/** Personnes à jours fixes à poser d'avance (prototype `poser_fixes`) :
 * actives, à jours fixes, sous contrat, et sans aucun shift cette semaine
 * OU avec un jour « Travaille » de la fiche resté vide (`joursFixesManquants`).
 * Le second cas (demande utilisateur du 2026-10-31 : « complète les jours
 * manquants à l'ouverture ») reprend une semaine commencée par un ancien
 * calcul : la pose ajoute sans rien retirer, le validé ne bouge pas. */
export function aPoserFixes(
  d: DonneesSemaine,
  aujourdhui: string,
): Set<number> {
  const lundi = lundiDe(d.lundi)
  if (lundi < lundiDe(aujourdhui) || d.referentiel.verrous.includes(lundi))
    return new Set()
  const deja = new Set(d.affectations.map((a) => a.salarie_id))
  const absences = indexerAbsences(d.absences)
  const liberes = weekendsLiberes(d)
  return new Set(
    d.referentiel.salaries
      .filter(
        (x) =>
          x.actif &&
          aJoursFixes(x) &&
          joursHorsContrat(x, lundi).size < 7 &&
          (!deja.has(x.id) ||
            joursFixesManquants(x, d, aujourdhui, absences, liberes).length >
              0),
      )
      .map((x) => x.id),
  )
}

/** Jours « Travaille » de la fiche encore à venir (aujourd'hui compris) qui
 * n'ont ni shift, ni absence, ni repos posé, et sont sous contrat. Samedi
 * et dimanche d'une semaine de week-end libéré (`weekendsLiberes`) : jamais. */
export function joursFixesManquants(
  x: Salarie,
  d: DonneesSemaine,
  aujourdhui: string,
  absences: Map<number, Map<string, number>> = indexerAbsences(d.absences),
  liberes: ReadonlySet<number> = weekendsLiberes(d),
): number[] {
  const lundi = lundiDe(d.lundi)
  const depuis = Math.max(0, ecartJours(lundi, aujourdhui))
  const pris = new Set(
    d.affectations.filter((a) => a.salarie_id === x.id).map((a) => a.jour),
  )
  const absents = joursAbsents(x, lundi, absences)
  const hors = joursHorsContrat(x, lundi)
  const libere = liberes.has(x.id)
  return x.semaine_type.flatMap((e, j) =>
    e.mode === 'travail' &&
    !(libere && j >= 5) &&
    j >= depuis &&
    !pris.has(j) &&
    !absents.has(j) &&
    !hors.has(j)
      ? [j]
      : [],
  )
}

/** Horizon glissant (2026-11-04, décision utilisateur) : la semaine
 * SUIVANTE esquissée pour le calcul de celle-ci. Chaque personne sous
 * contrat y a un jour travaillé ou non (sans horaire) :
 *   - travaillé d'office : un shift gardé (`d.apres`, déjà réduit aux
 *     validés quand elle sera recalculée), un jour d'école ;
 *   - impossible : hors contrat, une absence, un repos fixe ;
 *   - à choisir sinon.
 * Ses jours attendus suivent le rythme de 5 jours (contrat nominal de 35 h
 * ou plus, absences décomptées) ; la règle 4 regarde les 2 semaines d'avant
 * celle du calcul (la troisième, c'est elle). Les groupes : l'accueil (son
 * tableau, chaque jour) et chaque poste à part (ses besoins de la semaine,
 * qui se répètent), diminués de ce que tiennent les shifts gardés de ceux
 * qui n'ont pas d'esquisse (extras). Extras et personnes placées à la main :
 * pas d'esquisse. */
export function esquisseSuivante(
  d: DonneesSemaine,
  ctx: Contexte,
  salaries: ReadonlyMap<number, SalarieSolveur>,
  besoins: readonly Besoin[],
): Suivante {
  const lundi = ctx.lundi
  const suivant = ajouterJours(lundi, 7)
  const gardes = d.apres
  const connus = shiftsConnus(d, []).filter((a) => a.lundi < lundi)
  const semaine = (k: number) => {
    const l = ajouterJours(lundi, -7 * k)
    return connus.filter((a) => a.lundi === l)
  }
  const motifs = new Map(d.referentiel.motifs.map((m) => [m.id, m]))
  const estNuit = (a: Affectation) => equiteDe(ctx, a).moment === 'nuit'
  const personnes = new Map<string, SuivantePersonne>()
  for (const x of ctx.staff) {
    const sol = salaries.get(x.id)
    if (!sol || sol.placementManuel) continue
    const hors = joursHorsContrat(x, suivant)
    const absents = joursAbsents(x, suivant, ctx.absences)
    const fixes = new Map<number, 0 | 1>()
    const horsSite = new Set<number>()
    const postesGardes = new Map<number, string>()
    const nonLibres = new Set<number>()
    // Comme la semaine du calcul : l'école est une journée de contrat ET
    // retirée des jours attendus (`indisponibilites`, rythme de 5 jours).
    let absences = 0
    const libre = (m: number | null | undefined) => {
      if (m === null || m === undefined) return true
      const motif = motifs.get(m)
      return motif ? absenceLibre(motif) : !ctx.ecole.has(m)
    }
    for (let j = 0; j < 7; j++) {
      const garde = gardes.find((a) => a.salarie_id === x.id && a.jour === j)
      if (hors.has(j)) fixes.set(j, 0)
      else if (garde) {
        fixes.set(j, 1)
        postesGardes.set(j, String(garde.poste_id))
      } else if (absents.has(j)) {
        const m = absents.get(j)
        absences++
        if (m !== null && m !== undefined && ctx.ecole.has(m)) {
          fixes.set(j, 1)
          horsSite.add(j)
        } else fixes.set(j, 0)
        if ((j === 5 || j === 6) && !libre(m)) nonLibres.add(j)
      } else if (x.semaine_type.at(j)?.mode === 'repos') fixes.set(j, 0)
    }
    // Le week-end du calcul : une absence qui ne libère pas compte travaillé.
    const absentsIci = joursAbsents(x, lundi, ctx.absences)
    const nonLibresIci = new Set(
      [5, 6].filter((j) => absentsIci.has(j) && !libre(absentsIci.get(j))),
    )
    if (hors.size === 7) continue
    const rythme =
      !sol.contratIndicatif &&
      Number(x.heures_hebdo) * 60 >= ctx.regles.repos.rythmeContratMin
    personnes.set(sol.id, {
      fixes,
      horsSite,
      postesGardes,
      nonLibres,
      nonLibresIci,
      attendus: rythme
        ? Math.max(
            0,
            Math.min(sol.joursPreferesSemaine, 7 - hors.size) - absences,
          )
        : 0,
      weekendLibreAvant:
        aDesReposFixes(x) || hors.has(5) || hors.has(6)
          ? null
          : weekendLibreAvantDe(x, lundi, ctx, semaine, motifs, estNuit, 2),
    })
  }
  const membresDe = (poste: (posteId: number) => boolean) =>
    new Set(
      ctx.staff
        .filter(
          (x) =>
            personnes.has(String(x.id)) &&
            x.competences.some(
              (c) => c.niveau !== 'soutien' && poste(c.poste_id),
            ),
        )
        .map((x) => String(x.id)),
    )
  // Ce que tiennent déjà, chaque jour, les shifts gardés des personnes
  // sans esquisse (un extra posé à la main).
  const deja = (poste: (posteId: number) => boolean) => {
    const n = [0, 0, 0, 0, 0, 0, 0]
    for (const a of gardes)
      if (!personnes.has(String(a.salarie_id)) && poste(a.poste_id)) n[a.jour]++
    return n
  }
  const groupes: GroupeSuivante[] = []
  const ajoute = (poste: (posteId: number) => boolean, voulus: number[]) => {
    const tenus = deja(poste)
    const reste = voulus.map((v, j) => Math.max(0, v - tenus[j]))
    const membres = membresDe(poste)
    const postes = new Set(
      [...ctx.postes.keys()].filter(poste).map((id) => String(id)),
    )
    if (membres.size && reste.some((v) => v > 0))
      groupes.push({ membres, postes, besoins: reste })
  }
  if (accueilEnService(ctx)) {
    const voulus = [0, 0, 0, 0, 0, 0, 0]
    for (const c of ctx.consignes) voulus[c.jour] += chiffreAccueil(c)
    ajoute((id) => posteDeLAccueil(ctx, id), voulus)
  }
  const parPoste = new Map<number, number[]>()
  for (const b of besoins) {
    const v = parPoste.get(b.poste_id) ?? [0, 0, 0, 0, 0, 0, 0]
    v[b.jour] += b.effectif
    parPoste.set(b.poste_id, v)
  }
  for (const [posteId, voulus] of parPoste)
    ajoute((id) => id === posteId, voulus)
  return { personnes, groupes }
}

/** Les repos qu'une génération complète POSE en proposition (2026-11-03,
 * demande utilisateur : « en temps normal, leur planning est censé être
 * vide ; les repos ne se posent qu'à la main ou par la génération »). Ce
 * sont les repos déduits (`reposDeduits`) de la semaine générée, sur un jour
 * à venir (`depuis`) sans shift ni absence ni hors contrat ; écrits comme un
 * jour férié rattrapé proposé (pointillés, « Valider » les garde,
 * « Effacer » ou un nouveau calcul les retire, « Vider la case » aussi). */
export function reposAProposer(
  semaine: Pick<SemaineOut, 'bilan' | 'affectations'>,
  depuis: number,
  motifRepos: number,
): NouvelleAbsence[] {
  const pris = new Set(
    semaine.affectations.map((a) => `${a.salarie_id}|${a.jour}`),
  )
  return semaine.bilan.flatMap((b) =>
    [
      ...new Set([
        ...b.repos_deduits,
        // Repos obligés (2026-11-04) : posés comme les autres.
        ...(b.repos_obliges ?? []).map((o) => o.jour),
      ]),
    ]
      .sort((x, y) => x - y)
      .filter(
        (j) =>
          j >= depuis &&
          !(j in b.absences) &&
          !b.hors_contrat.includes(j) &&
          !b.repos_fixes.includes(j) &&
          !pris.has(`${b.salarie_id}|${j}`),
      )
      .map((jour) => ({
        salarie_id: b.salarie_id,
        jour,
        motif_id: motifRepos,
      })),
  )
}

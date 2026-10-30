/*
 * Le planning d'une semaine : analyse en direct et préparation d'une
 * génération autour des shifts épinglés (prototype `semaine.py`). Pur : les
 * données arrivent déjà lues (service), les écritures repartent par les RPC.
 * Les créneaux des besoins s'appellent « b<id> », ceux du planning « a<id> ».
 *
 * Sorties : mêmes noms de champs que l'API du prototype (`SemaineOut`…), pour
 * que l'écran se porte tel quel.
 */

import { cycleDe } from '#/lib/planning/cycles.ts'
import {
  codePrevuAuPoste,
  codesDeLaFiche,
  codesDuPoste,
  codesImposes,
} from '#/lib/planning/eligibilite.ts'
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
  SalarieSolveur,
  EquiteFaite,
} from '#/lib/planning/modele.ts'
import {
  alerteBesoin,
  presenceMaxPoste,
  versSolveur,
} from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import {
  bilanPresence,
  periodePresence,
  periodeShift,
} from '#/lib/planning/presence.ts'
import type { PresenceOut } from '#/lib/planning/presence.ts'
import {
  MINUTES_PAR_JOUR,
  ajouterJours,
  bornes,
  decalageParis,
  ecartJours,
  heuresLisibles,
  hhmm,
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
  PeriodePresence,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'
import {
  raisonsBlocage,
  reposHebdoTrouve,
  trous,
  violations,
} from '#/lib/planning/verificateur.ts'
import type { Violation } from '#/lib/planning/verificateur.ts'

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
  court: boolean
  epinglee: boolean
  besoin_id: number | null
  /** Code imposé par le besoin quand le shift posé en a un autre du même
   * cycle (« M6 au lieu de M3 », plan planning-cycles-2026-10-30) ; null
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
  besoin_id: number
  poste_id: number
  jour: number
  type_shift_id: number | null
  debut: string
  fin: string
  duree: number
  manquant: number
  /** Pourquoi chacun ne peut pas prendre la place avec le code imposé. */
  raisons: RaisonOut[]
  /** Les autres codes du même cycle qui pourraient tenir la place
   * (`remplacantsDe`), et pourquoi chacun ne peut pas les prendre non plus.
   * Vide pour un code sans famille ou sans voisin. Ajouté le 2026-10-30
   * (plan planning-cycles-2026-10-30, étape 5) ; absent du prototype. */
  remplacants: Array<{ type_shift_id: number; raisons: RaisonOut[] }>
  /** Règle (identifiant, comme `RaisonOut.regles`) qui bloque TOUT LE MONDE,
   * sur le code imposé comme sur chaque remplaçant : celle de « Je ne peux
   * pas remplir ce M3 ». Null : personne à qui la poser, ou quelqu'un qu'aucune
   * règle ne bloque sur au moins un code, ou pas de règle commune. Un extra
   * seulement « à appeler » (règle `EXTRA` seule) n'est pas compté. */
  raison_commune: string | null
}

/** Un trou entre deux équipes, pour l'écran. */
export interface TrouOut {
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
}

export interface Contexte {
  lundi: string
  horaires: Map<number, Horaire>
  postes: Map<number, Poste>
  staff: Salarie[]
  besoins: Besoin[] // horaires déjà résolus depuis leur code
  consignes: Consigne[]
  affectations: Affectation[]
  sansDecompte: Set<number>
  ecole: Set<number>
  /** salarié → (date → motif) */
  absences: Map<number, Map<string, number>>
}

export function estEcole(m: Pick<Motif, 'nature' | 'code' | 'nom'>): boolean {
  if (m.nature === 'ecole') return true
  const nom = m.nom.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  return m.code === 'EC' || nom.startsWith('ecole')
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
  const horaires = new Map(d.referentiel.horaires.map((h) => [h.id, h]))
  const besoins = [...d.referentiel.besoins]
    .map((b) => {
      const h = b.horaire_id !== null ? horaires.get(b.horaire_id) : undefined
      return h ? { ...b, debut: h.debut, fin: h.fin } : { ...b }
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
    absences: indexerAbsences(d.absences),
  }
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
  ctx: Pick<Contexte, 'sansDecompte' | 'ecole' | 'absences'>,
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
    minutesHebdo: Math.round(Number(x.heures_hebdo) * 60),
    forfaitJours: x.forfait_jours,
    mineur: x.mineur,
    indisponibilites: exclu
      ? new Set([0, 1, 2, 3, 4, 5, 6])
      : new Set(absents.keys()),
    // Hors contrat : comme une absence, les heures dues baissent au prorata.
    joursAbsenceDecomptes: decomptes + hors.size,
    horsContrat: hors,
    joursEcole: ecole,
    reposFixes,
    travailFixe,
    shiftImpose: codesImposes(semaine),
    shiftsAutorises: codesDeLaFiche(x),
    etoileFixe: etoile,
    contratDebut: borneContrat(lundi, x.date_entree, 0),
    contratFin: borneContrat(lundi, x.date_sortie, 1),
  }
}

// --------------------------------------------------------------- créneaux

/** Postes qui ont au moins un code de la famille nuit (`codesDuPoste`) : la
 * nuit n'y compte dans les consignes que là (D15). Calculé une fois par
 * contexte. */
const nuitParHoraires = new WeakMap<
  Map<number, Horaire>,
  Map<number, boolean>
>()
function nuitComptee(ctx: Contexte, posteId: number): boolean {
  let r = nuitParHoraires.get(ctx.horaires)
  if (!r) {
    r = new Map()
    nuitParHoraires.set(ctx.horaires, r)
  }
  let v = r.get(posteId)
  if (v === undefined) {
    v = codesDuPoste(ctx.postes.get(posteId), [...ctx.horaires.values()]).some(
      (h) => h.periode === 'nuit',
    )
    r.set(posteId, v)
  }
  return v
}

/** Consigne de présence où compte un shift ou un besoin (`presence.ts`). */
function presenceDe(
  ctx: Contexte,
  x: { poste_id: number; horaire_id: number | null; debut: string },
): PeriodePresence | null {
  return periodePresence(
    ctx.postes.get(x.poste_id),
    x.horaire_id !== null ? ctx.horaires.get(x.horaire_id) : undefined,
    x.debut,
    nuitComptee(ctx, x.poste_id),
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
      const h =
        b.horaire_id !== null ? ctx.horaires.get(b.horaire_id) : undefined
      if (periodeShift(h, b.debut) !== 'matin') continue
      const m = minutes(b.debut)
      r.set(b.poste_id, Math.min(r.get(b.poste_id) ?? m, m))
    }
    matinsTotParBesoins.set(ctx.besoins, r)
  }
  return r
}

/** Équité (D15) : un shift ou un besoin est-il un soir, un matin tôt ? Soir
 * = période soir de son code (sans code : l'heure de début) ; matin tôt =
 * un matin qui commence au plus tôt des matins prévus pour ce poste. */
export function equiteDe(
  ctx: Contexte,
  x: { poste_id: number; horaire_id: number | null; debut: string },
): { soir: boolean; matinTot: boolean } {
  const h = x.horaire_id !== null ? ctx.horaires.get(x.horaire_id) : undefined
  const periode = periodeShift(h, x.debut)
  const tot = debutsMatinTot(ctx).get(x.poste_id)
  return {
    soir: periode === 'soir',
    matinTot:
      periode === 'matin' && tot !== undefined && minutes(x.debut) <= tot,
  }
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
    raccourci: h ? h.raccourci : 0,
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
    jourPlanning: a.jour,
    ferme: true,
    presenceMax: presenceMaxDe(ctx, a.poste_id),
    nuit: toucheLaNuit(a.jour, a.debut, a.fin),
    presence: presenceDe(ctx, a),
    ...equiteDe(ctx, a),
  })
}

// ------------------------------------------------------------ remplaçants

/** Codes qui peuvent tenir la place d'un besoin à la place de son code
 * (plan planning-cycles-2026-10-30, D12) : les AUTRES codes du poste
 * (`codesDuPoste`) du MÊME cycle (`cycleDe`). Un middle ne remplace qu'un
 * middle (même famille, donc même cycle). Un code sans famille
 * (`periode === null` : direction, supervision) n'a jamais de remplaçant et
 * n'en est jamais un ; un besoin en horaire libre non plus. Aucun code n'est
 * créé ni modifié : on choisit parmi ceux qui existent. Triés par id. */
export function remplacantsDe(
  ctx: Pick<Contexte, 'horaires' | 'postes'>,
  b: Pick<Besoin, 'poste_id' | 'horaire_id'>,
): Horaire[] {
  if (b.horaire_id === null) return []
  const h = ctx.horaires.get(b.horaire_id)
  if (!h || h.periode === null) return []
  const cycle = cycleDe(h, h.debut)
  return codesDuPoste(ctx.postes.get(b.poste_id), [...ctx.horaires.values()])
    .filter(
      (c) =>
        c.id !== h.id && c.periode !== null && cycleDe(c, c.debut) === cycle,
    )
    .sort((a, c) => a.id - c.id)
}

/** Id du créneau remplaçant d'un besoin pour un code. */
export const idRemplacant = (besoinId: number, horaireId: number) =>
  `r${besoinId}-${horaireId}`

/** Créneau remplaçant (`r<besoin>-<code>`, contrat de la vague 1, §2) : la
 * place du besoin `b<id>` tenue avec un autre code du même cycle. Aucune
 * place propre (effectif, facultatif et soutien à 0) : le moteur compte ses
 * autonomes avec ceux de `b<id>` (`place`). Bornes, pause, raccourci et
 * présence sont ceux du code remplaçant, le jour et le poste ceux du
 * besoin. */
export function creneauRemplacant(
  ctx: Contexte,
  b: Besoin,
  h: Horaire,
): Creneau {
  const [d, f] = bornes(ctx.lundi, b.jour, h.debut, h.fin)
  const x = { poste_id: b.poste_id, horaire_id: h.id, debut: h.debut }
  return creneau({
    id: idRemplacant(b.id, h.id),
    poste: String(b.poste_id),
    debut: d,
    fin: f,
    effectif: 0,
    typeShift: String(h.id),
    soutien: 0,
    pause: h.pause,
    raccourci: h.raccourci,
    facultatif: 0,
    jourPlanning: b.jour,
    ferme: false,
    presenceMax: presenceMaxDe(ctx, b.poste_id),
    nuit: toucheLaNuit(b.jour, h.debut, h.fin),
    presence: presenceDe(ctx, x),
    place: `b${b.id}`,
    ...equiteDe(ctx, x),
  })
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
  /** shift rattaché PAR CYCLE (seconde passe) → code imposé par le besoin
   * (`horaire_id`) : « M6 au lieu de M3 ». Absent : rattaché par son code,
   * ou pas rattaché. Sous-ensemble des clés de `lien` et `soutien`. */
  demande: Map<number, number>
}

/** Rattache chaque shift au besoin qu'il couvre, en deux passes (plan
 * planning-cycles-2026-10-30, D6) :
 *
 * 1. code exact, comme avant : même poste, jour et horaire (l'horaire, c'est
 *    le code quand il y en a un : un shift en journée courte couvre le
 *    besoin de son code) ;
 * 2. les shifts encore libres prennent les places encore libres du MÊME
 *    poste, du MÊME jour et du MÊME cycle, quand leur code est un remplaçant
 *    du code du besoin (`remplacantsDe` : codes du poste, même cycle, un
 *    middle pour un middle, jamais un code sans famille ni un horaire libre).
 *    Le début le plus proche d'abord. Marqués dans `demande`.
 *
 * Dans chaque passe, épinglés d'abord ; un profil soutien ne prend qu'une
 * place de soutien. Le code exact passe toujours avant un voisin : la
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

  // 2. Même poste, même jour, même cycle.
  const voisins = new Map(
    besoins.map((b) => [b.id, new Set(remplacantsDe(ctx, b).map((h) => h.id))]),
  )
  for (const a of ordre) {
    if (lien.has(a.id) || soutien.has(a.id) || a.horaire_id === null) continue
    const h = ctx.horaires.get(a.horaire_id)
    if (!h || h.periode === null) continue
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
    demande.set(a.id, choisi.horaire_id)
  }
  return { lien, soutien, demande }
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

/** Équité (D15) : le poste principal, celui où l'on compare une personne
 * aux autres (le premier tenu en titulaire). Null : hors équité (extra,
 * forfait jours, sans poste tenu en titulaire). */
export function posteEquite(x: Salarie): number | null {
  if (x.type_contrat === 'extra' || x.forfait_jours) return null
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

/** Jours libres qui sont du repos : heures dues couvertes par l'école ou les
 * absences, ou 5 jours déjà pris. Jamais pour un extra. Pour un apprenti ou
 * un stagiaire, seulement sur une semaine REMPLIE (`semaineRemplie`) : sa
 * ligne vide sauf l'école tant qu'on n'a ni généré ni posé à la main, puis
 * ses jours libres en repos comme pour les autres, week-end d'une semaine
 * entière d'école compris (décisions utilisateur du 2026-10-27). Affichage
 * seulement : le moteur garde ses règles de repos et l'école. */
const ALTERNANCE: ReadonlySet<Salarie['type_contrat']> = new Set([
  'apprenti',
  'stagiaire',
])

export function reposDeduits(
  x: Salarie,
  sol: SalarieSolveur,
  siens: Creneau[],
  lundi: string,
  absences: Map<number, Map<string, number>>,
  remplie = true,
): number[] {
  if (x.type_contrat === 'extra') return []
  if (ALTERNANCE.has(x.type_contrat) && !remplie) return []
  const pris = new Set([...siens.map(jourDe), ...sol.joursHorsSite])
  const couvert =
    !sol.contratIndicatif &&
    Number(x.heures_hebdo) > 0 &&
    sol.minutesHebdoContrat === 0
  if (!(couvert || pris.size >= sol.joursPreferesSemaine)) return []
  const occupes = new Set([
    ...pris,
    ...joursAbsents(x, lundi, absences).keys(),
    ...sol.reposFixes,
    ...sol.horsContrat,
  ])
  return [0, 1, 2, 3, 4, 5, 6].filter((j) => !occupes.has(j))
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
 * personne sur chaque code essayé (le code imposé, puis chaque remplaçant).
 * Null dès qu'une personne n'a aucune raison sur un code (elle pourrait le
 * prendre), sans personne à qui la poser, ou sans règle commune. Un extra
 * seulement « à appeler » (`EXTRA` seule) est laissé de côté : c'est la
 * solution humaine, pas un blocage. Plusieurs règles communes : la première
 * dans l'ordre du vérificateur, chez la première personne. */
export function raisonCommune(
  parCode: ReadonlyArray<ReadonlyMap<string, readonly Violation[]>>,
): string | null {
  const listes: string[][] = []
  for (const raisons of parCode) {
    for (const vs of raisons.values()) {
      const regles = vs.map((v) => v.regle)
      if (regles.length === 1 && regles[0] === 'EXTRA') continue
      if (!regles.length) return null
      listes.push(regles)
    }
  }
  if (!listes.length) return null
  return (
    listes[0].find(
      (r) => r !== 'EXTRA' && listes.every((l) => l.includes(r)),
    ) ?? null
  )
}

export function analyser(d: DonneesSemaine): SemaineOut {
  const ctx = contexte(d)
  const lundi = ctx.lundi
  const remplie = semaineRemplie(ctx.affectations, d.referentiel.salaries)
  const { valides: besoins, alertes: alertesBesoins } = besoinsValides(ctx)
  let salaries = new Map(
    ctx.staff.map((x) => [x.id, versSolveur(fiche(x, lundi, ctx))]),
  )
  salaries = avecSemainesVoisines(d, ctx, salaries)
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
      court: false,
    }))
  const p = probleme({
    salaries: [...salaries.values()],
    creneaux: [...creneaux.values()],
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
      court: a.court,
      epinglee: a.epinglee,
      besoin_id: lien.get(a.id) ?? enSoutien.get(a.id) ?? null,
      code_demande: demande.get(a.id) ?? null,
      role: sol ? role(sol, String(a.poste_id)) : null,
      alertes,
    })
  }

  const pourvus = new Map<number, number>()
  for (const id of lien.values()) pourvus.set(id, (pourvus.get(id) ?? 0) + 1)
  // Places vides : raisons sur le code imposé ET sur chaque remplaçant. Les
  // créneaux remplaçants ne servent qu'ici : ils restent hors de `p`, donc
  // hors des alertes de la semaine.
  const vides = besoins.filter((b) => b.effectif - (pourvus.get(b.id) ?? 0) > 0)
  const voisins = new Map(
    vides.map((b) => [
      b.id,
      remplacantsDe(ctx, b).map((h) => creneauRemplacant(ctx, b, h)),
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
      repos_deduits: reposDeduits(x, sol, siens, lundi, ctx.absences, remplie),
    })
  }

  // Présence : personnes autonomes sur les postes qui comptent.
  const presents: Array<{ jour: number; periode: PeriodePresence }> = []
  for (const a of ctx.affectations) {
    const periode = presenceDe(ctx, a)
    const sol = salaries.get(a.salarie_id)
    if (!periode || (sol && role(sol, String(a.poste_id)) === 'soutien'))
      continue
    presents.push({ jour: a.jour, periode })
  }

  const infractions = toutes.filter((v) => v.nature === 'loi').length
  return {
    lundi,
    affectations: sorties,
    a_pourvoir: aPourvoir,
    bilan,
    alertes_besoins: alertesBesoins,
    presence: bilanPresence(ctx.consignes, presents),
    trous: trous(p, affs).map((t) => ({
      poste_id: Number(t.poste),
      jour: t.jour,
      debut: heureMurale(lundi, t.debut),
      fin: heureMurale(lundi, t.fin),
    })),
    stats: {
      places: besoins.reduce((t, b) => t + b.effectif, 0),
      pourvues: besoins.reduce(
        (t, b) => t + Math.min(pourvus.get(b.id) ?? 0, b.effectif),
        0,
      ),
      places_jour: [0, 1, 2, 3, 4, 5, 6].map((j) =>
        besoins.filter((b) => b.jour === j).reduce((t, b) => t + b.effectif, 0),
      ),
      pourvues_jour: [0, 1, 2, 3, 4, 5, 6].map((j) =>
        besoins
          .filter((b) => b.jour === j)
          .reduce(
            (t, b) => t + Math.min(pourvus.get(b.id) ?? 0, b.effectif),
            0,
          ),
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
}

/** Un shift à poser (non validé), au format de `planning_appliquer_generation`. */
export interface NouveauShift {
  salarie_id: number
  poste_id: number
  jour: number
  horaire_id: number | null
  debut: string
  fin: string
  court: boolean
  pause: number
  /** Remplaçant seulement : le code imposé par le besoin dont il tient la
   * place (« M6 au lieu de M3 »). Absent pour un shift au code du besoin.
   * Information de l'écran : `planning_appliquer_generation` lit ses clés
   * une à une et ignore celle-ci ; l'analyse la retrouve
   * (`correspondances`, `ShiftOut.code_demande`). */
  code_demande?: number
}

export interface Generation {
  probleme: Probleme
  /** Ce qu'il faut faire du résultat du solveur. */
  traduire: (r: Resultat) => NouveauShift[]
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
  const d2: DonneesSemaine = { ...d, affectations: restants }
  const ctx = contexte(d2)
  const { valides: besoins } = besoinsValides(ctx)
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
  salaries = avecSemainesVoisines(d2, ctx, salaries)
  const groupes = new Map<number, Array<{ x: Salarie; minutes: number }>>()
  for (const x of ctx.staff) {
    const sol = salaries.get(x.id)
    const groupe = posteEquite(x)
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
        equiteAvant: faits.get(x.id)!,
      })
  }
  const corr = correspondances(ctx, besoins, salaries)
  const { lien, demande } = corr
  // Un soutien rattaché par cycle reste un shift posé à part (son créneau
  // `a…`, ses vraies heures) : les remplaçants n'ont pas de place de soutien
  // (contrat de la vague 1, §2), et le poser sur `b…` lui donnerait les
  // heures du code imposé.
  const enSoutien = new Map(
    [...corr.soutien].filter(([aId]) => !demande.has(aId)),
  )
  const deja = new Map<number, number>()
  const dejaSoutien = new Map<number, number>()
  for (const id of lien.values()) deja.set(id, (deja.get(id) ?? 0) + 1)
  for (const id of enSoutien.values())
    dejaSoutien.set(id, (dejaSoutien.get(id) ?? 0) + 1)

  const creneaux: Creneau[] = besoins.map((b) =>
    creneauBesoin(
      ctx,
      b,
      Math.max(b.soutien, dejaSoutien.get(b.id) ?? 0),
      Math.max(b.renfort, (deja.get(b.id) ?? 0) - b.effectif),
    ),
  )
  // Remplaçants (`r<besoin>-<code>`, étape 4) : pour une place encore
  // ouverte, chaque autre code du même cycle ; pour une place pleine, aucun,
  // sauf celui qui porte un shift posé rattaché par cycle (il y est imposé,
  // avec ses vraies heures de code).
  const remplacants = new Map<string, { b: Besoin; h: Horaire }>()
  const ajouteRemplacant = (b: Besoin, h: Horaire) => {
    const id = idRemplacant(b.id, h.id)
    if (remplacants.has(id)) return
    remplacants.set(id, { b, h })
    creneaux.push(creneauRemplacant(ctx, b, h))
  }
  const parBesoin = new Map(besoins.map((b) => [b.id, b]))
  for (const a of ctx.affectations) {
    const bId = lien.get(a.id)
    const h = a.horaire_id !== null ? ctx.horaires.get(a.horaire_id) : undefined
    if (bId === undefined || !demande.has(a.id) || !h) continue
    ajouteRemplacant(parBesoin.get(bId) as Besoin, h)
  }
  for (const b of besoins) {
    if ((deja.get(b.id) ?? 0) >= b.effectif + b.renfort) continue
    for (const h of remplacantsDe(ctx, b)) ajouteRemplacant(b, h)
  }
  const rattache = new Map([...lien, ...enSoutien])
  for (const a of ctx.affectations) {
    if (!rattache.has(a.id)) creneaux.push(creneauAffectation(ctx, a))
  }
  const creneauDe = (a: Affectation) => {
    const bId = rattache.get(a.id)
    if (bId === undefined) return `a${a.id}`
    return demande.has(a.id) && a.horaire_id !== null
      ? idRemplacant(bId, a.horaire_id)
      : `b${bId}`
  }
  const paire = (a: Affectation) => cle(String(a.salarie_id), creneauDe(a))
  const imposees = new Set(ctx.affectations.map(paire))
  const courtes = new Set(
    ctx.affectations.filter((a) => a.court && rattache.has(a.id)).map(paire),
  )
  const p = probleme({
    salaries: [...salaries.values()],
    creneaux,
    // Graine propre à la semaine et à l'historique : les repos « libres »
    // changent d'une semaine à l'autre, deux « Compléter » ne tirent pas
    // le même hasard.
    graine:
      (versJour(lundi) * 100 + (o.graine ?? 0) + empreinte(aEviter)) >>> 0,
    imposees,
    courtes,
    aEviter,
    consignes: ctx.consignes.map((c) => ({
      jour: c.jour,
      periode: c.periode,
      minimum: c.minimum,
      maximum: c.maximum,
    })),
    tempsMaxSecondes: o.tempsMaxSecondes ?? 10,
  })
  const parId = new Map(besoins.map((b) => [`b${b.id}`, b]))
  const traduire = (r: Resultat): NouveauShift[] => {
    const nouveaux: NouveauShift[] = []
    for (const a of r.affectations) {
      if (imposees.has(cle(a.salarieId, a.creneauId))) continue
      const rempl = remplacants.get(a.creneauId)
      if (rempl) {
        // Un remplaçant : le code réel sur le poste et le jour du besoin.
        const { b, h } = rempl
        nouveaux.push({
          salarie_id: Number(a.salarieId),
          poste_id: b.poste_id,
          jour: b.jour,
          horaire_id: h.id,
          ...horaireDe(h, a.court),
          court: a.court,
          pause: h.pause,
          code_demande: b.horaire_id as number,
        })
        continue
      }
      const b = parId.get(a.creneauId)
      if (!b) continue
      const h =
        b.horaire_id !== null ? ctx.horaires.get(b.horaire_id) : undefined
      const { debut, fin } = h
        ? horaireDe(h, a.court)
        : { debut: b.debut, fin: b.fin }
      nouveaux.push({
        salarie_id: Number(a.salarieId),
        poste_id: b.poste_id,
        jour: b.jour,
        horaire_id: b.horaire_id,
        debut,
        fin,
        court: a.court,
        pause: h ? h.pause : 0,
      })
    }
    return nouveaux
  }
  return { probleme: p, traduire, depuis }
}

/** Personnes à jours fixes à poser d'avance (prototype `poser_fixes`) :
 * actives, à jours fixes, sans aucun shift cette semaine, sous contrat. */
export function aPoserFixes(
  d: DonneesSemaine,
  aujourdhui: string,
): Set<number> {
  const lundi = lundiDe(d.lundi)
  if (lundi < lundiDe(aujourdhui) || d.referentiel.verrous.includes(lundi))
    return new Set()
  const deja = new Set(d.affectations.map((a) => a.salarie_id))
  return new Set(
    d.referentiel.salaries
      .filter(
        (x) =>
          x.actif &&
          aJoursFixes(x) &&
          !deja.has(x.id) &&
          joursHorsContrat(x, lundi).size < 7,
      )
      .map((x) => x.id),
  )
}

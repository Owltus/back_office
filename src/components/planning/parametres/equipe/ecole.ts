/*
 * Calendrier d'école d'un apprenti ou d'un stagiaire, pur. Les jours d'école
 * sont des jours d'absence du motif école, JOUR PAR JOUR : une période peut
 * être une semaine entière, deux jours, un samedi d'examen. Rien ne suppose
 * un rythme régulier (décision utilisateur du 2026-10-27 : « pas toujours
 * une semaine sur deux, plus complexe et pas toujours stable »).
 *
 * Le calendrier se saisit au jour, à la semaine (du lundi au vendredi), ou en
 * collant les dates du document du CFA (`lireDatesCfa`) : la version collée
 * fait foi sur ce qu'elle couvre, le reste ne change pas.
 */

import {
  joursDesPeriodes,
  JOUR_LIBRE,
  nouvelleCle,
  periodeLisible,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import type { PeriodeBrouillon } from '#/components/planning/parametres/equipe/brouillon.ts'
import { enPeriodes } from '#/lib/planning/affichage.ts'
import {
  ajouterJours,
  ecartJours,
  jourDeLaSemaine,
  lundiDe,
} from '#/lib/planning/temps.ts'
import type { Affectation, JourType } from '#/lib/planning/types.ts'

// ------------------------------------------------------------ année scolaire

/** Année scolaire qui contient `iso` : du 1er septembre au 31 août. */
export function anneeScolaire(iso: string): { debut: string; fin: string } {
  const a = Number(iso.slice(0, 4))
  const depart = Number(iso.slice(5, 7)) >= 9 ? a : a - 1
  return { debut: `${depart}-09-01`, fin: `${depart + 1}-08-31` }
}

export interface MoisCalendrier {
  /** « 2026-09 ». */
  mois: string
  /** Lignes du lundi au dimanche ; null hors du mois. */
  semaines: Array<{ lundi: string; jours: Array<string | null> }>
}

/** Les mois de `debut` à `fin` (dates incluses), en grilles lundi → dimanche. */
export function moisEntre(debut: string, fin: string): MoisCalendrier[] {
  const r: MoisCalendrier[] = []
  for (let premier = `${debut.slice(0, 7)}-01`; premier <= fin;) {
    const mois = premier.slice(0, 7)
    const semaines: MoisCalendrier['semaines'] = []
    for (
      let lundi = lundiDe(premier);
      lundi.slice(0, 7) <= mois;
      lundi = ajouterJours(lundi, 7)
    ) {
      semaines.push({
        lundi,
        jours: Array.from({ length: 7 }, (_, i) => {
          const j = ajouterJours(lundi, i)
          return j.slice(0, 7) === mois ? j : null
        }),
      })
    }
    r.push({ mois, semaines })
    const a = Number(mois.slice(0, 4))
    const m = Number(mois.slice(5, 7))
    premier =
      m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
  }
  return r
}

// ------------------------------------------------------------------ saisie

/** Du lundi au vendredi. */
export const joursOuvres = (lundi: string) =>
  Array.from({ length: 5 }, (_, i) => ajouterJours(lundi, i))

/** Les jours d'école déjà posés. */
export function joursEcole(
  periodes: PeriodeBrouillon[],
  ecoleId: number,
): Set<string> {
  const r = new Set<string>()
  for (const [jour, motif] of joursDesPeriodes(
    periodes.filter((p) => p.motif_id === ecoleId),
  )) {
    if (motif === ecoleId) r.add(jour)
  }
  return r
}

export type EtatSemaine = 'ecole' | 'partielle' | ''

export function etatSemaine(jours: Set<string>, lundi: string): EtatSemaine {
  const n = joursOuvres(lundi).filter((j) => jours.has(j)).length
  return n === 5 ? 'ecole' : n > 0 ? 'partielle' : ''
}

/** Pose (`ecole` vrai) ou retire l'école sur ces jours, sauf ceux qu'on ne
 * peut pas changer (semaine verrouillée). */
export function peindre(
  jours: Set<string>,
  cibles: Iterable<string>,
  ecole: boolean,
  modifiable: (jour: string) => boolean = () => true,
): Set<string> {
  const suite = new Set(jours)
  for (const j of cibles) {
    if (!modifiable(j)) continue
    if (ecole) suite.add(j)
    else suite.delete(j)
  }
  return suite
}

/** Un clic sur une semaine : la remplit du lundi au vendredi, ou la vide si
 * elle l'était déjà (le samedi et le dimanche ne bougent pas). */
export function basculerSemaine(
  jours: Set<string>,
  lundi: string,
  modifiable?: (jour: string) => boolean,
): Set<string> {
  return peindre(
    jours,
    joursOuvres(lundi),
    etatSemaine(jours, lundi) !== 'ecole',
    modifiable,
  )
}

/** Les jours de `a` à `b`, dans un sens ou dans l'autre (glisser). */
export function plage(a: string, b: string): string[] {
  const [debut, fin] = a <= b ? [a, b] : [b, a]
  return Array.from({ length: ecartJours(debut, fin) + 1 }, (_, i) =>
    ajouterJours(debut, i),
  )
}

/** Les périodes de la fiche avec ces jours d'école ; les périodes illisibles
 * (en cours de saisie) restent telles quelles avec les autres absences. */
export function avecJoursEcole(
  periodes: PeriodeBrouillon[],
  ecoleId: number,
  jours: Set<string>,
): PeriodeBrouillon[] {
  const autres = periodes.filter(
    (p) => p.motif_id !== ecoleId || !periodeLisible(p),
  )
  const ecole = enPeriodes(
    [...jours].map((jour) => ({ jour, motif_id: ecoleId })),
  ).map((p) => ({
    cle: nouvelleCle(),
    debut: p.debut,
    fin: p.fin,
    motif_id: ecoleId,
  }))
  return [...autres, ...ecole]
}

// ------------------------------------------------------------------ lecture

/** Périodes d'école lisibles : des jours qui se suivent, un week-end sans
 * école ne coupant pas (« du lundi 16 au vendredi 27 novembre »). */
export function periodesEcole(
  jours: Iterable<string>,
): Array<{ debut: string; fin: string; jours: number }> {
  const r: Array<{ debut: string; fin: string; jours: number }> = []
  for (const j of [...jours].sort()) {
    const d = r.at(-1)
    const saut = d ? ecartJours(d.fin, j) : 0
    // Seuls un samedi et un dimanche libres peuvent séparer deux jours.
    const suit =
      d !== undefined &&
      (saut === 1 ||
        (saut === 2 && [4, 5].includes(jourDeLaSemaine(d.fin))) ||
        (saut === 3 && jourDeLaSemaine(d.fin) === 4))
    if (d && suit) {
      d.fin = j
      d.jours++
    } else r.push({ debut: j, fin: j, jours: 1 })
  }
  return r
}

/** La période d'école en cours ou la prochaine. */
export function prochainePeriode(jours: Iterable<string>, aujourdhui: string) {
  return periodesEcole(jours).find((p) => p.fin >= aujourdhui) ?? null
}

// ------------------------------------------------- dates du document du CFA

const MOIS_NOMS: Array<[RegExp, number]> = [
  [/^janv/, 1],
  [/^f[eé]v/, 2],
  [/^mars/, 3],
  [/^avr/, 4],
  [/^mai/, 5],
  [/^juin/, 6],
  [/^juil/, 7],
  [/^ao[uû]/, 8],
  [/^sept/, 9],
  [/^oct/, 10],
  [/^nov/, 11],
  [/^d[eé]c/, 12],
]

const JOUR_NOM =
  '(?:lun(?:di)?|mar(?:di)?|mer(?:credi)?|jeu(?:di)?|ven(?:dredi)?|sam(?:edi)?|dim(?:anche)?)\\.?'

// « 28/09 », « 28/09/26 », « 28.09.2026 », « 28-09-2026 », « 28 sept. 2026 »,
// « 1er octobre ».
const DATE = new RegExp(
  // L'année est collée à la date : « 28/09 - 02/10 » n'est pas l'an 2002.
  '(?<![\\d/.])(\\d{1,2})(?:er)?(?:[/.-](\\d{1,2})(?:[/.-](\\d{4}|\\d{2})(?![\\d/.]))?(?![\\d/])' +
    '|\\s+([a-zéèêûô]{3,9})\\.?(?:\\s+(\\d{4}))?)',
  'giu',
)

// Ce qui peut séparer les deux dates d'une période.
const ENTRE = new RegExp(
  `^[\\s,]*(?:au|à|a|jusqu'?(?:au|à)|->|→|>|-|–|—)\\s*(?:${JOUR_NOM}\\s*)?$`,
  'iu',
)

// Lignes qui décrivent le temps en entreprise, pas l'école.
const HORS_ECOLE = /entreprise|h[oô]tel|stage en|vacances|cong[eé]s?\b/iu

export interface DatesCfa {
  /** Jours d'école lus. */
  jours: Set<string>
  /** Du premier au dernier jour lu : la partie du calendrier que le
   * document couvre. */
  debut: string | null
  fin: string | null
  /** Lignes qui contiennent des chiffres mais aucune date lisible. */
  illisibles: string[]
  /** Lignes écartées parce qu'elles parlent de l'entreprise ou de vacances. */
  ignorees: string[]
}

interface DateLue {
  jour: number
  mois: number
  annee: number | null
  index: number
  fin: number
}

function moisNomme(nom: string): number | null {
  const n = nom.toLowerCase()
  return MOIS_NOMS.find(([re]) => re.test(n))?.[1] ?? null
}

function datesDeLaLigne(ligne: string): DateLue[] {
  const r: DateLue[] = []
  for (const m of ligne.matchAll(DATE)) {
    const jour = Number(m[1])
    const mois = m[2] ? Number(m[2]) : m[4] ? moisNomme(m[4]) : null
    const brute = (m[3] as string | undefined) ?? m[5]
    if (mois === null || mois < 1 || mois > 12 || jour < 1 || jour > 31)
      continue
    const annee = brute
      ? brute.length === 2
        ? 2000 + Number(brute)
        : Number(brute)
      : null
    r.push({ jour, mois, annee, index: m.index, fin: m.index + m[0].length })
  }
  return r
}

const iso = (a: number, m: number, j: number) =>
  `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`

/** Date réelle, ou null (« 31/02 »). */
function dateValide(a: number, m: number, j: number): string | null {
  const d = iso(a, m, j)
  return ajouterJours(d, 0) === d ? d : null
}

/** Année d'une date sans année : la première occurrence qui ne tombe pas
 * plus de deux mois avant aujourd'hui (un calendrier se colle pour l'année
 * en cours ou la suivante). */
function avecAnnee(d: DateLue, aujourdhui: string): string | null {
  if (d.annee !== null) return dateValide(d.annee, d.mois, d.jour)
  const plancher = ajouterJours(aujourdhui, -60)
  const a = Number(aujourdhui.slice(0, 4))
  for (const annee of [a - 1, a, a + 1, a + 2]) {
    const v = dateValide(annee, d.mois, d.jour)
    if (v && v >= plancher) return v
  }
  return null
}

/** Jours d'école d'une période « du … au … » : du lundi au vendredi ; un
 * samedi ou un dimanche seulement s'il est écrit (début ou fin). */
function joursDePeriode(debut: string, fin: string): string[] {
  return plage(debut, fin).filter(
    (j) => jourDeLaSemaine(j) < 5 || j === debut || j === fin,
  )
}

/**
 * Lit les dates collées depuis le document du CFA : une période ou un jour
 * par ligne, dans les formes courantes (« du 28/09 au 02/10/2026 »,
 * « 28/09/2026 - 02/10/2026 », « lundi 5 octobre », « 12/12 »). Une ligne qui
 * parle de l'entreprise ou des vacances est écartée.
 */
export function lireDatesCfa(texte: string, aujourdhui: string): DatesCfa {
  const jours = new Set<string>()
  const illisibles: string[] = []
  const ignorees: string[] = []
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trim()
    if (!ligne) continue
    const dates = datesDeLaLigne(ligne)
    if (!dates.length) {
      if (/\d/.test(ligne)) illisibles.push(ligne)
      continue
    }
    if (HORS_ECOLE.test(ligne)) {
      ignorees.push(ligne)
      continue
    }
    // Une année écrite sur la date de fin vaut pour celle du début.
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i]
      const suivante = dates.at(i + 1)
      const relie =
        suivante !== undefined && ENTRE.test(ligne.slice(d.fin, suivante.index))
      if (!relie) {
        const v = avecAnnee(d, aujourdhui)
        if (v) jours.add(v)
        else illisibles.push(ligne)
        continue
      }
      const fin = avecAnnee(suivante, aujourdhui)
      let debut =
        d.annee === null && suivante.annee !== null
          ? dateValide(suivante.annee, d.mois, d.jour)
          : avecAnnee(d, aujourdhui)
      // « du 21/12 au 08/01/2027 » : le début est de l'année d'avant.
      if (debut && fin && debut > fin && d.annee === null)
        debut = dateValide(Number(fin.slice(0, 4)) - 1, d.mois, d.jour)
      if (!debut || !fin || debut > fin || ecartJours(debut, fin) > 120) {
        illisibles.push(ligne)
      } else {
        for (const j of joursDePeriode(debut, fin)) jours.add(j)
      }
      i++
    }
  }
  const tries = [...jours].sort()
  return {
    jours,
    debut: tries.at(0) ?? null,
    fin: tries.at(-1) ?? null,
    illisibles,
    ignorees,
  }
}

/** Le calendrier avec les dates du CFA : elles font foi du premier au
 * dernier jour lu (un jour de cette plage qui n'y est pas repasse à
 * l'hôtel) ; avant et après, rien ne change. Les jours qu'on ne peut pas
 * changer (semaine verrouillée) restent tels quels. */
export function appliquerCfa(
  jours: Set<string>,
  lus: DatesCfa,
  modifiable: (jour: string) => boolean = () => true,
): { suite: Set<string>; ajoutes: string[]; retires: string[] } {
  const suite = new Set(jours)
  if (lus.debut === null || lus.fin === null)
    return { suite, ajoutes: [], retires: [] }
  const ajoutes: string[] = []
  const retires: string[] = []
  for (const j of plage(lus.debut, lus.fin)) {
    if (!modifiable(j)) continue
    const voulu = lus.jours.has(j)
    if (voulu && !suite.has(j)) {
      suite.add(j)
      ajoutes.push(j)
    } else if (!voulu && suite.has(j)) {
      suite.delete(j)
      retires.push(j)
    }
  }
  return { suite, ajoutes, retires }
}

// ---------------------------------------------- shifts touchés par l'école

/** Date d'un shift. */
export const dateShift = (a: Pick<Affectation, 'lundi' | 'jour'>) =>
  ajouterJours(a.lundi, a.jour)

/** Les shifts posés sur un jour qui devient un jour d'école : la base les
 * retirera à l'enregistrement (un jour d'absence retire le shift). */
export function shiftsSurEcole<T extends Pick<Affectation, 'lundi' | 'jour'>>(
  shifts: T[],
  avant: Set<string>,
  apres: Set<string>,
): T[] {
  return shifts
    .filter((s) => {
      const d = dateShift(s)
      return apres.has(d) && !avant.has(d)
    })
    .sort((a, b) => (dateShift(a) < dateShift(b) ? -1 : 1))
}

// ------------------------------------------------------------------ textes

const LONG = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
/** « mar. 17 nov. 2026 ». */
export const dateLongue = (jour: string) =>
  LONG.format(new Date(`${jour}T12:00:00Z`))

export function periodeTexte(p: { debut: string; fin: string }): string {
  return p.debut === p.fin
    ? `le ${dateLongue(p.debut)}`
    : `du ${dateLongue(p.debut)} au ${dateLongue(p.fin)}`
}

/** Suite du message d'enregistrement : les shifts qu'un jour d'absence ou
 * d'école vient de retirer (vide s'il n'y en a pas). */
export function messageShiftsRetires(
  retires: Array<Pick<Affectation, 'lundi' | 'jour'>>,
): string {
  if (!retires.length) return ''
  const dates = [...new Set(retires.map(dateShift))].sort()
  const liste = dates.slice(0, 4).map(dateLongue).join(', ')
  const reste = dates.length > 4 ? ` et ${dates.length - 4} autres jours` : ''
  return retires.length > 1
    ? ` ${retires.length} shifts sont retirés pour son absence ou son école : ${liste}${reste}. Ces jours sont à compléter dans le planning.`
    : ` 1 shift est retiré pour son absence ou son école : ${liste}. Ce jour est à compléter dans le planning.`
}

// ------------------------------------------------------------ semaine type

/** École ce jour-là, toutes les semaines (semaine type). */
export const ecoleFixe = (semaine: JourType[], j: number, ecoleId: number) =>
  semaine[j]?.mode === 'absence' && semaine[j]?.type_absence_id === ecoleId

export function basculerJourEcole(
  semaine: JourType[],
  j: number,
  ecoleId: number,
): JourType[] {
  return semaine.map((e, i) =>
    i !== j
      ? e
      : ecoleFixe(semaine, j, ecoleId)
        ? { ...JOUR_LIBRE }
        : { mode: 'absence', type_shift_id: null, type_absence_id: ecoleId },
  )
}

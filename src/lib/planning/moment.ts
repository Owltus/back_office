/*
 * Les MOMENTS de la journée (2026-11-06, lot 2, A6) : la liste de
 * l'établissement (`planning_moments`), jamais un nom écrit dans le code.
 * Le moment d'un horaire se DÉDUIT de ses heures (décision du 2026-11-05),
 * par les conditions de chaque moment (`momentPropose`). Le reste du moteur
 * ne lit que trois cases :
 *   - `compte_dans_tableau` : le moment a un chiffre au tableau de l'accueil
 *     (à l'hôtel : matin, soir, nuit ; pas le middle) ;
 *   - `est_nuit` : la seule notion de la loi (mineurs, nuits d'affilée,
 *     reprise après des nuits) et de la passation avec le veilleur ;
 *   - `ordre` : le rang dans la journée. Les moments de JOUR du tableau, dans
 *     cet ordre, donnent le premier (qui ouvre, à l'hôtel le matin) et le
 *     dernier (qui passe la main à la nuit, à l'hôtel le soir).
 */

import { heuresLisibles, minutes } from '#/lib/planning/temps.ts'
import type {
  ArticleMoment,
  Horaire,
  Moment,
  Periode,
} from '#/lib/planning/types.ts'

const H = 60

/** Les moments d'un établissement, rangés par `ordre` (puis id). */
export interface Moments {
  liste: readonly Moment[]
}

/** Les moments de l'hôtel d'aujourd'hui, limite pour limite (mêmes lignes
 * que la migration 20261106120000) : nuit (commence à 21 h ou plus tard,
 * ou avant 5 h), soir (finit à 21 h ou plus tard, après minuit, ou
 * commence à 15 h ou plus tard), matin (commence avant 9 h et finit à
 * 17 h 45 au plus tard), middle (le reste, hors du tableau). Un horaire
 * libre sans fin : matin s'il commence avant 12 h 30, sinon soir. */
export const MOMENTS_PAR_DEFAUT: readonly Moment[] = [
  {
    id: 'matin',
    nom: 'Matin',
    ordre: 1,
    priorite: 3,
    debut_de: null,
    debut_a: 9 * H,
    fin_de: null,
    fin_a: 17 * H + 45,
    toutes: true,
    libre_avant: 12 * H + 30,
    compte_dans_tableau: true,
    est_nuit: false,
    couleur: null,
  },
  {
    id: 'middle',
    nom: 'Middle',
    ordre: 2,
    priorite: 4,
    debut_de: null,
    debut_a: null,
    fin_de: null,
    fin_a: null,
    toutes: true,
    libre_avant: null,
    compte_dans_tableau: false,
    est_nuit: false,
    couleur: null,
  },
  {
    id: 'soir',
    nom: 'Soir',
    ordre: 3,
    priorite: 2,
    debut_de: 15 * H,
    debut_a: null,
    fin_de: 21 * H,
    fin_a: null,
    toutes: false,
    libre_avant: null,
    compte_dans_tableau: true,
    est_nuit: false,
    couleur: null,
  },
  {
    id: 'nuit',
    nom: 'Nuit',
    ordre: 4,
    priorite: 1,
    debut_de: 21 * H,
    debut_a: 5 * H,
    fin_de: null,
    fin_a: null,
    toutes: false,
    libre_avant: null,
    compte_dans_tableau: true,
    est_nuit: true,
    couleur: null,
  },
]

const parOrdre = (a: Moment, b: Moment) =>
  a.ordre - b.ordre || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const parPriorite = (a: Moment, b: Moment) =>
  a.priorite - b.priorite || parOrdre(a, b)

/** Les moments d'une liste de la base (ou de test), rangés ; vide : ceux de
 * l'hôtel. */
export function lireMoments(lignes?: readonly Moment[] | null): Moments {
  if (!lignes?.length) return MOMENTS_HOTEL
  return { liste: [...lignes].sort(parOrdre) }
}

export const MOMENTS_HOTEL: Moments = {
  liste: [...MOMENTS_PAR_DEFAUT].sort(parOrdre),
}

// Classements mis en cache par liste (la liste ne change pas pendant un
// calcul ; un réglage modifié en fabrique une autre).
const caches = new WeakMap<readonly Moment[], Cache>()
interface Cache {
  priorite: Moment[]
  tableau: string[]
  jour: string[]
  nuits: Set<string>
  rang: Map<string, number>
  rangTableau: Map<string, number>
  parId: Map<string, Moment>
}
function cache(l: Moments): Cache {
  let c = caches.get(l.liste)
  if (!c) {
    const tableau = l.liste.filter((m) => m.compte_dans_tableau)
    c = {
      priorite: [...l.liste].sort(parPriorite),
      tableau: tableau.map((m) => m.id),
      jour: tableau.filter((m) => !m.est_nuit).map((m) => m.id),
      nuits: new Set(l.liste.filter((m) => m.est_nuit).map((m) => m.id)),
      rang: new Map(l.liste.map((m, i) => [m.id, i])),
      rangTableau: new Map(tableau.map((m, i) => [m.id, i])),
      parId: new Map(l.liste.map((m) => [m.id, m])),
    }
    caches.set(l.liste, c)
  }
  return c
}

/** Le début `debut` (minutes du jour) est-il dans la plage de début du
 * moment ? Une plage qui finit plus tôt qu'elle ne commence passe minuit. */
function debutDans(m: Moment, debut: number): boolean {
  const de = m.debut_de ?? 0
  const a = m.debut_a ?? Infinity
  return de <= a ? debut >= de && debut < a : debut >= de || debut < a
}

/** Les conditions du moment tiennent-elles ? Null : il n'en a aucune (le
 * reste). */
function tient(m: Moment, debut: number, fin: number): boolean | null {
  const surDebut = m.debut_de !== null || m.debut_a !== null
  const surFin = m.fin_de !== null || m.fin_a !== null
  if (!surDebut && !surFin) return null
  const finReelle = fin <= debut ? fin + 24 * H : fin
  const r: boolean[] = []
  if (surDebut) r.push(debutDans(m, debut))
  if (surFin)
    r.push(
      (m.fin_de === null || finReelle >= m.fin_de) &&
        (m.fin_a === null || finReelle <= m.fin_a),
    )
  return m.toutes ? r.every(Boolean) : r.some(Boolean)
}

/**
 * Moment d'un horaire, CALCULÉ d'après ses heures (décision d'une
 * responsable du 2026-11-05 : « que les notions de matin, nuit soient
 * abstraites, que le moteur se concentre sur les horaires »). Les moments
 * sont essayés par priorité ; le premier dont les conditions tiennent
 * l'emporte ; sinon le premier moment sans condition, sinon le dernier
 * essayé. Aux moments de l'hôtel, les 35 horaires réels retrouvent leur
 * moment (`moment.test.ts`).
 */
export function momentPropose(
  h: Pick<Horaire, 'debut' | 'fin' | 'pause'>,
  l: Moments = MOMENTS_HOTEL,
): Periode {
  const c = cache(l)
  const debut = minutes(h.debut)
  const fin = minutes(h.fin)
  let reste: Moment | null = null
  for (const m of c.priorite) {
    const t = tient(m, debut, fin)
    if (t === null) reste ??= m
    else if (t) return m.id
  }
  return (reste ?? c.priorite[c.priorite.length - 1]).id
}

/** L'horaire avec son moment recalculé d'après ses heures (lecture de la
 * base, enregistrement) : un moment ancien ne survit pas. */
export function avecMomentCalcule<
  T extends Pick<Horaire, 'debut' | 'fin' | 'pause' | 'periode'>,
>(h: T, l: Moments = MOMENTS_HOTEL): T {
  const periode = momentPropose(h, l)

  return h.periode === periode ? h : { ...h, periode }
}

/** Moment d'un horaire libre sans fin connue, d'après son heure de début :
 * une nuit dont la plage de début le contient, sinon le premier moment de
 * jour du tableau dont `libre_avant` est plus tard, sinon le dernier moment
 * de jour du tableau. */
export function momentDuDebut(debut: string, l: Moments = MOMENTS_HOTEL) {
  const c = cache(l)
  const m = minutes(debut)
  for (const n of c.priorite) {
    if (!n.est_nuit || (n.debut_de === null && n.debut_a === null)) continue
    if (debutDans(n, m)) return n.id
  }
  for (const id of c.jour) {
    const j = c.parId.get(id) as Moment
    if (j.libre_avant !== null && m < j.libre_avant) return id
  }
  return c.jour.at(-1) ?? c.tableau.at(0) ?? l.liste[0].id
}

/** Le moment est-il la nuit ? */
export const estNuit = (l: Moments, id: Periode | null | undefined) =>
  id != null && cache(l).nuits.has(id)

/** Le moment compte-t-il au tableau de l'accueil ? */
export const auTableau = (l: Moments, id: Periode | null | undefined) =>
  id != null && cache(l).rangTableau.has(id)

/** Un moment de JOUR du tableau (ni nuit, ni hors tableau). */
export const deJourAuTableau = (l: Moments, id: Periode | null | undefined) =>
  auTableau(l, id) && !estNuit(l, id)

/** Un moment hors du tableau qui n'est pas la nuit (à l'hôtel : le middle,
 * « un coup de main »). */
export const coupDeMain = (l: Moments, id: Periode | null | undefined) =>
  id != null && cache(l).parId.has(id) && !auTableau(l, id) && !estNuit(l, id)

/** Les moments du tableau, dans l'ordre de la journée. */
export const momentsDuTableau = (l: Moments): readonly string[] =>
  cache(l).tableau

/** Les moments de jour du tableau, dans l'ordre (à l'hôtel : matin, soir). */
export const momentsDeJour = (l: Moments): readonly string[] => cache(l).jour

/** Les moments de nuit du tableau, dans l'ordre. */
export const nuitsDuTableau = (l: Moments): string[] =>
  cache(l).tableau.filter((id) => cache(l).nuits.has(id))

/** Le premier moment de jour du tableau (à l'hôtel : le matin), null s'il
 * n'y en a pas. */
export const premierMoment = (l: Moments): string | null =>
  cache(l).jour[0] ?? null

/** Le dernier moment de jour du tableau (à l'hôtel : le soir). */
export const dernierMoment = (l: Moments): string | null => {
  const j = cache(l).jour
  return j.length ? j[j.length - 1] : null
}

/** Nombre de moments du tableau (un chiffre par jour et par moment). */
export const tailleTableau = (l: Moments) => cache(l).tableau.length

/** Rang au tableau (0..n-1), -1 s'il n'y est pas. */
export const rangAuTableau = (l: Moments, id: Periode) =>
  cache(l).rangTableau.get(id) ?? -1

/** Rang dans la journée (ordre de la liste), -1 inconnu. */
export const rangMoment = (l: Moments, id: Periode) =>
  cache(l).rang.get(id) ?? -1

/** Le moment, ou undefined. */
export const momentDe = (l: Moments, id: Periode | null | undefined) =>
  id == null ? undefined : cache(l).parId.get(id)

/** Les conditions d'un moment en clair : « il commence à 21:00 ou plus
 * tard, ou avant 05:00 », « le reste ». */
export function conditionsEnClair(
  m: Moment,
  h: (minutes: number) => string = heuresLisibles,
): string {
  const parties: string[] = []
  const { debut_de: dd, debut_a: da, fin_de: fd, fin_a: fa } = m
  if (dd !== null && da !== null)
    parties.push(
      dd > da
        ? `il commence à ${h(dd)} ou plus tard, ou avant ${h(da)}`
        : `il commence entre ${h(dd)} et ${h(da)}`,
    )
  else if (dd !== null) parties.push(`il commence à ${h(dd)} ou plus tard`)
  else if (da !== null) parties.push(`il commence avant ${h(da)}`)
  if (fd !== null && fa !== null)
    parties.push(`il finit entre ${h(fd)} et ${h(fa)}`)
  else if (fd !== null)
    parties.push(`il finit à ${h(fd)} ou plus tard, ou après minuit`)
  else if (fa !== null) parties.push(`il finit à ${h(fa)} au plus tard`)
  if (!parties.length) return 'le reste'
  return parties.join(m.toutes ? ' et ' : ', ou ')
}

/** L'article d'un moment : celui réglé, sinon « la » pour la nuit et « le »
 * pour le reste (l'ancienne règle, les moments de l'hôtel). */
export const articleMoment = (l: Moments, p: Periode): ArticleMoment =>
  momentDe(l, p)?.article ?? (estNuit(l, p) ? 'la' : 'le')

/** « le matin », « la nuit », « l'après-midi » (dans une phrase). */
export const leMoment = (l: Moments, p: Periode) => {
  const a = articleMoment(l, p)
  return `${a === "l'" ? a : `${a} `}${motMoment(l, p)}`
}

/** Les moments de l'établissement d'un problème (ou de ses règles) ;
 * absents : ceux de l'hôtel. */
export const momentsDe = (p: {
  regles?: { moments: Moments } | null
}): Moments => p.regles?.moments ?? MOMENTS_HOTEL

/** Les paires de moments de jour du tableau qui se suivent (à l'hôtel, une
 * seule : le matin puis le soir). */
export function pairesDeJour(l: Moments): Array<[string, string]> {
  const j = momentsDeJour(l)
  const r: Array<[string, string]> = []
  for (let i = 1; i < j.length; i++) r.push([j[i - 1], j[i]])
  return r
}

/** Nom d'un moment pour une phrase (« matin », « nuit ») ; son id s'il est
 * inconnu. */
export const motMoment = (l: Moments, id: Periode) =>
  (momentDe(l, id)?.nom ?? id).toLocaleLowerCase('fr-FR')

// ------------------------------------------- l'accueil, lu de la même façon

/** Le créneau n'a que ce moment (un matin pur, un soir pur). */
export const estPur = (
  c: { presence: readonly string[] },
  moment: string,
): boolean => c.presence.length === 1 && c.presence[0] === moment

/** Les postes de l'accueil tenus de jour : ceux d'un créneau de l'accueil qui
 * ne touche aucun moment de nuit. */
export function postesDeJour(
  creneaux: ReadonlyArray<{
    accueil?: boolean
    poste: string
    presence: readonly string[]
  }>,
  l: Moments,
): Set<string> {
  return new Set(
    creneaux
      .filter((c) => c.accueil && !c.presence.some((q) => estNuit(l, q)))
      .map((c) => c.poste),
  )
}

/** Ce moment est demandé ce jour-là : une consigne avec un minimum. */
export function momentDemande(
  consignes: ReadonlyArray<{
    jour: number
    periode: string | null
    minimum: number
  }>,
  jour: number,
  periode: string,
): boolean {
  return consignes.some(
    (k) => k.jour === jour && k.periode === periode && k.minimum > 0,
  )
}

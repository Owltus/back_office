/*
 * Consignes de présence (demande utilisateur du 2026-10-27) : « lundi, 2 le
 * matin et 2 le soir ; samedi, 3 ou 4 le matin ». Une consigne compte les
 * personnes AUTONOMES (titulaires et dépannage ; pas les profils « soutien »,
 * les apprentis en renfort), selon la période de leur shift
 * (`periodePresence`, seule règle, plan `planning-cycles-2026-10-30`) :
 *
 * - matin, soir : seulement sur un poste qui compte dans la présence
 *   (`Poste.presence`, Réception et Club à l'hôtel) ;
 * - nuit : un code de famille `nuit`, ou un horaire libre qui commence la
 *   nuit (22 h à 5 h), sur un poste qui a au moins un code de nuit
 *   (`nuitComptee`, calculé par l'appelant), que le poste soit coché
 *   « présence » ou non (D15 : la Réception et le Club n'ont pas de code de
 *   nuit, c'est la Veille de nuit qui fait le minimum de nuit) ;
 * - middle : JAMAIS (D11, « il ne compte pas mais il est quand même là » ;
 *   il compte pour les trous entre équipes, ailleurs) ;
 * - court : selon son heure de début, matin ou soir, jamais nuit ;
 * - code sans famille (`periode === null`) : jamais.
 *
 * `periodeShift` (équité du générateur) garde son ancienne règle : middle et
 * court selon l'heure de début.
 */

import { minutes } from '#/lib/planning/temps.ts'
import type {
  Besoin,
  Consigne,
  Horaire,
  PeriodePresence,
  Poste,
} from '#/lib/planning/types.ts'

/** Ordre d'affichage et de tri des périodes : matin, soir, nuit. */
export const ORDRE_PERIODES: Readonly<Record<PeriodePresence, number>> = {
  matin: 0,
  soir: 1,
  nuit: 2,
}

/** Période d'un horaire libre : nuit de 22 h à 5 h, matin avant 12 h 30. */
export function periodeLibre(debut: string): 'matin' | 'soir' | 'nuit' {
  const m = minutes(debut)
  if (m >= 22 * 60 || m < 5 * 60) return 'nuit'
  return m < 12 * 60 + 30 ? 'matin' : 'soir'
}

/** Période d'un shift pour les consignes, ou null s'il n'y compte pas (voir
 * l'en-tête). `nuitComptee` : le poste a au moins un code de famille nuit
 * (faux par défaut : la nuit ne compte pas). */
export function periodePresence(
  poste: Pick<Poste, 'presence'> | undefined,
  horaire: Pick<Horaire, 'periode'> | undefined,
  debut: string,
  nuitComptee = false,
): PeriodePresence | null {
  const famille = horaire ? horaire.periode : null
  // Middle (D11) et code sans famille : jamais.
  if (horaire && (famille === 'middle' || famille === null)) return null
  const p = !horaire || famille === 'court' ? periodeLibre(debut) : famille
  if (p === 'nuit') {
    // Un court qui commence la nuit ne compte pas (règle d'avant).
    if (famille === 'court') return null
    return nuitComptee ? 'nuit' : null
  }
  if (p !== 'matin' && p !== 'soir') return null
  return poste?.presence ? p : null
}

/** Période d'un shift, sur tout poste : celle de son code, ou son heure de
 * début (sans code, ou code « middle » / « court »). Null : nuit ou code
 * sans période. Sert aux consignes et à l'équité du générateur (D15). */
export function periodeShift(
  horaire: Pick<Horaire, 'periode'> | undefined,
  debut: string,
): 'matin' | 'soir' | null {
  const famille = horaire ? horaire.periode : null
  const p =
    !horaire || famille === 'middle' || famille === 'court'
      ? periodeLibre(debut)
      : famille
  return p === 'matin' || p === 'soir' ? p : null
}

/** Une consigne et ce que le planning en fait. */
export interface PresenceOut {
  jour: number
  periode: PeriodePresence
  compte: number
  minimum: number
  maximum: number | null
  /** < 0 : il manque du monde ; > 0 : du monde en plus ; 0 : conforme. */
  ecart: number
}

export function ecartConsigne(
  compte: number,
  minimum: number,
  maximum: number | null,
): number {
  if (compte < minimum) return compte - minimum
  if (maximum !== null && compte > maximum) return compte - maximum
  return 0
}

/** Bilan des consignes d'une semaine : `presents` = (jour, période) des
 * shifts qui comptent, déjà filtrés par `periodePresence` (middle exclu,
 * nuit possible) ; ce bilan ne fait que compter. */
export function bilanPresence(
  consignes: Consigne[],
  presents: ReadonlyArray<{ jour: number; periode: PeriodePresence }>,
): PresenceOut[] {
  return [...consignes]
    .sort(
      (a, b) =>
        a.jour - b.jour ||
        ORDRE_PERIODES[a.periode] - ORDRE_PERIODES[b.periode],
    )
    .map((c) => {
      const compte = presents.filter(
        (p) => p.jour === c.jour && p.periode === c.periode,
      ).length
      return {
        jour: c.jour,
        periode: c.periode,
        compte,
        minimum: c.minimum,
        maximum: c.maximum,
        ecart: ecartConsigne(compte, c.minimum, c.maximum),
      }
    })
}

/** « 3 », « 3 ou 4 », « 3 à 5 », « au moins 3 ». */
export function libelleConsigne(
  minimum: number,
  maximum: number | null,
): string {
  if (maximum === null) return `au moins ${minimum}`
  if (maximum === minimum) return String(minimum)
  return maximum === minimum + 1
    ? `${minimum} ou ${maximum}`
    : `${minimum} à ${maximum}`
}

/** Clé d'un moment de la semaine type : `5:matin`. */
export const clePresence = (jour: number, periode: PeriodePresence) =>
  `${jour}:${periode}`

/** Somme des personnes nécessaires (`effectif`) des besoins qui comptent dans
 * les consignes, par moment (`clePresence`), même règle que `periodePresence`
 * (middle exclu). `postesAvecNuit` : ids des postes qui ont au moins un code
 * de nuit ; absent, la nuit ne compte pas (comme avant). Seule source de
 * cette somme : contrôle des réglages (`coherence.ts`) et vue Matin et soir. */
export function sommeBesoinsPresence(
  besoins: ReadonlyArray<
    Pick<Besoin, 'poste_id' | 'jour' | 'horaire_id' | 'debut' | 'effectif'>
  >,
  postes: ReadonlyMap<number, Pick<Poste, 'presence'>>,
  horaires: ReadonlyMap<number, Pick<Horaire, 'periode'>>,
  postesAvecNuit?: ReadonlySet<number>,
): Map<string, number> {
  const somme = new Map<string, number>()
  for (const b of besoins) {
    if (b.effectif <= 0) continue
    const periode = periodePresence(
      postes.get(b.poste_id),
      b.horaire_id !== null ? horaires.get(b.horaire_id) : undefined,
      b.debut,
      postesAvecNuit?.has(b.poste_id) ?? false,
    )
    if (!periode) continue
    const cle = clePresence(b.jour, periode)
    somme.set(cle, (somme.get(cle) ?? 0) + b.effectif)
  }
  return somme
}

/*
 * Consignes de présence (demande utilisateur du 2026-10-27) : « lundi, 2 le
 * matin et 2 le soir ; samedi, 3 ou 4 le matin ». Une consigne compte les
 * personnes AUTONOMES (titulaires et dépannage ; pas les profils « soutien »,
 * les apprentis en renfort), selon la période de leur shift
 * (`periodePresence`, seule règle, plan `planning-cycles-2026-10-30`) :
 *
 * - matin, soir : seulement sur un poste qui compte dans la présence
 *   (`Poste.presence`, Réception et Club à l'hôtel) ;
 * - nuit : un horaire de famille `nuit`, ou un horaire libre qui commence la
 *   nuit (21 h à 5 h), sur un poste qui a au moins un horaire de nuit
 *   (`nuitComptee`, calculé par l'appelant), que le poste soit coché
 *   « présence » ou non (D15 : la Réception et le Club n'ont pas de code de
 *   nuit, c'est la Veille de nuit qui fait le minimum de nuit) ;
 * - middle : JAMAIS (D11, « il ne compte pas mais il est quand même là » ;
 *   il compte pour les trous entre équipes, ailleurs) ;
 * - court : selon son heure de début, matin ou soir, jamais nuit ;
 * - horaire sans moment (`periode === null`) : jamais.
 *
 * `periodeShift` (équité du générateur) garde son ancienne règle : middle et
 * court selon l'heure de début.
 *
 * ⚠ TABLEAU DE L'ACCUEIL (plan planning-accueil-2026-11-01, décisions
 * utilisateur du 2026-11-01) : le MOTEUR et l'analyse comptent désormais par
 * `momentsAccueil` (plus bas), qui RÉVISE deux points de cet en-tête (un
 * troisième, « un middle compte au matin ET au soir » (D11), est revenu
 * en arrière le 2026-11-05 : un middle ne compte nulle part), la nuit ne
 * compte que sur le
 * poste de catégorie Veille de nuit (D10), et les soutiens comptent (D5,
 * l'appelant ne les retire plus). `periodePresence` et
 * `sommeBesoinsPresence` gardent l'ancienne règle tant que le contrôle des
 * réglages (`coherence.ts`, étape 4) ne les a pas remplacées.
 */

import {
  coupDeMain,
  deJourAuTableau,
  estNuit,
  MOMENTS_HOTEL,
  momentDuDebut,
  momentPropose,
  rangAuTableau,
} from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import type {
  Besoin,
  Consigne,
  Horaire,
  Periode,
  PeriodePresence,
  Poste,
} from '#/lib/planning/types.ts'

/** Tri des consignes : jour, puis rang du moment au tableau. */
export const triConsignes =
  (l: Moments = MOMENTS_HOTEL) =>
  (
    a: Pick<Consigne, 'jour' | 'periode'>,
    b: Pick<Consigne, 'jour' | 'periode'>,
  ) =>
    a.jour - b.jour || rangAuTableau(l, a.periode) - rangAuTableau(l, b.periode)

/** Moment d'un horaire LIBRE (sans horaire) d'après ses heures, comme un
 * horaire (`momentPropose`, 2026-11-05 : le moment se déduit des heures).
 * Sans fin connue : l'heure de début (`periodeLibre`). */
export function momentLibre(
  debut: string,
  fin?: string,
  l: Moments = MOMENTS_HOTEL,
): Periode {
  return fin === undefined
    ? periodeLibre(debut, l)
    : momentPropose({ debut, fin, pause: 0 }, l)
}

/** Moment d'un horaire libre sans fin connue (`momentDuDebut`). */
export function periodeLibre(debut: string, l: Moments = MOMENTS_HOTEL) {
  return momentDuDebut(debut, l)
}

/** Le poste a-t-il des horaires de NUIT (D15) ? Seulement s'il les liste
 * EXPLICITEMENT dans `horaires_autorises`. Un poste « Tous les horaires »
 * (liste vide) n'en a pas au sens de D15 : sinon tout poste « Tous » d'un
 * hôtel qui a une veille de nuit compterait la nuit. SEULE règle, pour
 * l'assemblage (`semaine.ts`) comme pour le contrôle des réglages
 * (`coherence.ts`). */
export function posteADesCodesDeNuit(
  poste: Pick<Poste, 'horaires_autorises'> | undefined,
  horaires: Iterable<Pick<Horaire, 'id' | 'periode'>>,
  l: Moments = MOMENTS_HOTEL,
): boolean {
  if (!poste?.horaires_autorises.length) return false
  const autorises = new Set(poste.horaires_autorises)
  for (const h of horaires)
    if (estNuit(l, h.periode) && autorises.has(h.id)) return true
  return false
}

/** Période d'un shift pour les consignes, ou null s'il n'y compte pas (voir
 * l'en-tête). `nuitComptee` : le poste a au moins un horaire de famille nuit
 * (faux par défaut : la nuit ne compte pas). */
export function periodePresence(
  poste: Pick<Poste, 'presence'> | undefined,
  horaire: Pick<Horaire, 'periode'> | undefined,
  debut: string,
  nuitComptee = false,
  l: Moments = MOMENTS_HOTEL,
): PeriodePresence | null {
  const famille = horaire ? horaire.periode : null
  // Middle (D11) et horaire sans moment : jamais.
  if (horaire && (famille === null || coupDeMain(l, famille))) return null
  const p = !horaire ? periodeLibre(debut, l) : famille
  if (estNuit(l, p)) return nuitComptee ? p : null
  if (!deJourAuTableau(l, p)) return null
  return poste?.presence ? p : null
}

/** Période d'un shift, sur tout poste : celle de son horaire, ou son heure de
 * début (sans horaire, ou horaire « middle »). Null : nuit ou horaire sans
 * moment. Sert aux consignes et à l'équité du générateur (D15). */
export function periodeShift(
  horaire: Pick<Horaire, 'periode'> | undefined,
  debut: string,
  l: Moments = MOMENTS_HOTEL,
): PeriodePresence | null {
  const famille = horaire ? horaire.periode : null
  const p =
    !horaire || coupDeMain(l, famille) ? periodeLibre(debut, l) : famille
  return deJourAuTableau(l, p) ? p : null
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
  l: Moments = MOMENTS_HOTEL,
): PresenceOut[] {
  return [...consignes].sort(triConsignes(l)).map((c) => {
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
 * (middle exclu). `postesAvecNuit` : ids des postes qui ont au moins un horaire
 * de nuit ; absent, la nuit ne compte pas (comme avant). Seule source de
 * cette somme : contrôle des réglages (`coherence.ts`) et vue Matin et soir. */
export function sommeBesoinsPresence(
  besoins: ReadonlyArray<
    Pick<Besoin, 'poste_id' | 'jour' | 'horaire_id' | 'debut' | 'effectif'>
  >,
  postes: ReadonlyMap<number, Pick<Poste, 'presence'>>,
  horaires: ReadonlyMap<number, Pick<Horaire, 'periode'>>,
  postesAvecNuit?: ReadonlySet<number>,
  /** Moments (`lireRegles(r).moments`) : un besoin sans horaire se range
   * d'après son heure de début. */
  l: Moments = MOMENTS_HOTEL,
): Map<string, number> {
  const somme = new Map<string, number>()
  for (const b of besoins) {
    if (b.effectif <= 0) continue
    const periode = periodePresence(
      postes.get(b.poste_id),
      b.horaire_id !== null ? horaires.get(b.horaire_id) : undefined,
      b.debut,
      postesAvecNuit?.has(b.poste_id) ?? false,
      l,
    )
    if (!periode) continue
    const cle = clePresence(b.jour, periode)
    somme.set(cle, (somme.get(cle) ?? 0) + b.effectif)
  }
  return somme
}

// ------------------------------------------------- tableau de l'accueil

/*
 * Tableau de l'accueil (plan planning-accueil-2026-11-01, D1, D10, D11, D12) :
 * un chiffre par jour et par moment (matin, soir, nuit), pour l'accueil
 * entier. Postes de l'accueil : ceux cochés « présence » (Réception, Club)
 * pour le matin et le soir, et le poste de catégorie Veille de nuit pour la
 * nuit (D10 : personne d'autre la nuit). Le tableau n'existe que si au moins
 * un poste est coché « présence » (`accueilActif`) : un hôtel qui ne l'a pas
 * réglé garde ses besoins, Veille de nuit comprise.
 */

/** Un poste au moins est coché « présence » : le tableau de l'accueil est en
 * service. */
export function accueilActif(
  postes: Iterable<Pick<Poste, 'presence' | 'ferme'>>,
): boolean {
  for (const p of postes) if (p.presence && !p.ferme) return true
  return false
}

type PosteAccueil = Pick<Poste, 'presence' | 'accueil_nuit' | 'ferme'>

/** Le poste tient-il la nuit de l'accueil (U1 du 2026-11-01) ? Son réglage
 * « Accueil : nuit », seul (la catégorie n'est plus lue depuis le
 * 2026-11-06). Un poste fermé ne tient rien. */
export function tientLaNuit(poste: PosteAccueil | undefined): boolean {
  if (!poste || poste.ferme) return false
  return poste.accueil_nuit ?? false
}

/** Le poste est-il de l'accueil (D12, U1) ? `actif` : `accueilActif` de
 * l'hôtel. Un poste fermé (U3) n'en est jamais. */
export function estPosteAccueil(
  poste: PosteAccueil | undefined,
  actif: boolean,
): boolean {
  if (!poste || !actif || poste.ferme) return false
  return poste.presence || tientLaNuit(poste)
}

/** Moments du tableau où compte un shift (ou un créneau candidat) de ce
 * poste, dans l'ordre matin, soir, nuit. Vide : il ne compte nulle part.
 *   - poste coché « présence » : matin → matin, soir → soir ; un middle ne
 *     compte NULLE PART (2026-11-05, révise D11 du 2026-11-01 : une
 *     responsable, « les middles sont des shifts en option, un coup de
 *     main » ; et, mesuré sur les 18 semaines faites à la main, un middle
 *     compté deux fois remplaçait un vrai soir : une personne seule à 21 h
 *     69 jours sur 126 au lieu de 22, 21 à la main). Il reste compté pour
 *     les trous entre équipes. Une nuit n'y compte pas (D10) ;
 *   - poste Veille de nuit (accueil actif) : nuit → nuit ;
 *   - horaire sans moment (`periode` null) : rien ;
 *   - horaire libre : ses heures (`momentLibre`, comme un horaire ;
 *     sans `fin`, son heure de début).
 * `actif` : `accueilActif` de l'hôtel (faux : rien ne compte). */
export function momentsAccueil(
  poste: PosteAccueil | undefined,
  horaire: Pick<Horaire, 'periode'> | undefined,
  debut: string,
  actif = true,
  fin?: string,
  l: Moments = MOMENTS_HOTEL,
): PeriodePresence[] {
  if (!estPosteAccueil(poste, actif) || !poste) return []
  const p = horaire ? horaire.periode : momentLibre(debut, fin, l)

  if (p === null) return []
  const r: PeriodePresence[] = []
  if (poste.presence && deJourAuTableau(l, p)) r.push(p)
  if (tientLaNuit(poste) && estNuit(l, p) && rangAuTableau(l, p) >= 0) r.push(p)
  return r
}

/** Le chiffre d'un moment (D3) : `minimum`, au moins ce nombre. Un chiffre
 * exact par défaut (minimum = maximum) ; « au moins … au plus … » sur
 * demande depuis le 2026-11-06. */
export function chiffreAccueil(c: Pick<Consigne, 'minimum'>): number {
  return Math.max(0, c.minimum)
}

/** Au plus (2026-11-06) : le maximum s'il est renseigné et au-dessus du
 * minimum, sinon le minimum (un chiffre exact). */
export function plafondAccueil(
  c: Pick<Consigne, 'minimum' | 'maximum'>,
): number {
  return Math.max(chiffreAccueil(c), c.maximum ?? 0)
}

/** Nom par défaut de la zone de l'accueil (2026-11-06) : le seul mot de
 * l'accueil écrit dans le code ; le lot 2 le prendra dans la table des
 * zones. */
export const NOM_ZONE_ACCUEIL = 'Accueil'

/** Les noms des postes ouverts de l'accueil le jour (matin et soir) ou la
 * nuit, dans l'ordre reçu : ce que l'écran dit à la place de « Réception et
 * Club » ou « Veilleur ». */
export function nomsPostesAccueil(
  postes: Iterable<Pick<Poste, 'nom' | 'presence' | 'accueil_nuit' | 'ferme'>>,
  quand: 'jour' | 'nuit',
): string[] {
  return [...postes]
    .filter((p) => (quand === 'jour' ? p.presence && !p.ferme : tientLaNuit(p)))
    .map((p) => p.nom)
}

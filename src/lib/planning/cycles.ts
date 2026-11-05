/*
 * Cycles de la journée (plan `plan/planning-cycles-2026-10-30/`, demande
 * utilisateur du 2026-10-30 : « les trois cycles dans la journée : matin,
 * soir, nuit… et les middle, c'est un shift bâtard »). SEULE source du cycle
 * d'un shift ou d'un besoin, pour le rattachement des shifts posés aux
 * besoins (étape 3), les horaires remplaçants du moteur (étape 4) et les trous
 * entre deux cycles (étape 6).
 *
 * Cycle = le moment de l'horaire (`Horaire.periode`, migration du
 * 2026-10-28). Sans horaire (horaire spécifique), ou pour un horaire sans
 * moment, il se déduit de l'heure de début
 * comme un horaire libre (`periodeLibre`, `presence.ts`) : nuit de 21 h à
 * 5 h, matin avant 12 h 30, soir ensuite.
 *
 * Un middle reste un middle (D11, D12) : il ne remplace qu'un middle et ne
 * compte dans aucun minimum par cycle ; ce traitement vit chez les
 * appelants, pas ici.
 */

import type { Creneau } from '#/lib/planning/modele.ts'
import { periodeLibre } from '#/lib/planning/presence.ts'
import { REGLES_PAR_DEFAUT } from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { minutes } from '#/lib/planning/temps.ts'
import type { Horaire, Periode } from '#/lib/planning/types.ts'

/** Moins de 7 h de travail. Le moment « court » a disparu le 2026-10-31
 * (décision utilisateur : un court se range au matin, au middle ou au soir
 * d'après son début) ; sa LONGUEUR reste une règle des remplaçants : un
 * horaire court ne remplace qu'un court, et n'est remplacé que par un court
 * (comme quand « court » était son propre cycle). */
export function estCourt(
  h: Pick<Horaire, 'debut' | 'fin' | 'pause'>,
  /** La journée courte de l'établissement (7 h à l'hôtel). */
  journeeCourte: number = REGLES_PAR_DEFAUT.contrats.journeeCourte,
): boolean {
  let duree = minutes(h.fin) - minutes(h.debut)
  if (duree <= 0) duree += 24 * 60
  return duree - h.pause < journeeCourte
}

/** Cycle d'un shift ou d'un besoin. Null : réservé aux appelants qui
 * veulent dire « hors cycle » ; `cycleDe` en rend toujours un. */
export type Cycle = Periode | null

/** Cycle d'un horaire (son moment), ou, sans horaire ou sans moment,
 * celui de l'heure de début. */
export function cycleDe(
  horaire: Pick<Horaire, 'periode'> | undefined,
  debut: string,
  l: RegleEtablissement['moments'] = REGLES_PAR_DEFAUT.moments,
): Cycle {
  return horaire?.periode ?? periodeLibre(debut, l)
}

// ------------------------------------------------- trous entre deux équipes

/*
 * Trou entre deux équipes (étape 6, contrat de la vague 1 §3, D10, D11).
 * Pour un poste qui compte dans la présence et un jour : la PLAGE va du début
 * du premier besoin à la fin du dernier besoin de ce poste ce jour-là ; à
 * chaque quart d'heure de la plage, il faut au moins une personne AUTONOME
 * présente sur ce poste (middle compris, soutien jamais, shifts posés
 * compris). Un quart d'heure sans personne = un trou.
 *
 * Tout est en minutes RÉELLES depuis le lundi (`temps.ts`) : la nuit du
 * changement d'heure dure 7 h ou 9 h, et un shift de nuit du dimanche
 * (« 24:00 → 07:00 ») finit le lundi d'après. Ce calcul ne connaît pas le
 * jour : l'appelant donne les besoins du jour (jour du planning où ils sont
 * écrits) et TOUTES les présences du poste, quel que soit leur jour (une nuit
 * de la veille couvre le petit matin).
 *
 * Quarts d'heure : grille absolue des minutes réelles (0, 15, 30… depuis le
 * lundi 00:00), coupée aux bords de la plage. Le changement d'heure décale
 * d'une heure entière : la grille reste celle des quarts d'heure d'horloge.
 * Un quart d'heure (coupé) est tenu quand UNE présence autonome le couvre
 * en entier ; un passage de relais au milieu d'un quart d'heure (l'un part à
 * 15 h 05, l'autre arrive à 15 h 05) le laisse donc compté comme un trou.
 * C'est voulu : simple, la même chose qu'une variable par quart d'heure, et
 * les horaires de l'hôtel sont tous au quart d'heure.
 */

/** Pas de la grille des trous, en minutes. */
export const QUART_D_HEURE = 15

/** Plage de minutes réelles depuis le lundi, fin exclue. */
export interface PlageMinutes {
  debut: number
  fin: number
}

/** Une personne présente sur le poste : bornes réelles (celles de l'horaire
 * posé) et autonomie (titulaire ou dépannage : vrai ; soutien : faux). */
export interface PresencePoste extends PlageMinutes {
  autonome: boolean
}

/** Plage à tenir : du début du premier besoin à la fin du dernier, ou null
 * sans besoin (un besoin vide ou à l'envers est ignoré). */
export function plageDuJour(
  besoins: ReadonlyArray<PlageMinutes>,
): PlageMinutes | null {
  let debut = Infinity
  let fin = -Infinity
  for (const b of besoins) {
    if (b.fin <= b.debut) continue
    debut = Math.min(debut, b.debut)
    fin = Math.max(fin, b.fin)
  }
  return fin > debut ? { debut, fin } : null
}

/** Trous d'un poste un jour : plages contiguës (bords au quart d'heure ou à
 * ceux de la plage), triées, sans recouvrement. Vide : rien à signaler. */
export function trousDuJour(
  besoins: ReadonlyArray<PlageMinutes>,
  presences: ReadonlyArray<PresencePoste>,
): PlageMinutes[] {
  const plage = plageDuJour(besoins)
  if (!plage) return []
  const autonomes = presences.filter((x) => x.autonome && x.fin > x.debut)
  const trous: PlageMinutes[] = []
  const premier = Math.floor(plage.debut / QUART_D_HEURE) * QUART_D_HEURE
  for (let q = premier; q < plage.fin; q += QUART_D_HEURE) {
    const debut = Math.max(q, plage.debut)
    const fin = Math.min(q + QUART_D_HEURE, plage.fin)
    if (autonomes.some((x) => x.debut <= debut && x.fin >= fin)) continue
    const dernier = trous.at(-1)
    if (dernier && dernier.fin === debut) dernier.fin = fin
    else trous.push({ debut, fin })
  }
  return trous
}

/** Postes où les trous comptent, lus sur les créneaux d'un problème : ceux
 * qui ont au moins un créneau compté dans le matin ou le soir. La nuit n'y
 * entre pas (D15 : elle compte sur un poste qui a des horaires de nuit, sans
 * regarder `poste.presence`), le middle non plus (D11 : jamais compté). Un
 * poste coché « présence » dont tous les créneaux de la semaine sont des
 * middles ou des nuits n'est donc pas vu : l'appelant qui connaît les
 * postes passe alors la liste lui-même. */
export function postesAPresence(
  creneaux: ReadonlyArray<Pick<Creneau, 'poste' | 'presence' | 'accueil'>>,
): Set<string> {
  const r = new Set<string>()
  for (const c of creneaux) {
    // Un candidat de l'accueil n'est pas un besoin : ses trous se comptent
    // sur l'accueil entier (`trousAccueilDuJour`), pas par poste.
    if (c.accueil) continue
    if (c.presence.includes('matin') || c.presence.includes('soir'))
      r.add(c.poste)
  }
  return r
}

// ----------------------------------------- trous de l'accueil (D15)

/*
 * Trous de l'ACCUEIL (plan planning-accueil-2026-11-01, D15) : l'accueil n'a
 * plus de besoins (D13), donc plus de « premier et dernier besoin » par poste.
 * Les trous se cherchent sur l'accueil ENTIER d'un jour (Réception et Club
 * ensemble : une personne autonome sur l'un OU l'autre tient le quart
 * d'heure), du premier au dernier moment DEMANDÉ du jour (chiffre > 0, matin
 * et soir).
 *
 * 24 h sur 24 (audit du 2026-11-01) : quand la nuit est demandée, la journée
 * est tenue d'un veilleur à l'autre. La plage COMMENCE au départ de la nuit
 * de la veille (la fin la plus tardive de ses horaires : 07:00) et FINIT à
 * l'arrivée de la nuit du jour (le début le plus tôt : 23:00). Un vide entre
 * 22:45 et 23:00, ou entre 07:00 et le premier matin, est donc un trou. La
 * nuit elle-même n'est pas découpée : son chiffre la tient.
 *
 * Bornes d'un moment : celles qui tiennent QUEL QUE SOIT l'horaire choisi.
 * Début de la plage = le début le PLUS TARD des horaires du premier moment
 * (si le matin commence à 06:30, 07:00 ou 08:00 selon l'horaire, l'accueil
 * n'est sûrement ouvert qu'à 08:00 : le moteur n'est pas poussé vers
 * l'horaire le plus tôt pour un « trou » de 06:30 à 08:00) ; fin = la fin la
 * PLUS TÔT des horaires du dernier moment. Les middles ne fixent pas les
 * bornes (ils sont au milieu), sauf s'il n'y a qu'eux. Un jour où seul le
 * matin est demandé : la plage est celle du matin seul.
 *
 * Même grille et même règle de couverture que `trousDuJour` (un quart
 * d'heure tenu quand UNE présence autonome le couvre en entier).
 */

/** Plage de l'accueil d'un jour : `candidats` = créneaux candidats de
 * l'accueil écrits ce jour (leurs moments dans `presence`, nuits comprises) ;
 * `demandes` = moments au chiffre > 0 ce jour ; `nuitVeille` = candidats de
 * la nuit de la veille quand elle est demandée (`nuitDeLaVeille`). Null :
 * rien à tenir (ni matin ni soir demandé). */
export function plageAccueil(
  candidats: ReadonlyArray<Pick<Creneau, 'debut' | 'fin' | 'presence'>>,
  demandes: ReadonlySet<'matin' | 'soir' | 'nuit'>,
  nuitVeille: ReadonlyArray<Pick<Creneau, 'debut' | 'fin'>> = [],
): PlageMinutes | null {
  const premier = demandes.has('matin')
    ? 'matin'
    : demandes.has('soir')
      ? 'soir'
      : null
  const dernier = demandes.has('soir')
    ? 'soir'
    : demandes.has('matin')
      ? 'matin'
      : null
  if (!premier || !dernier) return null
  const du = (moment: 'matin' | 'soir') => {
    const purs = candidats.filter(
      (c) => c.presence.length === 1 && c.presence[0] === moment,
    )
    return purs.length
      ? purs
      : candidats.filter((c) => c.presence.includes(moment))
  }
  const nuits = demandes.has('nuit')
    ? candidats.filter((c) => c.presence.includes('nuit'))
    : []
  const ouvrent = du(premier)
  const ferment = du(dernier)
  if (!ouvrent.length && !nuitVeille.length) return null
  if (!ferment.length && !nuits.length) return null
  const debut = nuitVeille.length
    ? Math.max(...nuitVeille.map((c) => c.fin))
    : Math.max(...ouvrent.map((c) => c.debut))
  // La journée est tenue jusqu'à l'arrivée la plus TARDIVE possible du
  // veilleur (sa nuit étoile, l'horaire de minuit, commence à 24:00 : rien
  // entre 22:45 et minuit, signalé par l'utilisateur le 2026-11-01) ; s'il
  // arrive plus tôt, sa présence couvre l'écart (la veille compte dans les
  // présences).
  const fin = nuits.length
    ? Math.max(...nuits.map((c) => c.debut))
    : Math.min(...ferment.map((c) => c.fin))
  return fin > debut ? { debut, fin } : null
}

/** Candidats de la nuit de la VEILLE de `jour`, si elle est demandée
 * (`nuitDemandee`). Le lundi, la veille est le dimanche d'avant : on prend
 * les nuits du dimanche de la semaine, reculées de 7 jours (le tableau est le
 * même chaque semaine). */
export function nuitDeLaVeille<
  C extends Pick<Creneau, 'debut' | 'fin' | 'presence'>,
>(
  candidats: ReadonlyArray<C>,
  jourDuCandidat: (c: C) => number,
  jour: number,
  nuitDemandee: (jour: number) => boolean,
): Array<Pick<Creneau, 'debut' | 'fin'>> {
  const veille = (jour + 6) % 7
  if (!nuitDemandee(veille)) return []
  const nuits = candidats.filter(
    (c) => jourDuCandidat(c) === veille && c.presence.includes('nuit'),
  )
  const recul = jour === 0 ? 7 * 24 * 60 : 0
  // Le matin est tenu dès le départ le plus TÔT possible du veilleur (la
  // plage commence au plus tard de ces départs, `plageAccueil`).
  return nuits.map((c) => ({
    debut: c.debut - recul,
    fin: c.fin - recul,
  }))
}

/** Trous de l'accueil un jour : `trousDuJour` sur la plage de l'accueil,
 * avec les présences de TOUS les postes de l'accueil du matin et du soir. */
export function trousAccueilDuJour(
  candidats: ReadonlyArray<Pick<Creneau, 'debut' | 'fin' | 'presence'>>,
  demandes: ReadonlySet<'matin' | 'soir' | 'nuit'>,
  presences: ReadonlyArray<PresencePoste>,
  nuitVeille: ReadonlyArray<Pick<Creneau, 'debut' | 'fin'>> = [],
): PlageMinutes[] {
  const plage = plageAccueil(candidats, demandes, nuitVeille)
  return plage ? trousDuJour([plage], presences) : []
}

/** « Poste » d'un trou de l'accueil entier (D15) : il n'appartient à aucun
 * poste en particulier. */
export const POSTE_ACCUEIL = 'accueil'

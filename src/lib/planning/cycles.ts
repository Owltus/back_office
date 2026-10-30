/*
 * Cycles de la journée (plan `plan/planning-cycles-2026-10-30/`, demande
 * utilisateur du 2026-10-30 : « les trois cycles dans la journée : matin,
 * soir, nuit… et les middle, c'est un shift bâtard »). SEULE source du cycle
 * d'un shift ou d'un besoin, pour le rattachement des shifts posés aux
 * besoins (étape 3), les codes remplaçants du moteur (étape 4) et les trous
 * entre deux cycles (étape 6).
 *
 * Cycle = la famille du code (`Horaire.periode`, migration du 2026-10-28).
 * Sans code, ou pour un code sans famille, il se déduit de l'heure de début
 * comme un horaire libre (`periodeLibre`, `presence.ts`) : nuit de 22 h à
 * 5 h, matin avant 12 h 30, soir ensuite.
 *
 * Un middle reste un middle (D11, D12) : il ne remplace qu'un middle et ne
 * compte dans aucun minimum par cycle ; ce traitement vit chez les
 * appelants, pas ici.
 */

import type { Creneau } from '#/lib/planning/modele.ts'
import { periodeLibre } from '#/lib/planning/presence.ts'
import type { Horaire, Periode } from '#/lib/planning/types.ts'

/** Cycle d'un shift ou d'un besoin. Null : réservé aux appelants qui
 * veulent dire « hors cycle » ; `cycleDe` en rend toujours un. */
export type Cycle = Periode | null

/** Cycle d'un code horaire (sa famille), ou, sans code ou sans famille,
 * celui de l'heure de début. */
export function cycleDe(
  horaire: Pick<Horaire, 'periode'> | undefined,
  debut: string,
): Cycle {
  return horaire?.periode ?? periodeLibre(debut)
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
 * les codes de l'hôtel sont tous au quart d'heure.
 */

/** Pas de la grille des trous, en minutes. */
export const QUART_D_HEURE = 15

/** Plage de minutes réelles depuis le lundi, fin exclue. */
export interface PlageMinutes {
  debut: number
  fin: number
}

/** Une personne présente sur le poste : bornes réelles (version courte déjà
 * appliquée) et autonomie (titulaire ou dépannage : vrai ; soutien : faux). */
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
 * entre pas (D15 : elle compte sur un poste qui a des codes de nuit, sans
 * regarder `poste.presence`), le middle non plus (D11 : jamais compté). Un
 * poste coché « présence » dont tous les créneaux de la semaine sont des
 * middles ou des nuits n'est donc pas vu : l'appelant qui connaît les
 * postes passe alors la liste lui-même. */
export function postesAPresence(
  creneaux: ReadonlyArray<Pick<Creneau, 'poste' | 'presence'>>,
): Set<string> {
  const r = new Set<string>()
  for (const c of creneaux) {
    if (c.presence === 'matin' || c.presence === 'soir') r.add(c.poste)
  }
  return r
}

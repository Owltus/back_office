/* --------------------------------------------------------------------------
 * Modèle métier du planning lits bébé (pur : sans React ni présentation).
 *
 * Comme Parking, ce sont les NUITÉES qui sont suivies, pas des jours pleins
 * inclusifs : `startDate` est la nuit d'arrivée (incluse), `endDate` est le
 * jour de DÉPART (EXCLUS — le lit n'est plus occupé ce jour-là, il peut être
 * réassigné dès ce même jour à un autre enfant). Pas de découpage en
 * demi-journées pour autant (un lit bébé n'a pas la granularité arrivée-
 * après-midi / départ-matin du parking) : juste une borne de fin exclusive,
 * comme un `[start, end)` classique.
 * ------------------------------------------------------------------------ */

import type { CotAssignment } from '#/lib/baby-cots/types.ts'

/** Période de nuitées, `startDate` incluse, `endDate` (jour de départ) EXCLUE. */
export interface DatePeriod {
  startDate: string
  endDate: string
}

/**
 * Deux périodes se chevauchent-elles (au moins une NUIT commune) ? Comparaison
 * lexicale des dates 'YYYY-MM-DD' (= chronologique), bornes `[start, end)`.
 * Deux séjours qui se touchent au jour de bascule (l'un part le 10, l'autre
 * arrive le 10) NE se chevauchent PAS — c'est le principe même de la nuitée
 * (le lit se libère le matin du départ, réutilisable dès l'après-midi).
 */
export function hasOverlap(a: DatePeriod, b: DatePeriod): boolean {
  return a.startDate < b.endDate && b.startDate < a.endDate
}

/**
 * Une période chevauche-t-elle une assignation EXISTANTE du MÊME lit, dans
 * une liste ? Même principe que `hasOverlap` de `lib/parking/model.ts`
 * (reservations, spot, startDay, nights, excludeId) : filtre sur la ressource
 * (`cotId`), exclut optionnellement une assignation par id — c'est ce qui
 * permet de valider un déplacement/redimensionnement sans se chevaucher
 * soi-même (l'assignation déplacée ignore sa propre position d'origine).
 */
export function hasOverlapWithAny(
  assignments: CotAssignment[],
  cotId: string,
  period: DatePeriod,
  excludeId?: string,
): boolean {
  return assignments.some(
    (a) => a.id !== excludeId && a.cotId === cotId && hasOverlap(a, period),
  )
}

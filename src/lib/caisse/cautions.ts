/* --------------------------------------------------------------------------
 * Cautions clients — calcul du fond de caisse EFFECTIF (métier pur, aucun React
 * ni Supabase).
 *
 * Une caution est un dépôt en espèces (rangé dans le tiroir-caisse, une
 * enveloppe par caution) qui augmente le fond de caisse attendu tant qu'elle
 * est active. Décisions actées avec l'utilisateur (plan/caisse-cautions/00-INDEX.md) :
 *
 *  - D3 : elle cesse de compter IMMÉDIATEMENT à son remboursement — borne
 *    EXCLUSIVE sur `refundedDate` (pas de « jour où elle compte encore »).
 *  - D4 : le fond effectif n'est JAMAIS figé/stocké — il se recalcule en
 *    direct, pour n'importe quelle date passée ou présente. C'est ce qui
 *    permet à une caution ajoutée en retard de corriger automatiquement
 *    l'affichage d'une feuille déjà clôturée, sans jamais réécrire cette
 *    feuille (aucun conflit avec son verrou RLS).
 *
 * Reprend le principe déjà présent dans le repo pour un report DÉRIVÉ (pas
 * stocké en cumul) : lib/rapro/carryover.ts. Ici la règle est plus simple (pas
 * de fenêtre bornée, pas de résolution multi-critères).
 * ------------------------------------------------------------------------ */

import { round2 } from '#/lib/caisse/calc.ts'
import type { Caution } from '#/lib/caisse/types.ts'

/** Une caution compte pour une date donnée si elle a déjà été prise
 * (`takenDate <= date`) ET qu'elle est encore active OU que son remboursement
 * n'a lieu qu'APRÈS cette date (borne EXCLUSIVE : le jour même du remboursement,
 * elle ne compte plus). Fonctionne pour une date passée comme présente — c'est
 * ce qui permet la correction rétroactive (D4). */
export function isCautionActiveOn(c: Caution, date: string): boolean {
  if (c.takenDate > date) return false
  if (c.status === 'active') return true
  return c.refundedDate != null && date < c.refundedDate
}

/** Somme des cautions actives à une date donnée, à partir de la liste COMPLÈTE
 * des cautions (actives ET remboursées : une caution remboursée compte encore
 * pour toute date antérieure à son remboursement — ne jamais filtrer sur le
 * statut avant d'appeler cette fonction). */
export function activeCautionsTotal(cautions: Caution[], date: string): number {
  return round2(
    cautions
      .filter((c) => isCautionActiveOn(c, date))
      .reduce((sum, c) => sum + c.amount, 0),
  )
}

/** Fond de caisse EFFECTIF attendu à une date : le plancher (`fundTarget`) plus
 * les cautions actives ce jour-là. À appeler PARTOUT où un fond attendu est
 * affiché ou évalué (board, dialogue de clôture, analytique) — jamais de
 * valeur `fundOrigin` stockée à la place (D4). */
export function effectiveFundTarget(
  cautions: Caution[],
  date: string,
  fundTarget: number,
): number {
  return round2(fundTarget + activeCautionsTotal(cautions, date))
}

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

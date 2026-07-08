/*
 * Rapprochement comptable du jour (Réception vs Étages) — métier pur, sans React
 * ni Supabase. Reproduit la logique de l'Excel : deux totaux qui doivent tomber
 * sur le même nombre (écart = 0).
 *
 * RÉCEPTION (1) = occupation du jour (PDJ) + arrivées après clôture (saisie) ±
 *   corrections (saisie).
 * ÉTAGES (2)    = nettoyées + refus + bloquées DU JOUR (D2 : jour seul, hors
 *   roulement ; les no-show sont exclus car l'occupation ne les compte pas).
 * ÉCART         = (1) − (2). Sans saisie manuelle, toute occupée est nettoyée /
 *   refus / bloquée → (2) = occupation et l'écart ne reflète que les ajustements
 *   Réception (arrivées tardives, corrections) — exactement ce qu'on veut voir.
 *
 * Distinct de `reconcile()` (balance + roulement, sur le dû élargi) : ici c'est
 * le comptable du jour, on ne mélange pas.
 *
 * IMPORTANT : clean/refus/blocked sont comptés SUR LES OCCUPÉES DU JOUR
 * uniquement. Une chambre reportée nettoyée aujourd'hui (hors occupation du jour)
 * n'entre PAS dans les Étages du jour — c'est le « déduire les bloquées de la
 * veille » de la procédure : elle appartient à l'occupation de son jour d'origine.
 */

import { statusOf } from '#/lib/rapro/constants.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

export interface Accounting {
  // --- Réception (1) ---
  /** Occupées du jour (PDJ) = `occupied.size`. */
  occupancy: number
  /** Arrivées après clôture (saisie). */
  lateArrivals: number
  /** Corrections/délogements (saisie, peut être négatif). */
  corrections: number
  /** Total Réception = occupancy + lateArrivals + corrections. */
  reception: number
  // --- Étages (2) ---
  clean: number
  refus: number
  /** Bloquées du jour (occupées non nettoyées, hors roulement). */
  blocked: number
  /** Total Étages = clean + refus + blocked. */
  etages: number
  // --- Écart ---
  /** reception − etages (doit valoir 0). */
  ecart: number
  // --- Ligne de contrôle OCC (informatif, n'entre pas dans l'écart) ---
  /** OCC officiel PMS (daily_reports, jour − 1), ou null si indisponible. */
  officialOcc: number | null
  /** occupancy − officialOcc (contrôle PDJ ↔ PMS), ou null. */
  occGap: number | null
}

/** Calcule le rapprochement du jour à partir des statuts et de l'occupation PDJ.
 * clean/refus/blocked comptés PARMI LES OCCUPÉES. `officialOcc` = ligne de
 * contrôle optionnelle (n'entre pas dans l'écart). */
export function reconcileAccounting(input: {
  statuses: ReadonlyMap<number, RoomStatus>
  occupied: ReadonlySet<number>
  lateArrivals: number
  corrections: number
  officialOcc?: number | null
}): Accounting {
  let clean = 0
  let refus = 0
  let blocked = 0
  for (const room of input.occupied) {
    const s = statusOf(input.statuses, room)
    if (s === 'nettoyee') clean++
    else if (s === 'refus') refus++
    else if (s === 'non_nettoyee') blocked++
    // `noshow` parmi les occupées : exclu des Étages (rien à nettoyer) — rare, et
    // un tel cas fait légitimement apparaître un écart (à investiguer).
  }
  const occupancy = input.occupied.size
  const reception = occupancy + input.lateArrivals + input.corrections
  const etages = clean + refus + blocked
  const officialOcc = input.officialOcc ?? null
  const occGap = officialOcc === null ? null : occupancy - officialOcc
  return {
    occupancy,
    lateArrivals: input.lateArrivals,
    corrections: input.corrections,
    reception,
    clean,
    refus,
    blocked,
    etages,
    ecart: reception - etages,
    officialOcc,
    occGap,
  }
}

/** L'écart comptable est-il nul (Réception = Étages) ? */
export const isEcartNul = (a: Accounting): boolean => a.ecart === 0

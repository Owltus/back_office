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
 */

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

/** Calcule le rapprochement du jour. `officialOcc` optionnel = ligne de contrôle. */
export function reconcileAccounting(input: {
  occupancy: number
  lateArrivals: number
  corrections: number
  clean: number
  refus: number
  blocked: number
  officialOcc?: number | null
}): Accounting {
  const reception = input.occupancy + input.lateArrivals + input.corrections
  const etages = input.clean + input.refus + input.blocked
  const officialOcc = input.officialOcc ?? null
  const occGap = officialOcc === null ? null : input.occupancy - officialOcc
  return {
    occupancy: input.occupancy,
    lateArrivals: input.lateArrivals,
    corrections: input.corrections,
    reception,
    clean: input.clean,
    refus: input.refus,
    blocked: input.blocked,
    etages,
    ecart: reception - etages,
    officialOcc,
    occGap,
  }
}

/** L'écart comptable est-il nul (Réception = Étages) ? */
export const isEcartNul = (a: Accounting): boolean => a.ecart === 0

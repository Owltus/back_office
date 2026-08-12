/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — synthèse d'un jour pour une vue TRANSVERSE (RepJour).
 *
 * Agrège les lignes In-House (`pdj_breakfasts`) d'un jour en quelques compteurs et
 * les montants HT, via la SOURCE UNIQUE du CA (`computePdjCA`, par chambre, au
 * tarif détecté) — même chiffre que le board, le PDF et l'analytique. Sert à
 * alimenter la bande de synthèse du rapport journalier sans dupliquer la logique.
 * ------------------------------------------------------------------------ */

import { computePdjCA } from '#/lib/pdj/breakdown.ts'
import type { PdjDayRow } from '#/lib/pdj/service.ts'

/** Synthèse condensée du PDJ d'un jour. */
export interface PdjDaySummary {
  /** Chambres présentes (une ligne In-House = une chambre). */
  rooms: number
  /** Clients (couverts In-House) : Σ guests. */
  guests: number
  /** PDJ inclus : Σ breakfasts_included. */
  included: number
  /** Couverts EXTRAS (servis au-delà des inclus). */
  extrasCount: number
  /** Taux de captage (%) = (inclus + extras) / clients ; null si aucun client. */
  captage: number | null
  /** PDJ inclus, HT. */
  includedHT: number
  /** Extras, HT. */
  extrasHT: number
  /** Total (inclus + extras), HT. */
  totalHT: number
  /** Le CA HT est chiffrable (tarif détecté et PDJ présents). */
  hasAddon: boolean
}

/**
 * Synthèse PDJ d'un jour. Miroir exact du board (`BreakfastBoard`) : volumes sur
 * les lignes In-House, CA HT via `computePdjCA` (par chambre, inclus + extras au
 * tarif DÉTECTÉ). `tarifs` = détection sur tout l'historique Addon (cf. tarif.ts).
 */
export function pdjDaySummary(
  rows: PdjDayRow[],
  tarifs: Map<string, number>,
): PdjDaySummary {
  const rooms = rows.length
  const guests = rows.reduce((s, r) => s + r.guests, 0)
  const included = rows.reduce((s, r) => s + r.breakfasts_included, 0)
  const extrasCount = rows.reduce(
    (s, r) => s + Math.max(0, r.breakfasts_served - r.breakfasts_included),
    0,
  )
  const { includedHt, extrasHt, totalHt } = computePdjCA(rows, tarifs)
  const captage = guests > 0 ? ((included + extrasCount) / guests) * 100 : null

  return {
    rooms,
    guests,
    included,
    extrasCount,
    captage,
    includedHT: includedHt,
    extrasHT: extrasHt,
    totalHT: totalHt,
    hasAddon: totalHt > 0,
  }
}

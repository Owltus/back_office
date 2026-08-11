/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — synthèse d'un jour pour une vue TRANSVERSE (RepJour).
 *
 * Agrège les lignes In-House (`pdj_breakfasts`) + l'Addon Production d'un jour en
 * quelques compteurs et les montants HT, en RÉUTILISANT les fonctions pures du
 * board PDJ (`countCovers`, `computePdjAmounts`) — aucune règle de calcul n'est
 * réécrite ici. Sert à alimenter la bande de synthèse du rapport journalier sans
 * dupliquer la logique métier.
 * ------------------------------------------------------------------------ */

import { computePdjAmounts, countCovers } from '#/lib/pdj/amounts.ts'
import type { PdjAddonRow, PdjDayRow } from '#/lib/pdj/service.ts'

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
  /** L'Addon Production du jour est présent → le CA HT est chiffrable. */
  hasAddon: boolean
}

/**
 * Synthèse PDJ d'un jour. Miroir exact du décompte du board (`BreakfastBoard`) :
 * volumes calculés sur les lignes In-House, montants HT via `computePdjAmounts`
 * (inclus = revenu Addon + inclus manuels ÷ 1,10 ; extras au tarif catalogue).
 */
export function pdjDaySummary(
  rows: PdjDayRow[],
  addon: PdjAddonRow[],
): PdjDaySummary {
  const rooms = rows.length
  const guests = rows.reduce((s, r) => s + r.guests, 0)
  const included = rows.reduce((s, r) => s + r.breakfasts_included, 0)
  const extrasCount = rows.reduce(
    (s, r) => s + Math.max(0, r.breakfasts_served - r.breakfasts_included),
    0,
  )
  // PDJ inclus saisis À LA MAIN (day-use…), absents de l'Addon : valorisés au
  // tarif et ajoutés au HT inclus (cf. computePdjAmounts).
  const manualIncludedCount = rows.reduce(
    (s, r) => s + (r.manual_kind === 'inclus' ? r.breakfasts_served : 0),
    0,
  )
  const covers = countCovers(rows)
  const { includedHT, extrasHT, totalHT } = computePdjAmounts({
    addon: addon.map((a) => ({
      code: a.code,
      count: a.total_count,
      revenue: a.revenue_ttc,
    })),
    covers,
    extrasCount,
    manualIncludedCount,
  })
  const captage = guests > 0 ? ((included + extrasCount) / guests) * 100 : null

  return {
    rooms,
    guests,
    included,
    extrasCount,
    captage,
    includedHT,
    extrasHT,
    totalHT,
    hasAddon: addon.length > 0,
  }
}

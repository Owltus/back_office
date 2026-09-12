/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — synthèse d'un jour pour une vue TRANSVERSE (RepJour).
 *
 * Agrège les lignes In-House (`pdj_breakfasts`) d'un jour en quelques compteurs et
 * les montants HT, via la SOURCE UNIQUE du CA (`computePdjCA`) — même chiffre que
 * le board, le PDF et l'analytique. Sert à alimenter la bande de synthèse du
 * rapport journalier sans dupliquer la logique.
 *
 * Depuis le 2026-09-12, la bande reçoit les deux mêmes entrées que le board : la
 * RECETTE réellement facturée par le PMS (qui fait foi pour les inclus) et les
 * EXTERNES du jour (couverts servis à des clients non logés). Sans elles, la
 * bande affichait un CA différent de celui de la page PDJ pour la même journée —
 * deux vérités pour un même chiffre.
 *
 * Tous les montants rendus ici sont HT (la recette du PMS arrive en TTC et est
 * convertie par `fromTTC`, TVA 10 %).
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
  /** Couverts EXTRAS : servis au-delà des inclus, EXTERNES compris. */
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
 * les lignes In-House, CA HT via `computePdjCA`.
 *
 * `prices` = prix unitaires TTC du JOUR (`dayUnitPrices`), c'est-à-dire la
 * recette du PMS divisée par les couverts inclus, avec repli sur les tarifs de
 * référence pour un code que la journée ne renseigne pas.
 */
export function pdjDaySummary(
  rows: PdjDayRow[],
  prices: Map<string, number>,
  /** Externes du jour (clients non logés) : comptés en extras, au prix fort. */
  externalsCount = 0,
  /** Recette TTC facturée par le PMS ce jour-là (`billedRevenueTtc`). Fournie,
   *  elle FAIT FOI pour les inclus ; absente, on retombe sur la reconstitution. */
  billedTtc?: number | null,
  /** Prix TTC d'un couvert vendu à part (cf. `topPrice`) : le plus élevé des
   *  prix connus, du jour comme de la référence. */
  extraTtc?: number | null,
): PdjDaySummary {
  const rooms = rows.length
  const guests = rows.reduce((s, r) => s + r.guests, 0)
  const included = rows.reduce((s, r) => s + r.breakfasts_included, 0)
  const roomExtras = rows.reduce(
    (s, r) => s + Math.max(0, r.breakfasts_served - r.breakfasts_included),
    0,
  )
  const extrasCount = roomExtras + Math.max(0, externalsCount)
  const { includedHt, extrasHt, totalHt } = computePdjCA(
    rows,
    prices,
    externalsCount,
    billedTtc,
    extraTtc,
  )
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

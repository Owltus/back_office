/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — calcul des montants HT de la journée.
 *
 * À partir des revenus TTC par code (rapport Addon Production) et des couverts
 * In-House, on dérive trois montants HT : le PDJ inclus, les extras (couverts
 * servis au-delà des inclus) et le total. Plus un contrôle défensif (warnings)
 * non bloquant.
 *
 * Conversions TTC ⇄ HT via `fromTTC` (VAT_FACTOR = 1,10) — jamais de « /1.1 »
 * magique. Arrondi UNIQUEMENT au niveau du total : jamais au prix unitaire,
 * pour ne pas accumuler les arrondis.
 * ------------------------------------------------------------------------ */

import { fromTTC } from '#/lib/repjour/constants.ts'
import type { AddonProductionRow } from '#/lib/pdj/addon.ts'
import { detectTarifs } from '#/lib/pdj/tarif.ts'
import { computePdjCA } from '#/lib/pdj/breakdown.ts'

/** Arrondi à 2 décimales (au centime). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Couverts In-House ventilés par code petit-déjeuner. */
export interface CoversByCode {
  coversPDJ: number
  coversPDJBB: number
}

/**
 * Couverts par code depuis les lignes In-House (pdj_breakfasts). Pour chaque
 * ligne dont `addons` mentionne PDJ : tester 'PDJBB' d'ABORD (sinon 'PDJ'
 * capterait aussi les PDJBB). Couverts = adults + children (PAS la règle BB1PAX,
 * propre au décompte des PDJ INCLUS côté In-House).
 */
export function countCovers(
  rows: { addons: string | null; adults: number; children: number }[],
): CoversByCode {
  let coversPDJ = 0
  let coversPDJBB = 0
  for (const r of rows) {
    const addons = (r.addons ?? '').toUpperCase()
    if (!addons.includes('PDJ')) continue
    const covers = (r.adults ?? 0) + (r.children ?? 0)
    if (addons.includes('PDJBB')) coversPDJBB += covers
    else coversPDJ += covers
  }
  return { coversPDJ, coversPDJBB }
}

/** Entrées du calcul des montants PDJ. */
export interface PdjAmountsInput {
  /** Revenus TTC par code petit-déjeuner (rapport Addon Production). */
  addon: AddonProductionRow[]
  /** Couverts In-House (countCovers). */
  covers: CoversByCode
  /** Nombre de couverts EXTRAS (servis au-delà des inclus). */
  extrasCount: number
  /** PDJ inclus saisis À LA MAIN (day-use…), absents de l'Addon : valorisés au
   *  tarif et ajoutés au HT inclus. Défaut 0. Les extras manuels, eux, passent
   *  déjà par `extrasCount`. */
  manualIncludedCount?: number
}

/**
 * Tarif unitaire TTC d'un petit-déjeuner (prix catalogue OKKO). Confirmé au
 * centime par l'Addon Production (revenu PDJ = 19 € × unités facturées). Sert à
 * valoriser les EXTRAS (couverts servis au-delà des inclus), absents de tout
 * fichier. Montants des rapports = TTC → HT via fromTTC (÷ VAT_FACTOR = 1,10).
 * À ajuster ici si le tarif change (source unique).
 */
export const PDJ_EXTRA_TTC = 19

/** Montants HT calculés + contrôle défensif. */
export interface PdjAmounts {
  /** PDJ inclus, HT, arrondi 2 déc. (revenu réel de l'Addon ÷ 1,10). */
  includedHT: number
  /** Extras HT, arrondi 2 déc. : 0 si aucun extra (valorisés au tarif PDJ). */
  extrasHT: number
  /** Total HT (inclus + extras), arrondi 2 déc. */
  totalHT: number
  /** Anomalies non bloquantes (contrôle défensif). */
  warnings: string[]
}

/**
 * Calcule les montants HT de la journée.
 *
 * - `includedTtc` = Σ revenue des codes petit-déjeuner (valeur RÉELLE du fichier
 *   Addon) → `includedHT = round2(fromTTC(includedTtc))`.
 * - `extrasHT` = 0 si extrasCount = 0 ; sinon `round2(fromTTC(extrasCount ×
 *   PDJ_EXTRA_TTC))` — valorisés au TARIF catalogue, pas déduits des couverts.
 * - `totalHT` = `round2(fromTTC(includedTtc + extrasCount × PDJ_EXTRA_TTC))` :
 *   arrondi AU TOTAL uniquement, jamais au prix unitaire.
 *
 * Les extras sont valorisés au tarif (PDJ_EXTRA_TTC) et non plus via
 * « revenu ÷ couverts » : ce ratio dérivait (~1 couvert In-House de plus que
 * d'unités facturées) et sortait ~18,67 € au lieu de 19 € → 16,97 au lieu de
 * 17,27 HT. L'inclus, lui, reste le revenu réel du fichier (÷ 1,10).
 */
export function computePdjAmounts(input: PdjAmountsInput): PdjAmounts {
  const { addon, covers, extrasCount, manualIncludedCount = 0 } = input
  const warnings: string[] = []

  // Inclus = revenu Addon + PDJ inclus saisis à la main (valorisés au tarif).
  const includedTtc =
    addon.reduce((sum, r) => sum + r.revenue, 0) +
    manualIncludedCount * PDJ_EXTRA_TTC
  const includedHT = round2(fromTTC(includedTtc))

  // Contrôle défensif : un code facturé (revenu > 0) sans couvert In-House
  // signale un In-House incomplet ou une incohérence d'import.
  const coversFor = (code: string): number | null => {
    if (code === 'PDJ') return covers.coversPDJ
    if (code === 'PDJBB') return covers.coversPDJBB
    return null // couverts inconnus pour ce code
  }
  for (const r of addon) {
    if (r.revenue > 0 && coversFor(r.code) === 0) {
      warnings.push(`Revenu ${r.code} sans couvert In-House.`)
    }
  }

  // Extras : couverts servis au-delà des inclus, ABSENTS de tout fichier →
  // valorisés au tarif catalogue PDJ. Arrondi AU TOTAL uniquement.
  const extrasTtc = extrasCount * PDJ_EXTRA_TTC
  const extrasHT = extrasCount > 0 ? round2(fromTTC(extrasTtc)) : 0
  const totalHT = round2(fromTTC(includedTtc + extrasTtc))

  return { includedHT, extrasHT, totalHT, warnings }
}

/** Ligne In-House minimale pour le calcul d'un jour (couverts + extras). */
export interface InHouseCoverRow {
  service_date: string
  addons: string | null
  adults: number
  children: number
  guests: number
  breakfasts_served: number
  breakfasts_included: number
}

/** Repère « moyenne par jour » du total HT. `avgTotalHT` null si aucun jour valide. */
export interface DailyBenchmark {
  avgTotalHT: number | null
  days: number
}

/**
 * CA HT (inclus + extras) PAR JOUR — clé `service_date`. MÊME définition que la
 * fiche journalière : CA calculé PAR CHAMBRE (computePdjCA) au tarif DÉTECTÉ dans
 * l'Addon (detectTarifs, rien en dur), pas « Σ revenu Addon ÷ 1,10 ». SOURCE
 * UNIQUE du CA de l'analytique → le même chiffre que le board et le PDF. Retient
 * tout jour In-House dont le CA est chiffrable (> 0) ; le tarif vient de TOUT
 * l'historique Addon, un jour n'a donc pas besoin de sa propre ligne Addon.
 */
export function computeDailyTotals(
  addon: { service_date: string; code: string; revenue: number }[],
  inHouse: InHouseCoverRow[],
): Map<string, number> {
  const tarifs = detectTarifs(
    addon.map((r) => ({ code: r.code, revenue_ttc: r.revenue })),
  )
  const inHouseByDay = new Map<string, InHouseCoverRow[]>()
  for (const r of inHouse) {
    const list = inHouseByDay.get(r.service_date) ?? []
    list.push(r)
    inHouseByDay.set(r.service_date, list)
  }

  const totals = new Map<string, number>()
  for (const [day, rows] of inHouseByDay) {
    const { totalHt } = computePdjCA(rows, tarifs)
    if (totalHt > 0) totals.set(day, totalHt)
  }
  return totals
}

/**
 * Moyenne par JOUR du total HT (inclus + extras), sur les jours ayant à la fois
 * de l'Addon et de l'In-House (cf. computeDailyTotals). null si aucun jour.
 */
export function computeDailyBenchmark(
  addon: { service_date: string; code: string; revenue: number }[],
  inHouse: InHouseCoverRow[],
): DailyBenchmark {
  const totals = [...computeDailyTotals(addon, inHouse).values()]
  if (totals.length === 0) return { avgTotalHT: null, days: 0 }
  const sum = totals.reduce((s, t) => s + t, 0)
  return { avgTotalHT: round2(sum / totals.length), days: totals.length }
}

/** Repère « captage moyen par jour ». `avgCaptage` null si aucun jour renseigné. */
export interface CaptageBenchmark {
  avgCaptage: number | null
  days: number
}

/**
 * Moyenne par JOUR du taux de captage = (inclus + extras) ÷ clients, calculée
 * UNIQUEMENT sur les jours dont la conso a été SAISIE (servi > 0) — « de vraies
 * données ». Moyenne des taux quotidiens (pas un ratio poolé). null si aucun jour.
 */
export function computeCaptageBenchmark(
  inHouse: InHouseCoverRow[],
): CaptageBenchmark {
  const byDay = new Map<
    string,
    { included: number; served: number; extra: number; guests: number }
  >()
  for (const r of inHouse) {
    const d = byDay.get(r.service_date) ?? {
      included: 0,
      served: 0,
      extra: 0,
      guests: 0,
    }
    d.included += r.breakfasts_included
    d.served += r.breakfasts_served
    d.extra += Math.max(0, r.breakfasts_served - r.breakfasts_included)
    d.guests += r.guests
    byDay.set(r.service_date, d)
  }

  const rates: number[] = []
  for (const d of byDay.values()) {
    if (d.served <= 0 || d.guests <= 0) continue // pas de servi saisi → exclu
    rates.push(((d.included + d.extra) / d.guests) * 100)
  }

  if (rates.length === 0) return { avgCaptage: null, days: 0 }
  const sum = rates.reduce((s, r) => s + r, 0)
  return { avgCaptage: round2(sum / rates.length), days: rates.length }
}

/** Repère « occupation moyenne par jour » (chambres et clients). null si aucun jour. */
export interface OccupancyBenchmark {
  avgRooms: number | null
  avgGuests: number | null
  days: number
}

/**
 * Moyenne par JOUR des chambres occupées et des clients, sur TOUS les jours ayant
 * de l'In-House. Une ligne = une chambre-jour (clé unique (service_date, room)),
 * donc chambres/jour = nb de lignes du jour ; clients/jour = Σ guests.
 */
export function computeOccupancyBenchmark(
  inHouse: InHouseCoverRow[],
): OccupancyBenchmark {
  const byDay = new Map<string, { rooms: number; guests: number }>()
  for (const r of inHouse) {
    const d = byDay.get(r.service_date) ?? { rooms: 0, guests: 0 }
    d.rooms += 1
    d.guests += r.guests
    byDay.set(r.service_date, d)
  }

  const days = byDay.size
  if (days === 0) return { avgRooms: null, avgGuests: null, days: 0 }
  let sumRooms = 0
  let sumGuests = 0
  for (const d of byDay.values()) {
    sumRooms += d.rooms
    sumGuests += d.guests
  }
  return {
    avgRooms: round2(sumRooms / days),
    avgGuests: round2(sumGuests / days),
    days,
  }
}

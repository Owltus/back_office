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
import type { PdjAggRow } from '#/lib/pdj/service.ts'

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

/* Repères « moyenne par jour » — formes de retour. Le CALCUL vit désormais
 * uniquement dans `computeAggBenchmarks` (depuis la vue d'agrégation) ; ces
 * interfaces restent la forme publique des trois repères. */

/** Repère « moyenne par jour » du total HT. `avgTotalHT` null si aucun jour valide. */
export interface DailyBenchmark {
  avgTotalHT: number | null
  days: number
}

/** Repère « captage moyen par jour ». `avgCaptage` null si aucun jour renseigné. */
export interface CaptageBenchmark {
  avgCaptage: number | null
  days: number
}

/** Repère « occupation moyenne par jour » (chambres et clients). null si aucun jour. */
export interface OccupancyBenchmark {
  avgRooms: number | null
  avgGuests: number | null
  days: number
}

/* --------------------------------------------------------------------------
 * Calcul du CA et des moyennes/jour DEPUIS LA VUE d'agrégation (pdj_daily_agg,
 * une ligne par jour × code). C'est l'unique chemin : le board, l'analytique ET
 * la bande RepJour passent tous par là — plus aucun scan de la table brute.
 * L'ordre d'arrondi (includedHt et extrasHt arrondis séparément puis sommés puis
 * réarrondis) reproduit au centime celui de la fiche par chambre (breakdown.ts).
 * ------------------------------------------------------------------------ */

/**
 * CA HT (inclus + extras) PAR JOUR depuis les lignes de la vue : inclus valorisés
 * au tarif du CODE, extras au tarif PDJ ; le bucket `code = null` ne porte que des
 * extras (walk-in). Ne retient que les jours au CA chiffrable (> 0). `tarifs` vient
 * de la détection Addon (tout-historique).
 */
export function computeAggDailyTotals(
  rows: PdjAggRow[],
  tarifs: Map<string, number>,
  /** Externes PAR JOUR (service_date → nb), s'additionnent aux extras du jour.
   *  Absent par défaut : n'affecte aucun appelant qui ne le passe pas. */
  externalsByDate: Map<string, number> = new Map(),
): Map<string, number> {
  const unitHt = (code: string): number => {
    const p = tarifs.get(code)
    return p != null ? round2(fromTTC(p)) : 0
  }
  // Par jour : HT des inclus (par code) + nb d'extras (tous codes confondus),
  // moins les extras OFFERTS (gratuits, cf. breakdown.ts) — comptés dans `extra`
  // (stats inchangées) mais jamais dans le CA.
  const byDay = new Map<
    string,
    { includedHt: number; extra: number; offert: number }
  >()
  for (const r of rows) {
    const d = byDay.get(r.service_date) ?? { includedHt: 0, extra: 0, offert: 0 }
    if (r.code && r.included > 0) d.includedHt += r.included * unitHt(r.code)
    d.extra += r.extra
    d.offert += r.offert
    byDay.set(r.service_date, d)
  }
  for (const [date, ext] of externalsByDate) {
    if (ext <= 0) continue
    const d = byDay.get(date) ?? { includedHt: 0, extra: 0, offert: 0 }
    d.extra += ext
    byDay.set(date, d)
  }

  const totals = new Map<string, number>()
  for (const [date, d] of byDay) {
    // Même arrondi que computePdjCA : inclus et extras arrondis séparément.
    const includedHt = round2(d.includedHt)
    const extrasHt = round2(Math.max(0, d.extra - d.offert) * unitHt('PDJ'))
    const totalHt = round2(includedHt + extrasHt)
    if (totalHt > 0) totals.set(date, totalHt)
  }
  return totals
}

/** Les trois repères « moyenne par jour » du board, calculés depuis la vue. */
export interface AggBenchmarks {
  total: DailyBenchmark
  captage: CaptageBenchmark
  occupancy: OccupancyBenchmark
}

/**
 * Calcule d'un coup les 3 moyennes/jour du board depuis les lignes de la vue :
 *  - `total`   : CA HT moyen / jour (jours au CA > 0) ;
 *  - `captage` : (inclus + extras) ÷ clients, moyenne des taux quotidiens sur les
 *                jours dont la conso a été SAISIE (servi > 0) ;
 *  - `occupancy` : chambres et clients moyens / jour (tous jours présents).
 * Le board utilise les trois ; la bande RepJour n'en prend que `total` + `captage`.
 */
export function computeAggBenchmarks(
  rows: PdjAggRow[],
  tarifs: Map<string, number>,
): AggBenchmarks {
  // Total HT / jour : réutilise computeAggDailyTotals (mêmes jours retenus).
  const totalsMap = computeAggDailyTotals(rows, tarifs)
  const totalsArr = [...totalsMap.values()]
  const total: DailyBenchmark =
    totalsArr.length === 0
      ? { avgTotalHT: null, days: 0 }
      : {
          avgTotalHT: round2(
            totalsArr.reduce((s, t) => s + t, 0) / totalsArr.length,
          ),
          days: totalsArr.length,
        }

  // Totaux par jour (sommés entre codes) pour captage + occupation.
  const byDay = new Map<
    string,
    { included: number; served: number; extra: number; guests: number; rooms: number }
  >()
  for (const r of rows) {
    const d =
      byDay.get(r.service_date) ??
      { included: 0, served: 0, extra: 0, guests: 0, rooms: 0 }
    d.included += r.included
    d.served += r.served
    d.extra += r.extra
    d.guests += r.guests
    d.rooms += r.rooms
    byDay.set(r.service_date, d)
  }

  // Captage : moyenne des taux quotidiens, jours servis (servi > 0, clients > 0).
  const rates: number[] = []
  for (const d of byDay.values()) {
    if (d.served <= 0 || d.guests <= 0) continue
    rates.push(((d.included + d.extra) / d.guests) * 100)
  }
  const captage: CaptageBenchmark =
    rates.length === 0
      ? { avgCaptage: null, days: 0 }
      : {
          avgCaptage: round2(rates.reduce((s, r) => s + r, 0) / rates.length),
          days: rates.length,
        }

  // Occupation : chambres et clients moyens sur tous les jours présents.
  const days = byDay.size
  let sumRooms = 0
  let sumGuests = 0
  for (const d of byDay.values()) {
    sumRooms += d.rooms
    sumGuests += d.guests
  }
  const occupancy: OccupancyBenchmark =
    days === 0
      ? { avgRooms: null, avgGuests: null, days: 0 }
      : {
          avgRooms: round2(sumRooms / days),
          avgGuests: round2(sumGuests / days),
          days,
        }

  return { total, captage, occupancy }
}

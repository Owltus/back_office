import { computeEcarts, fundEcart } from '#/lib/caisse/calc.ts'
import { PAY_KEYS } from '#/lib/caisse/constants.ts'
import type { CaisseSheet, EcartKey } from '#/lib/caisse/types.ts'

/*
 * Agrégation analytique des feuilles de caisse (métier pur, sans React).
 *
 * Alimente `CaisseAnalytiqueBoard` : à partir des feuilles brutes (une par
 * couple (report_date, shift)), produit une synthèse mensuelle sur une année.
 * Aucune écriture, aucun accès réseau ici — les feuilles sont lues en amont par
 * `fetchSheets`. On ne s'appuie QUE sur les champs existants de `CaisseSheet`
 * (report_date, status, bloc `caisse`, écarts calculés, écart de fond).
 */

/** Colonnes d'écart agrégées (paiements + web). */
const ECART_COLS: ReadonlyArray<EcartKey> = [...PAY_KEYS, 'web']

/** Synthèse d'un mois (indices 1..12). */
export interface CaisseMonthStats {
  month: number
  /** Feuilles saisies (toutes, brouillon compris) sur le mois. */
  sheets: number
  /** Feuilles clôturées (status validated). */
  validated: number
  /** Feuilles encore en brouillon (status draft). */
  draft: number
  /** Écart de paiement cumulé, en valeur absolue, tous modes confondus. */
  ecartTotal: number
  /** Écart de fond de caisse cumulé (signé). */
  fundEcart: number
  /** Réel encaissé cumulé — espèces. */
  cash: number
  /** Réel encaissé cumulé — carte bancaire. */
  cb: number
  /** Réel encaissé cumulé — chèques vacances. */
  cvac: number
  /** Réel encaissé cumulé — carte web / Adyen. */
  adyen: number
  /** Total réel encaissé cumulé (cash + cb + cvac + adyen). */
  encaisse: number
}

/** Un mois vide (aucune feuille). */
function emptyMonth(month: number): CaisseMonthStats {
  return {
    month,
    sheets: 0,
    validated: 0,
    draft: 0,
    ecartTotal: 0,
    fundEcart: 0,
    cash: 0,
    cb: 0,
    cvac: 0,
    adyen: 0,
    encaisse: 0,
  }
}

/**
 * Agrège les feuilles d'une année en 12 synthèses mensuelles. Les feuilles hors
 * `year` sont ignorées. L'écart total agrège la valeur absolue de chaque mode
 * (`computeEcarts`) — un écart positif et un négatif ne se compensent pas ; le
 * réel encaissé provient du bloc `caisse` (montants réellement comptés).
 */
export function aggregateCaisseMonthly(
  sheets: CaisseSheet[],
  year: number,
): CaisseMonthStats[] {
  const months = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1))

  const prefix = `${year}-`
  for (const s of sheets) {
    if (!s.reportDate.startsWith(prefix)) continue
    const m = Number(s.reportDate.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue

    const t = months[m]
    t.sheets += 1
    if (s.status === 'validated') t.validated += 1
    else t.draft += 1

    const ecarts = computeEcarts(s)
    for (const c of ECART_COLS) t.ecartTotal += Math.abs(ecarts[c])
    t.fundEcart += fundEcart(s)

    t.cash += s.caisse.cash
    t.cb += s.caisse.cb
    t.cvac += s.caisse.cvac
    t.adyen += s.caisse.adyen
    t.encaisse += s.caisse.cash + s.caisse.cb + s.caisse.cvac + s.caisse.adyen
  }

  return months
}

/** Synthèse d'un jour — une entrée par date du mois où au moins une feuille existe. */
export interface CaisseDayStats {
  /** Date du jour, format YYYY-MM-DD. */
  date: string
  /** Numéro du jour dans le mois (1..31). */
  day: number
  /** Feuilles saisies ce jour, tous shifts confondus. */
  sheets: number
  /** Écart de paiement cumulé du jour, en valeur absolue, tous modes. */
  ecartTotal: number
  /** Écart de fond de caisse cumulé du jour (signé). */
  fundEcart: number
  /** Total réel encaissé du jour (cash + cb + cvac + adyen). */
  encaisse: number
}

/**
 * Agrège les feuilles d'un mois en synthèses journalières — même logique que
 * `aggregateCaisseMonthly` mais groupée par jour. Ne renvoie QUE les jours où au
 * moins une feuille existe (triés par date croissante). L'écart total agrège la
 * valeur absolue de chaque mode (`computeEcarts`) ; le réel encaissé provient du
 * bloc `caisse` (montants réellement comptés).
 */
export function aggregateCaisseDaily(
  sheets: CaisseSheet[],
  year: number,
  month: number,
): CaisseDayStats[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  const byDate = new Map<string, CaisseDayStats>()

  for (const s of sheets) {
    if (!s.reportDate.startsWith(prefix)) continue

    let t = byDate.get(s.reportDate)
    if (!t) {
      t = {
        date: s.reportDate,
        day: Number(s.reportDate.slice(8, 10)),
        sheets: 0,
        ecartTotal: 0,
        fundEcart: 0,
        encaisse: 0,
      }
      byDate.set(s.reportDate, t)
    }

    t.sheets += 1

    const ecarts = computeEcarts(s)
    for (const c of ECART_COLS) t.ecartTotal += Math.abs(ecarts[c])
    t.fundEcart += fundEcart(s)

    t.encaisse += s.caisse.cash + s.caisse.cb + s.caisse.cvac + s.caisse.adyen
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Années présentes dans une liste de feuilles (croissant), fallback inclus. */
export function yearsFromSheets(sheets: CaisseSheet[], fallback: number): number[] {
  const set = new Set<number>()
  for (const s of sheets) {
    const y = Number(s.reportDate.slice(0, 4))
    if (Number.isFinite(y)) set.add(y)
  }
  set.add(fallback)
  return [...set].sort((a, b) => a - b)
}

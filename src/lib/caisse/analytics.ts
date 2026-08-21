import { computeEcarts, fundEcart, hasCountedFund } from '#/lib/caisse/calc.ts'
import { effectiveFundTarget } from '#/lib/caisse/cautions.ts'
import { ECART_KEYS, EPSILON, FUND_TARGET } from '#/lib/caisse/constants.ts'
import type { Caution, CaisseSheet } from '#/lib/caisse/types.ts'

/*
 * Agrégation analytique des feuilles de caisse (métier pur, sans React).
 *
 * Alimente les deux vues analytique caisse (annuelle et détail mensuel) : à partir
 * des feuilles brutes (une par couple (report_date, shift)), produit des synthèses
 * par mois ou par jour. Aucune écriture ni accès réseau — les feuilles sont lues en
 * amont par `fetchSheets`.
 *
 * PARTI PRIS ANALYTIQUE : on ne remonte que le SIGNAL MÉTIER — l'argent réellement
 * encaissé, ventilé par moyen de paiement (espèces, CB, chèques vacances, Adyen),
 * plus une simple FRÉQUENCE d'anomalies (nombre de feuilles présentant un écart).
 * Le détail du rapprochement (attendu StayNTouch / Lightspeed, montant des écarts
 * par mode, écart de fond signé) reste OPÉRATIONNEL : sa place est la feuille du
 * jour, pas l'analytique. Un écart justifié étant normal, le cumul des montants
 * d'écart n'apporte rien d'exploitable à cette maille ; le nombre de fois où un
 * écart survient, si.
 *
 * SEULES LES FEUILLES CLÔTURÉES COMPTENT : on n'agrège que les feuilles `validated`.
 * Un brouillon (`draft`) porte des montants provisoires (comptage en cours) qui
 * fausseraient les cumuls ; on l'ignore tant qu'il n'est pas clôturé.
 *
 * FOND DE CAISSE EFFECTIF (cautions) : le fond attendu n'est jamais lu depuis
 * une valeur stockée — il se recalcule pour CHAQUE feuille via
 * `effectiveFundTarget(cautions, reportDate, FUND_TARGET)` (lib/caisse/cautions.ts,
 * décision D4). Une caution ajoutée en retard corrige donc aussi, automatiquement,
 * le décompte d'anomalies d'un mois déjà passé.
 */

/**
 * Vrai si une feuille clôturée présente une ANOMALIE : soit un écart de paiement
 * (un mode ≥ EPSILON entre attendu et réel), soit un écart de fond de caisse (fond
 * réellement compté et différent de la cible EFFECTIVE, plancher + cautions actives
 * ce jour-là). Un fond NON compté (nuit non faite) ne compte pas — c'est une
 * absence de comptage, pas un écart.
 */
function hasAnomaly(s: CaisseSheet, effectiveTarget: number): boolean {
  const ecarts = computeEcarts(s)
  if (ECART_KEYS.some((c) => Math.abs(ecarts[c]) >= EPSILON)) return true
  return hasCountedFund(s) && Math.abs(fundEcart(s, effectiveTarget)) >= EPSILON
}

/** Réel encaissé (ventilé par moyen de paiement) + fréquence d'anomalies. Métriques
 * communes aux deux vues — portées aussi bien par `CaisseMonthStats` que par
 * `CaisseDayStats`, et sommées par `summarize` pour les cartes de synthèse. */
export interface CaisseSummary {
  /** Feuilles CLÔTURÉES agrégées — sert à distinguer une période sans donnée. */
  sheets: number
  /** Réel encaissé — espèces. */
  cash: number
  /** Réel encaissé — carte bancaire (TPE). */
  cb: number
  /** Réel encaissé — chèques vacances. */
  cvac: number
  /** Réel encaissé — carte web / Adyen. */
  adyen: number
  /** Total réel encaissé (cash + cb + cvac + adyen). */
  encaisse: number
  /** Feuilles clôturées présentant une anomalie (écart de paiement ou de fond). */
  anomalies: number
}

/** Synthèse d'un mois (indices 1..12). */
export interface CaisseMonthStats extends CaisseSummary {
  month: number
}

/** Synthèse d'un jour du mois. */
export interface CaisseDayStats extends CaisseSummary {
  /** Date du jour, format YYYY-MM-DD. */
  date: string
  /** Numéro du jour dans le mois (1..31). */
  day: number
}

/** Cumul vierge des métriques de synthèse. */
function emptySummary(): CaisseSummary {
  return { sheets: 0, cash: 0, cb: 0, cvac: 0, adyen: 0, encaisse: 0, anomalies: 0 }
}

/** Ajoute une feuille clôturée à un cumul de synthèse (mutation en place). */
function addSheet(t: CaisseSummary, s: CaisseSheet, cautions: Caution[]): void {
  t.sheets += 1
  t.cash += s.caisse.cash
  t.cb += s.caisse.cb
  t.cvac += s.caisse.cvac
  t.adyen += s.caisse.adyen
  t.encaisse += s.caisse.cash + s.caisse.cb + s.caisse.cvac + s.caisse.adyen
  const target = effectiveFundTarget(cautions, s.reportDate, FUND_TARGET)
  if (hasAnomaly(s, target)) t.anomalies += 1
}

/**
 * Agrège les feuilles d'une année en 12 synthèses mensuelles. Les feuilles hors
 * `year` OU non clôturées (brouillon) sont ignorées. Le réel encaissé provient du
 * bloc `caisse` (montants réellement comptés), ventilé par moyen de paiement.
 */
export function aggregateCaisseMonthly(
  sheets: CaisseSheet[],
  year: number,
  cautions: Caution[] = [],
): CaisseMonthStats[] {
  const months: CaisseMonthStats[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    ...emptySummary(),
  }))

  const prefix = `${year}-`
  for (const s of sheets) {
    if (s.status !== 'validated') continue // seules les feuilles clôturées comptent
    if (!s.reportDate.startsWith(prefix)) continue
    const m = Number(s.reportDate.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue
    addSheet(months[m], s, cautions)
  }

  return months
}

/**
 * Agrège les feuilles d'un mois en synthèses journalières — même logique que
 * `aggregateCaisseMonthly`, groupée par jour. Ne renvoie QUE les jours où au moins
 * une feuille CLÔTURÉE existe (triés par date croissante).
 */
export function aggregateCaisseDaily(
  sheets: CaisseSheet[],
  year: number,
  month: number,
  cautions: Caution[] = [],
): CaisseDayStats[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  const byDate = new Map<string, CaisseDayStats>()

  for (const s of sheets) {
    if (s.status !== 'validated') continue // seules les feuilles clôturées comptent
    if (!s.reportDate.startsWith(prefix)) continue

    let t = byDate.get(s.reportDate)
    if (!t) {
      t = {
        date: s.reportDate,
        day: Number(s.reportDate.slice(8, 10)),
        ...emptySummary(),
      }
      byDate.set(s.reportDate, t)
    }
    addSheet(t, s, cautions)
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Somme les métriques de synthèse sur un ensemble de lignes (mois ou jours). */
export function summarize(rows: ReadonlyArray<CaisseSummary>): CaisseSummary {
  return rows.reduce((a, r) => {
    a.sheets += r.sheets
    a.cash += r.cash
    a.cb += r.cb
    a.cvac += r.cvac
    a.adyen += r.adyen
    a.encaisse += r.encaisse
    a.anomalies += r.anomalies
    return a
  }, emptySummary())
}

/** Années présentes dans une liste de feuilles (croissant), fallback inclus. */
export function yearsFromSheets(
  sheets: CaisseSheet[],
  fallback: number,
): number[] {
  const set = new Set<number>()
  for (const s of sheets) {
    const y = Number(s.reportDate.slice(0, 4))
    if (Number.isFinite(y)) set.add(y)
  }
  set.add(fallback)
  return [...set].sort((a, b) => a - b)
}

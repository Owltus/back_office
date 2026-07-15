/*
 * Constantes métier de la feuille de caisse.
 */

import type { Counts, DenomKey, EcartKey, PayKey, Shift } from '#/lib/caisse/types.ts'

/**
 * Coupures / pièces, dans l'ordre de la feuille papier (500 € → 0,01 €).
 * Donnée métier pure : le visuel (SVG) vit dans `assets/euros` (présentation),
 * et billet vs pièce se dérive de `value` (≥ 5 € = billet).
 */
export const DENOMINATIONS: ReadonlyArray<{
  key: DenomKey
  value: number
  label: string
}> = [
  { key: 'cnt_500', value: 500, label: '500 €' },
  { key: 'cnt_200', value: 200, label: '200 €' },
  { key: 'cnt_100', value: 100, label: '100 €' },
  { key: 'cnt_50', value: 50, label: '50 €' },
  { key: 'cnt_20', value: 20, label: '20 €' },
  { key: 'cnt_10', value: 10, label: '10 €' },
  { key: 'cnt_5', value: 5, label: '5 €' },
  { key: 'cnt_2', value: 2, label: '2 €' },
  { key: 'cnt_1', value: 1, label: '1 €' },
  { key: 'cnt_050', value: 0.5, label: '0,50 €' },
  { key: 'cnt_020', value: 0.2, label: '0,20 €' },
  { key: 'cnt_010', value: 0.1, label: '0,10 €' },
  { key: 'cnt_005', value: 0.05, label: '0,05 €' },
  { key: 'cnt_002', value: 0.02, label: '0,02 €' },
  { key: 'cnt_001', value: 0.01, label: '0,01 €' },
]

/** Comptage vierge (toutes les coupures à 0). */
export const emptyCounts = (): Counts =>
  DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.key]: 0 }), {} as Counts)

/** Fond de caisse d'origine attendu (€). */
export const FUND_TARGET = 150

/**
 * Fenêtre de grâce éditable après validation (heures) — D1.
 * DOIT rester égale à l'`interval` de la policy RLS UPDATE
 * (supabase/caisse_sheets.sql). Changer l'un impose de changer l'autre.
 */
export const GRACE_HOURS = 24

/** Tolérance d'égalité pour considérer un écart « à zéro » (arrondis centime). */
export const EPSILON = 0.005

export const SHIFTS: ReadonlyArray<Shift> = ['matin', 'soir', 'nuit']

export const SHIFT_LABELS: Record<Shift, string> = {
  matin: 'Matin',
  soir: 'Soir',
  nuit: 'Nuit',
}

/** Libellés complets des colonnes de paiement (tableau des montants / écarts). */
export const ECART_LABELS: Record<EcartKey, string> = {
  cash: 'Espèces',
  cb: 'Carte bancaire',
  cvac: 'Chèques vacances',
  web: 'Carte web / Adyen',
}

/** Modes de paiement communs (hors web). */
export const PAY_KEYS: ReadonlyArray<PayKey> = ['cash', 'cb', 'cvac']

/** Toutes les colonnes d'écart (paiements + web). Base de l'agrégation analytique
 * (tous shifts confondus) ; l'UI et le PDF en prennent le sous-ensemble du shift
 * via `paymentColumns`. */
export const ECART_KEYS: ReadonlyArray<EcartKey> = [...PAY_KEYS, 'web']

/** CB WEB (StayNTouch) / ADYEN (caisse) concernent les shifts du matin ET du soir
 * (pas la nuit). Source unique de la règle : l'UI et le PDF s'y réfèrent. */
export const isWebRelevant = (shift: Shift): boolean =>
  shift === 'matin' || shift === 'soir'

/** Colonnes de paiement affichées pour un shift : web ajouté matin et soir, pas
 * la nuit. Source unique de la composition — board et PDF s'y réfèrent au lieu de
 * recomposer `[...PAY_KEYS, 'web']` chacun de leur côté. */
export const paymentColumns = (shift: Shift): EcartKey[] =>
  isWebRelevant(shift) ? [...ECART_KEYS] : [...PAY_KEYS]

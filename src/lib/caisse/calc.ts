/*
 * Calculs purs de la feuille de caisse (aucun React, aucun Supabase).
 *
 * Règle des écarts : écart d'un mode = (attendu StayNTouch + Lightspeed)
 * − réel compté en caisse. Tous doivent être à 0 €. Le mode « web » compare la
 * CB WEB attendue (StayNTouch, `cbweb`) au réel ADYEN, sans Lightspeed.
 *
 * Le total du fond de caisse est calculé en centimes ENTIERS pour éviter les
 * artefacts flottants (0,10 + 0,20 ≠ 0,30 en binaire).
 */

import { DENOMINATIONS, EPSILON, FUND_TARGET, PAY_KEYS } from '#/lib/caisse/constants.ts'
import type { CaisseSheet, CaisseSheetInput, EcartKey } from '#/lib/caisse/types.ts'

type SheetAmounts = Pick<CaisseSheet, 'snt' | 'ls' | 'caisse'>

/** Écart par mode de paiement : (attendu SNT + LS) − réel caisse. */
export function computeEcarts(s: SheetAmounts): Record<EcartKey, number> {
  const out = {} as Record<EcartKey, number>
  for (const k of PAY_KEYS) {
    out[k] = round2(s.snt[k] + s.ls[k] - s.caisse[k])
  }
  out.web = round2(s.snt.cbweb - s.caisse.adyen)
  return out
}

/** Total réel compté dans le fond de caisse (Σ nombre × valeur), en euros. */
export function fundTotal(s: Pick<CaisseSheet, 'counts'>): number {
  const cents = DENOMINATIONS.reduce(
    (acc, d) => acc + Math.round(d.value * 100) * (s.counts[d.key] ?? 0),
    0,
  )
  return cents / 100
}

/** Écart du fond de caisse : total compté − fond d'origine (doit être 0). */
export function fundEcart(s: Pick<CaisseSheet, 'counts' | 'fundOrigin'>): number {
  return round2(fundTotal(s) - (s.fundOrigin || FUND_TARGET))
}

/** Vrai si tous les écarts (paiements + fond) sont à zéro à la tolérance près. */
export function isBalanced(s: SheetAmounts & Pick<CaisseSheet, 'counts' | 'fundOrigin'>): boolean {
  const ecarts = computeEcarts(s)
  const paymentsOk = Object.values(ecarts).every((v) => Math.abs(v) < EPSILON)
  return paymentsOk && Math.abs(fundEcart(s)) < EPSILON
}

/** Somme d'une colonne attendue (SNT + LS) pour un mode donné. */
export function expected(s: SheetAmounts, k: EcartKey): number {
  if (k === 'web') return round2(s.snt.cbweb)
  return round2(s.snt[k] + s.ls[k])
}

/** Feuille vierge (montants à 0) pour une date + shift. */
export function emptyInput(
  reportDate: string,
  shift: CaisseSheet['shift'],
  counts: CaisseSheet['counts'],
): CaisseSheetInput {
  return {
    reportDate,
    shift,
    operatorInitials: '',
    snt: { cash: 0, cb: 0, cvac: 0, cbweb: 0 },
    ls: { cash: 0, cb: 0, cvac: 0 },
    caisse: { cash: 0, cb: 0, cvac: 0, adyen: 0 },
    counts,
    fundOrigin: FUND_TARGET,
    comment: '',
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

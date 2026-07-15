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

/** Vrai si le fond a été compté (au moins une coupure > 0) — donc un « vrai
 * rapport ». Un shift sans fond compté (nuit non faite) n'est pas une source de
 * report valable : on remonte au dernier shift réellement compté. */
export function hasCountedFund(s: Pick<CaisseSheet, 'counts'>): boolean {
  return fundTotal(s) > 0
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

/** Feuille chargée → saisie (copie profonde des blocs éditables). */
export function sheetToInput(s: CaisseSheet): CaisseSheetInput {
  return {
    reportDate: s.reportDate,
    shift: s.shift,
    operatorInitials: s.operatorInitials,
    snt: { ...s.snt },
    ls: { ...s.ls },
    caisse: { ...s.caisse },
    counts: { ...s.counts },
    fundOrigin: s.fundOrigin,
    comment: s.comment,
  }
}

/** Fusionne une saisie dans la feuille de base (pour un cache optimiste) :
 * conserve id / statut / validation / horodatage, remplace le contenu saisi. */
export function inputToSheet(
  input: CaisseSheetInput,
  base: CaisseSheet | null,
): CaisseSheet {
  return {
    id: base?.id ?? '',
    reportDate: input.reportDate,
    shift: input.shift,
    operatorInitials: input.operatorInitials,
    snt: input.snt,
    ls: input.ls,
    caisse: input.caisse,
    counts: input.counts,
    fundOrigin: input.fundOrigin,
    comment: input.comment,
    status: base?.status ?? 'draft',
    validatedAt: base?.validatedAt ?? null,
    validatedBy: base?.validatedBy ?? null,
    countersignedBy: base?.countersignedBy ?? null,
    createdBy: base?.createdBy ?? '',
    createdAt: base?.createdAt ?? '',
    updatedAt: base?.updatedAt ?? '',
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

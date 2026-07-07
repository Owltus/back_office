/*
 * Types de la feuille de caisse (table `caisse_sheets`).
 *
 * Deux représentations : la ligne DB `snake_case` (miroir exact du schéma, voir
 * supabase/caisse_sheets.sql) et le modèle app `camelCase` avec les montants
 * regroupés par bloc (StayNTouch / Lightspeed / Caisse) et le comptage des
 * coupures en objet — la conversion se fait dans service.ts (mappers).
 */

export type Shift = 'matin' | 'soir' | 'nuit'
export type SheetStatus = 'draft' | 'validated'

/** Modes de paiement communs aux trois blocs (colonnes du tableau). */
export type PayKey = 'cash' | 'cb' | 'cvac'
/** Modes présents dans la ligne d'écarts (+ web = CB WEB attendu / ADYEN réel). */
export type EcartKey = PayKey | 'web'

/** Clés de comptage du fond de caisse — identiques aux colonnes DB `cnt_*`. */
export type DenomKey =
  | 'cnt_500' | 'cnt_200' | 'cnt_100' | 'cnt_50' | 'cnt_20'
  | 'cnt_10' | 'cnt_5' | 'cnt_2' | 'cnt_1'
  | 'cnt_050' | 'cnt_020' | 'cnt_010' | 'cnt_005' | 'cnt_002' | 'cnt_001'

export type Counts = Record<DenomKey, number>

/** Montants attendus StayNTouch (réception). `cbweb` = CB WEB (toutes), soir. */
export interface SntAmounts {
  cash: number; cb: number; cvac: number; cbweb: number
}
/** Montants attendus Lightspeed (club). */
export interface LsAmounts {
  cash: number; cb: number; cvac: number
}
/** Montants réels comptés dans la caisse. `adyen` = CB WEB réel, soir. */
export interface CaisseAmounts {
  cash: number; cb: number; cvac: number; adyen: number
}

/** Modèle app d'une feuille de caisse. */
export interface CaisseSheet {
  id: string
  reportDate: string
  shift: Shift
  operatorInitials: string
  snt: SntAmounts
  ls: LsAmounts
  caisse: CaisseAmounts
  counts: Counts
  fundOrigin: number
  comment: string
  status: SheetStatus
  validatedAt: string | null
  validatedBy: string | null
  countersignedBy: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** Champs éditables d'une feuille (saisie), sans les métadonnées de validation. */
export type CaisseSheetInput = Pick<
  CaisseSheet,
  'reportDate' | 'shift' | 'operatorInitials' | 'snt' | 'ls' | 'caisse' | 'counts' | 'fundOrigin' | 'comment'
>

/** Ligne DB (snake_case) — miroir exact de `public.caisse_sheets`. */
export interface DbCaisseSheet {
  id: string
  report_date: string
  shift: Shift
  operator_initials: string
  snt_cash: number; snt_cb: number; snt_cvac: number; snt_cbweb: number
  ls_cash: number; ls_cb: number; ls_cvac: number
  caisse_cash: number; caisse_cb: number; caisse_cvac: number; caisse_adyen: number
  cnt_500: number; cnt_200: number; cnt_100: number; cnt_50: number; cnt_20: number
  cnt_10: number; cnt_5: number; cnt_2: number; cnt_1: number
  cnt_050: number; cnt_020: number; cnt_010: number
  cnt_005: number; cnt_002: number; cnt_001: number
  fund_origin: number
  comment: string
  status: SheetStatus
  validated_at: string | null
  validated_by: string | null
  countersigned_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}

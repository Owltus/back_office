# Étape 2 — Métier : `src/lib/caisse/` (types, constants, calculs, service)

## Objectif

Créer la couche métier pure de la feature Caisse, hors React : les types (ligne DB `snake_case` ↔ modèle app `camelCase`), les constantes (coupures, fond cible 150 €, shifts, durée de grâce), les calculs purs (écarts par mode de paiement, total du fond de caisse, écart de fond, équilibre global) et le service Supabase (lecture `useQuery`-ready, upsert, validation, contre-signature, garde `canEditSheet`).

## Contexte

Modèle : `src/lib/affiche/service.ts` (mappers DB↔app propres) et `src/lib/pdj/service.ts` (upsert idempotent + fonctions CRUD). Formatage réutilisable : `src/lib/repjour/format.ts` (`fmt.eur`, `fmt.ecartEur`). Le calcul est purement dérivé (rien de stocké) : écart d'un mode = `(snt + ls) - caisse` ; total fond = `Σ(coupure × valeur)` ; écart fond = `total - fund_origin`. La garde `canEditSheet` **reflète** la RLS de l'Étape 1 (autorité réelle) mais permet de griser l'UI sans aller-retour serveur.

## Fichier(s) impacté(s)

- `src/lib/caisse/types.ts` (nouveau)
- `src/lib/caisse/constants.ts` (nouveau)
- `src/lib/caisse/calc.ts` (nouveau)
- `src/lib/caisse/service.ts` (nouveau)

## Travail à réaliser

### 1. `types.ts`

```ts
import type { UserRole } from '#/lib/repjour/types.ts'

export type Shift = 'matin' | 'soir' | 'nuit'
export type SheetStatus = 'draft' | 'validated'

// Modes de paiement présents dans les écarts (colonnes du tableau)
export type EcartKey = 'cash' | 'cb' | 'ax' | 'cheq' | 'cvac' | 'web'

// Ligne DB (snake_case) — miroir exact de caisse_sheets
export interface DbCaisseSheet {
  id: string
  report_date: string
  shift: Shift
  operator_initials: string
  snt_cash: number; snt_cb: number; snt_ax: number
  snt_cheq: number; snt_cvac: number; snt_cbweb: number
  ls_cash: number; ls_cb: number; ls_ax: number; ls_cheq: number; ls_cvac: number
  caisse_cash: number; caisse_cb: number; caisse_ax: number
  caisse_cheq: number; caisse_cvac: number; caisse_adyen: number
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

// Modèle app (camelCase) — voir mappers dans service.ts
export interface CaisseSheet { /* équivalent camelCase de DbCaisseSheet */ }
```

### 2. `constants.ts`

```ts
// Coupures dans l'ordre de la feuille papier : [libellé, valeur €, clé colonne DB]
export const DENOMINATIONS = [
  { key: 'cnt_500', value: 500 },   { key: 'cnt_200', value: 200 },
  { key: 'cnt_100', value: 100 },   { key: 'cnt_50', value: 50 },
  { key: 'cnt_20', value: 20 },     { key: 'cnt_10', value: 10 },
  { key: 'cnt_5', value: 5 },       { key: 'cnt_2', value: 2 },
  { key: 'cnt_1', value: 1 },       { key: 'cnt_050', value: 0.5 },
  { key: 'cnt_020', value: 0.2 },   { key: 'cnt_010', value: 0.1 },
  { key: 'cnt_005', value: 0.05 },  { key: 'cnt_002', value: 0.02 },
  { key: 'cnt_001', value: 0.01 },
] as const

export const FUND_TARGET = 150            // fond de caisse d'origine (€)
export const GRACE_HOURS = 3              // fenêtre de grâce post-validation (D1) — DOIT égaler la RLS
export const SHIFTS = ['matin', 'soir', 'nuit'] as const
export const SHIFT_LABELS: Record<string, string> = { matin: 'Matin', soir: 'Soir', nuit: 'Nuit' }
// CB WEB / ADYEN ne concernent que le shift du soir (règle métier de la feuille)
export const isEveningOnlyRelevant = (shift: string) => shift === 'soir'
```

### 3. `calc.ts` (pur, testable)

```ts
import { DENOMINATIONS, FUND_TARGET } from './constants.ts'
import type { CaisseSheet, EcartKey } from './types.ts'

// Écart d'un mode = (attendu StayNTouch + Lightspeed) - réel CAISSE. Doit être 0.
export function computeEcarts(s: CaisseSheet): Record<EcartKey, number> {
  return {
    cash: (s.sntCash + s.lsCash) - s.caisseCash,
    cb:   (s.sntCb + s.lsCb) - s.caisseCb,
    ax:   (s.sntAx + s.lsAx) - s.caisseAx,
    cheq: (s.sntCheq + s.lsCheq) - s.caisseCheq,
    cvac: (s.sntCvac + s.lsCvac) - s.caisseCvac,
    web:  s.sntCbweb - s.caisseAdyen,           // pas de Lightspeed sur le web
  }
}

// Total du fond de caisse compté = Σ(nombre × valeur). Arrondi centime.
export function fundTotal(s: CaisseSheet): number {
  const cents = DENOMINATIONS.reduce(
    (acc, d) => acc + Math.round(d.value * 100) * (s.counts[d.key] ?? 0), 0)
  return cents / 100
}

export const fundEcart = (s: CaisseSheet): number => fundTotal(s) - FUND_TARGET   // doit être 0
export const isBalanced = (s: CaisseSheet): boolean =>
  Object.values(computeEcarts(s)).every(v => Math.abs(v) < 0.005)
  && Math.abs(fundEcart(s)) < 0.005
```

Note : garder les montants en centimes entiers pour la somme évite les artefacts flottants (0,1 + 0,2). Adapter `s.counts[...]` à la forme retenue du modèle app (objet `counts` OU champs plats — cohérent avec le mapper).

### 4. `service.ts` (Supabase + garde de verrou)

```ts
import { supabase } from '#/lib/supabase.ts'
import { GRACE_HOURS } from './constants.ts'
import type { CaisseSheet, DbCaisseSheet, Shift, UserRole } from './types.ts'

const toSheet = (r: DbCaisseSheet): CaisseSheet => ({ /* snake → camel */ })
const toDbUpsert = (s: Partial<CaisseSheet>): Partial<DbCaisseSheet> => ({ /* camel → snake */ })

export async function fetchSheets(): Promise<CaisseSheet[]> {
  const { data, error } = await supabase
    .from('caisse_sheets').select('*').order('report_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toSheet)
}

export async function fetchSheet(date: string, shift: Shift): Promise<CaisseSheet | null> {
  const { data, error } = await supabase
    .from('caisse_sheets').select('*')
    .eq('report_date', date).eq('shift', shift).maybeSingle()
  if (error) throw error
  return data ? toSheet(data) : null
}

// Brouillon : upsert idempotent sur (report_date, shift)
export async function upsertSheet(input: Partial<CaisseSheet>): Promise<void> {
  const { error } = await supabase
    .from('caisse_sheets').upsert(toDbUpsert(input), { onConflict: 'report_date,shift' })
  if (error) throw error
}

// Validation : pose status/validated_at/validated_by (côté RLS : encore autorisé car validated_at était null)
export async function validateSheet(id: string, userId: string): Promise<void> {
  const { error } = await supabase.from('caisse_sheets')
    .update({ status: 'validated', validated_at: new Date().toISOString(), validated_by: userId })
    .eq('id', id)
  if (error) throw error
}

export async function countersign(id: string, userId: string): Promise<void> {
  const { error } = await supabase.from('caisse_sheets')
    .update({ countersigned_by: userId }).eq('id', id)
  if (error) throw error
}

// Déverrouillage admin : remet en brouillon (RLS n'autorise l'update hors fenêtre qu'à l'admin)
export async function reopenSheet(id: string): Promise<void> {
  const { error } = await supabase.from('caisse_sheets')
    .update({ status: 'draft', validated_at: null, validated_by: null }).eq('id', id)
  if (error) throw error
}

// Garde ergonomique — REFLÈTE la RLS de l'Étape 1 (la RLS reste l'autorité).
export function canEditSheet(sheet: CaisseSheet | null, role: UserRole | null): boolean {
  if (role !== 'super_utilisateur' && role !== 'admin') return false
  if (!sheet || sheet.status !== 'validated' || !sheet.validatedAt) return true
  if (role === 'admin') return true
  const graceEnd = new Date(sheet.validatedAt).getTime() + GRACE_HOURS * 3600_000
  return Date.now() < graceEnd
}
```

## Ordre d'exécution

1. `types.ts` (le modèle app camelCase doit couvrir toutes les colonnes DB).
2. `constants.ts` (DENOMINATIONS/GRACE_HOURS ; `GRACE_HOURS` **doit** égaler l'`interval` SQL).
3. `calc.ts` + un test `calc.test.ts` optionnel (écarts, fundTotal en centimes) sur le modèle `src/lib/pdj/csv.test.ts`.
4. `service.ts` (mappers d'abord, puis fonctions ; convention `if (error) throw error`).

## Critère de validation

- `npx tsc --noEmit` passe (types DB alignés avec le schéma de l'Étape 1).
- `computeEcarts` et `fundTotal` sont purs (aucun import React ni Supabase dans `calc.ts`).
- `fundTotal` calculé en centimes entiers : `0,10 + 0,20 = 0,30` exactement (pas de dérive flottante).
- `canEditSheet` : retourne `false` pour `utilisateur` ; `true` pour un brouillon ; `false` pour un `super_utilisateur` sur feuille validée hors fenêtre ; `true` pour l'`admin` en toutes circonstances — **même logique que la policy RLS**.
- `GRACE_HOURS` (constante TS) == fenêtre de l'`interval` SQL (aujourd'hui 3 h).

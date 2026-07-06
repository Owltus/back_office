import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  LockOpen,
  Minus,
  PenLine,
  Plus,
  Save,
} from 'lucide-react'

import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { cn } from '#/lib/utils.ts'
import {
  computeEcarts,
  emptyInput,
  expected,
  fundEcart,
  fundTotal,
  isBalanced,
} from '#/lib/caisse/calc.ts'
import {
  DENOMINATION_COLUMNS,
  ECART_LABELS,
  EPSILON,
  FUND_TARGET,
  GRACE_HOURS,
  PAY_KEYS,
  SHIFT_LABELS,
  emptyCounts,
} from '#/lib/caisse/constants.ts'
import {
  canEditSheet,
  countersign,
  fetchSheet,
  graceDeadline,
  reopenSheet,
  upsertSheet,
  validateSheet,
} from '#/lib/caisse/service.ts'
import { currentSlot, stepSlot } from '#/lib/caisse/shift.ts'
import {
  amountText,
  amountValue,
  countValue,
  sanitizeAmount,
} from '#/lib/caisse/input.ts'
import type {
  CaisseSheet,
  CaisseSheetInput,
  DenomKey,
  EcartKey,
  PayKey,
  Shift,
} from '#/lib/caisse/types.ts'

/* --------------------------------------------------------------------------
 * Caisse — feuille de caisse numérique (table caisse_sheets), persistée par
 * couple (date, shift). Confronte les montants attendus (StayNTouch + Lightspeed)
 * aux réels comptés, calcule les écarts en temps réel (cible 0 €), détaille le
 * fond de caisse (150 €), et gère la VALIDATION verrouillée : une feuille validée
 * n'est plus modifiable, sauf pendant la fenêtre de grâce (GRACE_HOURS) ou par un
 * admin. La RLS (supabase/caisse_sheets.sql) reste l'autorité ; l'UI la reflète.
 * ------------------------------------------------------------------------ */

const eur2 = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const eur0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtEur = (n: number) => eur2.format(n) + ' €'
const fmtEurInt = (n: number) => eur0.format(n) + ' €'
const fmtEcart = (n: number) => (n >= 0 ? '+' : '') + eur2.format(n) + ' €'

const fmtTitle = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const fmtTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

function sheetToInput(s: CaisseSheet): CaisseSheetInput {
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

export function CaisseBoard() {
  const { user, role } = useAuth()
  const queryClient = useQueryClient()

  // Slot initial (date + shift) déduit de l'heure : matin 08–15, soir 15–23,
  // nuit 23–07 (rattachée au jour où elle commence).
  const [selectedDate, setSelectedDate] = useState(() => currentSlot(new Date()).date)
  const [selectedShift, setSelectedShift] = useState<Shift>(
    () => currentSlot(new Date()).shift,
  )

  // Navigation shift par shift : matin → soir → nuit → matin du lendemain.
  const goStep = (delta: number) => {
    const s = stepSlot(selectedDate, selectedShift, delta)
    setSelectedDate(s.date)
    setSelectedShift(s.shift)
  }
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: sheet } = useQuery({
    queryKey: ['caisse', 'sheet', selectedDate, selectedShift],
    queryFn: () => fetchSheet(selectedDate, selectedShift),
  })

  const [form, setForm] = useState<CaisseSheetInput>(() =>
    emptyInput(selectedDate, 'matin', emptyCounts()),
  )

  // (Ré)hydrate le formulaire dès que la feuille chargée, la date ou le shift
  // changent : feuille existante → ses valeurs ; sinon feuille vierge.
  useEffect(() => {
    setForm(
      sheet
        ? sheetToInput(sheet)
        : emptyInput(selectedDate, selectedShift, emptyCounts()),
    )
    setError('')
    setNotice('')
  }, [sheet, selectedDate, selectedShift])

  const isValidated = sheet?.status === 'validated'
  const editable = canEditSheet(sheet ?? null, role)
  const isAdmin = role === 'admin'
  const isWriter = role === 'super_utilisateur' || role === 'admin'
  const inGrace = isValidated && editable && !isAdmin
  const lockedForMe = isValidated && !editable
  const showWeb = form.shift === 'soir'

  const ecarts = useMemo(() => computeEcarts(form), [form])
  const total = fundTotal(form)
  const fEcart = fundEcart(form)
  const balanced = isBalanced(form)
  const deadline = graceDeadline(sheet ?? null)

  const displayDate = new Date(selectedDate + 'T00:00:00')
  const longDate = fmtTitle.format(displayDate)
  const titleDate = longDate.charAt(0).toUpperCase() + longDate.slice(1)

  // Colonnes du tableau des paiements (web seulement le soir).
  const cols: EcartKey[] = showWeb ? [...PAY_KEYS, 'web'] : [...PAY_KEYS]

  const setSnt = (k: keyof CaisseSheetInput['snt'], v: number) =>
    setForm((f) => ({ ...f, snt: { ...f.snt, [k]: v } }))
  const setLs = (k: keyof CaisseSheetInput['ls'], v: number) =>
    setForm((f) => ({ ...f, ls: { ...f.ls, [k]: v } }))
  const setCaisse = (k: keyof CaisseSheetInput['caisse'], v: number) =>
    setForm((f) => ({ ...f, caisse: { ...f.caisse, [k]: v } }))
  const setCount = (k: string, v: number) =>
    setForm((f) => ({ ...f, counts: { ...f.counts, [k]: v } }))
  const bumpCount = (k: DenomKey, delta: number) =>
    setForm((f) => ({
      ...f,
      counts: { ...f.counts, [k]: Math.max(0, (f.counts[k] ?? 0) + delta) },
    }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['caisse'] })

  async function guard(action: () => Promise<void>, ok: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await invalidate()
      setNotice(ok)
    } catch (err) {
      // Un refus RLS (ex. feuille verrouillée hors fenêtre) arrive ici : on
      // resynchronise l'état réel plutôt que de présumer le succès.
      setError(
        `Action refusée ou échouée : ${err instanceof Error ? err.message : String(err)}`,
      )
      await invalidate()
    } finally {
      setBusy(false)
    }
  }

  const handleSave = () => guard(() => upsertSheet(form), 'Brouillon enregistré.')

  async function handleValidate() {
    if (!user) return
    if (
      !balanced &&
      !window.confirm(
        'Des écarts ne sont pas à zéro. Valider quand même la caisse ? Pensez à justifier dans les commentaires.',
      )
    )
      return
    if (
      !window.confirm(
        `Valider la caisse ? Après validation, elle ne restera modifiable que ${GRACE_HOURS} h (sauf administrateur).`,
      )
    )
      return
    await guard(async () => {
      await upsertSheet(form)
      const fresh = await fetchSheet(form.reportDate, form.shift)
      if (fresh) await validateSheet(fresh.id, user.id)
    }, 'Caisse validée.')
  }

  const handleCountersign = () => {
    if (!user || !sheet) return
    return guard(() => countersign(sheet.id, user.id), 'Caisse contre-signée.')
  }

  function handleReopen() {
    if (!sheet) return
    if (!window.confirm('Rouvrir cette caisse validée (déverrouillage admin) ?')) return
    return guard(() => reopenSheet(sheet.id), 'Caisse rouverte (brouillon).')
  }

  return (
    <div className="caisse-doc flex w-full min-w-0 flex-1 flex-col gap-4">
      <PageHeader
        title={`${titleDate} (${SHIFT_LABELS[form.shift].toLowerCase()})`}
        meta="Feuille de caisse"
        actions={
          <>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => goStep(-1)}
              aria-label="Shift précédent"
            >
              <ChevronLeft />
            </Button>
            <DatePickerButton
              value={selectedDate}
              onChange={(v) => v && setSelectedDate(v)}
              ariaLabel="Choisir un jour"
            />
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => goStep(1)}
              aria-label="Shift suivant"
            >
              <ChevronRight />
            </Button>
          </>
        }
      />

      {/* Bandeaux d'état du verrou. */}
      {inGrace && deadline && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-3 text-sm text-primary">
          <Lock className="size-4 shrink-0" />
          Caisse validée. Modifiable encore jusqu'à {fmtTime.format(deadline)} (fenêtre de {GRACE_HOURS} h).
        </div>
      )}
      {lockedForMe && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          Caisse verrouillée. Contactez un administrateur pour toute correction.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">
          {notice}
        </div>
      )}

      {/* En-tête de saisie : initiales opérateur. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Initiales / poste
          <Input
            value={form.operatorInitials}
            disabled={!editable}
            onChange={(e) =>
              setForm((f) => ({ ...f, operatorInitials: e.target.value }))
            }
            placeholder="cbs"
            className="h-8 w-24"
          />
        </label>
      </div>

      {/* Tableau des montants + écarts. */}
      <div className="caisse-table overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Source</th>
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 text-right font-medium">
                  {ECART_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AmountRow
              label="STAY N' TOUCH"
              cols={cols}
              disabled={!editable}
              value={(c) => (c === 'web' ? form.snt.cbweb : form.snt[c as PayKey])}
              onChange={(c, v) => (c === 'web' ? setSnt('cbweb', v) : setSnt(c as PayKey, v))}
            />
            <AmountRow
              label="LIGHTSPEED"
              cols={cols}
              disabled={!editable}
              value={(c) => (c === 'web' ? null : form.ls[c as PayKey])}
              onChange={(c, v) => c !== 'web' && setLs(c as PayKey, v)}
            />
            <AmountRow
              label="CAISSE"
              cols={cols}
              disabled={!editable}
              value={(c) => (c === 'web' ? form.caisse.adyen : form.caisse[c as PayKey])}
              onChange={(c, v) =>
                c === 'web' ? setCaisse('adyen', v) : setCaisse(c as PayKey, v)
              }
            />
            <tr className="border-t border-border bg-muted/30 font-medium">
              <td className="px-3 py-2">ÉCARTS</td>
              {cols.map((c) => {
                const v = ecarts[c]
                const zero = Math.abs(v) < EPSILON
                return (
                  <td
                    key={c}
                    className={cn(
                      'px-3 py-2 text-right tabular-nums',
                      zero ? 'text-emerald-500' : 'text-destructive',
                    )}
                    title={`Attendu ${fmtEur(expected(form, c))}`}
                  >
                    {fmtEcart(v)}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Comptage du fond de caisse (pleine largeur, 5 colonnes). */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Fond de caisse</h2>
        <div className="caisse-denoms grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {DENOMINATION_COLUMNS.map((col, i) => (
            <div key={i} className="flex flex-col gap-3">
              {col.map((d) => {
                const n = form.counts[d.key] ?? 0
                const filled = n > 0
                return (
                  <div
                    key={d.key}
                    className={cn(
                      'flex items-stretch overflow-hidden rounded-lg border transition-colors',
                      filled ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20',
                    )}
                  >
                    {/* Zone gauche : bouton « − » pleine hauteur */}
                    <button
                      type="button"
                      aria-label={`Retirer un ${d.label}`}
                      disabled={!editable}
                      onClick={() => bumpCount(d.key, -1)}
                      className="flex flex-1 items-center justify-center border-r border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Minus className="size-4" />
                    </button>
                    {/* Zone centrale : valeur, quantité, sous-total */}
                    <div className="flex flex-[1.4] flex-col items-center justify-center gap-0.5 px-1 py-2">
                      <span className="text-xs font-semibold tabular-nums leading-none">
                        {d.label}
                      </span>
                      <CountInput
                        value={n}
                        disabled={!editable}
                        onChange={(v) => setCount(d.key, v)}
                      />
                      <span
                        className={cn(
                          'text-[11px] leading-none tabular-nums',
                          filled ? 'font-medium text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {d.value < 1 ? fmtEur(d.value * n) : fmtEurInt(d.value * n)}
                      </span>
                    </div>
                    {/* Zone droite : bouton « + » pleine hauteur */}
                    <button
                      type="button"
                      aria-label={`Ajouter un ${d.label}`}
                      disabled={!editable}
                      onClick={() => bumpCount(d.key, 1)}
                      className="flex flex-1 items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">
            Total compté / attendu {fmtEur(FUND_TARGET)}
          </span>
          <span
            className={cn(
              'tabular-nums font-medium',
              Math.abs(fEcart) < EPSILON ? 'text-emerald-500' : 'text-destructive',
            )}
          >
            {fmtEur(total)} ({fmtEcart(fEcart)})
          </span>
        </div>
      </div>

      {/* Commentaires (juste en dessous du fond de caisse). */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Commentaires {!balanced && <span className="text-destructive">(écart à justifier)</span>}
        </h2>
        <Textarea
          value={form.comment}
          disabled={!editable}
          onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
          placeholder="Justification d'un éventuel écart…"
          className="min-h-32"
        />
      </div>

      {/* Actions. */}
      {isWriter && (
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <Button variant="outline" onClick={handleSave} disabled={busy}>
              <Save /> Enregistrer
            </Button>
          )}
          {editable && !isValidated && (
            <Button onClick={handleValidate} disabled={busy}>
              <Check /> Valider la caisse
            </Button>
          )}
          {isValidated && editable && !sheet?.countersignedBy && (
            <Button variant="outline" onClick={handleCountersign} disabled={busy}>
              <PenLine /> Contre-signer
            </Button>
          )}
          {isAdmin && isValidated && (
            <Button variant="outline" onClick={handleReopen} disabled={busy}>
              <LockOpen /> Rouvrir (admin)
            </Button>
          )}
          {balanced && (
            <span className="text-sm text-emerald-500">Caisse équilibrée.</span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Champ monétaire : <Input> shadcn en type="text" (pas de flèches natives),
 * suffixe « € ». Garde un état texte interne pour préserver la frappe décimale
 * ("12," ne doit pas être réécrit en "12"), resynchronisé si la valeur externe
 * change (chargement / reset de feuille).
 */
function MoneyInput({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  const [text, setText] = useState(() => amountText(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    // Ne réécrit le texte QUE si la valeur externe ne correspond plus à la
    // frappe en cours — sinon on préserve les états intermédiaires ("12,").
    if (amountValue(text) !== value) setText(amountText(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const t = sanitizeAmount(e.target.value)
          setText(t)
          onChange(amountValue(t))
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? '' : '0'}
        className="h-8 pr-6 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
        €
      </span>
    </div>
  )
}

/**
 * Champ de comptage (entier ≥ 0). Le placeholder « 0 » de fond disparaît dès le
 * focus (édition) et réapparaît au blur si le champ est laissé vide.
 */
function CountInput({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <Input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={value === 0 ? '' : String(value)}
      onChange={(e) => onChange(countValue(e.target.value))}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={focused ? '' : '0'}
      className="h-7 w-4/5 px-1 text-center text-sm tabular-nums"
    />
  )
}

function AmountRow({
  label,
  cols,
  value,
  onChange,
  disabled,
}: {
  label: string
  cols: EcartKey[]
  value: (c: EcartKey) => number | null
  onChange: (c: EcartKey, v: number) => void
  disabled: boolean
}) {
  return (
    <tr className="border-b border-border/60">
      <td className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
        {label}
      </td>
      {cols.map((c) => {
        const v = value(c)
        return (
          <td key={c} className="px-2 py-1">
            {v === null ? (
              <span className="block text-right text-muted-foreground">—</span>
            ) : (
              <MoneyInput value={v} disabled={disabled} onChange={(nv) => onChange(c, nv)} />
            )}
          </td>
        )
      })}
    </tr>
  )
}

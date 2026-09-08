import { useEffect, useState } from 'react'
import type {
  ComponentPropsWithoutRef,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react'
import { Minus, Plus } from 'lucide-react'

import { DENOM_SVG } from '#/assets/euros/index.ts'
import { Input } from '#/components/ui/input.tsx'
import { ECART_LABELS, EPSILON } from '#/lib/caisse/constants.ts'
import type { DENOMINATIONS } from '#/lib/caisse/constants.ts'
import {
  fmtEcartBare,
  fmtEur,
  fmtEurInt,
} from '#/lib/caisse/format.ts'
import { amountText, amountValue, countValue, sanitizeAmount } from '#/lib/caisse/input.ts'
import type { Caution, EcartKey } from '#/lib/caisse/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Présentation de la FEUILLE DE CAISSE : les champs de saisie (montant,
 * comptage), les lignes du tableau des montants et la cellule d'une coupure.
 *
 * Extraits de `CaisseBoard` pour être la SOURCE UNIQUE de ces rendus : la page
 * les utilise pour la vraie saisie, et le panneau d'aide (`CaisseHelpPanel`)
 * pour ses exemples illustrés — une capture redessinée à la main finirait par
 * mentir sur ce que la page affiche.
 *
 * Aucun de ces composants ne lit d'état du board : tout passe par les props.
 */

/**
 * Champ monétaire : <Input> shadcn en type="text" (pas de flèches natives),
 * suffixe « € ». Garde un état texte interne pour préserver la frappe décimale
 * ("12," ne doit pas être réécrit en "12"), resynchronisé si la valeur externe
 * change (chargement / reset de feuille).
 */
export function MoneyInput({
  value,
  onChange,
  disabled,
  onFill,
  tabOrder,
  onKeyDown,
  allowNegative = false,
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
  // Double-clic : remplit le champ (report d'une somme). Absent = pas d'action.
  onFill?: () => void
  // Rang pour la tabulation en colonne (lu par handleGridTab via data-taborder).
  tabOrder?: number
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void
  // Autorise un montant négatif (ligne STAY N' TOUCH seulement).
  allowNegative?: boolean
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
        // "text" (clavier complet, touche "-" présente) sur la ligne qui
        // accepte le négatif — "decimal" ailleurs n'affiche pas ce signe sur
        // certains claviers virtuels tablette (iOS/Android).
        inputMode={allowNegative ? 'text' : 'decimal'}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const t = sanitizeAmount(e.target.value, { allowNegative })
          setText(t)
          onChange(amountValue(t))
        }}
        onDoubleClick={onFill}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? '' : '0'}
        title={
          onFill
            ? 'Double-clic : additionne Stay N’ Touch + Lightspeed'
            : undefined
        }
        data-taborder={tabOrder}
        className="h-8 pr-6 text-right tabular-nums print:hidden"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground print:hidden">
        €
      </span>
      {/* Impression tactile : le rendu papier d'un <input> désactivé est trop
          peu fiable selon le navigateur — texte brut à la place, formaté
          exactement comme le PDF jsPDF (même fonction fmtEur). */}
      <span className="caisse-print-value hidden print:block">
        {fmtEur(value)}
      </span>
    </div>
  )
}

/**
 * Champ de comptage (entier ≥ 0). Le placeholder « 0 » de fond disparaît dès le
 * focus (édition) et réapparaît au blur si le champ est laissé vide.
 */
export function CountInput({
  value,
  onChange,
  disabled,
  onKeyDown,
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
  // Tabulation en boucle dans la carte des coupures (handleDenomTab).
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <>
      <Input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={value === 0 ? '' : String(value)}
        onChange={(e) => onChange(countValue(e.target.value))}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? '' : '0'}
        data-denom-cell
        className="h-6 w-4/5 px-1 text-center text-sm tabular-nums print:hidden"
      />
      {/* Impression tactile : même raison que MoneyInput ci-dessus. */}
      <span className="caisse-print-count hidden print:block">
        × {value}
      </span>
    </>
  )
}

/** En-tête du tableau des montants (Source + une colonne par mode, « web »
 * responsive → « Adyen » en étroit). Partagé par le squelette de chargement et le
 * tableau réel, pour qu'ils ne divergent pas. */
export function AmountsThead({ cols }: { cols: EcartKey[] }) {
  return (
    <tr className="border-b border-border text-xs uppercase text-muted-foreground">
      <th className="w-32 px-3 py-1.5 text-left font-medium">Source</th>
      {cols.map((c) => (
        <th key={c} className="px-3 py-1.5 text-center font-medium">
          {c === 'web' ? (
            <>
              <span className="max-sm:hidden">{ECART_LABELS.web}</span>
              <span className="sm:hidden">Adyen</span>
            </>
          ) : (
            ECART_LABELS[c]
          )}
        </th>
      ))}
    </tr>
  )
}

export function AmountRow({
  label,
  rowIndex,
  cols,
  value,
  onChange,
  disabled,
  onFill,
  onCellKeyDown,
  allowNegative = false,
}: {
  label: string
  // Rang de la ligne (0 = 1re) : sert à ordonner la tabulation en colonne.
  rowIndex: number
  cols: EcartKey[]
  value: (c: EcartKey) => number | null
  onChange: (c: EcartKey, v: number) => void
  disabled: boolean
  // Valeur de report calculée par colonne (double-clic). Absent = pas de report.
  onFill?: (c: EcartKey) => number
  // Tabulation pilotée (colonne par colonne), partagée par toutes les lignes.
  onCellKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void
  // Montants négatifs acceptés sur cette ligne (STAY N' TOUCH seulement).
  allowNegative?: boolean
}) {
  return (
    <tr className="border-b border-border/60">
      <td className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground max-sm:whitespace-nowrap">
        {label}
      </td>
      {cols.map((c, colIndex) => {
        const v = value(c)
        return (
          <td key={c} className="px-2 py-1">
            {v === null ? (
              <span className="block text-right text-muted-foreground">—</span>
            ) : (
              <MoneyInput
                value={v}
                disabled={disabled}
                onChange={(nv) => onChange(c, nv)}
                onFill={
                  onFill && !disabled ? () => onChange(c, onFill(c)) : undefined
                }
                // Ordre colonne-major : colonne × 3 lignes + rang de la ligne.
                tabOrder={colIndex * 3 + rowIndex}
                onKeyDown={onCellKeyDown}
                allowNegative={allowNegative}
              />
            )}
          </td>
        )
      })}
    </tr>
  )
}

/** Ligne « ÉCARTS » du tableau des montants : pour chaque mode, l'écart entre
 *  l'attendu (Stay N' Touch + Lightspeed) et le dépôt compté. Vert quand le
 *  compte tombe juste (à moins d'un demi-centime), rouge sinon — un excédent et
 *  un manque partagent la MÊME couleur, seul le signe les distingue. */
export function EcartsRow({
  cols,
  ecarts,
  expectedOf,
}: {
  cols: EcartKey[]
  ecarts: Record<EcartKey, number>
  /** Montant attendu de la colonne, pour l'infobulle. */
  expectedOf: (c: EcartKey) => number
}) {
  return (
    <tr className="border-t border-border bg-muted/30 font-medium">
      <td className="px-3 py-1.5">ÉCARTS</td>
      {cols.map((c) => {
        const v = ecarts[c]
        const zero = Math.abs(v) < EPSILON
        return (
          <td
            key={c}
            className={cn(
              'px-3 py-1.5 text-right tabular-nums',
              zero ? 'text-emerald-500' : 'text-destructive',
            )}
            title={`Attendu ${fmtEur(expectedOf(c))}`}
          >
            {fmtEcartBare(v)}
            <span className="max-sm:hidden"> €</span>
          </td>
        )
      })}
    </tr>
  )
}

/** Une CELLULE de coupure du fond de caisse : les deux boutons ±, la quantité,
 *  le visuel du billet ou de la pièce (estompé tant que rien n'est compté) et le
 *  sous-total. */
export function DenomCell({
  denom,
  count,
  disabled,
  onChange,
  onBump,
  onKeyDown,
}: {
  denom: (typeof DENOMINATIONS)[number]
  count: number
  disabled: boolean
  onChange: (v: number) => void
  onBump: (delta: number) => void
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void
}) {
  const filled = count > 0
  return (
    <div
      className={cn(
        'flex items-stretch overflow-hidden rounded-lg border transition-colors',
        filled ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20',
        // 500 € en pleine largeur sur mobile (2 cols) : équilibre les
        // 14 cartes restantes en 7 rangées de 2. Sans effet dès sm.
        denom.key === 'cnt_500' && 'col-span-2 sm:col-span-1',
      )}
    >
      {/* Bouton « − » pleine hauteur, à gauche */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Retirer un ${denom.label}`}
        disabled={disabled}
        onClick={() => onBump(-1)}
        className="flex flex-1 items-center justify-center border-r border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 print:hidden"
      >
        <Minus className="size-4" />
      </button>
      {/* Colonne centrale : quantité, puis visuel du billet / de la pièce
          (estompé tant que rien n'est compté), puis sous-total. */}
      <div className="flex flex-[1.6] flex-col items-center justify-center gap-1.5 px-1 py-1">
        <CountInput
          value={count}
          disabled={disabled}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
        <div className="flex h-8 items-center justify-center">
          <img
            src={DENOM_SVG[denom.key]}
            alt={denom.label}
            draggable={false}
            className={cn(
              'max-h-full w-auto select-none drop-shadow-sm transition-opacity',
              // Pièce (< 5 €) un peu plus haute que le billet pour l'équilibre.
              denom.value < 5 ? 'h-8' : 'h-7',
              !filled && 'opacity-40',
            )}
          />
        </div>
        <span
          className={cn(
            'whitespace-nowrap text-[11px] leading-none tabular-nums',
            filled ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
        >
          {denom.value < 1
            ? fmtEur(denom.value * count)
            : fmtEurInt(denom.value * count)}
        </span>
      </div>
      {/* Bouton « + » pleine hauteur, à droite */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Ajouter un ${denom.label}`}
        disabled={disabled}
        onClick={() => onBump(1)}
        className="flex flex-1 items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 print:hidden"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

/** Date courte (« 15 août ») pour la liste des cautions : « depuis le … ». */
const fmtDayShort = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
})

/** Une CAUTION de la liste : chambre, montant, commentaire, date de prise, et
 *  (si on peut agir) le bouton de menu passé en `actions`.
 *
 *  Une seule ligne, colonnes bien distinctes séparées par un liseré vertical —
 *  le commentaire seul est flexible et tronqué (`min-w-0` + `truncate`), tout le
 *  reste garde sa largeur naturelle sans jamais passer à la ligne. La `key` est
 *  portée par l'appelant : sans actions, cet <li> est renvoyé TEL QUEL comme
 *  enfant direct de <ul> — jamais de <div> autour (invalide dans une liste). */
export function CautionRow({
  caution,
  actions,
  className,
  ...rest
}: {
  caution: Caution
  actions?: ReactNode
} & ComponentPropsWithoutRef<'li'>) {
  const hasActions = actions != null
  return (
    <li
      // `...rest` est ESSENTIEL : le board enveloppe cette ligne dans un
      // `ContextMenuTrigger asChild`, qui lui passe ses propres gestionnaires
      // (dont `onContextMenu`) et sa `ref`. Sans cette propagation, le clic
      // droit sur une caution n'ouvrirait plus rien.
      {...rest}
      className={cn(
        'grid items-center gap-4 rounded-lg bg-muted/30 px-3.5 py-2.5 transition-colors',
        hasActions
          ? 'grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] cursor-context-menu hover:bg-muted/60'
          : 'grid-cols-[auto_auto_minmax(0,1fr)_auto]',
        // Remboursée : hors périmètre du document imprimé.
        caution.status === 'refunded' && 'print:hidden',
        className,
      )}
    >
      <span className="flex items-center gap-2 whitespace-nowrap text-base font-semibold">
        Chambre {caution.room}
        {caution.status === 'refunded' && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            Remboursée
          </span>
        )}
      </span>
      <span className="whitespace-nowrap border-l border-border/60 pl-4">
        <span className="inline-flex items-center rounded-md bg-indigo-500/10 px-2 py-0.5 tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">
          {fmtEur(caution.amount)}
        </span>
      </span>
      <span className="min-w-0 truncate border-l border-border/60 pl-4 text-sm text-muted-foreground">
        {caution.comment || '—'}
      </span>
      <span className="whitespace-nowrap border-l border-border/60 pl-4 text-xs text-muted-foreground">
        depuis le{' '}
        {fmtDayShort.format(new Date(caution.takenDate + 'T00:00:00'))}
      </span>
      {actions}
    </li>
  )
}

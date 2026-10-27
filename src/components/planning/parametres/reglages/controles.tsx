/*
 * Petits contrôles des écrans de paramètres du Planning (prototype `ui.tsx` :
 * `Nuancier`, `Compteur`, `Segmente`), au style du back office. Tous
 * acceptent `disabled` : en lecture et en écriture, les réglages se lisent
 * mais ne se modifient pas (seule la gestion paramètre).
 */

import type { ReactNode } from 'react'
import { Minus, Plus, ShieldOff } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { cn } from '#/lib/utils.ts'

/** Les 12 couleurs proposées (prototype `PALETTE`). */
export const PALETTE = [
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#64748b',
] as const

export const COULEUR_VALIDE = /^#[0-9a-fA-F]{6}$/

/** Nuancier : la palette, la couleur choisie mise en évidence, et une
 * couleur libre. */
export function Nuancier({
  valeur,
  onChange,
  disabled,
  etiquette = 'Couleur',
}: {
  valeur: string
  onChange: (couleur: string) => void
  disabled?: boolean
  etiquette?: string
}) {
  const choisie = valeur.toLowerCase()
  const libre = !PALETTE.some((c) => c === choisie)
  return (
    <div
      role="group"
      aria-label={etiquette}
      className="flex flex-wrap items-center gap-1.5"
    >
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          aria-label={`Couleur ${c}`}
          aria-pressed={c === choisie}
          onClick={() => onChange(c)}
          className={cn(
            'size-5 rounded-full border border-black/20 transition-transform outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
            c === choisie &&
              'ring-2 ring-foreground ring-offset-2 ring-offset-card',
            !disabled && 'hover:scale-110',
          )}
          style={{ background: c }}
        />
      ))}
      <Tip label="Autre couleur">
        <label
          className={cn(
            'relative size-5 overflow-hidden rounded-full border border-dashed border-muted-foreground',
            libre && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          )}
          style={libre ? { background: valeur } : undefined}
        >
          <input
            type="color"
            aria-label="Autre couleur"
            disabled={disabled}
            value={COULEUR_VALIDE.test(valeur) ? valeur : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-[inherit] opacity-0"
          />
        </label>
      </Tip>
    </div>
  )
}

/** − valeur + : bornes min et max, boutons grisés aux bornes. */
export function Compteur({
  valeur,
  min = 0,
  max = 20,
  onChange,
  etiquette,
  disabled,
  taille = 'normal',
  suffixe,
  attenue,
}: {
  valeur: number
  min?: number
  max?: number
  onChange: (v: number) => void
  /** Ce que compte le compteur, pour les lecteurs d'écran. */
  etiquette: string
  disabled?: boolean
  taille?: 'normal' | 'mini'
  /** Texte après la valeur (« soutien », « en plus »). */
  suffixe?: string
  /** Grisé (valeur nulle d'une place facultative). */
  attenue?: boolean
}) {
  const mini = taille === 'mini'
  const bouton = cn(
    'inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30',
    mini ? 'size-5' : 'size-6',
  )
  return (
    <div
      role="group"
      aria-label={etiquette}
      className={cn(
        'inline-flex items-center gap-0.5 tabular-nums',
        mini ? 'text-[11px]' : 'rounded-md border bg-background/60 text-sm',
        attenue && 'opacity-50',
      )}
    >
      <button
        type="button"
        className={bouton}
        disabled={disabled || valeur <= min}
        onClick={() => onChange(valeur - 1)}
        aria-label={`${etiquette} : un de moins`}
      >
        <Minus className={mini ? 'size-3' : 'size-3.5'} />
      </button>
      <span
        className={cn(
          'text-center',
          mini ? 'min-w-0 px-0.5 whitespace-nowrap' : 'min-w-5 font-medium',
        )}
      >
        {mini ? `+${valeur}` : valeur}
        {/* Le texte ne s'affiche que si le tableau qui le contient (un
            conteneur `@container`) a la place ; la légende du tableau le
            rappelle sinon. */}
        {suffixe ? (
          <span className="hidden @min-[62rem]:inline"> {suffixe}</span>
        ) : null}
      </span>
      <button
        type="button"
        className={bouton}
        disabled={disabled || valeur >= max}
        onClick={() => onChange(valeur + 1)}
        aria-label={`${etiquette} : un de plus`}
      >
        <Plus className={mini ? 'size-3' : 'size-3.5'} />
      </button>
    </div>
  )
}

/** Choix segmenté (groupe radio de boutons). */
export function Segmente<T extends string>({
  valeur,
  options,
  onChange,
  disabled,
  etiquette,
}: {
  valeur: T
  options: ReadonlyArray<{ valeur: T; libelle: ReactNode; aide?: string }>
  onChange: (v: T) => void
  disabled?: boolean
  etiquette: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiquette}
      className="inline-flex rounded-md border bg-background/60 p-0.5"
    >
      {options.map((o) => {
        const bouton = (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={valeur === o.valeur}
            disabled={disabled}
            onClick={() => onChange(o.valeur)}
            className={cn(
              'rounded px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
              valeur === o.valeur
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
              disabled && valeur !== o.valeur && 'opacity-60',
            )}
          >
            {o.libelle}
          </button>
        )
        return o.aide ? (
          <Tip key={o.valeur} label={o.aide}>
            {bouton}
          </Tip>
        ) : (
          bouton
        )
      })}
    </div>
  )
}

/** La mention des écrans de paramètres pour qui n'a pas la gestion. */
export function MentionLectureSeule({ pret }: { pret: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <ShieldOff className="size-4 shrink-0" />
      {pret
        ? 'Lecture seule : seule la gestion du planning modifie ces réglages.'
        : 'Lecture des droits en cours…'}
    </div>
  )
}

/** Cadre d'une carte de réglage, liseré haut à sa couleur. */
export function CarteReglage({
  couleur,
  children,
  etiquette,
  className,
}: {
  couleur: string
  children: ReactNode
  etiquette: string
  className?: string
}) {
  return (
    <section
      aria-label={etiquette}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border border-t-4 bg-card p-4',
        className,
      )}
      style={{
        borderTopColor: COULEUR_VALIDE.test(couleur) ? couleur : undefined,
      }}
    >
      {children}
    </section>
  )
}

/** Erreurs de saisie d'une carte, sous ses champs. */
export function ErreursSaisie({ erreurs }: { erreurs: string[] }) {
  if (!erreurs.length) return null
  return (
    <ul
      className="flex flex-col gap-0.5 text-xs text-destructive"
      aria-live="polite"
    >
      {erreurs.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  )
}

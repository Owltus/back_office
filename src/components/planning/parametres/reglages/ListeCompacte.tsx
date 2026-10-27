/*
 * Listes compactes des écrans de paramètres (codes horaires, motifs, postes) :
 * une carte par groupe, une ligne par élément ; un clic sur la ligne ouvre
 * son réglage dans un volet (refonte du 2026-10-28, demande utilisateur :
 * « un peu chaotique… même style que les autres pages »). Grammaire des
 * tableaux de l'application : carte `rounded-xl border bg-card`, en-tête
 * `bg-muted/40`.
 */

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

import { texteSur } from '#/lib/planning/affichage.ts'

/** Colonnes empilées, sans trou sous les listes courtes. */
export const COLONNES_LISTES =
  'columns-1 gap-4 lg:columns-2 2xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid'

export function ListeCompacte({
  titre,
  nombre,
  children,
}: {
  titre: string
  nombre: number
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <h3 className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {titre}
        <span className="rounded-full bg-muted px-2 text-xs normal-case tabular-nums">
          {nombre}
        </span>
      </h3>
      <ul className="divide-y">{children}</ul>
    </div>
  )
}

/** Une ligne : pastille, libellé, détail à droite, chevron. */
export function LigneCompacte({
  etiquette,
  pastille,
  libelle,
  detail,
  onOuvrir,
}: {
  etiquette: string
  pastille: ReactNode
  libelle: ReactNode
  detail?: ReactNode
  onOuvrir: () => void
}) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
        onClick={onOuvrir}
        aria-label={etiquette}
      >
        {pastille}
        <span className="min-w-0 flex-1 truncate">{libelle}</span>
        {detail != null && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {detail}
          </span>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

/** Pastille d'un code (horaire ou motif) à sa couleur. */
export function PastilleCode({
  code,
  couleur,
  texte,
}: {
  code: string
  couleur: string
  /** Couleur du texte imposée (code écrit en rouge). */
  texte?: string
}) {
  return (
    <span
      className="min-w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold"
      style={{ background: couleur, color: texte ?? texteSur(couleur) }}
    >
      {code}
    </span>
  )
}

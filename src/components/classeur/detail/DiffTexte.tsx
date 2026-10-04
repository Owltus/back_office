import { useMemo, useState } from 'react'

import { segmenter } from '#/lib/classeur/diff.ts'
import type { LigneDiff, Segment } from '#/lib/classeur/diff.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Affichage d'une comparaison de textes, partagé par l'Historique d'un
 * document et l'aperçu d'un import JSON (étape 1 du plan
 * `classeur-fonctions-2026-10-04`). Extrait tel quel de
 * `HistoriqueDocumentDialog` : un instantané du DOM de l'Historique garantit
 * que l'extraction n'a rien changé.
 *
 * Noir et blanc (décision D14) : ajout surligné et « + », retrait barré et
 * « − » ; les longues parties inchangées sont repliées (`segmenter`).
 */

/** Les champs courts d'un document (titre, description) avant → après. */
export interface ChampsTexte {
  title: string
  description: string
}

/** Titre et description changés, ou rien s'ils sont identiques. */
export function ChampsDiff({
  avant,
  apres,
}: {
  avant: ChampsTexte
  apres: ChampsTexte
}) {
  const titreChange = avant.title !== apres.title
  const descriptionChange = avant.description !== apres.description
  if (!titreChange && !descriptionChange) return null
  return (
    <div className="space-y-1 rounded-md border border-border p-2 text-xs">
      {titreChange && (
        <Champ nom="Titre" avant={avant.title} apres={apres.title} />
      )}
      {descriptionChange && (
        <Champ
          nom="Description"
          avant={avant.description}
          apres={apres.description}
        />
      )}
    </div>
  )
}

export function Champ({
  nom,
  avant,
  apres,
}: {
  nom: string
  avant: string
  apres: string
}) {
  return (
    <p>
      <span className="font-medium">{nom} : </span>
      <span className="text-muted-foreground line-through">
        {avant || '(vide)'}
      </span>
      {' → '}
      <span className="bg-foreground/10 px-0.5">{apres || '(vide)'}</span>
    </p>
  )
}

/**
 * Les lignes d'une comparaison (`comparerLignes`), parties inchangées
 * repliées. `className` s'ajoute EN TÊTE des classes de base (hauteur,
 * défilement : propres à chaque appelant).
 */
export function DiffTexte({
  lignes,
  ouvertParDefaut,
  className,
}: {
  lignes: readonly LigneDiff[]
  ouvertParDefaut: boolean
  className?: string
}) {
  const segments = useMemo(() => segmenter(lignes), [lignes])
  return (
    <div
      className={cn(
        className,
        'rounded-md border border-border bg-card font-mono text-xs leading-relaxed',
      )}
    >
      {segments.map((s, i) => (
        <SegmentDiff key={i} segment={s} ouvertParDefaut={ouvertParDefaut} />
      ))}
    </div>
  )
}

export function SegmentDiff({
  segment,
  ouvertParDefaut,
}: {
  segment: Segment
  ouvertParDefaut: boolean
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)
  if (segment.type === 'replie' && !ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="block w-full border-y border-border/60 bg-muted/40 px-3 py-1 text-left text-muted-foreground hover:bg-muted"
      >
        ⋯ {segment.nombre}{' '}
        {segment.nombre > 1 ? 'lignes inchangées' : 'ligne inchangée'} —
        afficher
      </button>
    )
  }
  return (
    <>
      {segment.lignes.map((l, i) => (
        <LigneAffichee key={i} ligne={l} />
      ))}
    </>
  )
}

export function LigneAffichee({ ligne }: { ligne: LigneDiff }) {
  const signe =
    ligne.type === 'ajout' ? '+' : ligne.type === 'retrait' ? '−' : ' '
  return (
    <div
      className={cn(
        'grid grid-cols-[2.5rem_2.5rem_1.25rem_1fr]',
        ligne.type === 'ajout' && 'bg-foreground/10',
        ligne.type === 'retrait' && 'text-muted-foreground',
      )}
    >
      <span className="select-none pr-2 text-right text-muted-foreground/70 tabular-nums">
        {ligne.avant ?? ''}
      </span>
      <span className="select-none pr-2 text-right text-muted-foreground/70 tabular-nums">
        {ligne.apres ?? ''}
      </span>
      <span className="select-none text-center font-semibold">{signe}</span>
      <span
        className={cn(
          'whitespace-pre-wrap break-words pr-3',
          ligne.type === 'retrait' && 'line-through',
        )}
      >
        {ligne.texte === '' ? ' ' : ligne.texte}
      </span>
    </div>
  )
}

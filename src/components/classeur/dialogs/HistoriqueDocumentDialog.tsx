import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, History, Loader2, RotateCcw } from 'lucide-react'

import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { bilan, comparerLignes, segmenter } from '#/lib/classeur/diff.ts'
import type { LigneDiff, Segment } from '#/lib/classeur/diff.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { fetchVersionsDocument } from '#/lib/classeur/service.ts'
import type { DbDocument, DbDocumentVersion } from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Historique d'un document (amélioration n° 20) et comparaison de versions
 * (n° 21, « comme GitHub »). Les versions sont écrites par un trigger en
 * base (`classeur_document_versions`) : l'app ne fait que les lire.
 *
 * - À gauche, les versions, la plus récente en haut : date, auteur, bilan
 *   (+ lignes ajoutées, − retirées) par rapport à la version précédente.
 * - À droite, la comparaison, au choix : « ce qu'a changé cet
 *   enregistrement » (par rapport à la version d'avant) ou « par rapport
 *   au document actuel ». Noir et blanc : ajout surligné et « + »,
 *   retrait barré et « − » ; les longues parties inchangées sont repliées.
 * - « Reprendre cette version » l'ouvre dans l'éditeur : rien n'est écrit
 *   avant Sauvegarder, qui crée à son tour une nouvelle version.
 */

type Mode = 'enregistrement' | 'actuelle'

function quand(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const heure = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${date} à ${heure}`
}

function auteurDe(v: DbDocumentVersion): string {
  if (v.origine === 'etat_initial') return "État avant l'historique"
  return v.auteur !== '' ? v.auteur : 'Auteur inconnu'
}

type Etat = Pick<DbDocument, 'title' | 'description' | 'content'>

export function HistoriqueDocumentDialog({
  open,
  onOpenChange,
  doc,
  peutReprendre,
  onReprendre,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  doc: DbDocument
  peutReprendre: boolean
  onReprendre: (v: Etat) => void
}) {
  const versions = useQuery({
    queryKey: classeurKeys.versions(doc.id),
    queryFn: () => fetchVersionsDocument(doc.id),
    enabled: open,
    // Toujours relue à l'ouverture : un enregistrement vient peut-être
    // d'en créer une (le sien ou celui d'un collègue).
    staleTime: 0,
  })
  const [choisie, setChoisie] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('enregistrement')

  const liste = versions.data ?? []
  const index = Math.max(
    0,
    liste.findIndex((v) => v.id === choisie),
  )
  const version = liste.at(index) ?? null
  const precedente = liste.at(index + 1) ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-6xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" />
            Historique du document
          </DialogTitle>
          <DialogDescription>
            Chaque enregistrement est conservé (les 50 derniers). Choisissez une
            version pour voir ce qui a changé.
          </DialogDescription>
        </DialogHeader>

        {versions.isPending ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="animate-spin" />
          </div>
        ) : versions.isError ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {messageErreur(versions.error, 'Historique indisponible')}
            </AlertDescription>
          </Alert>
        ) : liste.length === 0 ? (
          <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
            Aucune version enregistrée pour l'instant. L'historique commence au
            prochain enregistrement de ce document.
          </p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 md:h-[70vh] md:grid-cols-[18rem_1fr]">
            <ListeVersions
              liste={liste}
              choisie={version?.id ?? null}
              onChoisir={setChoisie}
            />
            {version && (
              <Comparaison
                version={version}
                precedente={precedente}
                actuel={doc}
                mode={mode}
                onMode={setMode}
                peutReprendre={peutReprendre}
                onReprendre={() => {
                  onReprendre(version)
                  onOpenChange(false)
                }}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ListeVersions({
  liste,
  choisie,
  onChoisir,
}: {
  liste: readonly DbDocumentVersion[]
  choisie: number | null
  onChoisir: (id: number) => void
}) {
  // Bilan de chaque version par rapport à la précédente (plus ancienne).
  const bilans = useMemo(
    () =>
      liste.map((v, i) => {
        const avant = liste.at(i + 1)
        if (!avant || v.origine === 'etat_initial') return null
        return bilan(comparerLignes(avant.content, v.content))
      }),
    [liste],
  )
  return (
    <ul
      aria-label="Versions"
      className="max-h-40 min-h-0 space-y-1 overflow-y-auto pr-1 md:max-h-none"
    >
      {liste.map((v, i) => {
        const b = bilans[i]
        const actif = v.id === choisie
        return (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => onChoisir(v.id)}
              aria-current={actif || undefined}
              className={cn(
                'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                actif
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent hover:bg-accent',
              )}
            >
              {/* Numéro de version et sa raison (2026-10-03) ; vide pour
                  l'historique antérieur au versionnage. */}
              {v.version && (
                <span className="flex items-baseline gap-2 text-xs">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-semibold tabular-nums text-foreground">
                    v{v.version}
                  </span>
                  {v.raison && (
                    <span className="truncate text-muted-foreground">
                      {v.raison}
                    </span>
                  )}
                </span>
              )}
              <span className="block font-medium tabular-nums">
                {quand(v.created_at)}
                {i === 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    la plus récente
                  </span>
                )}
              </span>
              <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{auteurDe(v)}</span>
                {b && (b.ajouts > 0 || b.retraits > 0) && (
                  <span className="shrink-0 font-mono tabular-nums">
                    +{b.ajouts} −{b.retraits}
                  </span>
                )}
                {v.origine === 'creation' && (
                  <span className="shrink-0">création</span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Comparaison({
  version,
  precedente,
  actuel,
  mode,
  onMode,
  peutReprendre,
  onReprendre,
}: {
  version: DbDocumentVersion
  precedente: DbDocumentVersion | null
  actuel: Etat
  mode: Mode
  onMode: (m: Mode) => void
  peutReprendre: boolean
  onReprendre: () => void
}) {
  // « Cet enregistrement » : de la version d'avant à celle-ci (une version
  // sans devancière est comparée à un document vide, sauf l'état initial).
  // « Document actuel » : de cette version au document tel qu'il est.
  const [de, vers]: [Etat, Etat] =
    mode === 'enregistrement'
      ? [
          precedente ??
            (version.origine === 'etat_initial'
              ? version
              : { title: '', description: '', content: '' }),
          version,
        ]
      : [version, actuel]
  const lignes = useMemo(
    () => comparerLignes(de.content, vers.content),
    [de, vers],
  )
  const b = bilan(lignes)
  const segments = useMemo(() => segmenter(lignes), [lignes])
  const titreChange = de.title !== vers.title
  const descriptionChange = de.description !== vers.description
  const identique =
    b.ajouts === 0 && b.retraits === 0 && !titreChange && !descriptionChange

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="radiogroup"
          aria-label="Comparer"
          className="inline-flex rounded-md border border-border p-0.5 text-xs"
        >
          {(
            [
              ['enregistrement', 'Ce qui a changé à cet enregistrement'],
              ['actuelle', 'Par rapport au document actuel'],
            ] as const
          ).map(([m, libelle]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onMode(m)}
              className={cn(
                'rounded px-2.5 py-1',
                mode === m
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {libelle}
            </button>
          ))}
        </div>
        {peutReprendre && (
          <Button size="sm" variant="outline" onClick={onReprendre}>
            <RotateCcw />
            Reprendre cette version
          </Button>
        )}
      </div>

      {(titreChange || descriptionChange) && (
        <div className="space-y-1 rounded-md border border-border p-2 text-xs">
          {titreChange && (
            <Champ nom="Titre" avant={de.title} apres={vers.title} />
          )}
          {descriptionChange && (
            <Champ
              nom="Description"
              avant={de.description}
              apres={vers.description}
            />
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {identique
          ? mode === 'actuelle'
            ? 'Identique au document actuel.'
            : version.origine === 'etat_initial'
              ? "Le document tel qu'il était avant le début de l'historique."
              : 'Aucun changement du texte à cet enregistrement.'
          : `${String(b.ajouts)} ${b.ajouts > 1 ? 'lignes ajoutées' : 'ligne ajoutée'}, ${String(b.retraits)} ${b.retraits > 1 ? 'lignes retirées' : 'ligne retirée'}.`}
      </p>

      <div
        key={`${String(version.id)}-${mode}`}
        className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card font-mono text-xs leading-relaxed"
      >
        {segments.map((s, i) => (
          <SegmentDiff key={i} segment={s} ouvertParDefaut={identique} />
        ))}
      </div>
    </div>
  )
}

function Champ({
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

function SegmentDiff({
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

function LigneAffichee({ ligne }: { ligne: LigneDiff }) {
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

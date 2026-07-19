import { AlertTriangle, FileText, Loader2, X } from 'lucide-react'

import type { InvoiceRecord } from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * File des factures chargées (rail gauche de l'atelier) : une vignette par
 * facture, avec un aperçu miniature et le nom. Cliquer sélectionne la facture
 * éditée au centre ; le « × » la retire.
 */

function Thumb({ record }: { record: InvoiceRecord }) {
  const first = record.previews[0]
  if (first) {
    return (
      <img
        src={first.dataUrl}
        alt=""
        className="h-full w-full object-cover object-top"
      />
    )
  }
  const icon =
    record.status === 'processing' ? (
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    ) : record.status === 'error' ? (
      <AlertTriangle className="size-5 text-destructive" />
    ) : (
      <FileText className="size-5 text-muted-foreground" />
    )
  return <div className="flex h-full items-center justify-center">{icon}</div>
}

/* Marqueur « validé » : voile vert léger + cartouche en diagonale (façon coup de
 * tampon), posé sur la miniature d'une facture déjà tamponnée. Non interactif. */
function ValidatedStamp() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-emerald-500/10">
      <span className="-rotate-[22deg] rounded-md border-2 border-emerald-500/80 bg-background/50 px-2 py-0.5 text-xl font-extrabold tracking-[0.1em] text-emerald-500 uppercase shadow-sm backdrop-blur-[1px]">
        Validé
      </span>
    </div>
  )
}

export function InvoiceList({
  records,
  selectedId,
  onSelect,
  onRemove,
  className,
}: {
  records: InvoiceRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-2', className)}>
      {records.map((r) => {
        const selected = r.id === selectedId
        return (
          <div key={r.id} className="relative w-full">
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className={cn(
                'flex w-full flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:bg-secondary/50',
              )}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-muted">
                <Thumb record={r} />
                {r.stamped && <ValidatedStamp />}
                {r.duplicate && !r.stamped && (
                  <span className="absolute top-1 right-1 rounded bg-amber-500/90 px-1 text-[9px] font-bold tracking-wide text-white uppercase">
                    Doublon
                  </span>
                )}
              </div>
              <span className="truncate text-xs font-medium text-foreground">
                {r.fileName}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(r.id)}
              aria-label="Retirer"
              className="absolute top-1 right-1 rounded bg-background/80 p-0.5 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

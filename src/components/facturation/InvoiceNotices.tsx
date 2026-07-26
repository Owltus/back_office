import { AlertTriangle, Info, XCircle, type LucideIcon } from 'lucide-react'

import { invoiceNotices, type NoticeTone } from '#/lib/facturation/notices.ts'
import type { InvoiceRecord } from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Zone « Informations » affichée au CENTRE, sous l'aperçu du PDF. Explique en clair ce qui se
 * passe et ce que le tampon va faire (messages dérivés du record, cf. lib/facturation/notices.ts).
 * Volontairement large et lisible pour un utilisateur non initié. Les erreurs d'ACTION (échec du
 * tampon ou de la mémorisation) vivent dans le panneau de droite, près du bouton concerné.
 */

const TONE: Record<NoticeTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'text-muted-foreground' },
  warn: { icon: AlertTriangle, className: 'text-amber-500' },
  error: { icon: XCircle, className: 'text-destructive' },
}

export function InvoiceNotices({ record }: { record: InvoiceRecord }) {
  const notices = invoiceNotices(record)
  if (notices.length === 0) return null
  return (
    <div className="shrink-0 rounded-xl border border-border bg-card p-3">
      <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-primary/80 uppercase">
        Informations
      </p>
      <ul className="flex flex-col gap-2">
        {notices.map((n) => {
          const { icon: Icon, className } = TONE[n.tone]
          return (
            <li key={n.id} className="flex items-start gap-2 text-sm leading-snug">
              <Icon className={cn('mt-0.5 size-4 shrink-0', className)} />
              <span className="text-foreground">{n.text}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

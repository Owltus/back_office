import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import { invoiceNotices, type NoticeTone } from '#/lib/facturation/notices.ts'
import type { InvoiceRecord } from '#/lib/facturation/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Zone d'informations au CENTRE, sous l'aperçu du PDF. Elle prend la COULEUR de l'information à
 * afficher (vert = prêt ou fait, ambre = point d'attention, rouge = erreur, neutre = en cours),
 * pour un repère visuel immédiat. Sans titre : le message parle de lui-même. Un seul message à la
 * fois, court et sans jargon. Les erreurs d'ACTION (échec du tampon) restent dans le panneau de
 * droite, près du bouton concerné.
 */

interface ToneStyle {
  icon: LucideIcon
  card: string
  fg: string
}

const TONE: Record<NoticeTone, ToneStyle> = {
  ok: {
    icon: CheckCircle2,
    card: 'border-emerald-500/40 bg-emerald-500/10',
    fg: 'text-emerald-500',
  },
  info: {
    icon: Info,
    card: 'border-border bg-card',
    fg: 'text-foreground',
  },
  warn: {
    icon: AlertTriangle,
    card: 'border-amber-500/40 bg-amber-500/10',
    fg: 'text-amber-500',
  },
  error: {
    icon: XCircle,
    card: 'border-destructive/40 bg-destructive/10',
    fg: 'text-destructive',
  },
}

// Gravité croissante : la carte adopte le ton le plus fort présent.
const RANK: Record<NoticeTone, number> = { info: 0, ok: 1, warn: 2, error: 3 }

export function InvoiceNotices({ record }: { record: InvoiceRecord }) {
  const notices = invoiceNotices(record)
  if (notices.length === 0) return null
  const dominant = notices.reduce((a, b) => (RANK[b.tone] > RANK[a.tone] ? b : a))
  return (
    <div className={cn('shrink-0 rounded-xl border p-3', TONE[dominant.tone].card)}>
      <ul className="flex flex-col gap-2">
        {notices.map((n) => {
          const { icon: Icon, fg } = TONE[n.tone]
          return (
            <li
              key={n.id}
              className={cn('flex items-start gap-2 text-sm leading-snug', fg)}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span>{n.text}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

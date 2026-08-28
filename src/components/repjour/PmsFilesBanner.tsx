import { CircleAlert, Check, X } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'
import type { PmsFileStatus } from '#/lib/repjour/pmsStatus.ts'

/*
 * Bandeau « fichiers PMS manquants » — le PMS n'a pas transmis (ou plus, en
 * cas de panne côté DSI) un ou des exports StayNTouch attendus pour le cycle
 * courant, donc le rapport ne partira pas automatiquement. Détaille fichier
 * par fichier (reçu / non reçu) pour que quiconque consulte la page comprenne
 * immédiatement d'où vient le blocage, sans avoir à demander.
 */
interface PmsFilesBannerProps {
  /** Date affichée (ex. « jeudi 14 août 2026 »). */
  date: string
  files: PmsFileStatus[]
}

export function PmsFilesBanner({ date, files }: PmsFilesBannerProps) {
  return (
    <Alert variant="destructive" className="print:hidden">
      <CircleAlert />
      <AlertTitle>Le rapport du {date} ne sera pas envoyé</AlertTitle>
      <AlertDescription>
        <p>Notre PMS n'a pas transmis toutes les données attendues.</p>
        <ul className="mt-1">
          {files.map((f) => (
            <li key={f.label} className="flex items-center gap-1.5">
              {f.received ? (
                <Check className="size-3.5 shrink-0 text-emerald-500" />
              ) : (
                <X className="size-3.5 shrink-0 text-destructive" />
              )}
              <span>
                {f.label} : {f.received ? 'reçu' : 'non reçu'}
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

import { CircleAlert, TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import type { Alert as AlertData } from '#/lib/repjour/types.ts'

/*
 * Bandeau d'alertes du rapport journalier, réécrit avec les primitives
 * `Alert` / `AlertDescription` du Back Office.
 *
 * - alerte `error`   → variant `destructive` (rouge) ;
 * - alerte `warning` → variant `default` restylé en ambre.
 *
 * Retourne `null` s'il n'y a aucune alerte.
 */
export function AlertBanner({ alerts }: { alerts: AlertData[] }) {
  if (alerts.length === 0) return null

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => {
        const isError = alert.type === 'error'
        const Icon = isError ? CircleAlert : TriangleAlert
        return (
          <Alert
            key={i}
            variant={isError ? 'destructive' : 'default'}
            className={
              isError
                ? undefined
                : 'border-amber-500/30 text-amber-500 [&>svg]:text-amber-500'
            }
          >
            <Icon />
            <AlertDescription className={isError ? undefined : 'text-amber-500/90'}>
              {alert.message}
            </AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}

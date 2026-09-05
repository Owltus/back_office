import { useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, WifiOff } from 'lucide-react'

import { backendHealth } from '#/lib/backendHealth.ts'
import { Button } from '#/components/ui/button.tsx'
import { useNow } from '#/components/shared/useNow.ts'

/*
 * Bandeau « connexion au serveur interrompue » — filet de secours global.
 *
 * S'affiche UNIQUEMENT quand le disjoncteur (`lib/backendHealth.ts`) est
 * ouvert : le backend Supabase a répondu 5xx, n'a pas répondu dans le délai,
 * ou le réseau est tombé. Jamais de bandeau « tout va bien » : il disparaît
 * dès qu'une requête aboutit. Ton ambre discret, cohérent avec
 * `SendStatusBanner` (thème dark navy).
 *
 * Accessibilité : `role="status"` + `aria-live="polite"` sur le MESSAGE
 * (annoncé une fois à l'apparition) ; le compte à rebours, qui change chaque
 * seconde, est hors de la zone vivante pour ne pas être relu en boucle.
 *
 * « Réessayer » rend la prochaine tentative due immédiatement et relance les
 * requêtes actives (une salve, puis le backoff reprend si ça échoue encore).
 */
export function BackendStatusBanner() {
  const state = useSyncExternalStore(
    backendHealth.subscribe,
    backendHealth.getState,
    backendHealth.getState,
  )
  const queryClient = useQueryClient()
  const now = useNow(1_000)
  if (state.status !== 'down') return null

  const seconds = Math.max(
    0,
    Math.ceil(((state.nextRetryAt ?? 0) - now.getTime()) / 1000),
  )

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-500 print:hidden">
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      <span role="status" aria-live="polite" className="min-w-0 text-amber-500/90">
        Connexion au serveur interrompue.
      </span>
      <span className="min-w-0 flex-1 text-amber-500/70" aria-hidden="true">
        {seconds > 0
          ? `Nouvelle tentative dans ${seconds} s.`
          : 'Nouvelle tentative en cours.'}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          backendHealth.retryNow()
          void queryClient.refetchQueries({ type: 'active' })
        }}
        className="shrink-0 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500"
      >
        <RefreshCw />
        Réessayer
      </Button>
    </div>
  )
}

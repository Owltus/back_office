import { Button } from '#/components/ui/button.tsx'

/**
 * Filet d'erreur de rendu global (audit red team 2026-09-06, B2).
 *
 * Branché comme `defaultErrorComponent` du router (voir #/router.tsx) : une
 * exception levée par un composant (donnée inattendue en base, bug) n'efface
 * plus toute l'application. Le message technique reste en console, jamais à
 * l'écran (il pourrait nommer une table ou une fonction).
 */
export function RouteError({
  error,
  reset,
}: {
  error: unknown
  reset: () => void
}) {
  console.error('[app] erreur de rendu', error)
  return (
    <div
      role="alert"
      className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <h1 className="text-xl font-semibold">
        Cette page a rencontré un problème.
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Les données n'ont pas été modifiées. Réessayer suffit en général ; sinon
        rechargez la page.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Réessayer</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recharger
        </Button>
      </div>
    </div>
  )
}

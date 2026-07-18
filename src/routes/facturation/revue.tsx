import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { FacturationRevue } from '#/components/facturation/FacturationRevue.tsx'

/**
 * Route `/facturation/revue` — file de curation des anomalies du modèle appris
 * (outliers émetteur→code, codes confusables). Admin-only, `ssr: false` (lit le
 * modèle en cache client). Résolution par actions explicites (désapprendre / bannir).
 */
export const Route = createFileRoute('/facturation/revue')({
  component: RevuePage,
  ssr: false,
  head: () => ({ meta: [{ title: 'Revue — Facturation' }] }),
})

function RevuePage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <FacturationRevue />
    </ProtectedRoute>
  )
}

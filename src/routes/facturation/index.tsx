import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { FacturationBoard } from '#/components/facturation/FacturationBoard.tsx'

/**
 * Route `/facturation` — atelier de suivi/tamponnage des factures. Réservée aux
 * ADMINS (garde `ProtectedRoute`). `ssr: false` : lecture PDF, OCR et pdf-lib sont
 * 100 % navigateur. Seule donnée serveur : les nuages de mots + le dictionnaire
 * d'émetteurs (tables facturation_*). Vue graphique sur `/facturation/galaxie`.
 */
export const Route = createFileRoute('/facturation/')({
  component: FacturationPage,
  ssr: false,
  head: () => ({ meta: [{ title: 'Facturation — Back Office' }] }),
})

function FacturationPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <FacturationBoard />
    </ProtectedRoute>
  )
}

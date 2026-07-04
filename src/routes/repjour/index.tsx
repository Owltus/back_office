import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { DashboardBoard } from '#/components/repjour/boards/DashboardBoard.tsx'

export const Route = createFileRoute('/repjour/')({
  component: RepjourIndexPage,
})

/**
 * Page d'accueil de l'îlot `/repjour` : le dashboard journalier en lecture
 * seule, accessible à tous les rôles connectés. La garde `ProtectedRoute`
 * redirige vers /login si la session est absente.
 */
function RepjourIndexPage() {
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <DashboardBoard />
    </ProtectedRoute>
  )
}

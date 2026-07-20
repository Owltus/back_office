import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
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
    <PageGuard page="repjour">
      <DashboardBoard />
    </PageGuard>
  )
}

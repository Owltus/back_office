import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { RaproAnalytiqueBoard } from '#/components/rapro/RaproAnalytiqueBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/rapro/analytique/')({
  component: RaproAnalytiqueIndexPage,
  head: () => ({ meta: [{ title: 'Analytique — Rapprochement' }] }),
})

/**
 * Vue analytique Rapprochement, accessible à tous les rôles connectés en
 * LECTURE. La garde `ProtectedRoute` redirige vers /login sans session.
 */
function RaproAnalytiqueIndexPage() {
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <PageContainer fillHeight>
        <RaproAnalytiqueBoard />
      </PageContainer>
    </ProtectedRoute>
  )
}

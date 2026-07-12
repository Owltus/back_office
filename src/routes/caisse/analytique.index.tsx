import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { CaisseAnalytiqueBoard } from '#/components/caisse/CaisseAnalytiqueBoard.tsx'

export const Route = createFileRoute('/caisse/analytique/')({
  component: CaisseAnalytiqueIndexPage,
  head: () => ({ meta: [{ title: 'Analytique — Caisse' }] }),
})

/**
 * Vue analytique Caisse, accessible à tous les rôles connectés en LECTURE.
 * La garde `ProtectedRoute` redirige vers /login sans session.
 */
function CaisseAnalytiqueIndexPage() {
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <CaisseAnalytiqueBoard />
    </ProtectedRoute>
  )
}

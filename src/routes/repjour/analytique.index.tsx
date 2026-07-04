import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { AnalytiqueBoard } from '#/components/repjour/boards/AnalytiqueBoard.tsx'

export const Route = createFileRoute('/repjour/analytique/')({
  component: AnalytiqueIndexPage,
  head: () => ({ meta: [{ title: 'Analytique — RepJour' }] }),
})

/**
 * Vue analytique annuelle, accessible à tous les rôles connectés en LECTURE.
 * La garde `ProtectedRoute` redirige vers /login sans session.
 */
function AnalytiqueIndexPage() {
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <AnalytiqueBoard />
    </ProtectedRoute>
  )
}

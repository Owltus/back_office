import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { PdjAnalytiqueBoard } from '#/components/pdj/PdjAnalytiqueBoard.tsx'

export const Route = createFileRoute('/pdj/analytique/')({
  component: PdjAnalytiqueIndexPage,
  head: () => ({ meta: [{ title: 'Analytique — PDJ' }] }),
})

/**
 * Vue analytique PDJ, accessible à tous les rôles connectés en LECTURE.
 * La garde `ProtectedRoute` redirige vers /login sans session.
 */
function PdjAnalytiqueIndexPage() {
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <PdjAnalytiqueBoard />
    </ProtectedRoute>
  )
}

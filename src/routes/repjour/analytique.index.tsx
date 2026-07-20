import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
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
    <PageGuard page="repjour">
      <AnalytiqueBoard />
    </PageGuard>
  )
}

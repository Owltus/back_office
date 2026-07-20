import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
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
    <PageGuard page="pdj">
      <PdjAnalytiqueBoard />
    </PageGuard>
  )
}

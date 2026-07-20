import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
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
    <PageGuard page="caisse">
      <CaisseAnalytiqueBoard />
    </PageGuard>
  )
}

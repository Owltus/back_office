import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { PlanningBoard } from '#/components/planning/PlanningBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

/**
 * Onglet `/planning`.
 *
 * Page VIDE pour l'instant (2026-10-27, demande utilisateur : « prépare les
 * choses ») : seul le câblage est en place — clé `planning` dans le registre
 * `PAGES`, droits par page (CHECK de `user_page_permissions.page` et de
 * `profiles.page_order`, migration `20261027100000_page_planning.sql`), garde
 * `PageGuard`. Le contenu viendra dans un chantier séparé. L'authentification
 * est fournie à la racine (`AppAuthGate`).
 */
export const Route = createFileRoute('/planning')({
  component: PlanningPage,
  head: () => ({ meta: [{ title: 'Planning — Back Office' }] }),
})

function PlanningPage() {
  return (
    <PageGuard page="planning">
      <PageContainer>
        <PlanningBoard />
      </PageContainer>
    </PageGuard>
  )
}

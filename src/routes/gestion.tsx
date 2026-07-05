import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { GestionBoard } from '#/components/repjour/boards/GestionBoard.tsx'

export const Route = createFileRoute('/gestion')({
  component: GestionPage,
  head: () => ({ meta: [{ title: 'Gestion budgétaire — Back Office' }] }),
})

/**
 * Gestion budgétaire — fonction applicative accessible via le menu utilisateur
 * global (là où l'on se déconnecte). Onglets Données et Budget. Accessible à
 * tous les rôles connectés, mais en LECTURE SEULE pour les non-admin (l'édition
 * et les suppressions sont réservées à l'admin, géré dans le board + RLS).
 */
function GestionPage() {
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <GestionBoard />
    </ProtectedRoute>
  )
}

import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { ProfilBoard } from '#/components/repjour/boards/ProfilBoard.tsx'

export const Route = createFileRoute('/profil')({
  component: ProfilPage,
  head: () => ({ meta: [{ title: 'Profil — Back Office' }] }),
})

/**
 * Profil personnel — fonction applicative accessible à TOUS les rôles connectés
 * (chacun édite son propre profil et change son propre mot de passe). Atteinte
 * depuis le menu utilisateur global.
 */
function ProfilPage() {
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <ProfilBoard />
    </ProtectedRoute>
  )
}

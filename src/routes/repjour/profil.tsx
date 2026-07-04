import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { ProfilBoard } from '#/components/repjour/boards/ProfilBoard.tsx'

export const Route = createFileRoute('/repjour/profil')({
  component: RepjourProfilPage,
  head: () => ({ meta: [{ title: 'Profil — RepJour' }] }),
})

/**
 * Profil personnel — accessible à TOUS les rôles connectés (chacun édite son
 * propre profil et change son propre mot de passe en self-service). Atteinte
 * depuis le menu utilisateur global (hors sous-nav RepJour). La garde
 * `ProtectedRoute` redirige vers /login si la session est absente.
 */
function RepjourProfilPage() {
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <ProfilBoard />
    </ProtectedRoute>
  )
}

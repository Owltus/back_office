import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { GestionBoard } from '#/components/repjour/boards/GestionBoard.tsx'

export const Route = createFileRoute('/repjour/gestion')({
  component: RepjourGestionPage,
  head: () => ({ meta: [{ title: 'Gestion — RepJour' }] }),
})

/**
 * Page de gestion (données + budget), accessible à TOUS les rôles connectés.
 * La page est VISIBLE par tous mais en LECTURE SEULE ; seul `admin` peut
 * éditer/supprimer (gating `readOnly = role !== 'admin'` porté dans
 * `GestionBoard`). La garde `ProtectedRoute` gère l'ergonomie (redirection vers
 * /login sans session) ; la RLS Supabase reste la barrière de sécurité réelle
 * pour les écritures et suppressions.
 */
function RepjourGestionPage() {
  return (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <GestionBoard />
    </ProtectedRoute>
  )
}

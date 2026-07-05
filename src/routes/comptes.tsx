import { createFileRoute } from '@tanstack/react-router'

import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'
import { ComptesBoard } from '#/components/repjour/boards/ComptesBoard.tsx'

export const Route = createFileRoute('/comptes')({
  component: ComptesPage,
  head: () => ({ meta: [{ title: 'Comptes — Back Office' }] }),
})

/**
 * Gestion des comptes — fonction APPLICATIVE (au niveau du Back Office, pas de
 * l'onglet RepJour). Accessible via le menu utilisateur global (là où l'on se
 * déconnecte), réservée à l'admin. Écritures : signUp via un second client
 * Supabase, insert/update/delete `profiles`, changement de mot de passe via la
 * RPC serveur `admin_update_password`. La garde gère le gating ergonomique ; la
 * RLS Supabase reste la barrière de sécurité réelle.
 */
function ComptesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <ComptesBoard />
    </ProtectedRoute>
  )
}

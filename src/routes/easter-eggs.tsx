import { createFileRoute } from '@tanstack/react-router'

import { EasterEggsBoard } from '#/components/easter-eggs/EasterEggsBoard.tsx'
import { ProtectedRoute } from '#/components/repjour/ProtectedRoute.tsx'

export const Route = createFileRoute('/easter-eggs')({
  component: EasterEggsPage,
  head: () => ({ meta: [{ title: 'Easter eggs — Back Office' }] }),
})

/**
 * Gestion des easter eggs — page ADMIN. Déclencheurs clavier (mot-clé → effet)
 * configurables en base, remplaçant les easter eggs jadis codés en dur. La garde
 * gère le gating ergonomique ; la RLS Supabase (écritures admin only) reste la
 * barrière de sécurité réelle.
 */
function EasterEggsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <EasterEggsBoard />
    </ProtectedRoute>
  )
}

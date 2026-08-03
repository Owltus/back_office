import { createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { GestionBoard } from '#/components/repjour/boards/GestionBoard.tsx'

export const Route = createFileRoute('/gestion')({
  component: GestionPage,
  head: () => ({ meta: [{ title: 'Gestion budgétaire — Back Office' }] }),
})

/**
 * Gestion budgétaire — fonction applicative accessible via le menu utilisateur
 * global (là où l'on se déconnecte). Onglets Données et Budget. Le budget étant
 * de la donnée repjour, la page est rattachée à la page `repjour` : visible par
 * tout lecteur repjour, éditable uniquement au niveau `gestion` (géré dans le
 * board + RLS). Remplace l'ancien modèle par grade (`grade !== 'admin'`).
 */
function GestionPage() {
  return (
    <PageGuard page="repjour">
      <GestionBoard />
    </PageGuard>
  )
}

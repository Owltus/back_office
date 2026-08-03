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
 * de la donnée repjour sensible, la PAGE entière est réservée au niveau `gestion`
 * sur repjour (`min="gestion"`) : seuls les gestionnaires la voient et l'éditent.
 * Remplace l'ancien modèle par grade (`grade !== 'admin'`). NB : la colonne Budget
 * du tableau de bord repjour reste un KPI visible par tous (autre écran).
 */
function GestionPage() {
  return (
    <PageGuard page="repjour" min="gestion">
      <GestionBoard />
    </PageGuard>
  )
}

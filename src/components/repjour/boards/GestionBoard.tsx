import { useState } from 'react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { DataContent } from '#/components/repjour/boards/DataContent.tsx'
import { BudgetContent } from '#/components/repjour/boards/BudgetContent.tsx'

/*
 * Coquille de la page Gestion — portée de la source GestionPage.
 *
 * Deux onglets seulement : « Données » (édition jour par jour) et « Budget »
 * (grille annuelle). L'onglet « Postes » de la source est DIFFÉRÉ : la table
 * `postes` est absente de la base (confirmé par sonde live, HTTP 404) — aucun
 * service ni onglet n'est porté (décision D7).
 *
 * Gating (source : `readOnly = role !== 'admin'`) : la page est VISIBLE par
 * tous les rôles autorisés mais seule la session `admin` peut éditer/supprimer.
 * `readOnly` est transmis aux deux contenus, qui masquent alors les actions
 * d'écriture. La sécurité réelle reste la RLS Supabase.
 *
 * Le toggle d'onglets de la source (boutons segmentés) est conservé et restylé
 * en dark (tokens shadcn), aucun composant Tabs shadcn n'étant présent dans le
 * projet cible.
 */

type Tab = 'donnees' | 'budget'

export function GestionBoard() {
  const { role } = useAuth()
  const readOnly = role !== 'admin'
  const [tab, setTab] = useState<Tab>('budget')

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-foreground">Gestion</h1>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setTab('donnees')}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'donnees'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Données
            </button>
            <button
              onClick={() => setTab('budget')}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'budget'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Budget
            </button>
          </div>
        </div>

        {tab === 'donnees' ? (
          <DataContent readOnly={readOnly} />
        ) : (
          <BudgetContent readOnly={readOnly} />
        )}
      </div>
    </PageContainer>
  )
}

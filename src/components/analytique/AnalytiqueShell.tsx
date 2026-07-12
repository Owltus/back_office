import type { ReactNode } from 'react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { AnalytiqueSkeleton } from '#/components/analytique/AnalytiqueSkeleton.tsx'

/*
 * Coquille commune des pages analytique (parentes annuelles ET enfants mensuelles).
 *
 * Possède le layout partagé : `PageContainer fillHeight`, colonne flex bornée au
 * viewport, `PageHeader` (titre + actions), et la branche de chargement (squelette
 * reflet du layout). Chaque board ne fournit QUE son contenu (cartes, tableau,
 * graphiques) via `children` — une modification de mise en page se fait donc ici,
 * une seule fois, pour les 10 pages.
 */
export function AnalytiqueShell({
  title,
  actions,
  loading = false,
  skeleton,
  children,
}: {
  title: ReactNode
  actions?: ReactNode
  loading?: boolean
  skeleton?: { cols?: number; charts?: number; rows?: number }
  children: ReactNode
}) {
  return (
    <PageContainer fillHeight>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6">
        <PageHeader title={title} actions={actions} />
        {loading ? <AnalytiqueSkeleton {...skeleton} /> : children}
      </div>
    </PageContainer>
  )
}

import type { ReactNode } from 'react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { AnalytiqueSkeleton } from '#/components/analytique/AnalytiqueSkeleton.tsx'

/*
 * Coquille commune des pages analytique (parentes annuelles ET enfants mensuelles).
 *
 * Possède le layout partagé : `PageContainer`, colonne flex, `PageHeader` (titre +
 * actions), et la branche de chargement (squelette reflet du layout). Chaque board
 * ne fournit QUE son contenu (cartes, tableau, graphiques) via `children` — une
 * modification de mise en page se fait donc ici, une seule fois, pour les 10 pages.
 *
 * Bornage RESPONSIVE (`lg:min-h-0`) : sous `lg`, la page suit son flux naturel et
 * défile normalement (le tableau prend toute sa hauteur, tous les mois visibles) ;
 * à partir de `lg`, la colonne est bornée au viewport et le tableau gère son propre
 * défilement interne. Sans ce garde-fou, sur petit écran les cartes (2 lignes) et
 * les graphiques empilés (`shrink-0`) écrasaient le tableau `flex-1` à 0 — il
 * disparaissait, sans défilement pour le rattraper.
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
  skeleton?: {
    cols?: number
    charts?: number
    rows?: number
    cards?: number
    cardLines?: number
  }
  children: ReactNode
}) {
  return (
    <PageContainer className="lg:min-h-0">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 lg:min-h-0">
        <PageHeader title={title} actions={actions} />
        {loading ? <AnalytiqueSkeleton {...skeleton} /> : children}
      </div>
    </PageContainer>
  )
}

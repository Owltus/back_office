import { useRef, type ReactNode } from 'react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import { AnalytiqueSkeleton } from '#/components/analytique/AnalytiqueSkeleton.tsx'
import { printAnalytique } from '#/lib/analytique/pdf.ts'

/*
 * Coquille commune des pages analytique (parentes annuelles ET enfants mensuelles).
 *
 * Possède le layout partagé : `PageContainer`, colonne flex, `PageHeader` (titre +
 * actions), et la branche de chargement (squelette reflet du layout). Chaque board
 * ne fournit QUE son contenu (cartes, tableau, graphiques) via `children` — une
 * modification de mise en page se fait donc ici, une seule fois, pour les 10 pages.
 *
 * IMPRESSION : `printTitle` active le bouton « Imprimer / PDF » (icône seule, et
 * Ctrl/Cmd+P), commun aux boards. Le PDF est bâti par `printAnalytique`, qui LIT le
 * contenu déjà rendu sous `rootRef` (cartes → tableau → graphes) — une seule
 * mécanique pour toutes les pages analytique, présentes et futures. Le document
 * reflète la page : cartes, puis TOUS les mois / jours, puis le(s) graphe(s).
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
  printTitle,
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
    cardCols?: number
    cardLines?: number
  }
  /** Active le bouton « Imprimer / PDF » et sert de titre au document
   *  (ex. « Caisse · 2026 »). Absent → page non imprimable, pas de bouton. */
  printTitle?: string
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    const root = rootRef.current
    if (!printTitle || loading || !root) return
    void printAnalytique(root, printTitle)
  }
  usePrintShortcut(handlePrint)

  // Bouton d'impression placé AVANT les actions du board : la navigation
  // temporelle (YearNav) reste collée au bord droit, comme le veut la convention.
  const headerActions =
    printTitle != null ? (
      <>
        <PrintButton
          onClick={handlePrint}
          disabled={loading}
          iconOnly
          tipLabel={loading ? 'Chargement des données…' : 'Imprimer / PDF'}
        />
        {actions}
      </>
    ) : (
      actions
    )

  return (
    <PageContainer className="lg:min-h-0">
      <div
        ref={rootRef}
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 lg:min-h-0"
      >
        <PageHeader title={title} actions={headerActions} />
        {loading ? <AnalytiqueSkeleton {...skeleton} /> : children}
      </div>
    </PageContainer>
  )
}

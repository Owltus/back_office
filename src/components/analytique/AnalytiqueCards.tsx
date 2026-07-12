import type { ReactNode } from 'react'

/*
 * Grille et carte de synthèse des pages analytique. La grille (`shrink-0`, 4
 * colonnes) et le gabarit de carte sont partagés ; chaque board fournit ses
 * libellés/valeurs. `StatCard.children` reste libre pour les cartes enrichies
 * (barre de progression budget de repjour, par exemple).
 */
export function AnalytiqueCardsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  children,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {sub}
      </div>
      {children}
    </div>
  )
}

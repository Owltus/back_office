import { fmt } from '#/lib/repjour/format.ts'
import type { Ecart, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

/*
 * Cartes de synthèse + barre de progression multi-segments du mois.
 *
 * Portage de la source (thème clair) vers le dark : cartes bg-white → bg-card,
 * bg-success → emerald, bg-gray-300 (projeté) → muted-foreground (lisible sur
 * fond sombre), marqueur bg-black → bg-foreground. La couleur « jour » (or
 * #D4A017) est conservée. Les positions absolues en % de chaque segment sont
 * portées à l'identique.
 */

const COLOR_JOUR = '#D4A017'

interface SummaryCardsProps {
  realiseJour?: KPIBlock | null
  realiseMTD: KPIBlock
  projeteMois: KPIBlock
  budget: MonthBudget
  ecart: Ecart
  partial?: boolean
}

export function SummaryCards({
  realiseJour,
  realiseMTD,
  projeteMois,
  budget,
  partial = false,
}: SummaryCardsProps) {
  const cards = [
    {
      label: partial ? 'Revenu hébergement (forecast)' : 'Revenu hébergement',
      value: fmt.eurInt(projeteMois.roomRevenue),
      budgetValue: fmt.eurInt(budget.room_revenue),
    },
    {
      label: partial
        ? 'Revenu moyen par chambre (forecast)'
        : 'Revenu moyen par chambre',
      value: fmt.eurInt(projeteMois.revpar),
      budgetValue: fmt.eurInt(budget.revpar),
    },
    {
      label: partial ? "Taux d'occupation (forecast)" : "Taux d'occupation",
      value: fmt.pct(projeteMois.to),
      budgetValue: fmt.pct(budget.taux_occupation),
    },
  ]

  const caJour = !partial && realiseJour ? realiseJour.roomRevenue : 0
  const acquis = realiseMTD.roomRevenue
  const precedent = Math.max(0, acquis - caJour)
  const projete = Math.max(0, projeteMois.roomRevenue - acquis)
  const total = acquis + projete
  const totalProgress =
    budget.room_revenue > 0 ? (total / budget.room_revenue) * 100 : 0
  const moisOver = totalProgress > 100
  const moisMaxScale = moisOver ? totalProgress * 1.15 : 100
  const pctOf = (v: number) =>
    budget.room_revenue > 0
      ? ((v / budget.room_revenue) * 100 / moisMaxScale) * 100
      : 0
  const precedentWidth = pctOf(precedent)
  const jourWidth = pctOf(caJour)
  const projeteWidth = pctOf(projete)
  const moisGoalPos = (100 / moisMaxScale) * 100

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {cards.map((card, i) => (
          <div
            key={card.label}
            className={`rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4 ${
              i === 0 ? 'col-span-2 sm:col-span-1' : ''
            }`}
          >
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {card.label}
            </p>
            <div className="mt-1">
              <span className="text-2xl font-bold text-foreground">
                {card.value}
              </span>
              <span className="text-sm text-muted-foreground">
                {' '}
                / {card.budgetValue}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Barre de progression mois : acquis (vert) + projeté (gris) vs budget */}
      <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm sm:px-5">
        <div className="flex items-center gap-3">
          <div className="relative h-2 flex-1 rounded-full bg-muted">
            {/* Jours précédents — vert */}
            {precedentWidth > 0 && (
              <div
                className="absolute inset-y-0 left-0 rounded-l-full bg-emerald-500 transition-all duration-700 ease-out"
                style={{ width: `${precedentWidth}%` }}
              />
            )}
            {/* Jour — or */}
            {jourWidth > 0 && (
              <div
                className="absolute inset-y-0 transition-all duration-700 ease-out"
                style={{
                  left: `${precedentWidth}%`,
                  width: `${jourWidth}%`,
                  backgroundColor: COLOR_JOUR,
                  borderTopLeftRadius: precedentWidth === 0 ? '9999px' : undefined,
                  borderBottomLeftRadius:
                    precedentWidth === 0 ? '9999px' : undefined,
                }}
              />
            )}
            {/* Projeté — gris */}
            {projeteWidth > 0 && (
              <div
                className="absolute inset-y-0 bg-muted-foreground transition-all duration-700 ease-out"
                style={{
                  left: `${precedentWidth + jourWidth}%`,
                  width: `${projeteWidth}%`,
                  borderTopRightRadius: '9999px',
                  borderBottomRightRadius: '9999px',
                }}
              />
            )}
            {/* Marqueur budget — uniquement si dépassé */}
            {moisOver && (
              <div
                className="absolute top-1/2 -translate-y-1/2 transition-all duration-700"
                style={{ left: `${moisGoalPos}%` }}
              >
                <div className="h-4 w-0.5 bg-foreground" />
              </div>
            )}
          </div>
          <span className="w-12 text-right text-sm font-bold tabular-nums text-foreground">
            {totalProgress.toFixed(0)}%
          </span>
        </div>
        {/* Légende */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {precedent > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Acquis {fmt.eurInt(precedent)}
            </span>
          )}
          {!partial && caJour > 0 && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: COLOR_JOUR }}
              />
              Jour {fmt.eurInt(caJour)}
            </span>
          )}
          {projete > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground" />
              Projeté {fmt.eurInt(projete)}
            </span>
          )}
          {total < budget.room_revenue && (
            <span className="flex items-center gap-1.5 text-destructive">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
              Reste {fmt.eurInt(budget.room_revenue - total)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

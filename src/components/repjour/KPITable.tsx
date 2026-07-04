import { fmt } from '#/lib/repjour/format.ts'
import type { Ecart, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

/*
 * Tableau KPI du rapport journalier — porté à l'identique de la source
 * (table HTML brute). La mécanique responsive « double-cellule »
 * (span hidden sm:inline pour la version longue / span sm:hidden pour la
 * version compacte mobile) est PRÉSERVÉE telle quelle : elle n'est pas
 * remplacée par les primitives <Table> shadcn afin de garder ce comportement.
 *
 * Seul le thème est remappé clair → dark (tokens bg/text/border, destructive
 * pour les écarts négatifs, emerald pour les positifs). Les valeurs restent
 * en `tabular-nums`.
 */

interface KPITableProps {
  realiseJour: KPIBlock | null
  realiseMTD: KPIBlock | null
  projeteMois: KPIBlock | null
  budget: MonthBudget
  ecart: Ecart | null
}

function ecartColor(val: number) {
  return val >= 0
    ? 'text-emerald-400 font-bold'
    : 'text-destructive font-bold'
}

// Format compact sans unités pour mobile
const fmtCompact = {
  nuitees: (n: number) =>
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n),
  pct: (n: number) =>
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n),
  eur: (n: number) =>
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n),
  eurInt: (n: number) =>
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n),
  ecartNuitees: (n: number) =>
    (n >= 0 ? '+' : '') +
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n),
  ecartPct: (n: number) =>
    (n >= 0 ? '+' : '') +
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n),
  ecartEur: (n: number) =>
    (n >= 0 ? '+' : '') +
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n),
  ecartEurInt: (n: number) =>
    (n >= 0 ? '+' : '') +
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n),
}

const ROWS: {
  label: string
  labelShort: string
  key: keyof KPIBlock
  budgetKey: keyof MonthBudget
  ecartKey: keyof Ecart
  fmtVal: (n: number) => string
  fmtValCompact: (n: number) => string
  fmtEcart: (n: number) => string
  fmtEcartCompact: (n: number) => string
}[] = [
  {
    label: 'Nuitées',
    labelShort: 'Nuit.',
    key: 'nuitees',
    budgetKey: 'nuitees',
    ecartKey: 'nuitees',
    fmtVal: fmt.nuitees,
    fmtValCompact: fmtCompact.nuitees,
    fmtEcart: fmt.ecartNuitees,
    fmtEcartCompact: fmtCompact.ecartNuitees,
  },
  {
    label: 'Taux occupation',
    labelShort: 'TO',
    key: 'to',
    budgetKey: 'taux_occupation',
    ecartKey: 'to',
    fmtVal: fmt.pct,
    fmtValCompact: fmtCompact.pct,
    fmtEcart: (n) => (n >= 0 ? '+' : '') + fmt.pct(n),
    fmtEcartCompact: fmtCompact.ecartPct,
  },
  {
    label: 'Prix moyen',
    labelShort: 'PM',
    key: 'pm',
    budgetKey: 'prix_moyen',
    ecartKey: 'pm',
    fmtVal: fmt.eur,
    fmtValCompact: fmtCompact.eur,
    fmtEcart: fmt.ecartEur,
    fmtEcartCompact: fmtCompact.ecartEur,
  },
  {
    label: 'RevPAR',
    labelShort: 'RevPAR',
    key: 'revpar',
    budgetKey: 'revpar',
    ecartKey: 'revpar',
    fmtVal: fmt.eur,
    fmtValCompact: fmtCompact.eur,
    fmtEcart: fmt.ecartEur,
    fmtEcartCompact: fmtCompact.ecartEur,
  },
  {
    label: "Chiffre d'affaires",
    labelShort: 'CA',
    key: 'roomRevenue',
    budgetKey: 'room_revenue',
    ecartKey: 'roomRevenue',
    fmtVal: fmt.eurInt,
    fmtValCompact: fmtCompact.eurInt,
    fmtEcart: fmt.ecartEurInt,
    fmtEcartCompact: fmtCompact.ecartEurInt,
  },
]

export function KPITable({
  realiseJour,
  realiseMTD,
  projeteMois,
  budget,
  ecart,
}: KPITableProps) {
  const dash = <span className="text-muted-foreground">—</span>

  function cell(block: KPIBlock | null, row: (typeof ROWS)[0]) {
    if (!block) return dash
    return (
      <>
        <span className="hidden sm:inline">{row.fmtVal(block[row.key])}</span>
        <span className="sm:hidden">{row.fmtValCompact(block[row.key])}</span>
      </>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-2 text-left font-medium text-muted-foreground"></th>
            <th className="px-2 py-2 text-center font-medium text-muted-foreground">
              <span className="hidden sm:inline">Jour</span>
              <span className="sm:hidden">J</span>
            </th>
            <th className="border-r border-border px-2 py-2 text-center font-medium text-muted-foreground">
              <span className="hidden sm:inline">Cumul mois</span>
              <span className="sm:hidden">Cumul</span>
            </th>
            <th className="px-2 py-2 text-center font-medium text-muted-foreground">
              <span className="hidden sm:inline">Projeté mois</span>
              <span className="sm:hidden">Proj.</span>
            </th>
            <th className="border-r border-border px-2 py-2 text-center font-medium text-muted-foreground">
              <span className="hidden sm:inline">Budget mois</span>
              <span className="sm:hidden">Budg.</span>
            </th>
            <th className="px-2 py-2 text-center font-medium text-muted-foreground">
              <span className="hidden sm:inline">Écart</span>
              <span className="sm:hidden">+/-</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-b border-border">
              <td className="px-2 py-2.5 font-semibold whitespace-nowrap text-foreground">
                <span className="hidden sm:inline">{row.label}</span>
                <span className="sm:hidden">{row.labelShort}</span>
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums whitespace-nowrap">
                {cell(realiseJour, row)}
              </td>
              <td className="border-r border-border px-2 py-2.5 text-center tabular-nums whitespace-nowrap">
                {cell(realiseMTD, row)}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums whitespace-nowrap">
                {cell(projeteMois, row)}
              </td>
              <td className="border-r border-border px-2 py-2.5 text-center tabular-nums whitespace-nowrap">
                <span className="hidden sm:inline">
                  {row.fmtVal(budget[row.budgetKey] as number)}
                </span>
                <span className="sm:hidden">
                  {row.fmtValCompact(budget[row.budgetKey] as number)}
                </span>
              </td>
              <td
                className={`px-2 py-2.5 text-center tabular-nums whitespace-nowrap ${
                  ecart ? ecartColor(ecart[row.ecartKey]) : ''
                }`}
              >
                {ecart ? (
                  <>
                    <span className="hidden sm:inline">
                      {row.fmtEcart(ecart[row.ecartKey])}
                    </span>
                    <span className="sm:hidden">
                      {row.fmtEcartCompact(ecart[row.ecartKey])}
                    </span>
                  </>
                ) : (
                  dash
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-right text-[11px] text-muted-foreground">
        Montants TTC
      </p>
    </div>
  )
}

import {
  AnalytiqueCardsGrid,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { EPSILON } from '#/lib/caisse/constants.ts'
import { fmtEcart, fmtEur, fmtInt } from '#/lib/caisse/format.ts'
import type { CaisseSummary } from '#/lib/caisse/analytics.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Briques d'affichage partagées par les deux vues analytique caisse (annuelle et
 * détail mensuel) : les 4 cartes de synthèse, l'en-tête du tableau et les
 * cellules de valeur (ou tirets). Une seule définition — l'ordre des cartes, le
 * formatage des écarts et le rendu « pas de données » ne peuvent plus diverger
 * entre les deux vues (cf. dérives constatées : ordre des cartes, « Écart total »
 * formaté +/- ici et sans signe là).
 *
 * L'« Écart total » est une somme de VALEURS ABSOLUES (toujours ≥ 0) → formaté
 * sans signe (fmtEur) ; l'« Écart de fond » est SIGNÉ → formaté avec signe
 * (fmtEcart). Rouge dès qu'il dépasse EPSILON.
 */

/** Les 4 cartes de synthèse (Feuilles / Encaissé / Écart total / Écart de fond). */
export function CaisseAnalytiqueCards({ summary }: { summary: CaisseSummary }) {
  return (
    <AnalytiqueCardsGrid>
      <StatCard
        label="Feuilles clôturées"
        accent="#818cf8"
        value={fmtInt(summary.sheets)}
      />
      <StatCard
        label="Total encaissé"
        accent="#34d399"
        value={fmtEur(summary.encaisse)}
      />
      <StatCard
        label="Écart total"
        accent="#fbbf24"
        value={
          <span
            className={
              summary.ecartTotal >= EPSILON ? 'text-destructive' : undefined
            }
          >
            {fmtEur(summary.ecartTotal)}
          </span>
        }
      />
      <StatCard
        label="Écart de fond"
        accent="#fb7185"
        value={
          <span
            className={
              Math.abs(summary.fundEcart) >= EPSILON
                ? 'text-destructive'
                : undefined
            }
          >
            {fmtEcart(summary.fundEcart)}
          </span>
        }
      />
    </AnalytiqueCardsGrid>
  )
}

/** En-tête du tableau. `firstLabel` = titre de la 1re colonne (Mois / Jour). */
export function CaisseStatsHead({ firstLabel }: { firstLabel: string }) {
  return (
    <tr className="border-b border-border bg-muted">
      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
        {firstLabel}
      </th>
      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
        Feuilles
      </th>
      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
        <span className="hidden sm:inline">Total encaissé</span>
        <span className="sm:hidden">Encaissé</span>
      </th>
      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
        Écart
      </th>
      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
        Fond
      </th>
    </tr>
  )
}

/** Les 4 cellules de valeur d'une ligne (Feuilles / Encaissé / Écart / Fond), ou
 * quatre tirets grisés si le jour/mois n'a aucune feuille. L'appelant fournit la
 * 1re cellule (mois / jour) avant celles-ci. */
export function CaisseStatCells({
  stats,
}: {
  stats: CaisseSummary | undefined
}) {
  if (!stats) {
    return (
      <>
        <td className="px-2 py-2 text-center text-xs text-muted-foreground/50">
          —
        </td>
        <td className="px-2 py-2 text-right text-xs text-muted-foreground/50">
          —
        </td>
        <td className="px-2 py-2 text-right text-xs text-muted-foreground/50">
          —
        </td>
        <td className="px-3 py-2 text-right text-xs text-muted-foreground/50">
          —
        </td>
      </>
    )
  }
  const ecartOff = stats.ecartTotal >= EPSILON
  const fundOff = Math.abs(stats.fundEcart) >= EPSILON
  return (
    <>
      <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
        {fmtInt(stats.sheets)}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right text-xs font-medium tabular-nums text-foreground">
        {fmtEur(stats.encaisse)}
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums',
          ecartOff ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {fmtEur(stats.ecartTotal)}
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums',
          fundOff ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {fmtEcart(stats.fundEcart)}
      </td>
    </>
  )
}

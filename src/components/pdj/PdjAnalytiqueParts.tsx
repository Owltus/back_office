import { fmtInt, fmtPct } from '#/lib/pdj/format.ts'

/*
 * Briques de tableau partagées par les deux vues analytique PDJ (annuelle et
 * détail mensuel) : en-tête et cellules de valeur/tirets. Les deux vues partagent
 * 5 colonnes (Occupation / Clients / Inclus / Servis / Potentiel) ; la vue
 * annuelle ajoute une colonne « Jours » (withDays). Les CARTES de synthèse, elles,
 * diffèrent volontairement entre les deux vues et restent propres à chaque board.
 */

/** Métriques d'une ligne (mois ou jour). `days` seulement pour la vue annuelle. */
export interface PdjRowStats {
  occupancy: number
  guests: number
  included: number
  served: number
  potential: number
  days?: number
}

/** En-tête du tableau. `firstLabel` = titre de la 1re colonne (Mois / Jour),
 * `withDays` ajoute la colonne « Jours » (vue annuelle). */
export function PdjStatsHead({
  firstLabel,
  withDays,
}: {
  firstLabel: string
  withDays?: boolean
}) {
  return (
    <tr className="border-b border-border bg-muted">
      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
        {firstLabel}
      </th>
      {withDays && (
        <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
          Jours
        </th>
      )}
      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
        <span className="hidden sm:inline">Occupation</span>
        <span className="sm:hidden">Occ.</span>
      </th>
      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
        Clients
      </th>
      <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
        Inclus
      </th>
      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
        Servis
      </th>
      <th className="hidden px-3 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
        Potentiel
      </th>
    </tr>
  )
}

/** Cellules de valeur d'une ligne, ou tirets grisés si le jour/mois n'a aucune
 * donnée. L'appelant fournit la 1re cellule (mois / jour) avant celles-ci. */
export function PdjStatCells({
  stats,
  withDays,
}: {
  stats: PdjRowStats | undefined
  withDays?: boolean
}) {
  if (!stats) {
    return (
      <>
        {withDays && (
          <td className="px-2 py-2 text-center text-xs text-muted-foreground/50">
            —
          </td>
        )}
        <td className="px-2 py-2 text-center text-xs text-muted-foreground/50">
          —
        </td>
        <td className="px-2 py-2 text-center text-xs text-muted-foreground/50">
          —
        </td>
        <td className="hidden px-2 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell">
          —
        </td>
        <td className="px-2 py-2 text-center text-xs text-muted-foreground/50">
          —
        </td>
        <td className="hidden px-3 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell">
          —
        </td>
      </>
    )
  }
  return (
    <>
      {withDays && (
        <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
          {fmtInt(stats.days ?? 0)}
        </td>
      )}
      <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
        {fmtPct(stats.occupancy)}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
        {fmtInt(stats.guests)}
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell">
        {fmtInt(stats.included)}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums text-foreground">
        {fmtInt(stats.served)}
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground sm:table-cell">
        {fmtInt(stats.potential)}
      </td>
    </>
  )
}

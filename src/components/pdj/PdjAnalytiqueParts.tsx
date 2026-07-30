import { fmtInt, fmtPctInt } from '#/lib/pdj/format.ts'
import { ACCENT } from '#/components/analytique/accents.ts'

/*
 * Briques de tableau partagées par les deux vues analytique PDJ (annuelle et
 * détail mensuel) : en-tête et cellules de valeur/tirets. Les deux vues partagent
 * 9 colonnes (Occupation / Clients / Inclus / Servis / Extra / Non servis /
 * Potentiel / Conversion / Remplissage) ; la vue annuelle ajoute une colonne
 * « Jours » (withDays). « Servis » = TOTAL des PDJ servis (extra compris) ;
 * « Extra » = servis à des clients NON réservés (Σ max(0, servi − inclus) par chambre),
 * un SOUS-ensemble de Servis ; « Non servis » = réservés/payés mais jamais servis
 * (Σ max(0, inclus − servi) par chambre). Réconciliation : réservés servis = Servis −
 * Extra ; Inclus = (Servis − Extra) + Non servis. Le GRAPHE, lui, empile 3 tranches
 * DISJOINTES (réservés servis / extra / non servis) pour ne rien double-compter. Le
 * couple Conversion/Remplissage reprend la logique PM/RevPAR de repjour, en base CLIENTS :
 *   • « Conversion » = Servis ÷ Présents — comme le PM (par client présent) ;
 *   • « Remplissage » = Servis ÷ capacité CLIENTS (160/jour = 80 ch. × 2) — comme le
 *     RevPAR (rapporté à toute la capacité, donc bas si l'hôtel est peu rempli).
 * Les deux sont calculées dans le métier (`analytics.ts`) et valent `null` (« — »)
 * quand elles ne sont pas calculables. Les CARTES de synthèse diffèrent volontairement
 * entre les deux vues et restent propres à chaque board.
 */

/** Métriques d'une ligne (mois ou jour). `days` seulement pour la vue annuelle. */
export interface PdjRowStats {
  occupancy: number
  guests: number
  included: number
  served: number
  /** null = conso non saisie ce jour/mois → « — » (non calculable). */
  extra: number | null
  /** null = conso non saisie → « — » (pas de « non servis » sans servi). */
  noShow: number | null
  potential: number
  /** Conversion (%) = servi ÷ présents. null → « — ». Calculée en amont. */
  conversion: number | null
  /** Remplissage (%) = servi ÷ capacité clients. null → « — ». Calculée en amont. */
  coverage: number | null
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
      {/* En-têtes colorées comme leurs valeurs / cartes (Servis indigo, Extra vert,
          Non servis ambre, Conversion cyan, Remplissage rose). L'inline `color`
          l'emporte sur `text-muted-foreground` — même procédé que les cellules. */}
      <th
        className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
        style={{ color: ACCENT.indigo }}
      >
        Servis
      </th>
      <th
        className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell"
        style={{ color: ACCENT.green }}
      >
        Extra
      </th>
      <th
        className="hidden whitespace-nowrap px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell"
        style={{ color: ACCENT.amber }}
      >
        Non servis
      </th>
      <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
        Potentiel
      </th>
      <th
        className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
        style={{ color: ACCENT.cyan }}
      >
        <span className="hidden sm:inline">Conversion</span>
        <span className="sm:hidden">Conv.</span>
      </th>
      <th
        className="hidden px-3 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell"
        style={{ color: ACCENT.pink }}
      >
        Remplissage
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
        <td className="hidden px-2 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell">
          —
        </td>
        <td className="hidden px-2 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell">
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
        {fmtPctInt(stats.occupancy)}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
        {fmtInt(stats.guests)}
      </td>
      <td
        className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell"
        style={{ color: ACCENT.slate }}
      >
        {fmtInt(stats.included)}
      </td>
      {/* « Servis » = TOTAL des PDJ servis (extra compris). Extra en est un sous-
          ensemble (servis sans réservation) ; le graphe empile à part la portion
          réservée (servi − extra) et l'extra. « — » si conso non saisie (extra null). */}
      <td
        className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums text-muted-foreground/50"
        style={stats.extra != null ? { color: ACCENT.indigo } : undefined}
      >
        {stats.extra != null ? fmtInt(stats.served) : '—'}
      </td>
      <td
        className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums text-muted-foreground/50 sm:table-cell"
        style={stats.extra != null ? { color: ACCENT.green } : undefined}
      >
        {stats.extra != null ? fmtInt(stats.extra) : '—'}
      </td>
      <td
        className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums text-muted-foreground/50 sm:table-cell"
        style={stats.noShow != null ? { color: ACCENT.amber } : undefined}
      >
        {stats.noShow != null ? fmtInt(stats.noShow) : '—'}
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums text-muted-foreground sm:table-cell">
        {fmtInt(stats.potential)}
      </td>
      {/* Conversion / Remplissage : calculées en amont (métier), base CLIENTS.
          Conversion en cyan (--chart-2), même code couleur que sa carte de synthèse. */}
      <td
        className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums text-muted-foreground/50"
        style={stats.conversion != null ? { color: ACCENT.cyan } : undefined}
      >
        {stats.conversion != null ? fmtPctInt(stats.conversion) : '—'}
      </td>
      <td
        className="hidden whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground/50 sm:table-cell"
        style={stats.coverage != null ? { color: ACCENT.pink } : undefined}
      >
        {stats.coverage != null ? fmtPctInt(stats.coverage) : '—'}
      </td>
    </>
  )
}

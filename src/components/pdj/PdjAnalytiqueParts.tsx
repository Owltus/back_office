import { fmtInt, fmtPctInt } from '#/lib/pdj/format.ts'
import { ACCENT } from '#/components/analytique/accents.ts'
import {
  AnalytiqueCardsGrid,
  StatCard,
  subText,
} from '#/components/analytique/AnalytiqueCards.tsx'

/*
 * Briques de tableau partagées par les deux vues analytique PDJ (annuelle et
 * détail mensuel) : en-tête et cellules de valeur/tirets. Les deux vues partagent
 * 8 colonnes (Occupation / Clients / Inclus / Servis / Extra / Non servis /
 * Potentiel / Captage) ; la vue annuelle ajoute une colonne « Jours » (withDays).
 * « Servis » = TOTAL des PDJ servis (extra compris) ; « Extra » = servis à des
 * clients NON réservés (Σ max(0, servi − inclus) par chambre), un SOUS-ensemble de
 * Servis ; « Non servis » = réservés/payés mais jamais servis (Σ max(0, inclus −
 * servi) par chambre). Réconciliation : réservés servis = Servis − Extra ; Inclus =
 * (Servis − Extra) + Non servis. Le GRAPHE, lui, empile 3 tranches DISJOINTES
 * (réservés servis / extra / non servis) pour ne rien double-compter. Le « Captage »
 * = Servis ÷ Présents (part des clients présents ayant pris le petit-déjeuner),
 * calculé dans le métier (`analytics.ts`), vaut `null` (« — ») s'il n'est pas
 * calculable. Les CARTES de synthèse (PdjAnalytiqueCards) sont IDENTIQUES en annuel
 * et mensuel → une seule définition, partagée ci-dessous.
 */

/** Résumé PDJ (mêmes champs en annuel et mensuel) alimentant les 6 cartes. */
export interface PdjAnalytiqueSummary {
  avgInclus: number | null
  avgServis: number | null
  avgExtra: number | null
  avgNonServis: number | null
  avgConversion: number | null
  totalIncluded: number
  totalServed: number
  totalExtra: number
  totalNonServis: number
}

/** Les 5 cartes de synthèse PDJ — IDENTIQUES en vue annuelle et mensuelle (même
 * `summary`). Valeur = total, sous-texte = cadence « moy. X / jour » ; le Captage
 * est un taux (pas de sous-texte). Une seule définition, partagée. */
export function PdjAnalytiqueCards({
  summary,
}: {
  summary: PdjAnalytiqueSummary
}) {
  return (
    <AnalytiqueCardsGrid cols={5}>
      <StatCard
        label="Inclus"
        accent={ACCENT.slate}
        hint="Petits-déjeuners réservés par les clients"
        sub={
          summary.avgInclus != null
            ? subText(`moy. ${fmtInt(summary.avgInclus)} / jour`)
            : undefined
        }
        value={summary.avgInclus != null ? fmtInt(summary.totalIncluded) : '—'}
      />
      <StatCard
        label="Servis"
        accent={ACCENT.indigo}
        hint="Tous les petits-déjeuners servis, extra compris"
        sub={
          summary.avgServis != null
            ? subText(`moy. ${fmtInt(summary.avgServis)} / jour`)
            : undefined
        }
        value={summary.avgServis != null ? fmtInt(summary.totalServed) : '—'}
      />
      <StatCard
        label="Extra"
        accent={ACCENT.green}
        hint="Petits-déjeuners servis à des clients sans réservation"
        sub={
          summary.avgExtra != null
            ? subText(`moy. ${fmtInt(summary.avgExtra)} / jour`)
            : undefined
        }
        value={summary.avgExtra != null ? fmtInt(summary.totalExtra) : '—'}
      />
      <StatCard
        label="Non servis"
        accent={ACCENT.amber}
        hint="Petits-déjeuners réservés dont le client ne s'est pas présenté"
        sub={
          summary.avgNonServis != null
            ? subText(`moy. ${fmtInt(summary.avgNonServis)} / jour`)
            : undefined
        }
        value={
          summary.avgNonServis != null ? fmtInt(summary.totalNonServis) : '—'
        }
      />
      <StatCard
        label="Captage"
        accent={ACCENT.pink}
        hint="Clients servis rapportés aux clients présents"
        value={
          summary.avgConversion != null ? fmtPctInt(summary.avgConversion) : '—'
        }
      />
    </AnalytiqueCardsGrid>
  )
}

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
  /** Captage (%) = servi ÷ présents. null → « — ». Calculé en amont. */
  conversion: number | null
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
          Non servis ambre, Captage rose). L'inline `color` l'emporte sur
          `text-muted-foreground` — même procédé que les cellules. */}
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
        className="px-3 py-2 text-center text-xs font-medium text-muted-foreground"
        style={{ color: ACCENT.pink }}
      >
        <span className="hidden sm:inline">Captage</span>
        <span className="sm:hidden">Capt.</span>
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
        <td className="px-3 py-2 text-center text-xs text-muted-foreground/50">
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
      {/* Captage : calculé en amont (métier), base CLIENTS. En rose (--chart-4),
          même code couleur que sa carte de synthèse. */}
      <td
        className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium tabular-nums text-muted-foreground/50"
        style={stats.conversion != null ? { color: ACCENT.pink } : undefined}
      >
        {stats.conversion != null ? fmtPctInt(stats.conversion) : '—'}
      </td>
    </>
  )
}

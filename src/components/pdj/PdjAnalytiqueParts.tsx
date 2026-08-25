import { fmtEur, fmtInt, fmtPctInt } from '#/lib/pdj/format.ts'
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
 * CA / Captage) ; la vue annuelle ajoute une colonne « Jours » (withDays).
 *
 * `stats.served` (la donnée brute, alimentant aussi le Captage ci-dessous) est le
 * TOTAL des PDJ servis, extra compris. La colonne « Servis » du TABLEAU, elle,
 * affiche ce total MOINS l'extra (`served - extra`) : à côté d'une colonne
 * « Extra » séparée, additionner deux fois les mêmes extras (55 servis dont 5
 * extra, PUIS 5 extra à côté) lisait comme une incohérence. Extra reste un
 * SOUS-ensemble de `served` (Σ max(0, servi − inclus) par chambre) ; « Non
 * servis » = réservés/payés mais jamais servis (Σ max(0, inclus − servi) par
 * chambre). Réconciliation : Inclus = Servis (colonne, donc déjà hors extra) +
 * Non servis. Le GRAPHE empile les 3 mêmes tranches DISJOINTES (servis hors
 * extra / extra / non servis) pour ne rien double-compter — même valeurs que le
 * tableau. Le « Captage » = `served` (brut, extra compris) ÷ Présents (part des
 * clients présents ayant pris le petit-déjeuner), calculé dans le métier
 * (`analytics.ts`), vaut `null` (« — ») s'il n'est pas calculable. Les CARTES de
 * synthèse (PdjAnalytiqueCards), elles, gardent le TOTAL brut sur leur « Servis »
 * (leur `hint` le dit explicitement : « extra compris ») — seule la colonne du
 * tableau change. Cartes IDENTIQUES en annuel et mensuel → une seule définition,
 * partagée ci-dessous.
 *
 * Couleurs alignées sur la page PDJ du jour (BreakfastBoard), qui fait référence :
 * Inclus vert (#34d399, « PDJ inclus »), Extra ambre (#fbbf24, « PDJ Extra »),
 * CA bleu (#60a5fa, « CA PDJ »), Captage rose (#f472b6, « Taux de captage »).
 * Servis et Non servis n'ont pas d'équivalent sur le board : indigo/cyan
 * (`accents.ts`), choisis pour rester distincts des 4 couleurs ci-dessus.
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
  /** CA petit-déjeuner (total HT inclus + extras) sur la période ; moyenne / jour.
   * null si aucun jour avec CA (pas d'Addon exploitable). */
  totalCa: number | null
  avgCa: number | null
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
    <AnalytiqueCardsGrid cols={6}>
      <StatCard
        label="Inclus"
        accent="#34d399"
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
        accent="#fbbf24"
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
        accent={ACCENT.cyan}
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
        label="CA"
        accent="#60a5fa"
        hint="Chiffre d'affaires petit-déjeuner (inclus + extras), HT"
        sub={
          summary.avgCa != null
            ? subText(`moy. ${fmtEur(summary.avgCa, 0)} / jour`)
            : undefined
        }
        value={summary.totalCa != null ? fmtEur(summary.totalCa, 0) : '—'}
      />
      <StatCard
        label="Captage"
        accent="#f472b6"
        hint="Petits-déjeuners (inclus + extras) rapportés aux clients"
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
  /** CA PDJ = total HT (inclus + extras) du jour/mois. null → « — » (pas d'Addon
   * ou total non chiffrable). Calculé en amont (croisement Addon × In-House). */
  caPdj: number | null
  /** Captage (%) = (inclus + extras) ÷ clients. null → « — ». Calculé en amont. */
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
      {/* Même bleu que la carte « Clients » du board. */}
      <th
        className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
        style={{ color: '#38bdf8' }}
      >
        Clients
      </th>
      <th
        className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell"
        style={{ color: '#34d399' }}
      >
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
        style={{ color: '#fbbf24' }}
      >
        Extra
      </th>
      <th
        className="hidden whitespace-nowrap px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell"
        style={{ color: ACCENT.cyan }}
      >
        Non servis
      </th>
      <th
        className="hidden whitespace-nowrap px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell"
        style={{ color: '#60a5fa' }}
      >
        CA
      </th>
      <th
        className="px-3 py-2 text-center text-xs font-medium text-muted-foreground"
        style={{ color: '#f472b6' }}
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
      <td
        className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums"
        style={{ color: '#38bdf8' }}
      >
        {fmtInt(stats.guests)}
      </td>
      <td
        className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell"
        style={{ color: '#34d399' }}
      >
        {fmtInt(stats.included)}
      </td>
      {/* « Servis » = servi − extra (la portion RÉSERVÉE effectivement servie),
          PAS le total brut : à côté d'une colonne Extra séparée, additionner deux
          fois les mêmes extras (55 servis dont 5 extra, PUIS 5 extra à côté)
          lisait comme une incohérence. « — » si conso non saisie (extra null). */}
      <td
        className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums text-muted-foreground/50"
        style={stats.extra != null ? { color: ACCENT.indigo } : undefined}
      >
        {stats.extra != null ? fmtInt(stats.served - stats.extra) : '—'}
      </td>
      <td
        className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums text-muted-foreground/50 sm:table-cell"
        style={stats.extra != null ? { color: '#fbbf24' } : undefined}
      >
        {stats.extra != null ? fmtInt(stats.extra) : '—'}
      </td>
      <td
        className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums text-muted-foreground/50 sm:table-cell"
        style={stats.noShow != null ? { color: ACCENT.cyan } : undefined}
      >
        {stats.noShow != null ? fmtInt(stats.noShow) : '—'}
      </td>
      {/* CA PDJ = total HT (inclus + extras), croisement Addon × In-House. Même
          bleu que la carte « CA PDJ » du board. « — » sans Addon ou total non
          chiffrable. */}
      <td
        className="hidden whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums text-muted-foreground/50 sm:table-cell"
        style={stats.caPdj != null ? { color: '#60a5fa' } : undefined}
      >
        {stats.caPdj != null ? fmtEur(stats.caPdj, 0) : '—'}
      </td>
      {/* Captage : calculé en amont (métier), base CLIENTS. Même rose que la carte
          « Taux de captage » du board. */}
      <td
        className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium tabular-nums text-muted-foreground/50"
        style={stats.conversion != null ? { color: '#f472b6' } : undefined}
      >
        {stats.conversion != null ? fmtPctInt(stats.conversion) : '—'}
      </td>
    </>
  )
}

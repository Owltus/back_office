import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

import { AnalytiqueShell, ToolbarCell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { useYearNav } from '#/components/analytique/YearNav.tsx'
import { useAnnualYear } from '#/components/analytique/useAnnualYear.ts'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { ACCENT } from '#/components/analytique/accents.ts'
import { KpiStackedBarChart } from '#/components/analytique/KpiStackedBarChart.tsx'
import type { KpiBarSegment } from '#/components/analytique/KpiStackedBarChart.tsx'
import { AddonImportButton } from '#/components/pdj/AddonImportButton.tsx'
import {
  PdjAnalytiqueCards,
  PdjStatCells,
  PdjStatsHead,
} from '#/components/pdj/PdjAnalytiqueParts.tsx'
import {
  fetchAllAddonProduction,
  fetchDailyAgg,
  fetchExternalsRange,
  fetchServiceDates,
} from '#/lib/pdj/service.ts'
import { aggregatePdjMonthly, yearsFromDates } from '#/lib/pdj/analytics.ts'
import { computeAggDailyTotals } from '#/lib/pdj/amounts.ts'
import { detectTarifs } from '#/lib/pdj/tarif.ts'
import { fmtInt } from '#/lib/pdj/format.ts'
import { MONTHS_LABELS, MONTHS_SHORT } from '#/lib/repjour/constants.ts'

/*
 * Vue analytique PDJ — gabarit calqué sur repjour/AnalytiqueBoard.
 *
 * Charge en LECTURE les lignes de l'année sélectionnée (fetchRange), les agrège
 * par mois (aggregatePdjMonthly), puis rend : cartes de synthèse annuelle,
 * tableau mois par mois et un histogramme empilé (par mois : Servis +
 * Extra + Non servis ; sur un mois sans conso saisie, repli sur l'Inclus attendu,
 * dans une couleur neutre à part). Aucune écriture Supabase — uniquement des
 * `select`. Ouvert à tous les rôles connectés en lecture (garde `ProtectedRoute`
 * sur la route).
 */

const currentYear = new Date().getFullYear()

export function PdjAnalytiqueBoard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Années disponibles (dérivées des jours de service en base).
  const { data: dates = [] } = useQuery({
    queryKey: ['pdj', 'dates'],
    queryFn: fetchServiceDates,
  })
  const years = useMemo(() => yearsFromDates(dates, currentYear), [dates])

  // Année sélectionnée + recalage si absente de la liste (hook partagé).
  const { year, setYear } = useAnnualYear(years, currentYear)

  // Lignes AGRÉGÉES de l'année (vue pdj_daily_agg) → agrégation mensuelle. Cache
  // par année (retour instantané, partagé avec la vue « mois »).
  const { data: rows = [], isPending: loading } = useQuery({
    queryKey: ['pdj', 'analytics', year],
    queryFn: () => fetchDailyAgg(`${year}-01-01`, `${year}-12-31`),
  })

  // Addon Production (tous jours) → tarifs détectés → CA PDJ (croisé avec l'année).
  const { data: addonRows = [] } = useQuery({
    queryKey: ['pdj', 'addon-all'],
    queryFn: fetchAllAddonProduction,
  })

  // Externes de l'année (bouton « Externe » du board) : s'additionnent au PDJ
  // Extra du jour, comptes ET CA. Quelques lignes au plus (pas de pagination).
  const { data: externalsRows = [] } = useQuery({
    queryKey: ['pdj', 'externals', year],
    queryFn: () => fetchExternalsRange(`${year}-01-01`, `${year}-12-31`),
  })
  const externalsByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of externalsRows) map.set(r.service_date, r.count)
    return map
  }, [externalsRows])

  const months = useMemo(
    () => aggregatePdjMonthly(rows, year, externalsByDate),
    [rows, year, externalsByDate],
  )

  // CA PDJ (total HT inclus + extras) cumulé par mois. null pour un mois sans
  // Addon exploitable (« — » au tableau).
  const caStats = useMemo(() => {
    const tarifs = detectTarifs(addonRows)
    const totals = computeAggDailyTotals(rows, tarifs, externalsByDate)
    const byMonth = new Array<number | null>(12).fill(null)
    let total = 0
    let days = 0
    for (const [date, t] of totals) {
      if (!date.startsWith(`${year}-`)) continue
      const m = Number(date.slice(5, 7)) - 1
      if (m < 0 || m > 11) continue
      byMonth[m] = (byMonth[m] ?? 0) + t
      total += t
      days += 1
    }
    return { byMonth, total, days }
  }, [addonRows, rows, year, externalsByDate])

  // Moyennes PAR JOUR. Inclus : par jour de service (connu partout). Servis / Extra
  // / Non servis : par jour RENSEIGNÉ (conso saisie) — sinon un jour non renseigné
  // les tirerait vers le bas. « Servis » = TOTAL servi (extra compris), comme le
  // tableau. Captage : total servi (extras compris) sur les présents. `null` si
  // le dénominateur est nul (→ « — »).
  const summary = useMemo(() => {
    const totalDays = months.reduce((s, m) => s + m.days, 0)
    const recDays = months.reduce((s, m) => s + m.recordedDays, 0)
    const totalIncluded = months.reduce((s, m) => s + m.included, 0)
    const totalServed = months.reduce((s, m) => s + m.served, 0)
    const totalExtra = months.reduce((s, m) => s + (m.extra ?? 0), 0)
    const totalNonServis = months.reduce((s, m) => s + (m.noShow ?? 0), 0)
    // Clients cumulés (tous les mois) — dénominateur du captage.
    const totalGuests = months.reduce((s, m) => s + m.guests, 0)
    return {
      avgInclus: totalDays > 0 ? totalIncluded / totalDays : null,
      avgServis: recDays > 0 ? totalServed / recDays : null,
      avgExtra: recDays > 0 ? totalExtra / recDays : null,
      avgNonServis: recDays > 0 ? totalNonServis / recDays : null,
      // Totaux additionnés de la période : valeur centrale des cartes de comptage ;
      // la moyenne / jour passe en 2e info.
      totalIncluded,
      totalServed,
      totalExtra,
      totalNonServis,
      // Captage = (inclus + extras) ÷ clients (base = inclus ; augmente avec les extras).
      avgConversion:
        totalGuests > 0
          ? ((totalIncluded + totalExtra) / totalGuests) * 100
          : null,
      // CA petit-déjeuner : somme HT sur l'année + moyenne par jour (jours avec CA).
      totalCa: caStats.days > 0 ? caStats.total : null,
      avgCa: caStats.days > 0 ? caStats.total / caStats.days : null,
    }
  }, [months, caStats])

  // Une barre par mois. Mois RENSEIGNÉ (conso saisie) → empilement disjoint
  // Servis (= servi − extra) + Extra + Non servis. Mois SANS conso → repli
  // sur l'Inclus attendu (autre couleur), pour ne pas afficher une barre vide.
  const chartData = useMemo(
    () =>
      months.map((m) => {
        const mois = MONTHS_SHORT[m.month - 1]
        if (m.extra != null && m.noShow != null) {
          return {
            mois,
            month: m.month,
            servisInclus: m.served - m.extra,
            extra: m.extra,
            nonVenu: m.noShow,
            inclus: null,
          }
        }
        return {
          mois,
          month: m.month,
          servisInclus: null,
          extra: null,
          nonVenu: null,
          inclus: m.days > 0 ? m.included : null,
        }
      }),
    [months],
  )

  // Segments présents seulement s'ils portent au moins une valeur (légende propre).
  const segments = useMemo<KpiBarSegment[]>(() => {
    const segs: KpiBarSegment[] = []
    if (chartData.some((d) => d.servisInclus != null)) {
      segs.push(
        { key: 'servisInclus', name: 'Réservés servis', color: ACCENT.indigo },
        { key: 'extra', name: 'Extra', color: '#fbbf24' },
        { key: 'nonVenu', name: 'Non servis', color: ACCENT.cyan },
      )
    }
    if (chartData.some((d) => d.inclus != null)) {
      segs.push({
        key: 'inclus',
        name: 'Inclus (non saisi)',
        color: '#34d399',
      })
    }
    return segs
  }, [chartData])

  // `useYearNav` directement (pas le composant `<YearNav>`) : goPrev/goNext/
  // prevDisabled/nextDisabled sont réutilisés par la barre d'outils basse
  // tactile ci-dessous, comme sur /rapro (RaproAnalytiqueBoard). Appeler AUSSI
  // `<YearNav>` en plus de ce hook doublerait `useStepNavKeys` (deux écouteurs
  // clavier ←/→ sur la même action).
  const { goPrev, goNext, prevDisabled, nextDisabled } = useYearNav({
    year,
    setYear,
    years,
    currentYear,
  })

  return (
    <AnalytiqueShell
      title="Analytique"
      mobileIdentity={`Analytique ${year}`}
      actions={
        <>
          {/* Import Addon Production (admin) accolé à l'impression : dépôt d'un CSV
              « plage » (plusieurs jours) → upsert pdj_addon_production. Rafraîchit
              toutes les vues PDJ (analytique + board). Volontairement ABSENT de la
              barre basse tactile (mobileToolbar ci-dessous) : import de fichier
              admin, usage rare et déjà pensé souris/clavier (même logique que le
              bouton « Externe » du board du jour) — reste accessible en mode
              souris uniquement. */}
          <AddonImportButton
            onImported={() =>
              queryClient.invalidateQueries({ queryKey: ['pdj'] })
            }
          />
          {/* enlargeOnNarrow={false} : ce groupe n'est JAMAIS montré sur écran
              tactile (barre basse dédiée dès qu'un doigt est détecté, cf.
              mobileToolbar) — l'agrandir à un simple rétrécissement de fenêtre
              désaccorderait sa taille de celle du bouton Import voisin, resté
              fixe. */}
          <StepNav
            onPrev={goPrev}
            onNext={goNext}
            prevLabel="Année précédente"
            nextLabel="Année suivante"
            prevDisabled={prevDisabled}
            nextDisabled={nextDisabled}
            enlargeOnNarrow={false}
          >
            <span className="inline-flex h-8 items-center justify-center border bg-background px-3 text-sm font-medium tabular-nums shadow-xs dark:border-input dark:bg-input/30">
              {year}
            </span>
          </StepNav>
        </>
      }
      mobileToolbar={(printCell) => (
        <>
          <ToolbarCell
            icon={<ChevronLeft className="size-5" />}
            label="Préc."
            ariaLabel="Année précédente"
            onClick={goPrev}
            disabled={prevDisabled}
            bordered={false}
          />
          <ToolbarCell
            icon={<ArrowLeft className="size-5" />}
            label="Retour"
            ariaLabel="Retour au petit-déjeuner"
            onClick={() => navigate({ to: '/pdj' })}
          />
          {printCell}
          <ToolbarCell
            icon={<ChevronRight className="size-5" />}
            label="Suiv."
            ariaLabel="Année suivante"
            onClick={goNext}
            disabled={nextDisabled}
          />
        </>
      )}
      loading={loading}
      printTitle={`PDJ · ${year}`}
      skeleton={{ cols: 8, charts: 1, rows: 12, cards: 6, cardCols: 6, cardLines: 3 }}
    >
      <PdjAnalytiqueCards summary={summary} />

      {/* Tableau mois par mois */}
      <AnalytiqueTable head={<PdjStatsHead firstLabel="Mois" />}>
        <tbody>
          {months.map((m) => {
            const hasData = m.days > 0
            return (
              <tr
                key={m.month}
                onClick={() =>
                  navigate({
                    to: '/pdj/analytique/$year/$month',
                    params: {
                      year: String(year),
                      month: String(m.month),
                    },
                  })
                }
                className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40 ${
                  hasData ? '' : 'bg-muted/20'
                }`}
              >
                <td
                  className={`whitespace-nowrap px-3 py-2 text-xs font-medium ${
                    hasData ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {MONTHS_LABELS[m.month - 1]}
                </td>
                <PdjStatCells
                  stats={
                    hasData
                      ? {
                          occupancy: m.avgOccupancy,
                          guests: m.guests,
                          included: m.included,
                          served: m.served,
                          extra: m.extra,
                          noShow: m.noShow,
                          caPdj: caStats.byMonth[m.month - 1],
                          conversion: m.conversion,
                        }
                      : undefined
                  }
                />
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Histogramme empilé par mois : Servis + Extra + Non servis (répartition
          disjointe des PDJ) ; repli sur l'Inclus attendu, couleur neutre, quand la
          conso du mois n'a pas été saisie. */}
      <AnalytiqueCharts cols={1}>
        <KpiStackedBarChart
          title="Répartition des petits-déjeuners par mois"
          data={chartData}
          xKey="mois"
          segments={segments}
          legendOrder={['inclus', 'extra', 'nonVenu', 'servisInclus']}
          onBarClick={(p) => {
            // Clic sur une colonne (mois) → page détail du mois.
            const m = p.month
            if (typeof m === 'number')
              navigate({
                to: '/pdj/analytique/$year/$month',
                params: { year: String(year), month: String(m) },
              })
          }}
          tooltipFormatter={fmtInt}
          labelFormatter={(label) => {
            // L'axe X est abrégé (« Fév ») ; l'infobulle montre le mois complet.
            const i = MONTHS_SHORT.indexOf(label)
            return i >= 0 ? `${MONTHS_LABELS[i]} ${year}` : label
          }}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}

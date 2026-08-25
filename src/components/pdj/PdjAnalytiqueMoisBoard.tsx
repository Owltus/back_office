import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { AnalytiqueShell, ToolbarCell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { AnalytiqueBackButton } from '#/components/analytique/AnalytiqueBackButton.tsx'
import { KpiStackedBarChart } from '#/components/analytique/KpiStackedBarChart.tsx'
import type { KpiBarSegment } from '#/components/analytique/KpiStackedBarChart.tsx'
import { ACCENT } from '#/components/analytique/accents.ts'
import {
  PdjAnalytiqueCards,
  PdjStatCells,
  PdjStatsHead,
} from '#/components/pdj/PdjAnalytiqueParts.tsx'
import {
  fetchAllAddonProduction,
  fetchDailyAgg,
  fetchExternalsRange,
} from '#/lib/pdj/service.ts'
import {
  aggregatePdjDaily,
  aggregatePdjLoadPoints,
  computeRuptureThreshold,
} from '#/lib/pdj/analytics.ts'
import { computeAggDailyTotals } from '#/lib/pdj/amounts.ts'
import { detectTarifs } from '#/lib/pdj/tarif.ts'
import { fmtInt } from '#/lib/pdj/format.ts'
import { DAY_NAMES, MONTHS_LABELS } from '#/lib/repjour/constants.ts'

/*
 * Détail analytique PDJ d'un mois, jour par jour — calqué sur le gabarit
 * repjour/AnalytiqueMoisBoard et harmonisé avec PdjAnalytiqueBoard (vue annuelle).
 *
 * Charge en LECTURE les lignes du mois (fetchRange), les agrège par jour
 * (aggregatePdjDaily), puis rend : cartes de synthèse du mois, tableau jour par
 * jour et un histogramme empilé (par jour : Servis + Extra + Non servis ;
 * repli sur l'Inclus attendu, couleur neutre, si la conso du jour n'a pas été
 * saisie). `year` / `month` viennent de la route (params $year/$month). Aucune
 * écriture Supabase — uniquement des `select`.
 */


export function PdjAnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()

  // MÊME clé que la vue annuelle (`['pdj','analytics', year]`) : les lignes de
  // l'année sont lues une seule fois et partagées entre les deux vues (hit de
  // cache instantané au passage annuel → mois, et entre mois). L'agrégation par
  // jour est un calcul client négligeable, dérivé du cache.
  const { data: rows = [], isPending: loading } = useQuery({
    queryKey: ['pdj', 'analytics', year],
    queryFn: () => fetchDailyAgg(`${year}-01-01`, `${year}-12-31`),
  })
  // Externes de l'année (MÊME clé que la vue annuelle → cache partagé). S'additionnent
  // au PDJ Extra du jour, comptes ET CA.
  const { data: externalsRows = [] } = useQuery({
    queryKey: ['pdj', 'externals', year],
    queryFn: () => fetchExternalsRange(`${year}-01-01`, `${year}-12-31`),
  })
  const externalsByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of externalsRows) map.set(r.service_date, r.count)
    return map
  }, [externalsRows])

  const stats = useMemo(
    () => aggregatePdjDaily(rows, year, month, externalsByDate),
    [rows, year, month, externalsByDate],
  )

  // Seuil de rupture (« courbe de panique ») : calculé sur TOUT l'historique
  // (bornes larges plutôt qu'un aller-retour pour connaître la date la plus
  // ancienne — la vue `pdj_daily_agg` ne pèse de toute façon que quelques
  // centaines de lignes), PAS le seul mois affiché — trop peu de jours
  // renseignés pour un seuil fiable. MÊME clé partout : un seul calcul, partagé
  // entre tous les mois consultés. `staleTime` généreux : un seuil statistique
  // n'a pas besoin d'être recalculé à la seconde près.
  //
  // Un seul chiffre pour tout le mois (pas un seuil par jour de semaine, essayé
  // puis jugé trop confus à lire) — une ligne nette, unique, facile à retenir.
  const { data: historyRows = [] } = useQuery({
    queryKey: ['pdj', 'analytics', 'all-history'],
    queryFn: () => fetchDailyAgg('2000-01-01', '2100-12-31'),
    staleTime: 5 * 60_000,
  })
  const rupture = useMemo(
    () => computeRuptureThreshold(aggregatePdjLoadPoints(historyRows)),
    [historyRows],
  )

  // Addon Production (tous jours) → tarifs détectés → CA PDJ par jour.
  const { data: addonRows = [] } = useQuery({
    queryKey: ['pdj', 'addon-all'],
    queryFn: fetchAllAddonProduction,
  })
  const dailyCa = useMemo(
    () => computeAggDailyTotals(rows, detectTarifs(addonRows), externalsByDate),
    [addonRows, rows, externalsByDate],
  )

  // Index par numéro de jour pour peupler un tableau plein mois (1..lastDay),
  // les jours sans donnée restant en tirets grisés.
  const byDay = useMemo(() => {
    const map = new Map<number, (typeof stats)[number]>()
    for (const s of stats) map.set(s.day, s)
    return map
  }, [stats])

  const days = useMemo(
    () => Array.from({ length: lastDay }, (_, i) => i + 1),
    [lastDay],
  )

  // Moyennes par jour (cf. PdjAnalytiqueBoard). Inclus : par jour de service.
  // Servis (= total servi, extra compris) / Extra / Non servis : par jour RENSEIGNÉ.
  // Captage : total servi (extras compris) ÷ présents. `null` → « — ».
  const summary = useMemo(() => {
    const totalDays = stats.length
    const recorded = stats.filter((d) => d.extra != null)
    const recDays = recorded.length
    const totalIncluded = stats.reduce((s, d) => s + d.included, 0)
    const totalServed = stats.reduce((s, d) => s + d.served, 0)
    const totalExtra = recorded.reduce((s, d) => s + (d.extra ?? 0), 0)
    const totalNonServis = recorded.reduce((s, d) => s + (d.noShow ?? 0), 0)
    // Clients des SEULS jours renseignés (servi saisi) — dénominateur des taux
    // servi-dépendants, pour ne pas les diluer avec les jours réservés non saisis.
    const totalGuests = stats.reduce((s, d) => s + d.guests, 0)
    // CA petit-déjeuner du mois : somme HT + moyenne / jour (jours avec CA).
    const caPrefix = `${year}-${mm}-`
    let caTotal = 0
    let caDays = 0
    for (const [date, t] of dailyCa) {
      if (!date.startsWith(caPrefix)) continue
      caTotal += t
      caDays += 1
    }
    return {
      avgInclus: totalDays > 0 ? totalIncluded / totalDays : null,
      avgServis: recDays > 0 ? totalServed / recDays : null,
      avgExtra: recDays > 0 ? totalExtra / recDays : null,
      avgNonServis: recDays > 0 ? totalNonServis / recDays : null,
      // Totaux additionnés du mois : valeur centrale des cartes de comptage ; la
      // moyenne / jour passe en 2e info.
      totalIncluded,
      totalServed,
      totalExtra,
      totalNonServis,
      // Captage = (inclus + extras) ÷ clients (base = inclus ; augmente avec les extras).
      avgConversion:
        totalGuests > 0
          ? ((totalIncluded + totalExtra) / totalGuests) * 100
          : null,
      // CA petit-déjeuner : somme HT du mois + moyenne par jour (jours avec CA).
      totalCa: caDays > 0 ? caTotal : null,
      avgCa: caDays > 0 ? caTotal / caDays : null,
    }
  }, [stats, dailyCa, year, mm])

  // Une barre par jour. Jour RENSEIGNÉ (conso saisie) → empilement disjoint Servis
  // inclus (= servi − extra) + Extra + Non servis. Jour SANS conso → repli sur
  // l'Inclus attendu (autre couleur), pour ne pas afficher une barre vide.
  const chartData = useMemo(
    () =>
      days.map((day) => {
        const s = byDay.get(day)
        const jour = String(day)
        // `inclusTotal`/`servedTotal` : TOUJOURS renseignés (même quand la conso
        // n'est pas saisie) — servent uniquement l'infobulle (cf. `tooltipExtra`
        // ci-dessous), sans tranche dédiée dans le graphe.
        const inclusTotal = s ? s.included : null
        const servedTotal = s ? s.served : null
        if (s && s.extra != null && s.noShow != null) {
          return {
            jour,
            servisInclus: s.served - s.extra,
            extra: s.extra,
            nonVenu: s.noShow,
            inclus: null,
            inclusTotal,
            servedTotal,
          }
        }
        return {
          jour,
          servisInclus: null,
          extra: null,
          nonVenu: null,
          inclus: inclusTotal,
          inclusTotal,
          servedTotal,
        }
      }),
    [days, byDay],
  )

  // Jours ayant dépassé le seuil de rupture (volume d'inclus) — colorés en
  // rouge sur l'axe du graphe. Vide tant qu'aucun seuil fiable n'est calculé.
  const riskDays = useMemo(() => {
    if (!rupture) return new Set<string>()
    return new Set(
      chartData
        .filter((d) => d.inclusTotal != null && d.inclusTotal > rupture.threshold)
        .map((d) => d.jour),
    )
  }, [chartData, rupture])

  // Segments présents seulement s'ils portent au moins une valeur (légende propre).
  const segments = useMemo<KpiBarSegment[]>(() => {
    const segs: KpiBarSegment[] = []
    if (chartData.some((d) => d.servisInclus != null)) {
      segs.push(
        { key: 'servisInclus', name: 'Servis', color: ACCENT.indigo },
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

  const monthLabel = MONTHS_LABELS[month - 1] || ''

  const navigate = useNavigate()

  return (
    <AnalytiqueShell
      title={`${monthLabel} ${year}`}
      mobileIdentity={`Analytique ${monthLabel} ${year}`}
      // enlargeOnNarrow={false} : ce bouton n'est JAMAIS montré sur écran
      // tactile (barre basse dédiée dès qu'un doigt est détecté, cf.
      // mobileToolbar) — l'agrandir à un simple rétrécissement de fenêtre n'a
      // donc plus de raison d'être, comme sur /rapro.
      actions={
        <AnalytiqueBackButton to="/pdj/analytique" enlargeOnNarrow={false} />
      }
      // Seulement Retour + Imprimer : contrairement à /rapro (qui a un pas
      // mois par mois desktop ET clavier), la vue mensuelle PDJ n'a jamais eu
      // de navigation mois-à-mois (ni bouton, ni raccourci ←/→) — seul un
      // retour à l'annuel existe. La barre basse tactile réplique donc
      // exactement cette capacité, sans en inventer une nouvelle.
      mobileToolbar={(printCell) => (
        <>
          <ToolbarCell
            icon={<ArrowLeft className="size-5" />}
            label="Retour"
            ariaLabel="Retour à l'analytique"
            onClick={() => navigate({ to: '/pdj/analytique' })}
            bordered={false}
          />
          {printCell}
        </>
      )}
      loading={loading}
      printTitle={`PDJ · ${monthLabel} ${year}`}
      skeleton={{
        cols: 8,
        charts: 1,
        rows: new Date(year, month, 0).getDate(),
        cards: 6,
        cardCols: 6,
        cardLines: 3,
      }}
    >
      <PdjAnalytiqueCards summary={summary} />

      {/* Tableau jour par jour (défile en interne, en-tête collant) */}
      <AnalytiqueTable head={<PdjStatsHead firstLabel="Jour" />}>
        <tbody>
          {days.map((day) => {
            const s = byDay.get(day)
            const hasData = !!s
            const wd = DAY_NAMES[new Date(year, month - 1, day).getDay()]
            const dayName = wd.charAt(0).toUpperCase() + wd.slice(1)
            const date = `${year}-${mm}-${String(day).padStart(2, '0')}`
            return (
              <tr
                key={day}
                onClick={() => navigate({ to: '/pdj', search: { date } })}
                className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40 ${
                  hasData ? '' : 'bg-muted/20'
                }`}
              >
                <td
                  className={`whitespace-nowrap px-3 py-2 text-xs font-medium ${
                    hasData ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {dayName} {day}
                </td>
                <PdjStatCells
                  stats={
                    s
                      ? {
                          occupancy: s.occupancy,
                          guests: s.guests,
                          included: s.included,
                          served: s.served,
                          extra: s.extra,
                          noShow: s.noShow,
                          caPdj: dailyCa.get(date) ?? null,
                          conversion: s.conversion,
                        }
                      : undefined
                  }
                />
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Histogramme empilé par jour : Servis + Extra + Non servis (répartition
          disjointe des PDJ) ; repli sur l'Inclus attendu, couleur neutre, quand la
          conso du jour n'a pas été saisie. Repère de rupture superposé : une
          seule ligne rouge nette, continue sur tout le mois (même les jours
          sans donnée), à faible opacité (purement indicative), et les jours
          ayant dépassé le seuil en rouge/gras sur l'axe. */}
      <AnalytiqueCharts cols={1}>
        <KpiStackedBarChart
          title="Répartition des petits-déjeuners par jour"
          referenceLine={rupture ? { value: rupture.threshold, opacity: 0.3 } : undefined}
          highlightXValues={riskDays}
          data={chartData}
          xKey="jour"
          segments={segments}
          legendOrder={['inclus', 'extra', 'nonVenu', 'servisInclus']}
          onBarClick={(p) => {
            // Clic sur une barre (jour) → page PDJ de ce jour.
            const day = Number(p.jour)
            if (Number.isFinite(day)) {
              const date = `${year}-${mm}-${String(day).padStart(2, '0')}`
              navigate({ to: '/pdj', search: { date } })
            }
          }}
          tooltipFormatter={fmtInt}
          labelFormatter={(label) => {
            // L'axe X n'affiche que le numéro du jour ; l'infobulle donne le jour de
            // la semaine et la date complète (il y a la place au survol).
            const day = Number(label)
            if (!Number.isFinite(day)) return label
            const weekday = DAY_NAMES[new Date(year, month - 1, day).getDay()]
            const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1)
            return `${cap} ${day} ${MONTHS_LABELS[month - 1].toLowerCase()} ${year}`
          }}
          tooltipExtra={(row) => [
            { name: 'PDJ inclus', value: row.inclusTotal as number | null },
            { name: 'PDJ réellement servi', value: row.servedTotal as number | null },
          ]}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}

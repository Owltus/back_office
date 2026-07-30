import type { ReactNode } from 'react'

import {
  AnalytiqueCardsGrid,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { KpiCell } from '#/components/analytique/KpiCell.tsx'
import { ACCENT } from '#/components/analytique/accents.ts'
import { fmt } from '#/lib/repjour/format.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Briques d'affichage partagées par les deux vues analytique repjour (annuelle et
 * détail mensuel) : les cartes de synthèse, l'en-tête du tableau et les cellules de
 * valeur. Une seule définition — les cartes et les colonnes ne peuvent pas diverger
 * entre les deux vues (elles sont IDENTIQUES, seule la 1re colonne Mois / Jour et
 * ses données changent, à la charge de l'appelant).
 *
 * Cartes : même logique que les autres pages analytique (pdj, parking, caisse) —
 * la valeur est le TOTAL (nuitées, CA) avec la CADENCE en 2e info (« moy. X /
 * jour|mois », fournie par le board), ou un TAUX (occupation, RevPAR) SANS 2e info.
 * Plus de fraction budget : la comparaison à l'objectif vit dans le tableau
 * (colonnes Budget / Écart) et les graphiques.
 *
 * Tableau : Nuitées / TO / PM / RevPAR / CA / Budget / Écart. Le TO passe en rouge
 * en sur-capacité ; l'Écart est vert au-dessus de l'objectif, rouge en dessous.
 */

const { compact, compactDec, compactEcart } = fmt

export interface RepjourCardsSummary {
  totalNuitees: number
  avgTO: number
  avgRevPAR: number
  totalRevenue: number
}

/** Les 4 cartes de synthèse — IDENTIQUES en annuel et mensuel. `nuiteesSub` /
 * `caSub` = 2e info de cadence (« moy. X / jour|mois »), calculée par le board qui
 * connaît le nombre de jours / mois actifs ; `coverage` (« mois / jours passés ou
 * en cours ») n'entre que dans les hints, pour rappeler que les cartes excluent le
 * forecast futur. */
export function RepjourAnalytiqueCards({
  summary,
  coverage,
  nuiteesSub,
  caSub,
}: {
  summary: RepjourCardsSummary
  coverage: string
  nuiteesSub?: ReactNode
  caSub?: ReactNode
}) {
  return (
    <AnalytiqueCardsGrid>
      <StatCard
        label="Chiffre d'affaires"
        accent={ACCENT.amber}
        hint={`Chiffre d'affaires hébergement, TVA comprise, en milliers d'euros. Sur les ${coverage} (hors prévisions).`}
        value={fmt.keur(summary.totalRevenue)}
        sub={caSub}
      />
      <StatCard
        label="Nuitées"
        accent={ACCENT.indigo}
        hint={`Chambres vendues, cumul des nuitées. Sur les ${coverage} (hors prévisions).`}
        value={fmt.nuitees(summary.totalNuitees)}
        sub={nuiteesSub}
      />
      <StatCard
        label="TO moyen"
        accent={ACCENT.cyan}
        hint={`Chambres occupées en moyenne, rapportées aux chambres disponibles. Sur les ${coverage} (hors prévisions).`}
        value={fmt.pctInt(summary.avgTO)}
      />
      <StatCard
        label="Revpar moyen"
        accent={ACCENT.green}
        hint={`Chiffre d'affaires rapporté à toutes les chambres (RevPAR). Sur les ${coverage} (hors prévisions).`}
        value={fmt.eur(summary.avgRevPAR)}
      />
    </AnalytiqueCardsGrid>
  )
}

/** En-tête du tableau — IDENTIQUE en annuel et mensuel. `firstLabel` = titre de la
 * 1re colonne (Mois / Jour). RevPAR et Budget se masquent sous `sm` (place). */
export function RepjourStatsHead({ firstLabel }: { firstLabel: string }) {
  return (
    <tr className="border-b border-border bg-muted">
      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
        {firstLabel}
      </th>
      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
        <span className="hidden sm:inline">Nuitées</span>
        <span className="sm:hidden">Nuit.</span>
      </th>
      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
        TO
      </th>
      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
        PM
      </th>
      <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
        RevPAR
      </th>
      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
        CA
      </th>
      <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
        Budget
      </th>
      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
        <span className="hidden sm:inline">Écart</span>
        <span className="sm:hidden">+/-</span>
      </th>
    </tr>
  )
}

/** Les 7 cellules KPI d'une ligne (Nuitées / TO / PM / RevPAR / CA / Budget /
 * Écart), rendu identique en annuel et mensuel. L'appelant fournit les valeurs
 * déjà extraites (réalisé ou projeté) et les drapeaux d'état ; la 1re cellule
 * (Mois / Jour) reste à sa charge. `future` grise, `overcapacity` passe le TO en
 * rouge, l'Écart est vert (≥ 0) ou rouge selon le signe. `null` → « — ». */
export function RepjourStatCells({
  nuitees,
  to,
  pm,
  revpar,
  ca,
  budget,
  ecart,
  future,
  overcapacity,
}: {
  nuitees: number | null
  to: number | null
  pm: number | null
  revpar: number | null
  ca: number | null
  budget: number | null
  ecart: number | null
  future?: boolean
  overcapacity?: boolean
}) {
  const dim = future ? 'opacity-25' : ''
  return (
    <>
      <KpiCell
        value={nuitees}
        full={fmt.nuitees}
        compact={compact}
        className={dim}
      />
      <KpiCell
        value={to}
        full={fmt.pct}
        compact={compactDec}
        className={overcapacity ? 'font-bold text-destructive' : dim}
      />
      <KpiCell value={pm} full={fmt.eur} compact={compactDec} className={dim} />
      <KpiCell
        value={revpar}
        full={fmt.eur}
        compact={compactDec}
        className={cn('hidden sm:table-cell', dim)}
      />
      <KpiCell value={ca} full={fmt.eurInt} compact={compact} className={dim} />
      <KpiCell
        value={budget}
        full={fmt.eurInt}
        compact={compact}
        className={cn('hidden text-muted-foreground sm:table-cell', dim)}
      />
      <KpiCell
        value={ecart}
        full={fmt.ecartEurInt}
        compact={compactEcart}
        className={cn(
          'font-bold',
          ecart != null && ecart >= 0 ? 'text-emerald-500' : 'text-destructive',
          dim,
        )}
      />
    </>
  )
}

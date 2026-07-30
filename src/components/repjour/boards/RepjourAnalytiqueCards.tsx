import {
  AnalytiqueCardsGrid,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { ACCENT } from '#/components/analytique/accents.ts'
import { fmt } from '#/lib/repjour/format.ts'

/*
 * Cartes de synthèse repjour — PARTAGÉES entre la vue annuelle (AnalytiqueBoard)
 * et le détail mensuel (AnalytiqueMoisBoard) : une seule définition à maintenir.
 * Quatre indicateurs (nuitées, taux d'occupation, RevPAR, chiffre d'affaires),
 * chacun avec sa valeur réalisée et, en 3e ligne, l'objectif budget en FRACTION
 * (barre horizontale) quand un budget existe. Règle des trois lignes : titre /
 * valeur / référence — pas de 2e info ici (la fraction OCCUPE la 3e ligne).
 *
 * `period` n'entre que dans les infobulles (« sur l'année » / « sur le mois »).
 * `budget` porte les objectifs déjà agrégés (numériques) ; null / undefined ⇒
 * valeur seule sans fraction (cas d'un mois sans budget saisi ; en annuel le
 * cumul budget vaut 0 plutôt que d'être absent, donc toujours fourni).
 */

export interface RepjourCardsSummary {
  totalNuitees: number
  avgTO: number
  avgRevPAR: number
  totalRevenue: number
}

export interface RepjourCardsBudget {
  nuitees: number
  to: number
  revpar: number
  revenue: number
}

export function RepjourAnalytiqueCards({
  summary,
  budget,
  period,
}: {
  summary: RepjourCardsSummary
  budget?: RepjourCardsBudget | null
  period: string
}) {
  return (
    <AnalytiqueCardsGrid>
      <StatCard
        label="Nuitées"
        accent={ACCENT.indigo}
        hint={`Chambres vendues sur ${period} (cumul des nuitées). Objectif budget en dessous.`}
        value={fmt.nuitees(summary.totalNuitees)}
        reference={budget ? fmt.nuitees(budget.nuitees) : undefined}
      />
      <StatCard
        label="Taux d'occupation moyen"
        accent={ACCENT.cyan}
        hint="Chambres occupées en moyenne, rapportées aux chambres disponibles."
        value={fmt.pct(summary.avgTO)}
        reference={budget ? fmt.pct(budget.to) : undefined}
      />
      <StatCard
        label="Revenu moyen par chambre"
        accent={ACCENT.green}
        hint="Chiffre d'affaires rapporté à toutes les chambres (RevPAR)."
        value={fmt.eur(summary.avgRevPAR)}
        reference={budget ? fmt.eur(budget.revpar) : undefined}
      />
      <StatCard
        label="Chiffre d'affaires"
        accent={ACCENT.amber}
        hint={`Chiffre d'affaires hébergement sur ${period}, TVA comprise.`}
        value={fmt.eurInt(summary.totalRevenue)}
        reference={budget ? fmt.eurInt(budget.revenue) : undefined}
      />
    </AnalytiqueCardsGrid>
  )
}

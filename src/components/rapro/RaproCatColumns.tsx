import type { ReactNode } from 'react'

import type { KpiBarSegment } from '#/components/analytique/KpiStackedBarChart.tsx'
import { CATEGORY_COLOR } from '#/lib/rapro/constants.ts'
import {
  AnalytiqueCardsGrid,
  shareSub,
  StatCard,
  subText,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { cleaned, vendues } from '#/lib/rapro/monthly.ts'
import type { DayStatusCounts } from '#/lib/rapro/monthly.ts'

/** Segments de l'histogramme empilé des deux vues analytique — mêmes couleurs
 * que les colonnes du tableau : nettoyée + bloquée de la veille (rattrapage) +
 * bloquée + refus. La pile dépasse donc les « vendues » quand des bloquées de la
 * veille ont été nettoyées (elles ne sont pas des ventes du jour, mais bien des
 * ménages facturés — même lecture que la page du jour). Source unique, importée
 * par les deux boards. */
export const RAPRO_CHART_SEGMENTS: KpiBarSegment[] = [
  { key: 'nettoyee', name: 'Nettoyées', color: CATEGORY_COLOR.nettoyee },
  {
    key: 'rattrapage',
    name: 'Bloquées de la veille (nettoyées)',
    color: CATEGORY_COLOR.rattrapage,
  },
  { key: 'bloquee', name: 'Bloquées', color: CATEGORY_COLOR.bloquee },
  { key: 'refus', name: 'Refus', color: CATEGORY_COLOR.refus },
]

/** Les 4 cartes de synthèse du rapprochement — IDENTIQUES en vue annuelle et mensuelle
 * (même `totals`). Valeur = total, sous-texte = « % des vendues » (cadence « / jour »
 * pour Vendues et Nettoyées, via `avgCleanedPerDay`). Nombre PAIR de cartes voulu
 * (mise en page de la grille) : pas de carte « Moy. nettoyées / jour » à part. */
export function RaproAnalytiqueCards({
  totals,
  avgCleanedPerDay,
  activeDays,
}: {
  totals: DayStatusCounts
  avgCleanedPerDay: number
  activeDays: number
}) {
  const sold = vendues(totals)
  const bill = cleaned(totals)
  return (
    <AnalytiqueCardsGrid>
      <StatCard
        label="Vendues"
        accent={CATEGORY_COLOR.vendues}
        hint="Chambres vendues (occupées) : nettoyées + bloquées + refus. Les rattrapages sur reportées non vendues n'en sont PAS."
        sub={
          activeDays > 0
            ? subText(`moy. ${Math.round(sold / activeDays)} / jour`)
            : undefined
        }
        value={sold}
      />
      <StatCard
        label="Nettoyées"
        accent={CATEGORY_COLOR.nettoyee}
        hint="Ménages faits et facturés à ELIOR."
        sub={
          activeDays > 0
            ? subText(`moy. ${avgCleanedPerDay} / jour`)
            : undefined
        }
        value={bill}
      />
      <StatCard
        label="Bloquées"
        accent={CATEGORY_COLOR.bloquee}
        hint="Chambres non nettoyées (bloquées)."
        sub={shareSub(totals.bloquee, sold, 'des vendues')}
        value={totals.bloquee}
      />
      <StatCard
        label="Refus"
        accent={CATEGORY_COLOR.refus}
        hint="Chambres refusées, hors facturation."
        sub={shareSub(totals.refus, sold, 'des vendues')}
        value={totals.refus}
      />
    </AnalytiqueCardsGrid>
  )
}

/*
 * Colonnes de catégorie partagées par les deux vues analytique du rapprochement
 * (annuelle et détail mensuel) : en-tête, cellules de comptage et helper de
 * compteur. Une seule source pour la colonne VENDUES (total des chambres suivies)
 * puis les 3 catégories (nettoyée / bloquée / refus), au code couleur de
 * `CATEGORY_COLOR`. La 1re colonne (Mois / Jour) reste à la charge de l'appelant —
 * elle diffère (libellé, lien).
 */

/** Compteur au code couleur de la catégorie ; un zéro reste discret (grisé),
 * comme sur la grille du rapprochement où un 0 ne s'accentue pas. */
export function coloredCount(n: number, color: string): ReactNode {
  return n === 0 ? (
    <span className="text-muted-foreground/40">0</span>
  ) : (
    <span style={{ color }}>{n}</span>
  )
}

/** En-tête : colonne VENDUES (total) + 4 colonnes de catégorie. « Nettoyée »
 * totalise TOUS les ménages facturés du jour (nettoyées du jour + bloquées de la
 * veille nettoyées), comme le compteur de la page du jour ; « Bloquée de la
 * veille » en détaille la part rattrapée. `firstLabel` = titre de la 1re colonne. */
export function RaproCatHead({ firstLabel }: { firstLabel: string }) {
  return (
    <tr className="border-b border-border bg-muted">
      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
        {firstLabel}
      </th>
      <th
        className="px-3 py-2 text-center text-xs font-medium"
        style={{ color: CATEGORY_COLOR.vendues }}
      >
        Vendues
      </th>
      <th
        className="px-3 py-2 text-center text-xs font-medium"
        style={{ color: CATEGORY_COLOR.nettoyee }}
      >
        Nettoyée
      </th>
      <th
        className="px-3 py-2 text-center text-xs font-medium"
        style={{ color: CATEGORY_COLOR.rattrapage }}
      >
        Bloquée de la veille
      </th>
      <th
        className="px-3 py-2 text-center text-xs font-medium"
        style={{ color: CATEGORY_COLOR.bloquee }}
      >
        Bloquée
      </th>
      <th
        className="px-3 py-2 text-center text-xs font-medium"
        style={{ color: CATEGORY_COLOR.refus }}
      >
        Refus
      </th>
    </tr>
  )
}

/** Les cellules d'une ligne : VENDUES (total, neutre) + les 4 comptages colorés.
 * « Nettoyée » = `cleaned` (nettoyées du jour + bloquées de la veille nettoyées),
 * ALIGNÉ sur le compteur « Nettoyées » de la page du jour ; la colonne « Bloquée
 * de la veille » en isole la part rattrapée. `Nettoyée` peut donc dépasser
 * `Vendues` (un rattrapage n'est pas une vente du jour) — c'est voulu.
 * L'appelant fournit la 1re cellule (jour / mois) avant celles-ci. */
export function RaproCatCells({ counts }: { counts: DayStatusCounts }) {
  const sold = vendues(counts)
  return (
    <>
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs font-semibold tabular-nums">
        {sold === 0 ? (
          <span className="text-muted-foreground/40">0</span>
        ) : (
          <span style={{ color: CATEGORY_COLOR.vendues }}>{sold}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium tabular-nums">
        {coloredCount(cleaned(counts), CATEGORY_COLOR.nettoyee)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums">
        {coloredCount(counts.rattrapage, CATEGORY_COLOR.rattrapage)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums">
        {coloredCount(counts.bloquee, CATEGORY_COLOR.bloquee)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums">
        {coloredCount(counts.refus, CATEGORY_COLOR.refus)}
      </td>
    </>
  )
}

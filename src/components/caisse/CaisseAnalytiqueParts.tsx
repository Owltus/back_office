import { StatCard } from '#/components/analytique/AnalytiqueCards.tsx'
import { EPSILON } from '#/lib/caisse/constants.ts'
import { fmtEcart, fmtEur, fmtInt } from '#/lib/caisse/format.ts'
import type { CaisseSummary } from '#/lib/caisse/analytics.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Briques d'affichage partagées par les deux vues analytique caisse (annuelle et
 * détail mensuel) : les 3 cartes de synthèse, l'en-tête du tableau et les
 * cellules de valeur (ou tirets). Une seule définition — l'ordre des cartes, le
 * formatage des écarts et le rendu « pas de données » ne peuvent plus diverger
 * entre les deux vues.
 *
 * Cartes : le TOTAL ENCAISSÉ sur la période, puis DEUX compteurs d'occurrences —
 * le nombre de feuilles avec un écart de paiement et le nombre de feuilles avec
 * un écart de fond. On compte les OCCURRENCES plutôt qu'un montant cumulé : un
 * écart justifié étant normal, le cumul des montants ne dit rien d'exploitable ;
 * savoir combien de fois un écart est survenu est plus parlant. Neutre par choix
 * (pas de rouge d'alarme sur un simple décompte).
 *
 * Le tableau, lui, garde les MONTANTS par mois / jour : l'« Écart » est une somme
 * de valeurs absolues (fmtEur) et le « Fond » est signé (fmtEcart, rouge au-delà
 * d'EPSILON) — utile à la maille fine, contrairement au cumul annuel.
 */

/** Les 3 cartes de synthèse (Total encaissé / Écarts de paiement / Écarts de fond).
 *  `periodLabel` complète l'intitulé encaissé (« sur l'année » / « sur le mois »). */
export function CaisseAnalytiqueCards({
  summary,
  periodLabel,
}: {
  summary: CaisseSummary
  periodLabel: string
}) {
  return (
    <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        label={`Total encaissé ${periodLabel}`}
        accent="#34d399"
        value={fmtEur(summary.encaisse)}
      />
      <StatCard
        label="Écarts de paiement"
        accent="#fbbf24"
        hint="Nombre de feuilles clôturées présentant au moins un écart de paiement (attendu contre réel compté)."
        value={fmtInt(summary.ecartCount)}
      />
      <StatCard
        label="Écarts de fond"
        accent="#fb7185"
        hint="Nombre de feuilles clôturées présentant un écart de fond de caisse."
        value={fmtInt(summary.fundEcartCount)}
      />
    </div>
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

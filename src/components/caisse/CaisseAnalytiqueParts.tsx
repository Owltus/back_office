import {
  AnalytiqueCardsGrid,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { fmtEur, fmtInt } from '#/lib/caisse/format.ts'
import type { CaisseSummary } from '#/lib/caisse/analytics.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Briques d'affichage partagées par les deux vues analytique caisse (annuelle et
 * détail mensuel) : les cartes de synthèse, l'en-tête du tableau et les cellules de
 * valeur (ou tirets). Une seule définition — l'ordre des colonnes et le rendu « pas
 * de données » ne peuvent pas diverger entre les deux vues.
 *
 * On expose l'ARGENT réellement encaissé, ventilé par moyen de paiement (espèces,
 * CB, chèques vacances, Adyen), et une simple FRÉQUENCE d'anomalies (feuilles avec
 * un écart de paiement ou de fond). Les montants d'écart / de fond, eux, restent
 * sur la feuille du jour (rapprochement opérationnel) : un écart justifié étant
 * normal, leur cumul n'apporte rien d'exploitable à la maille mois / année.
 *
 * Cartes : Total encaissé, Espèces et Carte (part du total en sous-titre), et le
 * nombre d'écarts. La carte « Carte » cumule CB (TPE) et Adyen (web) ; le tableau,
 * lui, les détaille colonne par colonne.
 *
 * « Écarts » est un SEUL nombre volontairement combiné (écart d'encaissement OU
 * écart de fond de caisse), explicité au survol (ECARTS_HINT) sur la carte comme
 * sur l'en-tête du tableau — le détail de CE qui a divergé se lit sur la feuille
 * du jour, pas ici.
 */

/** Explication de « Écarts », partagée par la carte (hint) et l'en-tête du tableau
 * (infobulle) — un libellé unique, jamais divergent entre les deux. */
const ECARTS_HINT =
  'Feuilles clôturées présentant un écart : soit la recette comptée diffère de l’attendu (espèces, CB, chèques vacances ou Adyen), soit le fond de caisse n’est pas à 150 €.'

/** Part d'un mode dans le total encaissé, en sous-titre de carte (« 38 % du total »).
 *  Rien si le total est nul (période sans encaissement). */
function shareSub(part: number, total: number) {
  if (total <= 0) return undefined
  return (
    <span className="text-[0.7rem] font-medium text-muted-foreground">
      {`${Math.round((part / total) * 100)} % du total`}
    </span>
  )
}

/** Cartes de synthèse : Total encaissé / Espèces / Carte / Écarts.
 *  `periodLabel` complète l'intitulé encaissé (« sur l'année » / « sur le mois »). */
export function CaisseAnalytiqueCards({
  summary,
  periodLabel,
}: {
  summary: CaisseSummary
  periodLabel: string
}) {
  const carte = summary.cb + summary.adyen
  return (
    <AnalytiqueCardsGrid>
      <StatCard
        label={`Total encaissé ${periodLabel}`}
        accent="#34d399"
        value={fmtEur(summary.encaisse)}
      />
      <StatCard
        label="Espèces"
        accent="#38bdf8"
        value={fmtEur(summary.cash)}
        sub={shareSub(summary.cash, summary.encaisse)}
      />
      <StatCard
        label="Carte"
        accent="#818cf8"
        hint="Carte bancaire (TPE) et carte web (Adyen) cumulées."
        value={fmtEur(carte)}
        sub={shareSub(carte, summary.encaisse)}
      />
      <StatCard
        label="Écarts"
        accent="#fbbf24"
        hint={ECARTS_HINT}
        value={fmtInt(summary.anomalies)}
      />
    </AnalytiqueCardsGrid>
  )
}

/** En-tête du tableau. `firstLabel` = titre de la 1re colonne (Mois / Jour). */
export function CaisseStatsHead({ firstLabel }: { firstLabel: string }) {
  return (
    <tr className="border-b border-border bg-muted">
      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
        {firstLabel}
      </th>
      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
        Espèces
      </th>
      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
        CB
      </th>
      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
        <span className="hidden sm:inline">Chèques vac.</span>
        <span className="sm:hidden">Ch. vac.</span>
      </th>
      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
        Adyen
      </th>
      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
        <span className="hidden sm:inline">Total encaissé</span>
        <span className="sm:hidden">Total</span>
      </th>
      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
        <Tip label={ECARTS_HINT}>
          <span
            tabIndex={0}
            className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2"
          >
            Écarts
          </span>
        </Tip>
      </th>
    </tr>
  )
}

/** Les 6 cellules de valeur d'une ligne (Espèces / CB / Chèques vac. / Adyen /
 * Total encaissé / Écarts), ou six tirets grisés si le mois / jour n'a aucune
 * feuille. L'appelant fournit la 1re cellule (mois / jour) avant celles-ci. */
export function CaisseStatCells({
  stats,
}: {
  stats: CaisseSummary | undefined
}) {
  if (!stats) {
    return (
      <>
        {Array.from({ length: 6 }).map((_, i) => (
          <td
            key={i}
            className={cn(
              'py-2 text-right text-xs text-muted-foreground/50',
              i === 5 ? 'px-3' : 'px-2',
            )}
          >
            —
          </td>
        ))}
      </>
    )
  }
  const mode = 'whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums text-muted-foreground'
  return (
    <>
      <td className={mode}>{fmtEur(stats.cash)}</td>
      <td className={mode}>{fmtEur(stats.cb)}</td>
      <td className={mode}>{fmtEur(stats.cvac)}</td>
      <td className={mode}>{fmtEur(stats.adyen)}</td>
      <td className="whitespace-nowrap px-2 py-2 text-right text-xs font-medium tabular-nums text-foreground">
        {fmtEur(stats.encaisse)}
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums',
          stats.anomalies > 0 ? 'text-amber-500' : 'text-muted-foreground',
        )}
      >
        {fmtInt(stats.anomalies)}
      </td>
    </>
  )
}

import type { ReactNode } from 'react'

import { ACCENT } from '#/components/analytique/accents.ts'
import { StatTile } from '#/components/shared/StatTile.tsx'
import { fmt } from '#/lib/repjour/format.ts'
import { fmtJours, monthPace } from '#/lib/repjour/summaryMetrics.ts'
import type { Ecart, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

/*
 * Cartes de synthèse + barre de progression multi-segments du mois.
 *
 * CARTES (4) — dimension TEMPS, volontairement HORS de ce que montrent déjà le
 * tableau KPI (grille statique Jour/Cumul/Projeté/Budget/Écart) et la barre de
 * progression (jauge d'atteinte du budget). Elles ne recopient aucune de leurs
 * valeurs : ce sont des vitesses et des variations, pas des cellules.
 *   1. Pris depuis la veille — variation du CA projeté depuis le dernier rapport.
 *   2. Effort restant       — CA/jour à faire sur les jours restants pour le budget.
 *   3. Avance sur le budget — position réelle vs rythme linéaire du budget, en jours.
 *   4. Rentré depuis le 1er — CA réalisé cumulé du mois (total de la barre) + carnet au 1er.
 *
 * Hauteur STRICTE de chaque carte : titre / valeur / sous-valeur, jamais plus de
 * trois lignes (pas de courbe ni de contenu additionnel) pour qu'elles restent
 * toutes de la même hauteur.
 *
 * BARRE (inchangée) : acquis (vert) + jour (or) + projeté (gris) vs budget. Portage
 * de la source (thème clair) vers le dark : bg-white → bg-card, bg-success →
 * emerald, bg-gray-300 (projeté) → muted-foreground, marqueur bg-black → bg-foreground.
 * La couleur « jour » (or #D4A017) est conservée. Les positions absolues en % de
 * chaque segment sont portées à l'identique.
 */

const COLOR_JOUR = '#D4A017'

interface SummaryCardsProps {
  realiseJour?: KPIBlock | null
  realiseMTD: KPIBlock
  projeteMois: KPIBlock
  budget: MonthBudget
  ecart: Ecart
  partial?: boolean
  /**
   * « Pris depuis la veille » : écart du Revenu hébergement projeté entre le jour
   * affiché et la veille (en euros). Positif = réservations nettes prises,
   * négatif = annulations nettes. `null`/absent → carte « — » (pas de veille).
   */
  pickup?: number | null
  /**
   * Série du CA projeté fin de mois, jour par jour depuis le 1er. Sert au
   * « Départ du mois » : premier point = projeté au 1er (carnet d'ouverture),
   * dernier moins premier = révision depuis.
   */
  pickupSeries?: number[]
  /**
   * Quantième du jour affiché (1..31) et nombre de jours du mois : cadence des
   * cartes temporelles (effort restant, avance sur le rythme). 0 si inconnu
   * (projection sans jour réalisé) → les cartes concernées affichent « — ».
   */
  dayOfMonth?: number
  daysInMonth?: number
}

/** Petit sous-texte grisé sous la valeur d'une carte. */
function subMuted(content: ReactNode) {
  return (
    <span className="text-[0.7rem] font-medium text-muted-foreground">
      {content}
    </span>
  )
}

export function SummaryCards({
  realiseJour,
  realiseMTD,
  projeteMois,
  budget,
  partial = false,
  pickup = null,
  pickupSeries = [],
  dayOfMonth = 0,
  daysInMonth = 0,
}: SummaryCardsProps) {
  // --- Données dérivées des cartes (aucune n'est une cellule du tableau) -------
  // Calcul déporté dans `monthPace` : SOURCE UNIQUE partagée avec le PDF, pour
  // que le document reflète toujours exactement les cartes de l'écran.
  const {
    rentre,
    remainingDays,
    hasDay,
    effortJour,
    rythmeTenu,
    budgetAtteint,
    joursAvance,
  } = monthPace({ realiseMTD, budget, dayOfMonth, daysInMonth })
  // Cumul réalisé, aussi utilisé par la barre de progression ci-dessous.
  const acquis = rentre
  // Carnet d'ouverture : projeté fin de mois tel qu'il était au 1er (1er point).
  const depart = pickupSeries.length >= 1 ? pickupSeries[0] : null

  const dash = <span className="text-muted-foreground">—</span>
  const signedClass = (n: number) =>
    n >= 0 ? 'text-emerald-500' : 'text-destructive'

  // --- Éléments de barre de progression (inchangés) ---------------------------
  const caJour = !partial && realiseJour ? realiseJour.roomRevenue : 0
  const precedent = Math.max(0, acquis - caJour)
  const projete = Math.max(0, projeteMois.roomRevenue - acquis)
  const total = acquis + projete
  const totalProgress =
    budget.room_revenue > 0 ? (total / budget.room_revenue) * 100 : 0
  const moisOver = totalProgress > 100
  const moisMaxScale = moisOver ? totalProgress * 1.15 : 100
  const pctOf = (v: number) =>
    budget.room_revenue > 0
      ? (((v / budget.room_revenue) * 100) / moisMaxScale) * 100
      : 0
  const precedentWidth = pctOf(precedent)
  const jourWidth = pctOf(caJour)
  const projeteWidth = pctOf(projete)
  const moisGoalPos = (100 / moisMaxScale) * 100

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {/* 1. Pris depuis la veille — mouvement court terme du carnet. */}
        <StatTile
          label="Pris depuis la veille"
          accent={ACCENT.green}
          hint="Variation du chiffre d'affaires projeté fin de mois depuis le dernier rapport. Positif : réservations nettes prises ; négatif : annulations nettes."
          value={
            pickup == null ? (
              dash
            ) : (
              <span className={signedClass(pickup)}>
                {fmt.ecartEurInt(pickup)}
              </span>
            )
          }
          sub={pickup == null ? undefined : subMuted('vs dernier rapport')}
        />

        {/* 2. Effort restant — CA/jour à tenir sur les jours restants. */}
        <StatTile
          label="Effort restant"
          accent={ACCENT.amber}
          hint="Chiffre d'affaires à réaliser chaque jour restant pour atteindre le budget du mois, comparé au rythme déjà tenu."
          value={
            remainingDays > 0 ? `${fmt.eurInt(effortJour)}/j` : dash
          }
          sub={
            remainingDays <= 0
              ? subMuted('mois terminé')
              : budgetAtteint
                ? (
                    <span className="text-[0.7rem] font-semibold text-emerald-500">
                      budget atteint
                    </span>
                  )
                : rythmeTenu > 0
                  ? (
                      <span
                        className={`text-[0.7rem] font-semibold ${
                          effortJour <= rythmeTenu
                            ? 'text-emerald-500'
                            : 'text-destructive'
                        }`}
                      >
                        vs {fmt.eurInt(rythmeTenu)}/j tenus
                      </span>
                    )
                  : undefined
          }
        />

        {/* 3. Avance sur le budget — position vs rythme linéaire, en jours. */}
        <StatTile
          label="Avance sur le budget"
          accent={ACCENT.cyan}
          hint="Écart entre le chiffre d'affaires cumulé et le rythme linéaire du budget à cette date, exprimé en jours. Positif : en avance ; négatif : en retard."
          value={
            joursAvance == null ? (
              dash
            ) : (
              <span className={signedClass(joursAvance)}>
                {fmtJours(joursAvance)}
              </span>
            )
          }
          sub={
            hasDay ? subMuted(`au jour ${dayOfMonth}/${daysInMonth}`) : undefined
          }
        />

        {/* 4. Rentré depuis le 1er — CA réalisé cumulé (= total de la barre) +
            rappel du carnet d'ouverture au 1er en sous-valeur. */}
        <StatTile
          label="Rentré depuis le 1er"
          accent={ACCENT.indigo}
          hint="Chiffre d'affaires réellement réalisé en cumul depuis le début du mois (le total de la barre de progression). En dessous : le carnet déjà projeté fin de mois au 1er."
          value={fmt.eurInt(rentre)}
          sub={depart == null ? undefined : subMuted(`${fmt.eurInt(depart)} au 1er`)}
        />
      </div>

      {/* Barre de progression mois : acquis (vert) + projeté (gris) vs budget */}
      <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm sm:px-5">
        <div className="flex items-center gap-3">
          <div className="relative h-2 flex-1 rounded-full bg-muted">
            {/* Jours précédents — vert */}
            {precedentWidth > 0 && (
              <div
                className="absolute inset-y-0 left-0 rounded-l-full bg-emerald-500 transition-all duration-700 ease-out"
                style={{ width: `${precedentWidth}%` }}
              />
            )}
            {/* Jour — or */}
            {jourWidth > 0 && (
              <div
                className="absolute inset-y-0 transition-all duration-700 ease-out"
                style={{
                  left: `${precedentWidth}%`,
                  width: `${jourWidth}%`,
                  backgroundColor: COLOR_JOUR,
                  borderTopLeftRadius:
                    precedentWidth === 0 ? '9999px' : undefined,
                  borderBottomLeftRadius:
                    precedentWidth === 0 ? '9999px' : undefined,
                }}
              />
            )}
            {/* Projeté — gris */}
            {projeteWidth > 0 && (
              <div
                className="absolute inset-y-0 bg-muted-foreground transition-all duration-700 ease-out"
                style={{
                  left: `${precedentWidth + jourWidth}%`,
                  width: `${projeteWidth}%`,
                  borderTopRightRadius: '9999px',
                  borderBottomRightRadius: '9999px',
                }}
              />
            )}
            {/* Marqueur budget — uniquement si dépassé */}
            {moisOver && (
              <div
                className="absolute top-1/2 -translate-y-1/2 transition-all duration-700"
                style={{ left: `${moisGoalPos}%` }}
              >
                <div className="h-4 w-0.5 bg-foreground" />
              </div>
            )}
          </div>
          <span className="w-12 text-right text-sm font-bold tabular-nums text-foreground">
            {totalProgress.toFixed(0)}%
          </span>
        </div>
        {/* Légende */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {precedent > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">Acquis </span>
              {fmt.eurInt(precedent)}
            </span>
          )}
          {!partial && caJour > 0 && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: COLOR_JOUR }}
              />
              <span className="hidden sm:inline">Jour </span>
              {fmt.eurInt(caJour)}
            </span>
          )}
          {projete > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground" />
              <span className="hidden sm:inline">Projeté </span>
              {fmt.eurInt(projete)}
            </span>
          )}
          {total < budget.room_revenue && (
            <span className="flex items-center gap-1.5 text-destructive">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
              <span className="hidden sm:inline">Reste </span>
              {fmt.eurInt(budget.room_revenue - total)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

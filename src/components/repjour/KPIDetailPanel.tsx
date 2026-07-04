import type { ReactNode } from 'react'

import { fmt } from '#/lib/repjour/format.ts'
import { TOTAL_ROOMS } from '#/lib/repjour/constants.ts'
import type { Ecart, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

/*
 * Panneau pédagogique « mode détaillé » : décrit chaque KPI (définition,
 * formule, sources) avec des cartes de calcul et des barres d'écart.
 *
 * Portage clair → dark : cartes bg-white → bg-card, fonds bg-bg / bg-gray-50
 * → bg-muted, bordures gray → border-border, textes secondary →
 * muted-foreground, écarts success/error → emerald/destructive. Le badge
 * « Forecast » (accent bleu en source) passe sur le token chart-2 (cyan),
 * lisible sur fond sombre.
 */

interface Props {
  realiseJour: KPIBlock
  realiseMTD: KPIBlock
  projeteMois: KPIBlock
  budget: MonthBudget
  ecart: Ecart
  dayOfMonth: number
  daysInMonth: number
}

function EcartBar({
  val,
  format,
}: {
  val: number
  format: (n: number) => string
}) {
  const positive = val >= 0
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-4 py-2.5 ${
        positive ? 'bg-emerald-500/10' : 'bg-destructive/10'
      }`}
    >
      <span
        className={`text-sm font-bold ${
          positive ? 'text-emerald-400' : 'text-destructive'
        }`}
      >
        {positive ? '↑' : '↓'} {format(val)}
      </span>
      <span className="text-xs text-muted-foreground">
        {positive ? 'au-dessus du budget' : 'en dessous du budget'}
      </span>
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  const color =
    source === 'Comparison'
      ? 'bg-primary/10 text-primary'
      : source === 'Forecast'
        ? 'bg-chart-2/10 text-chart-2'
        : 'bg-muted text-muted-foreground'
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${color}`}
    >
      {source}
    </span>
  )
}

function CalcCard({
  source,
  label,
  rule,
  a,
  op,
  b,
  result,
}: {
  source: string
  label: string
  rule: string
  a: string
  op: string
  b: string
  result: string
}) {
  return (
    <div className="space-y-2 rounded-xl bg-muted p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <SourceBadge source={source} />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{rule}</p>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm">
        <span className="text-foreground/70">{a}</span>
        <span className="text-muted-foreground">{op}</span>
        <span className="text-foreground/70">{b}</span>
        <span className="text-muted-foreground">=</span>
        <span className="font-bold text-foreground">{result}</span>
      </div>
    </div>
  )
}

function ReadCard({
  source,
  label,
  rule,
  value,
}: {
  source: string
  label: string
  rule: string
  value: string
}) {
  return (
    <div className="space-y-2 rounded-xl bg-muted p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <SourceBadge source={source} />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{rule}</p>
      <div className="rounded-lg border border-border bg-card px-3 py-2">
        <span className="text-lg font-bold text-foreground">{value}</span>
      </div>
    </div>
  )
}

function Section({
  title,
  subtitle,
  definition,
  formula,
  children,
}: {
  title: string
  subtitle: string
  definition: string
  formula?: string
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground italic">{subtitle}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {definition}
        </p>
        {formula && (
          <div className="mt-3 rounded-lg bg-primary/5 px-3 py-2">
            <span className="text-[10px] font-semibold text-primary/60 uppercase">
              {'Formule'}
            </span>
            <p className="mt-0.5 text-sm font-medium text-primary">{formula}</p>
          </div>
        )}
      </div>
      <div className="space-y-3 px-5 py-4">{children}</div>
    </div>
  )
}

export function KPIDetailPanel({
  realiseJour,
  realiseMTD,
  projeteMois,
  budget,
  ecart,
  dayOfMonth,
  daysInMonth,
}: Props) {
  const totalRoomsMTD = TOTAL_ROOMS * dayOfMonth
  const totalRoomsMonth = TOTAL_ROOMS * daysInMonth

  return (
    <div className="space-y-5">
      {/* INTRO */}
      <div className="space-y-3 rounded-xl border border-border bg-muted p-5 text-sm">
        <p className="font-semibold text-foreground">
          {'Comment lire ce rapport'}
        </p>
        <p className="leading-relaxed text-muted-foreground">
          {"L'hôtel dispose de "}
          <strong>
            {TOTAL_ROOMS}
            {' chambres'}
          </strong>
          {'. Ce rapport couvre le '}
          <strong>
            {'jour '}
            {dayOfMonth}
          </strong>
          {" d'un mois de "}
          {daysInMonth}
          {' jours. '}
          {'Il est produit le matin et couvre la nuit précédente.'}
        </p>
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            {'Sources des données'}
          </p>
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <SourceBadge source="Comparison" />
              <p className="mt-1.5 text-muted-foreground">
                {"Fichier « Comparison By Date ». Ce qui s'est réellement passé : chambres vendues, revenus."}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <SourceBadge source="Forecast" />
              <p className="mt-1.5 text-muted-foreground">
                {'Fichier « Forecast By Date Range ». Ce que le PMS prévoit pour le reste du mois.'}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <SourceBadge source="Budget" />
              <p className="mt-1.5 text-muted-foreground">
                {"Objectif fixé en début d'année. Ne change pas en cours d'exercice."}
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {"Les fichiers CSV donnent des montants HT (hors taxes). L'application ajoute 10% de TVA pour afficher en TTC."}
        </p>
      </div>

      {/* CHAMBRES VENDUES */}
      <Section
        title="Chambres vendues"
        subtitle="En anglais : Occupied Rooms"
        definition={
          "Nombre total de chambres occupées cette nuit, qu'elles soient payantes ou offertes. C'est le premier indicateur regardé chaque matin : il donne le volume d'activité brut de l'hôtel."
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReadCard
            source="Comparison"
            label="La nuit dernière"
            rule={'Colonne « Occupied Rooms », valeur du jour (TODAY)'}
            value={`${fmt.nuitees(realiseJour.nuitees)} chambres`}
          />
          <ReadCard
            source="Comparison"
            label={`Cumul du mois (${dayOfMonth} jours)`}
            rule={'Colonne « Occupied Rooms », cumul depuis le 1er (MTD)'}
            value={`${fmt.nuitees(realiseMTD.nuitees)} chambres`}
          />
          <ReadCard
            source="Forecast"
            label={`Projeté fin de mois (${daysInMonth} jours)`}
            rule={'Somme de la colonne OCC pour chaque jour du mois'}
            value={`${fmt.nuitees(projeteMois.nuitees)} chambres`}
          />
          <ReadCard
            source="Budget"
            label="Objectif mensuel"
            rule={"Défini en début d'année"}
            value={`${fmt.nuitees(budget.nuitees)} chambres`}
          />
        </div>
        <EcartBar
          val={ecart.nuitees}
          format={(n) => fmt.ecartNuitees(n) + ' chambres'}
        />
      </Section>

      {/* TAUX D'OCCUPATION */}
      <Section
        title="Taux d'occupation"
        subtitle="En anglais : Occupancy Rate"
        definition={`Part des ${TOTAL_ROOMS} chambres de l'hôtel qui ont été vendues. Un taux de 100% signifie que toutes les chambres sont occupées. C'est l'indicateur de remplissage : il permet de savoir si l'hôtel vend assez de chambres.`}
        formula={`Chambres vendues ÷ (${TOTAL_ROOMS} chambres × nombre de jours) × 100`}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CalcCard
            source="Comparison"
            label="La nuit dernière"
            rule={'Chambres vendues hier soir divisées par la capacité totale'}
            a={fmt.nuitees(realiseJour.nuitees)}
            op={'÷'}
            b={String(TOTAL_ROOMS)}
            result={fmt.pct(realiseJour.to)}
          />
          <CalcCard
            source="Comparison"
            label={`Cumul du mois (${dayOfMonth} jours)`}
            rule={`Total des chambres vendues depuis le 1er, divisé par ${TOTAL_ROOMS} chambres × ${dayOfMonth} jours`}
            a={fmt.nuitees(realiseMTD.nuitees)}
            op={'÷'}
            b={fmt.nuitees(totalRoomsMTD)}
            result={fmt.pct(realiseMTD.to)}
          />
          <CalcCard
            source="Forecast"
            label={`Projeté fin de mois (${daysInMonth} jours)`}
            rule={`Chambres prévues sur le mois entier, divisées par ${TOTAL_ROOMS} × ${daysInMonth} jours`}
            a={fmt.nuitees(projeteMois.nuitees)}
            op={'÷'}
            b={fmt.nuitees(totalRoomsMonth)}
            result={fmt.pct(projeteMois.to)}
          />
          <ReadCard
            source="Budget"
            label="Objectif mensuel"
            rule={"Défini en début d'année"}
            value={fmt.pct(budget.taux_occupation)}
          />
        </div>
        <EcartBar val={ecart.to} format={fmt.ecartPts} />
      </Section>

      {/* PRIX MOYEN */}
      <Section
        title="Prix moyen par chambre"
        subtitle="En anglais : ADR — Average Daily Rate"
        definition={
          "Le tarif moyen auquel les chambres ont été vendues. Un hôtel peut être bien rempli mais vendre ses chambres trop peu cher — c'est cet indicateur qui le révèle."
        }
        formula={"Chiffre d'affaires chambres ÷ nombre de chambres vendues"}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CalcCard
            source="Comparison"
            label="La nuit dernière"
            rule={"CA chambres d'hier divisé par le nombre de chambres vendues hier"}
            a={fmt.eurInt(realiseJour.roomRevenue)}
            op={'÷'}
            b={`${fmt.nuitees(realiseJour.nuitees)} ch.`}
            result={fmt.eur(realiseJour.pm)}
          />
          <CalcCard
            source="Comparison"
            label={`Cumul du mois (${dayOfMonth} jours)`}
            rule={'CA chambres du mois divisé par le total de chambres vendues depuis le 1er'}
            a={fmt.eurInt(realiseMTD.roomRevenue)}
            op={'÷'}
            b={`${fmt.nuitees(realiseMTD.nuitees)} ch.`}
            result={fmt.eur(realiseMTD.pm)}
          />
          <CalcCard
            source="Forecast"
            label={`Projeté fin de mois (${daysInMonth} jours)`}
            rule={'CA prévu du mois divisé par les chambres prévues'}
            a={fmt.eurInt(projeteMois.roomRevenue)}
            op={'÷'}
            b={`${fmt.nuitees(projeteMois.nuitees)} ch.`}
            result={fmt.eur(projeteMois.pm)}
          />
          <ReadCard
            source="Budget"
            label="Objectif mensuel"
            rule={"Défini en début d'année"}
            value={fmt.eur(budget.prix_moyen)}
          />
        </div>
        <EcartBar val={ecart.pm} format={fmt.ecartEur} />
      </Section>

      {/* REVPAR */}
      <Section
        title="Revenu par chambre disponible"
        subtitle="En anglais : RevPAR — Revenue Per Available Room"
        definition={`Combien rapporte chaque chambre de l'hôtel, qu'elle soit occupée ou vide. C'est l'indicateur le plus complet : il pénalise à la fois un hôtel vide et un hôtel plein mais qui brade ses prix. Si un seul chiffre doit être regardé, c'est celui-ci.`}
        formula={`Chiffre d'affaires chambres ÷ (${TOTAL_ROOMS} chambres × nombre de jours)`}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CalcCard
            source="Comparison"
            label="La nuit dernière"
            rule={`CA chambres d'hier divisé par les ${TOTAL_ROOMS} chambres de l'hôtel (vendues ou non)`}
            a={fmt.eurInt(realiseJour.roomRevenue)}
            op={'÷'}
            b={`${TOTAL_ROOMS} ch.`}
            result={fmt.eur(realiseJour.revpar)}
          />
          <CalcCard
            source="Comparison"
            label={`Cumul du mois (${dayOfMonth} jours)`}
            rule={`CA chambres du mois divisé par ${TOTAL_ROOMS} × ${dayOfMonth} jours = ${fmt.nuitees(totalRoomsMTD)} chambres-nuits`}
            a={fmt.eurInt(realiseMTD.roomRevenue)}
            op={'÷'}
            b={fmt.nuitees(totalRoomsMTD)}
            result={fmt.eur(realiseMTD.revpar)}
          />
          <CalcCard
            source="Forecast"
            label={`Projeté fin de mois (${daysInMonth} jours)`}
            rule={`CA prévu divisé par ${TOTAL_ROOMS} × ${daysInMonth} jours = ${fmt.nuitees(totalRoomsMonth)} chambres-nuits`}
            a={fmt.eurInt(projeteMois.roomRevenue)}
            op={'÷'}
            b={fmt.nuitees(totalRoomsMonth)}
            result={fmt.eur(projeteMois.revpar)}
          />
          <ReadCard
            source="Budget"
            label="Objectif mensuel"
            rule={"Défini en début d'année"}
            value={fmt.eur(budget.revpar)}
          />
        </div>
        <EcartBar val={ecart.revpar} format={fmt.ecartEur} />
      </Section>

      {/* CA HEBERGEMENT */}
      <Section
        title={"Chiffre d'affaires hébergement"}
        subtitle="En anglais : Room Revenue"
        definition={
          "L'argent total encaissé grâce aux chambres, TVA comprise. C'est la ligne du bas : tous les autres indicateurs décrivent comment ce chiffre est construit."
        }
        formula={'Montant HT du CSV × 1,10 = montant TTC affiché'}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CalcCard
            source="Comparison"
            label="La nuit dernière"
            rule={'Colonne « ROOM REVENUE » du jour, converti en TTC'}
            a={'ROOM REV.'}
            op={'×'}
            b={'1,10'}
            result={fmt.eurInt(realiseJour.roomRevenue)}
          />
          <CalcCard
            source="Comparison"
            label={`Cumul du mois (${dayOfMonth} jours)`}
            rule={'Colonne « ROOM REVENUE » cumul du mois, converti en TTC'}
            a={'ROOM REV. MTD'}
            op={'×'}
            b={'1,10'}
            result={fmt.eurInt(realiseMTD.roomRevenue)}
          />
          <CalcCard
            source="Forecast"
            label={`Projeté fin de mois (${daysInMonth} jours)`}
            rule={'Somme des revenus prévus (colonne REV) de chaque jour, converti en TTC'}
            a={'Somme REV'}
            op={'×'}
            b={'1,10'}
            result={fmt.eurInt(projeteMois.roomRevenue)}
          />
          <ReadCard
            source="Budget"
            label="Objectif mensuel"
            rule={'Déjà en TTC, pas de conversion'}
            value={fmt.eurInt(budget.room_revenue)}
          />
        </div>
        <EcartBar val={ecart.roomRevenue} format={fmt.ecartEurInt} />
      </Section>
    </div>
  )
}

import { fmt } from '#/lib/repjour/format.ts'
import type { Ecart, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

/*
 * Rendu HTML du rapport journalier — fonction PURE, sans DOM.
 *
 * Extraite de `email.ts`, qui la bâtissait avec `document.createElement` : elle
 * ne tournait donc que dans un navigateur. Ici, aucune dépendance à `document`
 * ni à `window` — le même code peut produire le corps d'un e-mail côté serveur
 * (Edge Function) qu'une image côté client (html2canvas).
 *
 * Deux contraintes, qui expliquent le style d'écriture :
 *   - styles INLINE uniquement, couleurs en HEX. html2canvas 1.4.1 ne sait pas
 *     lire `oklch()` (les jetons Tailwind), et les clients e-mail ignorent les
 *     feuilles de style externes. Le rendu reste volontairement en thème CLAIR.
 *   - toute valeur textuelle passe par `escapeHtml`.
 *
 * ⚠ Ce balisage est né pour html2canvas, pas pour Outlook : la barre de
 * progression utilise `position: absolute`, que le moteur de rendu d'Outlook
 * (Word) ignore. Le TABLEAU, lui, est en `<table>` + styles inline et s'affiche
 * partout. À reprendre en cellules de largeur `%` avant tout envoi réel.
 */

export interface EmailData {
  realiseJour: KPIBlock
  realiseMTD: KPIBlock
  projeteMois: KPIBlock
  budget: MonthBudget
  ecart: Ecart
  dayOfMonth: number
  month: number
  year: number
}

const ecartPctFmt = (n: number) => (n >= 0 ? '+' : '') + fmt.pct(n)

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch)
}

function ecartColor(val: number): string {
  return val >= 0 ? '#4CAF50' : '#E53935'
}

/** Largeur du bloc, en pixels. Fixée : un e-mail ne se redimensionne pas, et
 * html2canvas a besoin d'une largeur explicite pour cadrer l'image. */
export const REPORT_WIDTH_PX = 540

/** Styles du conteneur, appliqués par l'appelant (élément DOM ou `<div>` mail). */
export const REPORT_CONTAINER_STYLE = `font-family: -apple-system, system-ui, sans-serif; background: transparent; padding: 16px; width: ${REPORT_WIDTH_PX}px;`

/**
 * Les deux cartes du rapport (tableau des KPI + barre de progression), en HTML.
 * Ne comprend PAS le conteneur : voir `REPORT_CONTAINER_STYLE`.
 */
export function buildReportHtml(data: EmailData): string {
  const { realiseJour, realiseMTD, projeteMois, budget, ecart } = data

  const rows = [
    {
      label: 'Nuitées',
      rj: fmt.nuitees(realiseJour.nuitees),
      mtd: fmt.nuitees(realiseMTD.nuitees),
      proj: fmt.nuitees(projeteMois.nuitees),
      bud: fmt.nuitees(budget.nuitees),
      ec: fmt.ecartNuitees(ecart.nuitees),
      ecVal: ecart.nuitees,
    },
    {
      label: 'Taux occupation',
      rj: fmt.pct(realiseJour.to),
      mtd: fmt.pct(realiseMTD.to),
      proj: fmt.pct(projeteMois.to),
      bud: fmt.pct(budget.taux_occupation),
      ec: ecartPctFmt(ecart.to),
      ecVal: ecart.to,
    },
    {
      label: 'Prix moyen',
      rj: fmt.eur(realiseJour.pm),
      mtd: fmt.eur(realiseMTD.pm),
      proj: fmt.eur(projeteMois.pm),
      bud: fmt.eur(budget.prix_moyen),
      ec: fmt.ecartEur(ecart.pm),
      ecVal: ecart.pm,
    },
    {
      label: 'RevPAR',
      rj: fmt.eur(realiseJour.revpar),
      mtd: fmt.eur(realiseMTD.revpar),
      proj: fmt.eur(projeteMois.revpar),
      bud: fmt.eur(budget.revpar),
      ec: fmt.ecartEur(ecart.revpar),
      ecVal: ecart.revpar,
    },
    {
      label: "Chiffre d'affaires",
      rj: fmt.eurInt(realiseJour.roomRevenue),
      mtd: fmt.eurInt(realiseMTD.roomRevenue),
      proj: fmt.eurInt(projeteMois.roomRevenue),
      bud: fmt.eurInt(budget.room_revenue),
      ec: fmt.ecartEurInt(ecart.roomRevenue),
      ecVal: ecart.roomRevenue,
    },
  ]

  // Calculs barre de progression (même logique que SummaryCards)
  const caJour = realiseJour.roomRevenue
  const acquis = realiseMTD.roomRevenue
  const precedent = Math.max(0, acquis - caJour)
  const projete = Math.max(0, projeteMois.roomRevenue - acquis)
  const total = acquis + projete
  const totalPct =
    budget.room_revenue > 0 ? (total / budget.room_revenue) * 100 : 0
  const moisOver = totalPct > 100
  const maxScale = moisOver ? totalPct * 1.15 : 100
  const pctOf = (v: number) =>
    budget.room_revenue > 0
      ? (((v / budget.room_revenue) * 100) / maxScale) * 100
      : 0
  const precedentW = pctOf(precedent)
  const jourW = pctOf(caJour)
  const projeteW = pctOf(projete)
  const goalPos = (100 / maxScale) * 100
  // Légende : chaque item = pastille et texte sur la même ligne via padding identique
  const legendCell = (color: string, text: string, textColor = '#6B7280') =>
    `<td style="padding: 0 14px 0 0;">
      <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;"><tr>
        <td style="padding: 3px 6px 3px 0;"><div style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; margin-top: 13px;"></div></td>
        <td style="padding: 3px 0; font-size: 10px; color: ${textColor}; white-space: nowrap; line-height: 8px;">${escapeHtml(text)}</td>
      </tr></table>
    </td>`

  const legendCells: string[] = []
  if (precedent > 0)
    legendCells.push(legendCell('#4CAF50', `Acquis ${fmt.eurInt(precedent)}`))
  if (caJour > 0)
    legendCells.push(legendCell('#D4A017', `Jour ${fmt.eurInt(caJour)}`))
  if (projete > 0)
    legendCells.push(legendCell('#D1D5DB', `Projeté ${fmt.eurInt(projete)}`))

  const card =
    'background: #FFFFFF; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #E5E7EB; overflow: hidden;'
  const sep = 'border-right: 1px solid #E5E7EB;'

  // Padding top > bottom pour compenser le rendu visuel de la font dans html2canvas
  const cell = (text: string, align: string, color: string, extra = '') =>
    `<td style="padding: 3px 10px 17px 10px; text-align: ${align}; font-size: 12px; color: ${color}; border-bottom: 1px solid #F3F4F6; ${extra}">${escapeHtml(text)}</td>`

  const tableRows = rows
    .map(
      (r) => `<tr>
    ${cell(r.label, 'left', '#1B3A5C', 'font-weight: 600;')}
    ${cell(r.rj, 'center', '#1A1A1A')}
    ${cell(r.mtd, 'center', '#1A1A1A', sep)}
    ${cell(r.proj, 'center', '#1A1A1A')}
    ${cell(r.bud, 'center', '#6B7280', sep)}
    ${cell(r.ec, 'center', ecartColor(r.ecVal), 'font-weight: 700;')}
  </tr>`,
    )
    .join('')

  // Card 2 : Barre — table pour aligner barre + pourcentage, puis table pour légende
  const barSegments = [
    precedentW > 0
      ? `<div style="position: absolute; top: 0; left: 0; width: ${precedentW}%; height: 8px; background: #4CAF50; border-top-left-radius: 4px; border-bottom-left-radius: 4px;"></div>`
      : '',
    jourW > 0
      ? `<div style="position: absolute; top: 0; left: ${precedentW}%; width: ${jourW}%; height: 8px; background: #D4A017;${precedentW === 0 ? ' border-top-left-radius: 4px; border-bottom-left-radius: 4px;' : ''}"></div>`
      : '',
    projeteW > 0
      ? `<div style="position: absolute; top: 0; left: ${precedentW + jourW}%; width: ${projeteW}%; height: 8px; background: #D1D5DB; border-top-right-radius: 4px; border-bottom-right-radius: 4px;"></div>`
      : '',
    moisOver
      ? `<div style="position: absolute; top: -4px; left: ${goalPos}%; width: 1px; height: 16px; background: #1A1A1A;"></div>`
      : '',
  ].join('')

  return `
<div style="${card} padding: 0;">
  <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
    <tr style="background: #F9FAFB;">
      <th style="padding: 3px 10px 17px 10px; text-align: left; font-size: 11px; color: #6B7280; font-weight: 500; border-bottom: 1px solid #E5E7EB;"></th>
      <th style="padding: 3px 10px 17px 10px; text-align: center; font-size: 11px; color: #6B7280; font-weight: 500; border-bottom: 1px solid #E5E7EB;">Jour</th>
      <th style="padding: 3px 10px 17px 10px; text-align: center; font-size: 11px; color: #6B7280; font-weight: 500; border-bottom: 1px solid #E5E7EB; ${sep}">Cumul</th>
      <th style="padding: 3px 10px 17px 10px; text-align: center; font-size: 11px; color: #6B7280; font-weight: 500; border-bottom: 1px solid #E5E7EB;">Projeté</th>
      <th style="padding: 3px 10px 17px 10px; text-align: center; font-size: 11px; color: #6B7280; font-weight: 500; border-bottom: 1px solid #E5E7EB; ${sep}">Budget</th>
      <th style="padding: 3px 10px 17px 10px; text-align: center; font-size: 11px; color: #6B7280; font-weight: 500; border-bottom: 1px solid #E5E7EB;">Écart</th>
    </tr>
    ${tableRows}
  </table>
</div>

<div style="${card} margin-top: 10px; padding: 10px 16px 16px 16px;">
  <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 0 12px 0 0;">
        <div style="position: relative; width: 100%; height: 8px; background: #F3F4F6; border-radius: 4px;">
          ${barSegments}
        </div>
      </td>
      <td style="width: 40px; padding: 0 0 11px 0; text-align: right; font-size: 13px; font-weight: 700; color: #1A1A1A;">${totalPct.toFixed(0)}%</td>
    </tr>
  </table>
  <table cellpadding="0" cellspacing="0" style="margin-top: -1px; border-collapse: collapse;">
    <tr>${legendCells.join('')}</tr>
  </table>
</div>
  `
}

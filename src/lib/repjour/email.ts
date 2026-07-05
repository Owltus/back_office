import { fmt } from '#/lib/repjour/format.ts'
import { DAY_NAMES, MONTHS } from '#/lib/repjour/constants.ts'
import { fetchRecipients } from '#/lib/repjour/services/recipients.ts'
import type { Ecart, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts'

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
function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch)
}

function ecartColor(val: number): string {
  return val >= 0 ? '#4CAF50' : '#E53935'
}

/**
 * Construit un élément HTML hors écran avec des styles inline uniquement
 * (aucune classe Tailwind, aucun `oklch()`). Cet élément — et lui seul — est
 * capturé par html2canvas : html2canvas 1.4.1 ne sait pas parser `oklch()`, il
 * ne faut donc JAMAIS le pointer sur le DOM shadcn stylé. L'image reste
 * volontairement en thème CLAIR (HEX clairs), indépendamment du dark de l'app.
 */
function buildTableElement(data: EmailData): HTMLDivElement {
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

  const container = document.createElement('div')
  container.style.cssText =
    'font-family: -apple-system, system-ui, sans-serif; background: transparent; padding: 16px; width: 540px;'

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

  container.innerHTML = `
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

  return container
}

/**
 * Génère une image PNG du tableau et la copie dans le presse-papier.
 * html2canvas est appelé UNIQUEMENT sur l'élément autonome `buildTableElement`
 * (styles HEX inline), jamais sur le DOM shadcn (sinon crash `oklch`).
 */
export async function captureTableImage(data: EmailData): Promise<boolean> {
  const el = buildTableElement(data)
  el.style.position = 'fixed'
  el.style.left = '-9999px'
  el.style.top = '0'
  document.body.appendChild(el)

  try {
    // html2canvas est lourd et n'est utile qu'ici (actions admin ponctuelles) :
    // chargé à la demande (chunk séparé) pour ne pas l'embarquer dans le bundle
    // du dashboard.
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(el, {
      backgroundColor: null,
      scale: 1.5,
    })

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b)
        else reject(new Error('toBlob failed'))
      }, 'image/png')
    })

    const item = new ClipboardItem({ 'image/png': blob })
    await navigator.clipboard.write([item])
    return true
  } catch (err) {
    console.error('[email] Erreur capture:', err)
    return false
  } finally {
    document.body.removeChild(el)
  }
}

/**
 * Ouvre le client mail avec destinataires, cc et sujet pré-remplis.
 */
async function openMailWithRecipients(data: EmailData): Promise<void> {
  const d = new Date(data.year, data.month - 1, data.dayOfMonth)
  const dayName = DAY_NAMES[d.getDay()]
  const dateStr = `${dayName} ${data.dayOfMonth} ${MONTHS[data.month]} ${data.year}`

  const subject = `Rep Jour — Rapport du ${dateStr}`
  const body = [
    `Bonjour,`,
    ``,
    `Veuillez trouver ci-joint le rapport du ${dateStr}.`,
    ``,
    `Bonne réception,`,
  ].join('\n')

  const recipients = await fetchRecipients()
  const active = recipients.filter((r) => r.active)
  const toList = active
    .filter((r) => r.type === 'to')
    .map((r) => r.email)
    .join(';')
  const ccList = active
    .filter((r) => r.type === 'cc')
    .map((r) => r.email)
    .join(';')

  let mailto = `mailto:${toList}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  if (ccList) mailto += `&cc=${encodeURIComponent(ccList)}`

  window.location.href = mailto
}

/**
 * Point d'entrée : capture l'image du tableau, copie dans le presse-papier,
 * puis ouvre le client mail avec tout pré-rempli.
 */
export async function sendReport(data: EmailData): Promise<boolean> {
  const ok = await captureTableImage(data)
  if (!ok) return false

  await new Promise((r) => setTimeout(r, 300))
  await openMailWithRecipients(data)

  return true
}

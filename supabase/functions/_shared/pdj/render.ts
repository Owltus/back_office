/*
 * Parties PURES du rendu e-mail du petit-déjeuner, côté serveur (Edge Function
 * Deno) : date en toutes lettres, sujet, et DOCUMENT HTML complet du courriel.
 * Même facture que `_shared/repjour/render.ts` (document responsive + cartes en
 * `<table>`) : texte d'accompagnement + les 6 tuiles de stats en HTML. Le détail
 * par chambre voyage en pièce jointe (le PDF de `pdf.ts`).
 */

import { DAY_NAMES, MONTHS } from '../repjour/dates.ts'
import type { PdjSheetData, PdjStats } from './pdf.ts'

/** 'YYYY-MM-DD' → « Mardi 7 juillet 2026 » (majuscule initiale). */
export function buildPdjDateStr(serviceDate: string): string {
  const [y, m, d] = serviceDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const str = `${DAY_NAMES[date.getDay()]} ${d} ${MONTHS[m]} ${y}`
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** Sujet de l'e-mail — calqué sur `repjour/render.ts` (date en minuscule). */
export function buildPdjSubject(data: PdjSheetData): string {
  const dateStr = data.titleDate
  const lower = dateStr.charAt(0).toLowerCase() + dateStr.slice(1)
  return `OKKO Nantes centre-ville - Petit-déjeuner du ${lower}`
}

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

/** Une carte de stat (liseré d'accent à gauche + libellé + valeur), calquée sur
 * les `rj-cardcell` de `repjour/reportHtml.ts`. */
function statCard(label: string, value: number, accent: string): string {
  return `<td class="pdj-cardcell" width="33.33%" style="vertical-align: top; padding: 0 4px 8px 4px;">
      <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;"><tr>
          <td style="width: 6px; background: ${accent}; font-size: 0; line-height: 0;">&nbsp;</td>
          <td style="padding: 9px 12px;">
            <div style="min-height: 22px; font-size: 9px; font-weight: 600; letter-spacing: 0.3px; text-transform: uppercase; color: #6B7280; line-height: 1.2;">${escapeHtml(label)}</div>
            <div style="font-size: 22px; font-weight: 700; color: #1A1A1A; line-height: 1.1; padding-top: 3px;">${value}</div>
          </td>
        </tr></table>
      </div>
    </td>`
}

/** Les 6 tuiles de stats en `<table>` (2 rangées de 3, 2×3 puis 2 colonnes en
 * mobile via la media query du document). */
function buildStatCards(stats: PdjStats): string {
  const cells = [
    statCard('Chambres occupées', stats.rooms, '#6366F1'),
    statCard('Clients', stats.guests, '#38BDF8'),
    statCard('PDJ inclus', stats.breakfasts, '#10B981'),
    statCard('PDJ non inclus', stats.potential, '#F59E0B'),
    statCard('Recouche', stats.staying, '#60A5FA'),
    statCard('Départ', stats.departing, '#FB7185'),
  ]
  return `<table class="pdj-cards" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; table-layout: fixed;">
  <tr>${cells.slice(0, 3).join('')}</tr>
  <tr>${cells.slice(3, 6).join('')}</tr>
</table>`
}

/** DOCUMENT HTML COMPLET du courriel (responsive), même structure que
 * `repjour/render.ts`. Texte d'accompagnement + 6 tuiles ; PDF en pièce jointe. */
export function buildPdjEmailHtml(data: PdjSheetData, dateStr: string): string {
  const para = 'font-size: 14px; line-height: 1.5; color: #1A1A1A; margin: 0;'
  const n = data.stats.breakfasts
  const container =
    'font-family: -apple-system, system-ui, sans-serif; padding: 16px; max-width: 540px; margin: 0;'
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>Petit-déjeuner du ${escapeHtml(dateStr)}</title>
  <style>
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    @media only screen and (max-width: 480px) {
      .pdj-cards, .pdj-cards tbody, .pdj-cards tr { display: block !important; }
      .pdj-cardcell { display: inline-block !important; width: 50% !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background: #FFFFFF;">
  <div style="background: #FFFFFF; padding: 8px;">
    <div style="${container}">
      <p style="${para} margin-bottom: 14px;">Bonjour,</p>
      <p style="${para} margin-bottom: 18px;">Voici le petit-déjeuner du ${escapeHtml(dateStr)}, ${n} petit${n > 1 ? 's' : ''}-déjeuner${n > 1 ? 's' : ''} inclus. Le détail par chambre est en pièce jointe.</p>
      ${buildStatCards(data.stats)}
      <p style="${para} margin-top: 18px;">Bonne réception,</p>
    </div>
  </div>
</body>
</html>`
}

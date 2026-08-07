import {
  buildReportHtml,
  REPORT_EMAIL_CONTAINER_STYLE,
  type EmailData,
} from './reportHtml.ts'
import { DAY_NAMES, MONTHS } from './dates.ts'

/*
 * Parties PURES du chemin d'envoi serveur (`src/lib/repjour/sendServer.ts`),
 * portées pour tourner côté Edge Function (Deno) : calcul de la date en toutes
 * lettres, du sujet, et du DOCUMENT HTML complet de l'e-mail. Le reste de
 * `sendServer.ts` (invoke Supabase, secrets) ne se porte pas — il vit côté client.
 */

/** Date en toutes lettres (ex. « lundi 7 juillet 2026 »), reprise EXACTEMENT de
 * `sendServer.ts` : `DAY_NAMES[getDay()] jour MONTHS[mois] année`. */
export function buildRepjourDateStr(d: {
  year: number
  month: number
  dayOfMonth: number
}): string {
  const date = new Date(d.year, d.month - 1, d.dayOfMonth)
  return `${DAY_NAMES[date.getDay()]} ${d.dayOfMonth} ${MONTHS[d.month]} ${d.year}`
}

/** Sujet de l'e-mail — calqué sur `sendServer.ts`. */
export function buildRepjourSubject(data: EmailData): string {
  const dateStr = buildRepjourDateStr(data)
  return `OKKO Nantes centre-ville - Rep Jour du ${dateStr}`
}

/** DOCUMENT HTML COMPLET d'un e-mail responsive (et non un simple fragment) :
 * `<!doctype>` + `<head>` avec `<meta viewport>` — SANS lui, les mobiles supposent
 * une largeur « bureau » (~980 px), ne déclenchent pas la media query et affichent
 * la version desktop dézoomée. C'est LE prérequis d'un e-mail responsive correct.
 *   - `viewport` : la page fait la largeur de l'appareil → media queries actives.
 *   - `x-apple-disable-message-reformatting` : Apple Mail n'ajuste pas les tailles.
 *   - `-webkit-text-size-adjust` : pas d'agrandissement auto du texte sur mobile.
 *   - `<style>` en TÊTE (et non dans le corps), là où Gmail & co l'attendent.
 *
 * Responsive calqué sur la GRILLE de la page RepJour (`grid-cols-2 sm:grid-cols-4`),
 * piloté par la LARGEUR DE FENÊTRE (media query, comme le site — reflow automatique
 * au redimensionnement). Sous 480 px :
 *   - les 4 cartes basculent en 2×2 (le tableau `.rj-cards` devient des blocs, chaque
 *     `.rj-cardcell` passe à 50 %) — le `sm:` de Tailwind ;
 *   - le tableau KPI bascule en version COMPACTE (technique « double cellule » de
 *     `KPITable` : `.rj-full` masqué, `.rj-compact` révélé) + padding resserré.
 * `.rj-compact` est masqué par défaut (et en inline `display:none`) → les clients
 * qui ignorent `<style>`/media queries gardent le tableau LONG — jamais les deux.
 * Le texte encadre le rapport comme un courriel : appel, transmission (le PDF est en
 * pièce jointe), politesse. */
export function buildRepjourEmailHtml(data: EmailData, dateStr: string): string {
  const para =
    'font-size: 14px; line-height: 1.5; color: #1A1A1A; margin: 0;'
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>Rep Jour du ${dateStr}</title>
  <style>
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    .rj-compact { display: none; }
    @media only screen and (max-width: 480px) {
      .rj-cards, .rj-cards tbody, .rj-cards tr { display: block !important; }
      .rj-cardcell { display: inline-block !important; width: 50% !important; box-sizing: border-box !important; }
      .rj-cell { padding-left: 4px !important; padding-right: 4px !important; }
      .rj-full { display: none !important; }
      .rj-compact { display: inline !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background: #FFFFFF;">
  <div style="background: #FFFFFF; padding: 8px;">
    <div style="${REPORT_EMAIL_CONTAINER_STYLE}">
      <p style="${para} margin-bottom: 14px;">Bonjour,</p>
      <p style="${para} margin-bottom: 18px;">Veuillez trouver ci-joint le rapport du ${dateStr}.</p>
      ${buildReportHtml(data, { forEmail: true })}
      <p style="${para} margin-top: 18px;">Bonne réception,</p>
    </div>
  </div>
</body>
</html>`
}

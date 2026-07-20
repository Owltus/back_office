import { DAY_NAMES, MONTHS } from '#/lib/repjour/constants.ts'
import { fetchRecipients } from '#/lib/repjour/services/recipients.ts'
import type { RecipientType } from '#/lib/repjour/services/recipients.ts'
import { isValidEmail } from '#/lib/shared/email.ts'
import {
  buildReportHtml,
  REPORT_CONTAINER_STYLE,
  type EmailData,
} from '#/lib/repjour/reportHtml.ts'

// Le type reste exporté ici : c'est l'entrée publique des actions email, et
// tous les appelants (DashboardBoard) l'importent déjà de ce module.
export type { EmailData }

/**
 * Enveloppe le HTML du rapport (fonction pure `buildReportHtml`) dans un
 * élément hors écran, seul objet que html2canvas doit voir : la bibliothèque
 * 1.4.1 ne sait pas parser `oklch()`, il ne faut donc JAMAIS la pointer sur le
 * DOM shadcn stylé. Le rendu reste en thème CLAIR, quel que soit celui de l'app.
 */
function buildTableElement(data: EmailData): HTMLDivElement {
  const container = document.createElement('div')
  container.style.cssText = REPORT_CONTAINER_STYLE
  container.innerHTML = buildReportHtml(data)
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

  /*
   * Construction de la liste d'adresses (pentest 2026-07-20, finding 5).
   * Trois corrections par rapport à la version d'origine :
   *   - séparateur VIRGULE et non « ; » : la RFC 6068 impose la virgule ; le
   *     point-virgule est une convention Outlook que Thunderbird et Apple Mail
   *     lisent comme UNE seule adresse malformée (c'était un bug fonctionnel) ;
   *   - chaque adresse est VALIDÉE : une valeur douteuse est écartée plutôt que
   *     d'atterrir dans l'URL (défense en profondeur — la base porte déjà un
   *     CHECK, mais une ligne écrite via la service_role y échapperait) ;
   *   - encodage adresse PAR adresse, jamais sur la liste jointe : encoder
   *     après le join transformerait la virgule séparatrice en %2C, ce qui
   *     refusionnerait tous les destinataires en une seule adresse.
   */
  const listOf = (type: RecipientType) =>
    active
      .filter((r) => r.type === type)
      .map((r) => r.email.trim())
      .filter(isValidEmail)
      .map(encodeURIComponent)
      .join(',')

  const toList = listOf('to')
  const ccList = listOf('cc')

  // `subject` et `body` restent en encodeURIComponent (et non URLSearchParams,
  // qui encode l'espace en « + » — un mailto: attend %20, sinon des « + »
  // s'affichent dans le corps du message chez plusieurs clients).
  let mailto = `mailto:${toList}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  if (ccList) mailto += `&cc=${ccList}`

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

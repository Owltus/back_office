/*
 * Génération d'un vrai document PDF de la feuille de caisse, ouvert directement
 * dans la fenêtre d'impression du navigateur (aucun fichier téléchargé).
 *
 * Rendu VECTORIEL via jsPDF (texte net, sélectionnable, léger) : on dessine le
 * document sur une page A4 portrait — en-tête (titre / date / shift), tableau
 * des montants et écarts, fond de caisse en 3×5, commentaire, et deux cadres de
 * signature (hôtelier / contre-signature). Tout tient sur une seule page par
 * construction. jsPDF est chargé en import() DYNAMIQUE (lib lourde, hors du
 * premier rendu — cf. convention perf du projet).
 */

import type { jsPDF } from 'jspdf'

import { computeEcarts, fundEcart, fundTotal } from '#/lib/caisse/calc.ts'
import {
  DENOMINATIONS,
  ECART_LABELS,
  FUND_TARGET,
  PAY_KEYS,
  SHIFT_LABELS,
} from '#/lib/caisse/constants.ts'
import { fmtEcart, fmtEur, fmtEurInt } from '#/lib/caisse/format.ts'
import type { CaisseSheetInput, EcartKey } from '#/lib/caisse/types.ts'

/** Couleur DOM d'un écart : vert si équilibré (≈ 0), rouge sinon. */
function setBalanceColor(pdf: jsPDF, balanced: boolean): void {
  if (balanced) pdf.setTextColor(18, 122, 46)
  else pdf.setTextColor(180, 35, 24)
}

export interface CaissePdfData {
  titleDate: string
  form: CaisseSheetInput
  /** Nom de l'hôtelier (pré-rempli dans le cadre de signature). */
  operatorInitials: string
}

/** Génère le PDF de la feuille de caisse et ouvre la fenêtre d'impression du
 * navigateur (via autoPrint dans un iframe caché — pas de téléchargement). */
export async function printCaisseSheet(
  data: CaissePdfData,
  title: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title })
  renderCaisseDocument(pdf, data)
  pdf.autoPrint()
  // Le PDF (avec action « imprimer » intégrée) est chargé dans un iframe caché :
  // le navigateur ouvre alors sa fenêtre d'impression, sans télécharger ni
  // ouvrir de popup (donc pas de blocage). On recycle un seul iframe.
  const blobUrl = pdf.output('bloburl').toString()
  document.getElementById('caisse-print-frame')?.remove()
  const iframe = document.createElement('iframe')
  iframe.id = 'caisse-print-frame'
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.src = blobUrl
  document.body.appendChild(iframe)
}

const LEFT = 15
const RIGHT = 195
const CENTER = 105
const CONTENT_W = RIGHT - LEFT
const EPS = 0.005

/** Montant d'une source (StayNTouch / Lightspeed / Caisse) pour un mode donné. */
function sourceAmount(
  form: CaisseSheetInput,
  source: 'snt' | 'ls' | 'caisse',
  m: EcartKey,
): number | null {
  if (m === 'web') {
    if (source === 'snt') return form.snt.cbweb
    if (source === 'caisse') return form.caisse.adyen
    return null // Lightspeed n'a pas de ligne « web »
  }
  return form[source][m]
}

function renderCaisseDocument(
  pdf: jsPDF,
  { titleDate, form, operatorInitials }: CaissePdfData,
): void {
  let y = 22

  // --- En-tête : titre, date, shift (empilés, centrés) ---------------------
  pdf.setTextColor(26)
  // Styles intervertis : titre plus petit (dessus), date plus grande (dessous).
  pdf.setFont('helvetica', 'normal').setFontSize(14)
  pdf.text('FEUILLE DE CAISSE', CENTER, y, { align: 'center' })
  y += 14
  pdf.setFont('helvetica', 'bold').setFontSize(22)
  pdf.text(titleDate, CENTER, y, { align: 'center' })
  y += 13
  pdf.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90)
  pdf.text(SHIFT_LABELS[form.shift].toUpperCase(), CENTER, y, { align: 'center' })
  y += 5
  pdf.setDrawColor(51).setLineWidth(0.4).line(LEFT, y, RIGHT, y)
  y += 9

  // --- Tableau des montants / écarts ---------------------------------------
  const modes: EcartKey[] =
    form.shift === 'soir' ? [...PAY_KEYS, 'web'] : [...PAY_KEYS]
  const ecarts = computeEcarts(form)
  const amountsLeft = LEFT + 32
  const colW = (RIGHT - amountsLeft) / modes.length
  const colCenter = (i: number) => amountsLeft + (i + 0.5) * colW

  // En-tête de colonnes (libellés complets, en toutes lettres)
  pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(90)
  pdf.text('SOURCE', LEFT, y)
  modes.forEach((m, i) =>
    pdf.text(ECART_LABELS[m], colCenter(i), y, { align: 'center', maxWidth: colW - 1 }),
  )
  y += 2
  pdf.setDrawColor(180).setLineWidth(0.2).line(LEFT, y, RIGHT, y)
  y += 4.5

  // Lignes de montants
  const sources: Array<{ label: string; key: 'snt' | 'ls' | 'caisse' }> = [
    { label: "STAY N'TOUCH", key: 'snt' },
    { label: 'LIGHTSPEED', key: 'ls' },
    { label: 'CAISSE/TPE', key: 'caisse' },
  ]
  pdf.setFontSize(9).setTextColor(26)
  sources.forEach((s) => {
    pdf.setFont('helvetica', 'bold')
    pdf.text(s.label, LEFT, y)
    pdf.setFont('helvetica', 'normal')
    modes.forEach((m, i) => {
      const v = sourceAmount(form, s.key, m)
      pdf.text(v === null ? '—' : fmtEur(v), colCenter(i), y, { align: 'center' })
    })
    y += 6
  })

  // Ligne ÉCARTS (rouge si non nul)
  pdf.setDrawColor(120).setLineWidth(0.2).line(LEFT, y - 4, RIGHT, y - 4)
  pdf.setFont('helvetica', 'bold').setTextColor(26)
  pdf.text('ÉCARTS', LEFT, y)
  modes.forEach((m, i) => {
    const v = ecarts[m]
    setBalanceColor(pdf, Math.abs(v) < EPS)
    pdf.text(fmtEcart(v), colCenter(i), y, { align: 'center' })
  })
  pdf.setTextColor(26)
  y += 10

  // --- Fond de caisse (3 lignes × 5 colonnes) ------------------------------
  pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(26)
  pdf.text('FOND DE CAISSE', LEFT, y)
  y += 5
  const cellW = CONTENT_W / 3
  const cellH = 12
  DENOMINATIONS.forEach((d, idx) => {
    // Grille : 3 colonnes de 5 cartes, du plus grand au plus petit (remplies de
    // haut en bas ; DENOMINATIONS est ordonné 500 € → 0,01 €).
    const cx = LEFT + Math.floor(idx / 5) * cellW
    const cy = y + (idx % 5) * cellH
    const w = cellW - 3
    const h = cellH - 2
    const qty = form.counts[d.key] ?? 0
    const filled = qty > 0
    // Cadre (indigo si saisi) + 2 séparateurs → 3 colonnes RIGIDES et alignées :
    // coupure | nombre | sous-total, chaque valeur CENTRÉE dans sa colonne
    // (placement fixe, quelle que soit la longueur des chaînes).
    if (filled) pdf.setDrawColor(79, 70, 229).setLineWidth(0.5)
    else pdf.setDrawColor(210).setLineWidth(0.2)
    pdf.rect(cx, cy, w, h)
    pdf.setDrawColor(222).setLineWidth(0.2)
    pdf.line(cx + w / 3, cy, cx + w / 3, cy + h)
    pdf.line(cx + (2 * w) / 3, cy, cx + (2 * w) / 3, cy + h)
    const ty = cy + h / 2 + 1.2
    pdf.setFontSize(8.5)
    // Colonne 1 : la coupure.
    pdf.setFont('helvetica', 'bold').setTextColor(filled ? 26 : 110)
    pdf.text(d.label, cx + w / 6, ty, { align: 'center' })
    // Colonne 2 : le nombre de billets/pièces (mis en avant, indigo si saisi).
    pdf.setFont('helvetica', 'bold')
    if (filled) pdf.setTextColor(79, 70, 229)
    else pdf.setTextColor(150)
    pdf.text(`× ${qty}`, cx + w / 2, ty, { align: 'center' })
    // Colonne 3 : le sous-total.
    pdf.setFont('helvetica', 'normal').setTextColor(filled ? 26 : 150)
    pdf.text(fmtEur(d.value * qty), cx + (5 * w) / 6, ty, { align: 'center' })
  })
  y += 5 * cellH + 3

  // Total du fond — même mise en page que la page : à gauche « Fond de caisse
  // 150 € » (muté), à droite « total (écart) » coloré (vert si équilibré).
  const total = fundTotal(form)
  const fe = fundEcart(form)
  pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110)
  pdf.text(`Fond de caisse ${fmtEurInt(FUND_TARGET)}`, LEFT, y)
  pdf.setFont('helvetica', 'bold')
  setBalanceColor(pdf, Math.abs(fe) < EPS)
  pdf.text(`${fmtEur(total)} (${fmtEcart(fe)})`, RIGHT, y, { align: 'right' })
  pdf.setTextColor(26)
  y += 9

  // --- Commentaire : label + cadre TOUJOURS présent (zone à écrire) ---------
  pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(26)
  pdf.text('COMMENTAIRE', LEFT, y)
  y += 4
  const sigY = 250
  const commentH = Math.max(sigY - 8 - y, 18) // remplit jusqu'aux signatures
  pdf.setDrawColor(180).setLineWidth(0.2).rect(LEFT, y, CONTENT_W, commentH)
  const comment = form.comment.trim()
  if (comment) {
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60)
    const lines = pdf.splitTextToSize(comment, CONTENT_W - 6) as string[]
    pdf.text(lines, LEFT + 3, y + 5)
    pdf.setTextColor(26)
  }

  // --- Signatures : deux cadres côte à côte, ancrés en bas de page ----------
  const boxW = 85
  const boxH = 30
  pdf.setDrawColor(51).setLineWidth(0.3)
  pdf.rect(LEFT, sigY, boxW, boxH)
  pdf.rect(RIGHT - boxW, sigY, boxW, boxH)
  pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(90)
  // Nom saisi au modal de clôture, ajouté entre parenthèses au libellé.
  const signLabel = operatorInitials ? `SIGNATURE (${operatorInitials})` : 'SIGNATURE'
  pdf.text(signLabel, LEFT + 3, sigY + 5)
  pdf.text('CONTRE-SIGNATURE', RIGHT - boxW + 3, sigY + 5)
}

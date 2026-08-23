/*
 * Génération d'un document PDF simple du rapprochement du jour, ouvert
 * directement dans la fenêtre d'impression du navigateur (aucun téléchargement).
 *
 * Rendu VECTORIEL via jsPDF, chargé en import() DYNAMIQUE (lib lourde, hors du
 * premier rendu — convention perf du projet). Même patron que la caisse
 * (`src/lib/caisse/pdf.ts`) : autoPrint + iframe caché recyclé.
 *
 * Structure : en-tête → bandeau de compteurs → tableau complet des chambres par
 * étage (couleurs de statut) → commentaire → deux cadres de signature.
 */

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { jsPDF } from 'jspdf'

import {
  CELL_STATES,
  cellState,
  LEGEND_ORDER,
  statusOf,
} from '#/lib/rapro/constants.ts'
import type { CellState } from '#/lib/rapro/constants.ts'
import { FLOORS } from '#/lib/rapro/rooms.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

export interface RaproPdfData {
  titleDate: string
  statuses: ReadonlyMap<number, RoomStatus>
  occupied: ReadonlySet<number>
  /** Chambres reportées (dues antérieurement, jamais résolues) — marquées. */
  carried: ReadonlySet<number>
  counts: {
    sold: number
    clean: number
    bloquee: number
    refus: number
  }
  comment: string
  /** Nom de l'hôtelier saisi à la clôture (ajouté au cadre signature OKKO). */
  operatorName: string
  validatedAt: string | null
}

/** Ouvre un PDF déjà rendu dans la fenêtre d'impression, via un iframe caché
 * recyclé (aucun téléchargement). Harnais partagé par les documents rapro.
 *
 * L'astuce iframe 0×0 + `autoPrint()` (action « imprimer » intégrée au PDF) ne
 * fonctionne que si le navigateur rend le PDF dans une visionneuse NATIVE à
 * l'intérieur de l'iframe — le cas sur desktop (Chrome/Firefox/Edge), pas sur
 * la plupart des navigateurs mobiles (iOS Safari, Chrome Android) : l'iframe
 * invisible ne déclenche rien, le bouton semble ne rien faire (rapporté en
 * usage réel).
 *
 * Réservé à la SOURIS depuis la décision D1 (plan/audit-impression-tactile) :
 * le tactile imprime désormais nativement le DOM écran (`window.print()`,
 * cf. `RaproBoard.tsx`/`rapro.css`), ce chemin jsPDF + iframe caché n'est
 * donc plus jamais appelé que depuis un pointeur souris. `URL.revokeObjectURL`
 * différé au `load` de l'iframe (jamais immédiat : le navigateur a encore
 * besoin du blob le temps de charger le PDF dedans). */
function openPrintablePdf(pdf: jsPDF, frameId: string): void {
  pdf.autoPrint()
  const blobUrl = pdf.output('bloburl').toString()
  document.getElementById(frameId)?.remove()
  const iframe = document.createElement('iframe')
  iframe.id = frameId
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  iframe.addEventListener(
    'load',
    () => URL.revokeObjectURL(blobUrl),
    { once: true },
  )
  iframe.src = blobUrl
  document.body.appendChild(iframe)
}

/** Génère le PDF du rapprochement du jour et ouvre l'impression (souris). */
export async function printRaproSheet(
  data: RaproPdfData,
  title: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title })
  renderRaproDocument(pdf, data)
  openPrintablePdf(pdf, 'rapro-print-frame')
}

const LEFT = 15
const RIGHT = 195
const CENTER = 105
const CONTENT_W = RIGHT - LEFT

type RGB = [number, number, number]

/** Couleurs (fond + texte) d'une case chambre par état visuel — teintes douces
 * adaptées au papier blanc. Même partition que les classes web (`CELL_STATES`),
 * mais en RGB littéraux car jsPDF ne lit pas les tokens CSS. Alimente et les
 * cases de la grille et la légende → une seule source de couleur PDF. */
const CELL_FILL: Record<CellState, { fill: RGB; text: RGB }> = {
  clean: { fill: [110, 231, 183], text: [6, 78, 59] },
  refus: { fill: [252, 211, 77], text: [120, 53, 15] },
  empty: { fill: [241, 245, 249], text: [148, 163, 184] },
  todo: { fill: [254, 202, 202], text: [127, 29, 29] },
}

function renderRaproDocument(
  pdf: jsPDF,
  {
    titleDate,
    statuses,
    occupied,
    carried,
    counts,
    comment,
    operatorName,
    validatedAt,
  }: RaproPdfData,
): void {
  let y = 20

  // --- En-tête : titre (petit) + date (grande, gras) -----------------------
  pdf.setTextColor(26)
  pdf.setFont('helvetica', 'normal').setFontSize(12)
  pdf.text('RAPPROCHEMENT DES CHAMBRES', CENTER, y, { align: 'center' })
  y += 10
  pdf.setFont('helvetica', 'bold').setFontSize(19)
  pdf.text(titleDate, CENTER, y, { align: 'center' })
  y += 5
  pdf.setDrawColor(51).setLineWidth(0.4).line(LEFT, y, RIGHT, y)
  y += 8

  // --- Bandeau de compteurs — mêmes catégories que la page, dans le même ordre :
  //     Balance (en tête) / Vendues / Nettoyées / Refus / Bloquées du jour, + une
  //     case « Bloq. veille » AJOUTÉE seulement s'il y a des chambres reportées.
  //     Balance = Nettoyées + Refus + Bloquées du jour − Bloquées de la veille −
  //     Vendues (contrôle de cohérence) : « 0 » vert si le compte tombe juste,
  //     « +X / -X » rouge sinon. Calculée sur les MÊMES compteurs que l'écran →
  //     valeur identique (tiret ASCII pour l'encodage helvetica du PDF).
  const balance =
    counts.clean + counts.refus + counts.bloquee - carried.size - counts.sold
  const balanceText =
    balance === 0 ? '0' : `${balance > 0 ? '+' : '-'}${Math.abs(balance)}`
  const balanceColor: RGB = balance === 0 ? [5, 150, 105] : [220, 38, 38]
  type BannerCell = { label: string; text: string; color?: RGB }
  const cells: BannerCell[] = [
    { label: 'Balance', text: balanceText, color: balanceColor },
    { label: 'Vendues', text: String(counts.sold) },
    { label: 'Nettoyées', text: String(counts.clean) },
    { label: 'Refus', text: String(counts.refus) },
    { label: 'Bloq. du jour', text: String(counts.bloquee) },
  ]
  if (carried.size > 0)
    cells.push({ label: 'Bloq. de la veille', text: String(carried.size) })
  const cw = CONTENT_W / cells.length
  cells.forEach(({ label, text, color }, i) => {
    const cx = LEFT + i * cw
    pdf
      .setDrawColor(210)
      .setLineWidth(0.2)
      .rect(cx, y, cw - 2, 15)
    pdf.setFont('helvetica', 'bold').setFontSize(14)
    if (color) pdf.setTextColor(color[0], color[1], color[2])
    else pdf.setTextColor(26)
    pdf.text(text, cx + (cw - 2) / 2, y + 7.5, { align: 'center' })
    pdf.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(110)
    pdf.text(label.toUpperCase(), cx + (cw - 2) / 2, y + 12.5, {
      align: 'center',
      maxWidth: cw - 3,
    })
  })
  y += 20

  // --- Tableau complet des chambres par étage (couleurs de statut) ---------
  // Chaque colonne remplit TOUTE la hauteur de la grille (`gridH`, pilotée par
  // l'étage le plus fourni) : la hauteur d'UNE case (`floorCellH`) dépend du
  // nombre de chambres de SON étage, pas d'une valeur fixe — un étage à 13 ou
  // 11 chambres (contre 14 ailleurs) a donc des cases plus HAUTES, jamais de
  // vide blanc en bas de colonne. Même principe que `.rapro-room { flex: 1 }`
  // côté web (styles/rapro.css) ; la hauteur TOTALE de la grille, elle, ne
  // change pas (`gridH` reste celle du plus long étage).
  const colW = CONTENT_W / FLOORS.length
  const cellH = 4.6
  const maxRooms = FLOORS.reduce((m, f) => Math.max(m, f.rooms.length), 0)
  const gridH = maxRooms * cellH
  const gridTop = y
  FLOORS.forEach(({ floor, rooms }, i) => {
    const cx = LEFT + i * colW
    const floorCellH = gridH / rooms.length
    pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(90)
    pdf.text(`Étage ${floor}`, cx + colW / 2, gridTop, { align: 'center' })
    rooms.forEach((room, j) => {
      // Aligné sur le web : grise si AUCUNE couleur explicite ET non vendue. Le
      // liseré (carried) est tracé À PART (ci-dessous), il ne colore pas le fond.
      const state = cellState(
        statusOf(statuses, room),
        !statuses.has(room) && !occupied.has(room),
      )
      // Bloquée de la veille : la case garde le fond de son STATUT, un liseré
      // rouge net est tracé par-dessus (cf. plus bas) — fait sur la veille.
      const isCarriedRoom = carried.has(room)
      const fill = CELL_FILL[state].fill
      const text = CELL_FILL[state].text
      const w = colW - 2
      const h = floorCellH - 0.8
      const cellY = gridTop + 3 + j * floorCellH
      pdf.setFillColor(fill[0], fill[1], fill[2])
      pdf.rect(cx + 1, cellY, w, h, 'F')
      pdf.setFont('helvetica', 'normal').setFontSize(7.5)
      pdf.setTextColor(text[0], text[1], text[2])
      pdf.text(String(room), cx + 1 + w / 2, cellY + h / 2 + 1.1, {
        align: 'center',
      })
      // Liseré rouge net autour de la case reportée (bloquée la veille).
      if (isCarriedRoom) {
        pdf.setDrawColor(248, 113, 113).setLineWidth(0.5)
        pdf.rect(cx + 1, cellY, w, h)
      }
    })
  })
  y = gridTop + 3 + gridH + 6

  // --- Légende des statuts (même partition que les cases). « Non vendue »
  //     (grisé) est masquée ; on ajoute une case témoin « Bloquée la veille »
  //     = liseré rouge, au lieu d'un simple texte. -----------------------------
  type LegendItem = { label: string; fill: RGB; border?: RGB }
  const CARRIED_BORDER: RGB = [248, 113, 113]
  const legend: LegendItem[] = [
    ...LEGEND_ORDER.map((st): LegendItem => ({
      label: CELL_STATES[st].label,
      fill: CELL_FILL[st].fill,
    })),
    {
      label: 'Bloquée de la veille',
      fill: [255, 255, 255],
      border: CARRIED_BORDER,
    },
  ]
  pdf.setFont('helvetica', 'normal').setFontSize(7.5)
  const legendGap = 7
  const itemW = legend.map(({ label }) => 4 + pdf.getTextWidth(label))
  const legendW =
    itemW.reduce((a, b) => a + b, 0) + legendGap * (legend.length - 1)
  let lx = RIGHT - legendW // aligné à droite (bord droit = marge RIGHT)
  legend.forEach(({ label, fill, border }, i) => {
    pdf.setFillColor(fill[0], fill[1], fill[2])
    if (border) {
      // Témoin du marquage « bloquée la veille » : même liseré rouge net que
      // dans la grille (couleur + épaisseur identiques).
      pdf.rect(lx, y - 2.6, 3, 3, 'F')
      pdf.setDrawColor(border[0], border[1], border[2]).setLineWidth(0.5)
      pdf.rect(lx, y - 2.6, 3, 3)
    } else {
      pdf.setDrawColor(170).setLineWidth(0.2)
      pdf.rect(lx, y - 2.6, 3, 3, 'FD')
    }
    pdf.setTextColor(80)
    pdf.text(label, lx + 4, y)
    lx += itemW[i] + legendGap
  })
  y += 6

  // --- Commentaire : cadre pleine largeur jusqu'aux signatures --------------
  const sigY = 255
  pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(26)
  pdf.text('COMMENTAIRE', LEFT, y)
  y += 4
  const commentH = Math.max(sigY - 10 - y, 16)
  pdf.setDrawColor(180).setLineWidth(0.2).rect(LEFT, y, CONTENT_W, commentH)
  const c = comment.trim()
  if (c) {
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60)
    pdf.text(pdf.splitTextToSize(c, CONTENT_W - 6) as string[], LEFT + 3, y + 5)
  }

  // --- Mention de clôture (petite, au-dessus des signatures) ----------------
  if (validatedAt) {
    const when = format(new Date(validatedAt), "d MMMM yyyy 'à' HH'h'mm", {
      locale: fr,
    })
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
    pdf.text(`Clôturé le ${when}`, RIGHT, sigY - 3, { align: 'right' })
  }

  // --- Signatures : cadre OKKO nominatif (hôtelier), cadre ÉLIOR fixe -------
  const boxW = 85
  const boxH = 28
  pdf.setDrawColor(51).setLineWidth(0.3)
  pdf.rect(LEFT, sigY, boxW, boxH)
  pdf.rect(RIGHT - boxW, sigY, boxW, boxH)
  pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(90)
  const okkoLabel = operatorName
    ? `SIGNATURE OKKO (${operatorName})`
    : 'SIGNATURE OKKO'
  pdf.text(okkoLabel, LEFT + 3, sigY + 5)
  pdf.text('SIGNATURE ÉLIOR', RIGHT - boxW + 3, sigY + 5)
}

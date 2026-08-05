import { fmt } from '#/lib/repjour/format.ts'
import { fmtJours, monthPace } from '#/lib/repjour/summaryMetrics.ts'
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
  /** « Pris depuis la veille » (euros) — carte 1. `null`/absent → « — ». */
  pickup?: number | null
  /** Nombre de jours du mois — cadence des cartes « Effort restant » / « Avance ».
   * Absent → 0 (ces cartes affichent « — »). */
  daysInMonth?: number
  /** Projeté fin de mois au 1er (carnet d'ouverture) — sous-valeur de « Rentré
   * depuis le 1er ». `null`/absent → sous-valeur masquée. */
  monthStartProjection?: number | null
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

/** Lignes du tableau KPI + leurs deux formats — LONG (desktop) et COMPACT (mobile,
 * sans unité, nombres courts). Calqué à l'identique sur `KPITable` : la version
 * compacte évite le retour à la ligne des valeurs sur petit écran (technique
 * « double cellule » de la page RepJour). */
const TABLE_ROWS: {
  label: string
  labelShort: string
  key: keyof KPIBlock
  budgetKey: keyof MonthBudget
  ecartKey: keyof Ecart
  fmtVal: (n: number) => string
  fmtValCompact: (n: number) => string
  fmtEcart: (n: number) => string
  fmtEcartCompact: (n: number) => string
}[] = [
  {
    label: 'Nuitées',
    labelShort: 'Nuit.',
    key: 'nuitees',
    budgetKey: 'nuitees',
    ecartKey: 'nuitees',
    fmtVal: fmt.nuitees,
    fmtValCompact: fmt.compact,
    fmtEcart: fmt.ecartNuitees,
    fmtEcartCompact: fmt.compactEcart,
  },
  {
    label: 'Taux occupation',
    labelShort: 'TO',
    key: 'to',
    budgetKey: 'taux_occupation',
    ecartKey: 'to',
    fmtVal: fmt.pct,
    fmtValCompact: fmt.compactDec,
    fmtEcart: ecartPctFmt,
    fmtEcartCompact: fmt.compactEcartDec,
  },
  {
    label: 'Prix moyen',
    labelShort: 'PM',
    key: 'pm',
    budgetKey: 'prix_moyen',
    ecartKey: 'pm',
    fmtVal: fmt.eur,
    fmtValCompact: fmt.compactDec,
    fmtEcart: fmt.ecartEur,
    fmtEcartCompact: fmt.compactEcartDec,
  },
  {
    label: 'RevPAR',
    labelShort: 'Rp',
    key: 'revpar',
    budgetKey: 'revpar',
    ecartKey: 'revpar',
    fmtVal: fmt.eur,
    fmtValCompact: fmt.compactDec,
    fmtEcart: fmt.ecartEur,
    fmtEcartCompact: fmt.compactEcartDec,
  },
  {
    label: "Chiffre d'affaires",
    labelShort: 'CA',
    key: 'roomRevenue',
    budgetKey: 'room_revenue',
    ecartKey: 'roomRevenue',
    fmtVal: fmt.eurInt,
    fmtValCompact: fmt.compact,
    fmtEcart: fmt.ecartEurInt,
    fmtEcartCompact: fmt.compactEcart,
  },
]

/** Largeur du bloc, en pixels. Fixée : un e-mail ne se redimensionne pas, et
 * html2canvas a besoin d'une largeur explicite pour cadrer l'image. */
export const REPORT_WIDTH_PX = 540

/** Styles du conteneur, appliqués par l'appelant (élément DOM ou `<div>` mail). */
export const REPORT_CONTAINER_STYLE = `font-family: -apple-system, system-ui, sans-serif; background: transparent; padding: 16px; width: ${REPORT_WIDTH_PX}px;`

/**
 * Conteneur pour le CORPS D'E-MAIL (mode `forEmail`). Largeur MAX (et non fixe) +
 * ALIGNÉ À GAUCHE (`margin: 0`) : lisible sur mobile (pas de scroll horizontal) et
 * calé sur le bord gauche du message, comme un courriel classique. Le fixe `width`
 * de `REPORT_CONTAINER_STYLE` reste réservé à html2canvas, qui a besoin d'une
 * largeur explicite pour cadrer l'image.
 */
export const REPORT_EMAIL_CONTAINER_STYLE = `font-family: -apple-system, system-ui, sans-serif; padding: 16px; max-width: ${REPORT_WIDTH_PX}px; margin: 0;`

export interface ReportHtmlOptions {
  /**
   * `true` : rendu pour un VRAI corps d'e-mail (cellules centrées `vertical-align`,
   * barre de progression en `<table>` — pas de `position: absolute`, ignoré par
   * Gmail/Outlook). `false` (défaut) : rendu pour html2canvas (image presse-papier),
   * qui exige les réglages historiques (padding compensé, barre en divs absolus).
   */
  forEmail?: boolean
}

/**
 * Les deux cartes du rapport (tableau des KPI + barre de progression), en HTML.
 * Ne comprend PAS le conteneur : voir `REPORT_CONTAINER_STYLE` /
 * `REPORT_EMAIL_CONTAINER_STYLE`.
 */
export function buildReportHtml(
  data: EmailData,
  { forEmail = false }: ReportHtmlOptions = {},
): string {
  const { realiseJour, realiseMTD, projeteMois, budget, ecart } = data

  // Chaque valeur en DOUBLE format : long (desktop) + compact (mobile). Le rendu
  // e-mail émet les deux dans des <span> que la media query bascule ; le rendu image
  // n'en garde que le long.
  const rows = TABLE_ROWS.map((r) => ({
    label: r.label,
    labelShort: r.labelShort,
    rj: r.fmtVal(realiseJour[r.key]),
    rjC: r.fmtValCompact(realiseJour[r.key]),
    mtd: r.fmtVal(realiseMTD[r.key]),
    mtdC: r.fmtValCompact(realiseMTD[r.key]),
    proj: r.fmtVal(projeteMois[r.key]),
    projC: r.fmtValCompact(projeteMois[r.key]),
    bud: r.fmtVal(budget[r.budgetKey]),
    budC: r.fmtValCompact(budget[r.budgetKey]),
    ec: r.fmtEcart(ecart[r.ecartKey]),
    ecC: r.fmtEcartCompact(ecart[r.ecartKey]),
    ecVal: ecart[r.ecartKey],
  }))

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
  // Légende : chaque item = pastille + texte sur la même ligne. En mode e-mail, la
  // pastille et le texte sont centrés verticalement (`vertical-align: middle`), sans
  // le `margin-top: 13px` de compensation html2canvas qui, dans un vrai mail, poussait
  // la pastille vers le bas et la désalignait du texte.
  const dotAlign = forEmail
    ? 'vertical-align: middle;'
    : 'margin-top: 13px;'
  const legendCellAlign = forEmail ? 'vertical-align: middle;' : ''
  const legendTextLine = forEmail ? '' : 'line-height: 8px;'
  const legendCell = (color: string, text: string, textColor = '#6B7280') =>
    `<td style="padding: 0 14px 0 0; ${legendCellAlign}">
      <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;"><tr>
        <td style="padding: 3px 6px 3px 0; ${legendCellAlign}"><div style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; ${dotAlign}"></div></td>
        <td style="padding: 3px 0; ${legendCellAlign} font-size: 10px; color: ${textColor}; white-space: nowrap; ${legendTextLine}">${escapeHtml(text)}</td>
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

  // Padding vertical : SYMÉTRIQUE + `vertical-align: middle` en mode e-mail (texte
  // réellement centré dans la case) ; ASYMÉTRIQUE (haut < bas) en mode image pour
  // compenser le rendu de la font dans html2canvas.
  const cellPad = forEmail ? '9px 10px' : '3px 10px 17px 10px'
  const vMiddle = forEmail ? 'vertical-align: middle;' : ''
  // Cellule à DOUBLE format en e-mail : `<span rj-full>` (long, visible desktop) +
  // `<span rj-compact>` (court, masqué par défaut, révélé sous 480 px par la media
  // query de sendServer.ts). `nowrap` empêche le repli des valeurs. En mode image,
  // seule la version longue est rendue (pas de stylesheet, donc pas de bascule).
  const cell = (
    full: string,
    compact: string,
    align: string,
    color: string,
    extra = '',
  ) =>
    forEmail
      ? `<td class="rj-cell" style="padding: ${cellPad}; ${vMiddle} text-align: ${align}; font-size: 12px; color: ${color}; border-bottom: 1px solid #F3F4F6; white-space: nowrap; ${extra}"><span class="rj-full">${escapeHtml(full)}</span><span class="rj-compact" style="display: none;">${escapeHtml(compact)}</span></td>`
      : `<td style="padding: ${cellPad}; text-align: ${align}; font-size: 12px; color: ${color}; border-bottom: 1px solid #F3F4F6; ${extra}">${escapeHtml(full)}</td>`

  const tableRows = rows
    .map(
      (r) => `<tr>
    ${cell(r.label, r.labelShort, 'left', '#1B3A5C', 'font-weight: 600;')}
    ${cell(r.rj, r.rjC, 'center', '#1A1A1A')}
    ${cell(r.mtd, r.mtdC, 'center', '#1A1A1A', sep)}
    ${cell(r.proj, r.projC, 'center', '#1A1A1A')}
    ${cell(r.bud, r.budC, 'center', '#6B7280', sep)}
    ${cell(r.ec, r.ecC, 'center', ecartColor(r.ecVal), 'font-weight: 700;')}
  </tr>`,
    )
    .join('')

  // Card 2 : Barre. DEUX rendus selon la cible :
  //   - image (html2canvas) : segments en `position: absolute` (rasterisés fidèlement) ;
  //   - e-mail : une SEULE ligne de `<table>`, chaque segment = `<td width="X%">`
  //     coloré (aucun `position`, que Gmail/Outlook ignorent). Cellule vide finale
  //     = piste restante (fond gris du conteneur). Le marqueur « budget dépassé »
  //     (fin trait vertical) tomberait AU MILIEU des segments remplis une fois
  //     l'échelle dilatée : non rendu en e-mail, le pourcentage > 100 % le signale.
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

  const emailSeg = (w: number, color: string) =>
    w > 0
      ? `<td width="${Math.round(w)}%" style="height: 8px; background: ${color}; font-size: 0; line-height: 0; mso-line-height-rule: exactly;">&nbsp;</td>`
      : ''
  const emailBar = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; table-layout: fixed; height: 8px; background: #F3F4F6; border-radius: 4px;">
          <tr>
            ${emailSeg(precedentW, '#4CAF50')}${emailSeg(jourW, '#D4A017')}${emailSeg(projeteW, '#D1D5DB')}<td style="height: 8px; font-size: 0; line-height: 0; mso-line-height-rule: exactly;">&nbsp;</td>
          </tr>
        </table>`

  const barCell = forEmail
    ? emailBar
    : `<div style="position: relative; width: 100%; height: 8px; background: #F3F4F6; border-radius: 4px;">
          ${barSegments}
        </div>`

  // En-tête à double format (comme les cellules). Sans version courte, l'intitulé
  // reste affiché tel quel sur mobile (ex. « Cumul »).
  const th = (full: string, compact: string, align: string, extra = '') => {
    const inner =
      forEmail && compact
        ? `<span class="rj-full">${full}</span><span class="rj-compact" style="display: none;">${compact}</span>`
        : full
    const cls = forEmail ? ' class="rj-cell"' : ''
    const nowrap = forEmail ? 'white-space: nowrap;' : ''
    const vm = forEmail ? vMiddle : ''
    return `<th${cls} style="padding: ${cellPad}; ${vm} text-align: ${align}; font-size: 11px; color: #6B7280; font-weight: 500; border-bottom: 1px solid #E5E7EB; ${nowrap} ${extra}">${inner}</th>`
  }

  // --- Cartes de synthèse (mode e-mail seulement, les 4 MÊMES qu'à l'écran) -----
  // Valeurs dérivées de `monthPace` : SOURCE UNIQUE partagée avec `SummaryCards`
  // (écran) et `pdf.ts` — le mail colle donc toujours à la page. L'image html2canvas
  // ne les affiche pas (elle reçoit un rapport « nu ») → bloc omis hors e-mail.
  const cardsBlock = forEmail
    ? buildCards(data, ecartColor)
    : ''

  const tableBlock = `<div style="${card} padding: 0;">
  <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
    <tr style="background: #F9FAFB;">
      ${th('', '', 'left')}
      ${th('Jour', 'J', 'center')}
      ${th('Cumul', '', 'center', sep)}
      ${th('Projeté', 'Proj.', 'center')}
      ${th('Budget', 'Budg.', 'center', sep)}
      ${th('Écart', '+/-', 'center')}
    </tr>
    ${tableRows}
  </table>
</div>`

  const barBlock = `<div style="${card} padding: 10px 16px 16px 16px;">
  <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 0 12px 0 0; vertical-align: middle;">
        ${barCell}
      </td>
      <td style="width: 40px; padding: 0 0 ${forEmail ? '0' : '11'}px 0; text-align: right; vertical-align: middle; font-size: 13px; font-weight: 700; color: #1A1A1A;">${totalPct.toFixed(0)}%</td>
    </tr>
  </table>
  <table cellpadding="0" cellspacing="0" style="margin-top: -1px; border-collapse: collapse;">
    <tr>${legendCells.join('')}</tr>
  </table>
</div>`

  // Espaceur inter-blocs robuste (les marges sont ignorées par Outlook).
  const gap =
    '<div style="height: 10px; line-height: 10px; font-size: 0;">&nbsp;</div>'

  // Ordre E-MAIL = celui de la page RepJour et du PDF : cartes → barre → tableau.
  // Ordre IMAGE (html2canvas) = historique : tableau → barre (pas de cartes).
  const ordered = forEmail
    ? [cardsBlock, barBlock, tableBlock]
    : [tableBlock, barBlock]

  return ordered.filter(Boolean).join(gap)
}

/** Rangée des 4 cartes de synthèse, en `<table>` e-mail (cellule bordée + liseré
 * d'accent à gauche), calquée sur `SummaryCards` / le PDF. */
function buildCards(
  data: EmailData,
  ecartColor: (n: number) => string,
): string {
  const { realiseMTD, projeteMois, budget } = data
  const pickup = data.pickup ?? null
  const dim = data.daysInMonth ?? 0
  const depart = data.monthStartProjection ?? null
  const {
    rentre,
    remainingDays,
    hasDay,
    effortJour,
    rythmeTenu,
    budgetAtteint,
    joursAvance,
    revision,
  } = monthPace({
    realiseMTD,
    projeteMois,
    budget,
    dayOfMonth: data.dayOfMonth,
    daysInMonth: dim,
    depart,
  })

  // Sous-valeur de « Effort restant » (même logique que l'écran / le PDF).
  let effortSub = ''
  let effortSubColor = '#6B7280'
  if (remainingDays <= 0) effortSub = 'mois terminé'
  else if (budgetAtteint) {
    effortSub = 'budget atteint'
    effortSubColor = '#4CAF50'
  } else if (rythmeTenu > 0) {
    effortSub = `vs ${fmt.eurInt(rythmeTenu)}/j tenus`
    effortSubColor = effortJour <= rythmeTenu ? '#4CAF50' : '#E53935'
  }

  const cards = [
    {
      label: 'Pris depuis la veille',
      accent: '#4CAF50',
      value: pickup == null ? '—' : fmt.ecartEurInt(pickup),
      valueColor: pickup == null ? '#6B7280' : ecartColor(pickup),
      sub: pickup == null ? '' : 'vs dernier rapport',
      subColor: '#6B7280',
    },
    {
      label: 'Effort restant',
      accent: '#B0780A',
      value: remainingDays > 0 ? `${fmt.eurInt(effortJour)}/j` : '—',
      valueColor: remainingDays > 0 ? '#1A1A1A' : '#6B7280',
      sub: effortSub,
      subColor: effortSubColor,
    },
    {
      label: 'Avance sur le budget',
      accent: '#0E7490',
      value: joursAvance == null ? '—' : fmtJours(joursAvance),
      valueColor: joursAvance == null ? '#6B7280' : ecartColor(joursAvance),
      sub: hasDay ? `au jour ${data.dayOfMonth}/${dim}` : '',
      subColor: '#6B7280',
    },
    {
      label: 'Rentré depuis le 1er',
      accent: '#4338CA',
      value:
        revision == null
          ? fmt.eurInt(rentre)
          : (revision >= 0 ? '+' : '-') + fmt.eurInt(rentre),
      valueColor: revision == null ? '#1A1A1A' : ecartColor(revision),
      sub: depart == null ? '' : `${fmt.eurInt(depart)} au 1er`,
      subColor: '#6B7280',
    },
  ]

  // Cartes calquées sur `StatTile` (page RepJour) : rail d'accent PLEINE HAUTEUR à
  // gauche + coins arrondis 12px (via `overflow: hidden`), libellé 0.6rem semibold
  // uppercase, valeur ~1.2rem en gras. Le libellé réserve 2 lignes (`min-height`)
  // pour aligner les valeurs entre cartes.
  //
  // DISPOSITION = celle de la GRILLE de la page web (`grid-cols-2 sm:grid-cols-4`) :
  // un `<table>` à 4 colonnes en POURCENTAGE — les cartes s'étirent fluidement quand
  // la fenêtre change (comme des colonnes de grille), et la media query de
  // sendServer.ts fait BASCULER net en 2×2 sous 480 px (le `sm:` de Tailwind). Donc
  // reflow automatique au redimensionnement de la fenêtre, exactement comme le site :
  // 4 colonnes qui respirent, puis un saut propre à 2×2. `table-layout: fixed` = 4
  // largeurs égales garanties, jamais de repli 3+1.
  const cardCell = (c: (typeof cards)[number]) =>
    `<td class="rj-cardcell" width="25%" style="vertical-align: top; padding: 0 4px 8px 4px;">
      <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;"><tr>
          <td style="width: 6px; background: ${c.accent}; font-size: 0; line-height: 0;">&nbsp;</td>
          <td style="padding: 9px 12px;">
            <div style="min-height: 22px; font-size: 9px; font-weight: 600; letter-spacing: 0.3px; text-transform: uppercase; color: #6B7280; line-height: 1.2;">${escapeHtml(c.label)}</div>
            <div style="font-size: 19px; font-weight: 700; color: ${c.valueColor}; line-height: 1.1; padding-top: 3px; white-space: nowrap;">${escapeHtml(c.value)}</div>
            <div style="font-size: 10px; color: ${c.subColor}; line-height: 1.2; padding-top: 3px; white-space: nowrap;">${c.sub ? escapeHtml(c.sub) : '&nbsp;'}</div>
          </td>
        </tr></table>
      </div>
    </td>`

  return `<table class="rj-cards" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; table-layout: fixed;">
  <tr>${cards.map(cardCell).join('')}</tr>
</table>`
}

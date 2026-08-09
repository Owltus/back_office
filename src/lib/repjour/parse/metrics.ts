import Papa from 'papaparse'

/*
 * Conversion INTÉGRALE du CSV « Comparison By Date » en lignes de données.
 *
 * `parse/comparison.ts` n'extrait que les trois lignes dont les KPI RepJour ont
 * besoin (Occupied Rooms, ROOM REVENUE, VAT). Ici on capture TOUT le fichier —
 * statistiques chambres, TVA, postes de revenus, taxe de séjour, modes de
 * paiement — pour le rendre exploitable en base et croisable entre les pages
 * (le rapprochement y lit « No Show Rooms »). Aucun fichier n'est stocké.
 *
 * Deux pièges du format, tous deux traités ici :
 *   - les libellés ne sont PAS uniques (« Petit-déjeuner Groupe » apparaît 3×) →
 *     on rend le rang (`lineNo`) pour servir de clé, jamais le libellé seul ;
 *   - certaines valeurs ne sont pas des nombres : pourcentages (« 92.50% ») et
 *     couples (« 82 / 0 » pour adultes/enfants). Les colonnes numériques valent
 *     alors `null` et `raw` conserve la chaîne d'origine — aucune perte.
 */

/** Une ligne du CSV Comparison, prête à être persistée. `raw` porte les valeurs
 * d'origine (pourcentages, couples « 82 / 0 ») que les champs numériques ne
 * peuvent pas représenter. */
export interface ComparisonMetricRow {
  /** Rang dans le fichier (1-based) — les libellés ne sont pas uniques. */
  lineNo: number
  section: string
  today: number | null
  mtd: number | null
  lastYearMtd: number | null
  mtdVariance: number | null
  ytd: number | null
  lastYearYtd: number | null
  ytdVariance: number | null
  raw: Record<string, string>
}

/** En-têtes du CSV, dans l'ordre, mappés aux champs numériques de sortie. */
const COLUMNS = [
  ['today', 'TODAY'],
  ['mtd', 'MTD'],
  ['lastYearMtd', 'LAST YEAR MTD'],
  ['mtdVariance', 'MTD VARIANCE'],
  ['ytd', 'YTD'],
  ['lastYearYtd', 'LAST YEAR YTD'],
  ['ytdVariance', 'YTD VARIANCE'],
] as const

/**
 * Nombre strict, ou `null`. Le pourcentage perd son `%` (« 92.50% » → 92.5).
 *
 * La validation par expression régulière est indispensable : `parseFloat` lit
 * « 82 / 0 » comme 82, ce qui inventerait une donnée fausse pour la ligne
 * « Guests (Adults / Children) ».
 */
function toNumber(value: string | undefined): number | null {
  const s = (value ?? '').trim().replace(/%$/, '').replace(/\s/g, '')
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Toutes les lignes de données du CSV, dans l'ordre du fichier (`lineNo` à
 * partir de 1). Les lignes sans libellé (vides, pied de page) sont écartées.
 */
export function parseComparisonMetrics(csvText: string): ComparisonMetricRow[] {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  })
  const data = result.data ?? []
  if (data.length === 0)
    throw new Error("Le fichier des chiffres du jour est vide ou illisible. Recommence l'export.")

  // Trouver la LIGNE d'en-tête (colonne TODAY), OÙ QU'ELLE SOIT : l'export planifié
  // « *_comparison_report_DAILY_* » est précédé d'un préambule (Hotel Code…), alors
  // que l'export manuel « Comparison By Date » a l'en-tête en 1re ligne. On la
  // cherche donc au lieu de supposer la 1re ligne (les deux formats sont acceptés).
  let headerIdx = -1
  for (let r = 0; r < data.length; r++) {
    if (data[r].map((h) => (h ?? '').trim().toUpperCase()).includes('TODAY')) {
      headerIdx = r
      break
    }
  }
  if (headerIdx === -1) {
    throw new Error("Ce fichier n'a pas le bon format. Vérifie le fichier des chiffres du jour (Comparison By Date).")
  }

  // Index des colonnes par en-tête : le PMS peut en ajouter ou les réordonner.
  const header = data[headerIdx].map((h) => (h ?? '').trim().toUpperCase())
  const index = Object.fromEntries(
    COLUMNS.map(([key, label]) => [key, header.indexOf(label)]),
  ) as Record<(typeof COLUMNS)[number][0], number>

  const rows: ComparisonMetricRow[] = []
  for (const row of data.slice(headerIdx + 1)) {
    const section = (row[0] ?? '').trim()
    if (!section) continue

    // `raw` = les valeurs telles qu'écrites par le PMS, colonnes vides exclues.
    const raw: Record<string, string> = {}
    for (const [key] of COLUMNS) {
      const i = index[key]
      const value = i === -1 ? '' : (row[i] ?? '').trim()
      if (value) raw[key] = value
    }

    rows.push({
      lineNo: rows.length + 1,
      section,
      today: toNumber(row[index.today]),
      mtd: toNumber(row[index.mtd]),
      lastYearMtd: toNumber(row[index.lastYearMtd]),
      mtdVariance: toNumber(row[index.mtdVariance]),
      ytd: toNumber(row[index.ytd]),
      lastYearYtd: toNumber(row[index.lastYearYtd]),
      ytdVariance: toNumber(row[index.ytdVariance]),
      raw,
    })
  }

  return rows
}

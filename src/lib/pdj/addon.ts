/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — parseur du CSV « Addon Production » du PMS.
 *
 * Ce rapport agrège, pour une date métier « clôture », le nombre de
 * réservations (Total Count) et le chiffre d'affaires TTC (Total Revenue) par
 * code produit. On n'en garde que les codes petit-déjeuner (PDJ, PDJBB…), qui
 * alimentent le calcul des montants HT de la journée (voir amounts.ts).
 *
 * Fonctions pures (sans React ni réseau). Réutilise `parseCsvLine` du parsing
 * In-House pour le découpage tolérant aux guillemets.
 *
 * ALIGNEMENT DES DATES (règle unique) : la date lue dans le fichier est la date
 * « clôture » (ex. 2026-08-09). Le petit-déjeuner correspondant est SERVI le
 * lendemain (2026-08-10), jour sous lequel le In-House et le board rangent la
 * journée. `breakfastServiceDate` applique ce +1 ; c'est la SEULE source de la
 * règle, réutilisée côté service ET côté Edge.
 * ------------------------------------------------------------------------ */

import { parseCsvLine } from '#/lib/pdj/csv.ts'

// Préfixe des codes petit-déjeuner : « PDJ » matche PDJ et PDJBB (détection
// dynamique — pas de liste figée). Source unique, évite un littéral dupliqué.
const BREAKFAST_CODE_PREFIX = 'PDJ'

/** Une ligne « code » du rapport Addon Production. */
export interface AddonProductionRow {
  /** Code produit normalisé (trim + upper), ex. 'PDJ', 'PDJBB'. */
  code: string
  /** Total Count = nombre de réservations pour ce code. */
  count: number
  /** Total Revenue = chiffre d'affaires TTC pour ce code. */
  revenue: number
}

/** Résultat du parsing d'un CSV Addon Production. */
export interface ParsedAddonProduction {
  /** Date métier « clôture » BRUTE lue du contenu ('YYYY-MM-DD'), ou null. */
  businessDate: string | null
  /** Uniquement les lignes de codes petit-déjeuner. */
  rows: AddonProductionRow[]
}

/** Petit-déjeuner ⟺ code commençant par « PDJ » (matche PDJ et PDJBB). */
export function isBreakfastCode(code: string): boolean {
  return code.trim().toUpperCase().startsWith(BREAKFAST_CODE_PREFIX)
}

/**
 * Parse un CSV Addon Production en `{ businessDate, rows }`.
 *
 * Robustesse : retrait d'un BOM éventuel, préambule de longueur variable, deux
 * séparateurs possibles (`,` puis `;`), décimales à la virgule. La ligne
 * d'en-tête des codes est REPÉRÉE (elle contient « Total Count » ET « Total
 * Revenue ») plutôt que supposée à un index fixe — l'export automatique fait
 * précéder les codes d'un préambule (Hotel Code…, Date Range…).
 */
export function parseAddonProduction(content: string): ParsedAddonProduction {
  // Retrait d'un BOM éventuel (export PMS/Windows) : sinon il se colle à la
  // première cellule et casse la détection de l'en-tête.
  const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const rawLines = clean.split('\n').filter((l) => l.trim())

  // TROUVER la ligne d'en-tête des codes (« Total Count » ET « Total Revenue »)
  // au lieu de supposer un index : l'en-tête « Date Range » porte « Total number »
  // (pas « Total Count »), ce qui la disqualifie et lève l'ambiguïté. On teste
  // les deux séparateurs et on retient celui qui découpe bien l'en-tête.
  const isHeader = (cells: string[]) =>
    cells.includes('Total Count') && cells.includes('Total Revenue')
  let separator = ','
  let headerIdx = -1
  outer: for (let i = 0; i < rawLines.length; i++) {
    for (const sep of [',', ';']) {
      const cells = parseCsvLine(rawLines[i], sep).map((c) => c.trim())
      if (isHeader(cells)) {
        separator = sep
        headerIdx = i
        break outer
      }
    }
  }
  if (headerIdx === -1) {
    return { businessDate: null, rows: [] }
  }

  // businessDate : 1er token date de la ligne d'en-tête des codes (col « date
  // de clôture »). Repli : borne gauche de « Date Range » (ex. 2026-08-09 -
  // 2026-08-09). null si aucune date exploitable.
  const headerCells = parseCsvLine(rawLines[headerIdx], separator).map((c) =>
    c.trim(),
  )
  // Date métier : cellule ENTIÈRE 'YYYY-MM-DD' de l'en-tête des codes (col « date
  // de clôture »). Correspondance ANCRÉE sur la cellule complète — identique à
  // l'Edge (import-report/addon.ts) : une cellule mixte (ex. « Generated
  // 2026-08-10 ») est ignorée, on ne retient qu'une date nue, pour que la date —
  // et donc le +1 — soit garantie identique quelle que soit la voie d'ingestion.
  let businessDate: string | null =
    headerCells.find((c) => /^\d{4}-\d{2}-\d{2}$/.test(c)) ?? null
  // Repli : borne gauche de « Date Range » (ex. « 2026-08-09 - 2026-08-09 »).
  if (!businessDate) {
    for (const l of rawLines) {
      const m = l.match(/(\d{4}-\d{2}-\d{2})\s*-\s*\d{4}-\d{2}-\d{2}/)
      if (m) {
        businessDate = m[1]
        break
      }
    }
  }

  // Lignes de codes : après l'en-tête. On ne garde que les codes petit-déjeuner
  // (écarte parking, taxe, bar… et tout pied de page « Total »).
  const rows: AddonProductionRow[] = []
  for (const line of rawLines.slice(headerIdx + 1)) {
    const parts = parseCsvLine(line, separator)
    const code = (parts[0] ?? '').trim().toUpperCase()
    if (!code || !isBreakfastCode(code)) continue
    const count = parseInt(parts[1] ?? '', 10)
    const revenue = parseFloat((parts[2] ?? '').replace(',', '.'))
    rows.push({
      code,
      count: Number.isNaN(count) ? 0 : count,
      revenue: Number.isNaN(revenue) ? 0 : revenue,
    })
  }

  return { businessDate, rows }
}

/**
 * Jour du petit-déjeuner = date métier « clôture » + 1 jour. SOURCE UNIQUE de
 * l'alignement (réutilisée par service.ts et l'Edge). 'YYYY-MM-DD' →
 * 'YYYY-MM-DD'. Calcul en UTC pour éviter tout décalage de fuseau (comme
 * repjour). Gère fin de mois et fin d'année (report automatique).
 */
export function breakfastServiceDate(businessDate: string): string {
  const [y, m, d] = businessDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Une entrée (jour × code) d'un export Addon Production « plage » (multi-jours). */
export interface AddonProductionDayRow {
  /** Date métier « clôture » de la colonne ('YYYY-MM-DD'). */
  businessDate: string
  /** Code petit-déjeuner normalisé (upper/trim). */
  code: string
  count: number
  revenue: number
}

/**
 * Parse un export Addon Production « plage » (format LARGE : une paire
 * (count, revenue) PAR JOUR après les 3 colonnes de total). L'en-tête des codes
 * porte `"",Total Count,Total Revenue,Average revenue,<date1>,"",<date2>,"",…` :
 * chaque cellule 'YYYY-MM-DD' marque une colonne jour → `count` à cet index,
 * `revenue` au suivant. Renvoie une ligne par (jour, code petit-déjeuner) NON
 * nulle (on ignore les 0/0 pour ne pas écraser d'autres jours à l'upsert), les
 * codes hors petit-déjeuner, et les totaux de plage (colonnes 1..3). Gère aussi
 * un fichier mono-jour (une seule colonne date). [] si structure non reconnue.
 */
export function parseAddonProductionRange(
  content: string,
): AddonProductionDayRow[] {
  const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const rawLines = clean.split('\n').filter((l) => l.trim())

  const isCodeHeader = (cells: string[]) => {
    const norm = cells.map((c) => c.trim().toLowerCase())
    return norm.includes('total count') && norm.includes('total revenue')
  }
  let separator = ','
  let headerIdx = -1
  outer: for (let i = 0; i < rawLines.length; i++) {
    for (const sep of [',', ';']) {
      const cells = parseCsvLine(rawLines[i], sep)
      if (isCodeHeader(cells)) {
        separator = sep
        headerIdx = i
        break outer
      }
    }
  }
  if (headerIdx === -1) return []

  // Colonnes jour : chaque cellule 'YYYY-MM-DD' de l'en-tête (count à cet index,
  // revenue au suivant).
  const headerCells = parseCsvLine(rawLines[headerIdx], separator)
  const dayCols: { index: number; date: string }[] = []
  headerCells.forEach((cell, i) => {
    const d = cell.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dayCols.push({ index: i, date: d })
  })
  if (dayCols.length === 0) return []

  const out: AddonProductionDayRow[] = []
  for (const line of rawLines.slice(headerIdx + 1)) {
    const parts = parseCsvLine(line, separator)
    const code = (parts[0] ?? '').replace(/"/g, '').trim().toUpperCase()
    if (!code || !isBreakfastCode(code)) continue
    for (const { index, date } of dayCols) {
      const count = parseInt((parts[index] ?? '').replace(/"/g, '').trim(), 10)
      const revenue = parseFloat(
        (parts[index + 1] ?? '').replace(/"/g, '').replace(',', '.').trim(),
      )
      const c = Number.isNaN(count) ? 0 : count
      const r = Number.isNaN(revenue) ? 0 : revenue
      if (c === 0 && r === 0) continue // pas de PDJ ce jour pour ce code → ignoré
      out.push({ businessDate: date, code, count: c, revenue: r })
    }
  }
  return out
}

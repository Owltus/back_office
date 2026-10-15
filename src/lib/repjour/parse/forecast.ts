import Papa from 'papaparse'
import { fromTTC } from '#/lib/repjour/constants.ts'
import type { ForecastRow } from '#/lib/repjour/types.ts'

// Montant lu d'une cellule REV. L'export StayNTouch écrit « 7500.20 » (point
// décimal, aucun séparateur de milliers, même pour TOTALS). Un fichier rouvert
// et réenregistré sous Excel peut écrire « 7500,20 », « 7 500,20 » (espace,
// insécable U+00A0 ou fine U+202F), « 7.500,20 » ou « 7,500.20 ».
// Règles, dans l'ordre :
// - les espaces sont retirés ;
// - UN SEUL séparateur (point OU virgule) est DÉCIMAL, quel que soit le nombre
//   de chiffres qui le suivent : « 1,234 » vaut 1,234 et non 1 234. Choix
//   assumé : le format source n'a jamais de milliers, une virgule seule ne peut
//   donc venir que de la virgule décimale d'Excel en français ;
// - plusieurs séparateurs : milliers par groupes de trois, décimale facultative
//   de l'autre signe (« 1,234,567.5 », « 1.234.567,5 ») ;
// - toute autre écriture (« 12abc », « 1e3 », « Infinity », « NaN », nombre
//   hors des flottants) est INVALIDE → null, jamais tronquée en silence.
// Miroir EXACT dans supabase/functions/import-report/repjour.ts.
export function lireMontant(cellule: string | undefined): number | null {
  // Le signe \u20AC est retir\u00E9 lui aussi : \u00AB 7500.20 \u20AC \u00BB valait 7500,20 avec
  // l'ancien parseFloat, le refuser le ram\u00E8nerait \u00E0 0 en silence.
  const s = (cellule ?? '').replace(/[\s\u00A0\u202F\u20AC]/g, '')
  let norme: string | null = null
  if (/^[+-]?\d+([.,]\d+)?$/.test(s)) norme = s.replace(',', '.')
  else if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))
    norme = s.replace(/,/g, '')
  else if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))
    norme = s.replace(/\./g, '').replace(',', '.')
  if (norme === null) return null
  const n = Number(norme)
  return Number.isFinite(n) ? n : null
}

// Vraie date du calendrier (bissextiles compris). `Date` ne refuse jamais un
// jour hors bornes, il DÉBORDE (31 février → 3 mars) : seule la relecture des
// composantes fait la différence (même règle que `dateCalendaireUtc`, copie serveur).
function estDateCalendaire(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

export function parseForecast(
  csvText: string,
  reportMonth: number,
  reportYear: number,
): ForecastRow[] {
  return parseForecastAll(csvText).filter(
    (r) => r.month === reportMonth && r.year === reportYear,
  )
}

/**
 * Parse un Forecast sans filtre de mois — toutes les lignes sont retournées.
 * Utilisé pour l'import standalone de Forecast dans la page Analytique.
 */
export function parseForecastAll(csvText: string): ForecastRow[] {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  })

  if (!result.data || result.data.length < 2) {
    throw new Error(
      "Le fichier des prévisions est vide ou incomplet. Recommence l'export.",
    )
  }

  // Trouver la LIGNE d'en-tête (DATE + OCC + REV), OÙ QU'ELLE SOIT, et localiser les
  // colonnes PAR NOM — robuste au préambule de l'export planifié
  // « *_forecast_report_DAILY_* » comme à l'export manuel « Forecast By Date Range »,
  // et à un éventuel réordonnancement. (Les deux formats sont donc acceptés.)
  let headerIdx = -1
  for (let r = 0; r < result.data.length; r++) {
    const up = result.data[r].map((h) => (h ?? '').trim().toUpperCase())
    if (up.includes('DATE') && up.includes('OCC') && up.includes('REV')) {
      headerIdx = r
      break
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      "Ce fichier n'a pas le bon format. Vérifie que c'est bien le fichier des prévisions (Forecast By Date Range).",
    )
  }
  const up = result.data[headerIdx].map((h) => (h ?? '').trim().toUpperCase())
  const dateCol = up.indexOf('DATE')
  const occCol = up.indexOf('OCC')
  const revCol = up.indexOf('REV')

  const rows: ForecastRow[] = []
  const dates = new Set<string>()

  for (const row of result.data.slice(headerIdx + 1)) {
    const dateStr = (row[dateCol] || '').trim()
    if (dateStr.toUpperCase() === 'TOTALS' || dateStr === '') continue

    const dateParts = dateStr.split('-')
    if (dateParts.length !== 3) continue

    const day = parseInt(dateParts[0], 10)
    const month = parseInt(dateParts[1], 10)
    const year = parseInt(dateParts[2], 10)
    if (isNaN(day) || isNaN(month) || isNaN(year)) continue
    // Date impossible (31-02, 29-02 hors bissextile, mois 13) : même sort que
    // les autres dates mal formées, la ligne est écartée.
    if (!estDateCalendaire(year, month, day)) continue

    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    // Jour en double : REFUS du fichier entier. L'appelant écrit par `upsert`
    // sur la date ; Postgres refuse deux fois la même clé dans une instruction
    // (tout le lot échouerait sur une erreur générique), et garder l'une des
    // deux lignes en silence reviendrait à deviner laquelle est la bonne.
    if (dates.has(date)) {
      throw new Error(
        `Ce fichier de prévisions contient deux fois le jour ${dateStr}. Recommence l'export.`,
      )
    }
    dates.add(date)

    const occ = parseInt(row[occCol], 10) || 0
    // Montant invalide (vide, texte, Infinity, NaN) → 0, comme une cellule vide.
    const revTTC = lireMontant(row[revCol]) ?? 0
    const revHT = fromTTC(revTTC) // REV du forecast est déjà TTC

    rows.push({
      date,
      month,
      year,
      occ,
      revHT,
      revTTC,
    })
  }

  return rows
}

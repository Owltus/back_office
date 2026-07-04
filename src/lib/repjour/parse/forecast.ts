import Papa from 'papaparse';
import type { ForecastRow } from '#/lib/repjour/types.ts';

export function parseForecast(csvText: string, reportMonth: number, reportYear: number): ForecastRow[] {
  return parseForecastAll(csvText).filter(r => r.month === reportMonth && r.year === reportYear);
}

/**
 * Parse un Forecast sans filtre de mois — toutes les lignes sont retournées.
 * Utilisé pour l'import standalone de Forecast dans la page Analytique.
 */
export function parseForecastAll(csvText: string): ForecastRow[] {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  if (!result.data || result.data.length < 3) {
    throw new Error('CSV Forecast vide ou trop court');
  }

  const headers = result.data[1];
  const dateHeader = (headers[0] || '').trim().toUpperCase();
  const occHeader = (headers[3] || '').trim().toUpperCase();
  const revHeader = (headers[7] || '').trim().toUpperCase();

  if (dateHeader !== 'DATE') throw new Error(`En-tête index 0 attendu "DATE", trouvé "${headers[0]?.trim()}"`);
  if (occHeader !== 'OCC') throw new Error(`En-tête index 3 attendu "OCC", trouvé "${headers[3]?.trim()}"`);
  if (revHeader !== 'REV') throw new Error(`En-tête index 7 attendu "REV", trouvé "${headers[7]?.trim()}"`);

  const rows: ForecastRow[] = [];

  for (const row of result.data.slice(2)) {
    const dateStr = (row[0] || '').trim();
    if (dateStr.toUpperCase() === 'TOTALS' || dateStr === '') continue;

    const dateParts = dateStr.split('-');
    if (dateParts.length !== 3) continue;

    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const year = parseInt(dateParts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) continue;

    const occ = parseInt(row[3], 10) || 0;
    const revTTC = parseFloat(row[7]) || 0;
    const revHT = revTTC / (1 + 10 / 100); // REV du forecast est déjà TTC

    rows.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      month, year, occ, revHT, revTTC,
    });
  }

  return rows;
}

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
    throw new Error("Le fichier des prévisions est vide ou incomplet. Recommence l'export.");
  }

  const headers = result.data[1];
  const dateHeader = (headers[0] || '').trim().toUpperCase();
  const occHeader = (headers[3] || '').trim().toUpperCase();
  const revHeader = (headers[7] || '').trim().toUpperCase();

  if (dateHeader !== 'DATE' || occHeader !== 'OCC' || revHeader !== 'REV') {
    // Détail technique en console, message simple à l'écran.
    console.error(
      `Forecast : en-têtes inattendus "${headers[0]?.trim()}" / "${headers[3]?.trim()}" / "${headers[7]?.trim()}" (attendus DATE / OCC / REV)`,
    );
    throw new Error("Ce fichier n'a pas le bon format. Vérifie que c'est bien le fichier des prévisions (Forecast By Date Range).");
  }

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

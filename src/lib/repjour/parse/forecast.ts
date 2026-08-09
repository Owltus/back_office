import Papa from 'papaparse';
import { fromTTC } from '#/lib/repjour/constants.ts';
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

  if (!result.data || result.data.length < 2) {
    throw new Error("Le fichier des prévisions est vide ou incomplet. Recommence l'export.");
  }

  // Trouver la LIGNE d'en-tête (DATE + OCC + REV), OÙ QU'ELLE SOIT, et localiser les
  // colonnes PAR NOM — robuste au préambule de l'export planifié
  // « *_forecast_report_DAILY_* » comme à l'export manuel « Forecast By Date Range »,
  // et à un éventuel réordonnancement. (Les deux formats sont donc acceptés.)
  let headerIdx = -1;
  for (let r = 0; r < result.data.length; r++) {
    const up = result.data[r].map((h) => (h ?? '').trim().toUpperCase());
    if (up.includes('DATE') && up.includes('OCC') && up.includes('REV')) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("Ce fichier n'a pas le bon format. Vérifie que c'est bien le fichier des prévisions (Forecast By Date Range).");
  }
  const up = result.data[headerIdx].map((h) => (h ?? '').trim().toUpperCase());
  const dateCol = up.indexOf('DATE');
  const occCol = up.indexOf('OCC');
  const revCol = up.indexOf('REV');

  const rows: ForecastRow[] = [];

  for (const row of result.data.slice(headerIdx + 1)) {
    const dateStr = (row[dateCol] || '').trim();
    if (dateStr.toUpperCase() === 'TOTALS' || dateStr === '') continue;

    const dateParts = dateStr.split('-');
    if (dateParts.length !== 3) continue;

    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const year = parseInt(dateParts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) continue;

    const occ = parseInt(row[occCol], 10) || 0;
    const revTTC = parseFloat(row[revCol]) || 0;
    const revHT = fromTTC(revTTC); // REV du forecast est déjà TTC

    rows.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      month, year, occ, revHT, revTTC,
    });
  }

  return rows;
}

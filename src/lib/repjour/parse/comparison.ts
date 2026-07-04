import Papa from 'papaparse';
import { toTTC } from '#/lib/repjour/constants.ts';
import type { ComparisonData } from '#/lib/repjour/types.ts';

export function parseComparison(csvText: string): ComparisonData {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  if (!result.data || result.data.length === 0) {
    throw new Error('CSV Comparison vide ou illisible');
  }

  // Trouver les index des colonnes TODAY et MTD depuis l'en-tête
  const headerRow = result.data[0];
  let todayIndex = -1;
  let mtdIndex = -1;

  for (let i = 0; i < headerRow.length; i++) {
    const val = headerRow[i]?.trim().toUpperCase();
    if (val === 'TODAY') todayIndex = i;
    if (val === 'MTD') mtdIndex = i;
  }

  if (todayIndex === -1 || mtdIndex === -1) {
    throw new Error('Colonnes TODAY et/ou MTD introuvables dans le CSV Comparison');
  }

  // Chercher les lignes par nom de SECTION (colonne 0)
  let occExclCompToday = 0;
  let occExclCompMTD = 0;
  let totalRevenueHTToday = 0;
  let totalRevenueHTMTD = 0;
  let vatToday = 0;

  for (const row of result.data.slice(1)) {
    const section = (row[0] || '').trim();

    if (section === 'Occupied Rooms') {
      occExclCompToday = parseFloat(row[todayIndex]) || 0;
      occExclCompMTD = parseFloat(row[mtdIndex]) || 0;
    } else if (section === 'ROOM REVENUE') {
      totalRevenueHTToday = parseFloat(row[todayIndex]) || 0;
      totalRevenueHTMTD = parseFloat(row[mtdIndex]) || 0;
    } else if (section === 'VAT') {
      vatToday = parseFloat(row[todayIndex]) || 0;
    }
  }

  return {
    today: {
      occupiedRoomsExclComp: occExclCompToday,
      totalRevenueHT: totalRevenueHTToday,
      totalRevenueTTC: toTTC(totalRevenueHTToday),
      vat: vatToday,
    },
    mtd: {
      occupiedRoomsExclComp: occExclCompMTD,
      totalRevenueHT: totalRevenueHTMTD,
      totalRevenueTTC: toTTC(totalRevenueHTMTD),
    },
  };
}

import Papa from 'papaparse';
import { toTTC } from '#/lib/repjour/constants.ts';
import type { ComparisonData } from '#/lib/repjour/types.ts';

export function parseComparison(csvText: string): ComparisonData {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  if (!result.data || result.data.length === 0) {
    throw new Error("Le fichier des chiffres du jour est vide ou illisible. Recommence l'export.");
  }

  // Trouver la LIGNE d'en-tête (colonnes TODAY + MTD), OÙ QU'ELLE SOIT : l'export
  // manuel « Comparison By Date » a l'en-tête en 1re ligne, mais l'export planifié
  // « *_comparison_report_DAILY_* » est précédé d'un préambule (Hotel Code…). On la
  // cherche donc au lieu de supposer la 1re ligne (les deux formats sont acceptés).
  let headerIdx = -1;
  let todayIndex = -1;
  let mtdIndex = -1;

  for (let r = 0; r < result.data.length; r++) {
    const row = result.data[r];
    let t = -1;
    let m = -1;
    for (let i = 0; i < row.length; i++) {
      const val = row[i]?.trim().toUpperCase();
      if (val === 'TODAY') t = i;
      if (val === 'MTD') m = i;
    }
    if (t !== -1 && m !== -1) {
      headerIdx = r;
      todayIndex = t;
      mtdIndex = m;
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error("Ce fichier n'a pas le bon format. Vérifie que c'est bien le fichier des chiffres du jour (Comparison By Date).");
  }

  // Chercher les lignes par nom de SECTION (colonne 0)
  let occExclCompToday = 0;
  let occExclCompMTD = 0;
  let totalRevenueHTToday = 0;
  let totalRevenueHTMTD = 0;
  let vatToday = 0;

  for (const row of result.data.slice(headerIdx + 1)) {
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

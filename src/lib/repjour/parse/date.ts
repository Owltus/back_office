import type { ReportDate } from '#/lib/repjour/types.ts';

/**
 * Extrait la date du rapport depuis le nom du fichier CSV Comparison.
 * Format attendu : Comparison_By_Date_YYYYMMDD*.csv
 *
 * IMPORTANT : La date dans le nom du fichier est la date d'EXPORT (aujourd'hui).
 * Les données à l'intérieur couvrent la VEILLE (J-1).
 * On soustrait donc 1 jour pour obtenir la date réelle du rapport.
 */
export function extractReportDate(filename?: string): ReportDate {
  let date: Date | null = null;

  if (filename) {
    const match = filename.match(/(\d{4})(\d{2})(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      date = new Date(year, month - 1, day);
      date.setDate(date.getDate() - 1); // J-1 : les données sont de la veille
    }
  }

  // Fallback : hier
  if (!date || isNaN(date.getTime())) {
    date = new Date();
    date.setDate(date.getDate() - 1);
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const dayOfMonth = date.getDate();
  const daysInMonth = new Date(year, month, 0).getDate();

  return {
    date,
    dayOfMonth,
    month,
    year,
    daysInMonth,
  };
}

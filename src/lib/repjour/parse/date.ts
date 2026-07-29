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
  const match = filename?.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) {
    // Avant : on retombait EN SILENCE sur hier, si bien qu'un fichier mal nommé
    // rangeait le rapport à une fausse date. On refuse désormais clairement.
    throw new Error(
      "Impossible de lire la date dans le nom du fichier. Garde le nom d'origine donné par ton logiciel, il contient la date.",
    );
  }

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1); // J-1 : les données sont de la veille

  if (isNaN(date.getTime())) {
    throw new Error(
      "La date lue dans le nom du fichier n'est pas valide. Vérifie que c'est bien le fichier du jour.",
    );
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

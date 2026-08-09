/**
 * Détecte le type de fichier CSV par son nom, puis par son contenu.
 */
export function detectFileType(
  filename: string,
  content?: string
): 'comparison' | 'forecast' | null {
  const lower = filename.toLowerCase();

  // Détection par nom — LARGE : couvre les exports manuels (« Comparison By Date »,
  // « Forecast By Date Range ») ET les exports planifiés (« *_comparison_report_DAILY_* »,
  // « *_forecast_report_DAILY_* »). Les deux mots-clés sont mutuellement exclusifs.
  if (lower.includes('comparison')) return 'comparison';
  if (lower.includes('forecast')) return 'forecast';

  // Fallback : détection par contenu
  if (content) {
    // Le CSV Comparison contient "Occupied Rooms" dans les premières lignes
    if (content.includes('Occupied Rooms')) return 'comparison';
    // Le CSV Forecast contient "FORECAST" — mais pas forcément sur la 1re ligne
    // (ligne 2-3 dans l'export planifié) : on inspecte les premières lignes.
    if (content.slice(0, 2000).toUpperCase().includes('FORECAST')) return 'forecast';
  }

  return null;
}

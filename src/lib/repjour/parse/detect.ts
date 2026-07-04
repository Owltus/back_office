/**
 * Détecte le type de fichier CSV par son nom, puis par son contenu.
 */
export function detectFileType(
  filename: string,
  content?: string
): 'comparison' | 'forecast' | null {
  const lower = filename.toLowerCase();

  // Détection par nom
  if (lower.includes('comparison_by_date') || lower.includes('comparison by date')) {
    return 'comparison';
  }
  if (lower.includes('forecast_by_date_range') || lower.includes('forecast by date range')) {
    return 'forecast';
  }

  // Fallback : détection par contenu
  if (content) {
    // Le CSV Comparison contient "Occupied Rooms" dans les premières lignes
    if (content.includes('Occupied Rooms')) return 'comparison';
    // Le CSV Forecast contient "FORECAST" dans la première ligne
    if (content.split('\n')[0]?.includes('FORECAST')) return 'forecast';
  }

  return null;
}

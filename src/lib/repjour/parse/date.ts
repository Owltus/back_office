import type { ReportDate } from '#/lib/repjour/types.ts';

/**
 * Vraie date du calendrier, ou `null`.
 *
 * Indispensable parce que le constructeur `Date` de JavaScript ne REFUSE jamais
 * un jour ou un mois hors bornes : il DÉBORDE. Le 30 février devient le 2 mars,
 * le mois 13 devient janvier de l'année suivante — sans la moindre erreur. Un
 * contrôle du genre `isNaN(date.getTime())` ne se déclenche donc jamais sur ces
 * entrées-là : il ne protège que d'un `NaN` en composante, ce qui n'arrive pas
 * quand les chiffres viennent d'une expression régulière.
 *
 * Seule la RELECTURE des trois composantes après construction fait la
 * différence entre une date qui existe et une date qui a débordé.
 */
function dateCalendaire(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

/**
 * Extrait la date du rapport depuis le nom du fichier CSV Comparison.
 * Format attendu : Comparison_By_Date_YYYYMMDD*.csv
 *
 * IMPORTANT : La date dans le nom du fichier est la date d'EXPORT (aujourd'hui).
 * Les données à l'intérieur couvrent la VEILLE (J-1).
 * On soustrait donc 1 jour pour obtenir la date réelle du rapport.
 *
 * On PARCOURT tous les groupes de huit chiffres du nom, et on retient le premier
 * qui forme une vraie date. Un nom qui porte un identifiant numérique avant la
 * date (`Comparison_12345678_20260714.csv`) n'est donc plus lu de travers :
 * `12345678` se découpe en mois 56 / jour 78, n'existe pas, et la recherche
 * continue jusqu'à la vraie date. Un nom horodaté (`..._202607141200.csv`)
 * continue de fonctionner : le premier groupe de huit chiffres y est déjà la
 * bonne date.
 *
 * Limite assumée : si DEUX groupes forment chacun une date valide, c'est le
 * premier qui gagne — comme avant. Refuser serait plus sûr mais casserait des
 * noms légitimes qu'on ne connaît pas.
 */
export function extractReportDate(filename?: string): ReportDate {
  let date: Date | null = null;
  // Expression locale, jamais partagée : une regex globale garde un curseur
  // interne entre deux appels si on la hisse au niveau du module.
  for (const groupe of (filename ?? '').matchAll(/(\d{4})(\d{2})(\d{2})/g)) {
    const candidate = dateCalendaire(
      parseInt(groupe[1], 10),
      parseInt(groupe[2], 10),
      parseInt(groupe[3], 10),
    );
    if (candidate) {
      date = candidate;
      break;
    }
  }

  if (!date) {
    // Avant : on retombait EN SILENCE sur hier, si bien qu'un fichier mal nommé
    // rangeait le rapport à une fausse date. On refuse désormais clairement.
    throw new Error(
      "Impossible de lire la date dans le nom du fichier. Garde le nom d'origine donné par ton logiciel, il contient la date.",
    );
  }

  date.setDate(date.getDate() - 1); // J-1 : les données sont de la veille

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

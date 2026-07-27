import { TOTAL_ROOMS } from '#/lib/repjour/constants.ts';
import type { Alert, ForecastDay, ForecastRow, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/*
 * Messages de validation forecast — VOLONTAIREMENT sans chiffres et CONSTANTS
 * (identiques d'un mois à l'autre) : `preValidateForecast` les dédoublonne, si
 * bien qu'un même souci sur plusieurs mois ne donne QU'UN message. Phrases
 * simples, tutoiement, on dit juste ce qui cloche et quoi faire.
 */
const MSG = {
  empty:
    'Ce mois est vide dans le fichier. Vérifie que tu as exporté la bonne période.',
  incomplete:
    "Il manque des jours dans le fichier. Si le mois n'est pas terminé c'est normal, sinon réexporte le mois complet.",
  impossible:
    'Le fichier contient des valeurs impossibles (du revenu sans chambre vendue, ou des valeurs négatives). Il a mal été exporté, reprends-le depuis le PMS.',
  adrWeird:
    "Le prix par chambre a l'air anormal. Vérifie que c'est le bon fichier.",
  tvaMissing:
    "Le fichier ne contient sûrement pas la TVA (les revenus sont trop bas). Dans le PMS, coche l'option Select All avant d'exporter, puis réimporte.",
  tvaHigh:
    "Les revenus sont plus hauts que d'habitude : soit la TVA est comptée deux fois, soit ce fichier corrige un ancien import fait sans TVA. Si tu corriges, tu peux importer ; sinon vérifie tes options d'export.",
} as const

/**
 * Valide les données forecast d'UN mois avant import. Retourne des alertes
 * (error = bloquant, warning = informatif), au plus UNE par souci et sans chiffre.
 */
export function validateForecast(
  rows: ForecastRow[],
  budget: MonthBudget | null,
  daysInMonth: number,
  existingDays?: ForecastDay[] | null
): Alert[] {
  const alerts: Alert[] = [];

  if (rows.length === 0) {
    alerts.push({ type: 'error', message: MSG.empty });
    return alerts;
  }

  // Jours manquants
  if (rows.length < daysInMonth) {
    alerts.push({ type: 'warning', message: MSG.incomplete });
  }

  // UNE seule alerte si au moins une ligne est impossible (valeur négative, ou
  // revenu sans occupation) — pas une par jour. Occ > TOTAL_ROOMS = overbooking,
  // valide, pas d'alerte.
  const hasImpossible = rows.some(
    (r) => r.occ < 0 || r.revTTC < 0 || (r.occ === 0 && r.revTTC > 0),
  );
  if (hasImpossible) {
    alerts.push({ type: 'error', message: MSG.impossible });
  }

  // ADR moyen sur le mois
  const totalOcc = rows.reduce((s, r) => s + r.occ, 0);
  const totalRev = rows.reduce((s, r) => s + r.revTTC, 0);
  const avgADR = totalOcc > 0 ? totalRev / totalOcc : 0;

  if (avgADR > 0 && (avgADR < 30 || avgADR > 300)) {
    alerts.push({ type: 'warning', message: MSG.adrWeird });
  }

  // Signaux TVA : « manque la TVA » (revenus trop bas) vs « TVA trop haute » (deux
  // fois, ou correction d'un ancien import HT). Deux détecteurs, MÊME message. Le 4e
  // argument porte l'ÉTAT de l'historique du mois, en TROIS cas :
  //   • absent (null/undefined) = historique INCONNU (lecture échouée) → on ne tente
  //     RIEN, surtout pas le secours budget qui rejouerait un faux positif ;
  //   • tableau VIDE = 1er import CONFIRMÉ du mois → secours budget (un objectif,
  //     pas une vérité, mais faute de mieux au tout premier import) ;
  //   • tableau NON vide = déjà importé → comparaison à l'import précédent, précise
  //     et SILENCIEUSE au réimport du même fichier (ratio ~1) → jamais de nag.
  let tvaMissing = false;
  let tvaHigh = false;

  if (!existingDays) {
    // Historique inconnu (lecture en échec, ou non fournie) → aucune détection TVA.
  } else if (existingDays.length > 0) {
    // Comparaison à l'import précédent (mêmes jours, même occupation). Il faut au
    // moins 5 jours comparables pour que la médiane soit fiable ; en dessous, on ne
    // signale rien (et on ne retombe PAS sur le budget — pas de nag).
    const existingMap = new Map<string, ForecastDay>();
    for (const day of existingDays) {
      existingMap.set(day.date, day);
    }

    const ratios: number[] = [];
    for (const row of rows) {
      if (row.occ <= 0) continue;
      const existing = existingMap.get(row.date);
      if (!existing || existing.occ !== row.occ || existing.rev_ttc <= 0) continue;
      ratios.push(row.revTTC / existing.rev_ttc);
    }

    if (ratios.length >= 5) {
      const med = median(ratios);
      const sd = stddev(ratios);
      if (med > 1.08 && med < 1.12 && sd < 0.02) tvaHigh = true;
      if (med > 0.89 && med < 0.93 && sd < 0.02) tvaMissing = true;
    }
  } else if (budget && budget.prix_moyen > 0 && avgADR > 0) {
    // Tableau vide = 1er import confirmé du mois → secours budget.
    const ratio = avgADR / budget.prix_moyen;
    if (ratio > 0.88 && ratio < 0.93) tvaMissing = true;
    if (ratio > 1.07 && ratio < 1.13) tvaHigh = true;
  }

  if (tvaMissing) alerts.push({ type: 'warning', message: MSG.tvaMissing });
  if (tvaHigh) alerts.push({ type: 'warning', message: MSG.tvaHigh });

  return alerts;
}

export function validateCoherence(realiseJour: KPIBlock): Alert[] {
  const alerts: Alert[] = [];

  if (realiseJour.nuitees > TOTAL_ROOMS) {
    alerts.push({ type: 'error', message: `Nuitées jour (${realiseJour.nuitees}) > ${TOTAL_ROOMS} chambres` });
  }
  if (realiseJour.to > 100) {
    alerts.push({ type: 'error', message: `TO jour (${realiseJour.to.toFixed(1)}%) > 100%` });
  }
  if (realiseJour.nuitees > 0 && realiseJour.roomRevenue === 0) {
    alerts.push({ type: 'error', message: 'Chambres vendues sans revenu' });
  }
  if (realiseJour.nuitees === 0 && realiseJour.roomRevenue > 0) {
    alerts.push({ type: 'error', message: 'Revenu sans chambres vendues' });
  }

  // Vérification croisée PM × Nuitées ≈ Room Revenue
  if (realiseJour.nuitees > 0) {
    const expectedRevenue = realiseJour.pm * realiseJour.nuitees;
    if (Math.abs(realiseJour.roomRevenue - expectedRevenue) > 1) {
      alerts.push({ type: 'warning', message: 'Écart PM × Nuitées vs Room Revenue' });
    }
  }

  return alerts;
}

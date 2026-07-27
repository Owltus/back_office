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

/**
 * Valide les données forecast avant import.
 * Retourne des alertes (error = bloquant, warning = informatif).
 */
export function validateForecast(
  rows: ForecastRow[],
  budget: MonthBudget | null,
  daysInMonth: number,
  existingDays?: ForecastDay[] | null
): Alert[] {
  const alerts: Alert[] = [];

  if (rows.length === 0) {
    alerts.push({ type: 'error', message: 'Ce mois est vide dans le fichier (aucune prévision dedans). Vérifie que tu as exporté la bonne période.' });
    return alerts;
  }

  // Jours manquants
  if (rows.length < daysInMonth) {
    alerts.push({ type: 'warning', message: `Il manque des jours : le fichier ne couvre que ${rows.length} jours sur ${daysInMonth}. Si c'est normal (mois en cours), tu peux continuer. Sinon, réexporte le mois complet.` });
  }

  // Vérifications par jour
  for (const row of rows) {
    // Occupation > TOTAL_ROOMS = overbooking (over), données valides, pas d'alerte
    if (row.occ < 0 || row.revTTC < 0) {
      alerts.push({ type: 'error', message: `Le ${row.date}, une valeur est négative (occupation ou revenu). C'est impossible dans un vrai rapport : le fichier a mal été exporté, reprends-le depuis le PMS.` });
    }
    if (row.occ === 0 && row.revTTC > 0) {
      alerts.push({ type: 'error', message: `Le ${row.date}, il y a du revenu (${row.revTTC.toFixed(2)} €) mais aucune chambre vendue. C'est incohérent : vérifie ce fichier avant de l'importer.` });
    }
  }

  // ADR moyen sur le mois
  const totalOcc = rows.reduce((s, r) => s + r.occ, 0);
  const totalRev = rows.reduce((s, r) => s + r.revTTC, 0);
  const avgADR = totalOcc > 0 ? totalRev / totalOcc : 0;

  if (avgADR > 0 && avgADR < 30) {
    alerts.push({ type: 'warning', message: `Le prix moyen par chambre du mois est très bas (${avgADR.toFixed(2)} €). Vérifie que c'est le bon fichier (bon hôtel, bonne période).` });
  }
  if (avgADR > 300) {
    alerts.push({ type: 'warning', message: `Le prix moyen par chambre du mois est très élevé (${avgADR.toFixed(2)} €). Vérifie que c'est le bon fichier.` });
  }

  // Détection TTC/HT par croisement avec le budget
  if (budget && budget.prix_moyen > 0 && avgADR > 0) {
    const ratio = avgADR / budget.prix_moyen;
    if (ratio > 0.88 && ratio < 0.93) {
      alerts.push({
        type: 'warning',
        message: `Ton prix moyen par chambre (${avgADR.toFixed(2)} €) tombe pile 10% sous ton budget (${budget.prix_moyen.toFixed(2)} €). Presque toujours, ça veut dire que le fichier a été sorti sans la TVA. Pour corriger : dans le PMS, coche "Select All" avant d'exporter, puis réimporte.`,
      });
    }
    if (ratio > 1.07 && ratio < 1.13) {
      alerts.push({
        type: 'warning',
        message: `Ton prix moyen par chambre (${avgADR.toFixed(2)} €) dépasse ton budget (${budget.prix_moyen.toFixed(2)} €) de pile 10%. Souvent, c'est que la TVA a été comptée deux fois à l'export. Vérifie les options du rapport dans le PMS avant de réimporter.`,
      });
    }
  }

  // Détection TTC/HT par comparaison avec l'import précédent
  if (existingDays && existingDays.length > 0) {
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

      if (med > 1.08 && med < 1.12 && sd < 0.02) {
        alerts.push({
          type: 'warning',
          message: `Les revenus de ce fichier sont pile 10% plus hauts que ton dernier import (sur ${ratios.length} jours, même occupation). Deux cas : soit c'est le bon fichier (avec la TVA) qui remplace un ancien import fait sans TVA, et tu peux importer. Soit il compte la TVA en trop. Pour trancher, regarde s'il colle à ton budget.`,
        });
      }
      if (med > 0.89 && med < 0.93 && sd < 0.02) {
        alerts.push({
          type: 'warning',
          message: `Les revenus de ce fichier sont pile 10% plus bas que ton dernier import (sur ${ratios.length} jours, même occupation). Ce fichier a sûrement été sorti sans la TVA. Reprends l'export dans le PMS avec "Select All" coché, puis réimporte.`,
        });
      }
    }
  }

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

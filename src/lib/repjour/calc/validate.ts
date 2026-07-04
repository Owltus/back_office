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
    alerts.push({ type: 'error', message: 'Aucune donnée forecast pour ce mois' });
    return alerts;
  }

  // Jours manquants
  if (rows.length < daysInMonth) {
    alerts.push({ type: 'warning', message: `Forecast incomplet : ${rows.length}/${daysInMonth} jours` });
  }

  // Vérifications par jour
  for (const row of rows) {
    // Occupation > TOTAL_ROOMS = overbooking (over), données valides, pas d'alerte
    if (row.occ < 0 || row.revTTC < 0) {
      alerts.push({ type: 'error', message: `${row.date} : valeurs négatives détectées` });
    }
    if (row.occ === 0 && row.revTTC > 0) {
      alerts.push({ type: 'error', message: `${row.date} : revenu (${row.revTTC.toFixed(2)} €) sans occupation` });
    }
  }

  // ADR moyen sur le mois
  const totalOcc = rows.reduce((s, r) => s + r.occ, 0);
  const totalRev = rows.reduce((s, r) => s + r.revTTC, 0);
  const avgADR = totalOcc > 0 ? totalRev / totalOcc : 0;

  if (avgADR > 0 && avgADR < 30) {
    alerts.push({ type: 'warning', message: `ADR moyen forecast anormalement bas (${avgADR.toFixed(2)} €)` });
  }
  if (avgADR > 300) {
    alerts.push({ type: 'warning', message: `ADR moyen forecast anormalement élevé (${avgADR.toFixed(2)} €)` });
  }

  // Détection TTC/HT par croisement avec le budget
  if (budget && budget.prix_moyen > 0 && avgADR > 0) {
    const ratio = avgADR / budget.prix_moyen;
    if (ratio > 0.88 && ratio < 0.93) {
      alerts.push({
        type: 'warning',
        message: `L'ADR moyen du forecast (${avgADR.toFixed(2)} €) est 10% en dessous du budget (${budget.prix_moyen.toFixed(2)} €). C'est le signe que le fichier ne contient pas la TVA. Vérifiez que "Select All" est coché dans le PMS avant d'exporter.`,
      });
    }
    if (ratio > 1.07 && ratio < 1.13) {
      alerts.push({
        type: 'warning',
        message: `L'ADR moyen du forecast (${avgADR.toFixed(2)} €) est 10% au-dessus du budget (${budget.prix_moyen.toFixed(2)} €). Le fichier semble inclure la TVA deux fois. Vérifiez les options d'export dans le PMS.`,
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
          message: `Les revenus de ce fichier sont exactement 10% plus élevés que le précédent import (sur ${ratios.length} jours, même occupation). C'est le signe d'un problème de TVA. Avant d'exporter le Forecast dans le PMS, vérifiez que l'option "Select All" est bien cochée dans les paramètres du rapport.`,
        });
      }
      if (med > 0.89 && med < 0.93 && sd < 0.02) {
        alerts.push({
          type: 'warning',
          message: `Les revenus de ce fichier sont exactement 10% plus bas que le précédent import (sur ${ratios.length} jours, même occupation). C'est le signe d'un problème de TVA. Avant d'exporter le Forecast dans le PMS, vérifiez que l'option "Select All" est bien cochée dans les paramètres du rapport.`,
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

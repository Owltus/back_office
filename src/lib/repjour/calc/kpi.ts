import { TOTAL_ROOMS } from '#/lib/repjour/constants.ts';
import type { ComparisonData, DailyReport, ForecastRow, KPIBlock } from '#/lib/repjour/types.ts';

export function reportToKPI(r: DailyReport, prefix: 'rj' | 'rmtd' | 'pm'): KPIBlock {
  return {
    nuitees: r[`${prefix}_nuitees`],
    to: r[`${prefix}_to`],
    pm: r[`${prefix}_pm`],
    revpar: r[`${prefix}_revpar`],
    roomRevenue: r[`${prefix}_room_revenue`],
  };
}

export function computeRealiseJour(comparison: ComparisonData): KPIBlock {
  const nuitees = comparison.today.occupiedRoomsExclComp;
  const roomRevenue = comparison.today.totalRevenueTTC;
  return {
    nuitees,
    roomRevenue,
    to: (nuitees / TOTAL_ROOMS) * 100,
    pm: nuitees > 0 ? roomRevenue / nuitees : 0,
    revpar: roomRevenue / TOTAL_ROOMS,
  };
}

export function computeRealiseMTD(
  comparison: ComparisonData,
  dayOfMonth: number
): KPIBlock {
  const nuitees = comparison.mtd.occupiedRoomsExclComp;
  const roomRevenue = comparison.mtd.totalRevenueTTC;
  return {
    nuitees,
    roomRevenue,
    to: dayOfMonth > 0 ? (nuitees / (TOTAL_ROOMS * dayOfMonth)) * 100 : 0,
    pm: nuitees > 0 ? roomRevenue / nuitees : 0,
    revpar: dayOfMonth > 0 ? roomRevenue / (TOTAL_ROOMS * dayOfMonth) : 0,
  };
}

export function computeProjeteMois(
  forecastRows: ForecastRow[],
  daysInMonth: number
): KPIBlock {
  const totalOCC = forecastRows.reduce((sum, r) => sum + r.occ, 0);
  const totalRevTTC = forecastRows.reduce((sum, r) => sum + r.revTTC, 0);
  return {
    nuitees: totalOCC,
    roomRevenue: totalRevTTC,
    to: daysInMonth > 0 ? (totalOCC / (TOTAL_ROOMS * daysInMonth)) * 100 : 0,
    pm: totalOCC > 0 ? totalRevTTC / totalOCC : 0,
    revpar: daysInMonth > 0 ? totalRevTTC / (TOTAL_ROOMS * daysInMonth) : 0,
  };
}

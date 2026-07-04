import type { Ecart, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts';

export function computeEcart(projete: KPIBlock, budget: MonthBudget): Ecart {
  return {
    nuitees: projete.nuitees - budget.nuitees,
    to: projete.to - budget.taux_occupation,
    pm: projete.pm - budget.prix_moyen,
    revpar: projete.revpar - budget.revpar,
    roomRevenue: projete.roomRevenue - budget.room_revenue,
  };
}

/** Écart évolutif : cumul réalisé (MTD) vs budget prorata au jour */
export function computeEcartMTD(
  realiseMTD: KPIBlock,
  budget: MonthBudget,
  dayOfMonth: number,
  daysInMonth: number
): Ecart {
  const ratio = daysInMonth > 0 ? dayOfMonth / daysInMonth : 0;
  return {
    nuitees: realiseMTD.nuitees - budget.nuitees * ratio,
    to: realiseMTD.to - budget.taux_occupation,
    pm: realiseMTD.pm - budget.prix_moyen,
    revpar: realiseMTD.revpar - budget.revpar * ratio,
    roomRevenue: realiseMTD.roomRevenue - budget.room_revenue * ratio,
  };
}

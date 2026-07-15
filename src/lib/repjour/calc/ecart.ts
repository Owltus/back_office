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

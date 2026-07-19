import { useQueryClient } from '@tanstack/react-query'

import {
  deleteBudgetLine,
  upsertBudgetLine,
} from '#/lib/facturation/cloudService.ts'
import type { BudgetLine } from '#/lib/facturation/types.ts'

/*
 * Mutations du référentiel des imputations (table facturation_budget_lines) via RPC
 * SECURITY DEFINER (garde de rôle serveur), suivies d'une invalidation du cache
 * ['facturation','budgetLines'] pour que toute l'app (CodePicker, galaxie, tooltips…)
 * reflète le changement. Erreurs PROPAGÉES à l'appelant (l'UI gère le feedback).
 * Admin-only côté route ; la sécurité réelle reste la garde RPC.
 */
export function useBudgetLinesCuration() {
  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['facturation', 'budgetLines'] })
  return {
    /** Crée ou met à jour une imputation (code immuable). `create:true` refuse d'écraser un
     *  code existant (garde d'unicité serveur). */
    saveLine: async (
      line: BudgetLine,
      opts?: { sort?: number; create?: boolean },
    ): Promise<void> => {
      await upsertBudgetLine(line, opts)
      await invalidate()
    },
    /** Supprime une imputation. La RPC refuse (23503) si elle est déjà utilisée. */
    removeLine: async (code: string): Promise<void> => {
      await deleteBudgetLine(code)
      await invalidate()
    },
  }
}

import { useQueryClient } from '@tanstack/react-query'

import {
  deleteBudgetLine,
  upsertBudgetLine,
} from '#/lib/facturation/cloudService.ts'
import type { BudgetLine } from '#/lib/facturation/types.ts'

/*
 * Mutations du référentiel des imputations (table facturation_ref_imputations, au COUPLE
 * code + compte) via RPC SECURITY DEFINER (garde de rôle serveur), suivies d'une invalidation
 * du cache ['facturation','budgetLines'] pour que toute l'app (CodePicker, galaxie, tooltips…)
 * reflète le changement. Erreurs PROPAGÉES à l'appelant (l'UI gère le feedback).
 * Admin-only côté route ; la sécurité réelle reste la garde RPC.
 */
export function useBudgetLinesCuration() {
  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['facturation', 'budgetLines'] })
  return {
    /** Crée ou met à jour une imputation au couple (code + compte immuables en édition).
     *  `create:true` refuse d'écraser un couple existant (garde d'unicité serveur). */
    saveLine: async (
      line: BudgetLine,
      opts?: { sort?: number; create?: boolean },
    ): Promise<void> => {
      await upsertBudgetLine(line, opts)
      await invalidate()
    },
    /** Supprime une imputation (couple code + compte). La RPC refuse (23503) si c'est le
     *  dernier compte d'un code encore utilisé. */
    removeLine: async (code: string, compte: string): Promise<void> => {
      await deleteBudgetLine(code, compte)
      await invalidate()
    },
  }
}

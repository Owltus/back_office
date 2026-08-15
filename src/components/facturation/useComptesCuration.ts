import { useQueryClient } from '@tanstack/react-query'

import {
  deleteCompte,
  upsertCompte,
} from '#/lib/facturation/cloudService.ts'

/*
 * Mutations du DICTIONNAIRE des comptes (table facturation_ref_comptes : numéro → nom humain)
 * via RPC SECURITY DEFINER (garde de rôle serveur `gestion`), suivies d'une invalidation du
 * cache ['facturation','comptes'] pour que toute l'app (picker, ImputationList, historique)
 * reflète le nouveau nom. Erreurs PROPAGÉES à l'appelant (l'UI gère le feedback).
 */
export function useComptesCuration() {
  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['facturation', 'comptes'] })
  return {
    /** Crée ou renomme un compte (numéro = clé). */
    saveCompte: async (compte: string, libelle: string): Promise<void> => {
      await upsertCompte(compte, libelle)
      await invalidate()
    },
    /** Supprime un compte du dictionnaire. La RPC refuse (23503) s'il est encore référencé
     *  par une imputation du référentiel couple. */
    removeCompte: async (compte: string): Promise<void> => {
      await deleteCompte(compte)
      await invalidate()
    },
  }
}

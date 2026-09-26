import { useAuth } from '#/components/auth/AuthContext.tsx'
import { useClasseur } from '#/components/classeur/hooks/useClasseur.ts'
import { estProprietaire, peutModifierClasseur } from '#/lib/classeur/droits.ts'

/**
 * Droits de l'utilisateur sur UN classeur (modèle Affichage, voir
 * `lib/classeur/droits.ts`). Remplace `can('classeur', 'ecriture')` partout
 * où un classeur est en jeu :
 *
 *   canWrite   modifier CE classeur (gestion, ou écriture ET propriétaire) ;
 *              `false` tant que le classeur n'est pas chargé (on masque).
 *   canManage  niveau gestion sur la page.
 *   canCreate  niveau écriture sur la page (créer, importer un classeur).
 */
export function useDroitsClasseur(classeurId: number) {
  const { can, user } = useAuth()
  const classeurQ = useClasseur(classeurId)
  const niveaux = {
    ecriture: can('classeur', 'ecriture'),
    gestion: can('classeur', 'gestion'),
  }
  return {
    canWrite: peutModifierClasseur(niveaux, classeurQ.data, user?.id),
    canManage: niveaux.gestion,
    canCreate: niveaux.ecriture,
    estProprietaire: estProprietaire(classeurQ.data, user?.id),
    /** Le classeur est chargé : `canWrite` est définitif. */
    pret: !classeurQ.isPending,
  }
}

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import {
  useClasseur,
  useClasseurs,
} from '#/components/classeur/hooks/useClasseur.ts'
import {
  capacites,
  niveauEffectif,
  niveauPage,
  peutChangerAuteur,
  peutCreerClasseur,
  peutReordonnerListe,
  typesCreables,
} from '#/lib/classeur/droits.ts'
import type { Moi, NiveauEffectif } from '#/lib/classeur/droits.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { fetchPersonnesClasseur } from '#/lib/classeur/service.ts'
import { classeursCibles } from '#/lib/classeur/transfert.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'

/** Qui regarde : niveau de page, identifiant, admin (`lib/classeur/droits.ts`). */
export function useMoiClasseur(): Moi {
  const { can, user, role } = useAuth()
  const page = niveauPage(can)
  const userId = user?.id ?? null
  const admin = role === 'admin'
  return useMemo(() => ({ page, userId, admin }), [page, userId, admin])
}

/** Niveau de l'utilisateur sur la PAGE Classeur, et ce qu'il permet. */
export function useDroitsPageClasseur() {
  const moi = useMoiClasseur()
  return {
    page: moi.page,
    moi,
    canCreate: peutCreerClasseur(moi.page),
    /** Types qu'il peut donner à un classeur qu'il crée. */
    typesCreables: typesCreables(moi),
    canReorderList: peutReordonnerListe(moi.page),
    canManage: moi.page === 'gestion',
  }
}

/**
 * Les personnes de la page (auteurs possibles et noms des auteurs). Jamais
 * écrites sur disque (`PREFIXES_SENSIBLES`). `actif` : lue seulement quand
 * elle sert.
 */
export function usePersonnesClasseur(actif = true) {
  const { page } = useMoiClasseur()
  return useQuery({
    queryKey: classeurKeys.personnes(),
    queryFn: fetchPersonnesClasseur,
    enabled: actif && page !== null,
    staleTime: 5 * 60_000,
  })
}

/**
 * Droits de l'utilisateur sur UN classeur — miroir de la base
 * (`lib/classeur/droits.ts`). Tout est `false` tant que le classeur n'est
 * pas chargé : on masque, jamais l'inverse.
 *
 *   canWrite   modifier le contenu (écriture effective ou gestion) ;
 *   canManage  gérer : suppression, restauration, purge ;
 *   canCreate  créer, importer un classeur (écriture sur la page).
 */
export function useDroitsClasseur(classeurId: number) {
  const moi = useMoiClasseur()
  const pagesDroits = useDroitsPageClasseur()
  const classeurQ = useClasseur(classeurId)
  const pret = !classeurQ.isPending
  const niveau = pret ? niveauEffectif(moi, classeurQ.data) : 'aucun'
  const cap = capacites(niveau)
  return {
    niveau,
    ...cap,
    canWrite: cap.modifier,
    canManage: cap.supprimerClasseur,
    canCreate: pagesDroits.canCreate,
    /** Changer l'auteur ou le type (auteur et gestion). */
    canRanger:
      pret && classeurQ.data != null && peutChangerAuteur(moi, classeurQ.data),
    estCreateur:
      moi.userId != null && classeurQ.data?.created_by === moi.userId,
    /** Le classeur est chargé : les droits sont définitifs. */
    pret,
  }
}

/**
 * Les classeurs vers lesquels transférer depuis `origineId` (étape 7c) :
 * filtrés par `classeursCibles` (écriture effective, jamais l'origine, jamais
 * un classeur supprimé). La liste n'est lue que si `actif` (menu ou dialogue
 * ouvert : base Nano). `niveauDe` donne le niveau effectif d'une cible, à
 * transmettre au service (D6 : écriture des deux côtés).
 */
export function useClasseursCibles(origineId: number, actif: boolean) {
  const moi = useMoiClasseur()
  const liste = useClasseurs(actif)
  const pret = !liste.isPending
  const cibles = useMemo(
    () =>
      pret ? classeursCibles(liste.data ?? [], moi, origineId, 'deplacer') : [],
    [pret, liste.data, moi, origineId],
  )
  const niveauDe = (classeur: DbClasseur): NiveauEffectif =>
    niveauEffectif(moi, classeur)
  return {
    cibles,
    niveauDe,
    isPending: !pret,
    isError: liste.isError,
    error: liste.error,
  }
}

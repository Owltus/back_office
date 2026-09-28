import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { useClasseur } from '#/components/classeur/hooks/useClasseur.ts'
import {
  capacites,
  niveauEffectif,
  niveauPage,
  peutCreerClasseur,
  peutCreerPrive,
  peutReordonnerListe,
} from '#/lib/classeur/droits.ts'
import type { NiveauClasseur } from '#/lib/classeur/droits.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { fetchMesAcces } from '#/lib/classeur/service.ts'

/**
 * Mes exceptions d'accès, par classeur (2026-09-28). Propres au compte : la
 * clé porte l'identifiant, et elle n'est jamais écrite sur disque.
 */
export function useMesAcces() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const q = useQuery({
    queryKey: classeurKeys.mesAcces(userId ?? ''),
    queryFn: () => fetchMesAcces(userId ?? ''),
    enabled: userId !== null,
    staleTime: 60_000,
  })
  const parClasseur = useMemo(() => {
    const m = new Map<number, NiveauClasseur>()
    for (const a of q.data ?? []) m.set(a.classeur_id, a.niveau)
    return m
  }, [q.data])
  return { parClasseur, isPending: q.isPending && userId !== null }
}

/** Niveau de l'utilisateur sur la PAGE Classeur, et ce qu'il permet. */
export function useDroitsPageClasseur() {
  const { can } = useAuth()
  const page = niveauPage(can)
  return {
    page,
    canCreate: peutCreerClasseur(page),
    canCreatePrive: peutCreerPrive(page),
    canReorderList: peutReordonnerListe(page),
    canManage: page === 'gestion',
  }
}

/**
 * Droits de l'utilisateur sur UN classeur — miroir de la base
 * (`lib/classeur/droits.ts`). Tout est `false` tant que le classeur et mes
 * accès ne sont pas chargés : on masque, jamais l'inverse.
 *
 *   canWrite   modifier le contenu (écriture effective ou gestion) ;
 *   canManage  gestion : accès, suppression, restauration, purge ;
 *   canCreate  créer, importer un classeur (écriture sur la page).
 */
export function useDroitsClasseur(classeurId: number) {
  const { user } = useAuth()
  const pagesDroits = useDroitsPageClasseur()
  const classeurQ = useClasseur(classeurId)
  const mesAcces = useMesAcces()
  const pret = !classeurQ.isPending && !mesAcces.isPending
  const niveau = pret
    ? niveauEffectif(
        pagesDroits.page,
        classeurQ.data,
        mesAcces.parClasseur.get(classeurId) ?? null,
        user?.id,
      )
    : 'aucun'
  const cap = capacites(niveau)
  return {
    niveau,
    ...cap,
    canWrite: cap.modifier,
    canManage: cap.gererAcces,
    canCreate: pagesDroits.canCreate,
    estCreateur: user?.id != null && classeurQ.data?.created_by === user.id,
    /** Le classeur et mes accès sont chargés : les droits sont définitifs. */
    pret,
  }
}

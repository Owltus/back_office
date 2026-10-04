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
  peutCreerClasseur,
  peutCreerPrive,
  peutReordonnerListe,
} from '#/lib/classeur/droits.ts'
import type { NiveauClasseur, NiveauEffectif } from '#/lib/classeur/droits.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { fetchMesAcces } from '#/lib/classeur/service.ts'
import { classeursCibles } from '#/lib/classeur/transfert.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'

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

/**
 * Les classeurs vers lesquels transférer depuis `origineId` (étape 7c) :
 * filtrés par `classeursCibles` (écriture effective, jamais l'origine, jamais
 * un classeur supprimé ni « Privé » inaccessible). La liste n'est lue que si
 * `actif` (menu ou dialogue ouvert : base Nano). `niveauDe` donne le niveau
 * effectif d'une cible, à transmettre au service (D6 : écriture des deux
 * côtés).
 */
export function useClasseursCibles(origineId: number, actif: boolean) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { page } = useDroitsPageClasseur()
  const liste = useClasseurs(actif)
  const mesAcces = useMesAcces()
  const pret = !liste.isPending && !mesAcces.isPending
  const cibles = useMemo(
    () =>
      pret
        ? classeursCibles(
            liste.data ?? [],
            { page, exceptions: mesAcces.parClasseur, userId },
            origineId,
            'deplacer',
          )
        : [],
    [pret, liste.data, page, mesAcces.parClasseur, userId, origineId],
  )
  const niveauDe = (classeur: DbClasseur): NiveauEffectif =>
    niveauEffectif(
      page,
      classeur,
      mesAcces.parClasseur.get(classeur.id) ?? null,
      userId,
    )
  return {
    cibles,
    niveauDe,
    isPending: !pret,
    isError: liste.isError,
    error: liste.error,
  }
}

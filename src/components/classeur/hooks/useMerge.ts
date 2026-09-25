import { useMutation, useQuery } from '@tanstack/react-query'

import { useInvaliderClasseur } from '#/components/classeur/hooks/useClasseur.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import {
  appliquerFusion,
  importerCommeNouveauClasseur,
} from '#/lib/classeur/merge/apply.ts'
import {
  restaurerInstantane,
  supprimerEntreeHistorique,
} from '#/lib/classeur/merge/history.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import { creerPoint } from '#/lib/classeur/restauration.ts'
import { fetchMergeHistory } from '#/lib/classeur/service.ts'

/*
 * Lectures et mutations TanStack Query de l'import / fusion / historique
 * (étape 6 du plan `page-classeur`). Même discipline que `useClasseur.ts` :
 * `staleTime` 60 s répété au site d'appel, invalidation de `classeurKeys.all`
 * après toute mutation — en `onSettled`, pas `onSuccess` : une fusion sans
 * transaction qui échoue au milieu a DÉJÀ écrit, le cache doit le refléter.
 */

const STALE_60S = 60_000

/** Entrées d'historique d'un classeur (sans les instantanés), plus récente en tête. */
export function useMergeHistory(classeurId: number) {
  return useQuery({
    queryKey: classeurKeys.mergeHistory(classeurId),
    queryFn: () => fetchMergeHistory(classeurId),
    staleTime: STALE_60S,
    enabled: Number.isInteger(classeurId),
  })
}

export interface FusionArgs {
  classeurId: number
  fichier: ClasseurJson
  replace: boolean
  sourceName: string
}

/** Fusionne un fichier déjà lu et validé dans un classeur existant. */
export function useAppliquerFusion() {
  const invalider = useInvaliderClasseur()
  return useMutation({
    mutationFn: ({ classeurId, fichier, replace, sourceName }: FusionArgs) =>
      appliquerFusion(classeurId, fichier, { replace, sourceName }),
    onSettled: () => invalider(),
  })
}

/** Restaure l'instantané d'une entrée ; `data === null` = déjà à jour. */
export function useRestaurerInstantane() {
  const invalider = useInvaliderClasseur()
  return useMutation({
    mutationFn: (entryId: number) => restaurerInstantane(entryId),
    onSettled: () => invalider(),
  })
}

/** Supprime une entrée d'historique (gestion seule : 42501 sinon). */
export function useSupprimerEntree() {
  const invalider = useInvaliderClasseur()
  return useMutation({
    mutationFn: (entryId: number) => supprimerEntreeHistorique(entryId),
    onSettled: () => invalider(),
  })
}

/** Crée un classeur à partir d'un fichier lu et validé ; rend son identifiant. */
export function useImporterNouveauClasseur() {
  const invalider = useInvaliderClasseur()
  return useMutation({
    mutationFn: (fichier: ClasseurJson) =>
      importerCommeNouveauClasseur(fichier),
    onSettled: () => invalider(),
  })
}

/**
 * Point de restauration MANUEL (majeur), nommé. Rend l'identifiant, ou
 * `null` si l'état courant est identique au dernier point manuel.
 */
export function useCreerPointRestauration() {
  const invalider = useInvaliderClasseur()
  return useMutation({
    mutationFn: ({
      classeurId,
      label,
    }: {
      classeurId: number
      label: string
    }) => creerPoint(classeurId, { kind: 'manuel', label: label.trim() }),
    onSettled: () => invalider(),
  })
}

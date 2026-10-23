import { useCallback, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type {
  UseMutateFunction,
  UseMutationOptions,
  UseMutationResult,
} from '@tanstack/react-query'

import { useInvaliderClasseur } from '#/components/classeur/hooks/useClasseur.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import {
  appliquerImport,
  importerCommeNouveauClasseur,
} from '#/lib/classeur/merge/apply.ts'
import {
  restaurerInstantane,
  supprimerEntreeHistorique,
} from '#/lib/classeur/merge/history.ts'
import type {
  ContexteImport,
  FichierChangements,
} from '#/lib/classeur/merge/changements.ts'
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

/**
 * Une ÉCRITURE qui ne part qu'une fois à la fois (trouvé au navigateur le
 * 2026-10-22 : un double clic sur Importer appliquait le fichier DEUX fois,
 * deux points de restauration et chaque feuille ajoutée en double).
 * `isPending` ne suffit pas : TanStack Query notifie l'observateur par une
 * minuterie, donc le second clic voit encore `isPending === false`. Un
 * verrou synchrone (ref) écarte tout `mutate` lancé pendant qu'un autre est
 * en vol ; il se relâche au règlement de celui-ci.
 *
 * `enVol()` lit ce verrou À L'INSTANT : un dialogue s'en sert pour refuser
 * de se fermer (Échap juste après Importer fermait le dialogue, faute de
 * `isPending` à jour, et l'import se terminait sans que la personne le
 * sache).
 */
export function useEcritureUnique<TData, TVars>(
  options: UseMutationOptions<TData, Error, TVars>,
): UseMutationResult<TData, Error, TVars> & { enVol: () => boolean } {
  const verrou = useRef(false)
  // Relâché au niveau de la MUTATION (toujours appelé, même après un
  // `reset()` ou un démontage), pas seulement par le rappel de l'appel.
  const mutation = useMutation({
    ...options,
    onSettled: (...args) => {
      verrou.current = false
      return options.onSettled?.(...args)
    },
  })
  const { mutate: lancer } = mutation
  const mutate = useCallback<UseMutateFunction<TData, Error, TVars>>(
    (...args) => {
      if (verrou.current) return
      verrou.current = true
      lancer(...args)
    },
    [lancer],
  )
  const enVol = useCallback(() => verrou.current, [])
  return { ...mutation, mutate, enVol }
}

/** Entrées d'historique d'un classeur (sans les instantanés), plus récente en tête. */
export function useMergeHistory(classeurId: number) {
  return useQuery({
    queryKey: classeurKeys.mergeHistory(classeurId),
    queryFn: () => fetchMergeHistory(classeurId),
    staleTime: STALE_60S,
    enabled: Number.isInteger(classeurId),
  })
}

export interface ImportArgs {
  classeurId: number
  fichier: FichierChangements
  /**
   * D'où l'on importe (accueil du classeur, page d'un chapitre ou d'un
   * document). La portée réelle est déduite du fichier (`destinationImport`).
   */
  contexte: ContexteImport
  sourceName: string
  /** Clés des éléments refusés dans l'aperçu (`clesActions`). */
  exclus: ReadonlySet<string>
}

/**
 * Importe un fichier déjà lu dans un classeur existant : un seul
 * comportement (le fichier fait foi pour ce qu'il contient, rien d'absent
 * n'est supprimé, portée déduite), décision utilisateur du 2026-10-20.
 */
export function useAppliquerImport() {
  const invalider = useInvaliderClasseur()
  return useEcritureUnique({
    mutationFn: ({
      classeurId,
      fichier,
      contexte,
      sourceName,
      exclus,
    }: ImportArgs) =>
      appliquerImport(classeurId, fichier, contexte, { sourceName, exclus }),
    onSettled: () => invalider(),
  })
}

/** Restaure l'instantané d'une entrée ; `data === null` = déjà à jour. */
export function useRestaurerInstantane() {
  const invalider = useInvaliderClasseur()
  return useEcritureUnique({
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
  return useEcritureUnique({
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
  return useEcritureUnique({
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

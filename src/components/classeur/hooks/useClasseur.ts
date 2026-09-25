import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { classeurKeys } from '#/lib/classeur/keys.ts'
import {
  fetchChapter,
  fetchChapterContent,
  fetchChapters,
  fetchClasseur,
  fetchClasseurContent,
  fetchClasseurs,
  fetchPeriodicites,
  reorderChapters,
  reorderClasseurs,
  reorderItems,
} from '#/lib/classeur/service.ts'
import { appliquerOrdre } from '#/lib/classeur/ordre.ts'
import type { ItemRef } from '#/lib/classeur/ordre.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
} from '#/lib/classeur/types.ts'

/*
 * Lectures TanStack Query de la page Classeur — SOURCE UNIQUE des `useQuery`.
 *
 * Toute lecture Supabase passe ici (jamais `useEffect` + `useState` + fetch).
 * `staleTime` 60 s, répété à chaque site d'appel avec le même seuil : le
 * `staleTime` est évalué PAR OBSERVATEUR (CLAUDE.md), un composant plus
 * pressé périmerait le cache de tous les autres. Les clés viennent de
 * `classeurKeys` et sont écrites sur disque par le cache persisté (aucune
 * donnée nominative).
 */

const STALE_60S = 60_000

/** Liste des classeurs (non supprimés). */
export function useClasseurs() {
  return useQuery({
    queryKey: classeurKeys.list(),
    queryFn: fetchClasseurs,
    staleTime: STALE_60S,
  })
}

/** Un classeur ; `data === null` = introuvable ou supprimé. */
export function useClasseur(classeurId: number) {
  return useQuery({
    queryKey: classeurKeys.one(classeurId),
    queryFn: () => fetchClasseur(classeurId),
    staleTime: STALE_60S,
    enabled: Number.isInteger(classeurId),
  })
}

/** Chapitres (non supprimés) d'un classeur, triés. */
export function useChapters(classeurId: number) {
  return useQuery({
    queryKey: classeurKeys.chapters(classeurId),
    queryFn: () => fetchChapters(classeurId),
    staleTime: STALE_60S,
    enabled: Number.isInteger(classeurId),
  })
}

/** Un chapitre ; `data === null` = introuvable ou supprimé. */
export function useChapter(chapterId: number) {
  return useQuery({
    queryKey: classeurKeys.chapter(chapterId),
    queryFn: () => fetchChapter(chapterId),
    staleTime: STALE_60S,
    enabled: Number.isInteger(chapterId),
  })
}

/** Les quatre familles d'éléments d'un chapitre (page chapitre, détails). */
export function useChapterContent(chapterId: number) {
  return useQuery({
    queryKey: classeurKeys.items(chapterId),
    queryFn: () => fetchChapterContent(chapterId),
    staleTime: STALE_60S,
    enabled: Number.isInteger(chapterId),
  })
}

/**
 * Tout le contenu d'un classeur : chapitres + les quatre familles (tableau de
 * bord : compteurs, recherche ; exports). Une lecture des chapitres puis quatre
 * en parallèle, sous le plafond global de six requêtes.
 */
export function useClasseurContent(classeurId: number) {
  return useQuery({
    queryKey: classeurKeys.classeurItems(classeurId),
    queryFn: () => fetchClasseurContent(classeurId),
    staleTime: STALE_60S,
    enabled: Number.isInteger(classeurId),
  })
}

/** Référentiel des périodicités : ne change jamais en séance. */
export function usePeriodicites() {
  return useQuery({
    queryKey: classeurKeys.periodicites(),
    queryFn: fetchPeriodicites,
    staleTime: Infinity,
  })
}

/**
 * Invalide TOUTES les lectures Classeur (`classeurKeys.all`). Après une
 * mutation, c'est le réflexe le moins risqué : l'invalidation compare la clé
 * élément par élément, et un chapitre déplacé touche à la fois `chapters`,
 * `items` et `classeur-items`.
 */
export function useInvaliderClasseur() {
  const queryClient = useQueryClient()
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: classeurKeys.all }),
    [queryClient],
  )
}

/** Réordonne une liste : `ids` dans le nouvel ordre. */
function reordonner<T extends { id: number }>(liste: T[], ids: number[]): T[] {
  const parId = new Map(liste.map((x) => [x.id, x]))
  const triee = ids.flatMap((id) => {
    const x = parId.get(id)
    return x ? [x] : []
  })
  // Tout ce que `ids` ne cite pas reste en queue, dans son ordre.
  const cites = new Set(ids)
  return [...triee, ...liste.filter((x) => !cites.has(x.id))].map((x, i) => ({
    ...x,
    sort_order: i + 1,
  }))
}

/**
 * Réordonnancement OPTIMISTE des classeurs : le cache est réécrit avant
 * l'écriture, restauré si elle échoue, puis tout est invalidé.
 */
export function useReorderClasseurs() {
  const queryClient = useQueryClient()
  const invalider = useInvaliderClasseur()
  const key = classeurKeys.list()
  return useMutation({
    mutationFn: (ids: number[]) => reorderClasseurs(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key })
      const avant = queryClient.getQueryData<DbClasseur[]>(key)
      if (avant)
        queryClient.setQueryData<DbClasseur[]>(key, reordonner(avant, ids))
      return { avant }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.avant) queryClient.setQueryData(key, ctx.avant)
    },
    onSettled: () => invalider(),
  })
}

/** Réordonnancement OPTIMISTE des chapitres d'un classeur (même schéma). */
export function useReorderChapters(classeurId: number) {
  const queryClient = useQueryClient()
  const invalider = useInvaliderClasseur()
  const key = classeurKeys.chapters(classeurId)
  return useMutation({
    mutationFn: (ids: number[]) => reorderChapters(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key })
      const avant = queryClient.getQueryData<DbChapter[]>(key)
      if (avant)
        queryClient.setQueryData<DbChapter[]>(key, reordonner(avant, ids))
      return { avant }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.avant) queryClient.setQueryData(key, ctx.avant)
    },
    onSettled: () => invalider(),
  })
}

/**
 * Réordonnancement OPTIMISTE des éléments d'un chapitre (toutes natures
 * confondues) : `refs` dans le nouvel ordre. Le cache `items(chapterId)` est
 * réécrit par `appliquerOrdre` avant l'écriture, restauré si elle échoue,
 * puis tout est invalidé.
 */
export function useReorderItems(chapterId: number) {
  const queryClient = useQueryClient()
  const invalider = useInvaliderClasseur()
  const key = classeurKeys.items(chapterId)
  return useMutation({
    mutationFn: (refs: ItemRef[]) => reorderItems(refs),
    onMutate: async (refs) => {
      await queryClient.cancelQueries({ queryKey: key })
      const avant = queryClient.getQueryData<ChapterContent>(key)
      if (avant)
        queryClient.setQueryData<ChapterContent>(
          key,
          appliquerOrdre(avant, refs),
        )
      return { avant }
    },
    onError: (_err, _refs, ctx) => {
      if (ctx?.avant) queryClient.setQueryData(key, ctx.avant)
    },
    onSettled: () => invalider(),
  })
}

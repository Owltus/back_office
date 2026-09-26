import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { classeurKeys } from '#/lib/classeur/keys.ts'
import { supprimerImage, televerserImage } from '#/lib/classeur/images.ts'
import { fetchImages, updateImage } from '#/lib/classeur/service.ts'
import type { DbImage } from '#/lib/classeur/types.ts'

/**
 * Médiathèque d'un classeur (images non supprimées, plus récentes d'abord).
 * `actif` : le dialogue passe son état d'ouverture, pour qu'une ouverture
 * relise la liste si elle est périmée (la requête d'un dialogue fermé mais
 * monté ne se rafraîchirait jamais).
 */
export function useImages(classeurId: number, actif = true) {
  return useQuery({
    queryKey: classeurKeys.images(classeurId),
    queryFn: () => fetchImages(classeurId),
    staleTime: 60_000,
    enabled: actif && Number.isInteger(classeurId),
  })
}

function useInvaliderImages() {
  const queryClient = useQueryClient()
  return (classeurId: number) =>
    queryClient.invalidateQueries({
      queryKey: classeurKeys.images(classeurId),
    })
}

/** Conversion WebP + envoi + fiche dans `classeur_images`. */
export function useTeleverserImage(classeurId: number) {
  const invalider = useInvaliderImages()
  return useMutation({
    mutationFn: (file: File) => televerserImage(classeurId, file),
    onSuccess: () => invalider(classeurId),
  })
}

export function useRenommerImage(classeurId: number) {
  const invalider = useInvaliderImages()
  return useMutation({
    mutationFn: ({ id, nom }: { id: number; nom: string }) =>
      updateImage(id, { nom }),
    onSuccess: () => invalider(classeurId),
  })
}

/** Suppression : fichier du bucket PUIS fiche (douce). */
export function useSupprimerImage(classeurId: number) {
  const invalider = useInvaliderImages()
  return useMutation({
    mutationFn: (image: DbImage) => supprimerImage(image),
    onSuccess: () => invalider(classeurId),
  })
}

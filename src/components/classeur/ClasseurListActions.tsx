import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'

import { ClasseurList } from '#/components/classeur/ClasseurList.tsx'
import { useImporterNouveauClasseur } from '#/components/classeur/hooks/useMerge.ts'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { exporterClasseurJson } from '#/lib/classeur/exportJson.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import {
  fetchClasseurContent,
  fetchPeriodicites,
} from '#/lib/classeur/service.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'

/** Même seuil que `useClasseurContent` (staleTime évalué par observateur). */
const STALE_60S = 60_000

/**
 * Liste des classeurs AVEC ses deux actions de fichier branchées :
 *   - export JSON (étape 5) : le contenu du classeur est lu par `fetchQuery`
 *     (cache `classeurItems` réutilisé s'il est frais, sinon une lecture),
 *     puis téléchargé au format v2 ;
 *   - import JSON comme NOUVEAU classeur (étape 6) : le fichier, déjà borné
 *     par `MAX_JSON_BYTES` dans `ClasseurList`, est lu, validé par
 *     `parseImportJson` (message français si le fichier est illisible), puis
 *     inséré ; on navigue vers le classeur créé. Aucune fusion ici : la
 *     fusion dans un classeur existant vit sur son tableau de bord.
 */
export function ClasseurListActions() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const importerNouveau = useImporterNouveauClasseur()

  const exporter = useMutation({
    mutationFn: async (classeur: DbClasseur) => {
      const [{ chapters, content }, periodicites] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: classeurKeys.classeurItems(classeur.id),
          queryFn: () => fetchClasseurContent(classeur.id),
          staleTime: STALE_60S,
        }),
        queryClient.ensureQueryData({
          queryKey: classeurKeys.periodicites(),
          queryFn: fetchPeriodicites,
          staleTime: Infinity,
        }),
      ])
      exporterClasseurJson(classeur, chapters, content, periodicites)
    },
  })

  const importer = useMutation({
    mutationFn: async (file: File) => {
      const fichier = parseImportJson(await file.text())
      return importerNouveau.mutateAsync(fichier)
    },
    onSuccess: (id) => {
      void navigate({
        to: '/classeur/$classeurId',
        params: { classeurId: String(id) },
      })
    },
  })

  const erreur = exporter.error ?? importer.error

  return (
    <>
      {erreur != null && (
        <Alert variant="destructive" className="mx-auto mb-4 w-full max-w-md">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(
              erreur,
              exporter.isError ? 'Export impossible' : 'Import impossible',
            )}
          </AlertDescription>
        </Alert>
      )}
      <ClasseurList
        onExporterJson={(c) => exporter.mutate(c)}
        onImporterJson={(file) => importer.mutate(file)}
      />
    </>
  )
}

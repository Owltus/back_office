import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'

import { ClasseurList } from '#/components/classeur/ClasseurList.tsx'
import {
  MESSAGE_COPIE_REFUSEE,
  useCopieExport,
} from '#/components/classeur/hooks/useCopieExport.ts'
import { useImporterNouveauClasseur } from '#/components/classeur/hooks/useMerge.ts'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { telechargerTexte } from '#/lib/classeur/download.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import {
  MIME_JSON,
  nomFichierJson,
  texteExportClasseur,
} from '#/lib/classeur/exportJson.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import { validerPourNouveauClasseur } from '#/lib/classeur/merge/validationImport.ts'
import {
  fetchClasseurContent,
  fetchPeriodicites,
} from '#/lib/classeur/service.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'

/** Même seuil que `useClasseurContent` (staleTime évalué par observateur). */
const STALE_60S = 60_000

/**
 * Liste des classeurs AVEC ses actions de fichier branchées :
 *   - export JSON (étape 5) : le contenu du classeur est lu par `fetchQuery`
 *     (cache `classeurItems` réutilisé s'il est frais, sinon une lecture),
 *     puis téléchargé au format v2 ;
 *   - copier pour une IA (étape 3 du plan `classeur-echange-ia-2026-10-19`) :
 *     le MÊME texte, mis dans le presse-papiers ; un refus du navigateur
 *     (fréquent après une lecture réseau, l'activation du clic étant perdue)
 *     télécharge le fichier à la place. Un second clic pendant la copie est
 *     ignoré : le contenu n'est lu qu'une fois ;
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
  const copie = useCopieExport()

  /** Le texte de l'export, identique pour Copier et Exporter. */
  async function lireExport(classeur: DbClasseur) {
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
    return {
      texte: texteExportClasseur(classeur, chapters, content, periodicites),
      nomFichier: nomFichierJson(classeur.name),
    }
  }

  const exporter = useMutation({
    mutationFn: async (classeur: DbClasseur) => {
      const x = await lireExport(classeur)
      telechargerTexte(x.nomFichier, x.texte, MIME_JSON)
    },
  })

  const importer = useMutation({
    mutationFn: async (file: File) => {
      const fichier = parseImportJson(await file.text())
      // Étape 6 : ce que la base refuserait est corrigé AVANT la création du
      // classeur (sans transaction, un refus au milieu le laisserait à moitié).
      const periodicites = await queryClient.ensureQueryData({
        queryKey: classeurKeys.periodicites(),
        queryFn: fetchPeriodicites,
        staleTime: Infinity,
      })
      const valide = validerPourNouveauClasseur(fichier, periodicites)
      return importerNouveau.mutateAsync(valide.fichier)
    },
    onSuccess: (id) => {
      void navigate({
        to: '/classeur/$classeurId',
        params: { classeurId: String(id) },
      })
    },
  })

  const erreur = exporter.error ?? importer.error ?? copie.erreur

  return (
    <>
      {erreur != null && (
        <Alert variant="destructive" className="mx-auto mb-4 w-full max-w-md">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(
              erreur,
              exporter.isError
                ? 'Export impossible'
                : importer.isError
                  ? 'Import impossible'
                  : 'Copie impossible',
            )}
          </AlertDescription>
        </Alert>
      )}
      {copie.refusee && (
        <Alert variant="destructive" className="mx-auto mb-4 w-full max-w-md">
          <AlertCircle />
          <AlertDescription>{MESSAGE_COPIE_REFUSEE}</AlertDescription>
        </Alert>
      )}
      {/* Le menu se ferme au clic : « Copié » s'affiche ici deux secondes,
          comme sur le bouton Copier d'un dialogue. */}
      {copie.copie && (
        <p
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border bg-card px-3 py-1.5 text-sm shadow-md"
        >
          Copié
        </p>
      )}
      <ClasseurList
        onExporterJson={(c) => exporter.mutate(c)}
        onCopierJson={(c) => copie.copier(() => lireExport(c))}
        onImporterJson={(file) => importer.mutate(file)}
      />
    </>
  )
}

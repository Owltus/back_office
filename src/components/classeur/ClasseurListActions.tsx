import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'

import { ClasseurList } from '#/components/classeur/ClasseurList.tsx'
import { RelectureImportDialog } from '#/components/classeur/dialogs/RelectureImportDialog.tsx'
import type { RelectureNouveauClasseur } from '#/components/classeur/dialogs/RelectureImportDialog.tsx'
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
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import { validerPourNouveauClasseur } from '#/lib/classeur/merge/validationImport.ts'
import {
  fetchClasseurContent,
  fetchPeriodicites,
} from '#/lib/classeur/service.ts'
import { relireFichierImport } from '#/lib/classeur/relecture.ts'
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
 *     `parseImportJson` (message français si le fichier est illisible),
 *     CORRIGÉ par `validerPourNouveauClasseur` (ce que la base refuserait,
 *     plan `classeur-echange-ia-2026-10-19`, étape 6) et RELU (D7, étape 7 :
 *     quatrième mur, mise en forme). S'il y a quelque chose à dire, le
 *     dialogue `RelectureImportDialog` le montre avant de créer ; sinon le
 *     classeur est créé aussitôt. On navigue vers le classeur créé. Aucune
 *     fusion ici : la fusion dans un classeur existant vit sur son tableau
 *     de bord.
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

  // Fichier lu, corrigé et relu, en attente de confirmation (D7).
  const [aConfirmer, setAConfirmer] = useState<{
    fichier: ClasseurJson
    relecture: RelectureNouveauClasseur
  } | null>(null)

  const creer = useMutation({
    mutationFn: (fichier: ClasseurJson) => importerNouveau.mutateAsync(fichier),
    onSuccess: (id) => {
      setAConfirmer(null)
      void navigate({
        to: '/classeur/$classeurId',
        params: { classeurId: String(id) },
      })
    },
  })

  const importer = useMutation({
    mutationFn: async (file: File) => {
      const lu = parseImportJson(await file.text())
      // Étape 6 : ce que la base refuserait est corrigé AVANT la création du
      // classeur (sans transaction, un refus au milieu le laisserait à moitié).
      const periodicites = await queryClient.ensureQueryData({
        queryKey: classeurKeys.periodicites(),
        queryFn: fetchPeriodicites,
        staleTime: Infinity,
      })
      const { fichier, avertissements } = validerPourNouveauClasseur(
        lu,
        periodicites,
      )
      return {
        fichier,
        relecture: {
          nom: fichier.classeur.name,
          avertissements,
          elements: relireFichierImport(fichier),
        },
      }
    },
    onSuccess: (prepare) => {
      const { avertissements, elements } = prepare.relecture
      if (avertissements.length === 0 && elements.length === 0)
        creer.mutate(prepare.fichier)
      else setAConfirmer(prepare)
    },
  })

  const erreurImport = importer.error ?? creer.error
  const erreur = exporter.error ?? erreurImport ?? copie.erreur

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
                : erreurImport != null
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
      <RelectureImportDialog
        relecture={aConfirmer?.relecture ?? null}
        onAnnuler={() => setAConfirmer(null)}
        onImporter={() => {
          if (aConfirmer !== null) creer.mutate(aConfirmer.fichier)
        }}
        enCours={creer.isPending}
      />
    </>
  )
}

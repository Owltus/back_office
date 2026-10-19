import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

import { ClasseurDashboard } from '#/components/classeur/ClasseurDashboard.tsx'
import type {
  DashboardBusy,
  DashboardContexte,
} from '#/components/classeur/ClasseurDashboard.tsx'
import { CorbeilleDialog } from '#/components/classeur/dialogs/CorbeilleDialog.tsx'
import { ExportJsonClasseurDialog } from '#/components/classeur/dialogs/ExportJsonClasseurDialog.tsx'
import { HistoriqueDialog } from '#/components/classeur/dialogs/HistoriqueDialog.tsx'
import { ImagesDialog } from '#/components/classeur/dialogs/ImagesDialog.tsx'
import { MergePreviewDialog } from '#/components/classeur/dialogs/MergePreviewDialog.tsx'
import { ClasseurCoverPage } from '#/components/classeur/print/ClasseurCoverPage.tsx'
import { useDroitsClasseur } from '#/components/classeur/hooks/useDroitsClasseur.ts'
import { ChapterPrintPages } from '#/components/classeur/print/ItemPages.tsx'
import { nomFichierImpression } from '#/lib/classeur/print/nomFichierImpression.ts'
import { PrintPreview } from '#/components/classeur/print/PrintPreview.tsx'
import { TableOfContentsPage } from '#/components/classeur/print/TableOfContentsPage.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { exporterClasseurZip } from '#/lib/classeur/exportMarkdown.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import type { ResultatFusion } from '#/lib/classeur/merge/apply.ts'
import { buildEstablishment } from '#/lib/classeur/naming.ts'
import { fetchPeriodicites } from '#/lib/classeur/service.ts'
import {
  construireSommaire,
  contenuDuChapitre,
  trierChapitres,
} from '#/lib/classeur/sommaire.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import type { DbPeriodicite } from '#/lib/classeur/types.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'

/** Ce que montre l'aperçu avant impression du tableau de bord. */
type Apercu =
  | { type: 'sommaire'; ctx: DashboardContexte }
  | { type: 'pdf'; ctx: DashboardContexte }
  | null

/** Un export à télécharger (Markdown ZIP ; le JSON passe par son dialogue). */
interface Export {
  type: 'markdown'
  ctx: DashboardContexte
}

/** Phrase de bilan d'une fusion, au pluriel simple. */
export function bilanFusion(r: ResultatFusion): string {
  const parts = [
    `${r.inserted} ajout${r.inserted > 1 ? 's' : ''}`,
    `${r.updated} modification${r.updated > 1 ? 's' : ''}`,
    `${r.unchanged} inchangé${r.unchanged > 1 ? 's' : ''}`,
  ]
  if (r.skipped > 0)
    parts.push(`${r.skipped} ignoré${r.skipped > 1 ? 's' : ''}`)
  if (r.deleted > 0)
    parts.push(`${r.deleted} supprimé${r.deleted > 1 ? 's' : ''}`)
  const avertissements = (r.avertissements ?? []).map((a) => ` ${a}`).join('')
  const ignores =
    r.ignores !== undefined && r.ignores > 0
      ? ` ${r.ignores > 1 ? `${r.ignores} éléments ignorés` : '1 élément ignoré'} à votre demande.`
      : ''
  return `Import terminé : ${parts.join(', ')}.${ignores}${avertissements}`
}

/**
 * Tableau de bord d'un classeur AVEC ses actions branchées :
 *   - Sommaire et Exporter en PDF ouvrent un `PrintPreview` (impression via
 *     iframe, « Enregistrer en PDF » dans le dialogue du navigateur) ;
 *   - Exporter en Markdown télécharge l'archive ZIP ; Exporter en JSON ouvre
 *     son dialogue (`ExportJsonClasseurDialog` : Copier pour une IA ou
 *     Télécharger le fichier v2, sans aucun choix) ;
 *   - Importer un JSON ouvre le dialogue d'import (`MergePreviewDialog`) :
 *     coller la réponse d'une IA ou choisir un fichier (un fichier déposé sur
 *     la ligne l'ouvre déjà chargé), aperçu, puis un point de restauration
 *     avant toute écriture ; Historique ouvre les instantanés restaurables.
 *
 * Porte l'état (aperçu, export en cours, fichier à fusionner, bilan, erreur)
 * pour que la route reste mince. Les périodicités, nécessaires aux feuilles
 * de suivi et au JSON, sont lues par `ensureQueryData` : depuis le cache si
 * le tableau de bord les a déjà, sinon une lecture.
 */
export function ClasseurDashboardActions({
  classeurId,
}: {
  classeurId: number
}) {
  const queryClient = useQueryClient()
  const [apercu, setApercu] = useState<Apercu>(null)
  const [periodicites, setPeriodicites] = useState<DbPeriodicite[]>([])
  // Import du classeur : dialogue ouvert, avec le fichier déposé s'il y en a
  // un (sinon la personne y colle la réponse de l'IA ou choisit un fichier).
  const [importOuvert, setImportOuvert] = useState(false)
  const [fichierImport, setFichierImport] = useState<File | null>(null)
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false)
  const [imagesOuvertes, setImagesOuvertes] = useState(false)
  const [corbeilleOuverte, setCorbeilleOuverte] = useState(false)
  // Export JSON du classeur complet : son dialogue (Copier / Télécharger).
  const [exportJson, setExportJson] = useState<DashboardContexte | null>(null)
  const { canWrite } = useDroitsClasseur(classeurId)
  const [bilan, setBilan] = useState<string | null>(null)
  const [erreurFichier, setErreurFichier] = useState<string | null>(null)

  const lirePeriodicites = () =>
    queryClient.ensureQueryData({
      queryKey: classeurKeys.periodicites(),
      queryFn: fetchPeriodicites,
      staleTime: Infinity,
    })

  const exporter = useMutation({
    mutationFn: async ({ ctx }: Export) => {
      const perios = await lirePeriodicites()
      await exporterClasseurZip(
        ctx.classeur.name,
        ctx.chapters,
        ctx.content,
        perios,
      )
    },
  })

  // L'aperçu a besoin des périodicités pour les feuilles de suivi : lues
  // avant l'ouverture, depuis le cache dans le cas courant.
  const ouvrirApercu = useMutation({
    mutationFn: async (a: NonNullable<Apercu>) => {
      setPeriodicites(await lirePeriodicites())
      setApercu(a)
    },
  })

  const recevoirFichier = (file: File | undefined) => {
    if (!file) return
    const trop = fileTooLarge(file, MAX_JSON_BYTES)
    if (trop) {
      setErreurFichier(trop)
      return
    }
    setErreurFichier(null)
    setBilan(null)
    setFichierImport(file)
    setImportOuvert(true)
  }

  const ouvrirImport = () => {
    setErreurFichier(null)
    setBilan(null)
    setFichierImport(null)
    setImportOuvert(true)
  }

  const busy: DashboardBusy = exporter.isPending
    ? exporter.variables.type
    : ouvrirApercu.isPending
      ? ouvrirApercu.variables.type
      : null

  const erreur = exporter.error ?? ouvrirApercu.error

  const ctx = apercu?.ctx
  const classeurName = ctx?.classeur.name
  const establishment = ctx ? buildEstablishment(ctx.classeur) : undefined
  const sommaire = ctx ? construireSommaire(ctx.chapters, ctx.content) : []

  return (
    <>
      <ClasseurDashboard
        classeurId={classeurId}
        // Alertes en tête de la zone qui défile, sous l'en-tête fixe.
        messages={
          <>
            {erreur != null && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>
                  {messageErreur(erreur, 'Export impossible')}
                </AlertDescription>
              </Alert>
            )}
            {erreurFichier && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{erreurFichier}</AlertDescription>
              </Alert>
            )}
            {bilan && (
              <Alert>
                <CheckCircle2 />
                <AlertDescription>{bilan}</AlertDescription>
              </Alert>
            )}
          </>
        }
        onSommaire={(c) => ouvrirApercu.mutate({ type: 'sommaire', ctx: c })}
        onExporterPdf={(c) => ouvrirApercu.mutate({ type: 'pdf', ctx: c })}
        onExporterMarkdown={(c) =>
          exporter.mutate({ type: 'markdown', ctx: c })
        }
        onExporterJson={setExportJson}
        onImporter={ouvrirImport}
        onFichierDepose={recevoirFichier}
        onHistorique={() => setHistoriqueOuvert(true)}
        onImages={() => setImagesOuvertes(true)}
        onCorbeille={() => setCorbeilleOuverte(true)}
        busy={busy}
      />

      <MergePreviewDialog
        open={importOuvert}
        onOpenChange={(open) => {
          setImportOuvert(open)
          if (!open) setFichierImport(null)
        }}
        classeurId={classeurId}
        file={fichierImport}
        onDone={(r) => {
          setBilan(bilanFusion(r))
          setImportOuvert(false)
          setFichierImport(null)
        }}
      />

      <ExportJsonClasseurDialog
        open={exportJson !== null}
        onOpenChange={(open) => {
          if (!open) setExportJson(null)
        }}
        sujet={exportJson}
      />

      <ImagesDialog
        open={imagesOuvertes}
        onOpenChange={setImagesOuvertes}
        classeurId={classeurId}
      />
      <CorbeilleDialog
        open={corbeilleOuverte}
        onOpenChange={setCorbeilleOuverte}
        classeurId={classeurId}
        canWrite={canWrite}
      />
      <HistoriqueDialog
        open={historiqueOuvert}
        onOpenChange={setHistoriqueOuvert}
        classeurId={classeurId}
      />

      <PrintPreview
        open={apercu !== null}
        onOpenChange={(open) => {
          if (!open) setApercu(null)
        }}
        nomFichier={nomFichierImpression({
          classeur: classeurName,
          titre: apercu?.type === 'sommaire' ? 'Sommaire' : undefined,
        })}
        title={
          apercu?.type === 'sommaire'
            ? `${classeurName} : sommaire`
            : apercu?.type === 'pdf'
              ? `${classeurName} : classeur complet`
              : undefined
        }
      >
        {apercu?.type === 'sommaire' && ctx && (
          <TableOfContentsPage
            chapters={sommaire}
            classeurName={classeurName}
          />
        )}
        {apercu?.type === 'pdf' && ctx && (
          <>
            <ClasseurCoverPage
              classeurName={classeurName}
              classeurIcon={ctx.classeur.icon}
              etablissement={ctx.classeur.etablissement || undefined}
              etablissementComplement={
                ctx.classeur.etablissement_complement || undefined
              }
            />
            <TableOfContentsPage
              chapters={sommaire}
              classeurName={classeurName}
            />
            {trierChapitres(ctx.chapters).map((ch) => {
              const content = contenuDuChapitre(ctx.content, ch.id)
              // Un chapitre vide figure au sommaire, pas dans le PDF (comme Registre).
              if (flattenItems(content).length === 0) return null
              return (
                <ChapterPrintPages
                  key={ch.id}
                  chapter={ch}
                  content={content}
                  classeurName={classeurName}
                  establishment={establishment}
                  periodicites={periodicites}
                />
              )
            })}
          </>
        )}
      </PrintPreview>
    </>
  )
}

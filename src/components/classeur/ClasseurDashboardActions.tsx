import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

import { ClasseurDashboard } from '#/components/classeur/ClasseurDashboard.tsx'
import type {
  DashboardBusy,
  DashboardContexte,
} from '#/components/classeur/ClasseurDashboard.tsx'
import { HistoriqueDialog } from '#/components/classeur/dialogs/HistoriqueDialog.tsx'
import { MergePreviewDialog } from '#/components/classeur/dialogs/MergePreviewDialog.tsx'
import { ClasseurCoverPage } from '#/components/classeur/print/ClasseurCoverPage.tsx'
import { ChapterPrintPages } from '#/components/classeur/print/ItemPages.tsx'
import { PrintPreview } from '#/components/classeur/print/PrintPreview.tsx'
import { TableOfContentsPage } from '#/components/classeur/print/TableOfContentsPage.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { exporterClasseurJson } from '#/lib/classeur/exportJson.ts'
import { exporterClasseurZip } from '#/lib/classeur/exportMarkdown.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import type { MergeResult } from '#/lib/classeur/merge/merge.ts'
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

/** Un export à télécharger (Markdown ZIP ou JSON v2). */
interface Export {
  type: 'markdown' | 'json'
  ctx: DashboardContexte
}

/** Phrase de bilan d'une fusion, au pluriel simple. */
function bilanFusion(r: MergeResult): string {
  const parts = [
    `${r.inserted} ajout${r.inserted > 1 ? 's' : ''}`,
    `${r.updated} modification${r.updated > 1 ? 's' : ''}`,
    `${r.unchanged} inchangé${r.unchanged > 1 ? 's' : ''}`,
  ]
  if (r.skipped > 0)
    parts.push(`${r.skipped} ignoré${r.skipped > 1 ? 's' : ''}`)
  if (r.deleted > 0)
    parts.push(`${r.deleted} supprimé${r.deleted > 1 ? 's' : ''}`)
  return `Fusion terminée : ${parts.join(', ')}.`
}

/**
 * Tableau de bord d'un classeur AVEC ses actions branchées :
 *   - Sommaire et Exporter en PDF ouvrent un `PrintPreview` (impression via
 *     iframe, « Enregistrer en PDF » dans le dialogue du navigateur) ;
 *   - Exporter en Markdown télécharge l'archive ZIP, Exporter en JSON le
 *     fichier v2 (étape 5) ;
 *   - Importer un JSON ouvre le sélecteur de fichier puis la prévisualisation
 *     de fusion (`MergePreviewDialog`), qui écrit un instantané avant toute
 *     écriture ; Historique ouvre les instantanés restaurables (étape 6).
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
  const [fichierImport, setFichierImport] = useState<File | null>(null)
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false)
  const [bilan, setBilan] = useState<string | null>(null)
  const [erreurFichier, setErreurFichier] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const lirePeriodicites = () =>
    queryClient.ensureQueryData({
      queryKey: classeurKeys.periodicites(),
      queryFn: fetchPeriodicites,
      staleTime: Infinity,
    })

  const exporter = useMutation({
    mutationFn: async ({ type, ctx }: Export) => {
      const perios = await lirePeriodicites()
      if (type === 'markdown') {
        await exporterClasseurZip(
          ctx.classeur.name,
          ctx.chapters,
          ctx.content,
          perios,
        )
      } else {
        exporterClasseurJson(ctx.classeur, ctx.chapters, ctx.content, perios)
      }
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
      {erreur != null && (
        <Alert variant="destructive" className="mx-auto mb-4 w-full max-w-5xl">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(erreur, 'Export impossible')}
          </AlertDescription>
        </Alert>
      )}
      {erreurFichier && (
        <Alert variant="destructive" className="mx-auto mb-4 w-full max-w-5xl">
          <AlertCircle />
          <AlertDescription>{erreurFichier}</AlertDescription>
        </Alert>
      )}
      {bilan && (
        <Alert className="mx-auto mb-4 w-full max-w-5xl">
          <CheckCircle2 />
          <AlertDescription>{bilan}</AlertDescription>
        </Alert>
      )}

      {/* Sélecteur de fichier caché : le clic sur la carte Importer l'ouvre. */}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          recevoirFichier(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <ClasseurDashboard
        classeurId={classeurId}
        onSommaire={(c) => ouvrirApercu.mutate({ type: 'sommaire', ctx: c })}
        onExporterPdf={(c) => ouvrirApercu.mutate({ type: 'pdf', ctx: c })}
        onExporterMarkdown={(c) =>
          exporter.mutate({ type: 'markdown', ctx: c })
        }
        onExporterJson={(c) => exporter.mutate({ type: 'json', ctx: c })}
        onImporter={() => inputRef.current?.click()}
        onHistorique={() => setHistoriqueOuvert(true)}
        busy={busy}
      />

      <MergePreviewDialog
        open={fichierImport !== null}
        onOpenChange={(open) => {
          if (!open) setFichierImport(null)
        }}
        classeurId={classeurId}
        file={fichierImport}
        onDone={(r) => {
          setBilan(bilanFusion(r))
          setFichierImport(null)
        }}
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
        title={
          apercu?.type === 'sommaire'
            ? `${classeurName} — Sommaire`
            : apercu?.type === 'pdf'
              ? `${classeurName} — classeur complet`
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

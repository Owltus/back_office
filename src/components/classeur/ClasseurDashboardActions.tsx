import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

import { ClasseurDashboard } from '#/components/classeur/ClasseurDashboard.tsx'
import type {
  DashboardBusy,
  DashboardContexte,
  EtatModifies,
} from '#/components/classeur/ClasseurDashboard.tsx'
import { CorbeilleDialog } from '#/components/classeur/dialogs/CorbeilleDialog.tsx'
import { ExportMarkdownDialog } from '#/components/classeur/dialogs/ExportMarkdownDialog.tsx'
import { DocumentsModifiesDialog } from '#/components/classeur/dialogs/DocumentsModifiesDialog.tsx'
import { EchangeJsonDialog } from '#/components/classeur/dialogs/EchangeJsonDialog.tsx'
import { HistoriqueDialog } from '#/components/classeur/dialogs/HistoriqueDialog.tsx'
import { ImagesDialog } from '#/components/classeur/dialogs/ImagesDialog.tsx'
import { ClasseurCoverPage } from '#/components/classeur/print/ClasseurCoverPage.tsx'
import { useDroitsClasseur } from '#/components/classeur/hooks/useDroitsClasseur.ts'
import {
  ChapterPrintPages,
  ItemPages,
} from '#/components/classeur/print/ItemPages.tsx'
import { useImpressionsSuivies } from '#/components/classeur/hooks/useImpressionsSuivies.ts'
import { Button } from '#/components/ui/button.tsx'
import { nomFichierImpression } from '#/lib/classeur/print/nomFichierImpression.ts'
import { PrintPreview } from '#/components/classeur/print/PrintPreview.tsx'
import { TableOfContentsPage } from '#/components/classeur/print/TableOfContentsPage.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import {
  elementsModifies,
  jamaisImprime,
} from '#/lib/classeur/impressionsSuivies.ts'
import type { Empreintes } from '#/lib/classeur/impressionsSuivies.ts'
import { cleRef } from '#/lib/classeur/ordre.ts'
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
import type { ChapterItem, DbPeriodicite } from '#/lib/classeur/types.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'

/** Ce que montre l'aperçu avant impression du tableau de bord. */
type Apercu =
  | { type: 'sommaire'; ctx: DashboardContexte }
  | { type: 'pdf'; ctx: DashboardContexte }
  | { type: 'modifies'; ctx: DashboardContexte; items: ChapterItem[] }
  | null

/** Tous les éléments du classeur, chapitre par chapitre, dans l'ordre. */
function elementsDuClasseur(ctx: DashboardContexte): ChapterItem[] {
  return trierChapitres(ctx.chapters).flatMap((ch) =>
    flattenItems(contenuDuChapitre(ctx.content, ch.id)),
  )
}

/** Phrase de la ligne « Documents modifiés ». */
export function decrireModifies(
  items: readonly ChapterItem[],
  empreintes: Empreintes,
): EtatModifies {
  if (jamaisImprime(empreintes))
    return {
      description: 'Jamais imprimé sur ce poste : tout le classeur',
      aucun: items.length === 0,
    }
  const n = elementsModifies(items, empreintes).length
  if (n === 0)
    return {
      description: 'Tout est à jour depuis votre dernière impression',
      aucun: true,
    }
  return {
    description: `${String(n)} document${n > 1 ? 's' : ''} à réimprimer`,
    aucun: false,
  }
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
  if (r.deleted > 0) parts.push(`${r.deleted} mis à la corbeille`)
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
 *   - Exporter en Markdown ouvre sa fenêtre de choix ; Échange avec un LLM
 *     ouvre LA fenêtre des chapitres (`EchangeJsonDialog`, 2026-11-16) :
 *     exporter le classeur complet (Copier / Télécharger), puis réimporter
 *     la réponse du LLM (un fichier déposé sur la ligne l'ouvre déjà
 *     chargé), aperçu, point de restauration avant toute écriture ;
 *     Historique ouvre les instantanés restaurables.
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
  // Échange avec un LLM (export ET import) : la fenêtre, avec le fichier
  // déposé sur la ligne s'il y en a un.
  const [echange, setEchange] = useState<DashboardContexte | null>(null)
  const [fichierImport, setFichierImport] = useState<File | null>(null)
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false)
  const [imagesOuvertes, setImagesOuvertes] = useState(false)
  const [corbeilleOuverte, setCorbeilleOuverte] = useState(false)
  const { canWrite } = useDroitsClasseur(classeurId)
  const suivi = useImpressionsSuivies(classeurId)
  const [bilan, setBilan] = useState<string | null>(null)
  const [erreurFichier, setErreurFichier] = useState<string | null>(null)

  const lirePeriodicites = () =>
    queryClient.ensureQueryData({
      queryKey: classeurKeys.periodicites(),
      queryFn: fetchPeriodicites,
      staleTime: Infinity,
    })

  // Export Markdown : sa fenêtre de choix (un ou plusieurs fichiers, avec
  // ou sans images).
  const [exportMd, setExportMd] = useState<DashboardContexte | null>(null)

  // L'aperçu a besoin des périodicités pour les feuilles de suivi : lues
  // avant l'ouverture, depuis le cache dans le cas courant.
  const ouvrirApercu = useMutation({
    mutationFn: async (a: NonNullable<Apercu>) => {
      setPeriodicites(await lirePeriodicites())
      setApercu(a)
    },
  })

  const recevoirFichier = (file: File, c: DashboardContexte) => {
    const trop = fileTooLarge(file, MAX_JSON_BYTES)
    if (trop) {
      setErreurFichier(trop)
      return
    }
    setErreurFichier(null)
    setBilan(null)
    setFichierImport(file)
    setEchange(c)
  }

  const ouvrirEchange = (c: DashboardContexte) => {
    setErreurFichier(null)
    setBilan(null)
    setFichierImport(null)
    setEchange(c)
  }

  // « Documents modifiés » : d'abord la fenêtre des cartes (choisir), puis
  // l'aperçu d'impression des éléments retenus (demande du 2026-11-16).
  const [modifiesAChoisir, setModifiesAChoisir] =
    useState<DashboardContexte | null>(null)
  const choisirModifies = useMutation({
    mutationFn: async (c: DashboardContexte) => {
      setPeriodicites(await lirePeriodicites())
      setModifiesAChoisir(c)
    },
  })
  const groupesModifies =
    modifiesAChoisir === null
      ? []
      : trierChapitres(modifiesAChoisir.chapters)
          .map((ch) => ({
            chapitre: ch,
            items: elementsModifies(
              flattenItems(contenuDuChapitre(modifiesAChoisir.content, ch.id)),
              suivi.empreintes,
            ),
          }))
          .filter((g) => g.items.length > 0)

  const busy: DashboardBusy = ouvrirApercu.isPending
    ? ouvrirApercu.variables.type
    : choisirModifies.isPending
      ? 'modifies'
      : null

  const erreur = ouvrirApercu.error ?? choisirModifies.error

  const ctx = apercu?.ctx
  const classeurName = ctx?.classeur.name
  const establishment = ctx ? buildEstablishment(ctx.classeur) : undefined
  const sommaire = ctx ? construireSommaire(ctx.chapters, ctx.content) : []
  // Ce qui part à l'impression : retenu une fois imprimé (« Documents
  // modifiés » ne repropose alors que ce qui change ensuite).
  const imprimes: ChapterItem[] = !ctx
    ? []
    : apercu?.type === 'pdf'
      ? elementsDuClasseur(ctx)
      : apercu?.type === 'modifies'
        ? apercu.items
        : []
  let pagesModifies: ReactNode = null
  if (apercu?.type === 'modifies' && ctx) {
    const parChapitre = new Map(ctx.chapters.map((c) => [c.id, c.label]))
    pagesModifies = imprimes.map((it) => (
      <ItemPages
        key={cleRef(it.kind, it.data.id)}
        item={it}
        chapterName={parChapitre.get(it.data.chapter_id) ?? ''}
        classeurName={classeurName}
        establishment={establishment}
        periodicites={periodicites}
      />
    ))
  }

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
        onExporterMarkdown={setExportMd}
        onImprimerModifies={(c) => choisirModifies.mutate(c)}
        etatModifies={
          suivi.pret
            ? (c) => decrireModifies(elementsDuClasseur(c), suivi.empreintes)
            : undefined
        }
        onEchange={ouvrirEchange}
        onFichierDepose={recevoirFichier}
        onHistorique={() => setHistoriqueOuvert(true)}
        onImages={() => setImagesOuvertes(true)}
        onCorbeille={() => setCorbeilleOuverte(true)}
        busy={busy}
      />

      <DocumentsModifiesDialog
        open={modifiesAChoisir !== null}
        onOpenChange={(open) => {
          if (!open) setModifiesAChoisir(null)
        }}
        classeurId={classeurId}
        classeurName={modifiesAChoisir?.classeur.name}
        establishment={
          modifiesAChoisir
            ? buildEstablishment(modifiesAChoisir.classeur)
            : undefined
        }
        groupes={groupesModifies}
        periodicites={periodicites}
        onImprimer={(items) => {
          const c = modifiesAChoisir
          setModifiesAChoisir(null)
          if (c) setApercu({ type: 'modifies', ctx: c, items })
        }}
        onDejaAJour={() => {
          suivi.retenir(groupesModifies.flatMap((g) => g.items))
          setModifiesAChoisir(null)
        }}
      />

      <EchangeJsonDialog
        open={echange !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEchange(null)
            setFichierImport(null)
          }
        }}
        classeur={echange?.classeur ?? null}
        sujet={
          echange === null
            ? null
            : {
                type: 'classeur',
                chapitres: echange.chapters,
                contenu: echange.content,
              }
        }
        canWrite={canWrite}
        fichier={fichierImport}
        onDone={(r) => setBilan(bilanFusion(r))}
      />

      <ExportMarkdownDialog
        open={exportMd !== null}
        onOpenChange={(open) => {
          if (!open) setExportMd(null)
        }}
        portee={
          exportMd === null
            ? null
            : {
                classeurName: exportMd.classeur.name,
                chapters: exportMd.chapters,
                content: exportMd.content,
              }
        }
        lirePeriodicites={lirePeriodicites}
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
          titre:
            apercu?.type === 'sommaire'
              ? 'Sommaire'
              : apercu?.type === 'modifies'
                ? 'Documents modifiés'
                : undefined,
        })}
        title={
          apercu?.type === 'sommaire'
            ? `${classeurName} : sommaire`
            : apercu?.type === 'pdf'
              ? `${classeurName} : classeur complet`
              : apercu?.type === 'modifies'
                ? `${classeurName} : ${String(imprimes.length)} document${imprimes.length > 1 ? 's' : ''} modifié${imprimes.length > 1 ? 's' : ''}`
                : undefined
        }
        onImprime={() => suivi.retenir(imprimes)}
        actions={
          apercu?.type === 'modifies' && imprimes.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="pointer-coarse:h-11"
              onClick={() => {
                suivi.retenir(imprimes)
                setApercu(null)
              }}
            >
              Déjà à jour, ne pas imprimer
            </Button>
          ) : null
        }
      >
        {pagesModifies}
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

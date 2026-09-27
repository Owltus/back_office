import { History, Pencil } from 'lucide-react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  DetailActions,
  DetailErreur,
  DetailHeader,
  DetailIntrouvable,
  DetailMarkdownAction,
  DetailPaper,
  DetailSkeleton,
} from '#/components/classeur/detail/DetailFrame.tsx'
import { useDetailPage } from '#/components/classeur/hooks/useDetailPage.ts'
import { useHauteurJusquEnBas } from '#/components/classeur/hooks/useHauteurJusquEnBas.ts'
import {
  BarreMiseEnForme,
  useMiseEnForme,
} from '#/components/classeur/detail/BarreMiseEnForme.tsx'
import {
  BoutonsImage,
  DialoguesImage,
  EtatImageLigne,
  useInsertionImage,
} from '#/components/classeur/detail/InsertionImage.tsx'
import { useEditionDocument } from '#/components/classeur/detail/useEditionDocument.ts'
import { AbandonModificationsDialog } from '#/components/classeur/dialogs/AbandonModificationsDialog.tsx'
import { ConflitDocumentDialog } from '#/components/classeur/dialogs/ConflitDocumentDialog.tsx'
import { AideMiseEnFormeDialog } from '#/components/classeur/dialogs/AideMiseEnFormeDialog.tsx'
import { TitreDocumentDialog } from '#/components/classeur/dialogs/TitreDocumentDialog.tsx'
import { IconAction } from '#/components/classeur/IconAction.tsx'
import { DocumentPages } from '#/components/classeur/print/DocumentPages.tsx'
import { PrintPreview } from '#/components/classeur/print/PrintPreview.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { exporterDocumentMarkdown } from '#/lib/classeur/exportMarkdown.ts'
import { usePageScale } from '#/lib/classeur/print/usePageScale.ts'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'

/**
 * Page d'un document Markdown — portée de Registre (`DocumentDetail`).
 * Lecture : les pages A4 empilées à l'échelle de la largeur. Édition :
 * aperçu A4 (gauche) et texte Markdown (droite) avec barre de mise en
 * forme, titre et description dans un dialogue (crayon), Ctrl + S pour
 * sauvegarder, défilement de l'éditeur répercuté sur l'aperçu. Exports :
 * PDF (`PrintPreview`) et Markdown (`.md`).
 *
 * L'état d'édition (brouillon de secours, garde de sortie, conflit) vit
 * dans `useEditionDocument` ; l'aperçu suit la frappe avec
 * `useDeferredValue` plutôt qu'une minuterie.
 */
export function DocumentDetail() {
  const page = useDetailPage('document')
  const doc = page.item
  const retour = page.backParams

  const edition = useEditionDocument(doc)
  const {
    editing,
    titre,
    setTitre,
    description,
    setDescription,
    contenu,
    setContenu,
    sauvegarder,
  } = edition
  const contenuDiffere = useDeferredValue(contenu)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [aideOuverte, setAideOuverte] = useState(false)
  const [titreOuvert, setTitreOuvert] = useState(false)

  const { containerRef: lectureRef, scale: lectureScale } =
    usePageScale('width')
  const { containerRef: apercuRefCallback, scale: apercuScale } =
    usePageScale('width')
  const apercuScrollRef = useRef<HTMLDivElement | null>(null)
  const editeurRef = useRef<HTMLTextAreaElement | null>(null)
  const synchronisation = useRef(false)
  const image = useInsertionImage({
    classeurId: page.classeur?.id ?? null,
    documentId: doc?.id,
    contenu,
    editeurRef,
    setContenu,
  })
  const zoneEdition = useHauteurJusquEnBas()
  const miseEnForme = useMiseEnForme(editeurRef, !page.canWrite)

  const apercuRef = useCallback(
    (node: HTMLDivElement | null) => {
      apercuScrollRef.current = node
      apercuRefCallback(node)
    },
    [apercuRefCallback],
  )

  // Ctrl + S en édition.
  useEffect(() => {
    if (!editing) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        sauvegarder()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editing, sauvegarder])

  // Défilement proportionnel éditeur → aperçu.
  const synchroniserDefilement = useCallback(() => {
    if (synchronisation.current) return
    synchronisation.current = true
    const apercu = apercuScrollRef.current
    const editeur = editeurRef.current
    if (apercu && editeur) {
      const maxEditeur = editeur.scrollHeight - editeur.clientHeight
      const maxApercu = apercu.scrollHeight - apercu.clientHeight
      if (maxEditeur > 0 && maxApercu > 0) {
        apercu.scrollTop = (editeur.scrollTop / maxEditeur) * maxApercu
      }
    }
    requestAnimationFrame(() => {
      synchronisation.current = false
    })
  }, [])

  if (page.isPending) return <DetailSkeleton retour={retour} />
  if (page.isError) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <DetailHeader retour={retour} title={null} />
        <DetailErreur err={page.error} action="Document indisponible" />
      </div>
    )
  }
  if (!doc)
    return (
      <DetailIntrouvable label="Ce document n'existe plus." retour={retour} />
    )

  const titreAffiche = editing ? titreOuDefaut(titre) : titreOuDefaut(doc.title)
  const descriptionAffichee = editing ? description : doc.description
  const contenuAffiche = editing ? contenuDiffere : doc.content
  const pages = (
    <DocumentPages
      title={titreAffiche}
      subtitle={descriptionAffichee}
      content={contenuAffiche}
      chapterName={page.chapter?.label}
      classeurName={page.classeurName}
      establishment={page.establishment}
    />
  )

  return (
    <div className="flex flex-1 flex-col gap-4">
      <DetailHeader
        retour={retour}
        title={titreAffiche}
        kind="document"
        chapterName={page.chapter?.label}
        actions={
          <DetailActions
            aide={
              editing ? (
                <ButtonGroup>
                  <IconAction
                    label="Comment mettre en forme"
                    icon={<HelpGlyph />}
                    onClick={() => setAideOuverte(true)}
                  />
                  <IconAction
                    label="Titre et description"
                    icon={<Pencil />}
                    onClick={() => setTitreOuvert(true)}
                  />
                </ButtonGroup>
              ) : undefined
            }
            editing={editing}
            canWrite={page.canWrite}
            saving={edition.saving}
            statut={
              <IndicateurEnregistrement
                modifie={edition.modifie}
                brouillonEcritLe={edition.brouillonEcritLe}
              />
            }
            onEdit={edition.commencer}
            onCancel={edition.annuler}
            onSave={sauvegarder}
            onPrint={() => setPreviewOpen(true)}
            extra={
              <DetailMarkdownAction
                onClick={() => exporterDocumentMarkdown(doc.title, doc.content)}
              />
            }
          />
        }
      />

      {edition.erreur !== null && (
        <DetailErreur err={edition.erreur} action="Sauvegarde impossible" />
      )}

      {!editing && page.canWrite && edition.brouillonPropose && (
        <BandeauBrouillon
          enregistreLe={edition.brouillonPropose.enregistreLe}
          versionChangee={edition.brouillonPropose.base !== doc.updated_at}
          onReprendre={edition.reprendreBrouillon}
          onIgnorer={edition.ignorerBrouillon}
        />
      )}

      {editing ? (
        // Hauteur fixée sur la fenêtre (grand écran) : l'éditeur ne se
        // redimensionne plus à la main, chaque colonne défile en interne.
        <div
          ref={zoneEdition.ref}
          className="grid gap-4 lg:grid-cols-2"
          style={
            zoneEdition.hauteur === null
              ? undefined
              : { height: zoneEdition.hauteur }
          }
        >
          <DetailPaper
            ref={apercuRef}
            className="order-2 overflow-y-auto lg:order-1 lg:h-full"
          >
            <div
              className="flex flex-col items-center gap-4 py-4"
              style={{ zoom: apercuScale }}
            >
              {pages}
            </div>
          </DetailPaper>
          <div className="order-1 flex min-h-0 flex-col lg:order-2 lg:h-full">
            {page.canWrite && (
              <div className="flex flex-col gap-1.5 pb-2">
                <DialoguesImage image={image} />
                <BarreMiseEnForme
                  miseEnForme={miseEnForme}
                  fin={<BoutonsImage image={image} />}
                />
                <EtatImageLigne image={image} />
              </div>
            )}
            <Textarea
              ref={editeurRef}
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              onScroll={synchroniserDefilement}
              {...image.editeurProps}
              {...miseEnForme.editeurProps}
              placeholder="Écrivez ici. La barre ci-dessus met en forme (titres, gras, listes, tableaux, images) ; le bouton ? en haut explique tout."
              aria-label="Contenu du document"
              spellCheck
              className="h-[60dvh] resize-none text-[15px] leading-relaxed [field-sizing:fixed] lg:h-auto lg:min-h-0 lg:flex-1"
            />
          </div>
        </div>
      ) : (
        <DetailPaper ref={lectureRef} className="flex-1">
          <div
            className="flex flex-col items-center gap-4 py-4"
            style={{ zoom: lectureScale }}
          >
            {pages}
          </div>
        </DetailPaper>
      )}

      <TitreDocumentDialog
        open={titreOuvert}
        onOpenChange={setTitreOuvert}
        titre={titre}
        description={description}
        onAppliquer={(t, d) => {
          setTitre(t)
          setDescription(d)
        }}
      />

      <AbandonModificationsDialog
        raison={edition.confirmation?.raison ?? null}
        onContinuer={edition.continuerEdition}
        onAbandonner={edition.abandonner}
      />

      <ConflitDocumentDialog
        conflit={edition.conflit}
        contenu={contenu}
        saving={edition.saving}
        onFermer={edition.fermerConflit}
        onEcraser={edition.ecraser}
        onPrendreLaSienne={() => void edition.prendreLaSienne()}
      />

      <AideMiseEnFormeDialog open={aideOuverte} onOpenChange={setAideOuverte} />

      <PrintPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={titreAffiche}
      >
        {previewOpen && (
          <DocumentPages
            title={titreOuDefaut(doc.title)}
            subtitle={doc.description}
            content={doc.content}
            chapterName={page.chapter?.label}
            classeurName={page.classeurName}
            establishment={page.establishment}
          />
        )}
      </PrintPreview>
    </div>
  )
}

/** « 27/09 à 14:05 », heure locale. */
function dateHeure(ms: number): string {
  const d = new Date(ms)
  const date = d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  })
  const heure = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${date} à ${heure}`
}

/**
 * Amélioration n° 5 : l'état d'enregistrement, à gauche des boutons
 * Annuler / Sauvegarder. « Non enregistré » dès la première modification ;
 * l'infobulle précise si la copie de secours du poste est à jour.
 */
function IndicateurEnregistrement({
  modifie,
  brouillonEcritLe,
}: {
  modifie: boolean
  brouillonEcritLe: number | null
}) {
  if (!modifie) {
    return (
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Aucune modification
      </span>
    )
  }
  return (
    <Tip
      label={
        brouillonEcritLe === null
          ? 'Pensez à sauvegarder (Ctrl + S).'
          : `Copie de secours gardée sur ce poste (${dateHeure(brouillonEcritLe)}). Pensez à sauvegarder (Ctrl + S).`
      }
    >
      <span
        role="status"
        tabIndex={0}
        className="flex items-center gap-1.5 rounded-md text-xs font-medium text-amber-600 dark:text-amber-400"
      >
        <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" />
        Non enregistré
      </span>
    </Tip>
  )
}

/**
 * Amélioration n° 3 : un brouillon de secours existe pour ce document (sur
 * ce poste, pour ce compte). Proposé, jamais appliqué d'office.
 */
function BandeauBrouillon({
  enregistreLe,
  versionChangee,
  onReprendre,
  onIgnorer,
}: {
  enregistreLe: number
  /** Le document a été enregistré depuis le début de ce brouillon. */
  versionChangee: boolean
  onReprendre: () => void
  onIgnorer: () => void
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center"
    >
      <History className="hidden size-4 shrink-0 text-amber-600 sm:block dark:text-amber-400" />
      <p className="flex-1">
        Des modifications non enregistrées de ce document ont été retrouvées (le{' '}
        {dateHeure(enregistreLe)}).
        {versionChangee &&
          ' Le document a été enregistré depuis : à la sauvegarde, vous pourrez choisir quelle version garder.'}
      </p>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={onIgnorer}>
          Ignorer
        </Button>
        <Button size="sm" onClick={onReprendre}>
          Reprendre
        </Button>
      </div>
    </div>
  )
}

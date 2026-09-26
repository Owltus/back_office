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
  DetailFields,
  DetailHeader,
  DetailIntrouvable,
  DetailMarkdownAction,
  DetailPaper,
  DetailSkeleton,
} from '#/components/classeur/detail/DetailFrame.tsx'
import { useDetailPage } from '#/components/classeur/hooks/useDetailPage.ts'
import {
  BarreImage,
  useInsertionImage,
} from '#/components/classeur/detail/InsertionImage.tsx'
import { DocumentPages } from '#/components/classeur/print/DocumentPages.tsx'
import { PrintPreview } from '#/components/classeur/print/PrintPreview.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { exporterDocumentMarkdown } from '#/lib/classeur/exportMarkdown.ts'
import { usePageScale } from '#/lib/classeur/print/usePageScale.ts'
import { SANS_TITRE, titreOuDefaut } from '#/lib/classeur/sommaire.ts'

/**
 * Page d'un document Markdown — portée de Registre (`DocumentDetail`).
 * Lecture : les pages A4 empilées à l'échelle de la largeur. Édition :
 * titre et description dans une carte sous l'en-tête, aperçu A4 (gauche, collant) et
 * `textarea` Markdown (droite), Ctrl + S pour sauvegarder, défilement de
 * l'éditeur répercuté sur l'aperçu. Exports : PDF (`PrintPreview`) et
 * Markdown (`.md`).
 *
 * L'état d'édition est initialisé au clic sur Modifier (pas de `useEffect`
 * de synchronisation) ; l'aperçu suit la frappe avec `useDeferredValue`
 * plutôt qu'une minuterie.
 */
export function DocumentDetail() {
  const page = useDetailPage('document')
  const doc = page.item
  const retour = page.backParams

  const [editing, setEditing] = useState(false)
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [contenu, setContenu] = useState('')
  const contenuDiffere = useDeferredValue(contenu)
  const [previewOpen, setPreviewOpen] = useState(false)

  const { containerRef: lectureRef, scale: lectureScale } =
    usePageScale('width')
  const { containerRef: apercuRefCallback, scale: apercuScale } =
    usePageScale('width')
  const apercuScrollRef = useRef<HTMLDivElement | null>(null)
  const editeurRef = useRef<HTMLTextAreaElement | null>(null)
  const synchronisation = useRef(false)
  const image = useInsertionImage({
    classeurId: page.classeur?.id ?? null,
    editeurRef,
    setContenu,
  })

  const apercuRef = useCallback(
    (node: HTMLDivElement | null) => {
      apercuScrollRef.current = node
      apercuRefCallback(node)
    },
    [apercuRefCallback],
  )

  const commencerEdition = () => {
    if (!doc) return
    setTitre(doc.title)
    setDescription(doc.description)
    setContenu(doc.content)
    page.update.reset()
    setEditing(true)
  }

  const annuler = () => {
    setEditing(false)
    page.update.reset()
  }

  const sauvegarder = useCallback(async () => {
    if (!doc || page.update.isPending) return
    try {
      await page.update.mutateAsync({
        title: titre.trim() || SANS_TITRE,
        description: description.trim(),
        content: contenu,
      })
      setEditing(false)
    } catch {
      // L'erreur est affichée par `page.update.error`.
    }
  }, [doc, page.update, titre, description, contenu])

  // Ctrl + S en édition.
  useEffect(() => {
    if (!editing) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void sauvegarder()
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
            editing={editing}
            canWrite={page.canWrite}
            saving={page.update.isPending}
            onEdit={commencerEdition}
            onCancel={annuler}
            onSave={() => void sauvegarder()}
            onPrint={() => setPreviewOpen(true)}
            extra={
              <DetailMarkdownAction
                onClick={() => exporterDocumentMarkdown(doc.title, doc.content)}
              />
            }
          />
        }
      />

      {editing && (
        <DetailFields>
          <Input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Titre du document"
            aria-label="Titre du document"
            className="font-medium sm:flex-1"
            maxLength={200}
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            aria-label="Description du document"
            className="sm:w-56"
            maxLength={1000}
          />
        </DetailFields>
      )}

      {page.update.isError && (
        <DetailErreur err={page.update.error} action="Sauvegarde impossible" />
      )}

      {editing ? (
        <div className="grid flex-1 gap-4 lg:grid-cols-2">
          <DetailPaper
            ref={apercuRef}
            className="order-2 overflow-y-auto lg:sticky lg:top-0 lg:order-1 lg:max-h-[calc(100dvh-8rem)]"
          >
            <div
              className="flex flex-col items-center gap-4 py-4"
              style={{ zoom: apercuScale }}
            >
              {pages}
            </div>
          </DetailPaper>
          <div className="order-1 flex flex-col lg:order-2">
            {page.canWrite && <BarreImage image={image} />}
            <Textarea
              ref={editeurRef}
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              onScroll={synchroniserDefilement}
              {...image.editeurProps}
              placeholder="Écrivez en Markdown. Tableaux, formules et diagrammes Mermaid sont pris en charge ; une ligne === force un saut de page."
              aria-label="Contenu Markdown"
              spellCheck
              className="h-[70vh] resize-y font-mono text-sm"
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

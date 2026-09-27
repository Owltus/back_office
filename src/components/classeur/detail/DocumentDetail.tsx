import { History, PanelLeftClose, PanelLeftOpen, Pencil } from 'lucide-react'
import type { MouseEvent } from 'react'
import {
  useCallback,
  useMemo,
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
import { AlertesRelecture } from '#/components/classeur/detail/AlertesRelecture.tsx'
import {
  allerALigne,
  ligneDePosition,
} from '#/components/classeur/detail/editionTextarea.ts'
import { useImages } from '#/components/classeur/hooks/useImages.ts'
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
import {
  ligneRendueVersSource,
  ligneSourceVersRendue,
} from '#/lib/classeur/print/lignesSource.ts'
import { usePageScale } from '#/lib/classeur/print/usePageScale.ts'
import { alertesRelecture } from '#/lib/classeur/relecture.ts'
import {
  MENTION_EN_COURS,
  mentionVersion,
} from '#/lib/classeur/print/mentionVersion.ts'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'
import { cn } from '#/lib/utils.ts'

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
  /** 17. Aperçu masqué : le texte prend toute la largeur. */
  const [apercuMasque, setApercuMasque] = useState(false)
  /** 19. Nombre de pages de l'aperçu, affiché discrètement en édition. */
  const [nbPages, setNbPages] = useState<number | null>(null)

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

  /** Instant du dernier défilement PILOTÉ (clic dans l'aperçu, alerte). */
  const defilementPilote = useRef(0)

  // Défilement proportionnel éditeur → aperçu. Muet juste après un
  // défilement piloté : il ramènerait l'aperçu ailleurs que sur le bloc.
  const synchroniserDefilement = useCallback(() => {
    if (synchronisation.current) return
    if (performance.now() - defilementPilote.current < 400) return
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

  /** Curseur au début d'une ligne du texte, texte défilé jusqu'à elle. */
  const allerA = useCallback((ligne: number) => {
    const ta = editeurRef.current
    if (!ta) return
    defilementPilote.current = performance.now()
    allerALigne(ta, ligne)
  }, [])

  // 16. Aperçu → texte : un clic sur un bloc de l'aperçu amène le curseur
  // sur sa ligne (`data-ligne`, posé par `rehypeLignesSource`).
  const surClicApercu = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const ta = editeurRef.current
      if (!ta || !(e.target instanceof Element)) return
      const bloc = e.target.closest<HTMLElement>('.a4-page [data-ligne]')
      const rendue = Number(bloc?.dataset.ligne)
      if (!Number.isFinite(rendue) || rendue < 1) return
      allerA(ligneRendueVersSource(ta.value, rendue))
    },
    [allerA],
  )

  // 16. Texte → aperçu : quand le curseur change de ligne, l'aperçu montre
  // le bloc correspondant s'il n'est pas déjà visible.
  useEffect(() => {
    if (!editing) return
    let derniere = -1
    const surSelection = () => {
      const ta = editeurRef.current
      const apercu = apercuScrollRef.current
      if (!ta || !apercu || document.activeElement !== ta) return
      const ligne = ligneDePosition(ta.value, ta.selectionStart)
      if (ligne === derniere) return
      derniere = ligne
      const rendue = ligneSourceVersRendue(ta.value, ligne)
      let bloc: HTMLElement | null = null
      let meilleure = 0
      for (const el of apercu.querySelectorAll<HTMLElement>(
        '.a4-page [data-ligne]',
      )) {
        const n = Number(el.dataset.ligne)
        // Le plus proche au-dessus ; à égalité, le plus imbriqué (après).
        if (n <= rendue && n >= meilleure) {
          meilleure = n
          bloc = el
        }
      }
      if (!bloc) return
      const r = bloc.getBoundingClientRect()
      const c = apercu.getBoundingClientRect()
      if (r.top >= c.top && r.bottom <= c.bottom) return
      apercu.scrollTop += r.top - c.top - c.height / 3
    }
    document.addEventListener('selectionchange', surSelection)
    return () => document.removeEventListener('selectionchange', surSelection)
  }, [editing])

  // 18. Alertes de relecture, sur le texte différé (comme l'aperçu).
  const images = useImages(page.classeur?.id ?? Number.NaN, editing)
  const imagesConnues = useMemo(
    () =>
      images.data
        ? new Set(images.data.map((i) => i.chemin.toLowerCase()))
        : null,
    [images.data],
  )
  const alertes = useMemo(
    () => (editing ? alertesRelecture(contenuDiffere, imagesConnues) : []),
    [editing, contenuDiffere, imagesConnues],
  )

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
      mention={editing ? MENTION_EN_COURS : mentionVersion(doc.updated_at)}
      onPageCount={setNbPages}
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
                  <IconAction
                    label={
                      apercuMasque ? "Afficher l'aperçu" : "Masquer l'aperçu"
                    }
                    icon={apercuMasque ? <PanelLeftOpen /> : <PanelLeftClose />}
                    aria-pressed={apercuMasque}
                    className="hidden lg:inline-flex"
                    onClick={() => setApercuMasque((m) => !m)}
                  />
                </ButtonGroup>
              ) : undefined
            }
            editing={editing}
            canWrite={page.canWrite}
            saving={edition.saving}
            statut={
              <>
                {nbPages !== null && (
                  <span
                    className="hidden text-xs text-muted-foreground tabular-nums md:inline"
                    title="Nombre de pages imprimées"
                  >
                    {nbPages} {nbPages > 1 ? 'pages' : 'page'}
                  </span>
                )}
                <IndicateurEnregistrement
                  modifie={edition.modifie}
                  brouillonEcritLe={edition.brouillonEcritLe}
                />
              </>
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
          className={cn(
            'grid gap-4',
            apercuMasque ? 'lg:grid-cols-1' : 'lg:grid-cols-2',
          )}
          style={
            zoneEdition.hauteur === null
              ? undefined
              : { height: zoneEdition.hauteur }
          }
        >
          <DetailPaper
            ref={apercuRef}
            className={cn(
              'order-2 cursor-text overflow-y-auto lg:order-1 lg:h-full',
              apercuMasque && 'lg:hidden',
            )}
            title="Cliquez sur un passage pour y aller dans le texte"
            onClick={surClicApercu}
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
                <AlertesRelecture alertes={alertes} onAller={allerA} />
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
            mention={mentionVersion(doc.updated_at)}
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

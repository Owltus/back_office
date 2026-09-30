import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import {
  Archive,
  Braces,
  CheckSquare,
  FileUp,
  FolderInput,
  ListChecks,
  MoreHorizontal,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { DocumentCard } from '#/components/classeur/cards/DocumentCard.tsx'
import { IntercalaireCard } from '#/components/classeur/cards/IntercalaireCard.tsx'
import { SignatureSheetCard } from '#/components/classeur/cards/SignatureSheetCard.tsx'
import { TrackingSheetCard } from '#/components/classeur/cards/TrackingSheetCard.tsx'
import { useDroitsClasseur } from '#/components/classeur/hooks/useDroitsClasseur.ts'
import { ChapterDrawerButton } from '#/components/classeur/ChapterDrawer.tsx'
import { BulkDeleteDialog } from '#/components/classeur/dialogs/BulkDeleteDialog.tsx'
import { ChapterDialog } from '#/components/classeur/dialogs/ChapterDialog.tsx'
import { EchangeJsonDialog } from '#/components/classeur/dialogs/EchangeJsonDialog.tsx'
import { SuppressionChapitreDialog } from '#/components/classeur/dialogs/SuppressionChapitreDialog.tsx'
import { CreateItemDialog } from '#/components/classeur/dialogs/CreateItemDialog.tsx'
import { DeleteItemDialog } from '#/components/classeur/dialogs/DeleteItemDialog.tsx'
import type { ItemASupprimer } from '#/components/classeur/dialogs/DeleteItemDialog.tsx'
import { EditItemDialog } from '#/components/classeur/dialogs/EditItemDialog.tsx'
import type { EditableItem } from '#/components/classeur/dialogs/EditItemDialog.tsx'
import { EditTrackingSheetDialog } from '#/components/classeur/dialogs/EditTrackingSheetDialog.tsx'
import {
  parseChapterDropId,
  useDndRegistry,
} from '#/components/classeur/dnd/useDndRegistry.ts'
import type { ItemDragData } from '#/components/classeur/dnd/useDndRegistry.ts'
import { DropOverlay } from '#/components/classeur/DropZone.tsx'
import { useChapterZoom } from '#/components/classeur/hooks/useChapterZoom.ts'
import {
  useChapter,
  useChapterContent,
  useChapters,
  useClasseur,
  useInvaliderClasseur,
  usePeriodicites,
  useReorderItems,
} from '#/components/classeur/hooks/useClasseur.ts'
import { useDropZone } from '#/components/classeur/hooks/useDropZone.ts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { useSelection } from '#/components/classeur/hooks/useSelection.ts'
import { IconAction } from '#/components/classeur/IconAction.tsx'
import {
  ChapterPrintPages,
  ItemPages,
} from '#/components/classeur/print/ItemPages.tsx'
import { PrintPreview } from '#/components/classeur/print/PrintPreview.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { FormeChapitre } from '#/components/shared/skeleton/PageShapes.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { exporterChapitreZip } from '#/lib/classeur/exportMarkdown.ts'
import type { FichierImporte } from '#/lib/classeur/importFichiers.ts'
import {
  DEFAULT_REGISTRY_NAME,
  buildEstablishment,
  getIcon,
} from '#/lib/classeur/naming.ts'
import { cleRef, deplacer, parseCleRef, refsDe } from '#/lib/classeur/ordre.ts'
import type { ItemRef } from '#/lib/classeur/ordre.ts'
import { createItem, moveItems } from '#/lib/classeur/service.ts'
import { contientSansAccents, stripAccents } from '#/lib/classeur/slug.ts'
import { ITEM_KINDS, flattenItems } from '#/lib/classeur/types.ts'
import type { ChapterItem, DbTrackingSheet } from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

/** Stratégie de tri sans effet : la grille ne bouge pas en mode sélection. */
const strategieInerte = () => null

/** Ce que montre l'aperçu avant impression : un élément, ou tout le chapitre. */
type Apercu = { type: 'item'; item: ChapterItem } | { type: 'tout' } | null

/**
 * Page d'un chapitre — portée de Registre (`ChapterPage`, 940 l.) :
 * en-tête (icône, libellé, description ; édition et suppression douce avec
 * le droit `ecriture`), recherche instantanée (titre, description, contenu,
 * accents ignorés), grille des éléments avec miniature A4, réordonnancement
 * par glisser-déposer, dépôt sur un chapitre de la colonne (déplacement),
 * sélection multiple (Ctrl + clic) et suppression groupée, création des
 * quatre natures, export Markdown du chapitre (ZIP), impression d'un élément
 * ou du chapitre entier, import de fichiers `.md` / `.txt` par dépôt.
 *
 * Toutes les écritures passent par `useMutation` et invalident
 * `classeurKeys.all`. La route monte ce composant avec `key={chapterId}` :
 * changer de chapitre remet sélection, recherche et dialogues à zéro sans
 * effet de nettoyage.
 */
export function ChapterBoard({
  classeurId,
  chapterId,
}: {
  classeurId: number
  chapterId: number
}) {
  const { canWrite } = useDroitsClasseur(classeurId)
  const navigate = useNavigate()
  const invalider = useInvaliderClasseur()

  const classeurQ = useClasseur(classeurId)
  const chapterQ = useChapter(chapterId)
  const contenuQ = useChapterContent(chapterId)
  const periodicitesQ = usePeriodicites()

  const classeur = classeurQ.data ?? null
  const chapter = chapterQ.data ?? null
  const classeurName = classeur?.name ?? DEFAULT_REGISTRY_NAME
  const establishment = buildEstablishment(classeur)
  const periodicites = useMemo(
    () => periodicitesQ.data ?? [],
    [periodicitesQ.data],
  )
  const contenu = contenuQ.data
  const items = useMemo(() => (contenu ? flattenItems(contenu) : []), [contenu])

  // Recherche instantanée (comme le tableau de bord : `useDeferredValue`).
  const [recherche, setRecherche] = useState('')
  const requete = useDeferredValue(stripAccents(recherche.trim()))
  const enRecherche = requete !== ''
  const filtres = useMemo(() => {
    if (!enRecherche) return items
    return items.filter((it) => {
      const d = it.data
      const description = 'description' in d ? d.description : ''
      const texte = it.kind === 'document' ? it.data.content : ''
      return (
        contientSansAccents(d.title, requete) ||
        contientSansAccents(description, requete) ||
        contientSansAccents(texte, requete)
      )
    })
  }, [items, requete, enRecherche])

  const selection = useSelection()
  const { gridStyle, containerRef } = useChapterZoom()
  const { registerHandler, unregisterHandler, activeDragType } =
    useDndRegistry()
  const selectionDragging = selection.selectionMode && activeDragType !== null

  // Dialogues
  const [createOpen, setCreateOpen] = useState(false)
  const [editChapterOpen, setEditChapterOpen] = useState(false)
  const [deleteChapterOpen, setDeleteChapterOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [itemEdite, setItemEdite] = useState<EditableItem | null>(null)
  const [feuilleEditee, setFeuilleEditee] = useState<DbTrackingSheet | null>(
    null,
  )
  const [itemASupprimer, setItemASupprimer] = useState<ItemASupprimer | null>(
    null,
  )
  const [apercu, setApercu] = useState<Apercu>(null)
  /** Export / réimport JSON du chapitre pour un LLM (2026-09-29). */
  const [jsonOuvert, setJsonOuvert] = useState(false)
  /** Messages des fichiers refusés au dépôt (extension, taille). */
  const [refus, setRefus] = useState<string[]>([])

  // Écritures
  const reorder = useReorderItems(chapterId)

  const deplacement = useMutation({
    mutationFn: ({
      refs,
      cible,
    }: {
      refs: ReadonlyArray<ItemRef>
      cible: number
    }) => moveItems(refs, cible),
    onSuccess: async () => {
      await invalider()
      selection.clear()
    },
  })

  const importation = useMutation({
    mutationFn: async (fichiers: FichierImporte[]) => {
      // En série : `createItem` calcule le prochain `sort_order` à chaque appel.
      for (const f of fichiers) {
        await createItem(chapterId, {
          kind: 'document',
          input: { title: f.title, description: '', content: f.content },
        })
      }
      return fichiers.length
    },
    onSuccess: () => invalider(),
  })

  const exportZip = useMutation({
    mutationFn: async () => {
      if (!chapter || !contenu) return
      await exporterChapitreZip(classeurName, chapter, contenu, periodicites)
    },
  })

  // Dépôt de fichiers (droit `ecriture` seulement).
  const onImport = useCallback(
    (fichiers: FichierImporte[]) => {
      setRefus([])
      importation.mutate(fichiers)
    },
    [importation],
  )
  const { isDragOver, dragProps, importer } = useDropZone(onImport, setRefus)
  const inputFichiersRef = useRef<HTMLInputElement>(null)
  const chapitres = useChapters(classeurId)
  const autresChapitres = (chapitres.data ?? []).filter(
    (c) => c.id !== chapterId,
  )

  // Glisser-déposer : réordonnancement dans la grille OU dépôt sur un
  // chapitre de la colonne (déplacement, de la sélection s'il y en a une).
  const handleItemDrop = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const data = active.data.current as ItemDragData | undefined
      if (!data) return

      const cible = parseChapterDropId(over.id)
      if (cible !== null) {
        if (cible === data.sourceChapterId) return
        const refs: ItemRef[] =
          selection.selectionMode && selection.count > 0
            ? selection.refs
            : [{ kind: data.type, id: data.itemId }]
        deplacement.mutate({ refs, cible })
        return
      }

      if (selection.selectionMode) return
      const de = parseCleRef(active.id)
      const vers = parseCleRef(over.id)
      if (!de || !vers) return
      const refs = refsDe(items)
      const memeRef = (r: ItemRef, x: ItemRef) =>
        r.kind === x.kind && r.id === x.id
      const oldIndex = refs.findIndex((r) => memeRef(r, de))
      const newIndex = refs.findIndex((r) => memeRef(r, vers))
      if (oldIndex === -1 || newIndex === -1) return
      reorder.mutate(deplacer(refs, oldIndex, newIndex))
    },
    [items, selection, deplacement, reorder],
  )

  // Abonnement au registre partagé (pas une lecture de données).
  useEffect(() => {
    for (const kind of ITEM_KINDS) registerHandler(kind, handleItemDrop)
    return () => {
      for (const kind of ITEM_KINDS) unregisterHandler(kind)
    }
  }, [registerHandler, unregisterHandler, handleItemDrop])

  // Chapitre supprimé ou inexistant : `null` une fois la lecture réussie.
  if (chapterQ.isSuccess && chapter === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        <p className="text-sm">Ce chapitre n'existe plus.</p>
        <Button asChild size="sm" variant="outline">
          <Link
            to="/classeur/$classeurId"
            params={{ classeurId: String(classeurId) }}
          >
            Accueil du classeur
          </Link>
        </Button>
      </div>
    )
  }

  const IconeChapitre = getIcon(chapter?.icon ?? 'FileText')
  const contexteCartes = {
    classeurId,
    chapterId,
    chapterName: chapter?.label,
    classeurName,
    establishment,
    canWrite,
    // En mode sélection, le glisser reste ACTIF (dépôt de la sélection sur un
    // chapitre de la colonne) ; seule la grille ne se réordonne plus.
    sortableDisabled: enRecherche,
    selectionMode: selection.selectionMode,
    selectionDragging,
  }

  const supprimer = (it: ChapterItem) =>
    setItemASupprimer({ kind: it.kind, id: it.data.id, title: it.data.title })
  const modifier = (it: ChapterItem) => {
    if (it.kind === 'tracking_sheet') setFeuilleEditee(it.data)
    else
      setItemEdite({
        kind: it.kind,
        id: it.data.id,
        title: it.data.title,
        description: it.data.description,
      })
  }

  const erreurs: Array<{ cle: string; err: unknown; action: string }> = []
  if (chapterQ.isError)
    erreurs.push({
      cle: 'chapitre',
      err: chapterQ.error,
      action: 'Chapitre indisponible',
    })
  if (contenuQ.isError)
    erreurs.push({
      cle: 'contenu',
      err: contenuQ.error,
      action: 'Éléments indisponibles',
    })
  if (reorder.isError)
    erreurs.push({
      cle: 'ordre',
      err: reorder.error,
      action: 'Ordre non enregistré',
    })
  if (deplacement.isError)
    erreurs.push({
      cle: 'deplacement',
      err: deplacement.error,
      action: 'Déplacement impossible',
    })
  if (importation.isError)
    erreurs.push({
      cle: 'import',
      err: importation.error,
      action: 'Import impossible',
    })
  if (exportZip.isError)
    erreurs.push({
      cle: 'export',
      err: exportZip.error,
      action: 'Export impossible',
    })

  return (
    <div
      className="flex w-full flex-1 flex-col gap-4"
      {...(canWrite ? dragProps : {})}
    >
      <PageHeader
        leading={<ChapterDrawerButton />}
        title={
          chapterQ.isPending ? (
            <Skeleton className="h-7 w-56" />
          ) : (
            <span className="flex items-center gap-2">
              <IconeChapitre className="size-5 shrink-0 text-muted-foreground" />
              {chapter?.label}
            </span>
          )
        }
        meta={chapter?.description.trim() ? chapter.description : undefined}
      />

      {erreurs.map((e) => (
        <div
          key={e.cle}
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {messageErreur(e.err, e.action)}
        </div>
      ))}

      {refus.length > 0 && (
        <ul className="list-inside list-disc rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {refus.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {importation.isPending && (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertDescription>Import des fichiers en cours.</AlertDescription>
        </Alert>
      )}

      {/* Recherche à gauche, boutons du chapitre à droite, sur UNE ligne à
          toute largeur (demande utilisateur du 2026-09-28, comme l'accueil
          du classeur) : la recherche absorbe le rétrécissement. */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="Rechercher dans le chapitre"
            aria-label="Rechercher dans le chapitre"
            className="pl-9"
            disabled={!contenu}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setRecherche('')
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selection.selectionMode ? (
            /* Mode sélection : compteur puis UN groupe (tout sélectionner,
               supprimer la sélection, annuler). */
            <>
              {/* Sous 640 px, compteur retiré de l'écran (demande
                  utilisateur : inutile et encombrant) ; il reste annoncé aux
                  lecteurs d'écran. */}
              <span
                className="text-sm text-muted-foreground max-sm:sr-only"
                aria-live="polite"
              >
                {selection.count} sélectionné{selection.count > 1 ? 's' : ''}
              </span>
              <ButtonGroup>
                <IconAction
                  label="Tout sélectionner"
                  icon={<CheckSquare />}
                  onClick={() => selection.selectAll(filtres)}
                />
                {/* Déplacer vers un autre chapitre : sans glisser (seule voie
                    au doigt et sous 1024 px, où la colonne est un tiroir). */}
                {canWrite && autresChapitres.length > 0 && (
                  <DropdownMenu>
                    <Tip label="Déplacer vers un autre chapitre">
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label="Déplacer vers un autre chapitre"
                          disabled={
                            selection.count === 0 || deplacement.isPending
                          }
                        >
                          {deplacement.isPending ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <FolderInput />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                    </Tip>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel>Déplacer vers…</DropdownMenuLabel>
                      {autresChapitres.map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onSelect={() =>
                            deplacement.mutate({
                              refs: selection.refs,
                              cible: c.id,
                            })
                          }
                        >
                          <span className="truncate">{c.label}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {canWrite && (
                  <IconAction
                    label="Supprimer la sélection"
                    icon={<Trash2 />}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setBulkOpen(true)}
                    disabled={selection.count === 0}
                  />
                )}
                <IconAction
                  label="Annuler la sélection"
                  icon={<X />}
                  onClick={selection.clear}
                />
              </ButtonGroup>
            </>
          ) : (
            /* Création (outline sm, comme « Ajouter un compte »), puis le
               groupe lecture (impression, export) et le groupe écriture
               (modifier, supprimer — icône rouge, jamais de fond plein). */
            <>
              <input
                ref={inputFichiersRef}
                type="file"
                multiple
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) importer(e.target.files)
                  e.target.value = ''
                }}
              />
              {/* ≥ 640 px : tous les boutons, comme avant. */}
              <div className="contents max-sm:hidden">
                {canWrite && chapter && (
                  <Tip label="Ajouter un document, une feuille ou un intercalaire">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCreateOpen(true)}
                    >
                      <Plus />
                      Nouvel élément
                    </Button>
                  </Tip>
                )}
                {canWrite && chapter && (
                  <ButtonGroup>
                    {/* Sélection et import SANS clavier ni glisser de
                        fichiers : les seules voies au doigt. */}
                    <IconAction
                      label="Sélectionner des éléments"
                      icon={<ListChecks />}
                      onClick={selection.commencer}
                      disabled={items.length === 0}
                    />
                    <IconAction
                      label="Importer des fichiers .md ou .txt"
                      icon={<FileUp />}
                      onClick={() => inputFichiersRef.current?.click()}
                      busy={importation.isPending}
                    />
                  </ButtonGroup>
                )}
                <ButtonGroup>
                  <IconAction
                    label="Imprimer le chapitre ou l'enregistrer en PDF"
                    icon={<Printer />}
                    onClick={() => setApercu({ type: 'tout' })}
                    disabled={!chapter || items.length === 0}
                  />
                  <IconAction
                    label="Exporter le chapitre en Markdown (ZIP)"
                    icon={<Archive />}
                    onClick={() => exportZip.mutate()}
                    disabled={!chapter || !contenu}
                    busy={exportZip.isPending}
                  />
                  <IconAction
                    label="JSON pour un LLM : exporter, réimporter"
                    icon={<Braces />}
                    onClick={() => setJsonOuvert(true)}
                    disabled={!chapter || !contenu}
                  />
                </ButtonGroup>
                {canWrite && chapter && (
                  <ButtonGroup>
                    <IconAction
                      label="Modifier le chapitre"
                      icon={<Pencil />}
                      onClick={() => setEditChapterOpen(true)}
                    />
                    <IconAction
                      label="Supprimer le chapitre"
                      icon={<Trash2 />}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteChapterOpen(true)}
                    />
                  </ButtonGroup>
                )}
              </div>
              {/* < 640 px : l'essentiel reste visible (créer, sélectionner),
                  le reste passe dans « ⋯ » — sinon la ligne débordait et
                  « Nouvel élément » sortait de l'écran par la gauche. */}
              <div className="hidden max-sm:contents">
                {canWrite && chapter && (
                  <>
                    <IconAction
                      label="Ajouter un document, une feuille ou un intercalaire"
                      icon={<Plus />}
                      onClick={() => setCreateOpen(true)}
                    />
                    <IconAction
                      label="Sélectionner des éléments"
                      icon={<ListChecks />}
                      onClick={selection.commencer}
                      disabled={items.length === 0}
                    />
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Autres actions du chapitre"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem
                      disabled={!chapter || items.length === 0}
                      onSelect={() => setApercu({ type: 'tout' })}
                    >
                      <Printer />
                      Imprimer ou PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!chapter || !contenu}
                      onSelect={() => exportZip.mutate()}
                    >
                      <Archive />
                      Exporter en Markdown (ZIP)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!chapter || !contenu}
                      onSelect={() => setJsonOuvert(true)}
                    >
                      <Braces />
                      JSON pour un LLM
                    </DropdownMenuItem>
                    {canWrite && chapter && (
                      <>
                        <DropdownMenuItem
                          onSelect={() => inputFichiersRef.current?.click()}
                        >
                          <FileUp />
                          Importer des fichiers .md ou .txt
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setEditChapterOpen(true)}
                        >
                          <Pencil />
                          Modifier le chapitre
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleteChapterOpen(true)}
                        >
                          <Trash2 />
                          Supprimer le chapitre
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Zone de dépôt : prend tout l'espace restant */}
      <div className="relative flex flex-1 flex-col">
        {isDragOver && <DropOverlay />}

        {contenuQ.isPending ? (
          /* DÉLÈGUE à `FormeChapitre` avec la grille du zoom courant (la
             recherche est déjà rendue au-dessus). */
          <FormeChapitre recherche={false} gridStyle={gridStyle} />
        ) : contenuQ.isError ? null : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            <p className="text-sm">
              Aucun élément dans ce chapitre.
              {canWrite &&
                ' Déposez des fichiers .md ou .txt pour les importer.'}
            </p>
            {canWrite && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreateOpen(true)}
              >
                <Plus />
                Nouvel élément
              </Button>
            )}
          </div>
        ) : filtres.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Aucun élément ne correspond à cette recherche.
          </div>
        ) : (
          <SortableContext
            items={filtres.map((it) => cleRef(it.kind, it.data.id))}
            strategy={
              selection.selectionMode ? strategieInerte : rectSortingStrategy
            }
            disabled={enRecherche || !canWrite}
          >
            <div
              ref={containerRef}
              className={cn('grid gap-4', selectionDragging && 'select-none')}
              style={gridStyle}
            >
              {filtres.map((it) => {
                const cle = cleRef(it.kind, it.data.id)
                const props = {
                  ...contexteCartes,
                  isSelected: selection.selected.has(cle),
                  onToggleSelect: () => selection.toggle(cle),
                  onPrint: () => setApercu({ type: 'item', item: it }),
                  onEdit: () => modifier(it),
                  onDelete: () => supprimer(it),
                }
                switch (it.kind) {
                  case 'document':
                    return <DocumentCard key={cle} doc={it.data} {...props} />
                  case 'tracking_sheet':
                    return (
                      <TrackingSheetCard
                        key={cle}
                        sheet={it.data}
                        periodicite={periodicites.find(
                          (p) => p.id === it.data.periodicite_id,
                        )}
                        {...props}
                      />
                    )
                  case 'signature_sheet':
                    return (
                      <SignatureSheetCard
                        key={cle}
                        sheet={it.data}
                        {...props}
                      />
                    )
                  case 'intercalaire':
                    return (
                      <IntercalaireCard key={cle} page={it.data} {...props} />
                    )
                }
              })}
            </div>
          </SortableContext>
        )}
      </div>

      {/* Aperçu avant impression : un élément ou le chapitre entier */}
      <PrintPreview
        open={apercu !== null}
        onOpenChange={(open) => {
          if (!open) setApercu(null)
        }}
        title={
          apercu?.type === 'tout'
            ? `${chapter?.label ?? 'Chapitre'} — chapitre complet`
            : apercu?.type === 'item'
              ? apercu.item.data.title || 'Sans titre'
              : undefined
        }
      >
        {apercu?.type === 'item' && (
          <ItemPages
            item={apercu.item}
            chapterName={chapter?.label}
            classeurName={classeurName}
            establishment={establishment}
            periodicites={periodicites}
          />
        )}
        {apercu?.type === 'tout' && chapter && contenu && (
          <ChapterPrintPages
            chapter={chapter}
            content={contenu}
            classeurName={classeurName}
            establishment={establishment}
            periodicites={periodicites}
          />
        )}
      </PrintPreview>

      <CreateItemDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        chapterId={chapterId}
      />

      <EditItemDialog item={itemEdite} onClose={() => setItemEdite(null)} />

      <EditTrackingSheetDialog
        sheet={feuilleEditee}
        onClose={() => setFeuilleEditee(null)}
      />

      <DeleteItemDialog
        item={itemASupprimer}
        onClose={() => setItemASupprimer(null)}
      />

      <BulkDeleteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        refs={selection.refs}
        onDone={selection.clear}
      />

      <EchangeJsonDialog
        open={jsonOuvert}
        onOpenChange={setJsonOuvert}
        classeur={classeur}
        sujet={
          chapter && contenu
            ? { type: 'chapitre', chapitre: chapter, contenu }
            : null
        }
        canWrite={canWrite}
      />

      <ChapterDialog
        open={editChapterOpen}
        onOpenChange={setEditChapterOpen}
        classeurId={classeurId}
        chapter={chapter}
      />

      <SuppressionChapitreDialog
        chapter={deleteChapterOpen ? chapter : null}
        onClose={() => setDeleteChapterOpen(false)}
        onSupprime={() =>
          void navigate({
            to: '/classeur/$classeurId',
            params: { classeurId: String(classeurId) },
          })
        }
      />
    </div>
  )
}

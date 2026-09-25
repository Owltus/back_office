import { useDeferredValue, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Archive,
  Bookmark,
  FileDown,
  FileText,
  FileUp,
  History,
  List,
  Pencil,
  PenLine,
  Plus,
  Printer,
  Search,
  Table2,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { ChapterDrawerButton } from '#/components/classeur/ChapterDrawer.tsx'
import { ChapterDialog } from '#/components/classeur/dialogs/ChapterDialog.tsx'
import { ClasseurDialog } from '#/components/classeur/dialogs/ClasseurDialog.tsx'
import {
  useChapters,
  useClasseur,
  useClasseurContent,
  useInvaliderClasseur,
} from '#/components/classeur/hooks/useClasseur.ts'
import { IconAction } from '#/components/classeur/IconAction.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { FormeClasseurDashboard } from '#/components/shared/skeleton/PageShapes.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { DEFAULT_REGISTRY_NAME, getIcon } from '#/lib/classeur/naming.ts'
import { softDeleteChapter } from '#/lib/classeur/service.ts'
import { contientSansAccents } from '#/lib/classeur/slug.ts'
import {
  ITEM_LABEL,
  computeStatus,
  flattenItems,
} from '#/lib/classeur/types.ts'
import type {
  ChapterContent,
  ChapterStatus,
  DbChapter,
  DbClasseur,
  ItemKind,
} from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

/** Ce que reçoivent les rappels d'action : le classeur et tout son contenu. */
export interface DashboardContexte {
  classeur: DbClasseur
  chapters: DbChapter[]
  content: ChapterContent
}

/** Un résultat de la recherche instantanée. */
export interface ClasseurSearchResult {
  kind: ItemKind
  id: number
  title: string
  description: string
  chapterId: number
  chapterName: string
}

/** Action en cours, pour l'état du bouton concerné (Loader2). */
export type DashboardBusy =
  'pdf' | 'markdown' | 'json' | 'import' | 'sommaire' | null

const ICONE_KIND: Record<ItemKind, LucideIcon> = {
  document: FileText,
  tracking_sheet: Table2,
  signature_sheet: PenLine,
  intercalaire: Bookmark,
}

const STATUT: Record<ChapterStatus, { label: string; className: string }> = {
  conforme: {
    label: 'Renseigné',
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  a_verifier: {
    label: 'À compléter',
    className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  non_conforme: {
    label: 'Non conforme',
    className: 'bg-destructive/15 text-destructive',
  },
}

/**
 * Tableau de bord d'un classeur — porté de Registre (`DashboardPage`) :
 * en-tête (nom, icône, établissement) dont la barre d'actions porte TOUT
 * (création de chapitre, sommaire, impression, exports, import, historique,
 * édition du classeur — comme sur les autres pages, plus de grille de
 * « cartes d'actions »), section « Chapitres » avec la recherche
 * instantanée dans tout le classeur (titres, descriptions, contenus, accents
 * ignorés) à droite de son titre, grille des chapitres avec statut
 * (`computeStatus`).
 *
 * POINTS D'EXTENSION (branchés par `ClasseurDashboardActions`) : les
 * rappels `onSommaire`, `onExporterPdf`, `onExporterMarkdown`,
 * `onExporterJson`, `onImporter` reçoivent le `DashboardContexte` chargé.
 * Absent, le bouton correspondant n'est pas rendu. `busy` fait tourner le
 * bouton de l'action en cours ; tous sont désactivés tant que le contenu
 * n'est pas chargé. `renderResult` remplace le rendu par défaut d'un
 * résultat de recherche.
 */
export function ClasseurDashboard({
  classeurId,
  onSommaire,
  onExporterPdf,
  onExporterMarkdown,
  onExporterJson,
  onImporter,
  onHistorique,
  busy = null,
  renderResult,
}: {
  classeurId: number
  onSommaire?: (ctx: DashboardContexte) => void
  onExporterPdf?: (ctx: DashboardContexte) => void
  onExporterMarkdown?: (ctx: DashboardContexte) => void
  onExporterJson?: (ctx: DashboardContexte) => void
  onImporter?: (ctx: DashboardContexte) => void
  /** Ouvre l'historique des imports (instantanés restaurables). Sans ctx : la
   * liste est lue par le dialogue lui-même. */
  onHistorique?: () => void
  busy?: DashboardBusy
  renderResult?: (result: ClasseurSearchResult) => ReactNode
}) {
  const { can } = useAuth()
  const canWrite = can('classeur', 'ecriture')
  const navigate = useNavigate()
  const invalider = useInvaliderClasseur()

  const classeurQ = useClasseur(classeurId)
  const chapitresQ = useChapters(classeurId)
  const contenuQ = useClasseurContent(classeurId)

  const classeur = classeurQ.data ?? null
  const chapters = chapitresQ.data ?? []
  const content = contenuQ.data?.content
  const classeurName = classeur?.name ?? DEFAULT_REGISTRY_NAME
  const etablissement = classeur
    ? [classeur.etablissement, classeur.etablissement_complement]
        .filter((s) => s.trim() !== '')
        .join(' · ')
    : ''
  const IconeClasseur = getIcon(classeur?.icon ?? 'BookOpen')

  const [editOpen, setEditOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [chapitreEdite, setChapitreEdite] = useState<DbChapter | null>(null)
  const [chapitreASupprimer, setChapitreASupprimer] =
    useState<DbChapter | null>(null)

  const suppression = useMutation({
    mutationFn: (id: number) => softDeleteChapter(id),
    onSuccess: () => invalider(),
  })

  // Recherche instantanée : `useDeferredValue` laisse la frappe fluide sans
  // minuterie ni effet.
  const [recherche, setRecherche] = useState('')
  const requete = useDeferredValue(recherche.trim())

  const parChapitre = useMemo(() => {
    const m = new Map<number, number>()
    if (!content) return m
    for (const item of flattenItems(content)) {
      m.set(item.data.chapter_id, (m.get(item.data.chapter_id) ?? 0) + 1)
    }
    return m
  }, [content])

  const resultats = useMemo<ClasseurSearchResult[]>(() => {
    if (requete === '' || !content) return []
    const noms = new Map(chapters.map((c) => [c.id, c.label]))
    const out: ClasseurSearchResult[] = []
    for (const item of flattenItems(content)) {
      const d = item.data
      const description = 'description' in d ? d.description : ''
      const contenu = item.kind === 'document' ? item.data.content : ''
      if (
        contientSansAccents(d.title, requete) ||
        contientSansAccents(description, requete) ||
        contientSansAccents(contenu, requete)
      ) {
        out.push({
          kind: item.kind,
          id: d.id,
          title: d.title,
          description,
          chapterId: d.chapter_id,
          chapterName: noms.get(d.chapter_id) ?? '',
        })
      }
    }
    return out
  }, [requete, content, chapters])

  const contexte: DashboardContexte | null =
    classeur && content ? { classeur, chapters, content } : null
  const pret = contexte !== null

  function action(rappel?: (ctx: DashboardContexte) => void) {
    if (!rappel) return undefined
    return () => {
      if (contexte) rappel(contexte)
    }
  }

  const erreurLecture = classeurQ.isError
    ? classeurQ.error
    : chapitresQ.isError
      ? chapitresQ.error
      : contenuQ.isError
        ? contenuQ.error
        : null

  // Groupe « lecture » : sommaire, impression, exports. Un bouton par rappel
  // fourni — aucun n'est rendu grisé « bientôt disponible ».
  const actionsLecture = [
    onSommaire && (
      <IconAction
        key="sommaire"
        label="Sommaire"
        icon={<List />}
        onClick={action(onSommaire)}
        disabled={!pret}
        busy={busy === 'sommaire'}
      />
    ),
    onExporterPdf && (
      <IconAction
        key="pdf"
        label="Imprimer ou enregistrer en PDF"
        icon={<Printer />}
        onClick={action(onExporterPdf)}
        disabled={!pret}
        busy={busy === 'pdf'}
      />
    ),
    onExporterMarkdown && (
      <IconAction
        key="markdown"
        label="Exporter en Markdown (ZIP)"
        icon={<Archive />}
        onClick={action(onExporterMarkdown)}
        disabled={!pret}
        busy={busy === 'markdown'}
      />
    ),
    onExporterJson && (
      <IconAction
        key="json"
        label="Exporter en JSON"
        icon={<FileUp />}
        onClick={action(onExporterJson)}
        disabled={!pret}
        busy={busy === 'json'}
      />
    ),
  ].filter(Boolean)

  // Groupe « écriture » (droit `ecriture`) : import-fusion, historique des
  // instantanés, édition du classeur.
  const actionsEcriture = canWrite
    ? [
        onImporter && (
          <IconAction
            key="import"
            label="Importer un export .json (fusion)"
            icon={<FileDown />}
            onClick={action(onImporter)}
            disabled={!pret}
            busy={busy === 'import'}
          />
        ),
        onHistorique && (
          <IconAction
            key="historique"
            label="Historique des imports"
            icon={<History />}
            onClick={onHistorique}
          />
        ),
        classeur && (
          <IconAction
            key="modifier"
            label="Modifier le classeur"
            icon={<Pencil />}
            onClick={() => setEditOpen(true)}
          />
        ),
      ].filter(Boolean)
    : []

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
      <PageHeader
        leading={<ChapterDrawerButton />}
        title={
          classeurQ.isPending ? (
            <Skeleton className="h-7 w-48" />
          ) : (
            <span className="flex items-center gap-2">
              <IconeClasseur className="size-5 shrink-0 text-muted-foreground" />
              {classeurName}
            </span>
          )
        }
        meta={etablissement !== '' ? etablissement : undefined}
        actions={
          <>
            {canWrite && (
              <Tip label="Ajouter un chapitre au classeur">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus />
                  Nouveau chapitre
                </Button>
              </Tip>
            )}
            {actionsLecture.length > 0 && (
              <ButtonGroup>{actionsLecture}</ButtonGroup>
            )}
            {actionsEcriture.length > 0 && (
              <ButtonGroup>{actionsEcriture}</ButtonGroup>
            )}
          </>
        }
      />

      {erreurLecture !== null && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {messageErreur(erreurLecture, 'Classeur indisponible')}
        </div>
      )}

      {suppression.isError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {messageErreur(suppression.error, 'Suppression impossible')}
        </div>
      )}

      {/* Section « Chapitres » : second PageHeader (comme « Lits bébé » sur
          Literie), la recherche à droite de son titre. */}
      <PageHeader
        title="Chapitres"
        actions={
          <div className="relative w-full sm:w-64 pointer-fine:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher dans le classeur"
              aria-label="Rechercher dans le classeur"
              className="h-8 pl-9"
              disabled={!content}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setRecherche('')
              }}
            />
          </div>
        }
      />

      {requete !== '' ? (
        <section className="flex flex-col gap-3" aria-live="polite">
          {resultats.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Aucun élément ne correspond à cette recherche.
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {resultats.length} résultat{resultats.length > 1 ? 's' : ''}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {resultats.map((r) =>
                  renderResult ? (
                    <div key={`${r.kind}-${r.id}`}>{renderResult(r)}</div>
                  ) : (
                    <ResultatCard
                      key={`${r.kind}-${r.id}`}
                      classeurId={classeurId}
                      result={r}
                    />
                  ),
                )}
              </div>
            </>
          )}
        </section>
      ) : chapitresQ.isPending ? (
        /* DÉLÈGUE à `FormeClasseurDashboard` (sans son en-tête : le PageHeader
           « Chapitres » est déjà rendu au-dessus). */
        <FormeClasseurDashboard enTete={false} />
      ) : chapters.length === 0 && chapitresQ.isSuccess ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          <p className="text-sm">Ce classeur n'a pas encore de chapitre.</p>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              <Plus />
              Créer un chapitre
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {chapters.map((c) => (
            <ChapterCard
              key={c.id}
              classeurId={classeurId}
              chapter={c}
              count={content ? (parChapitre.get(c.id) ?? 0) : undefined}
              canWrite={canWrite}
              onEdit={() => setChapitreEdite(c)}
              onDelete={() => setChapitreASupprimer(c)}
            />
          ))}
        </div>
      )}

      <ClasseurDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        classeur={classeur}
      />

      <ChapterDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        classeurId={classeurId}
        onDone={(id) =>
          navigate({
            to: '/classeur/$classeurId/$chapterId',
            params: { classeurId: String(classeurId), chapterId: String(id) },
          })
        }
      />

      <ChapterDialog
        open={chapitreEdite !== null}
        onOpenChange={(open) => {
          if (!open) setChapitreEdite(null)
        }}
        classeurId={classeurId}
        chapter={chapitreEdite}
      />

      <ConfirmDialog
        open={chapitreASupprimer !== null}
        onOpenChange={(open) => {
          if (!open) setChapitreASupprimer(null)
        }}
        title="Supprimer le chapitre"
        description={
          chapitreASupprimer
            ? `Le chapitre "${chapitreASupprimer.label}" et son contenu ne seront plus accessibles.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (chapitreASupprimer) suppression.mutate(chapitreASupprimer.id)
        }}
      />
    </div>
  )
}

function ChapterCard({
  classeurId,
  chapter,
  count,
  canWrite,
  onEdit,
  onDelete,
}: {
  classeurId: number
  chapter: DbChapter
  /** `undefined` tant que le contenu n'est pas chargé. */
  count: number | undefined
  canWrite: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const Icon = getIcon(chapter.icon)
  const statut = count === undefined ? null : STATUT[computeStatus(count)]
  return (
    <div className="group relative">
      <Link
        to="/classeur/$classeurId/$chapterId"
        params={{
          classeurId: String(classeurId),
          chapterId: String(chapter.id),
        }}
        className={cn(
          'flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent',
          canWrite && 'pr-20',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="size-5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{chapter.label}</span>
        </div>
        {chapter.description.trim() !== '' && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {chapter.description}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 text-xs">
          {statut ? (
            <>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-medium',
                  statut.className,
                )}
              >
                {statut.label}
              </span>
              <span className="text-muted-foreground">
                {count} élément{count !== undefined && count > 1 ? 's' : ''}
              </span>
            </>
          ) : (
            <Skeleton className="h-5 w-24 rounded-full" />
          )}
        </div>
      </Link>
      {canWrite && (
        <div className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Tip label="Modifier">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Modifier le chapitre ${chapter.label}`}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
          </Tip>
          <Tip label="Supprimer">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Supprimer le chapitre ${chapter.label}`}
              className="hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </Tip>
        </div>
      )}
    </div>
  )
}

/** Rendu par défaut d'un résultat : vers la page du chapitre qui le contient. */
function ResultatCard({
  classeurId,
  result,
}: {
  classeurId: number
  result: ClasseurSearchResult
}) {
  const Icon = ICONE_KIND[result.kind]
  return (
    <Link
      to="/classeur/$classeurId/$chapterId"
      params={{
        classeurId: String(classeurId),
        chapterId: String(result.chapterId),
      }}
      className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">
          {result.title.trim() !== '' ? result.title : 'Sans titre'}
        </span>
      </div>
      {result.description.trim() !== '' && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {result.description}
        </p>
      )}
      <p className="truncate text-xs text-muted-foreground">
        {ITEM_LABEL[result.kind]} · {result.chapterName}
      </p>
    </Link>
  )
}

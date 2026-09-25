import { useDeferredValue, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Archive,
  Bookmark,
  FileDown,
  FileText,
  FileUp,
  History,
  List,
  Loader2,
  Pencil,
  PenLine,
  Plus,
  Printer,
  Search,
  Table2,
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
} from '#/components/classeur/hooks/useClasseur.ts'
import { IconAction } from '#/components/classeur/IconAction.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { DEFAULT_REGISTRY_NAME, getIcon } from '#/lib/classeur/naming.ts'
import { contientSansAccents } from '#/lib/classeur/slug.ts'
import { ITEM_LABEL, flattenItems } from '#/lib/classeur/types.ts'
import type {
  ChapterContent,
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

/** Action en cours, pour l'état de la carte concernée (Loader2). */
export type DashboardBusy =
  'pdf' | 'markdown' | 'json' | 'import' | 'sommaire' | null

const ICONE_KIND: Record<ItemKind, LucideIcon> = {
  document: FileText,
  tracking_sheet: Table2,
  signature_sheet: PenLine,
  intercalaire: Bookmark,
}

/**
 * Accueil d'un classeur — porté de Registre (`DashboardPage`).
 *
 * Décision utilisateur du 2026-09-26 : les chapitres vivent DÉJÀ dans la
 * colonne de gauche, l'accueil ne les répète pas. Comme dans Registre, le
 * corps de la page est la grille de CARTES D'ACTIONS (nouveau chapitre,
 * sommaire, impression, exports, import-fusion, historique), sous la
 * recherche instantanée dans tout le classeur (titres, descriptions,
 * contenus, accents ignorés). L'en-tête ne garde que l'édition du classeur.
 *
 * POINTS D'EXTENSION (branchés par `ClasseurDashboardActions`) : les
 * rappels `onSommaire`, `onExporterPdf`, `onExporterMarkdown`,
 * `onExporterJson`, `onImporter` reçoivent le `DashboardContexte` chargé ;
 * `onHistorique` ouvre le dialogue d'historique. Absent, la carte n'est pas
 * rendue. `busy` fait tourner la carte de l'action en cours ; toutes sont
 * désactivées tant que le contenu n'est pas chargé. `renderResult` remplace
 * le rendu par défaut d'un résultat de recherche.
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

  // Recherche instantanée : `useDeferredValue` laisse la frappe fluide sans
  // minuterie ni effet.
  const [recherche, setRecherche] = useState('')
  const requete = useDeferredValue(recherche.trim())

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
          canWrite && classeur ? (
            <IconAction
              label="Modifier le classeur"
              icon={<Pencil />}
              onClick={() => setEditOpen(true)}
            />
          ) : undefined
        }
      />

      {erreurLecture !== null && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {messageErreur(erreurLecture, 'Classeur indisponible')}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher dans le classeur"
          aria-label="Rechercher dans le classeur"
          className="pl-9"
          disabled={!content}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setRecherche('')
          }}
        />
      </div>

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
      ) : (
        /* Le corps de l'accueil : les cartes d'actions, comme dans Registre.
           Les chapitres sont dans la colonne de gauche, pas ici. */
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {canWrite && (
            <ActionCard
              icon={Plus}
              title="Nouveau chapitre"
              subtitle="Ajouter un chapitre au classeur"
              onClick={() => setCreateOpen(true)}
              dashed
            />
          )}
          {onSommaire && (
            <ActionCard
              icon={List}
              title="Sommaire"
              subtitle="Table des matières"
              onClick={action(onSommaire)}
              disabled={!pret}
              busy={busy === 'sommaire'}
            />
          )}
          {onExporterPdf && (
            <ActionCard
              icon={Printer}
              title="Imprimer ou enregistrer en PDF"
              subtitle="Classeur complet"
              onClick={action(onExporterPdf)}
              disabled={!pret}
              busy={busy === 'pdf'}
            />
          )}
          {onExporterMarkdown && (
            <ActionCard
              icon={Archive}
              title="Exporter en Markdown"
              subtitle="Archive ZIP de tous les documents"
              onClick={action(onExporterMarkdown)}
              disabled={!pret}
              busy={busy === 'markdown'}
            />
          )}
          {onExporterJson && (
            <ActionCard
              icon={FileUp}
              title="Exporter en JSON"
              subtitle="Sauvegarde éditable du classeur"
              onClick={action(onExporterJson)}
              disabled={!pret}
              busy={busy === 'json'}
            />
          )}
          {canWrite && onImporter && (
            <ActionCard
              icon={FileDown}
              title="Importer un JSON"
              subtitle="Mettre à jour depuis un export"
              onClick={action(onImporter)}
              disabled={!pret}
              busy={busy === 'import'}
            />
          )}
          {onHistorique && (
            <ActionCard
              icon={History}
              title="Historique des imports"
              subtitle="Instantanés pris avant chaque fusion"
              onClick={onHistorique}
            />
          )}
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
    </div>
  )
}

/**
 * Carte d'action de l'accueil (portée de Registre, dans la grammaire de
 * l'app : carte `bg-card`, icône, titre, sous-titre, survol `bg-accent`).
 * `dashed` distingue la création ; `busy` remplace l'icône par un `Loader2`.
 */
function ActionCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
  disabled = false,
  busy = false,
  dashed = false,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  dashed?: boolean
}) {
  const inactif = disabled || busy
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inactif}
      aria-busy={busy || undefined}
      className={cn(
        'flex w-full items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 text-left transition-colors',
        'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        dashed && 'border-dashed',
      )}
    >
      {busy ? (
        <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Icon className="size-5 shrink-0 text-muted-foreground" />
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          {busy ? 'En cours' : title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
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

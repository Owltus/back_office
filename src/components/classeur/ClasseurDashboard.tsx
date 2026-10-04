import { useDeferredValue, useId, useMemo, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Archive,
  Bookmark,
  ChevronRight,
  FileDown,
  FileText,
  FileUp,
  History,
  Images,
  List,
  Pencil,
  PenLine,
  Plus,
  Printer,
  Search,
  Table2,
  Upload,
  ShieldCheck,
  Trash,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ChapterDrawerButton } from '#/components/classeur/ChapterDrawer.tsx'
import { AccesClasseurDialog } from '#/components/classeur/dialogs/AccesClasseurDialog.tsx'
import { ChapterDialog } from '#/components/classeur/dialogs/ChapterDialog.tsx'
import { ClasseurDialog } from '#/components/classeur/dialogs/ClasseurDialog.tsx'
import {
  useChapters,
  useClasseur,
  useClasseurContent,
  useInvaliderClasseur,
} from '#/components/classeur/hooks/useClasseur.ts'
import {
  useDroitsClasseur,
  useDroitsPageClasseur,
} from '#/components/classeur/hooks/useDroitsClasseur.ts'
import { IconAction } from '#/components/classeur/IconAction.tsx'
import { LigneAction } from '#/components/classeur/LigneAction.tsx'
import { PageAvecEnTete } from '#/components/classeur/PageAvecEnTete.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import {
  INTITULE_SECTION_CLASSEUR,
  LIGNES_SECTION_CLASSEUR,
  LigneActionSquelette,
  PANNEAU_ACCUEIL_CLASSEUR,
} from '#/components/shared/skeleton/PageShapes.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { DEFAULT_REGISTRY_NAME, getIcon } from '#/lib/classeur/naming.ts'
import { softDeleteClasseur } from '#/lib/classeur/service.ts'
import { contientSansAccents } from '#/lib/classeur/slug.ts'
import { cn } from '#/lib/utils.ts'
import { ITEM_LABEL, flattenItems } from '#/lib/classeur/types.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
  ItemKind,
} from '#/lib/classeur/types.ts'

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
 * colonne de gauche, l'accueil ne les répète pas. Le corps de la page est
 * fait d'ACTIONS, sous la recherche instantanée dans tout le
 * classeur (titres, descriptions, contenus, accents ignorés).
 *
 * Disposition du 2026-10-04 (décision utilisateur, remplace la colonne de
 * 28 rem de Registre puis la grille de tuiles) : en-tête FIXE
 * (`PageAvecEnTete`, comme un chapitre) et UN panneau en liste, façon page
 * de réglages, en quatre sections (Contenu, Imprimer, Échanger et
 * sauvegarder, Historique et sécurité), en-tête et panneau sur `max-w-3xl`.
 *
 * POINTS D'EXTENSION (branchés par `ClasseurDashboardActions`) : les
 * rappels `onSommaire`, `onExporterPdf`, `onExporterMarkdown`,
 * `onExporterJson`, `onImporter` reçoivent le `DashboardContexte` chargé ;
 * `onHistorique` ouvre le dialogue d'historique. Absent, la ligne n'est pas
 * rendue. `busy` fait tourner la ligne de l'action en cours ; toutes sont
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
  onFichierDepose,
  onHistorique,
  onImages,
  onCorbeille,
  busy = null,
  renderResult,
  messages,
}: {
  classeurId: number
  onSommaire?: (ctx: DashboardContexte) => void
  onExporterPdf?: (ctx: DashboardContexte) => void
  onExporterMarkdown?: (ctx: DashboardContexte) => void
  onExporterJson?: (ctx: DashboardContexte) => void
  onImporter?: (ctx: DashboardContexte) => void
  /** Fichier .json DÉPOSÉ sur la carte Importer (Registre acceptait le
   * glisser-déposer sur cette carte). */
  onFichierDepose?: (file: File) => void
  /** Ouvre l'historique des imports (instantanés restaurables). Sans ctx : la
   * liste est lue par le dialogue lui-même. */
  onHistorique?: () => void
  /** Ouvre la médiathèque du classeur. Absent, la ligne n'est pas rendue. */
  onImages?: () => void
  /** Ouvre la corbeille (étape 6). Ligne rendue seulement avec l'écriture. */
  onCorbeille?: () => void
  busy?: DashboardBusy
  renderResult?: (result: ClasseurSearchResult) => ReactNode
  /** Alertes de la page (export, fichier, bilan d'import), affichées en
   * tête de la zone qui défile, sous l'en-tête fixe. */
  messages?: ReactNode
}) {
  const droits = useDroitsClasseur(classeurId)
  const { canWrite, canManage } = droits
  // Places des lignes d'écriture (Nouveau chapitre, Importer, Corbeille)
  // réservées en silhouette tant que les droits du classeur ne sont pas lus,
  // pour qui PEUT écrire sur la page : sans cela le panneau grandissait de
  // trois lignes à leur arrivée. Un lecteur de la page n'écrira jamais : rien
  // à réserver.
  const { page } = useDroitsPageClasseur()
  const reserverEcriture =
    !droits.pret &&
    !droits.isError &&
    (page === 'ecriture' || page === 'gestion')
  const [accesOuvert, setAccesOuvert] = useState(false)
  const [suppressionOuverte, setSuppressionOuverte] = useState(false)
  const navigate = useNavigate()
  const invaliderTout = useInvaliderClasseur()
  const suppression = useMutation({
    mutationFn: () => softDeleteClasseur(classeurId),
    onSuccess: async () => {
      await invaliderTout()
      await navigate({ to: '/classeur' })
    },
  })

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
  const [survolDepot, setSurvolDepot] = useState(false)

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

  // Dépôt d'un fichier sur la carte Importer (comme dans Registre). On ne
  // réagit qu'aux fichiers, pas aux glissers internes (dnd-kit).
  const depotActif = canWrite && onFichierDepose !== undefined && pret
  const surDragOver = (e: DragEvent<HTMLButtonElement>) => {
    if (!depotActif || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    if (!survolDepot) setSurvolDepot(true)
  }
  const surDragLeave = () => setSurvolDepot(false)
  const surDrop = (e: DragEvent<HTMLButtonElement>) => {
    if (!depotActif) return
    e.preventDefault()
    setSurvolDepot(false)
    const file = e.dataTransfer.files.item(0)
    if (file !== null) onFichierDepose(file)
  }

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

  const sectionImprimer = onExporterPdf || onSommaire
  const sectionEchanger =
    onExporterJson ||
    onExporterMarkdown ||
    ((canWrite || reserverEcriture) && onImporter)
  const sectionHistorique =
    onHistorique || ((canWrite || reserverEcriture) && onCorbeille)
  const sectionContenu = canWrite || reserverEcriture || onImages

  return (
    // En-tête FIXE (titre, sous-titre, recherche, boutons) et zone qui
    // défile dessous avec sa propre barre, comme la page d'un chapitre
    // (décision utilisateur du 2026-10-04). En-tête et contenu partagent la
    // même largeur confortable (`max-w-3xl` centré).
    <PageAvecEnTete
      entete={
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
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
          />

          {/* Recherche à gauche, boutons du classeur à droite, sur UNE ligne
              à toute largeur (demande utilisateur du 2026-09-28) : la
              recherche absorbe le rétrécissement, les boutons gardent leur
              taille. */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                type="search"
                enterKeyHint="search"
                placeholder="Rechercher dans le classeur"
                aria-label="Rechercher dans le classeur"
                className="pl-9"
                disabled={!content}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setRecherche('')
                }}
              />
            </div>
            {classeur && (canWrite || canManage) && (
              <div className="shrink-0">
                <ButtonGroup>
                  {canWrite && (
                    <IconAction
                      label="Modifier le classeur"
                      icon={<Pencil />}
                      onClick={() => setEditOpen(true)}
                    />
                  )}
                  {/* Accès au classeur : gestion et admin (2026-09-28). */}
                  {canManage && (
                    <IconAction
                      label={
                        classeur.acces_tous === 'aucun'
                          ? 'Accès au classeur (privé)'
                          : 'Accès au classeur'
                      }
                      icon={<ShieldCheck />}
                      onClick={() => setAccesOuvert(true)}
                    />
                  )}
                  {/* Supprimer le classeur : gestion. Seule voie au doigt (la
                      croix de la liste n'apparaît qu'au survol à la souris). */}
                  {canManage && (
                    <IconAction
                      label="Supprimer le classeur"
                      icon={<Trash2 />}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setSuppressionOuverte(true)}
                      busy={suppression.isPending}
                    />
                  )}
                </ButtonGroup>
              </div>
            )}
          </div>
        </div>
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {messages}
        {erreurLecture !== null && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {messageErreur(erreurLecture, 'Classeur indisponible')}
          </div>
        )}
        {droits.isError && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {messageErreur(
              droits.error,
              'Droits indisponibles, modifications désactivées',
            )}
          </div>
        )}
        {suppression.isError && (
          <p className="text-sm text-destructive">
            {messageErreur(suppression.error, 'Suppression impossible')}
          </p>
        )}

        {requete !== '' ? (
          <section className="flex flex-col gap-2" aria-live="polite">
            {resultats.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                Aucun élément ne correspond à cette recherche.
              </div>
            ) : (
              <>
                <p className="px-1 text-xs text-muted-foreground">
                  {resultats.length} résultat{resultats.length > 1 ? 's' : ''}
                </p>
                <div
                  className={cn(PANNEAU_ACCUEIL_CLASSEUR, 'divide-border/60')}
                  data-resultats=""
                >
                  {resultats.map((r) =>
                    renderResult ? (
                      <div key={`${r.kind}-${r.id}`}>{renderResult(r)}</div>
                    ) : (
                      <ResultatLigne
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
          /* Le corps de l'accueil (décision utilisateur du 2026-10-04, remplace
             la grille de tuiles jugée « éclatée ») : UN panneau en liste,
             façon page de réglages, en quatre sections. Toutes les lignes ont
             la même hauteur. La silhouette `FormeClasseurDashboard` suit
             cette structure. */
          <div className={PANNEAU_ACCUEIL_CLASSEUR} data-accueil-panneau="">
            {sectionContenu && (
              <SectionActions titre="Contenu">
                {canWrite ? (
                  <LigneAction
                    icon={Plus}
                    title="Nouveau chapitre"
                    description="Ajouter un chapitre au classeur"
                    onClick={() => setCreateOpen(true)}
                    creation
                  />
                ) : (
                  reserverEcriture && <LigneActionSquelette />
                )}
                {onImages && (
                  <LigneAction
                    icon={Images}
                    title="Images du classeur"
                    description="Photos et schémas communs aux documents"
                    onClick={onImages}
                  />
                )}
              </SectionActions>
            )}

            {sectionImprimer && (
              <SectionActions titre="Imprimer">
                {onExporterPdf && (
                  <LigneAction
                    icon={Printer}
                    title="Classeur complet"
                    description="Couverture, sommaire et chapitres, en PDF ou imprimé"
                    onClick={action(onExporterPdf)}
                    disabled={!pret}
                    busy={busy === 'pdf'}
                  />
                )}
                {onSommaire && (
                  <LigneAction
                    icon={List}
                    title="Sommaire"
                    description="La table des matières seule"
                    onClick={action(onSommaire)}
                    disabled={!pret}
                    busy={busy === 'sommaire'}
                  />
                )}
              </SectionActions>
            )}

            {sectionEchanger && (
              <SectionActions titre="Échanger et sauvegarder">
                {onExporterJson && (
                  <LigneAction
                    icon={FileUp}
                    title="Exporter en JSON"
                    description="Copie éditable, avec vos demandes pour un LLM"
                    titreOccupe="Export en cours..."
                    onClick={action(onExporterJson)}
                    disabled={!pret || busy !== null}
                    busy={busy === 'json'}
                  />
                )}
                {canWrite && onImporter && (
                  <LigneAction
                    icon={survolDepot ? Upload : FileDown}
                    title="Importer un JSON"
                    description="Mettre à jour depuis un export"
                    titreOccupe="Import en cours..."
                    onClick={action(onImporter)}
                    disabled={!pret || busy !== null}
                    busy={busy === 'import'}
                    survolDepot={survolDepot}
                    onDragEnter={surDragOver}
                    onDragOver={surDragOver}
                    onDragLeave={surDragLeave}
                    onDrop={surDrop}
                  />
                )}
                {!canWrite && reserverEcriture && onImporter && (
                  <LigneActionSquelette />
                )}
                {onExporterMarkdown && (
                  <LigneAction
                    icon={Archive}
                    title="Exporter en Markdown"
                    description="Archive ZIP de tous les documents"
                    titreOccupe="Export en cours..."
                    onClick={action(onExporterMarkdown)}
                    disabled={!pret || busy !== null}
                    busy={busy === 'markdown'}
                  />
                )}
              </SectionActions>
            )}

            {sectionHistorique && (
              <SectionActions titre="Historique et sécurité">
                {onHistorique && (
                  <LigneAction
                    icon={History}
                    title="Points de restauration"
                    description="Revenir à un état précédent"
                    onClick={onHistorique}
                  />
                )}
                {/* Étape 6 : corbeille, avec le droit d'écriture (D16). Sans
                    compteur : aucune lecture de plus au premier rendu. */}
                {canWrite && onCorbeille && (
                  <LigneAction
                    icon={Trash}
                    title="Corbeille"
                    description="Retrouver ce qui a été supprimé"
                    onClick={onCorbeille}
                  />
                )}
                {!canWrite && reserverEcriture && onCorbeille && (
                  <LigneActionSquelette />
                )}
              </SectionActions>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={suppressionOuverte}
        onOpenChange={setSuppressionOuverte}
        title="Supprimer le classeur"
        description={
          classeur
            ? `Supprimer le classeur « ${classeur.name} » et tout son contenu (chapitres, documents, fiches de suivi et de signature) ?`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => suppression.mutate()}
      />

      <AccesClasseurDialog
        classeur={accesOuvert ? classeur : null}
        onClose={() => setAccesOuvert(false)}
      />

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
    </PageAvecEnTete>
  )
}

/**
 * Une section du panneau de l'accueil : intitulé en ligne, puis ses lignes
 * séparées d'un trait discret. Le trait plein entre deux sections vient du
 * panneau (`divide-y`).
 */
function SectionActions({
  titre,
  children,
}: {
  titre: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} data-section-actions="">
      <h2 id={id} className={INTITULE_SECTION_CLASSEUR}>
        {titre}
      </h2>
      <div className={LIGNES_SECTION_CLASSEUR}>{children}</div>
    </section>
  )
}

/** Rendu par défaut d'un résultat : une ligne du panneau, vers la page du
 * chapitre qui le contient. */
function ResultatLigne({
  classeurId,
  result,
}: {
  classeurId: number
  result: ClasseurSearchResult
}) {
  const Icon = ICONE_KIND[result.kind]
  const description = result.description.trim()
  return (
    <Link
      to="/classeur/$classeurId/$chapterId"
      params={{
        classeurId: String(classeurId),
        chapterId: String(result.chapterId),
      }}
      className="flex h-14 items-center gap-3 px-4 transition-colors pointer-coarse:h-16 hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground/80">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {result.title.trim() !== '' ? result.title : 'Sans titre'}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {majuscule(ITEM_LABEL[result.kind])} · {result.chapterName}
          {description !== '' && ` · ${description}`}
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  )
}

/** « document » → « Document » (début de la ligne de détail d'un résultat). */
function majuscule(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

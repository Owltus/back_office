import { useDeferredValue, useId, useMemo, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Archive,
  Bookmark,
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

import { ActionCard } from '#/components/classeur/ActionCard.tsx'
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
import { PageAvecEnTete } from '#/components/classeur/PageAvecEnTete.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import {
  CarteActionSquelette,
  GRILLE_ACTIONS_CLASSEUR,
} from '#/components/shared/skeleton/PageShapes.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { DEFAULT_REGISTRY_NAME, getIcon } from '#/lib/classeur/naming.ts'
import { softDeleteClasseur } from '#/lib/classeur/service.ts'
import { contientSansAccents } from '#/lib/classeur/slug.ts'
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
 * fait de CARTES D'ACTIONS, sous la recherche instantanée dans tout le
 * classeur (titres, descriptions, contenus, accents ignorés).
 *
 * Disposition du 2026-10-04 (décision utilisateur, remplace la colonne de
 * 28 rem de Registre) : en-tête FIXE (`PageAvecEnTete`, comme un chapitre),
 * cartes regroupées par usage (Contenu, Imprimer, Échanger et sauvegarder,
 * Historique et sécurité) dans une grille 1 / 2 / 3 colonnes de `max-w-5xl`.
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
  /** Ouvre la médiathèque du classeur. Absent, la carte n'est pas rendue. */
  onImages?: () => void
  /** Ouvre la corbeille (étape 6). Carte rendue seulement avec l'écriture. */
  onCorbeille?: () => void
  busy?: DashboardBusy
  renderResult?: (result: ClasseurSearchResult) => ReactNode
  /** Alertes de la page (export, fichier, bilan d'import), affichées en
   * tête de la zone qui défile, sous l'en-tête fixe. */
  messages?: ReactNode
}) {
  const droits = useDroitsClasseur(classeurId)
  const { canWrite, canManage } = droits
  // Places des cartes d'écriture (Nouveau chapitre, Importer, Corbeille)
  // réservées en silhouette tant que les droits du classeur ne sont pas lus,
  // pour qui PEUT écrire sur la page : sans cela la colonne grandissait de
  // deux cartes à leur arrivée. Un lecteur de la page n'écrira jamais : rien
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

  const grilleImprimer = onExporterPdf || onSommaire
  const grilleEchanger =
    onExporterJson ||
    onExporterMarkdown ||
    ((canWrite || reserverEcriture) && onImporter)
  const grilleHistorique =
    onHistorique || ((canWrite || reserverEcriture) && onCorbeille)
  const grilleContenu = canWrite || reserverEcriture || onImages

  return (
    // En-tête FIXE (titre, sous-titre, recherche, boutons) et zone qui
    // défile dessous avec sa propre barre, comme la page d'un chapitre
    // (décision utilisateur du 2026-10-04). En-tête et contenu partagent la
    // même largeur confortable (`max-w-5xl` centré).
    <PageAvecEnTete
      entete={
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
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
          /* Le corps de l'accueil (décision utilisateur du 2026-10-04, remplace
             la colonne de 28 rem de Registre) : les cartes REGROUPÉES par
             usage, chaque groupe sous un intitulé discret et une phrase
             d'aide, dans une grille 1 / 2 / 3 colonnes. La silhouette
             `FormeClasseurDashboard` suit cette structure. */
          <div
            className="flex flex-col gap-6 pt-1 pb-2"
            data-accueil-groupes=""
          >
            {grilleContenu && (
              <GroupeActions
                titre="Contenu"
                aide="Les chapitres du classeur et les images communes à tous ses documents."
              >
                {canWrite ? (
                  <ActionCard
                    icon={Plus}
                    title="Nouveau chapitre"
                    subtitle="Ajouter un chapitre au classeur"
                    onClick={() => setCreateOpen(true)}
                    dashed
                  />
                ) : (
                  reserverEcriture && <CarteActionSquelette />
                )}
                {onImages && (
                  <ActionCard
                    icon={Images}
                    title="Images du classeur"
                    subtitle="Photos et schémas utilisables dans tous les documents"
                    onClick={onImages}
                  />
                )}
              </GroupeActions>
            )}

            {grilleImprimer && (
              <GroupeActions
                titre="Imprimer"
                aide="Un aperçu des pages A4, puis Télécharger le PDF ou Imprimer."
              >
                {onExporterPdf && (
                  <ActionCard
                    icon={Printer}
                    title="Classeur complet"
                    subtitle="Couverture, sommaire et tous les chapitres"
                    onClick={action(onExporterPdf)}
                    disabled={!pret}
                    busy={busy === 'pdf'}
                  />
                )}
                {onSommaire && (
                  <ActionCard
                    icon={List}
                    title="Sommaire"
                    subtitle="La table des matières seule"
                    onClick={action(onSommaire)}
                    disabled={!pret}
                    busy={busy === 'sommaire'}
                  />
                )}
              </GroupeActions>
            )}

            {grilleEchanger && (
              <GroupeActions
                titre="Échanger et sauvegarder"
                aide="Des fichiers à garder, à retoucher ailleurs ou à réimporter."
              >
                {onExporterJson && (
                  <ActionCard
                    icon={FileUp}
                    title="Exporter en JSON"
                    subtitle="Copie éditable, avec vos demandes pour un LLM"
                    titreOccupe="Export en cours..."
                    onClick={action(onExporterJson)}
                    disabled={!pret || busy !== null}
                    busy={busy === 'json'}
                  />
                )}
                {canWrite && onImporter && (
                  <ActionCard
                    icon={survolDepot ? Upload : FileDown}
                    title={survolDepot ? 'Déposez ici' : 'Importer un JSON'}
                    subtitle={
                      survolDepot
                        ? undefined
                        : 'Mettre à jour depuis un export, ou déposer le fichier ici'
                    }
                    titreOccupe="Import en cours..."
                    onClick={action(onImporter)}
                    disabled={!pret || busy !== null}
                    busy={busy === 'import'}
                    className={
                      survolDepot
                        ? 'border-dashed border-primary bg-primary/5'
                        : undefined
                    }
                    onDragEnter={surDragOver}
                    onDragOver={surDragOver}
                    onDragLeave={surDragLeave}
                    onDrop={surDrop}
                  />
                )}
                {!canWrite && reserverEcriture && onImporter && (
                  <CarteActionSquelette />
                )}
                {onExporterMarkdown && (
                  <ActionCard
                    icon={Archive}
                    title="Exporter en Markdown"
                    subtitle="Archive ZIP contenant tous les documents"
                    titreOccupe="Export en cours..."
                    onClick={action(onExporterMarkdown)}
                    disabled={!pret || busy !== null}
                    busy={busy === 'markdown'}
                  />
                )}
              </GroupeActions>
            )}

            {grilleHistorique && (
              <GroupeActions
                titre="Historique et sécurité"
                aide="Revenir à un état précédent ou retrouver ce qui a été supprimé."
              >
                {onHistorique && (
                  <ActionCard
                    icon={History}
                    title="Points de restauration"
                    subtitle="Revenir à un état précédent du classeur"
                    onClick={onHistorique}
                  />
                )}
                {/* Étape 6 : corbeille, avec le droit d'écriture (D16). Sans
                    compteur : aucune lecture de plus au premier rendu. */}
                {canWrite && onCorbeille && (
                  <ActionCard
                    icon={Trash}
                    title="Corbeille"
                    subtitle="Retrouver un chapitre ou un élément supprimé"
                    onClick={onCorbeille}
                  />
                )}
                {!canWrite && reserverEcriture && onCorbeille && (
                  <CarteActionSquelette />
                )}
              </GroupeActions>
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
 * Un groupe de cartes de l'accueil : intitulé discret, une phrase d'aide,
 * puis la grille (1 colonne au téléphone, 2 dès `sm`, 3 dès `xl` — la
 * colonne des chapitres de 20 rem occupe la gauche à partir de `lg`).
 * `items-stretch` (défaut de la grille) + `h-full` des cartes : même
 * hauteur dans une rangée.
 */
function GroupeActions({
  titre,
  aide,
  children,
}: {
  titre: string
  aide?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-2.5"
      data-groupe-actions=""
    >
      <div className="flex flex-col gap-0.5">
        <h2
          id={id}
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {titre}
        </h2>
        {aide !== undefined && (
          <p className="text-xs text-muted-foreground/80">{aide}</p>
        )}
      </div>
      <div className={GRILLE_ACTIONS_CLASSEUR}>{children}</div>
    </section>
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

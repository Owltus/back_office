import { Fragment, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, SyntheticEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { DndContext, closestCenter } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  EyeOff,
  FileDown,
  FileUp,
  FolderOpen,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import {
  CLASSES_CARTE_GLISSABLE,
  neDemarrePasDeGlisser,
  useCapteursClasseur,
} from '#/components/classeur/dnd/useCapteursClasseur.ts'
import { AccesClasseurDialog } from '#/components/classeur/dialogs/AccesClasseurDialog.tsx'
import { ClasseurDialog } from '#/components/classeur/dialogs/ClasseurDialog.tsx'
import {
  useClasseurs,
  useInvaliderClasseur,
  useReorderClasseurs,
  useStatsClasseurs,
} from '#/components/classeur/hooks/useClasseur.ts'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '#/components/ui/context-menu.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  FormeClasseurListe,
  TABLEAU_CLASSEURS,
} from '#/components/shared/skeleton/PageShapes.tsx'
import {
  useDroitsPageClasseur,
  useMesAcces,
} from '#/components/classeur/hooks/useDroitsClasseur.ts'
import { capacites, niveauEffectif } from '#/lib/classeur/droits.ts'
import type { NiveauEffectif } from '#/lib/classeur/droits.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { formatDate, getIcon } from '#/lib/classeur/naming.ts'
import { softDeleteClasseur } from '#/lib/classeur/service.ts'
import type { StatsClasseur } from '#/lib/classeur/statsClasseurs.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'
import { cn } from '#/lib/utils.ts'

/**
 * Liste des classeurs EN TABLEAU (décision utilisateur du 2026-10-19,
 * remplace la colonne de cartes de Registre du 2026-09-26) : la grammaire
 * des tableaux de l'app (RepJour, Données, Budget) — carte `rounded-xl
 * border bg-card`, en-tête `bg-muted/50` en petites lettres grises, lignes
 * séparées d'un trait discret. Colonnes : classeur (icône, nom,
 * établissement), chapitres, documents, dernière modification, accès,
 * actions. Pas de titre de page (l'onglet suffit) ; Importer et Nouveau
 * classeur en boutons outline à droite, comme les autres pages.
 *
 * - Une ligne entière ouvre le classeur ; le nom est le vrai lien (clavier).
 * - Réordonner (ordre partagé) : gestion seule, la ligne entière se glisse
 *   (souris 5 px, doigt : appui long, `useCapteursClasseur`).
 * - Importer : clic (sélecteur) ou fichier .json DÉPOSÉ sur le bouton.
 * - Compteurs lus APRÈS la liste (`useStatsClasseurs`) : la liste s'affiche
 *   d'abord, les chiffres ensuite (place réservée, jamais un faux zéro).
 *
 * ACCÈS PAR CLASSEUR (2026-09-28, `lib/classeur/droits.ts`) : la liste ne
 * contient que les classeurs lisibles (la RLS filtre). La gestion voit
 * l'accès donné à tous (Privé / Tous en lecture / Tous en écriture) ; un
 * compte en écriture voit son propre niveau (Modification / Lecture) ; un
 * compte en lecture seule n'a pas la colonne (elle dirait partout la même
 * chose). Supprimer un classeur et réordonner : gestion seule.
 *
 * MENU D'UN CLASSEUR (2026-10-19, demande utilisateur) : clic droit sur la
 * ligne, ou bouton « ⋯ » (doigt, clavier). Ouvrir, Modifier le classeur,
 * Accès, Exporter en JSON, Supprimer : toujours listés, grisés avec leur
 * raison quand le niveau EFFECTIF ne les permet pas (`capacites`, miroir
 * des RLS). La base reste juge : le menu ne fait que le montrer.
 */
export function ClasseurList({
  onImporterJson,
  onExporterJson,
}: {
  onImporterJson?: (file: File) => void | Promise<void>
  onExporterJson?: (classeur: DbClasseur) => void | Promise<void>
}) {
  const { user } = useAuth()
  const droitsPage = useDroitsPageClasseur()
  const mesAcces = useMesAcces()
  const canWrite = droitsPage.canCreate
  const canManage = droitsPage.canManage
  const navigate = useNavigate()
  const classeurs = useClasseurs()
  const stats = useStatsClasseurs(classeurs.isSuccess)
  const reorder = useReorderClasseurs()
  const invalider = useInvaliderClasseur()
  const liste = classeurs.data ?? []
  const peutReordonner = droitsPage.canReorderList
  const statsDe = new Map((stats.data ?? []).map((s) => [s.classeurId, s]))
  const niveauDe = (c: DbClasseur): NiveauEffectif | null =>
    mesAcces.isPending
      ? null
      : niveauEffectif(
          droitsPage.page,
          c,
          mesAcces.parClasseur.get(c.id) ?? null,
          user?.id,
        )
  const colonneAcces = canManage || canWrite

  const [createOpen, setCreateOpen] = useState(false)
  const [aSupprimer, setASupprimer] = useState<DbClasseur | null>(null)
  const [aModifier, setAModifier] = useState<DbClasseur | null>(null)
  const [accesDe, setAccesDe] = useState<DbClasseur | null>(null)
  const [erreurImport, setErreurImport] = useState<string | null>(null)

  const suppression = useMutation({
    mutationFn: (id: number) => softDeleteClasseur(id),
    onSuccess: () => invalider(),
  })

  // Souris 5 px, doigt : appui long (audit tactile 2026-09-28).
  const sensors = useCapteursClasseur()

  // Le clic qui termine un glisser n'ouvre pas le classeur : dnd-kit
  // l'arrête lui-même (écouteur `click` en capture gardé jusqu'au tour
  // suivant, `AbstractPointerSensor`), testé dans `ClasseurList.test.tsx`.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = liste.map((c) => c.id)
    const oldIndex = ids.indexOf(Number(active.id))
    const newIndex = ids.indexOf(Number(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const [moved] = ids.splice(oldIndex, 1)
    ids.splice(newIndex, 0, moved)
    reorder.mutate(ids)
  }

  // Import JSON : sélecteur de fichier (clic) ou dépôt sur le bouton
  // Importer. On ne réagit qu'aux fichiers, pas aux glissers internes.
  const importActif = canWrite && onImporterJson !== undefined
  const inputRef = useRef<HTMLInputElement>(null)
  const [survolDepot, setSurvolDepot] = useState(false)

  function recevoirFichier(file: File | null | undefined) {
    if (!file || !onImporterJson) return
    const trop = fileTooLarge(file, MAX_JSON_BYTES)
    if (trop) {
      setErreurImport(trop)
      return
    }
    if (!file.name.toLowerCase().endsWith('.json')) {
      setErreurImport(`Fichier attendu : un export .json (${file.name}).`)
      return
    }
    setErreurImport(null)
    void onImporterJson(file)
  }

  const surDragOver = (e: DragEvent<HTMLButtonElement>) => {
    if (!importActif || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    if (!survolDepot) setSurvolDepot(true)
  }
  const surDragLeave = () => setSurvolDepot(false)
  const surDrop = (e: DragEvent<HTMLButtonElement>) => {
    if (!importActif) return
    e.preventDefault()
    setSurvolDepot(false)
    recevoirFichier(e.dataTransfer.files.item(0))
  }

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    recevoirFichier(e.target.files?.item(0))
    e.target.value = ''
  }

  const erreurEcriture = reorder.isError
    ? messageErreur(reorder.error, 'Ordre non enregistré')
    : suppression.isError
      ? messageErreur(suppression.error, 'Suppression impossible')
      : erreurImport

  const colonnes = { acces: colonneAcces }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      {importActif && (
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onInputChange}
        />
      )}

      {canWrite && (
        <PageHeader
          actionsAlign="end"
          actions={
            <div className="flex items-center gap-2">
              {importActif && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  onDragEnter={surDragOver}
                  onDragOver={surDragOver}
                  onDragLeave={surDragLeave}
                  onDrop={surDrop}
                  className={cn(
                    survolDepot && 'border-primary bg-primary/10 text-primary',
                  )}
                >
                  {survolDepot ? <Upload /> : <FileDown />}
                  {survolDepot ? 'Déposez ici' : 'Importer'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                <Plus />
                Nouveau classeur
              </Button>
            </div>
          }
        />
      )}

      {classeurs.isError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {messageErreur(classeurs.error, 'Classeurs indisponibles')}
        </div>
      )}

      {erreurEcriture && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erreurEcriture}
        </div>
      )}

      {classeurs.isPending ? (
        /* DÉLÈGUE à `FormeClasseurListe` : une seule silhouette par page. */
        <FormeClasseurListe actions={false} {...colonnes} />
      ) : classeurs.isError ? null : (
        <div className={TABLEAU_CLASSEURS.carte}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLEAU_CLASSEURS.entete}>
                <th className={cn(TABLEAU_CLASSEURS.th, 'text-left')}>
                  Classeur
                </th>
                <th
                  className={cn(
                    TABLEAU_CLASSEURS.th,
                    'hidden w-24 text-right sm:table-cell',
                  )}
                >
                  Chapitres
                </th>
                <th
                  className={cn(
                    TABLEAU_CLASSEURS.th,
                    'hidden w-24 text-right sm:table-cell',
                  )}
                >
                  Documents
                </th>
                <th
                  className={cn(
                    TABLEAU_CLASSEURS.th,
                    'hidden w-32 text-left md:table-cell',
                  )}
                >
                  Modifié le
                </th>
                {colonnes.acces && (
                  <th
                    className={cn(
                      TABLEAU_CLASSEURS.th,
                      'hidden w-36 text-left sm:table-cell',
                    )}
                  >
                    Accès
                  </th>
                )}
                <th className="w-12 px-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {liste.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Aucun classeur.
                    {canWrite ? ' Créez-en un pour commencer.' : ''}
                  </td>
                </tr>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={liste.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {liste.map((c) => (
                      <LigneClasseur
                        key={c.id}
                        classeur={c}
                        stats={statsDe.get(c.id)}
                        statsEtat={
                          stats.isPending
                            ? 'chargement'
                            : stats.isError
                              ? 'erreur'
                              : 'ok'
                        }
                        canDrag={peutReordonner}
                        menu={entreesMenu(niveauDe(c), {
                          ouvrir: () =>
                            navigate({
                              to: '/classeur/$classeurId',
                              params: { classeurId: String(c.id) },
                            }),
                          modifier: () => setAModifier(c),
                          acces: () => setAccesDe(c),
                          exporter: onExporterJson
                            ? () => void onExporterJson(c)
                            : undefined,
                          supprimer: () => setASupprimer(c),
                        })}
                        avecAcces={colonnes.acces}
                        acces={
                          !colonnes.acces
                            ? null
                            : canManage
                              ? accesPourTous(c.acces_tous)
                              : accesPersonnel(niveauDe(c))
                        }
                        onOpen={() =>
                          navigate({
                            to: '/classeur/$classeurId',
                            params: { classeurId: String(c.id) },
                          })
                        }
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ClasseurDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onDone={(id) =>
          navigate({
            to: '/classeur/$classeurId',
            params: { classeurId: String(id) },
          })
        }
      />

      <ClasseurDialog
        open={aModifier !== null}
        onOpenChange={(open) => {
          if (!open) setAModifier(null)
        }}
        classeur={aModifier}
      />

      <AccesClasseurDialog
        classeur={accesDe}
        onClose={() => setAccesDe(null)}
      />

      <ConfirmDialog
        open={aSupprimer !== null}
        onOpenChange={(open) => {
          if (!open) setASupprimer(null)
        }}
        title="Supprimer le classeur"
        description={
          aSupprimer
            ? `Supprimer le classeur ${aSupprimer.name} et tout son contenu (chapitres, documents, feuilles de suivi et de signature) ?`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (aSupprimer) suppression.mutate(aSupprimer.id)
        }}
      />
    </div>
  )
}

interface Acces {
  libelle: string
  icone: typeof Lock | null
  aide: string
}

/** Vu de la gestion : l'accès donné à tous. */
function accesPourTous(niveau: DbClasseur['acces_tous']): Acces {
  if (niveau === 'aucun')
    return {
      libelle: 'Privé',
      icone: EyeOff,
      aide: 'Visible de la gestion et des accès donnés',
    }
  return niveau === 'ecriture'
    ? {
        libelle: 'Tous en écriture',
        icone: Users,
        aide: 'Tout le monde peut modifier',
      }
    : {
        libelle: 'Tous en lecture',
        icone: Users,
        aide: 'Tout le monde peut lire',
      }
}

/** Vu d'un compte en écriture : son propre niveau sur ce classeur. */
function accesPersonnel(niveau: NiveauEffectif | null): Acces | null {
  if (niveau === null) return null
  return niveau === 'ecriture' || niveau === 'gestion'
    ? { libelle: 'Modification', icone: null, aide: 'Vous pouvez le modifier' }
    : { libelle: 'Lecture', icone: Lock, aide: 'Lecture seule sur ce classeur' }
}

/** Une entrée du menu d'un classeur ; `raison` non nulle = grisée. */
interface EntreeMenu {
  cle: string
  libelle: string
  icone: LucideIcon
  action: () => void
  /** Pourquoi l'entrée est grisée (`''` : droits pas encore lus). */
  raison: string | null
  danger?: boolean
  /** Trait de séparation au-dessus. */
  separe?: boolean
}

/**
 * Les entrées du menu d'un classeur selon le niveau EFFECTIF (page et
 * classeur, `niveauEffectif`) ; `null` = droits pas encore lus, tout ce
 * qui écrit reste grisé.
 */
function entreesMenu(
  niveau: NiveauEffectif | null,
  actions: {
    ouvrir: () => void
    modifier: () => void
    acces: () => void
    exporter?: () => void
    supprimer: () => void
  },
): EntreeMenu[] {
  const peut = niveau === null ? null : capacites(niveau)
  const raison = (permis: boolean | undefined, sinon: string) =>
    peut === null ? '' : permis ? null : sinon
  const entrees: EntreeMenu[] = [
    {
      cle: 'ouvrir',
      libelle: 'Ouvrir',
      icone: FolderOpen,
      action: actions.ouvrir,
      raison: null,
    },
    {
      cle: 'modifier',
      libelle: 'Modifier le classeur',
      icone: Pencil,
      action: actions.modifier,
      raison: raison(peut?.modifier, 'Lecture seule'),
      separe: true,
    },
    {
      cle: 'acces',
      libelle: 'Accès',
      icone: ShieldCheck,
      action: actions.acces,
      raison: raison(peut?.gererAcces, 'Gestion seule'),
    },
  ]
  if (actions.exporter)
    entrees.push({
      cle: 'exporter',
      libelle: 'Exporter en JSON',
      icone: FileUp,
      action: actions.exporter,
      raison: null,
      separe: true,
    })
  entrees.push({
    cle: 'supprimer',
    libelle: 'Supprimer',
    icone: Trash2,
    action: actions.supprimer,
    raison: raison(peut?.supprimerClasseur, 'Gestion seule'),
    danger: true,
    separe: true,
  })
  return entrees
}

/*
 * Le menu du bouton « ⋯ » est rendu dans un portail, mais React fait
 * remonter ses événements jusqu'à la ligne qui le contient : un appui
 * lancerait un glisser. On l'arrête au bord du menu (le clic, lui, est
 * arrêté par la cellule des actions). Le clavier n'a pas besoin de garde : dnd-kit ignore une touche qui
 * ne vient pas de la ligne elle-même. Le menu du clic droit, lui, est à côté de la ligne dans l'arbre
 * React : rien à arrêter.
 */
const arreter = (e: SyntheticEvent) => e.stopPropagation()
const RESTE_DANS_LE_MENU = {
  onMouseDown: arreter,
  onTouchStart: arreter,
  onPointerDown: arreter,
}

function EntreesMenu({
  entrees,
  type,
}: {
  entrees: EntreeMenu[]
  type: 'contexte' | 'bouton'
}) {
  const Item = type === 'contexte' ? ContextMenuItem : DropdownMenuItem
  const Separateur =
    type === 'contexte' ? ContextMenuSeparator : DropdownMenuSeparator
  const Raison =
    type === 'contexte' ? ContextMenuShortcut : DropdownMenuShortcut
  return entrees.map((e) => {
    const Icone = e.icone
    return (
      <Fragment key={e.cle}>
        {e.separe && <Separateur />}
        <Item
          variant={e.danger ? 'destructive' : 'default'}
          disabled={e.raison !== null}
          onSelect={e.action}
        >
          <Icone />
          {e.libelle}
          {e.raison ? (
            <Raison className="tracking-normal">{e.raison}</Raison>
          ) : null}
        </Item>
      </Fragment>
    )
  })
}

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? 's' : ''}`
}

/** Une ligne du tableau (Registre : `SortableClasseurCard`). */
function LigneClasseur({
  classeur,
  stats,
  statsEtat,
  canDrag,
  menu,
  avecAcces,
  acces,
  onOpen,
}: {
  classeur: DbClasseur
  stats: StatsClasseur | undefined
  statsEtat: 'chargement' | 'erreur' | 'ok'
  /** Peut réordonner la liste : la ligne entière se glisse. */
  canDrag: boolean
  /** Entrées du menu (clic droit et bouton « ⋯ »). */
  menu: EntreeMenu[]
  /** La colonne Accès existe (gestion, ou écriture sur la page). */
  avecAcces: boolean
  /** Contenu de la colonne Accès ; `null` = pas encore lu. */
  acces: Acces | null
  onOpen: () => void
}) {
  const Icon = getIcon(classeur.icon)
  const sousTitre = [classeur.etablissement, classeur.etablissement_complement]
    .filter((s) => s.trim() !== '')
    .join(' · ')
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: classeur.id,
    disabled: !canDrag,
    data: { type: 'classeur', classeurId: classeur.id, title: classeur.name },
  })

  // Un classeur sans chapitre n'a aucune ligne de compteurs : zéro, connu.
  const chapitres = stats?.chapitres ?? 0
  const documents = stats?.documents ?? 0
  const misAJour = stats?.misAJour ?? classeur.updated_at
  const chiffre = (n: number) =>
    statsEtat === 'chargement' ? (
      <Skeleton className="ml-auto h-3.5 w-6" />
    ) : statsEtat === 'erreur' ? (
      '—'
    ) : (
      n
    )

  // Au doigt, l'appui long sert au glisser : le menu passe par le bouton
  // « ⋯ », jamais par l'appui long (Radix l'ouvrirait en plein glisser).
  const dernierPointeur = useRef('')

  const ligne = (
    // La ligne entière : un clic ouvre le classeur, un glisser (souris
    // 5 px, doigt : appui long) le déplace. `role` retiré des attributs de
    // dnd-kit : une ligne de tableau reste une ligne pour les lecteurs
    // d'écran.
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...(canDrag ? attributes : {})}
      {...(canDrag ? listeners : {})}
      role={undefined}
      onClick={onOpen}
      onPointerDown={(e) => {
        dernierPointeur.current = e.pointerType
        if (e.pointerType === 'touch') e.preventDefault()
      }}
      onContextMenu={(e) => {
        if (dernierPointeur.current === 'touch') e.preventDefault()
      }}
      className={cn(
        TABLEAU_CLASSEURS.ligne,
        'cursor-pointer',
        canDrag && CLASSES_CARTE_GLISSABLE,
        isDragging && 'relative z-50 cursor-grabbing bg-card opacity-60',
      )}
    >
      <td className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-7" strokeWidth={1.5} />
          </span>
          <div className="flex min-w-0 flex-col">
            <Link
              to="/classeur/$classeurId"
              params={{ classeurId: String(classeur.id) }}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              className="truncate font-medium text-foreground focus-visible:underline focus-visible:outline-none"
            >
              {classeur.name}
            </Link>
            {sousTitre !== '' && (
              <span className="truncate text-xs text-muted-foreground">
                {sousTitre}
              </span>
            )}
            {/* Sous 640 px, les colonnes chiffrées passent sous le nom. */}
            {statsEtat === 'ok' && (
              <span className="truncate text-xs text-muted-foreground sm:hidden">
                {pluriel(chapitres, 'chapitre')} ·{' '}
                {pluriel(documents, 'document')}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">
        {chiffre(chapitres)}
      </td>
      <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">
        {chiffre(documents)}
      </td>
      <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
        {statsEtat === 'chargement' ? (
          <Skeleton className="h-3.5 w-20" />
        ) : (
          formatDate(misAJour)
        )}
      </td>
      {avecAcces && <AccesCellule acces={acces} />}
      <td className="px-2 py-3">
        <div
          className="flex items-center justify-end gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <Tip label="Actions">
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions du classeur ${classeur.name}`}
                  className="text-muted-foreground"
                  {...neDemarrePasDeGlisser}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent
              align="end"
              className="w-60"
              {...RESTE_DANS_LE_MENU}
            >
              <EntreesMenu entrees={menu} type="bouton" />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{ligne}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <EntreesMenu entrees={menu} type="contexte" />
      </ContextMenuContent>
    </ContextMenu>
  )
}

function AccesCellule({ acces }: { acces: Acces | null }) {
  if (acces === null) return <td className="hidden px-3 py-3 sm:table-cell" />
  const Icone = acces.icone
  return (
    <td className="hidden px-3 py-3 sm:table-cell">
      <Tip label={acces.aide}>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {Icone && <Icone className="size-3.5" />}
          {acces.libelle}
        </span>
      </Tip>
    </td>
  )
}

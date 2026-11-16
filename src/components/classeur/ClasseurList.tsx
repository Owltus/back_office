import { Fragment, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  useDroppable,
} from '@dnd-kit/core'
import type { CollisionDetection, DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Copy,
  FileDown,
  FileUp,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  CLASSES_CARTE_GLISSABLE,
  useCapteursClasseur,
} from '#/components/classeur/dnd/useCapteursClasseur.ts'
import { ClasseurDialog } from '#/components/classeur/dialogs/ClasseurDialog.tsx'
import { ClasseurListHelpPanel } from '#/components/classeur/ClasseurListHelpPanel.tsx'
import {
  useClasseurs,
  useInvaliderClasseur,
  useReorderClasseurs,
  useStatsClasseurs,
} from '#/components/classeur/hooks/useClasseur.ts'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { HelpDialogHeader } from '#/components/shared/HelpDialogHeader.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Dialog, DialogContent } from '#/components/ui/dialog.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '#/components/ui/context-menu.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  FormeClasseurListe,
  TABLEAU_CLASSEURS,
} from '#/components/shared/skeleton/PageShapes.tsx'
import {
  useDroitsPageClasseur,
  usePersonnesClasseur,
} from '#/components/classeur/hooks/useDroitsClasseur.ts'
import { nomAuteur } from '#/lib/classeur/auteurs.ts'
import { CLASSES_ICONE, couleurDe } from '#/lib/classeur/couleurs.ts'
import {
  capacites,
  niveauEffectif,
  peutEtreAuteur,
  rangementVers,
  sectionDe,
  sectionsVisibles,
} from '#/lib/classeur/droits.ts'
import type {
  Moi,
  NiveauEffectif,
  Rangement,
  Section,
} from '#/lib/classeur/droits.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { formatDateCourte, getIcon } from '#/lib/classeur/naming.ts'
import { rangerClasseur, softDeleteClasseur } from '#/lib/classeur/service.ts'
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
 * établissement), dernière modification, accès (menu au clic droit, pas de
 * colonne d'actions). Pas de titre de page (l'onglet suffit). En-tête à
 * droite comme les autres pages : Nouveau classeur (libellé), puis le
 * groupe d'icônes « ? » (aide, `ClasseurListHelpPanel`) et Importer.
 *
 * - Une ligne entière ouvre le classeur ; le nom est le vrai lien (clavier).
 * - Réordonner (ordre partagé) : gestion seule, la ligne entière se glisse
 *   (souris 5 px, doigt : appui long, `useCapteursClasseur`).
 * - Importer : clic (sélecteur) ou fichier .json DÉPOSÉ sur le bouton.
 * - Date de modification lue APRÈS la liste (`useStatsClasseurs`) : la
 *   liste s'affiche d'abord, la date ensuite (place réservée). Colonnes
 *   Chapitres et Documents RETIRÉES (décision utilisateur du 2026-10-19 :
 *   un document compte 1 qu'il fasse 1 ou 50 pages, les feuilles ne
 *   comptent pas, le chiffre trompait).
 *
 * UN TABLEAU PAR TYPE (demande utilisateur du 2026-11-16,
 * `lib/classeur/droits.ts`) : Classeurs publics, Classeurs privés (les
 * siens), Classeurs des gestionnaires (gestion de la page) ; l'admin a en
 * plus les Classeurs privés des autres. Aucun sous-texte sous les titres
 * (demande utilisateur). Chaque ligne dit son
 * AUTEUR. Glisser une ligne dans un autre tableau change son type (et, vers
 * les classeurs privés, son auteur) : l'auteur et la gestion, vers ou depuis Gestion
 * la gestion seule (`rangementVers`). Dans un même tableau, le glisser
 * réordonne (gestion). La liste ne contient que les classeurs lisibles (la
 * RLS filtre).
 *
 * MENU D'UN CLASSEUR (2026-10-19, demande utilisateur) : clic droit sur la
 * ligne, rien d'autre (aucun bouton « ⋯ », décision utilisateur). Ouvrir,
 * Modifier le classeur (nom, type, auteur), Copier pour un LLM, Exporter en
 * JSON, Supprimer : toujours listés, grisés avec leur
 * raison quand le niveau EFFECTIF ne les permet pas (`capacites`, miroir
 * des RLS). La base reste juge : le menu ne fait que le montrer.
 */
export function ClasseurList({
  onImporterJson,
  onExporterJson,
  onCopierJson,
}: {
  onImporterJson?: (file: File) => void | Promise<void>
  onExporterJson?: (classeur: DbClasseur) => void | Promise<void>
  /** Copier pour un LLM (étape 3 du plan `classeur-echange-ia-2026-10-19`). */
  onCopierJson?: (classeur: DbClasseur) => void | Promise<void>
}) {
  const droitsPage = useDroitsPageClasseur()
  const moi = droitsPage.moi
  const canWrite = droitsPage.canCreate
  const canManage = droitsPage.canManage
  const navigate = useNavigate()
  const classeurs = useClasseurs()
  const stats = useStatsClasseurs(classeurs.isSuccess)
  const personnes = usePersonnesClasseur(classeurs.isSuccess)
  const reorder = useReorderClasseurs()
  const ranger = useRangerClasseur()
  const invalider = useInvaliderClasseur()
  const liste = classeurs.data ?? []
  const peutReordonner = droitsPage.canReorderList
  const statsDe = new Map((stats.data ?? []).map((s) => [s.classeurId, s]))
  const niveauDe = (c: DbClasseur): NiveauEffectif => niveauEffectif(moi, c)
  const sections = sectionsVisibles(moi)
  const parSection = (sec: Section) =>
    liste.filter((c) => sectionDe(moi, c) === sec)

  const [createOpen, setCreateOpen] = useState(false)
  const [aSupprimer, setASupprimer] = useState<DbClasseur | null>(null)
  const [aModifier, setAModifier] = useState<DbClasseur | null>(null)
  const [aideOuverte, setAideOuverte] = useState(false)
  const [erreurImport, setErreurImport] = useState<string | null>(null)
  const [erreurRangement, setErreurRangement] = useState<string | null>(null)

  const suppression = useMutation({
    mutationFn: (id: number) => softDeleteClasseur(id),
    onSuccess: () => invalider(),
  })

  // Souris 5 px, doigt : appui long (audit tactile 2026-09-28).
  const sensors = useCapteursClasseur()

  /** Glisser une ligne vers un autre tableau : le rangement permis, ou une raison. */
  function rangementOuRaison(
    c: DbClasseur,
    cible: Section,
  ): Rangement | string {
    const r = rangementVers(moi, c, cible)
    if (r === null)
      return cible === 'gestion'
        ? 'Seule la gestion range un classeur dans Gestion.'
        : 'Seuls l’auteur et la gestion changent le type de ce classeur.'
    // Vers Gestion, l'auteur doit avoir la gestion (la base le refuse aussi).
    const auteur = r.created_by ?? c.created_by
    const p = personnes.data?.find((x) => x.id === auteur)
    if (personnes.data && !peutEtreAuteur(p?.niveau_page ?? null, r.visibilite))
      return `${nomAuteur(auteur, personnes.data, moi.userId)} ne peut pas avoir un classeur de ce type : changez d’abord son auteur (clic droit, Modifier le classeur).`
    return r
  }

  // Le clic qui termine un glisser n'ouvre pas le classeur : dnd-kit
  // l'arrête lui-même (écouteur `click` en capture gardé jusqu'au tour
  // suivant, `AbstractPointerSensor`), testé dans `ClasseurList.test.tsx`.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const moved = liste.find((c) => c.id === Number(active.id))
    if (!moved) return
    const surSection = sectionDeCible(String(over.id))
    const cibleLigne =
      surSection === null
        ? liste.find((c) => c.id === Number(over.id))
        : undefined
    const cible = surSection ?? (cibleLigne ? sectionDe(moi, cibleLigne) : null)
    if (cible === null) return
    if (cible !== sectionDe(moi, moved)) {
      const r = rangementOuRaison(moved, cible)
      if (typeof r === 'string') {
        setErreurRangement(r)
        return
      }
      setErreurRangement(null)
      ranger.mutate({ id: moved.id, rangement: r })
      return
    }
    if (!peutReordonner || !cibleLigne) return
    const ids = liste.map((c) => c.id)
    const oldIndex = ids.indexOf(moved.id)
    const newIndex = ids.indexOf(cibleLigne.id)
    if (oldIndex === -1 || newIndex === -1) return
    ids.splice(oldIndex, 1)
    ids.splice(newIndex, 0, moved.id)
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
    : ranger.isError
      ? messageErreur(ranger.error, 'Classeur non déplacé')
      : suppression.isError
        ? messageErreur(suppression.error, 'Suppression impossible')
        : (erreurRangement ?? erreurImport)

  return (
    // La page défile d'un seul tenant (voir `TABLEAU_CLASSEURS`).
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

      {/* Grammaire des autres pages (Caisse, Lits bébé) : la création en
          bouton à libellé, puis le groupe des boutons à icône, le « ? »
          d'abord. Le « ? » est pour tout le monde, lecture comprise. */}
      <PageHeader
        actionsAlign="end"
        actions={
          <>
            {canWrite && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                <Plus />
                Nouveau classeur
              </Button>
            )}
            <ButtonGroup>
              <Tip label="Comment ça marche">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setAideOuverte(true)}
                  aria-label="Comment ça marche"
                >
                  <HelpGlyph />
                </Button>
              </Tip>
              {importActif && (
                <Tip
                  label={
                    survolDepot
                      ? 'Déposez le fichier ici'
                      : 'Importer un classeur (fichier .json)'
                  }
                >
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Importer un classeur"
                    onClick={() => inputRef.current?.click()}
                    onDragEnter={surDragOver}
                    onDragOver={surDragOver}
                    onDragLeave={surDragLeave}
                    onDrop={surDrop}
                    className={cn(
                      survolDepot &&
                        'border-primary bg-primary/10 text-primary',
                    )}
                  >
                    {survolDepot ? <Upload /> : <FileDown />}
                  </Button>
                </Tip>
              )}
            </ButtonGroup>
          </>
        }
      />

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
        <FormeClasseurListe actions={false} sections={sections.length} />
      ) : classeurs.isError ? null : (
        /* `DndContext` HORS des tableaux : il rend des `<div>` d'annonce pour
           les lecteurs d'écran, interdits dans un `<tbody>` (erreur
           d'hydratation). Seul `SortableContext`, qui ne rend rien, reste
           dans le corps. */
        <DndContext
          sensors={sensors}
          collisionDetection={detection}
          onDragEnd={handleDragEnd}
        >
          <div className={TABLEAU_CLASSEURS.sections}>
            {sections.map((sec) => (
              <TableauSection
                key={sec}
                section={sec}
                classeurs={parSection(sec)}
                vide={
                  sec === 'public' && canWrite && liste.length === 0
                    ? 'Aucun classeur. Créez-en un pour commencer.'
                    : 'Aucun classeur.'
                }
                ligne={(c) => (
                  <LigneClasseur
                    key={c.id}
                    classeur={c}
                    auteur={nomAuteur(c.created_by, personnes.data, moi.userId)}
                    stats={statsDe.get(c.id)}
                    statsEtat={
                      stats.isPending
                        ? 'chargement'
                        : stats.isError
                          ? 'erreur'
                          : 'ok'
                    }
                    canDrag={peutGlisser(moi, c, peutReordonner)}
                    menu={entreesMenu(niveauDe(c), {
                      ouvrir: () =>
                        navigate({
                          to: '/classeur/$classeurId',
                          params: { classeurId: String(c.id) },
                        }),
                      modifier: () => setAModifier(c),
                      exporter: onExporterJson
                        ? () => void onExporterJson(c)
                        : undefined,
                      copier: onCopierJson
                        ? () => void onCopierJson(c)
                        : undefined,
                      supprimer: () => setASupprimer(c),
                    })}
                    onOpen={() =>
                      navigate({
                        to: '/classeur/$classeurId',
                        params: { classeurId: String(c.id) },
                      })
                    }
                  />
                )}
              />
            ))}
          </div>
        </DndContext>
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

      {/* Aide de la page (bouton « ? »), même gabarit que les autres onglets. */}
      <Dialog open={aideOuverte} onOpenChange={setAideOuverte}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <HelpDialogHeader
            icon={<HelpGlyph />}
            title="Comment fonctionnent les classeurs"
            description="Vos classeurs réglementaires, prêts à imprimer."
          />
          {/* Seul le corps défile : l'en-tête reste fixe en haut. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ClasseurListHelpPanel
              canWrite={canWrite}
              canManage={canManage}
              admin={moi.admin}
            />
          </div>
        </DialogContent>
      </Dialog>

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

/** Intitulé de chaque tableau (libellés de l'utilisateur, 2026-11-16). */
export const TITRE_SECTION: Record<Section, string> = {
  public: 'Classeurs publics',
  mesPrives: 'Classeurs privés',
  privesAutres: 'Classeurs privés des autres',
  gestion: 'Classeurs des gestionnaires',
}

const PREFIXE_SECTION = 'section:'

function sectionDeCible(id: string): Section | null {
  if (!id.startsWith(PREFIXE_SECTION)) return null
  return id.slice(PREFIXE_SECTION.length) as Section
}

/**
 * Sous le pointeur d'abord (une ligne avant son tableau), sinon le plus
 * proche : un tableau vide reste une cible.
 */
const detection: CollisionDetection = (args) => {
  const sous = pointerWithin(args)
  if (sous.length > 0)
    return [...sous].sort(
      (a, b) =>
        Number(String(a.id).startsWith(PREFIXE_SECTION)) -
        Number(String(b.id).startsWith(PREFIXE_SECTION)),
    )
  return closestCenter(args)
}

/** Une ligne se glisse si elle peut changer de tableau ou d'ordre. */
function peutGlisser(moi: Moi, c: DbClasseur, reordonner: boolean): boolean {
  if (reordonner) return true
  return sectionsVisibles(moi).some((s) => rangementVers(moi, c, s) !== null)
}

/** Type et auteur d'un classeur, en OPTIMISTE sur la liste. */
function useRangerClasseur() {
  const queryClient = useQueryClient()
  const invalider = useInvaliderClasseur()
  const key = classeurKeys.list()
  return useMutation({
    mutationFn: ({ id, rangement }: { id: number; rangement: Rangement }) =>
      rangerClasseur(id, rangement),
    onMutate: async ({ id, rangement }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const avant = queryClient.getQueryData<DbClasseur[]>(key)
      if (avant)
        queryClient.setQueryData<DbClasseur[]>(
          key,
          avant.map((c) => (c.id === id ? { ...c, ...rangement } : c)),
        )
      return { avant }
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.avant) queryClient.setQueryData(key, ctx.avant)
    },
    onSettled: () => invalider(),
  })
}

/** Un tableau : son intitulé, puis sa carte, cible de dépôt même vide. */
function TableauSection({
  section,
  classeurs,
  vide,
  ligne,
}: {
  section: Section
  classeurs: DbClasseur[]
  vide: string
  ligne: (c: DbClasseur) => ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: PREFIXE_SECTION + section,
  })
  return (
    <section
      className={TABLEAU_CLASSEURS.section}
      aria-label={TITRE_SECTION[section]}
    >
      <h2 className={TABLEAU_CLASSEURS.titre}>{TITRE_SECTION[section]}</h2>
      <div
        ref={setNodeRef}
        className={cn(
          TABLEAU_CLASSEURS.carte,
          'transition-colors',
          isOver && 'border-primary ring-2 ring-primary/30',
        )}
      >
        <table className={TABLEAU_CLASSEURS.table}>
          <thead className={TABLEAU_CLASSEURS.thead}>
            <tr>
              <th className={cn(TABLEAU_CLASSEURS.th, 'text-left')}>
                Classeur
              </th>
              <th
                className={cn(
                  TABLEAU_CLASSEURS.th,
                  TABLEAU_CLASSEURS.colAuteur,
                  'text-left',
                )}
              >
                Auteur
              </th>
              <th
                className={cn(
                  TABLEAU_CLASSEURS.th,
                  TABLEAU_CLASSEURS.colDate,
                  'text-center',
                )}
              >
                Modifié le
              </th>
            </tr>
          </thead>
          <tbody>
            {classeurs.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  {vide}
                </td>
              </tr>
            ) : (
              <SortableContext
                items={classeurs.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {classeurs.map(ligne)}
              </SortableContext>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
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

/** Les entrées du menu d'un classeur selon le niveau EFFECTIF (`niveauEffectif`). */
function entreesMenu(
  niveau: NiveauEffectif,
  actions: {
    ouvrir: () => void
    modifier: () => void
    exporter?: () => void
    copier?: () => void
    supprimer: () => void
  },
): EntreeMenu[] {
  const peut = capacites(niveau)
  const raison = (permis: boolean, sinon: string) => (permis ? null : sinon)
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
      raison: raison(peut.modifier, 'Lecture seule'),
      separe: true,
    },
  ]
  // Copier pour un LLM et Exporter en JSON : mêmes droits (lire suffit).
  if (actions.copier)
    entrees.push({
      cle: 'copier',
      libelle: 'Copier pour un LLM',
      icone: Copy,
      action: actions.copier,
      raison: null,
      separe: true,
    })
  if (actions.exporter)
    entrees.push({
      cle: 'exporter',
      libelle: 'Exporter en JSON',
      icone: FileUp,
      action: actions.exporter,
      raison: null,
      separe: !actions.copier,
    })
  entrees.push({
    cle: 'supprimer',
    libelle: 'Supprimer',
    icone: Trash2,
    action: actions.supprimer,
    raison: raison(peut.supprimerClasseur, 'Gestion seule'),
    danger: true,
    separe: true,
  })
  return entrees
}

function EntreesMenu({ entrees }: { entrees: EntreeMenu[] }) {
  return entrees.map((e) => {
    const Icone = e.icone
    return (
      <Fragment key={e.cle}>
        {e.separe && <ContextMenuSeparator />}
        <ContextMenuItem
          variant={e.danger ? 'destructive' : 'default'}
          disabled={e.raison !== null}
          onSelect={e.action}
        >
          <Icone />
          {e.libelle}
          {e.raison ? (
            <ContextMenuShortcut className="tracking-normal">
              {e.raison}
            </ContextMenuShortcut>
          ) : null}
        </ContextMenuItem>
      </Fragment>
    )
  })
}

/** Une ligne du tableau (Registre : `SortableClasseurCard`). */
function LigneClasseur({
  classeur,
  auteur,
  stats,
  statsEtat,
  canDrag,
  menu,
  onOpen,
}: {
  classeur: DbClasseur
  /** Nom de l'auteur (« Vous » pour soi). */
  auteur: string
  stats: StatsClasseur | undefined
  statsEtat: 'chargement' | 'erreur' | 'ok'
  /** La ligne se glisse (ordre ou autre tableau). */
  canDrag: boolean
  /** Entrées du menu du clic droit. */
  menu: EntreeMenu[]
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

  // Un classeur sans chapitre n'a aucune ligne lue : sa propre date.
  const misAJour = stats?.misAJour ?? classeur.updated_at

  // Au doigt, sur une ligne qui se glisse, l'appui long sert au glisser :
  // le menu ne s'y ouvre pas (Radix l'ouvrirait en plein glisser). Sur une
  // ligne qui ne se glisse pas, l'appui long ouvre le menu.
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
        if (canDrag && e.pointerType === 'touch') e.preventDefault()
      }}
      onContextMenu={(e) => {
        if (canDrag && dernierPointeur.current === 'touch') e.preventDefault()
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
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl',
              CLASSES_ICONE[couleurDe(classeur.couleur)],
            )}
          >
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
            {/* Sous 640 px, la colonne Auteur est masquée : l'auteur passe ici. */}
            <span className="truncate text-xs text-muted-foreground sm:hidden">
              {auteur}
            </span>
          </div>
        </div>
      </td>
      <td className="hidden truncate px-3 py-3 text-muted-foreground sm:table-cell">
        {auteur}
      </td>
      <td className="hidden px-3 py-3 text-center text-muted-foreground sm:table-cell">
        {statsEtat === 'chargement' ? (
          <Skeleton className="mx-auto h-3.5 w-14" />
        ) : (
          formatDateCourte(misAJour)
        )}
      </td>
    </tr>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{ligne}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <EntreesMenu entrees={menu} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

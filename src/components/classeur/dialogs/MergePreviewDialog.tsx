import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  ClipboardList,
  Equal,
  FileText,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useAppliquerFusion } from '#/components/classeur/hooks/useMerge.ts'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { previsualiserFusion } from '#/lib/classeur/merge/apply.ts'
import { resumerPlan } from '#/lib/classeur/merge/merge.ts'
import type {
  ActionApercu,
  MergePreviewItem,
  MergeResult,
  PlanFusion,
} from '#/lib/classeur/merge/merge.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import { getIcon } from '#/lib/classeur/naming.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Prévisualisation puis application d'une fusion JSON dans un classeur
 * existant — portée de Registre (`features/merge/MergePreviewDialog.tsx`),
 * avec la lecture du fichier et la bascule « Remplacer » intégrées (chez
 * Registre, la page les portait).
 *
 * Le fichier est lu par `File.text()` (borné par `MAX_JSON_BYTES`), validé
 * par `parseImportJson`, puis le plan est calculé SANS écriture
 * (`previsualiserFusion`). La préparation est une mutation et non une
 * `useQuery` : ce n'est pas une ressource à mettre en cache (un `File` n'est
 * pas sérialisable et le plan ne doit jamais atteindre le cache persisté),
 * c'est un calcul à la demande, refait quand la bascule change.
 */

const ACTIONS: Record<
  ActionApercu,
  { label: string; icon: LucideIcon; className: string }
> = {
  insert: { label: 'ajouté', icon: Plus, className: 'text-emerald-500' },
  update: { label: 'modifié', icon: Pencil, className: 'text-amber-500' },
  delete: { label: 'supprimé', icon: Trash2, className: 'text-destructive' },
  skip: { label: 'ignoré', icon: Minus, className: 'text-destructive' },
  unchanged: {
    label: 'inchangé',
    icon: Equal,
    className: 'text-muted-foreground',
  },
}

const ORDRE_BADGES: ActionApercu[] = [
  'insert',
  'update',
  'delete',
  'unchanged',
  'skip',
]

const NATURES: Record<string, { label: string; icon: LucideIcon }> = {
  document: { label: 'Document', icon: FileText },
  tracking_sheet: { label: 'Feuille de suivi', icon: ClipboardList },
  signature_sheet: { label: 'Feuille de signature', icon: Users },
  intercalaire: { label: 'Intercalaire', icon: BookOpen },
}

interface Groupe {
  label: string
  chapitre: MergePreviewItem | null
  items: MergePreviewItem[]
}

/** Regroupe l'aperçu par chapitre et applique le filtre (port du `useMemo` source). */
export function grouperApercu(
  apercu: ReadonlyArray<MergePreviewItem>,
  filtre: ActionApercu | null,
): Groupe[] {
  const groupes = new Map<string, Groupe>()
  const groupe = (cle: string) => {
    let g = groupes.get(cle)
    if (!g) {
      g = { label: cle, chapitre: null, items: [] }
      groupes.set(cle, g)
    }
    return g
  }
  for (const item of apercu) {
    const cle = item.chapter_label || 'Sans chapitre'
    const retenu = filtre === null || item.action === filtre
    if (item.kind === 'chapter') {
      const g = groupe(cle)
      if (retenu) g.chapitre = item
    } else if (retenu) {
      groupe(cle).items.push(item)
    }
  }
  if (filtre !== null) {
    for (const [cle, g] of groupes) {
      if (g.chapitre === null && g.items.length === 0) groupes.delete(cle)
    }
  }
  return [...groupes.values()]
}

function compteur(plan: PlanFusion, action: ActionApercu): number {
  switch (action) {
    case 'insert':
      return plan.resultat.inserted
    case 'update':
      return plan.resultat.updated
    case 'delete':
      return plan.resultat.deleted
    case 'unchanged':
      return plan.resultat.unchanged
    case 'skip':
      return plan.resultat.skipped
  }
}

interface Preparation {
  fichier: ClasseurJson
  plan: PlanFusion
}

async function preparer(
  classeurId: number,
  file: File,
  replace: boolean,
): Promise<Preparation> {
  const trop = fileTooLarge(file, MAX_JSON_BYTES)
  if (trop) throw new Error(trop)
  const fichier = parseImportJson(await file.text())
  const plan = await previsualiserFusion(classeurId, fichier, { replace })
  return { fichier, plan }
}

export function MergePreviewDialog({
  open,
  onOpenChange,
  classeurId,
  file,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classeurId: number
  /** Fichier `.json` choisi ou déposé ; `null` tant qu'il n'y en a pas. */
  file: File | null
  /** Appelé après une fusion réussie, avec ses compteurs. */
  onDone?: (result: MergeResult) => void
}) {
  const [replace, setReplace] = useState(false)
  const [filtre, setFiltre] = useState<ActionApercu | null>(null)

  const preparation = useMutation({
    mutationFn: (args: { file: File; replace: boolean }) =>
      preparer(classeurId, args.file, args.replace),
  })
  const fusion = useAppliquerFusion()

  // Relecture à chaque ouverture, changement de fichier ou de bascule.
  const { mutate: lancerPreparation, reset: oublierPreparation } = preparation
  useEffect(() => {
    if (!open || file === null) return
    setFiltre(null)
    lancerPreparation({ file, replace })
  }, [open, file, replace, classeurId, lancerPreparation])

  const { reset: oublierFusion } = fusion
  useEffect(() => {
    if (open) return
    setReplace(false)
    setFiltre(null)
    oublierPreparation()
    oublierFusion()
  }, [open, oublierPreparation, oublierFusion])

  const plan = preparation.data?.plan ?? null
  const groupes = useMemo(
    () => (plan ? grouperApercu(plan.apercu, filtre) : []),
    [plan, filtre],
  )
  const aDesChangements =
    plan !== null &&
    plan.resultat.inserted + plan.resultat.updated + plan.resultat.deleted > 0
  const occupe = preparation.isPending || fusion.isPending

  function fusionner() {
    if (!preparation.data || !aDesChangements || fusion.isPending) return
    fusion.mutate(
      {
        classeurId,
        fichier: preparation.data.fichier,
        replace,
        sourceName: file?.name ?? preparation.data.fichier.classeur.name,
      },
      {
        onSuccess: (result) => {
          onOpenChange(false)
          onDone?.(result)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && fusion.isPending) return
        onOpenChange(o)
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Prévisualisation de l'import</DialogTitle>
          <DialogDescription>
            {file
              ? `${file.name} : ce qui changera dans le classeur.`
              : 'Aucun fichier sélectionné.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="merge-replace">Remplacer le contenu</Label>
            <span className="text-xs text-muted-foreground">
              {replace
                ? 'Le fichier fait foi : ce qui n’y figure pas est supprimé.'
                : 'Fusion : rien n’est supprimé, le plus récent gagne.'}
            </span>
          </div>
          <Switch
            id="merge-replace"
            checked={replace}
            onCheckedChange={setReplace}
            disabled={occupe}
          />
        </div>

        {preparation.isError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {messageErreur(preparation.error, 'Lecture impossible')}
            </AlertDescription>
          </Alert>
        )}

        {plan && plan.warnings.length > 0 && (
          <Alert>
            <AlertTriangle />
            <AlertTitle>
              {plan.warnings.length}{' '}
              {plan.warnings.length > 1 ? 'avertissements' : 'avertissement'}
            </AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {plan && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {ORDRE_BADGES.map((action) => {
              const n = compteur(plan, action)
              if (n === 0 && action !== 'insert' && action !== 'update')
                return null
              const cfg = ACTIONS[action]
              const actif = filtre === action
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => setFiltre(actif ? null : action)}
                  className={cn(
                    'rounded-md px-2 py-0.5 font-medium transition-colors hover:bg-accent',
                    cfg.className,
                    actif && 'bg-accent ring-1 ring-border',
                  )}
                >
                  {n} {cfg.label}
                  {n > 1 ? 's' : ''}
                </button>
              )
            })}
            {filtre !== null && (
              <button
                type="button"
                onClick={() => setFiltre(null)}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                Tout afficher
              </button>
            )}
          </div>
        )}

        <div className="min-h-24 flex-1 overflow-y-auto pr-1">
          {preparation.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Lecture du fichier et calcul de l'aperçu…
            </p>
          ) : plan === null ? null : plan.apercu.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {plan.resultat.unchanged > 0
                ? 'Tout est déjà à jour : aucun changement à appliquer.'
                : 'Aucun élément dans le fichier importé.'}
            </p>
          ) : groupes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun élément pour ce filtre.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {groupes.map((g) => {
                const IconeChapitre = getIcon(
                  g.chapitre?.icon ?? g.items[0]?.icon ?? 'FileText',
                )
                const actionChapitre =
                  g.chapitre && g.chapitre.action !== 'unchanged'
                    ? ACTIONS[g.chapitre.action]
                    : null
                return (
                  <div key={g.label}>
                    <div className="mb-1 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                      <IconeChapitre className="size-4 shrink-0" />
                      <span className="flex-1 truncate text-sm font-semibold">
                        {g.label}
                      </span>
                      {actionChapitre && (
                        <span
                          className={cn(
                            'flex items-center gap-1 text-xs',
                            actionChapitre.className,
                          )}
                        >
                          <actionChapitre.icon className="size-3.5" />
                          {actionChapitre.label}
                        </span>
                      )}
                    </div>
                    {g.items.length > 0 && (
                      <ul className="flex flex-col gap-0.5 pl-5">
                        {g.items.map((item, i) => {
                          const cfg = ACTIONS[item.action]
                          const nature = NATURES[item.kind] as
                            { label: string; icon: LucideIcon } | undefined
                          const IconeNature = nature?.icon ?? FileText
                          return (
                            <li
                              key={`${item.kind}:${item.title}:${i}`}
                              className="flex items-center gap-2.5 rounded px-2 py-1 text-sm hover:bg-accent/50"
                            >
                              <IconeNature className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">
                                {item.title || 'Sans titre'}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {nature?.label ?? item.kind}
                              </span>
                              <cfg.icon
                                className={cn(
                                  'ml-auto size-3.5 shrink-0',
                                  cfg.className,
                                )}
                                aria-label={cfg.label}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {fusion.isError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {messageErreur(fusion.error, 'Fusion impossible')}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="items-center">
          {plan && (
            <span className="mr-auto text-xs text-muted-foreground">
              {resumerPlan(plan)}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={fusion.isPending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={fusionner}
            disabled={!plan || occupe || !aDesChangements}
          >
            {fusion.isPending && <Loader2 className="animate-spin" />}
            {plan && !aDesChangements ? 'Aucun changement' : 'Fusionner'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

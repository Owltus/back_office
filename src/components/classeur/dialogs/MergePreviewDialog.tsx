import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react'

import {
  ApercuImport,
  compterImport,
  useImagesRelecture,
} from '#/components/classeur/dialogs/ApercuImport.tsx'
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
import { previsualiserFusionComplete } from '#/lib/classeur/merge/apply.ts'
import type {
  ApercuFusion,
  ResultatFusion,
} from '#/lib/classeur/merge/apply.ts'
import { resumerPlan } from '#/lib/classeur/merge/merge.ts'
import type { PlanFusion } from '#/lib/classeur/merge/merge.ts'
import { filtrerPlan } from '#/lib/classeur/merge/portee.ts'
import type { ChapitreLigne, LigneImport } from '#/lib/classeur/merge/portee.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'

/*
 * Prévisualisation puis application de l'import JSON d'un classeur COMPLET
 * (carte « Importer un JSON » de l'accueil), portée de Registre puis alignée
 * sur l'aperçu du réimport chapitre / document (audit du 2026-10-04 : la
 * question « voir le texte modifié par le LLM avant d'importer, refuser un
 * document » n'était remplie que pour le dialogue `{}`).
 *
 * Même aperçu (`ApercuImport`), GROUPÉ par chapitre : une ligne par action,
 * diff au dépliage, case de refus, version prévue, relecture avec la
 * médiathèque lue à l'ouverture. Les actions de chapitre (création,
 * modification, suppression) sont des lignes à part, sans case. Les modes
 * fusion / remplacement sont inchangés.
 *
 * Le refus passe par `filtrerPlan` DANS le planificateur d'`appliquerFusion`
 * (avant le test « aucune action » et avant le point de restauration), le
 * plan étant recalculé sur l'état relu : seules les clés comptent.
 *
 * La préparation est une mutation et non une `useQuery` : un `File` n'est
 * pas sérialisable et le plan ne doit jamais atteindre le cache persisté.
 */

interface Preparation extends ApercuFusion {
  fichier: ClasseurJson
}

async function preparer(
  classeurId: number,
  file: File,
  replace: boolean,
): Promise<Preparation> {
  const trop = fileTooLarge(file, MAX_JSON_BYTES)
  if (trop) throw new Error(trop)
  const fichier = parseImportJson(await file.text())
  const apercu = await previsualiserFusionComplete(classeurId, fichier, {
    replace,
  })
  return { fichier, ...apercu }
}

/** Raison affichée sous une suppression qu'on ne peut pas refuser. */
export const VERROU_CHAPITRE_SUPPRIME =
  'Supprimé avec son chapitre : il ne peut pas être gardé seul.'

/**
 * Lignes NON refusables : la suppression d'un élément dont le chapitre est
 * lui-même supprimé par le plan (remplacement). Refusée, elle laisserait un
 * élément vivant dans un chapitre supprimé, invisible partout.
 */
export function verrousFusion(
  plan: PlanFusion,
  lignes: readonly LigneImport[],
  chapitres: readonly ChapitreLigne[],
): ReadonlyMap<string, string> {
  const supprimes = new Set(
    plan.actions.flatMap((a) =>
      a.type === 'supprimerChapitre' ? [`local:${String(a.id)}`] : [],
    ),
  )
  const verrous = new Map<string, string>()
  lignes.forEach((l, i) => {
    const ch = chapitres.at(i)
    if (
      l.cle !== null &&
      l.genre === 'suppression' &&
      ch !== undefined &&
      supprimes.has(ch.cle)
    )
      verrous.set(l.cle, VERROU_CHAPITRE_SUPPRIME)
  })
  return verrous
}

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${String(n)} ${n > 1 ? plurielForme : singulier}`
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
  /** Appelé après une fusion réussie, avec ses compteurs (`ignores` compris). */
  onDone?: (result: ResultatFusion) => void
}) {
  const [replace, setReplace] = useState(false)
  // Refus (clés `clesActions`) et lignes dépliées. Les refus survivent à la
  // bascule fusion / remplacement : seuls comptent ceux encore à l'écran.
  const [refuses, setRefuses] = useState<ReadonlySet<string>>(new Set())
  const [ouvertes, setOuvertes] = useState<ReadonlySet<string>>(new Set())
  const { images, etatImages } = useImagesRelecture(classeurId, open)

  const preparation = useMutation({
    mutationFn: (args: { file: File; replace: boolean }) =>
      preparer(classeurId, args.file, args.replace),
  })
  const fusion = useAppliquerFusion()

  // Relecture à chaque ouverture, changement de fichier ou de bascule.
  const { mutate: lancerPreparation, reset: oublierPreparation } = preparation
  useEffect(() => {
    if (!open || file === null) return
    lancerPreparation({ file, replace })
  }, [open, file, replace, classeurId, lancerPreparation])

  // Un autre fichier : les refus du précédent n'ont plus de sens.
  useEffect(() => {
    setRefuses(new Set())
    setOuvertes(new Set())
  }, [file])

  const { reset: oublierFusion } = fusion
  useEffect(() => {
    if (open) return
    setReplace(false)
    setRefuses(new Set())
    setOuvertes(new Set())
    oublierPreparation()
    oublierFusion()
  }, [open, oublierPreparation, oublierFusion])

  const donnees = preparation.data
  const plan = donnees?.plan ?? null
  const lignes = useMemo(() => donnees?.lignes ?? [], [donnees])
  const verrous = useMemo(
    () =>
      donnees
        ? verrousFusion(donnees.plan, donnees.lignes, donnees.chapitres)
        : new Map<string, string>(),
    [donnees],
  )
  // Une ligne verrouillée n'est jamais refusée, même cochée avant la bascule.
  const refusesEffectifs = useMemo(
    () => new Set([...refuses].filter((k) => !verrous.has(k))),
    [refuses, verrous],
  )
  const comptes = compterImport(lignes, refusesEffectifs)
  const planRetenu =
    plan === null ? null : filtrerPlan(plan, comptes.exclus).plan
  const aDesChangements = planRetenu !== null && planRetenu.actions.length > 0
  const occupe = preparation.isPending || fusion.isPending

  function basculerRefus(cle: string) {
    setRefuses((avant) => {
      const s = new Set(avant)
      if (s.has(cle)) s.delete(cle)
      else s.add(cle)
      return s
    })
  }

  function fusionner() {
    if (!preparation.data || !aDesChangements || fusion.isPending) return
    fusion.mutate(
      {
        classeurId,
        fichier: preparation.data.fichier,
        replace,
        exclus: comptes.exclus,
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

  // B8 (audit) : libellé neutre tant que l'aperçu n'est pas calculé.
  const libelleBouton =
    plan === null || preparation.isPending
      ? 'Importer'
      : plan.actions.length === 0
        ? 'Aucun changement'
        : comptes.retenus === 0 && comptes.chapitre
          ? 'Importer les chapitres'
          : `Importer ${pluriel(comptes.retenus, comptes.nom, comptes.noms)}`

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && fusion.isPending) return
        onOpenChange(o)
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl">
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

        <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto pr-1">
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

          {preparation.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Lecture du fichier et calcul de l'aperçu…
            </p>
          ) : plan === null ? null : lignes.length === 0 ? (
            <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              {plan.resultat.unchanged > 0
                ? 'Tout est déjà à jour : aucun changement à appliquer.'
                : 'Aucun élément dans le fichier importé.'}
            </p>
          ) : (
            <ApercuImport
              lignes={lignes}
              chapitres={donnees?.chapitres}
              verrous={verrous}
              refuses={refusesEffectifs}
              onBasculerRefus={basculerRefus}
              ouvertes={ouvertes}
              onOuvertes={setOuvertes}
              disabled={fusion.isPending}
              images={images}
              etatImages={etatImages}
            />
          )}
        </div>

        {fusion.isError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {messageErreur(fusion.error, 'Import impossible')}
            </AlertDescription>
          </Alert>
        )}

        {plan && !preparation.isPending && (
          <p className="text-xs text-muted-foreground">
            {resumerPlan(planRetenu ?? plan)}.
            {aDesChangements &&
              " Un point de restauration est pris avant d'appliquer."}
          </p>
        )}

        <DialogFooter>
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
            {libelleBouton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  Download,
  Equal,
  FileUp,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { usePeriodicites } from '#/components/classeur/hooks/useClasseur.ts'
import { useAppliquerFusionPortee } from '#/components/classeur/hooks/useMerge.ts'
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
import { Textarea } from '#/components/ui/textarea.tsx'
import { telechargerTexte } from '#/lib/classeur/download.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import {
  nomFichierPortee,
  serialiserExport,
} from '#/lib/classeur/exportJson.ts'
import { previsualiserFusionPortee } from '#/lib/classeur/merge/apply.ts'
import { resumerPlan } from '#/lib/classeur/merge/merge.ts'
import type { ActionApercu, PlanFusion } from '#/lib/classeur/merge/merge.ts'
import {
  construireExportChapitre,
  construireExportDocument,
  extraireJson,
} from '#/lib/classeur/merge/portee.ts'
import type { CiblePortee } from '#/lib/classeur/merge/portee.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
  DbDocument,
} from '#/lib/classeur/types.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'
import { cn } from '#/lib/utils.ts'

/*
 * « JSON pour un LLM » d'un chapitre ou d'un document (demande utilisateur du
 * 2026-09-29). Deux temps dans une seule fenêtre :
 *   1. EXPORTER : copier (le plus direct pour un LLM) ou télécharger le
 *      fichier, qui embarque ses consignes (`_metadata.instructions`) ;
 *   2. RÉIMPORTER (droit d'écriture) : coller la réponse du LLM ou choisir un
 *      fichier, voir l'aperçu, puis appliquer. Réimport LIMITÉ à la portée
 *      (`portee.ts`) : rien d'autre dans le classeur ne peut changer, et un
 *      point de restauration est pris avant la première écriture.
 * L'aperçu est une mutation, pas une `useQuery` : un calcul à la demande sur
 * un texte collé, qui ne doit jamais atteindre le cache persisté.
 */

export type SujetJson =
  | { type: 'chapitre'; chapitre: DbChapter; contenu: ChapterContent }
  | { type: 'document'; chapitre: DbChapter; document: DbDocument }

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

/** Délai après la dernière frappe (ou le collage) avant de calculer l'aperçu. */
const ATTENTE_APERCU_MS = 400

interface Preparation {
  fichier: ClasseurJson
  plan: PlanFusion
}

function tailleOctets(texte: string): number {
  return new TextEncoder().encode(texte).length
}

export function EchangeJsonDialog({
  open,
  onOpenChange,
  classeur,
  sujet,
  canWrite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classeur: DbClasseur | null
  sujet: SujetJson | null
  canWrite: boolean
}) {
  const periodicitesQ = usePeriodicites()
  const [copie, setCopie] = useState<'ok' | 'erreur' | null>(null)
  const [texte, setTexte] = useState('')
  const [supprimerAbsents, setSupprimerAbsents] = useState(false)
  const [applique, setApplique] = useState<string | null>(null)
  const [erreurFichier, setErreurFichier] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cible: CiblePortee | null =
    sujet === null
      ? null
      : sujet.type === 'chapitre'
        ? { type: 'chapitre', chapitreId: sujet.chapitre.id }
        : { type: 'document', documentId: sujet.document.id }

  const preparation = useMutation({
    mutationFn: async (args: {
      texte: string
      cible: CiblePortee
      classeurId: number
      supprimerAbsents: boolean
    }): Promise<Preparation> => {
      if (tailleOctets(args.texte) > MAX_JSON_BYTES)
        throw new Error('Texte trop volumineux pour un import.')
      const fichier = parseImportJson(extraireJson(args.texte))
      const plan = await previsualiserFusionPortee(
        args.classeurId,
        fichier,
        args.cible,
        { supprimerAbsents: args.supprimerAbsents },
      )
      return { fichier, plan }
    },
  })
  const fusion = useAppliquerFusionPortee()

  // Aperçu recalculé après la frappe, le collage ou la bascule.
  const { mutate: preparer, reset: oublierPreparation } = preparation
  const cleCible =
    cible === null
      ? ''
      : cible.type === 'chapitre'
        ? `c${cible.chapitreId}`
        : `d${cible.documentId}`
  useEffect(() => {
    if (!open || cible === null || classeur === null) return
    if (texte.trim() === '') {
      oublierPreparation()
      return
    }
    const minuteur = window.setTimeout(() => {
      preparer({ texte, cible, classeurId: classeur.id, supprimerAbsents })
    }, ATTENTE_APERCU_MS)
    return () => window.clearTimeout(minuteur)
    // `cible` est dérivée de `cleCible` (objet recréé à chaque rendu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    texte,
    cleCible,
    classeur,
    supprimerAbsents,
    preparer,
    oublierPreparation,
  ])

  // Fermeture : tout repart de zéro.
  const { reset: oublierFusion } = fusion
  useEffect(() => {
    if (open) return
    setTexte('')
    setCopie(null)
    setSupprimerAbsents(false)
    setApplique(null)
    setErreurFichier(null)
    oublierPreparation()
    oublierFusion()
  }, [open, oublierPreparation, oublierFusion])

  if (sujet === null) return null

  const libelle =
    sujet.type === 'chapitre'
      ? `le chapitre « ${sujet.chapitre.label} »`
      : `le document « ${sujet.document.title} »`

  function construire(): string | null {
    if (classeur === null || sujet === null) return null
    const periodicites = periodicitesQ.data ?? []
    const donnees =
      sujet.type === 'chapitre'
        ? construireExportChapitre(
            classeur,
            sujet.chapitre,
            sujet.contenu,
            periodicites,
          )
        : construireExportDocument(
            classeur,
            sujet.chapitre,
            sujet.document,
            periodicites,
          )
    return serialiserExport(donnees)
  }

  async function copier() {
    const json = construire()
    if (json === null) return
    try {
      await navigator.clipboard.writeText(json)
      setCopie('ok')
      window.setTimeout(() => setCopie(null), 2500)
    } catch {
      setCopie('erreur')
    }
  }

  function telecharger() {
    const json = construire()
    if (json === null || classeur === null || sujet === null) return
    const nom =
      sujet.type === 'chapitre'
        ? nomFichierPortee(classeur.name, sujet.chapitre.label)
        : nomFichierPortee(
            classeur.name,
            sujet.chapitre.label,
            sujet.document.title,
          )
    telechargerTexte(nom, json, 'application/json;charset=utf-8')
  }

  async function choisirFichier(file: File) {
    setApplique(null)
    const trop = fileTooLarge(file, MAX_JSON_BYTES)
    setErreurFichier(trop)
    if (trop) return
    setTexte(await file.text())
  }

  const plan = preparation.data?.plan ?? null
  const aDesChangements =
    plan !== null &&
    plan.resultat.inserted + plan.resultat.updated + plan.resultat.deleted > 0

  function appliquer() {
    if (
      !preparation.data ||
      !aDesChangements ||
      cible === null ||
      classeur === null ||
      sujet === null
    )
      return
    fusion.mutate(
      {
        classeurId: classeur.id,
        fichier: preparation.data.fichier,
        cible,
        supprimerAbsents,
        sourceName:
          sujet.type === 'chapitre'
            ? `Import JSON du chapitre « ${sujet.chapitre.label} »`
            : `Import JSON du document « ${sujet.document.title} »`,
      },
      {
        onSuccess: (resultat) => {
          const r = resultat
          setApplique(
            `Import appliqué : ${r.inserted} ajout(s), ${r.updated} modification(s), ${r.deleted} suppression(s).`,
          )
          setTexte('')
          preparation.reset()
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
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>JSON pour un LLM</DialogTitle>
          <DialogDescription>
            Exporter {libelle}, le faire retravailler, puis le réimporter.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">1. Exporter</h3>
          <p className="text-sm text-muted-foreground">
            Le JSON contient le texte et les consignes pour le LLM : ce qu'il
            peut modifier, ce qu'il ne doit jamais toucher, la mise en forme de
            la page. Collez-le tel quel dans la conversation.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copier()}
              disabled={classeur === null}
            >
              {copie === 'ok' ? <Check /> : <Copy />}
              {copie === 'ok' ? 'Copié' : 'Copier le JSON'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={telecharger}
              disabled={classeur === null}
            >
              <Download />
              Télécharger (.json)
            </Button>
          </div>
          {copie === 'erreur' && (
            <p className="text-sm text-destructive">
              Copie refusée par le navigateur : utilisez Télécharger.
            </p>
          )}
        </section>

        {canWrite && (
          <section className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-medium">2. Réimporter</h3>
            <Textarea
              value={texte}
              onChange={(e) => {
                setApplique(null)
                setErreurFichier(null)
                setTexte(e.target.value)
              }}
              placeholder="Collez ici le JSON rendu par le LLM (même entouré de texte ou de ```json)."
              aria-label="JSON à réimporter"
              spellCheck={false}
              className="h-32 resize-none font-mono text-xs [field-sizing:fixed]"
              disabled={fusion.isPending}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                ref={inputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void choisirFichier(f)
                  e.target.value = ''
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => inputRef.current?.click()}
                disabled={fusion.isPending}
              >
                <FileUp />
                Ou choisir un fichier .json
              </Button>
              {sujet.type === 'chapitre' && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="json-supprimer-absents"
                    checked={supprimerAbsents}
                    onCheckedChange={setSupprimerAbsents}
                    disabled={fusion.isPending}
                  />
                  <Label
                    htmlFor="json-supprimer-absents"
                    className="text-sm font-normal"
                  >
                    Supprimer les éléments absents du JSON
                  </Label>
                </div>
              )}
            </div>

            {erreurFichier !== null && (
              <p className="text-sm text-destructive">{erreurFichier}</p>
            )}
            {preparation.isPending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Lecture du JSON…
              </p>
            )}
            {preparation.isError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>
                  {messageErreur(preparation.error, 'Import impossible')}
                </AlertDescription>
              </Alert>
            )}
            {plan && plan.warnings.length > 0 && (
              <Alert>
                <AlertTriangle />
                <AlertTitle>À savoir</AlertTitle>
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
              <div className="rounded-md border px-3 py-2">
                {plan.apercu.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun changement : le contenu est identique.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {plan.apercu.map((l, i) => {
                      const cfg = ACTIONS[l.action]
                      return (
                        <li
                          key={`${l.kind}:${l.title}:${i}`}
                          className="flex items-center gap-2 text-sm"
                        >
                          <cfg.icon
                            className={cn('size-3.5 shrink-0', cfg.className)}
                          />
                          <span className="truncate">
                            {l.kind === 'chapter' ? 'Chapitre : ' : ''}
                            {l.title || 'Sans titre'}
                          </span>
                          <span
                            className={cn('ml-auto text-xs', cfg.className)}
                          >
                            {cfg.label}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {resumerPlan(plan)}. Un point de restauration est pris avant
                  d'appliquer.
                </p>
              </div>
            )}
            {fusion.isError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>
                  {messageErreur(fusion.error, 'Import impossible')}
                </AlertDescription>
              </Alert>
            )}
            {applique !== null && (
              <p className="text-sm text-muted-foreground" role="status">
                {applique}
              </p>
            )}
          </section>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={fusion.isPending}
          >
            Fermer
          </Button>
          {canWrite && (
            <Button
              onClick={appliquer}
              disabled={
                !aDesChangements || preparation.isPending || fusion.isPending
              }
            >
              {fusion.isPending && <Loader2 className="animate-spin" />}
              Importer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

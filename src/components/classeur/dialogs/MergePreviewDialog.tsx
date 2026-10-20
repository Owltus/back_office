import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  FileUp,
  Info,
  Loader2,
  X,
} from 'lucide-react'

import {
  ApercuImport,
  compterImport,
  useImagesRelecture,
} from '#/components/classeur/dialogs/ApercuImport.tsx'
import { useAppliquerImport } from '#/components/classeur/hooks/useMerge.ts'
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
import { Textarea } from '#/components/ui/textarea.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { previsualiserImport } from '#/lib/classeur/merge/apply.ts'
import type {
  ApercuFusion,
  ResultatImport,
} from '#/lib/classeur/merge/apply.ts'
import { resumerImport } from '#/lib/classeur/merge/importIa.ts'
import type { ContexteImport } from '#/lib/classeur/merge/importIa.ts'
import { extraireJson, filtrerPlan } from '#/lib/classeur/merge/portee.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'

/*
 * Import dans un classeur EXISTANT, depuis son accueil (ligne Importer).
 * Décision utilisateur du 2026-10-20 (« trop complexe pour rien ») : aucun
 * choix à faire. Coller la réponse de l'IA, ou déposer / choisir un fichier,
 * voir ce qui change, Importer.
 *
 * Un seul comportement (`importIa.ts`) : le fichier fait foi pour ce qu'il
 * contient, rien d'absent n'est supprimé (seul un élément marqué
 * `"supprimer": true` part à la corbeille), la portée est DÉDUITE du
 * fichier : celui d'un chapitre ou d'un document de ce classeur ne touche
 * que ce chapitre ou ce document, et une ligne le dit.
 *
 * Même aperçu que le dialogue d'un chapitre (`ApercuImport`), GROUPÉ par
 * chapitre : une ligne par action, diff au dépliage, case de refus, version
 * prévue, relecture avec la médiathèque lue à l'ouverture. Le refus passe
 * par `filtrerPlan` DANS le planificateur de l'application (avant le test
 * « aucune action » et avant le point de restauration), le plan étant
 * recalculé sur l'état relu : seules les clés comptent.
 *
 * La préparation est une mutation et non une `useQuery` : un `File` n'est
 * pas sérialisable et le plan ne doit jamais atteindre le cache persisté.
 */

/** Ce que la personne a donné : un fichier, ou le texte collé de l'IA. */
type Source = { type: 'fichier'; file: File } | { type: 'texte'; texte: string }

interface Preparation extends ApercuFusion {
  fichier: ClasseurJson
}

const CONTEXTE: ContexteImport = { type: 'classeur' }

/** Délai après la dernière frappe (ou le collage) avant de calculer l'aperçu. */
const ATTENTE_APERCU_MS = 400

function tailleOctets(texte: string): number {
  return new TextEncoder().encode(texte).length
}

async function lireSource(source: Source): Promise<string> {
  if (source.type === 'texte') {
    if (tailleOctets(source.texte) > MAX_JSON_BYTES)
      throw new Error('Texte trop volumineux pour un import.')
    return source.texte
  }
  const trop = fileTooLarge(source.file, MAX_JSON_BYTES)
  if (trop) throw new Error(trop)
  return source.file.text()
}

async function preparer(
  classeurId: number,
  source: Source,
): Promise<Preparation> {
  const fichier = parseImportJson(extraireJson(await lireSource(source)))
  const apercu = await previsualiserImport(classeurId, fichier, CONTEXTE)
  return { fichier, ...apercu }
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
  /**
   * Fichier déposé sur la ligne Importer ; `null` : le dialogue s'ouvre sur
   * la zone où coller la réponse de l'IA (ou choisir un fichier).
   */
  file: File | null
  /** Appelé après un import réussi, avec ses compteurs (`ignores` compris). */
  onDone?: (result: ResultatImport) => void
}) {
  const [fichierChoisi, setFichierChoisi] = useState<File | null>(file)
  const [texte, setTexte] = useState('')
  // Refus (clés `clesActions`) et lignes dépliées.
  const [refuses, setRefuses] = useState<ReadonlySet<string>>(new Set())
  const [ouvertes, setOuvertes] = useState<ReadonlySet<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const { images, etatImages } = useImagesRelecture(classeurId, open)

  const preparation = useMutation({
    mutationFn: (source: Source) => preparer(classeurId, source),
  })
  const importer = useAppliquerImport()

  // Un fichier déposé sur la ligne Importer devient la source.
  useEffect(() => {
    if (open && file !== null) setFichierChoisi(file)
  }, [open, file])

  // Relecture à chaque ouverture ou changement de source ; un texte collé
  // attend la fin de la frappe.
  const { mutate: lancerPreparation, reset: oublierPreparation } = preparation
  useEffect(() => {
    if (!open) return
    if (fichierChoisi !== null) {
      lancerPreparation({ type: 'fichier', file: fichierChoisi })
      return
    }
    if (texte.trim() === '') {
      oublierPreparation()
      return
    }
    const minuteur = window.setTimeout(() => {
      lancerPreparation({ type: 'texte', texte })
    }, ATTENTE_APERCU_MS)
    return () => window.clearTimeout(minuteur)
  }, [
    open,
    fichierChoisi,
    texte,
    classeurId,
    lancerPreparation,
    oublierPreparation,
  ])

  // Une autre source : les refus de la précédente n'ont plus de sens.
  useEffect(() => {
    setRefuses(new Set())
    setOuvertes(new Set())
  }, [fichierChoisi, texte])

  const { reset: oublierImport } = importer
  useEffect(() => {
    if (open) return
    setFichierChoisi(null)
    setTexte('')
    setRefuses(new Set())
    setOuvertes(new Set())
    oublierPreparation()
    oublierImport()
  }, [open, oublierPreparation, oublierImport])

  const sourceDonnee = fichierChoisi !== null || texte.trim() !== ''
  const donnees = sourceDonnee ? preparation.data : undefined
  const plan = donnees?.plan ?? null
  const lignes = useMemo(() => donnees?.lignes ?? [], [donnees])
  const comptes = compterImport(lignes, refuses)
  const planRetenu =
    plan === null ? null : filtrerPlan(plan, comptes.exclus).plan
  const aDesChangements = planRetenu !== null && planRetenu.actions.length > 0
  const occupe = preparation.isPending || importer.isPending

  function basculerRefus(cle: string) {
    setRefuses((avant) => {
      const s = new Set(avant)
      if (s.has(cle)) s.delete(cle)
      else s.add(cle)
      return s
    })
  }

  function lancerImport() {
    if (!donnees || !aDesChangements || importer.isPending) return
    importer.mutate(
      {
        classeurId,
        fichier: donnees.fichier,
        contexte: CONTEXTE,
        exclus: comptes.exclus,
        sourceName: fichierChoisi?.name ?? 'Réponse collée d’une IA',
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
        if (!o && importer.isPending) return
        onOpenChange(o)
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer</DialogTitle>
          <DialogDescription>
            Vous voyez ce qui changera avant de valider.
          </DialogDescription>
        </DialogHeader>

        {fichierChoisi !== null ? (
          <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
            <span className="truncate">{fichierChoisi.name}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setFichierChoisi(null)}
              disabled={occupe}
            >
              <X />
              Retirer
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder="Collez ici la réponse de l'IA."
              aria-label="Réponse de l'IA à importer"
              spellCheck={false}
              className="h-24 resize-none font-mono text-xs [field-sizing:fixed]"
              disabled={importer.isPending}
            />
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setFichierChoisi(f)
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() => inputRef.current?.click()}
              disabled={importer.isPending}
            >
              <FileUp />
              Ou choisir un fichier
            </Button>
          </div>
        )}

        <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {sourceDonnee && preparation.isError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>
                {messageErreur(preparation.error, 'Lecture impossible')}
              </AlertDescription>
            </Alert>
          )}

          {donnees?.note != null && !preparation.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="size-4 shrink-0" />
              {donnees.note}
            </p>
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
              Lecture et calcul de l'aperçu…
            </p>
          ) : plan === null ? null : lignes.length === 0 ? (
            <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              {plan.resultat.unchanged > 0
                ? 'Tout est déjà à jour : aucun changement à appliquer.'
                : 'Rien à importer.'}
            </p>
          ) : (
            <ApercuImport
              lignes={lignes}
              chapitres={donnees?.chapitres}
              refuses={refuses}
              onBasculerRefus={basculerRefus}
              ouvertes={ouvertes}
              onOuvertes={setOuvertes}
              disabled={importer.isPending}
              images={images}
              etatImages={etatImages}
            />
          )}
        </div>

        {importer.isError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {messageErreur(importer.error, 'Import impossible')}
            </AlertDescription>
          </Alert>
        )}

        {plan && !preparation.isPending && (
          <p className="text-xs text-muted-foreground">
            {resumerImport(planRetenu ?? plan)}.
            {aDesChangements &&
              " Un point de restauration est pris avant d'appliquer."}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importer.isPending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={lancerImport}
            disabled={!plan || occupe || !aDesChangements}
          >
            {importer.isPending && <Loader2 className="animate-spin" />}
            {libelleBouton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

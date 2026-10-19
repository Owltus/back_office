import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, FileUp, Loader2, X } from 'lucide-react'

import {
  ApercuImport,
  compterImport,
  useImagesRelecture,
} from '#/components/classeur/dialogs/ApercuImport.tsx'
import { useAppliquerFusion } from '#/components/classeur/hooks/useMerge.ts'
import type { ProvenanceImport } from '#/components/classeur/hooks/useMerge.ts'
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
import { messageErreur } from '#/lib/classeur/erreur.ts'
import {
  previsualiserFusionComplete,
  previsualiserImportIa,
} from '#/lib/classeur/merge/apply.ts'
import type {
  ApercuFusion,
  ResultatFusion,
} from '#/lib/classeur/merge/apply.ts'
import { resumerPlan } from '#/lib/classeur/merge/merge.ts'
import type { PlanFusion } from '#/lib/classeur/merge/merge.ts'
import { extraireJson, filtrerPlan } from '#/lib/classeur/merge/portee.ts'
import type { ChapitreLigne, LigneImport } from '#/lib/classeur/merge/portee.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'

/*
 * Prévisualisation puis application de l'import JSON d'un classeur COMPLET
 * (ligne « Importer un JSON » de l'accueil), portée de Registre puis alignée
 * sur l'aperçu du réimport chapitre / document (audit du 2026-10-04 : la
 * question « voir le texte modifié par le LLM avant d'importer, refuser un
 * document » n'était remplie que pour le dialogue `{}`).
 *
 * D'où vient le fichier (étape 5 du plan `classeur-echange-ia-2026-10-19`,
 * D1) : un choix à l'écran, « Fichier rendu par une IA » par défaut. Le
 * contenu ne permet pas de le reconnaître (les exports et les points de
 * restauration ont la même forme).
 *   - IA : le fichier fait foi, sans horodatage (`importIa.ts`) ; rien n'est
 *     supprimé sauf si la case « Supprimer ce qui n'est plus dans le
 *     fichier » est cochée. La réponse de l'IA peut être COLLÉE (même
 *     `extraireJson` que le chapitre) ou choisie en fichier.
 *   - Registre ou autre poste (D2) : fusion / remplacement, inchangés.
 *
 * Même aperçu (`ApercuImport`), GROUPÉ par chapitre : une ligne par action,
 * diff au dépliage, case de refus, version prévue, relecture avec la
 * médiathèque lue à l'ouverture. Les actions de chapitre (création,
 * modification, suppression) sont des lignes à part, sans case.
 *
 * Le refus passe par `filtrerPlan` DANS le planificateur de l'application
 * (avant le test « aucune action » et avant le point de restauration), le
 * plan étant recalculé sur l'état relu : seules les clés comptent.
 *
 * La préparation est une mutation et non une `useQuery` : un `File` n'est
 * pas sérialisable et le plan ne doit jamais atteindre le cache persisté.
 */

/** Ce que la personne a donné : un fichier, ou le texte collé de l'IA. */
type Source = { type: 'fichier'; file: File } | { type: 'texte'; texte: string }

interface Reglages {
  provenance: ProvenanceImport
  /** Registre : remplacer au lieu de fusionner. */
  replace: boolean
  /** IA : supprimer ce qui n'est plus dans le fichier. */
  supprimerAbsents: boolean
}

interface Preparation extends ApercuFusion {
  fichier: ClasseurJson
}

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
  reglages: Reglages,
): Promise<Preparation> {
  const fichier = parseImportJson(extraireJson(await lireSource(source)))
  const apercu =
    reglages.provenance === 'ia'
      ? await previsualiserImportIa(classeurId, fichier, {
          supprimerAbsents: reglages.supprimerAbsents,
        })
      : await previsualiserFusionComplete(classeurId, fichier, {
          replace: reglages.replace,
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

const PROVENANCES: ReadonlyArray<readonly [ProvenanceImport, string]> = [
  ['ia', 'Fichier rendu par une IA'],
  ['registre', "Fichier de Registre ou d'un autre poste"],
]

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
   * Fichier `.json` déposé sur la ligne Importer ; `null` : le dialogue
   * s'ouvre sur la zone où coller la réponse de l'IA (ou choisir un fichier).
   */
  file: File | null
  /** Appelé après un import réussi, avec ses compteurs (`ignores` compris). */
  onDone?: (result: ResultatFusion) => void
}) {
  const [provenance, setProvenance] = useState<ProvenanceImport>('ia')
  const [replace, setReplace] = useState(false)
  const [supprimerAbsents, setSupprimerAbsents] = useState(false)
  const [fichierChoisi, setFichierChoisi] = useState<File | null>(file)
  const [texte, setTexte] = useState('')
  // Refus (clés `clesActions`) et lignes dépliées. Les refus survivent à un
  // changement de réglage : seuls comptent ceux encore à l'écran.
  const [refuses, setRefuses] = useState<ReadonlySet<string>>(new Set())
  const [ouvertes, setOuvertes] = useState<ReadonlySet<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const { images, etatImages } = useImagesRelecture(classeurId, open)

  const preparation = useMutation({
    mutationFn: (args: { source: Source; reglages: Reglages }) =>
      preparer(classeurId, args.source, args.reglages),
  })
  const fusion = useAppliquerFusion()

  // Un fichier déposé sur la ligne Importer devient la source.
  useEffect(() => {
    if (open && file !== null) setFichierChoisi(file)
  }, [open, file])

  // Relecture à chaque ouverture, changement de source ou de réglage ; un
  // texte collé attend la fin de la frappe.
  const { mutate: lancerPreparation, reset: oublierPreparation } = preparation
  useEffect(() => {
    if (!open) return
    const reglages = { provenance, replace, supprimerAbsents }
    if (fichierChoisi !== null) {
      lancerPreparation({
        source: { type: 'fichier', file: fichierChoisi },
        reglages,
      })
      return
    }
    if (texte.trim() === '') {
      oublierPreparation()
      return
    }
    const minuteur = window.setTimeout(() => {
      lancerPreparation({ source: { type: 'texte', texte }, reglages })
    }, ATTENTE_APERCU_MS)
    return () => window.clearTimeout(minuteur)
  }, [
    open,
    fichierChoisi,
    texte,
    provenance,
    replace,
    supprimerAbsents,
    classeurId,
    lancerPreparation,
    oublierPreparation,
  ])

  // Une autre source : les refus de la précédente n'ont plus de sens.
  useEffect(() => {
    setRefuses(new Set())
    setOuvertes(new Set())
  }, [fichierChoisi, texte])

  const { reset: oublierFusion } = fusion
  useEffect(() => {
    if (open) return
    setProvenance('ia')
    setReplace(false)
    setSupprimerAbsents(false)
    setFichierChoisi(null)
    setTexte('')
    setRefuses(new Set())
    setOuvertes(new Set())
    oublierPreparation()
    oublierFusion()
  }, [open, oublierPreparation, oublierFusion])

  const sourceDonnee = fichierChoisi !== null || texte.trim() !== ''
  const donnees = sourceDonnee ? preparation.data : undefined
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
    if (!donnees || !aDesChangements || fusion.isPending) return
    fusion.mutate(
      {
        classeurId,
        fichier: donnees.fichier,
        provenance,
        replace,
        supprimerAbsents,
        exclus: comptes.exclus,
        sourceName:
          fichierChoisi?.name ??
          (provenance === 'ia'
            ? 'Réponse collée d’une IA'
            : donnees.fichier.classeur.name),
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
          <DialogTitle>Importer un JSON</DialogTitle>
          <DialogDescription>
            Vous voyez ce qui changera avant de valider.
          </DialogDescription>
        </DialogHeader>

        <fieldset
          className="flex flex-col gap-1 sm:flex-row sm:gap-4"
          disabled={occupe}
        >
          <legend className="sr-only">D'où vient le fichier</legend>
          {PROVENANCES.map(([valeur, libelle]) => (
            <label
              key={valeur}
              className="flex cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11"
            >
              <input
                type="radio"
                name="merge-provenance"
                value={valeur}
                checked={provenance === valeur}
                onChange={() => setProvenance(valeur)}
                className="size-4 accent-primary"
              />
              {libelle}
            </label>
          ))}
        </fieldset>

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
              placeholder="Collez ici la réponse de l'IA (même entourée de texte ou de ```json)."
              aria-label="JSON à importer"
              spellCheck={false}
              className="h-24 resize-none font-mono text-xs [field-sizing:fixed]"
              disabled={fusion.isPending}
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
              disabled={fusion.isPending}
            >
              <FileUp />
              Ou choisir un fichier .json
            </Button>
          </div>
        )}

        {provenance === 'ia' ? (
          <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="merge-supprimer-absents">
                Supprimer ce qui n'est plus dans le fichier
              </Label>
              <span className="text-xs text-muted-foreground">
                {supprimerAbsents
                  ? 'Ce que le fichier ne contient plus part à la corbeille.'
                  : 'Rien n’est supprimé. Le fichier fait foi pour ce qu’il contient.'}
              </span>
            </div>
            <Switch
              id="merge-supprimer-absents"
              checked={supprimerAbsents}
              onCheckedChange={setSupprimerAbsents}
              disabled={occupe}
            />
          </div>
        ) : (
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

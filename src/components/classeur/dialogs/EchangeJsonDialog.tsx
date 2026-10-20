import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileUp,
  Info,
  Loader2,
} from 'lucide-react'

import {
  ApercuImport,
  compterImport,
  useImagesRelecture,
} from '#/components/classeur/dialogs/ApercuImport.tsx'
import { usePeriodicites } from '#/components/classeur/hooks/useClasseur.ts'
import {
  MESSAGE_COPIE_REFUSEE,
  useCopieExport,
} from '#/components/classeur/hooks/useCopieExport.ts'
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
import { telechargerTexte } from '#/lib/classeur/download.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import {
  MIME_JSON,
  nomFichierPortee,
  serialiserExport,
} from '#/lib/classeur/exportJson.ts'
import { previsualiserImport } from '#/lib/classeur/merge/apply.ts'
import type { ApercuFusion } from '#/lib/classeur/merge/apply.ts'
import { resumerImport } from '#/lib/classeur/merge/importIa.ts'
import type { ContexteImport } from '#/lib/classeur/merge/importIa.ts'
import type { CiblePortee } from '#/lib/classeur/merge/portee.ts'
import {
  construireExportChapitre,
  construireExportDocument,
  extraireJson,
  filtrerPlan,
} from '#/lib/classeur/merge/portee.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
  DbDocument,
} from '#/lib/classeur/types.ts'
import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'

/*
 * « JSON pour un LLM » d'un chapitre ou d'un document (demande utilisateur du
 * 2026-09-29). Deux temps dans une seule fenêtre :
 *   1. EXPORTER : copier (le plus direct pour une IA) ou télécharger le
 *      fichier, qui embarque son mode d'emploi (`_metadata.instructions`) ;
 *      un refus du presse-papiers télécharge le fichier à la place ;
 *   2. RÉIMPORTER (droit d'écriture) : coller la réponse de l'IA ou choisir
 *      un fichier, voir l'aperçu, puis appliquer. Aucun réglage (décision
 *      utilisateur du 2026-10-20) : rien d'absent n'est supprimé, et la
 *      portée est DÉDUITE du fichier (`destinationImport`) — un fichier d'un
 *      autre chapitre ou document de ce classeur s'applique à lui, une ligne
 *      le dit ; rien d'autre ne change. Un point de restauration est pris
 *      avant la première écriture.
 * L'aperçu est une mutation, pas une `useQuery` : un calcul à la demande sur
 * un texte collé, qui ne doit jamais atteindre le cache persisté.
 */

export type SujetJson =
  | { type: 'chapitre'; chapitre: DbChapter; contenu: ChapterContent }
  | { type: 'document'; chapitre: DbChapter; document: DbDocument }

/** Délai après la dernière frappe (ou le collage) avant de calculer l'aperçu. */
const ATTENTE_APERCU_MS = 400

interface Preparation extends ApercuFusion {
  fichier: ClasseurJson
}

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${String(n)} ${n > 1 ? plurielForme : singulier}`
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
  // Médiathèque, lue à l'ouverture seulement : la relecture de l'aperçu
  // (étape 2) y cherche les images citées par le LLM.
  const { images: imagesConnues, etatImages } = useImagesRelecture(
    classeur?.id ?? null,
    open,
  )
  // Copier : « Copié » 2 s, refus = fichier téléchargé (étape 3 du plan
  // `classeur-echange-ia-2026-10-19`).
  const copie = useCopieExport()
  const { oublier: oublierCopie } = copie
  const [texte, setTexte] = useState('')
  const [applique, setApplique] = useState<string | null>(null)
  const [erreurFichier, setErreurFichier] = useState<string | null>(null)
  // Éléments refusés (clés `clesActions`) et lignes dépliées de l'aperçu.
  // Seuls comptent les refus dont la clé est encore dans l'aperçu.
  const [refuses, setRefuses] = useState<ReadonlySet<string>>(new Set())
  const [ouvertes, setOuvertes] = useState<ReadonlySet<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  // C4 (audit) : l'aperçu arrive sous la partie Exporter, hors de la vue
  // après un collage. On y fait défiler UNE fois, à son apparition.
  const apercuRef = useRef<HTMLDivElement>(null)

  const contexte: CiblePortee | null =
    sujet === null
      ? null
      : sujet.type === 'chapitre'
        ? { type: 'chapitre', chapitreId: sujet.chapitre.id }
        : { type: 'document', documentId: sujet.document.id }

  const preparation = useMutation({
    mutationFn: async (args: {
      texte: string
      contexte: ContexteImport
      classeurId: number
    }): Promise<Preparation> => {
      if (tailleOctets(args.texte) > MAX_JSON_BYTES)
        throw new Error('Texte trop volumineux pour un import.')
      const fichier = parseImportJson(extraireJson(args.texte))
      const apercu = await previsualiserImport(
        args.classeurId,
        fichier,
        args.contexte,
      )
      return { fichier, ...apercu }
    },
  })
  const fusion = useAppliquerImport()

  // Aperçu recalculé après la frappe ou le collage.
  const { mutate: preparer, reset: oublierPreparation } = preparation
  const cleContexte =
    contexte === null
      ? ''
      : contexte.type === 'chapitre'
        ? `c${contexte.chapitreId}`
        : `d${contexte.documentId}`
  useEffect(() => {
    if (!open || contexte === null || classeur === null) return
    if (texte.trim() === '') {
      oublierPreparation()
      return
    }
    const minuteur = window.setTimeout(() => {
      preparer({ texte, contexte, classeurId: classeur.id })
    }, ATTENTE_APERCU_MS)
    return () => window.clearTimeout(minuteur)
    // `contexte` est dérivé de `cleContexte` (objet recréé à chaque rendu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, texte, cleContexte, classeur, preparer, oublierPreparation])

  // Fermeture : tout repart de zéro.
  const { reset: oublierFusion } = fusion
  useEffect(() => {
    if (open) return
    setTexte('')
    oublierCopie()
    setApplique(null)
    setErreurFichier(null)
    setRefuses(new Set())
    setOuvertes(new Set())
    oublierPreparation()
    oublierFusion()
  }, [open, oublierPreparation, oublierFusion, oublierCopie])

  const apercuPret = preparation.data !== undefined
  useEffect(() => {
    if (!apercuPret) return
    const el = apercuRef.current
    // `scrollIntoView` est absent de jsdom.
    if (el !== null && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [apercuPret])

  if (sujet === null) return null

  const libelle =
    sujet.type === 'chapitre'
      ? `le chapitre ${sujet.chapitre.label}`
      : `le document ${sujet.document.title}`

  // Les périodicités nomment les feuilles de suivi et listent les `id` que
  // l'IA peut choisir : pas d'export sans elles.
  const pret = classeur !== null && periodicitesQ.data !== undefined

  /**
   * Le fichier JSON, mode d'emploi compris (`_metadata.instructions`) : le
   * même texte pour Copier et Télécharger.
   */
  function construire(): { texte: string; nomFichier: string } | null {
    if (classeur === null || sujet === null) return null
    const periodicites = periodicitesQ.data
    if (periodicites === undefined) return null
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
    const nomFichier =
      sujet.type === 'chapitre'
        ? nomFichierPortee(classeur.name, sujet.chapitre.label)
        : nomFichierPortee(
            classeur.name,
            sujet.chapitre.label,
            sujet.document.title,
          )
    return { texte: serialiserExport(donnees), nomFichier }
  }

  function telecharger() {
    const x = construire()
    if (x !== null) telechargerTexte(x.nomFichier, x.texte, MIME_JSON)
  }

  async function choisirFichier(file: File) {
    setApplique(null)
    const trop = fileTooLarge(file, MAX_JSON_BYTES)
    setErreurFichier(trop)
    if (trop) return
    setTexte(await file.text())
  }

  const plan = preparation.data?.plan ?? null
  const lignes = preparation.data?.lignes ?? []
  const comptes = compterImport(lignes, refuses)
  const aDesChangements = comptes.retenus > 0 || comptes.chapitre
  // Résumé du plan RETENU : les refus de l'aperçu y sont décomptés.
  const planRetenu =
    plan === null ? null : filtrerPlan(plan, comptes.exclus).plan

  function basculerRefus(cle: string) {
    setRefuses((avant) => {
      const s = new Set(avant)
      if (s.has(cle)) s.delete(cle)
      else s.add(cle)
      return s
    })
  }

  function appliquer() {
    if (
      !preparation.data ||
      !aDesChangements ||
      contexte === null ||
      classeur === null ||
      sujet === null
    )
      return
    fusion.mutate(
      {
        classeurId: classeur.id,
        fichier: preparation.data.fichier,
        contexte,
        exclus: comptes.exclus,
        sourceName:
          sujet.type === 'chapitre'
            ? `Import dans le chapitre ${sujet.chapitre.label}`
            : `Import dans le document ${sujet.document.title}`,
      },
      {
        onSuccess: (r) => {
          const ignores =
            r.ignores > 0
              ? ` ${pluriel(r.ignores, `${comptes.nom} ignoré`, `${comptes.noms} ignorés`)} à votre demande.`
              : ''
          setApplique(
            `Import appliqué : ${pluriel(r.inserted, 'ajout', 'ajouts')}, ${pluriel(r.updated, 'modification', 'modifications')}${r.deleted > 0 ? `, ${String(r.deleted)} mis à la corbeille` : ''}.${ignores}${(r.avertissements ?? []).map((a) => ` ${a}`).join('')}`,
          )
          setTexte('')
          setRefuses(new Set())
          setOuvertes(new Set())
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
          <DialogTitle>Échange avec une IA</DialogTitle>
          <DialogDescription>
            Exporter {libelle}, le faire retravailler, puis le réimporter.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">1. Exporter</h3>
          <p className="text-sm text-muted-foreground">
            Collez-le dans une IA : elle vous guide.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copie.copier(construire)}
              disabled={!pret || copie.enCours}
            >
              {copie.copie ? <Check /> : <Copy />}
              {copie.copie ? 'Copié' : 'Copier'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={telecharger}
              disabled={!pret}
            >
              <Download />
              Télécharger
            </Button>
          </div>
          {copie.refusee && (
            <p className="text-sm text-destructive">{MESSAGE_COPIE_REFUSEE}</p>
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
              placeholder="Collez ici la réponse de l'IA."
              aria-label="Réponse de l'IA à réimporter"
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
                Ou choisir un fichier
              </Button>
            </div>

            {erreurFichier !== null && (
              <p className="text-sm text-destructive">{erreurFichier}</p>
            )}
            {preparation.isPending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Lecture du fichier…
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
            {preparation.data?.note != null && !preparation.isPending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="size-4 shrink-0" />
                {preparation.data.note}
              </p>
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
              <div ref={apercuRef} className="flex flex-col gap-2 scroll-mt-4">
                {lignes.length === 0 ? (
                  <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                    Aucun changement : le contenu est identique.
                  </p>
                ) : (
                  <ApercuImport
                    lignes={lignes}
                    refuses={refuses}
                    onBasculerRefus={basculerRefus}
                    ouvertes={ouvertes}
                    onOuvertes={setOuvertes}
                    disabled={fusion.isPending}
                    images={imagesConnues}
                    etatImages={etatImages}
                    // Fichier de tout le classeur : groupé par chapitre.
                    chapitres={
                      preparation.data?.cible.type === 'classeur'
                        ? preparation.data.chapitres
                        : undefined
                    }
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  {resumerImport(planRetenu ?? plan)}.
                  {aDesChangements &&
                    " Un point de restauration est pris avant d'appliquer."}
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
              {/* B8 (audit) : pas de « Importer 0 document » pendant la
                  lecture du JSON, ni avant tout aperçu. */}
              {preparation.isPending || plan === null
                ? 'Importer'
                : comptes.retenus === 0 && comptes.chapitre
                  ? 'Importer le chapitre'
                  : `Importer ${pluriel(comptes.retenus, comptes.nom, comptes.noms)}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

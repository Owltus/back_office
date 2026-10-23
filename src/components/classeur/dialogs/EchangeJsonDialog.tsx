import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, CheckCircle2, Copy, Download } from 'lucide-react'

import {
  compterImport,
  useImagesRelecture,
} from '#/components/classeur/dialogs/ApercuImport.tsx'
import {
  CorpsImport,
  ErreurImport,
  PiedImport,
  etatBoutonImport,
} from '#/components/classeur/dialogs/EtatImport.tsx'
import { usePeriodicites } from '#/components/classeur/hooks/useClasseur.ts'
import {
  MESSAGE_COPIE_REFUSEE,
  useCopieExport,
} from '#/components/classeur/hooks/useCopieExport.ts'
import { useAppliquerImport } from '#/components/classeur/hooks/useMerge.ts'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { telechargerTexte } from '#/lib/classeur/download.ts'
import {
  MIME_JSON,
  nomFichierPortee,
  serialiserExport,
} from '#/lib/classeur/exportJson.ts'
import { previsualiserImport } from '#/lib/classeur/merge/apply.ts'
import type { ApercuFusion } from '#/lib/classeur/merge/apply.ts'
import type {
  ContexteImport,
  FichierChangements,
} from '#/lib/classeur/merge/changements.ts'
import { lireChangements } from '#/lib/classeur/merge/changements.ts'
import type { CiblePortee } from '#/lib/classeur/merge/changements.ts'
import {
  construireExportChapitre,
  construireExportDocument,
  extraireJson,
  filtrerPlan,
} from '#/lib/classeur/merge/portee.ts'
import { lireSource } from '#/lib/classeur/sourceImport.ts'
import type { SourceImport } from '#/lib/classeur/sourceImport.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
  DbDocument,
} from '#/lib/classeur/types.ts'

/*
 * « JSON pour un LLM » d'un chapitre ou d'un document (demande utilisateur du
 * 2026-09-29). Deux temps dans une seule fenêtre :
 *   1. EXPORTER : copier (le plus direct pour un LLM) ou télécharger le
 *      fichier, qui embarque son mode d'emploi (`_metadata.instructions`) ;
 *      un refus du presse-papiers télécharge le fichier à la place ;
 *   2. RÉIMPORTER (droit d'écriture) : coller la réponse du LLM, déposer ou
 *      choisir un fichier, voir l'aperçu, puis appliquer. Aucun réglage
 *      (décision utilisateur du 2026-10-20) : rien d'absent n'est supprimé,
 *      et la portée est DÉDUITE du fichier (`destinationImport`) : un
 *      fichier d'un autre chapitre ou document de ce classeur s'applique à
 *      lui, une ligne le dit ; rien d'autre ne change. Un point de
 *      restauration est pris avant la première écriture.
 * Réimporter a la même saisie et le même aperçu que l'import d'un classeur
 * (`SaisieImport`, `CorpsImport`, refonte du 2026-10-20).
 * L'aperçu est une mutation, pas une `useQuery` : un calcul à la demande sur
 * un texte collé, qui ne doit jamais atteindre le cache persisté.
 */

export type SujetJson =
  | { type: 'chapitre'; chapitre: DbChapter; contenu: ChapterContent }
  | { type: 'document'; chapitre: DbChapter; document: DbDocument }

interface Preparation extends ApercuFusion {
  fichier: FichierChangements
}

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${String(n)} ${n > 1 ? plurielForme : singulier}`
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
  // y cherche les images citées par le LLM.
  const { images: imagesConnues, etatImages } = useImagesRelecture(
    classeur?.id ?? null,
    open,
  )
  // Copier : « Copié » 2 s, refus = fichier téléchargé (étape 3 du plan
  // `classeur-echange-ia-2026-10-19`).
  const copie = useCopieExport()
  const { oublier: oublierCopie } = copie
  const [source, setSource] = useState<SourceImport | null>(null)
  const [applique, setApplique] = useState<string | null>(null)
  // Éléments refusés (clés `clesActions`) et lignes dépliées de l'aperçu.
  // Seuls comptent les refus dont la clé est encore dans l'aperçu.
  const [refuses, setRefuses] = useState<ReadonlySet<string>>(new Set())
  const [ouvertes, setOuvertes] = useState<ReadonlySet<string>>(new Set())
  // C4 (audit) : l'aperçu arrive sous la partie Exporter. On l'amène à
  // l'écran UNE fois, à son apparition.
  const apercuRef = useRef<HTMLDivElement>(null)

  const contexte: CiblePortee | null =
    sujet === null
      ? null
      : sujet.type === 'chapitre'
        ? { type: 'chapitre', chapitreId: sujet.chapitre.id }
        : { type: 'document', documentId: sujet.document.id }

  const preparation = useMutation({
    mutationFn: async (args: {
      source: SourceImport
      contexte: ContexteImport
      classeurId: number
    }): Promise<Preparation> => {
      const fichier = lireChangements(
        extraireJson(await lireSource(args.source)),
      )
      const apercu = await previsualiserImport(
        args.classeurId,
        fichier,
        args.contexte,
      )
      return { fichier, ...apercu }
    },
  })
  const fusion = useAppliquerImport()

  // Aperçu recalculé à chaque source donnée.
  const { mutate: preparer, reset: oublierPreparation } = preparation
  const cleContexte =
    contexte === null
      ? ''
      : contexte.type === 'chapitre'
        ? `c${contexte.chapitreId}`
        : `d${contexte.documentId}`
  useEffect(() => {
    if (!open || contexte === null || classeur === null) return
    if (source === null) {
      oublierPreparation()
      return
    }
    preparer({ source, contexte, classeurId: classeur.id })
    // `contexte` est dérivé de `cleContexte` (objet recréé à chaque rendu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source, cleContexte, classeur, preparer, oublierPreparation])

  // Un aperçu arrive : les éléments changés dans l'application depuis
  // l'export sont proposés NON importés (`clesChangeesDepuisExport`).
  const changesDepuisExport = preparation.data?.changesDepuisExport
  useEffect(() => {
    setRefuses(new Set(changesDepuisExport ?? []))
  }, [changesDepuisExport])

  // Une autre source : les refus de la précédente n'ont plus de sens.
  useEffect(() => {
    setRefuses(new Set())
    setOuvertes(new Set())
    if (source !== null) setApplique(null)
  }, [source])

  // Fermeture : tout repart de zéro.
  const { reset: oublierFusion } = fusion
  useEffect(() => {
    if (open) return
    setSource(null)
    oublierCopie()
    setApplique(null)
    setRefuses(new Set())
    setOuvertes(new Set())
    oublierPreparation()
    oublierFusion()
  }, [open, oublierPreparation, oublierFusion, oublierCopie])

  const donnees =
    source !== null && !preparation.isPending ? preparation.data : undefined
  const apercuPret = donnees !== undefined
  useEffect(() => {
    if (!apercuPret) return
    const el = apercuRef.current
    // `scrollIntoView` est absent de jsdom.
    if (el !== null && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [apercuPret])

  if (sujet === null) return null

  const libelle =
    sujet.type === 'chapitre'
      ? `le chapitre ${sujet.chapitre.label}`
      : `le document ${sujet.document.title}`

  // Les périodicités nomment les feuilles de suivi et listent les `id` que
  // le LLM peut choisir : pas d'export sans elles.
  const pret = classeur !== null && periodicitesQ.data !== undefined

  /**
   * Le fichier JSON, mode d'emploi compris (`_metadata.instructions`) : le
   * même texte pour Copier et Télécharger.
   */
  function construire(): { texte: string; nomFichier: string } | null {
    if (classeur === null || sujet === null) return null
    const periodicites = periodicitesQ.data
    if (periodicites === undefined) return null
    const export_ =
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
    return { texte: serialiserExport(export_), nomFichier }
  }

  function telecharger() {
    const x = construire()
    if (x !== null) telechargerTexte(x.nomFichier, x.texte, MIME_JSON)
  }

  const plan = donnees?.plan ?? null
  const lignes = donnees?.lignes ?? []
  const comptes = compterImport(lignes, refuses)
  const aDesChangements =
    plan !== null && (comptes.retenus > 0 || comptes.chapitre)
  // Résumé du plan RETENU : les refus de l'aperçu y sont décomptés.
  const planRetenu =
    plan === null ? null : filtrerPlan(plan, comptes.exclus).plan
  const bouton = etatBoutonImport({
    pret: plan !== null,
    aDesChangements,
    nbLignes: lignes.length,
    retenus: comptes.retenus,
    nom: comptes.nom,
    noms: comptes.noms,
    libelleSansElement: 'Importer le chapitre',
  })

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
      !donnees ||
      !aDesChangements ||
      contexte === null ||
      classeur === null ||
      sujet === null
    )
      return
    fusion.mutate(
      {
        classeurId: classeur.id,
        fichier: donnees.fichier,
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
          setSource(null)
          setApplique(
            `Import appliqué : ${pluriel(r.inserted, 'ajout', 'ajouts')}, ${pluriel(r.updated, 'modification', 'modifications')}${r.deleted > 0 ? `, ${String(r.deleted)} mis à la corbeille` : ''}.${ignores}${(r.avertissements ?? []).map((a) => ` ${a}`).join('')}`,
          )
          preparation.reset()
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && (fusion.isPending || fusion.enVol())) return
        onOpenChange(o)
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Échange avec un LLM</DialogTitle>
          <DialogDescription>
            Exporter {libelle}, le faire retravailler, puis le réimporter.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-sm font-medium">1. Exporter</h3>
            <p className="text-sm text-muted-foreground">
              Collez-le dans un LLM : il vous guide.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              className="h-10 flex-1 sm:flex-none"
              onClick={() => void copie.copier(construire)}
              disabled={!pret || copie.enCours}
            >
              {copie.copie ? <Check /> : <Copy />}
              {copie.copie ? 'Copié' : 'Copier'}
            </Button>
            <Button
              variant="outline"
              className="h-10 flex-1 sm:flex-none"
              onClick={telecharger}
              disabled={!pret}
            >
              <Download />
              Télécharger
            </Button>
          </div>
          {copie.refusee && (
            <p className="text-sm text-destructive sm:basis-full">
              {MESSAGE_COPIE_REFUSEE}
            </p>
          )}
        </section>

        {canWrite && (
          <section className="flex min-h-0 flex-1 flex-col gap-3">
            <h3 className="text-sm font-medium">2. Réimporter</h3>
            {applique !== null && (
              <Alert>
                <CheckCircle2 />
                <AlertDescription>
                  <p role="status">{applique}</p>
                </AlertDescription>
              </Alert>
            )}
            <CorpsImport
              source={source}
              onSource={setSource}
              saisieDesactivee={fusion.isPending}
              enCalcul={preparation.isPending || preparation.isIdle}
              erreur={preparation.error}
              donnees={donnees}
              planRetenu={planRetenu}
              ecartes={comptes.exclus.size}
              refuses={refuses}
              onBasculerRefus={basculerRefus}
              ouvertes={ouvertes}
              onOuvertes={setOuvertes}
              apercuDesactive={fusion.isPending}
              images={imagesConnues}
              etatImages={etatImages}
              // Fichier de tout le classeur : groupé par chapitre.
              groupeParChapitre={donnees?.cible.type === 'classeur'}
              apercuRef={apercuRef}
            />
            {fusion.isError && (
              <ErreurImport erreur={fusion.error} action="Import impossible" />
            )}
          </section>
        )}

        <PiedImport
          libelleFermer="Fermer"
          onFermer={() => onOpenChange(false)}
          fermerDesactive={fusion.isPending}
          afficherImporter={canWrite}
          onImporter={appliquer}
          importerActif={aDesChangements && !preparation.isPending}
          enCours={fusion.isPending}
          badge={bouton.badge}
          nomAccessible={bouton.nomAccessible}
          ligne={canWrite ? bouton.ligne : null}
        />
      </DialogContent>
    </Dialog>
  )
}

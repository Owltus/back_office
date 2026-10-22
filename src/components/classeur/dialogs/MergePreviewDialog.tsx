import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

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
import { useAppliquerImport } from '#/components/classeur/hooks/useMerge.ts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { previsualiserImport } from '#/lib/classeur/merge/apply.ts'
import type {
  ApercuFusion,
  ResultatImport,
} from '#/lib/classeur/merge/apply.ts'
import type { ContexteImport } from '#/lib/classeur/merge/importIa.ts'
import { extraireJson, filtrerPlan } from '#/lib/classeur/merge/portee.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import { lireSource } from '#/lib/classeur/sourceImport.ts'
import type { SourceImport } from '#/lib/classeur/sourceImport.ts'

/*
 * Import dans un classeur EXISTANT, depuis son accueil (ligne Importer).
 * Décision utilisateur du 2026-10-20 (« trop complexe pour rien ») : aucun
 * choix à faire. Coller la réponse du LLM, ou déposer / choisir un fichier,
 * voir ce qui change, Importer.
 *
 * Un seul comportement (`importIa.ts`) : le fichier fait foi pour ce qu'il
 * contient, rien d'absent n'est supprimé (seul un élément marqué
 * `"supprimer": true` part à la corbeille), la portée est DÉDUITE du
 * fichier : celui d'un chapitre ou d'un document de ce classeur ne touche
 * que ce chapitre ou ce document, et une ligne le dit.
 *
 * Deux états (refonte du 2026-10-20, « vraiment mal fait ») : la SAISIE
 * (`SaisieImport`, deux zones : coller, déposer ou choisir), puis
 * l'APERÇU (`CorpsImport` : résumé en compteurs, note de portée,
 * avertissements, liste seule à défiler), la saisie repliée en une ligne
 * avec Changer. Même corps que le dialogue d'un chapitre, GROUPÉ ici par
 * chapitre. Le refus passe par `filtrerPlan` DANS le planificateur de
 * l'application (avant le test « aucune action » et avant le point de
 * restauration), le plan étant recalculé sur l'état relu : seules les clés
 * comptent.
 *
 * La préparation est une mutation et non une `useQuery` : un `File` n'est
 * pas sérialisable et le plan ne doit jamais atteindre le cache persisté.
 */

interface Preparation extends ApercuFusion {
  fichier: ClasseurJson
}

const CONTEXTE: ContexteImport = { type: 'classeur' }

async function preparer(
  classeurId: number,
  source: SourceImport,
): Promise<Preparation> {
  const fichier = parseImportJson(extraireJson(await lireSource(source)))
  const apercu = await previsualiserImport(classeurId, fichier, CONTEXTE)
  return { fichier, ...apercu }
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
   * les deux zones : coller la réponse du LLM, ou déposer, choisir un fichier.
   */
  file: File | null
  /** Appelé après un import réussi, avec ses compteurs (`ignores` compris). */
  onDone?: (result: ResultatImport) => void
}) {
  const [source, setSource] = useState<SourceImport | null>(
    file === null ? null : { type: 'fichier', file },
  )
  // Refus (clés `clesActions`) et lignes dépliées.
  const [refuses, setRefuses] = useState<ReadonlySet<string>>(new Set())
  const [ouvertes, setOuvertes] = useState<ReadonlySet<string>>(new Set())
  const { images, etatImages } = useImagesRelecture(classeurId, open)

  const preparation = useMutation({
    mutationFn: (s: SourceImport) => preparer(classeurId, s),
  })
  const importer = useAppliquerImport()

  // Un fichier déposé sur la ligne Importer devient la source.
  useEffect(() => {
    if (open && file !== null) setSource({ type: 'fichier', file })
  }, [open, file])

  // Relecture à chaque ouverture ou changement de source.
  const { mutate: lancerPreparation, reset: oublierPreparation } = preparation
  useEffect(() => {
    if (!open) return
    if (source === null) oublierPreparation()
    else lancerPreparation(source)
  }, [open, source, classeurId, lancerPreparation, oublierPreparation])

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
  }, [source])

  const { reset: oublierImport } = importer
  useEffect(() => {
    if (open) return
    setSource(null)
    setRefuses(new Set())
    setOuvertes(new Set())
    oublierPreparation()
    oublierImport()
  }, [open, oublierPreparation, oublierImport])

  const donnees =
    source !== null && !preparation.isPending ? preparation.data : undefined
  const plan = donnees?.plan ?? null
  const lignes = useMemo(() => donnees?.lignes ?? [], [donnees])
  const comptes = compterImport(lignes, refuses)
  const planRetenu =
    plan === null ? null : filtrerPlan(plan, comptes.exclus).plan
  const aDesChangements = planRetenu !== null && planRetenu.actions.length > 0
  const bouton = etatBoutonImport({
    pret: plan !== null,
    aDesChangements,
    nbLignes: lignes.length,
    retenus: comptes.retenus,
    nom: comptes.nom,
    noms: comptes.noms,
    libelleSansElement: 'Importer les chapitres',
  })

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
        sourceName:
          source?.type === 'fichier'
            ? source.file.name
            : 'Réponse collée d’un LLM',
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
        if (!o && (importer.isPending || importer.enVol())) return
        onOpenChange(o)
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer</DialogTitle>
          <DialogDescription>
            Vous voyez ce qui change avant de valider.
          </DialogDescription>
        </DialogHeader>

        <CorpsImport
          source={source}
          onSource={setSource}
          saisieDesactivee={importer.isPending}
          // Source donnée mais calcul pas encore parti : déjà le squelette.
          enCalcul={preparation.isPending || preparation.isIdle}
          erreur={preparation.error}
          donnees={donnees}
          planRetenu={planRetenu}
          ecartes={comptes.exclus.size}
          refuses={refuses}
          onBasculerRefus={basculerRefus}
          ouvertes={ouvertes}
          onOuvertes={setOuvertes}
          apercuDesactive={importer.isPending}
          images={images}
          etatImages={etatImages}
          groupeParChapitre
        />

        {importer.isError && (
          <ErreurImport erreur={importer.error} action="Import impossible" />
        )}

        <PiedImport
          onFermer={() => onOpenChange(false)}
          fermerDesactive={importer.isPending}
          onImporter={lancerImport}
          importerActif={aDesChangements && !preparation.isPending}
          enCours={importer.isPending}
          badge={bouton.badge}
          nomAccessible={bouton.nomAccessible}
          ligne={bouton.ligne}
        />
      </DialogContent>
    </Dialog>
  )
}

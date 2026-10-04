import { useEffect, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'

import {
  ChoixDemandesLlm,
  useDemandesLlm,
} from '#/components/classeur/dialogs/DemandesLlm.tsx'
import { usePeriodicites } from '#/components/classeur/hooks/useClasseur.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { telechargerTexte } from '#/lib/classeur/download.ts'
import { nomFichierJson, serialiserExport } from '#/lib/classeur/exportJson.ts'
import { texteACopier } from '#/lib/classeur/llmDemandes.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
} from '#/lib/classeur/types.ts'

/*
 * Export JSON du classeur COMPLET (carte « Exporter en JSON » de l'accueil),
 * avec les demandes toutes prêtes pour un LLM (D25 renversée par l'audit du
 * 2026-10-04 : elles n'existaient qu'à l'export d'un chapitre ou d'un
 * document). Copier ou Télécharger, comme `EchangeJsonDialog` ;
 * `_metadata.demande` n'est posée que si une demande est cochée ou écrite
 * (sans demande, le fichier est celui d'avant, interopérable avec Registre).
 * Rien n'est mémorisé (D26) : tout repart de zéro à la fermeture.
 */

export interface SujetExportClasseur {
  classeur: DbClasseur
  chapters: DbChapter[]
  content: ChapterContent
}

export function ExportJsonClasseurDialog({
  open,
  onOpenChange,
  sujet,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Classeur chargé au moment du clic ; `null` tant qu'il n'y en a pas. */
  sujet: SujetExportClasseur | null
}) {
  const periodicitesQ = usePeriodicites()
  const demandesLlm = useDemandesLlm()
  const { oublier: oublierDemandes } = demandesLlm
  const [copie, setCopie] = useState<'ok' | 'erreur' | null>(null)

  useEffect(() => {
    if (open) return
    setCopie(null)
    oublierDemandes()
  }, [open, oublierDemandes])

  // Les périodicités nomment les feuilles de suivi dans le fichier.
  const pret = sujet !== null && periodicitesQ.data !== undefined

  function construire(): string | null {
    if (sujet === null || periodicitesQ.data === undefined) return null
    return serialiserExport(
      construireExport(
        sujet.classeur,
        sujet.chapters,
        sujet.content,
        periodicitesQ.data,
        undefined,
        demandesLlm.demande,
      ),
    )
  }

  async function copier() {
    const json = construire()
    if (json === null) return
    try {
      await navigator.clipboard.writeText(
        texteACopier(json, demandesLlm.demande),
      )
      setCopie('ok')
      window.setTimeout(() => setCopie(null), 2500)
    } catch {
      setCopie('erreur')
    }
  }

  function telecharger() {
    const json = construire()
    if (json === null || sujet === null) return
    telechargerTexte(
      nomFichierJson(sujet.classeur.name),
      json,
      'application/json;charset=utf-8',
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exporter en JSON</DialogTitle>
          <DialogDescription>
            {sujet === null
              ? 'Classeur en cours de lecture.'
              : `Le classeur ${sujet.classeur.name} au complet, avec les consignes pour un LLM. Réimportez la réponse par la carte Importer un JSON.`}
          </DialogDescription>
        </DialogHeader>

        <ChoixDemandesLlm
          demandes={demandesLlm.demandes}
          onBasculer={(id) => {
            setCopie(null)
            demandesLlm.basculer(id)
          }}
          autre={demandesLlm.autre}
          onAutre={(t) => {
            setCopie(null)
            demandesLlm.setAutre(t)
          }}
        />

        {copie === 'erreur' && (
          <p className="text-sm text-destructive">
            Copie refusée par le navigateur : utilisez Télécharger.
          </p>
        )}
        {periodicitesQ.isError && (
          <p className="text-sm text-destructive">
            Lecture impossible. Fermez puis réessayez.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button variant="outline" onClick={telecharger} disabled={!pret}>
            <Download />
            Télécharger (.json)
          </Button>
          <Button onClick={() => void copier()} disabled={!pret}>
            {copie === 'ok' ? <Check /> : <Copy />}
            {copie === 'ok' ? 'Copié' : 'Copier le JSON'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

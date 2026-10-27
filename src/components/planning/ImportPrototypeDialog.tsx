/*
 * Importer les données du prototype de planning (équipe, postes, horaires,
 * besoins, plannings déjà faits et semaines verrouillées) dans un planning
 * VIDE. Le fichier est produit par `node scripts/planning-exporter-prototype.mjs`
 * (plan planning-portage, D8 : les vrais noms ne passent jamais par le dépôt).
 * Réservé à la gestion ; la base refuse aussi (RPC `planning_importer`).
 */

import { useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'

import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  useEcriture,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { importerPrototype } from '#/lib/planning/service.ts'

interface Apercu {
  donnees: unknown
  personnes: number
  postes: number
  horaires: number
  besoins: number
  shifts: number
  verrous: number
}

function lireApercu(texte: string): Apercu | string {
  let d: unknown
  try {
    d = JSON.parse(texte)
  } catch {
    return 'Ce fichier ne se lit pas : choisissez le fichier produit par l’export du prototype.'
  }
  const o = d as Record<string, unknown>
  if (
    (o as Record<string, unknown> | null)?.format !== 'planning-prototype-v20'
  ) {
    return 'Ce fichier n’est pas un export du prototype de planning.'
  }
  const n = (k: string) =>
    Array.isArray(o[k]) ? (o[k] as unknown[]).length : 0
  return {
    donnees: d,
    personnes: n('salaries'),
    postes: n('postes'),
    horaires: n('horaires'),
    besoins: n('besoins'),
    shifts: n('affectations'),
    verrous: n('verrous'),
  }
}

export function ImportPrototypeDialog({
  ouvert,
  onFermer,
}: {
  ouvert: boolean
  onFermer: () => void
}) {
  const ref = useReferentiel()
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const fichier = useRef<HTMLInputElement>(null)
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const nonVide =
    !!ref.data &&
    (ref.data.salaries.length > 0 ||
      ref.data.postes.length > 0 ||
      ref.data.horaires.length > 0)

  const choisir = async (f: File | undefined) => {
    setErreur(null)
    setApercu(null)
    if (!f) return
    if (f.size > 20 * 1024 * 1024) {
      setErreur('Fichier trop lourd pour un export du prototype.')
      return
    }
    const r = lireApercu(await f.text())
    if (typeof r === 'string') setErreur(r)
    else setApercu(r)
  }

  const importer = async () => {
    if (!apercu) return
    setEnCours(true)
    const r = await ecrire(
      () => importerPrototype(apercu.donnees),
      'Import impossible',
    )
    setEnCours(false)
    if (r.ok) {
      notifier(
        `Import terminé : ${apercu.personnes} personnes et ${apercu.shifts} shifts.`,
        'info',
      )
      setApercu(null)
      onFermer()
    } else {
      setErreur(r.message ?? 'Import impossible.')
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => (o ? undefined : onFermer())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer le prototype</DialogTitle>
          <DialogDescription>
            Reprend l’équipe, les postes, les horaires, les absences, les
            besoins et les plannings déjà faits du prototype. Seulement dans un
            planning vide.
          </DialogDescription>
        </DialogHeader>
        {nonVide ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            Le planning contient déjà des données : l’import ne se fait que dans
            un planning vide.
          </p>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">
              Sur le poste du prototype, lancez d’abord l’export :
              <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs">
                node scripts/planning-exporter-prototype.mjs
              </code>
              Le fichier planning-prototype.json est posé sur le Bureau.
            </p>
            <input
              ref={fichier}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void choisir(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fichier.current?.click()}
              className="self-start"
            >
              <FileUp />
              Choisir le fichier
            </Button>
            {apercu && (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-muted/40 px-3 py-2">
                <li>{apercu.personnes} personnes</li>
                <li>{apercu.postes} postes</li>
                <li>{apercu.horaires} codes horaires</li>
                <li>{apercu.besoins} besoins</li>
                <li>{apercu.shifts} shifts</li>
                <li>{apercu.verrous} semaines verrouillées</li>
              </ul>
            )}
            {erreur && <p className="text-destructive">{erreur}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            onClick={() => void importer()}
            disabled={!apercu || nonVide || enCours}
          >
            {enCours && <Loader2 className="animate-spin" />}
            Importer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

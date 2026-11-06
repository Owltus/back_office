/*
 * Les zones de l'établissement (2026-11-06, lot 2, A5) : créer, nommer,
 * tenir en continu ou non, retirer une zone. Un poste choisit sa zone dans
 * Postes ; chaque zone a son tableau, sa relève et sa passation, au-dessus.
 * Gestion seule (la base le garde aussi).
 */

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { useEcriture } from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import {
  ajouterZone,
  enregistrerZone,
  supprimerZone,
} from '#/lib/planning/service.ts'
import type { Referentiel, Zone } from '#/lib/planning/types.ts'

export function SectionZones({
  referentiel,
  modifiable,
}: {
  referentiel: Referentiel
  modifiable: boolean
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const [nom, setNom] = useState('')
  const [noms, setNoms] = useState<Record<number, string>>({})
  const [envoi, setEnvoi] = useState(false)
  const zones = [...(referentiel.zones ?? [])].sort(
    (a, b) => a.ordre - b.ordre || a.id - b.id,
  )
  if (!zones.length) return null
  const off = !modifiable || envoi

  const agir = async (action: () => Promise<void>, echec: string) => {
    if (off) return
    setEnvoi(true)
    const r = await ecrire(action, echec)
    setEnvoi(false)
    if (!r.ok) notifier(r.message, 'danger')
    return r.ok
  }

  const ajouter = async () => {
    const n = nom.trim()
    if (!n || zones.some((z) => z.nom.toLowerCase() === n.toLowerCase())) return
    const premiere = zones[0]
    const ok = await agir(
      () =>
        ajouterZone({
          nom: n,
          ordre: Math.max(...zones.map((z) => z.ordre)) + 1,
          continue: true,
          releve_minutes: premiere.releve_minutes,
          passation_nuit: premiere.passation_nuit,
          equipe_tolerance: premiere.equipe_tolerance,
        }),
      "La zone n'a pas pu être créée",
    )
    if (ok) setNom('')
  }

  const renommer = (z: Zone) => {
    const n = (noms[z.id] ?? z.nom).trim()
    if (!n || n === z.nom) return
    void agir(
      () => enregistrerZone(z.id, { nom: n }),
      "La zone n'a pas pu être renommée",
    )
  }

  const postesDe = (z: Zone) =>
    referentiel.postes.filter((p) => p.zone_id === z.id && !p.ferme)

  return (
    <section
      id="besoins-zones"
      aria-labelledby="titre-zones"
      className="flex max-w-3xl flex-col gap-3"
    >
      <h3 id="titre-zones" className="text-base font-semibold">
        Zones
      </h3>
      <p className="text-sm text-muted-foreground">
        Une zone réunit des postes tenus ensemble, avec son tableau. Chaque
        poste choisit sa zone dans Postes.
      </p>
      <ul className="flex flex-col gap-2" aria-label="Zones de l'établissement">
        {zones.map((z, i) => {
          const siens = postesDe(z)
          return (
            <li
              key={z.id}
              aria-label={z.nom}
              className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm"
            >
              <Input
                aria-label={`Nom de la zone ${z.nom}`}
                value={noms[z.id] ?? z.nom}
                maxLength={40}
                disabled={off}
                onChange={(e) =>
                  setNoms((m) => ({ ...m, [z.id]: e.target.value }))
                }
                onBlur={() => renommer(z)}
                onKeyDown={(e) => e.key === 'Enter' && renommer(z)}
                className="h-7 w-40"
              />
              <label className="flex items-center gap-1.5">
                <Switch
                  checked={z.continue}
                  disabled={off}
                  aria-label={`${z.nom} tenue en continu`}
                  onCheckedChange={(v: boolean) =>
                    void agir(
                      () => enregistrerZone(z.id, { continue: v }),
                      "La zone n'a pas pu être enregistrée",
                    )
                  }
                />
                Tenue en continu
              </label>
              <span className="text-xs text-muted-foreground">
                {siens.length
                  ? siens.map((p) => p.nom).join(', ')
                  : 'Aucun poste'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-7"
                aria-label={`Retirer la zone ${z.nom}`}
                title={
                  i === 0
                    ? 'La première zone reste.'
                    : siens.length
                      ? 'Des postes sont dans cette zone.'
                      : undefined
                }
                disabled={off || i === 0 || siens.length > 0}
                onClick={() =>
                  void agir(
                    () => supprimerZone(z.id),
                    "La zone n'a pas pu être retirée",
                  )
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          )
        })}
      </ul>
      {modifiable && (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Nom de la nouvelle zone"
            placeholder="Nouvelle zone"
            value={nom}
            maxLength={40}
            disabled={off}
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void ajouter()}
            className="h-7 w-44"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={off || !nom.trim()}
            onClick={() => void ajouter()}
          >
            <Plus className="size-3.5" />
            Créer la zone
          </Button>
        </div>
      )}
    </section>
  )
}

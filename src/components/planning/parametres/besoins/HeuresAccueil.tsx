/*
 * Ouverture et fermeture des postes de l'accueil, réglées depuis la page
 * Besoins (étape 7 du plan planning-moteur-configurable, 2026-11-05 : « au
 * même endroit que ses besoins »). Les MÊMES colonnes que la page Postes
 * (`planning_postes.ouverture`, `fermeture`) : une écriture partielle
 * (`reglerHeuresPoste`), par bouton Enregistrer, gestion seule.
 * L'ouverture : quelqu'un sur le poste dès cette heure chaque matin
 * demandé ; la fermeture : jusqu'à cette heure chaque soir demandé ; une
 * heure au moins (`passations.dureeOuverture`).
 */

import { useEffect, useState } from 'react'

import { useEcriture } from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Segmente } from '#/components/planning/parametres/equipe/Segmente.tsx'
import {
  enregistrerReglages,
  reglerHeuresPoste,
} from '#/lib/planning/service.ts'
import { heuresLisibles } from '#/lib/planning/temps.ts'
import type { Poste } from '#/lib/planning/types.ts'
import { zoneDuPoste } from '#/lib/planning/zones.ts'

/** La phrase d'un poste : ce que font son ouverture et sa fermeture. */
export function phraseHeures(
  ouverture: string | null,
  fermeture: string | null,
): string {
  if (ouverture && fermeture)
    return `Quelqu'un sur ce poste dès ${ouverture} chaque matin et jusqu'à ${fermeture} chaque soir.`
  if (ouverture) return `Quelqu'un sur ce poste dès ${ouverture} chaque matin.`
  if (fermeture)
    return `Quelqu'un sur ce poste jusqu'à ${fermeture} chaque soir.`
  return "Ni ouverture ni fermeture : rien n'est demandé à ces heures."
}

/** Durée pendant laquelle l'ouverture (et la fermeture) est tenue
 * (`duree_ouverture`, 15 à 240 minutes en base). */
const DUREES = ['30', '60', '90', '120'] as const
type Duree = (typeof DUREES)[number]

export function HeuresAccueil({
  postes,
  modifiable,
  duree = 60,
}: {
  postes: readonly Poste[]
  modifiable: boolean
  /** `passations.dureeOuverture` (minutes). */
  duree?: number
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const [envoi, setEnvoi] = useState(false)
  const accueil = postes.filter((p) => zoneDuPoste(p) !== null)
  if (!accueil.length) return null
  const valeur = (DUREES as readonly string[]).includes(String(duree))
    ? (String(duree) as Duree)
    : null
  const choisir = async (v: Duree) => {
    if (envoi) return
    setEnvoi(true)
    const r = await ecrire(
      () => enregistrerReglages({ duree_ouverture: Number(v) }),
      "La durée de l'ouverture n'a pas pu être enregistrée",
    )
    setEnvoi(false)
    if (!r.ok) notifier(r.message, 'danger')
  }
  return (
    <section
      aria-labelledby="titre-heures-accueil"
      className="flex min-w-0 flex-col gap-2"
    >
      <h3 id="titre-heures-accueil" className="text-base font-semibold">
        Ouverture et fermeture
      </h3>
      <p className="text-xs text-muted-foreground">
        Quelqu'un tient le poste dès l'ouverture et jusqu'à la fermeture,
        pendant au moins {heuresLisibles(duree)}.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Tenue pendant</span>
        <Segmente<Duree>
          label="Durée tenue à l'ouverture et à la fermeture"
          valeur={valeur ?? '60'}
          options={DUREES.map((d) => ({
            valeur: d,
            libelle: heuresLisibles(Number(d)),
          }))}
          disabled={!modifiable || envoi}
          onChange={(v) => void choisir(v)}
        />
      </div>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {accueil.map((p) => (
          <LigneHeures key={p.id} poste={p} modifiable={modifiable} />
        ))}
      </ul>
    </section>
  )
}

function LigneHeures({
  poste,
  modifiable,
}: {
  poste: Poste
  modifiable: boolean
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const enBase = {
    ouverture: poste.ouverture ?? null,
    fermeture: poste.fermeture ?? null,
  }
  const [v, setV] = useState(enBase)
  const [envoi, setEnvoi] = useState(false)
  // Relu après une écriture ailleurs (page Postes) : le brouillon suit.
  useEffect(() => {
    setV({
      ouverture: poste.ouverture ?? null,
      fermeture: poste.fermeture ?? null,
    })
  }, [poste.ouverture, poste.fermeture])
  const modifie =
    v.ouverture !== enBase.ouverture || v.fermeture !== enBase.fermeture
  const id = `heures-${poste.id}`

  const enregistrer = async () => {
    if (!modifie || envoi) return
    setEnvoi(true)
    const r = await ecrire(
      () => reglerHeuresPoste(poste.id, v),
      `Les heures du poste ${poste.nom} n'ont pas pu être enregistrées`,
    )
    setEnvoi(false)
    notifier(
      r.ok ? `Heures du poste ${poste.nom} enregistrées` : r.message,
      r.ok ? 'info' : 'danger',
    )
  }

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <span className="flex min-w-24 items-center gap-2 self-center text-sm font-medium">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: poste.couleur }}
          />
          {poste.nom}
        </span>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Ouverture
          <Input
            id={`${id}-ouverture`}
            type="time"
            step={900}
            className="w-32"
            aria-label={`Ouverture du poste ${poste.nom}`}
            value={v.ouverture ?? ''}
            disabled={!modifiable || envoi}
            onChange={(e) =>
              setV((x) => ({ ...x, ouverture: e.target.value || null }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Fermeture
          <Input
            id={`${id}-fermeture`}
            type="time"
            step={900}
            className="w-32"
            aria-label={`Fermeture du poste ${poste.nom}`}
            value={v.fermeture ?? ''}
            disabled={!modifiable || envoi}
            onChange={(e) =>
              setV((x) => ({ ...x, fermeture: e.target.value || null }))
            }
          />
        </label>
        {modifiable && modifie && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Non enregistré
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={envoi}
              onClick={() => setV(enBase)}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              disabled={envoi}
              onClick={() => void enregistrer()}
            >
              Enregistrer
            </Button>
          </div>
        )}
      </div>
      <p className="sr-only">{phraseHeures(v.ouverture, v.fermeture)}</p>
    </li>
  )
}

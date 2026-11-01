/*
 * Relève entre l'équipe du matin et celle de l'après-midi (demande
 * utilisateur du 2026-11-01 : « du monde entre les shifts du matin et de
 * l'après-midi pour transmettre les informations, une demi-heure »). Un
 * réglage, pas une valeur en dur. Le planning automatique cherche, chaque
 * jour, une personne du matin et une de l'après-midi ensemble ce temps-là.
 */

import { useState } from 'react'

import { useEcriture } from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { Segmente } from '#/components/planning/parametres/equipe/Segmente.tsx'
import { enregistrerReglages } from '#/lib/planning/service.ts'

const CHOIX = ['0', '15', '30', '45', '60'] as const
type Choix = (typeof CHOIX)[number]

export function ReglageReleve({
  minutes,
  modifiable,
}: {
  minutes: number
  modifiable: boolean
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const [envoi, setEnvoi] = useState(false)
  const valeur = (CHOIX as readonly string[]).includes(String(minutes))
    ? (String(minutes) as Choix)
    : '30'
  const choisir = async (v: Choix) => {
    if (envoi || v === valeur) return
    setEnvoi(true)
    const r = await ecrire(
      () => enregistrerReglages({ releve_minutes: Number(v) }),
      "La relève n'a pas pu être enregistrée",
    )
    setEnvoi(false)
    if (!r.ok) notifier(r.message, 'danger')
  }
  return (
    <section
      aria-labelledby="titre-releve"
      className="flex max-w-3xl flex-col gap-1.5"
    >
      <h3 id="titre-releve" className="text-sm font-semibold">
        Relève entre le matin et l'après-midi
      </h3>
      <Segmente<Choix>
        label="Durée de la relève"
        valeur={valeur}
        options={CHOIX.map((c) => ({
          valeur: c,
          libelle: c === '0' ? 'Aucune' : `${c} min`,
        }))}
        disabled={!modifiable || envoi}
        onChange={(v) => void choisir(v)}
      />
      <p className="text-xs text-muted-foreground">
        {valeur === '0'
          ? 'Aucune relève demandée.'
          : `Chaque jour, au moins une personne du matin et une de l'après-midi sont ensemble ${valeur} minutes, pour se transmettre les informations.`}
      </p>
    </section>
  )
}

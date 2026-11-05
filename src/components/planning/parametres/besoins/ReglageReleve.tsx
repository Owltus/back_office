/*
 * Relève entre l'équipe du matin et celle de l'après-midi (demande
 * utilisateur du 2026-11-01 : « du monde entre les shifts du matin et de
 * l'après-midi pour transmettre les informations, une demi-heure »). Un
 * réglage, pas une valeur en dur. Le planning automatique cherche, chaque
 * jour, une personne du matin et une de l'après-midi ensemble ce temps-là.
 *
 * Passation entre équipes (D8, 2026-11-05 : « a minima que les deux shifts
 * terminent et commencent en même temps… au mieux se croisent ») : la
 * CONTINUITÉ (aucun trou entre deux équipes, passation avec le veilleur
 * comprise) est réglée ici, à côté de la relève qui reste une préférence.
 */

import { useState } from 'react'

import { useEcriture } from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { Segmente } from '#/components/planning/parametres/equipe/Segmente.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { enregistrerReglages } from '#/lib/planning/service.ts'

const CHOIX = ['0', '15', '30', '45', '60'] as const
type Choix = (typeof CHOIX)[number]

export function ReglageReleve({
  minutes,
  continuite,
  modifiable,
}: {
  minutes: number
  /** Continuité entre équipes obligatoire (`continuite_obligatoire`). */
  continuite: boolean
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
  const choisirContinuite = async (v: boolean) => {
    if (envoi || v === continuite) return
    setEnvoi(true)
    const r = await ecrire(
      () =>
        enregistrerReglages({
          releve_minutes: minutes,
          continuite_obligatoire: v,
        }),
      "La passation n'a pas pu être enregistrée",
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
        Passation entre les équipes
      </h3>
      <label className="flex items-start gap-2 text-sm">
        <Switch
          checked={continuite}
          disabled={!modifiable || envoi}
          onCheckedChange={(v) => void choisirContinuite(v)}
          aria-label="Aucun trou entre deux équipes"
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Aucun trou entre deux équipes</span>
          <span className="text-xs text-muted-foreground">
            {continuite
              ? "L'équipe suivante arrive au plus tard quand la précédente part, veilleur compris. Un trou ne reste que si personne ne peut le tenir."
              : 'Un trou entre deux équipes est évité, mais passe après les heures des contrats.'}
          </span>
        </span>
      </label>
      <p className="pt-1 text-sm font-medium">
        Relève entre le matin et l'après-midi
      </p>
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

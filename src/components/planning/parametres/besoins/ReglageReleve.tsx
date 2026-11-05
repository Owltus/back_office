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
/** Tolérance de l'équipe du soir (`equipe_tolerance`, 0 à 240 en base). */
const TOLERANCES = ['15', '30', '45', '60'] as const
type Tolerance = (typeof TOLERANCES)[number]

export function ReglageReleve({
  minutes,
  continuite,
  veilleur = true,
  tolerance = 30,
  modifiable,
}: {
  minutes: number
  /** Continuité entre équipes obligatoire (`continuite_obligatoire`). */
  continuite: boolean
  /** Passation avec le Veilleur (`passation_veilleur`). */
  veilleur?: boolean
  /** Équipe du soir ensemble à tant de minutes près (`equipe_tolerance`). */
  tolerance?: number
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
        // La seule case : la relève lue par la page peut être périmée.
        enregistrerReglages({ continuite_obligatoire: v }),
      "La passation n'a pas pu être enregistrée",
    )
    setEnvoi(false)
    if (!r.ok) notifier(r.message, 'danger')
  }
  const ecrireChamp = async (
    champs: Parameters<typeof enregistrerReglages>[0],
    echec: string,
  ) => {
    if (envoi) return
    setEnvoi(true)
    const r = await ecrire(() => enregistrerReglages(champs), echec)
    setEnvoi(false)
    if (!r.ok) notifier(r.message, 'danger')
  }
  const valeurTolerance = (TOLERANCES as readonly string[]).includes(
    String(tolerance),
  )
    ? (String(tolerance) as Tolerance)
    : null
  return (
    <section
      aria-labelledby="titre-releve"
      className="flex min-w-0 flex-col gap-1.5"
    >
      <h3 id="titre-releve" className="text-base font-semibold">
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
      <label className="flex items-start gap-2 text-sm">
        <Switch
          checked={veilleur}
          disabled={!modifiable || envoi}
          onCheckedChange={(v) =>
            void ecrireChamp(
              { passation_veilleur: v },
              "La passation avec le Veilleur n'a pas pu être enregistrée",
            )
          }
          aria-label="Passation avec le Veilleur"
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Passation avec le Veilleur</span>
          <span className="text-xs text-muted-foreground">
            {veilleur
              ? "Le dernier du soir attend l'arrivée du Veilleur, le premier du matin arrive avant son départ."
              : 'Aucune passation demandée avec le Veilleur.'}
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
      <p className="pt-1 text-sm font-medium">Équipe du soir ensemble</p>
      <Segmente<Tolerance>
        label="Équipe du soir ensemble, à combien de minutes près"
        valeur={valeurTolerance ?? '30'}
        options={TOLERANCES.map((c) => ({ valeur: c, libelle: `${c} min` }))}
        disabled={!modifiable || envoi}
        onChange={(v) =>
          void ecrireChamp(
            { equipe_tolerance: Number(v) },
            "La tolérance de l'équipe du soir n'a pas pu être enregistrée",
          )
        }
      />
      <p className="text-xs text-muted-foreground">
        {`Les personnes du soir arrivent, et repartent, à ${valeurTolerance ?? tolerance} minutes près les unes des autres.`}
      </p>
    </section>
  )
}

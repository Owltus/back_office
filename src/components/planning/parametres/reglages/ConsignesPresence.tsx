/*
 * Consignes de présence du matin et du soir (demande utilisateur du
 * 2026-10-27) : pour chaque jour de la semaine type, combien de personnes le
 * matin et le soir, au moins et au plus (« 3 ou 4 »). Elles comptent les
 * personnes autonomes des postes cochés « compte dans la présence », selon
 * la période de leur code horaire. Chaque compteur s'enregistre aussitôt,
 * comme les besoins ; les écritures partent l'une après l'autre, chacune
 * avec la consigne RELUE. Depuis le 2026-10-28, on règle « au moins » OU
 * « au plus » (un compteur par case, comme les besoins), la fourchette
 * s'affiche sous la case quand les deux diffèrent.
 */

import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sun, Sunset } from 'lucide-react'

import { useEcriture } from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  Compteur,
  Segmente,
} from '#/components/planning/parametres/reglages/controles.tsx'
import { planningKeys } from '#/lib/planning/keys.ts'
import { libelleConsigne } from '#/lib/planning/presence.ts'
import { reglerConsigne } from '#/lib/planning/service.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Consigne, Referentiel } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

type PeriodeConsigne = Consigne['periode']
interface Bornes {
  minimum: number
  maximum: number | null
}

const PERIODES: ReadonlyArray<{
  periode: PeriodeConsigne
  libelle: string
  Icone: typeof Sun
}> = [
  { periode: 'matin', libelle: 'Matin', Icone: Sun },
  { periode: 'soir', libelle: 'Soir', Icone: Sunset },
]

const cle = (jour: number, periode: PeriodeConsigne) => `${jour}|${periode}`
const AUCUNE: Bornes = { minimum: 0, maximum: null }

/** Le minimum monte : le plafond suit ; le plafond descend : le minimum suit. */
export function nouvellesBornes(
  avant: Bornes,
  champ: 'minimum' | 'maximum',
  valeur: number,
): Bornes {
  if (champ === 'minimum') {
    const maximum =
      avant.maximum === null || avant.maximum < valeur ? valeur : avant.maximum
    return { minimum: valeur, maximum }
  }
  return { minimum: Math.min(avant.minimum, valeur), maximum: valeur }
}

export function ConsignesPresence({
  referentiel,
  modifiable,
}: {
  referentiel: Referentiel
  modifiable: boolean
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const qc = useQueryClient()
  const [locales, setLocales] = useState<Map<string, Bornes>>(new Map())
  const file = useRef<Promise<void>>(Promise.resolve())
  const enCours = useRef(0)
  const dernier = useRef(referentiel)
  dernier.current = referentiel

  const enBase = useCallback(
    (jour: number, periode: PeriodeConsigne): Consigne | undefined => {
      const r =
        qc.getQueryData<Referentiel>(planningKeys.referentiel()) ??
        dernier.current
      return r.consignes.find((c) => c.jour === jour && c.periode === periode)
    },
    [qc],
  )

  const affiche = (jour: number, periode: PeriodeConsigne): Bornes => {
    const locale = locales.get(cle(jour, periode))
    if (locale) return locale
    const c = referentiel.consignes.find(
      (x) => x.jour === jour && x.periode === periode,
    )
    return c ? { minimum: c.minimum, maximum: c.maximum } : AUCUNE
  }

  const regler = (jour: number, periode: PeriodeConsigne, b: Bornes) => {
    if (!modifiable) return
    setLocales((m) => new Map(m).set(cle(jour, periode), b))
    enCours.current++
    file.current = file.current.then(async () => {
      const r = await ecrire(
        () => reglerConsigne({ jour, periode, ...b }, enBase(jour, periode)),
        "La consigne de présence n'a pas pu être enregistrée",
      )
      if (!r.ok) notifier(r.message, 'danger')
      enCours.current--
      if (enCours.current === 0) setLocales(new Map())
    })
  }

  const comptent = referentiel.postes.filter((p) => p.presence)
  const [champ, setChamp] = useState<'minimum' | 'maximum'>('minimum')
  const mot = champ === 'minimum' ? 'au moins' : 'au plus'

  return (
    <section
      aria-labelledby="titre-consignes"
      className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="titre-consignes" className="text-base font-semibold">
            Présence du matin et du soir
          </h2>
          <p className="text-sm text-muted-foreground">
            {comptent.length
              ? `Comptent les personnes autonomes en ${comptent.map((p) => p.nom).join(', ')}. Les apprentis viennent en plus.`
              : 'Aucun poste ne compte encore dans la présence : cochez-les dans Postes.'}
          </p>
        </div>
        <Segmente
          etiquette="Ce que vous réglez"
          valeur={champ}
          onChange={setChamp}
          options={[
            { valeur: 'minimum', libelle: 'Au moins' },
            { valeur: 'maximum', libelle: 'Au plus' },
          ]}
        />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="w-[10rem] px-3 py-2 text-left font-medium">
                Période
              </th>
              {JOURS.map((j) => (
                <th key={j} className="px-1 py-2 text-center font-medium">
                  {j.slice(0, 3)}.
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODES.map(({ periode, libelle, Icone }) => (
              <tr key={periode} className="border-t">
                <th
                  scope="row"
                  className="px-3 py-3 text-left font-medium whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icone className="size-4 text-muted-foreground" />
                    {libelle}
                  </span>
                </th>
                {JOURS.map((nomJour, jour) => {
                  const b = affiche(jour, periode)
                  const valeur =
                    champ === 'minimum' ? b.minimum : (b.maximum ?? b.minimum)
                  const fourchette =
                    b.maximum !== null && b.maximum !== b.minimum
                  return (
                    <td key={nomJour} className="px-1 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Compteur
                          valeur={valeur}
                          attenue={valeur === 0}
                          etiquette={`${libelle} du ${nomJour.toLowerCase()} : ${mot}`}
                          disabled={!modifiable}
                          onChange={(v) =>
                            regler(jour, periode, nouvellesBornes(b, champ, v))
                          }
                        />
                        <Fourchette visible={fourchette}>
                          {libelleConsigne(b.minimum, b.maximum)}
                        </Fourchette>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** « 3 ou 4 » sous la case ; la place est gardée pour que les lignes ne
 * sautent pas. */
function Fourchette({
  visible,
  children,
}: {
  visible: boolean
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'h-4 text-[11px] text-muted-foreground tabular-nums',
        !visible && 'invisible',
      )}
      aria-hidden={!visible}
    >
      {children}
    </span>
  )
}

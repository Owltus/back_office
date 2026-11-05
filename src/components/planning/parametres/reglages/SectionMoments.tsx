/*
 * Section « Moments » de la page Besoins (étape 5 du plan
 * `planning-moteur-configurable-2026-11-05` ; déplacée de la page Horaires
 * le 2026-11-05, demande utilisateur) : les limites qui rangent un
 * horaire au matin, au middle, au soir ou à la nuit. Le moment d'un horaire
 * se calcule d'après ses heures ; avant d'enregistrer, la liste des horaires
 * qui changeraient de moment. À l'enregistrement, les moments rangés en base
 * suivent (`enregistrerMomentsHoraires`). Gestion seule.
 */

import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'

import { useEcriture } from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  EnTeteSection,
  useBrouillon,
} from '#/components/planning/parametres/reglages/cadre.tsx'
import { ErreursSaisie } from '#/components/planning/parametres/reglages/controles.tsx'
import {
  changementsDeMoment,
  erreursMoments,
  momentsDepuis,
  reglagesMoments,
} from '#/components/planning/parametres/reglages/moments.ts'
import type { SaisieMoments } from '#/components/planning/parametres/reglages/moments.ts'
import {
  heureValide,
  normaliserHeure,
} from '#/components/planning/parametres/reglages/validation.ts'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { libelleHoraire, libelleMoment } from '#/lib/planning/affichage.ts'
import {
  enregistrerMomentsHoraires,
  enregistrerReglages,
} from '#/lib/planning/service.ts'
import { hhmm, minutes } from '#/lib/planning/temps.ts'
import type { Referentiel } from '#/lib/planning/types.ts'

/** Une heure saisie (HH:MM), envoyée en minutes quand elle est valide ;
 * sinon la saisie revient à la dernière valeur. */
function ChampHeure({
  valeur,
  onChange,
  etiquette,
  disabled,
}: {
  valeur: number
  onChange: (m: number) => void
  etiquette: string
  disabled?: boolean
}) {
  const [texte, setTexte] = useState<string | null>(null)
  const valider = (saisie: string) => {
    const n = normaliserHeure(saisie)
    if (heureValide(n)) onChange(minutes(n))
    setTexte(null)
  }
  return (
    <Input
      aria-label={etiquette}
      value={texte ?? hhmm(valeur)}
      placeholder="HH:MM"
      inputMode="numeric"
      maxLength={5}
      disabled={disabled}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={(e) => valider(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && valider(e.currentTarget.value)}
      className="inline-flex h-7 w-16 px-1 text-center tabular-nums"
    />
  )
}

export function SectionMoments({
  referentiel,
  modifiable,
}: {
  referentiel: Referentiel
  modifiable: boolean
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const enregistre = useMemo(
    () => momentsDepuis(referentiel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [referentiel.reglages],
  )
  const {
    brouillon: b,
    modifie,
    changer,
    annuler,
    adopter,
  } = useBrouillon<SaisieMoments>(enregistre)
  const [envoi, setEnvoi] = useState(false)
  const off = !modifiable || envoi
  const erreurs = erreursMoments(b)
  const changes = modifie
    ? changementsDeMoment(referentiel.horaires, enregistre, b)
    : []

  const champ = (cle: keyof SaisieMoments, etiquette: string) => (
    <ChampHeure
      etiquette={etiquette}
      valeur={b[cle]}
      disabled={off}
      onChange={(m) => changer({ [cle]: m })}
    />
  )

  const enregistrer = async () => {
    if (!modifiable || envoi || erreurs.length) return
    setEnvoi(true)
    const r = await ecrire(async () => {
      await enregistrerReglages(reglagesMoments(b))
      await enregistrerMomentsHoraires(
        changes.map((c) => ({ id: c.horaire.id, periode: c.apres })),
      )
    }, "Les limites des moments n'ont pas pu être enregistrées")
    setEnvoi(false)
    if (r.ok) {
      adopter(b)
      notifier(
        changes.length
          ? `Limites des moments enregistrées : ${changes.length} horaire${changes.length > 1 ? 's changent' : ' change'} de moment`
          : 'Limites des moments enregistrées',
      )
    } else notifier(r.message, 'danger')
  }

  return (
    <section
      className="flex scroll-mt-4 flex-col gap-5"
      aria-labelledby="titre-moments"
    >
      <EnTeteSection
        id="titre-moments"
        titre="Moments"
        texte="Le moment d'un horaire se calcule d'après ses heures. Il compte dans le tableau de l'accueil."
      />
      <div className="flex max-w-3xl flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
        <ul className="flex flex-col gap-2.5">
          <li className="flex flex-wrap items-center gap-1.5">
            <strong className="w-16 font-semibold">Nuit</strong>
            commence à {champ('nuit_debut', 'La nuit commence à')} ou plus tard,
            ou avant {champ('nuit_fin', 'La nuit, ou avant')}.
          </li>
          <li className="flex flex-wrap items-center gap-1.5">
            <strong className="w-16 font-semibold">Soir</strong>
            finit à {champ('soir_fin', 'Le soir finit à')} ou plus tard, ou
            après minuit, ou commence à{' '}
            {champ('soir_debut', 'Le soir commence à')} ou plus tard.
          </li>
          <li className="flex flex-wrap items-center gap-1.5">
            <strong className="w-16 font-semibold">Matin</strong>
            commence avant{' '}
            {champ('matin_debut_avant', 'Le matin commence avant')} et finit au
            plus tard à{' '}
            {champ('matin_fin_max', 'Le matin finit au plus tard à')}.
          </li>
          <li className="flex flex-wrap items-center gap-1.5">
            <strong className="w-16 font-semibold">Middle</strong>
            le reste, à cheval sur le matin et le soir.
          </li>
        </ul>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Un horaire spécifique sans heure de fin compte au matin s'il commence
          avant{' '}
          {champ(
            'libre_matin_avant',
            'Un horaire spécifique sans fin compte au matin avant',
          )}
          , sinon au soir.
        </p>
        <p className="text-xs text-muted-foreground">
          Le premier cas qui s'applique décide, dans cet ordre.
        </p>

        {modifie && (
          <div className="flex flex-col gap-1.5 border-t pt-3">
            {changes.length ? (
              <>
                <p className="text-sm font-medium">
                  {changes.length} horaire{changes.length > 1 ? 's' : ''}{' '}
                  changerai{changes.length > 1 ? 'ent' : 't'} de moment :
                </p>
                <ul
                  className="flex flex-col gap-1"
                  aria-label="Horaires qui changeraient de moment"
                >
                  {changes.map((c) => (
                    <li
                      key={c.horaire.id}
                      className="flex flex-wrap items-center gap-2 tabular-nums"
                    >
                      {libelleHoraire(c.horaire)}
                      <span className="text-muted-foreground">
                        {libelleMoment(c.avant)}
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <span className="font-medium">
                        {libelleMoment(c.apres)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucun horaire ne change de moment.
              </p>
            )}
          </div>
        )}
        <ErreursSaisie erreurs={erreurs} />
        {/* Les boutons n'apparaissent qu'une fois une limite changée, comme
            l'ouverture et la fermeture (Annuler de l'en-tête reste seul). */}
        {modifiable && modifie && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">
              Non enregistré
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={envoi}
              onClick={annuler}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              disabled={envoi || erreurs.length > 0}
              onClick={() => void enregistrer()}
            >
              Enregistrer
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

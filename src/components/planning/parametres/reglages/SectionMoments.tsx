/*
 * Section « Moments » de la page Besoins (2026-11-06, lot 2, A6 : la liste
 * des moments de l'établissement, plus quatre moments écrits dans le code).
 * Créer, renommer, ranger dans la journée, retirer un moment qui ne sert
 * plus ; ses heures (les conditions qui y rangent un horaire), « compte
 * dans le tableau » et « c'est la nuit ». Le moment d'un horaire se calcule
 * d'après ses heures ; avant d'enregistrer, la liste des horaires qui
 * changeraient de moment. À l'enregistrement : les moments, puis le moment
 * rangé en base des horaires (`enregistrerMomentsHoraires`), puis les
 * moments retirés. Gestion seule.
 */

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Plus, Trash2 } from 'lucide-react'

import { useEcriture } from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  EnTeteSection,
  useBrouillon,
} from '#/components/planning/parametres/reglages/cadre.tsx'
import { ErreursSaisie } from '#/components/planning/parametres/reglages/controles.tsx'
import {
  changementsDeMoment,
  deplacerMoment,
  differenceMoments,
  erreursMoments,
  momentsDepuis,
  nouveauMoment,
  raisonGarde,
} from '#/components/planning/parametres/reglages/moments.ts'
import {
  heureValide,
  normaliserHeure,
} from '#/components/planning/parametres/reglages/validation.ts'
import { Button } from '#/components/ui/button.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { Input } from '#/components/ui/input.tsx'
import { libelleHoraire, libelleMoment } from '#/lib/planning/affichage.ts'
import { lireMoments } from '#/lib/planning/moment.ts'
import {
  enregistrerMoments,
  enregistrerMomentsHoraires,
  supprimerMoment,
} from '#/lib/planning/service.ts'
import { hhmm, minutes } from '#/lib/planning/temps.ts'
import type { Moment, Referentiel } from '#/lib/planning/types.ts'

/** Une heure saisie (HH:MM) ou vide (aucune condition). */
function ChampHeure({
  valeur,
  onChange,
  etiquette,
  disabled,
}: {
  valeur: number | null
  onChange: (m: number | null) => void
  etiquette: string
  disabled?: boolean
}) {
  const [texte, setTexte] = useState<string | null>(null)
  const valider = (saisie: string) => {
    if (!saisie.trim()) onChange(null)
    else {
      const n = normaliserHeure(saisie)
      if (heureValide(n) || n === '24:00') onChange(minutes(n))
    }
    setTexte(null)
  }
  return (
    <Input
      aria-label={etiquette}
      value={texte ?? (valeur === null ? '' : hhmm(valeur))}
      placeholder="--:--"
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
  const enregistres = useMemo(
    () => momentsDepuis(referentiel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [referentiel.moments],
  )
  const { brouillon, modifie, changer, annuler, adopter } = useBrouillon<{
    liste: Moment[]
  }>({ liste: enregistres })
  const liste = brouillon.liste
  const [nom, setNom] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const off = !modifiable || envoi
  const erreurs = erreursMoments(liste)
  const changes = modifie
    ? changementsDeMoment(referentiel.horaires, enregistres, liste)
    : []
  const l = lireMoments(liste)
  const lEnregistre = lireMoments(enregistres)
  const dansLaJournee = [...liste].sort((a, b) => a.ordre - b.ordre)

  const regler = (id: string, champs: Partial<Moment>) =>
    changer({
      liste: liste.map((m) => (m.id === id ? { ...m, ...champs } : m)),
    })

  const ajouter = () => {
    const n = nom.trim()
    if (!n) return
    changer({ liste: [...liste, nouveauMoment(n, liste)] })
    setNom('')
  }

  const enregistrer = async () => {
    if (!modifiable || envoi || erreurs.length) return
    setEnvoi(true)
    const { ecrire: aEcrire, retirer } = differenceMoments(enregistres, liste)
    const r = await ecrire(async () => {
      await enregistrerMoments(aEcrire)
      await enregistrerMomentsHoraires(
        changes.map((c) => ({ id: c.horaire.id, periode: c.apres })),
      )
      for (const id of retirer) await supprimerMoment(id)
    }, "Les moments n'ont pas pu être enregistrés")
    setEnvoi(false)
    if (r.ok) {
      adopter({ liste })
      notifier(
        changes.length
          ? `Moments enregistrés : ${changes.length} horaire${changes.length > 1 ? 's changent' : ' change'} de moment`
          : 'Moments enregistrés',
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
        texte="Le moment d'un horaire se calcule d'après ses heures. Les moments du tableau ont un chiffre par jour à l'accueil."
      />
      <div className="flex max-w-3xl flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
        <ul className="flex flex-col gap-3" aria-label="Moments de la journée">
          {dansLaJournee.map((m, i) => {
            const garde = raisonGarde(
              m.id,
              referentiel.horaires,
              liste,
              referentiel.consignes,
            )
            return (
              <li
                key={m.id}
                className="flex flex-col gap-2 rounded-lg border p-3"
                aria-label={m.nom}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`Nom du moment ${m.nom}`}
                    value={m.nom}
                    maxLength={40}
                    disabled={off}
                    onChange={(e) => regler(m.id, { nom: e.target.value })}
                    className="h-7 w-36"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Monter ${m.nom}`}
                    disabled={off || i === 0}
                    onClick={() =>
                      changer({ liste: deplacerMoment(liste, m.id, -1) })
                    }
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Descendre ${m.nom}`}
                    disabled={off || i === dansLaJournee.length - 1}
                    onClick={() =>
                      changer({ liste: deplacerMoment(liste, m.id, 1) })
                    }
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <label className="flex items-center gap-1.5">
                    <Switch
                      checked={m.compte_dans_tableau}
                      disabled={off}
                      onCheckedChange={(v: boolean) =>
                        regler(m.id, { compte_dans_tableau: v === true })
                      }
                    />
                    Compte dans le tableau
                  </label>
                  <label className="flex items-center gap-1.5">
                    <Switch
                      checked={m.est_nuit}
                      disabled={off}
                      onCheckedChange={(v: boolean) =>
                        regler(m.id, { est_nuit: v === true })
                      }
                    />
                    C'est la nuit
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7"
                    aria-label={`Retirer ${m.nom}`}
                    title={garde ?? undefined}
                    disabled={off || garde !== null}
                    onClick={() =>
                      changer({ liste: liste.filter((x) => x.id !== m.id) })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                  Commence de
                  <ChampHeure
                    etiquette={`${m.nom} commence de`}
                    valeur={m.debut_de}
                    disabled={off}
                    onChange={(v) => regler(m.id, { debut_de: v })}
                  />
                  à
                  <ChampHeure
                    etiquette={`${m.nom} commence avant`}
                    valeur={m.debut_a}
                    disabled={off}
                    onChange={(v) => regler(m.id, { debut_a: v })}
                  />
                  ; finit de
                  <ChampHeure
                    etiquette={`${m.nom} finit de`}
                    valeur={m.fin_de}
                    disabled={off}
                    onChange={(v) => regler(m.id, { fin_de: v })}
                  />
                  à
                  <ChampHeure
                    etiquette={`${m.nom} finit au plus tard`}
                    valeur={m.fin_a}
                    disabled={off}
                    onChange={(v) => regler(m.id, { fin_a: v })}
                  />
                  <select
                    aria-label={`${m.nom} : conditions`}
                    className="h-7 rounded-md border bg-background px-1 text-foreground"
                    value={m.toutes ? 'toutes' : 'une'}
                    disabled={off}
                    onChange={(e) =>
                      regler(m.id, { toutes: e.target.value === 'toutes' })
                    }
                  >
                    <option value="toutes">les deux à la fois</option>
                    <option value="une">l'un ou l'autre</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  Essayé en
                  <Input
                    aria-label={`${m.nom} : rang du classement`}
                    type="number"
                    min={1}
                    max={20}
                    value={m.priorite}
                    disabled={off}
                    onChange={(e) =>
                      regler(m.id, { priorite: Number(e.target.value) || 1 })
                    }
                    className="h-7 w-14 px-1 text-center"
                  />
                  {m.compte_dans_tableau && !m.est_nuit && (
                    <>
                      ; horaire spécifique sans fin : ici s'il commence avant
                      <ChampHeure
                        etiquette={`${m.nom} : horaire sans fin avant`}
                        valeur={m.libre_avant}
                        disabled={off}
                        onChange={(v) => regler(m.id, { libre_avant: v })}
                      />
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Une heure vide : aucune condition. Un moment sans aucune heure prend
          les horaires qui ne vont nulle part ailleurs. Le plus petit rang est
          essayé en premier.
        </p>
        {modifiable && (
          <div className="flex items-center gap-2">
            <Input
              aria-label="Nom du nouveau moment"
              placeholder="Nouveau moment"
              value={nom}
              maxLength={40}
              disabled={off}
              onChange={(e) => setNom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ajouter()}
              className="h-7 w-44"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={off || !nom.trim()}
              onClick={ajouter}
            >
              <Plus className="size-3.5" />
              Ajouter
            </Button>
          </div>
        )}

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
                        {libelleMoment(c.avant, lEnregistre)}
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <span className="font-medium">
                        {libelleMoment(c.apres, l)}
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

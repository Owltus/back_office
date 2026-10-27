/*
 * Paramètres du Planning : la semaine type des besoins (prototype
 * `BesoinsPage.tsx`, spec §5.3). Une carte par poste, une ligne par code
 * horaire (ou horaire spécifique), une case par jour : effectif minimum,
 * places de soutien, places en plus. Chaque compteur s'enregistre aussitôt
 * (`reglerBesoin` : crée, modifie, ou supprime à 0 / 0 / 0), affiché tout de
 * suite à l'écran ; les écritures partent l'une après l'autre, chacune avec
 * le besoin RELU en base (deux clics rapides ne créent pas deux besoins).
 *
 * Points d'attention, absents du prototype : un besoin plus long que le
 * maximum HCR de la catégorie du poste (`alerteBesoin`), et un besoin sur un
 * code horaire que le poste ne permet pas (le prototype le masquait).
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChevronsRight,
  Eye,
  EyeOff,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'

import {
  useDroitsPlanning,
  useEcriture,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { CadreReglages } from '#/components/planning/parametres/reglages/cadre.tsx'
import { ConsignesPresence } from '#/components/planning/parametres/reglages/ConsignesPresence.tsx'
import { Compteur } from '#/components/planning/parametres/reglages/controles.tsx'
import {
  lignesDuPoste,
  trouverBesoin,
} from '#/components/planning/parametres/reglages/besoins.ts'
import type {
  LigneBesoin,
  Reglage,
} from '#/components/planning/parametres/reglages/besoins.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { heures, horairesDuPoste, texteSur } from '#/lib/planning/affichage.ts'
import { planningKeys } from '#/lib/planning/keys.ts'
import { alerteBesoin } from '#/lib/planning/regles.ts'
import { reglerBesoin } from '#/lib/planning/service.ts'
import { heureAffichee, presence } from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Besoin, Poste, Referentiel } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

const RIEN: Reglage = { effectif: 0, soutien: 0, renfort: 0 }
const cleCase = (posteId: number, ligne: LigneBesoin, jour: number) =>
  `${posteId}|${ligne.cle}|${jour}`

export function BesoinsPage() {
  const droits = useDroitsPlanning()
  const ref = useReferentiel()
  const modifiable = droits.pret && droits.gerer
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const qc = useQueryClient()

  // Réglages affichés avant la relecture (mise à jour immédiate) ; vidés
  // quand toutes les écritures en cours ont répondu.
  const [locaux, setLocaux] = useState<Map<string, Reglage>>(new Map())
  const fileRef = useRef<Promise<void>>(Promise.resolve())
  const enCours = useRef(0)
  const dernier = useRef<Referentiel | undefined>(undefined)
  dernier.current = ref.data

  const [tousLesCodes, setTousLesCodes] = useState<Set<number>>(new Set())

  /** Le besoin enregistré en base pour cette case, d'après la dernière lecture. */
  const enBase = useCallback(
    (posteId: number, ligne: LigneBesoin, jour: number): Besoin | undefined => {
      const r =
        qc.getQueryData<Referentiel>(planningKeys.referentiel()) ??
        dernier.current
      return r ? trouverBesoin(r.besoins, posteId, ligne, jour) : undefined
    },
    [qc],
  )

  const affiche = (
    posteId: number,
    ligne: LigneBesoin,
    jour: number,
  ): Reglage => {
    const local = locaux.get(cleCase(posteId, ligne, jour))
    if (local) return local
    const b = ref.data
      ? trouverBesoin(ref.data.besoins, posteId, ligne, jour)
      : undefined
    return b
      ? { effectif: b.effectif, soutien: b.soutien, renfort: b.renfort }
      : RIEN
  }

  const regler = (
    poste: Poste,
    ligne: LigneBesoin,
    reglages: Array<{ jour: number } & Reglage>,
  ) => {
    if (!modifiable) return
    setLocaux((m) => {
      const suite = new Map(m)
      for (const { jour, effectif, soutien, renfort } of reglages) {
        suite.set(cleCase(poste.id, ligne, jour), {
          effectif,
          soutien,
          renfort,
        })
      }
      return suite
    })
    enCours.current++
    fileRef.current = fileRef.current.then(async () => {
      const r = await ecrire(async () => {
        for (const { jour, effectif, soutien, renfort } of reglages) {
          await reglerBesoin(
            {
              poste_id: poste.id,
              jour,
              horaire_id: ligne.horaire_id,
              debut: ligne.debut,
              fin: ligne.fin,
              effectif,
              soutien,
              renfort,
            },
            enBase(poste.id, ligne, jour),
          )
        }
      }, "Le besoin n'a pas pu être enregistré")
      if (!r.ok) notifier(r.message, 'danger')
      enCours.current--
      if (enCours.current === 0) setLocaux(new Map())
    })
  }

  const data = ref.data

  return (
    <CadreReglages
      titre="Besoins"
      actif="/planning/besoins"
      modifiable={modifiable}
      pret={droits.pret}
      chargement={ref.isPending}
      erreur={ref.isError}
      onReessayer={() => void ref.refetch()}
    >
      {data && (
        <>
          <div className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              La semaine type de l'hôtel, poste par poste et code par code : le
              minimum de personnes autonomes (garanti par le moteur), les places
              de soutien pour apprentis et stagiaires (jamais seuls), et les
              places en plus, remplies seulement si quelqu'un manque d'heures.
            </span>
          </div>
          {data.postes.length > 1 && (
            <nav
              aria-label="Aller à un poste"
              className="flex flex-wrap items-center gap-1.5 text-sm"
            >
              <span className="text-xs text-muted-foreground">Aller à :</span>
              {data.postes.map((poste) => (
                <button
                  key={poste.id}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-muted"
                  onClick={() =>
                    document
                      .getElementById(`besoins-poste-${poste.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: poste.couleur }}
                  />
                  {poste.nom}
                </button>
              ))}
            </nav>
          )}
          <ConsignesPresence referentiel={data} modifiable={modifiable} />
          {!data.postes.length && (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Aucun poste : créez d'abord les postes de l'hôtel.
            </p>
          )}
          {data.postes.map((poste) => (
            <CartePoste
              key={poste.id}
              poste={poste}
              referentiel={data}
              tous={tousLesCodes.has(poste.id)}
              basculer={() =>
                setTousLesCodes((s) => {
                  const suite = new Set(s)
                  if (suite.has(poste.id)) suite.delete(poste.id)
                  else suite.add(poste.id)
                  return suite
                })
              }
              modifiable={modifiable}
              affiche={affiche}
              regler={regler}
            />
          ))}
        </>
      )}
    </CadreReglages>
  )
}

function CartePoste({
  poste,
  referentiel,
  tous,
  basculer,
  modifiable,
  affiche,
  regler,
}: {
  poste: Poste
  referentiel: Referentiel
  tous: boolean
  basculer: () => void
  modifiable: boolean
  affiche: (posteId: number, ligne: LigneBesoin, jour: number) => Reglage
  regler: (
    poste: Poste,
    ligne: LigneBesoin,
    reglages: Array<{ jour: number } & Reglage>,
  ) => void
}) {
  const siens = useMemo(
    () => referentiel.besoins.filter((b) => b.poste_id === poste.id),
    [referentiel.besoins, poste.id],
  )
  const possibles = horairesDuPoste(referentiel.horaires, poste)
  const lignes = lignesDuPoste(siens, referentiel.horaires, possibles, tous)
  const cachees = possibles.filter(
    (h) => !lignes.some((l) => l.horaire_id === h.id),
  ).length

  // Totaux : présence par semaine (effectif × durée, pause non déduite, comme
  // le prototype) et, par jour, les personnes demandées.
  let presenceSemaine = 0
  const parJour = JOURS.map((_, j) => {
    let effectif = 0
    let soutien = 0
    let renfort = 0
    for (const l of lignes) {
      const r = affiche(poste.id, l, j)
      effectif += r.effectif
      soutien += r.soutien
      renfort += r.renfort
      presenceSemaine += r.effectif * presence(l.debut, l.fin)
    }
    return { effectif, soutien, renfort }
  })
  const titreId = `besoins-poste-${poste.id}`

  return (
    <section
      aria-labelledby={titreId}
      className="flex min-w-0 scroll-mt-2 flex-col gap-3 rounded-xl border border-t-4 bg-card p-4"
      style={{ borderTopColor: poste.couleur }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: poste.couleur }}
          />
          <h2 id={titreId} className="text-base font-semibold">
            {poste.nom}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
            {heures(presenceSemaine)} de présence / semaine
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={basculer}>
          {tous ? <EyeOff /> : <Eye />}
          {tous
            ? 'Masquer les codes non utilisés'
            : `Afficher tous les codes${cachees > 0 ? ` (+${cachees})` : ''}`}
        </Button>
      </div>

      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun besoin pour ce poste. Affichez tous les codes pour en ajouter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Horaire</th>
                {JOURS.map((j) => (
                  <th key={j} className="px-1 py-2 text-center font-medium">
                    {j.slice(0, 3)}.
                  </th>
                ))}
                <th className="px-2 py-2">
                  <span className="sr-only">Recopier</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <LigneTableau
                  key={ligne.cle}
                  poste={poste}
                  ligne={ligne}
                  referentiel={referentiel}
                  permise={
                    ligne.horaire_id === null ||
                    possibles.some((h) => h.id === ligne.horaire_id)
                  }
                  modifiable={modifiable}
                  affiche={affiche}
                  regler={regler}
                />
              ))}
            </tbody>
            <tfoot className="bg-muted/50 text-xs">
              <tr>
                <th
                  scope="row"
                  className="px-3 py-2 text-left font-medium text-muted-foreground"
                >
                  Total du jour
                </th>
                {parJour.map((t, j) => (
                  <td key={j} className="px-1 py-2 text-center tabular-nums">
                    <span className="font-semibold">{t.effectif}</span>
                    {(t.soutien > 0 || t.renfort > 0) && (
                      <span className="block text-[10px] text-muted-foreground">
                        {t.soutien > 0 && `+${t.soutien} soutien`}
                        {t.soutien > 0 && t.renfort > 0 && ' · '}
                        {t.renfort > 0 && `+${t.renfort} en plus`}
                      </span>
                    )}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

function LigneTableau({
  poste,
  ligne,
  referentiel,
  permise,
  modifiable,
  affiche,
  regler,
}: {
  poste: Poste
  ligne: LigneBesoin
  referentiel: Referentiel
  permise: boolean
  modifiable: boolean
  affiche: (posteId: number, ligne: LigneBesoin, jour: number) => Reglage
  regler: (
    poste: Poste,
    ligne: LigneBesoin,
    reglages: Array<{ jour: number } & Reglage>,
  ) => void
}) {
  const h = referentiel.horaires.find((x) => x.id === ligne.horaire_id)
  const couleur = h?.couleur ?? '#98a2b3'
  const trop = alerteBesoin(poste.categorie, presence(ligne.debut, ligne.fin))
  const lundi = affiche(poste.id, ligne, 0)
  const desactive = !modifiable

  return (
    <tr className="border-t align-top">
      <td className="px-3 py-2">
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 rounded px-1.5 text-[11px] font-semibold"
            style={{ background: couleur, color: texteSur(couleur) }}
          >
            {h?.code ?? '·'}
          </span>
          <div className="min-w-0">
            <div className="truncate">{h?.nom ?? 'Horaire spécifique'}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {heureAffichee(ligne.debut)} à {heureAffichee(ligne.fin)}
            </div>
            {trop && (
              <p className="mt-1 flex items-start gap-1 text-xs text-amber-500">
                <TriangleAlert className="mt-px size-3 shrink-0" />
                Trop long : {trop}.
              </p>
            )}
            {!permise && (
              <p className="mt-1 flex items-start gap-1 text-xs text-amber-500">
                <TriangleAlert className="mt-px size-3 shrink-0" />
                Ce code n'est pas dans les horaires possibles du poste.
              </p>
            )}
          </div>
        </div>
      </td>
      {JOURS.map((nom, j) => {
        const { effectif, soutien, renfort } = affiche(poste.id, ligne, j)
        const existe = effectif > 0 || soutien > 0 || renfort > 0
        const libelle = `${nom}, ${h?.nom ?? 'horaire spécifique'}`
        return (
          <td key={nom} className="px-1 py-2">
            <div
              className={cn(
                'flex flex-col items-center gap-1 rounded-md py-1',
                existe ? 'bg-muted/40' : 'opacity-80',
              )}
            >
              <Compteur
                valeur={effectif}
                etiquette={`Effectif minimum ${libelle}`}
                disabled={desactive}
                onChange={(v) =>
                  regler(poste, ligne, [
                    {
                      jour: j,
                      effectif: v,
                      // Un nouveau besoin ouvre par défaut une place de soutien.
                      soutien: existe ? soutien : v > 0 ? 1 : 0,
                      renfort,
                    },
                  ])
                }
              />
              {(existe || effectif > 0) && (
                <Compteur
                  taille="mini"
                  valeur={soutien}
                  max={5}
                  suffixe="soutien"
                  etiquette={`Places de soutien ${libelle}`}
                  disabled={desactive}
                  onChange={(v) =>
                    regler(poste, ligne, [
                      { jour: j, effectif, soutien: v, renfort },
                    ])
                  }
                />
              )}
              <Compteur
                taille="mini"
                valeur={renfort}
                max={5}
                suffixe="en plus"
                attenue={renfort === 0}
                etiquette={`Places en plus, facultatives ${libelle}`}
                disabled={desactive}
                onChange={(v) =>
                  regler(poste, ligne, [
                    { jour: j, effectif, soutien, renfort: v },
                  ])
                }
              />
            </div>
          </td>
        )
      })}
      <td className="px-2 py-2">
        {modifiable && (
          <Tip label="Recopier le réglage du lundi sur toute la semaine">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Recopier le lundi sur toute la semaine, ${h?.nom ?? 'horaire spécifique'}`}
              onClick={() =>
                regler(
                  poste,
                  ligne,
                  [1, 2, 3, 4, 5, 6].map((jour) => ({
                    jour,
                    effectif: lundi.effectif,
                    soutien: lundi.soutien,
                    renfort: lundi.renfort,
                  })),
                )
              }
            >
              <ChevronsRight />
              Toute la semaine
            </Button>
          </Tip>
        )}
      </td>
    </tr>
  )
}

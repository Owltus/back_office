/*
 * Paramètres du Planning : la semaine type des besoins (prototype
 * `BesoinsPage.tsx`, spec §5.3). Une carte par poste, une ligne par code
 * horaire (ou horaire spécifique), une case par jour. Refait le 2026-10-28
 * (« utile mais mal présenté ») : deux vues (par poste, matin et soir), et
 * on choisit CE QU'ON RÈGLE (personnes nécessaires, apprentis et
 * stagiaires, en plus si besoin) : une case = un seul compteur, au lieu de
 * trois empilés. Chaque compteur s'enregistre aussitôt
 * (`reglerBesoin` : crée, modifie, ou supprime à 0 / 0 / 0), affiché tout de
 * suite à l'écran ; les écritures partent l'une après l'autre, chacune avec
 * le besoin RELU en base (deux clics rapides ne créent pas deux besoins).
 *
 * Seuls les horaires où il faut du monde sont montrés ; les autres codes
 * permis du poste s'ajoutent un par un (« Ajouter un horaire », 2026-10-28,
 * « il y a sûrement une logique mais je ne comprends pas »).
 *
 * Points d'attention, absents du prototype : un besoin plus long que le
 * maximum HCR de la catégorie du poste (`alerteBesoin`), et un besoin sur un
 * code horaire que le poste ne permet pas (le prototype le masquait).
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronsRight, Plus, TriangleAlert } from 'lucide-react'

import {
  useDroitsPlanning,
  useEcriture,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { CadreReglages } from '#/components/planning/parametres/reglages/cadre.tsx'
import { ConsignesPresence } from '#/components/planning/parametres/reglages/ConsignesPresence.tsx'
import {
  Compteur,
  Segmente,
} from '#/components/planning/parametres/reglages/controles.tsx'
import {
  horairesAAjouter,
  lignesDuPoste,
  trouverBesoin,
} from '#/components/planning/parametres/reglages/besoins.ts'
import type {
  LigneBesoin,
  Reglage,
} from '#/components/planning/parametres/reglages/besoins.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { heures, horairesDuPoste, texteSur } from '#/lib/planning/affichage.ts'
import { planningKeys } from '#/lib/planning/keys.ts'
import { alerteBesoin } from '#/lib/planning/regles.ts'
import { reglerBesoin } from '#/lib/planning/service.ts'
import { heureAffichee, presence } from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type {
  Besoin,
  Horaire,
  Poste,
  Referentiel,
} from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

const RIEN: Reglage = { effectif: 0, soutien: 0, renfort: 0 }

type Couche = keyof Reglage
const COUCHES: ReadonlyArray<{
  valeur: Couche
  libelle: string
  aide: string
}> = [
  {
    valeur: 'effectif',
    libelle: 'Personnes nécessaires',
    aide: 'Le minimum de personnes autonomes. Le planning automatique les place en priorité.',
  },
  {
    valeur: 'soutien',
    libelle: 'Apprentis et stagiaires',
    aide: 'Les places pour un apprenti ou un stagiaire. Ils ne comptent pas seuls : il faut au moins une personne nécessaire.',
  },
  {
    valeur: 'renfort',
    libelle: 'En plus si besoin',
    aide: "Des places facultatives, en renfort. Elles servent si quelqu'un manque d'heures dans sa semaine ou pour tenir le matin et le soir.",
  },
]
const LIBELLE_COUCHE = Object.fromEntries(
  COUCHES.map((c) => [c.valeur, c.libelle]),
) as Record<Couche, string>

type Vue = 'postes' | 'presence'
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

  // Lignes gardées dans la séance, par poste : ajoutées, ou réglées (une
  // ligne remise à 0 ne disparaît pas sous les doigts).
  const [gardees, setGardees] = useState<Map<number, Set<string>>>(new Map())
  const garder = useCallback((posteId: number, cle: string) => {
    setGardees((m) => {
      if (m.get(posteId)?.has(cle)) return m
      const suite = new Map(m)
      suite.set(posteId, new Set([...(m.get(posteId) ?? []), cle]))
      return suite
    })
  }, [])
  const [vue, setVue] = useState<Vue>('postes')
  const [couche, setCouche] = useState<Couche>('effectif')

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
    garder(poste.id, ligne.cle)
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
          <div className="flex flex-col items-start gap-1">
            <Segmente
              etiquette="Ce que montre la page"
              valeur={vue}
              onChange={setVue}
              options={[
                { valeur: 'postes', libelle: 'Par poste' },
                { valeur: 'presence', libelle: 'Matin et soir' },
              ]}
            />
            <p className="text-sm text-muted-foreground">
              {vue === 'postes'
                ? 'Pour chaque poste, une ligne par horaire où il faut du monde, et le nombre de personnes chaque jour. Le planning automatique place les gens sur ces lignes.'
                : "Combien de personnes au total le matin et le soir, tous postes de l'accueil confondus. Le planning automatique essaie de s'y tenir."}
            </p>
            <p className="text-xs text-muted-foreground">
              Dans quel ordre le planning automatique décide : la loi d'abord,
              puis les personnes nécessaires, puis les contrats, puis le confort
              (repos groupés, jours habituels, équité).
            </p>
          </div>

          {vue === 'presence' ? (
            <ConsignesPresence referentiel={data} modifiable={modifiable} />
          ) : !data.postes.length ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Aucun poste : créez d'abord les postes de l'hôtel.
            </p>
          ) : (
            <>
              {/* Collé en haut de la zone qui défile : le choix reste sous
                  la main quand on descend dans les postes. */}
              <div
                data-barre-besoins
                className="sticky -top-4 z-10 -mx-4 flex flex-col gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Vous réglez :</span>
                  <Segmente
                    etiquette="Ce que vous réglez"
                    valeur={couche}
                    onChange={setCouche}
                    options={COUCHES.map(({ valeur, libelle }) => ({
                      valeur,
                      libelle,
                    }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {COUCHES.find((c) => c.valeur === couche)?.aide}
                </p>
                {data.postes.length > 1 && (
                  <nav
                    aria-label="Aller à un poste"
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {data.postes.map((poste) => (
                      <button
                        key={poste.id}
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-muted"
                        onClick={(e) => allerAuPoste(e.currentTarget, poste.id)}
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
              </div>
              {data.postes.map((poste) => (
                <CartePoste
                  key={poste.id}
                  poste={poste}
                  referentiel={data}
                  couche={couche}
                  gardees={gardees.get(poste.id) ?? AUCUNE}
                  ajouter={(cle) => garder(poste.id, cle)}
                  modifiable={modifiable}
                  affiche={affiche}
                  regler={regler}
                />
              ))}
            </>
          )}
        </>
      )}
    </CadreReglages>
  )
}

/*
 * Défile la SEULE zone de contenu jusqu'au poste, sous la barre collée
 * (`scrollIntoView` faisait aussi défiler la fenêtre, en-tête compris).
 */
function allerAuPoste(depuis: HTMLElement, posteId: number) {
  const cible = document.getElementById(`besoins-poste-${posteId}`)
  const barre = depuis.closest<HTMLElement>('[data-barre-besoins]')
  let zone = cible?.parentElement ?? null
  while (zone && !/(auto|scroll)/.test(getComputedStyle(zone).overflowY)) {
    zone = zone.parentElement
  }
  if (!cible || !zone) return
  const haut =
    cible.getBoundingClientRect().top -
    zone.getBoundingClientRect().top +
    zone.scrollTop -
    (barre?.offsetHeight ?? 0) -
    8
  zone.scrollTo({ top: haut, behavior: 'smooth' })
}

const AUCUNE: ReadonlySet<string> = new Set()

function CartePoste({
  poste,
  referentiel,
  couche,
  gardees,
  ajouter,
  modifiable,
  affiche,
  regler,
}: {
  poste: Poste
  referentiel: Referentiel
  couche: Couche
  gardees: ReadonlySet<string>
  ajouter: (cle: string) => void
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
  const lignes = lignesDuPoste(siens, referentiel.horaires, gardees)
  const aAjouter = horairesAAjouter(possibles, lignes)
  const restreint = poste.horaires_autorises.length > 0

  // Totaux : présence par semaine (effectif × durée, pause non déduite, comme
  // le prototype) et, par jour, les personnes demandées.
  let presenceSemaine = 0
  const parJour = JOURS.map((_, j) => {
    let total = 0
    for (const l of lignes) {
      const r = affiche(poste.id, l, j)
      total += r[couche]
      presenceSemaine += r.effectif * presence(l.debut, l.fin)
    }
    return total
  })
  const titreId = `besoins-poste-${poste.id}`

  return (
    <section
      aria-labelledby={titreId}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-t-4 bg-card p-4"
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
          <span className="text-xs text-muted-foreground tabular-nums">
            {heures(presenceSemaine)} de présence / semaine
          </span>
        </div>
        {modifiable && aAjouter.length > 0 && (
          <AjoutHoraire
            poste={poste}
            horaires={aAjouter}
            onChoisir={(h) => ajouter(`t${h.id}`)}
          />
        )}
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">
        {restreint
          ? `Les horaires proposés sont ceux choisis pour ce poste dans Postes (${possibles.length}).`
          : `Aucun horaire choisi pour ce poste dans Postes : les ${possibles.length} codes sont proposés.`}
      </p>

      {lignes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {modifiable
            ? "Ce poste n'a besoin de personne pour l'instant. Ajoutez un horaire pour en demander."
            : "Ce poste n'a besoin de personne pour l'instant."}
        </p>
      ) : (
        <div className="@container overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="w-[13rem] px-3 py-2 text-left font-medium @min-[62rem]:w-[16rem]">
                  Horaire
                </th>
                {JOURS.map((j) => (
                  <th key={j} className="px-1 py-2 text-center font-medium">
                    {j.slice(0, 3)}.
                  </th>
                ))}
                <th className="w-12 px-2 py-2">
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
                  couche={couche}
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
                  <td
                    key={j}
                    className={cn(
                      'px-1 py-2 text-center font-semibold tabular-nums',
                      t === 0 && 'text-muted-foreground/60',
                    )}
                  >
                    {t}
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

/** Liste des codes permis qui n'ont pas encore de ligne, rangés par heure. */
function AjoutHoraire({
  poste,
  horaires,
  onChoisir,
}: {
  poste: Poste
  horaires: Horaire[]
  onChoisir: (h: Horaire) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Ajouter un horaire au poste ${poste.nom}`}
        >
          <Plus />
          Ajouter un horaire
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <ul
          aria-label="Horaires à ajouter"
          className="flex max-h-80 flex-col overflow-y-auto"
        >
          {horaires.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => {
                  onChoisir(h)
                  setOuvert(false)
                }}
              >
                <span
                  className="w-10 shrink-0 rounded px-1 text-center text-[11px] font-semibold"
                  style={{ background: h.couleur, color: texteSur(h.couleur) }}
                >
                  {h.code}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{h.nom}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {heureAffichee(h.debut)} à {heureAffichee(h.fin)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function LigneTableau({
  poste,
  ligne,
  referentiel,
  couche,
  permise,
  modifiable,
  affiche,
  regler,
}: {
  poste: Poste
  ligne: LigneBesoin
  referentiel: Referentiel
  couche: Couche
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
  // Ce qui est réglé dans les AUTRES choix : une ligne à 0 ici n'a pas
  // l'air d'un oubli quand elle porte des places ailleurs.
  const ailleurs = COUCHES.filter(
    (c) =>
      c.valeur !== couche &&
      JOURS.some((_, j) => affiche(poste.id, ligne, j)[c.valeur] > 0),
  ).map((c) => c.libelle.toLowerCase())

  return (
    <tr className="border-t">
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
            {ailleurs.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Réglé aussi : {ailleurs.join(', ')}.
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
        const r = affiche(poste.id, ligne, j)
        const existe = r.effectif > 0 || r.soutien > 0 || r.renfort > 0
        const libelle = `${nom}, ${h?.nom ?? 'horaire spécifique'}`
        const valeur = r[couche]
        // Un apprenti n'est jamais seul : pas de place sans personne nécessaire.
        const sansBase = couche === 'soutien' && r.effectif === 0
        return (
          <td key={nom} className="px-1 py-2 text-center">
            {sansBase ? (
              <Tip label="Mettez d'abord une personne nécessaire sur ce jour">
                <span
                  tabIndex={0}
                  className="inline-block py-0.5 text-muted-foreground/50"
                >
                  —
                </span>
              </Tip>
            ) : (
              <Compteur
                valeur={valeur}
                max={couche === 'effectif' ? 20 : 5}
                attenue={valeur === 0}
                etiquette={`${LIBELLE_COUCHE[couche]} ${libelle}`}
                disabled={desactive}
                onChange={(v) =>
                  regler(poste, ligne, [
                    couche === 'effectif'
                      ? {
                          jour: j,
                          effectif: v,
                          // Un nouveau besoin ouvre par défaut une place de
                          // soutien ; plus personne : plus de soutien.
                          soutien: v === 0 ? 0 : existe ? r.soutien : 1,
                          renfort: r.renfort,
                        }
                      : { jour: j, ...r, [couche]: v },
                  ])
                }
              />
            )}
          </td>
        )
      })}
      <td className="px-2 py-2">
        {modifiable && (
          <Tip label="Recopier le lundi sur toute la semaine (les trois réglages)">
            <Button
              variant="ghost"
              size="icon-sm"
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
            </Button>
          </Tip>
        )}
      </td>
    </tr>
  )
}

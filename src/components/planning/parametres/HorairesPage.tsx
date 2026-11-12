/*
 * Paramètres du Planning : horaires et motifs d'absence (prototype
 * `HorairesPage.tsx`, spec §5.2). Différence voulue avec le prototype : rien
 * ne part à la frappe (anomalie 12) ; chaque carte s'enregistre par son
 * bouton, après contrôle des mêmes règles que la base (pause plus courte que
 * l'horaire, deux horaires aux mêmes heures…). Depuis le 2026-10-31 (décision utilisateur), un horaire
 * n'a plus de code ni de nom à saisir : il se lit par ses heures et son
 * moment ; le moment est CALCULÉ d'après les heures (2026-11-05), et le
 * nom rangé en base est écrit par l'app (`nomHoraire`). Un horaire modifié
 * fait suivre les shifts à venir (trigger en base), jamais ceux des semaines
 * verrouillées. Seule la gestion modifie.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Moon, Plus, Trash2 } from 'lucide-react'

import {
  useDroitsPlanning,
  useEcriture,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  compterAbsencesParMotif,
  usageMotif,
} from '#/components/planning/parametres/reglages/absencesParMotif.ts'
import type { LigneAbsence } from '#/components/planning/parametres/reglages/absencesParMotif.ts'
import { PastilleCode } from '#/components/planning/parametres/reglages/ListeCompacte.tsx'
import {
  idCible,
  useOuvrirCible,
} from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import type { PropsOuvrir } from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import {
  CadreReglages,
  EnTeteSection,
  useBrouillon,
} from '#/components/planning/parametres/reglages/cadre.tsx'
import {
  CarteReglage,
  ErreursSaisie,
  Nuancier,
  PALETTE,
  Segmente,
} from '#/components/planning/parametres/reglages/controles.tsx'
import {
  codePropose,
  changerHeures,
  erreursHoraire,
  erreursMotif,
  heuresLibres,
  heureValide,
  momentDeLaSaisie,
  nettoyerHoraire,
  nettoyerMotif,
  normaliserHeure,
} from '#/components/planning/parametres/reglages/validation.ts'
import type {
  SaisieHoraire,
  SaisieMotif,
} from '#/components/planning/parametres/reglages/validation.ts'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { indiceErreur, messageErreur } from '#/lib/planning/erreurs.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import {
  heures,
  libelleHoraire,
  libelleMoment,
  momentPropose,
  texteSur,
} from '#/lib/planning/affichage.ts'
import {
  enregistrerHoraire,
  enregistrerMotif,
  supprimerHoraire,
  supprimerMotif,
} from '#/lib/planning/service.ts'
import { couleurHoraire } from '#/lib/planning/cycles.ts'
import { horairesNormaux, versionsEtoile } from '#/lib/planning/etoile.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import { leMoment, momentDe } from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'

import {
  heureAffichee,
  heuresLisibles,
  minutes,
  presence,
} from '#/lib/planning/temps.ts'
import type {
  Horaire,
  Motif,
  NatureMotif,
  Periode,
  Referentiel,
  RoleMotif,
} from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'
import { ICONES_MOTIF, iconeMotif } from '#/components/planning/iconeMotif.ts'
import { HorairesParMoment } from '#/components/planning/parametres/horaires/HorairesParMoment.tsx'
import type { LucideIcon } from 'lucide-react'

const NATURES: ReadonlyArray<{
  valeur: NatureMotif
  libelle: string
  aide: string
  texte: string
}> = [
  {
    valeur: 'absence',
    libelle: 'Absence',
    aide: 'Absence : vacances, repos exceptionnel, sans solde, maladie…',
    texte: 'La personne est absente ce jour-là.',
  },
  {
    valeur: 'ecole',
    libelle: 'École',
    aide: "École : jour hors de l'hôtel, compté comme une journée de travail complète",
    texte:
      "Jour hors de l'hôtel, compté comme une journée de travail complète. Ce n'est pas une absence.",
  },
  {
    valeur: 'repos',
    libelle: 'Repos',
    aide: 'Repos : un jour de repos posé à une date, comme celui de la semaine type',
    texte:
      'Jour de repos posé à une date. Il ne retire aucune heure : la personne les fait les autres jours.',
  },
]

const saisieHoraire = (h: Horaire): SaisieHoraire => ({
  debut: h.debut,
  fin: h.fin,
  couleur: h.couleur,
  pause: h.pause,
  periode: h.periode,
  moment_force: !!h.moment_force,
  extra: !!h.extra,
})

/** Ce que fait le moment d'un horaire, lu sur ses cases. */
function aideMoment(l: Moments, p: Periode | null): string {
  const m = momentDe(l, p)
  if (!m || !m.compte_dans_tableau)
    return 'Un coup de main : ne compte pas dans le tableau Accueil'
  return m.est_nuit
    ? `Compte ${leMoment(l, m.id)} dans le tableau Accueil, sur les postes de la nuit`
    : `Compte ${leMoment(l, m.id)} dans le tableau Accueil`
}

const saisieMotif = (m: Motif): SaisieMotif => ({
  code: m.code,
  nom: m.nom,
  couleur: m.couleur,
  decompte: m.decompte,
  nature: m.nature,
  libre_weekend: m.libre_weekend ?? (m.nature === 'repos' || !m.decompte),
  reserve_forfait: !!m.reserve_forfait,
  rythme_travail: !!m.rythme_travail,
  role: m.role ?? null,
  icone: m.icone ?? null,
})

/** Le rôle d'un motif dans le planning (2026-11-06, à la place des codes
 * JF, JFR, R), selon sa nature ; un seul motif par rôle. */
const ROLES: Record<
  NatureMotif,
  ReadonlyArray<{ valeur: RoleMotif | 'aucun'; libelle: string; texte: string }>
> = {
  absence: [
    { valeur: 'aucun', libelle: 'Aucun', texte: 'Un motif comme un autre.' },
    {
      valeur: 'ferie_chome',
      libelle: 'Jour férié chômé',
      texte:
        'Posé par le planning les jours fériés, pour qui les prend le jour même (stagiaires, encadrement).',
    },
    {
      valeur: 'ferie_rattrape',
      libelle: 'Jour férié rattrapé',
      texte:
        "Proposé par le planning quand quelqu'un a travaillé un jour férié.",
    },
  ],
  repos: [
    { valeur: 'aucun', libelle: 'Aucun', texte: 'Un repos comme un autre.' },
    {
      valeur: 'repos_defaut',
      libelle: 'Repos du planning',
      texte: 'Le repos que le planning pose et valide.',
    },
  ],
  ecole: [],
}

export function HorairesPage({ ouvrir: lien, onOuvert }: PropsOuvrir = {}) {
  const droits = useDroitsPlanning()
  const ref = useReferentiel()
  const modifiable = droits.pret && droits.gerer
  const [nouvelHoraire, setNouvelHoraire] = useState<SaisieHoraire | null>(null)
  const [nouveauMotif, setNouveauMotif] = useState<SaisieMotif | null>(null)
  const data = ref.data
  // Jours d'absence posés, pour l'usage des motifs (clé `planning` : relue
  // après chaque écriture, jamais sur disque).
  const absences = useQuery({
    queryKey: ['planning', 'absences-par-motif'],
    queryFn: compterAbsencesParMotif,
    staleTime: 0,
  })

  // Un horaire ou un motif ouvert dans le volet (id null : nouveau).
  const [ouvert, setOuvert] = useState<{
    type: 'horaire' | 'motif'
    id: number | null
  } | null>(null)
  const horaireOuvert =
    ouvert?.type === 'horaire' && ouvert.id !== null
      ? data?.horaires.find((h) => h.id === ouvert.id)
      : undefined
  const motifOuvert =
    ouvert?.type === 'motif' && ouvert.id !== null
      ? data?.motifs.find((m) => m.id === ouvert.id)
      : undefined
  const fermer = () => {
    setOuvert(null)
    setNouvelHoraire(null)
    setNouveauMotif(null)
  }
  useOuvrirCible(
    lien,
    !!data,
    (cible) => {
      const id = idCible(cible, 'horaire')
      if (id === undefined || !data?.horaires.some((h) => h.id === id))
        return false
      setNouvelHoraire(null)
      setNouveauMotif(null)
      setOuvert({ type: 'horaire', id })
      return true
    },
    onOuvert,
  )

  const creerHoraire = () => {
    if (!data) return
    const heuresNeuves = { ...heuresLibres(data.horaires), pause: 45 }
    setNouvelHoraire({
      ...heuresNeuves,
      couleur: couleurHoraire({
        ...heuresNeuves,
        periode: momentPropose(heuresNeuves, lireRegles(data).moments),
      }),
      periode: momentPropose(heuresNeuves, lireRegles(data).moments),
    })
  }
  const creerMotif = () => {
    if (!data) return
    setNouveauMotif({
      code: '',
      nom: 'Nouveau motif',
      couleur: PALETTE[(data.motifs.length + 5) % PALETTE.length],
      decompte: true,
      nature: 'absence',
      libre_weekend: false,
      reserve_forfait: false,
      rythme_travail: false,
      role: null,
      icone: null,
    })
  }

  return (
    <CadreReglages
      titre="Horaires et absences"
      actif="/planning/horaires"
      modifiable={modifiable}
      pret={droits.pret}
      chargement={ref.isPending}
      erreur={ref.isError}
      onReessayer={() => void ref.refetch()}
    >
      {data && (
        <>
          <section
            className="flex flex-col gap-4"
            aria-labelledby="titre-horaires"
          >
            <div id="titre-horaires">
              <EnTeteSection
                titre="Horaires"
                texte="Rangés par moment, comme dans les menus du planning. Un clic sur un horaire ouvre son réglage. La pause compte dans la présence mais pas dans les heures. Modifier les heures d'un horaire met à jour les shifts à venir posés avec lui."
                actions={
                  modifiable && (
                    <Button
                      size="sm"
                      onClick={() => {
                        creerHoraire()
                        setOuvert({ type: 'horaire', id: null })
                      }}
                      disabled={!!nouvelHoraire}
                    >
                      <Plus />
                      Nouvel horaire
                    </Button>
                  )
                }
              />
            </div>
            {/* Un tableau par moment, l'un sous l'autre (2026-11-11), et
                glisser-déposer d'un moment à l'autre (2026-11-12). */}
            <HorairesParMoment
              horaires={data.horaires}
              moments={lireRegles(data).moments}
              modifiable={modifiable}
              etoile={(h) =>
                horairesNormaux(h, data.horaires, lireRegles(data)).length > 0
              }
              onOuvrir={(h) => setOuvert({ type: 'horaire', id: h.id })}
            />
          </section>

          {/* Moments en dur depuis le 2026-11-11 (`momentFixe`), rangés à la
              main par glisser-déposer depuis le 2026-11-12. */}
          <p data-moments className="-mt-2 text-sm text-muted-foreground">
            Le moment se calcule d'après les heures : nuit si l'horaire contient
            2 h du matin, soir s'il finit après 21 h, matin s'il commence à 8 h
            ou avant, middle sinon.
            {modifiable &&
              ' Pour ranger un horaire ailleurs, glissez sa ligne dans un autre tableau. Les horaires de moins de 6 h de travail vont dans Extra.'}
          </p>

          <section
            className="flex flex-col gap-4"
            aria-labelledby="titre-motifs"
          >
            <div id="titre-motifs">
              <EnTeteSection
                titre="Absences et école"
                texte="Chaque motif a sa couleur et se pose sur une case du planning comme un horaire. Pour les apprentis et les stagiaires, l'école est un jour hors de l'hôtel, compté comme une journée de travail complète. Ce n'est pas une absence."
                actions={
                  modifiable && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        creerMotif()
                        setOuvert({ type: 'motif', id: null })
                      }}
                      disabled={!!nouveauMotif}
                    >
                      <Plus />
                      Nouveau motif
                    </Button>
                  )
                }
              />
            </div>
            {/* Un tableau par groupe, l'un sous l'autre (2026-11-12), comme
                les horaires. */}
            <div className="flex w-full flex-col gap-6">
              {[
                { titre: 'Repos', nature: 'repos' as const },
                { titre: 'Absences', nature: 'absence' as const },
                { titre: 'École', nature: 'ecole' as const },
              ].map((g) => (
                <TableauMotifs
                  key={g.nature}
                  titre={g.titre}
                  motifs={data.motifs.filter((m) => m.nature === g.nature)}
                  usage={(m) =>
                    absences.data
                      ? usageMotif(m.id, data.salaries, absences.data).jours
                      : undefined
                  }
                  onOuvrir={(m) => setOuvert({ type: 'motif', id: m.id })}
                />
              ))}
            </div>
          </section>

          <Sheet
            open={
              !!ouvert &&
              (ouvert.id === null || !!horaireOuvert || !!motifOuvert)
            }
            onOpenChange={(o) => !o && fermer()}
          >
            <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
              <SheetHeader className="border-b">
                <SheetTitle>
                  {ouvert?.type === 'motif'
                    ? ouvert.id === null
                      ? 'Nouveau motif'
                      : `Motif ${motifOuvert?.code ?? ''}`
                    : ouvert?.id === null
                      ? 'Nouvel horaire'
                      : `Horaire ${horaireOuvert ? libelleHoraire(horaireOuvert) : ''}`}
                </SheetTitle>
                <SheetDescription>
                  {ouvert?.type === 'motif'
                    ? (motifOuvert?.nom ?? 'Absence ou école')
                    : horaireOuvert
                      ? libelleMoment(
                          horaireOuvert.periode,
                          lireRegles(data).moments,
                        )
                      : 'Heures, pause, moment et couleur'}
                </SheetDescription>
              </SheetHeader>
              <div className="p-4">
                {ouvert?.type === 'horaire' &&
                  (ouvert.id === null
                    ? nouvelHoraire && (
                        <CarteHoraire
                          key="nouveau"
                          id={null}
                          enregistre={nouvelHoraire}
                          referentiel={data}
                          modifiable={modifiable}
                          onFin={fermer}
                        />
                      )
                    : horaireOuvert && (
                        <CarteHoraire
                          key={horaireOuvert.id}
                          id={horaireOuvert.id}
                          enregistre={saisieHoraire(horaireOuvert)}
                          referentiel={data}
                          modifiable={modifiable}
                          onFin={fermer}
                        />
                      ))}
                {ouvert?.type === 'motif' &&
                  (ouvert.id === null
                    ? nouveauMotif && (
                        <CarteMotif
                          key="nouveau"
                          id={null}
                          enregistre={nouveauMotif}
                          referentiel={data}
                          absences={absences.data}
                          modifiable={modifiable}
                          onFin={fermer}
                        />
                      )
                    : motifOuvert && (
                        <CarteMotif
                          key={motifOuvert.id}
                          id={motifOuvert.id}
                          enregistre={saisieMotif(motifOuvert)}
                          referentiel={data}
                          absences={absences.data}
                          modifiable={modifiable}
                          onFin={fermer}
                        />
                      ))}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </CadreReglages>
  )
}

// ------------------------------------------------------- listes compactes

/** Les motifs d'un groupe en tableau (2026-11-12) : une ligne par motif, un
 * clic ouvre son réglage. */
function TableauMotifs({
  titre,
  motifs,
  usage,
  onOuvrir,
}: {
  titre: string
  motifs: readonly Motif[]
  usage: (m: Motif) => number | undefined
  onOuvrir: (m: Motif) => void
}) {
  if (!motifs.length) return null
  return (
    <section aria-label={titre} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        {titre}{' '}
        <span className="font-normal text-muted-foreground tabular-nums">
          ({motifs.length})
        </span>
      </h3>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="w-20 px-3 py-2 text-left font-medium">Code</th>
              <th className="px-3 py-2 text-left font-medium">Motif</th>
              <th className="w-56 px-3 py-2 text-left font-medium">Heures</th>
              <th className="w-32 px-3 py-2 text-left font-medium">
                Jours posés
              </th>
            </tr>
          </thead>
          <tbody>
            {motifs.map((m) => {
              const n = usage(m)
              return (
                <tr
                  key={m.id}
                  className="cursor-pointer border-t hover:bg-muted/40"
                  onClick={() => onOuvrir(m)}
                >
                  <td className="px-3 py-2">
                    <PastilleCode code={m.code} couleur={m.couleur} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      aria-label={`Régler ${m.code}, ${m.nom}`}
                      className="font-medium outline-none focus-visible:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOuvrir(m)
                      }}
                    >
                      {m.nom}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {m.decompte ? 'compte dans les heures' : 'hors heures'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {n === undefined ? '' : `${n} j`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ------------------------------------------------------------ boutons du bas

function PiedCarte({
  modifiable,
  neuf,
  modifie,
  envoi,
  invalide,
  libelleCreer,
  info,
  onSupprimer,
  onAnnuler,
  onEnregistrer,
}: {
  modifiable: boolean
  neuf: boolean
  modifie: boolean
  envoi: boolean
  invalide: boolean
  libelleCreer: string
  info: ReactNode
  onSupprimer: () => void
  onAnnuler: () => void
  onEnregistrer: () => void
}) {
  return (
    <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">
      {(!modifiable || !(modifie || neuf)) && (
        <span className="mr-auto text-xs text-muted-foreground">{info}</span>
      )}
      {modifiable && !neuf && !modifie && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={envoi}
          onClick={onSupprimer}
        >
          <Trash2 />
          Supprimer
        </Button>
      )}
      {modifiable && (modifie || neuf) && (
        <>
          {modifie && !neuf && (
            <span className="mr-auto text-xs text-muted-foreground">
              Non enregistré
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={envoi}
            onClick={onAnnuler}
          >
            Annuler
          </Button>
          <Button
            size="sm"
            disabled={envoi || invalide}
            onClick={onEnregistrer}
          >
            {neuf ? libelleCreer : 'Enregistrer'}
          </Button>
        </>
      )}
    </div>
  )
}

function Champ({
  libelle,
  children,
  aide,
}: {
  libelle: string
  children: ReactNode
  aide?: string
}) {
  const contenu = (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {libelle}
      {children}
    </label>
  )
  return aide ? <Tip label={aide}>{contenu}</Tip> : contenu
}

/** Champ de minutes : vide = NaN (le contrôle le refuse). */
function ChampMinutes({
  valeur,
  onChange,
  max,
  pas,
  disabled,
  etiquette,
}: {
  valeur: number
  onChange: (v: number) => void
  max: number
  pas: number
  disabled: boolean
  etiquette: string
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      step={pas}
      aria-label={etiquette}
      disabled={disabled}
      value={Number.isNaN(valeur) ? '' : valeur}
      onChange={(e) =>
        onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))
      }
      className="h-8 w-20 tabular-nums"
    />
  )
}

// ------------------------------------------------------------------ horaires

function CarteHoraire({
  id,
  enregistre,
  referentiel,
  modifiable,
  onFin,
}: {
  id: number | null
  enregistre: SaisieHoraire
  referentiel: Referentiel
  modifiable: boolean
  onFin?: () => void
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const {
    brouillon: h,
    modifie,
    changer,
    annuler,
    adopter,
  } = useBrouillon(enregistre)
  const [envoi, setEnvoi] = useState(false)
  const [suppression, setSuppression] = useState(false)
  // Suppression refusée parce que l'horaire a servi dans des semaines
  // verrouillées : la raison, et la proposition de garder les heures.
  const [enManuel, setEnManuel] = useState<string | null>(null)
  // Le moment suit toujours les heures (décision du 2026-11-05) : il n'y a
  // plus rien à choisir.
  const neuf = id === null
  // Les règles de l'établissement : limites des moments, journées.
  const regles = lireRegles(referentiel)
  const erreurs = erreursHoraire(h, referentiel.horaires, id)
  const heuresDe = (
    maj: Partial<Pick<SaisieHoraire, 'debut' | 'fin' | 'pause'>>,
  ) => changer(changerHeures(h, maj, regles.moments))
  const heuresChangees =
    !neuf &&
    (h.debut !== enregistre.debut ||
      h.fin !== enregistre.fin ||
      h.pause !== enregistre.pause)

  const enregistrer = async () => {
    if (erreurs.length || envoi || (!modifie && !neuf)) return
    const valeurs = nettoyerHoraire(h, regles.moments)
    setEnvoi(true)
    const r = await ecrire(
      () => enregistrerHoraire(valeurs, id, regles.moments),
      "L'horaire n'a pas pu être enregistré.",
    )
    setEnvoi(false)
    if (!r.ok) {
      notifier(r.message, 'danger')
      return
    }
    adopter(h)
    const libelle = libelleHoraire(valeurs)
    notifier(
      neuf
        ? `Horaire ${libelle} créé.`
        : heuresChangees
          ? `Horaire ${libelle} enregistré. Les shifts à venir posés avec cet horaire ont suivi. Les semaines verrouillées ne changent pas.`
          : `Horaire ${libelle} enregistré.`,
    )
    onFin?.()
  }

  const supprimer = async (passerEnManuel = false) => {
    if (id === null) return
    setEnvoi(true)
    let proposition: string | null = null
    const r = await ecrire(
      async () => {
        try {
          await supprimerHoraire(id, passerEnManuel)
        } catch (err) {
          if (indiceErreur(err) === 'passer_en_manuel')
            proposition = messageErreur(err)
          throw err
        }
      },
      `L'horaire ${libelleHoraire(enregistre)} n'a pas pu être supprimé.`,
    )
    setEnvoi(false)
    if (proposition !== null) {
      setEnManuel(proposition)
      return
    }
    notifier(
      r.ok ? `Horaire ${libelleHoraire(enregistre)} supprimé.` : r.message,
      r.ok ? 'info' : 'danger',
    )
  }

  const heuresOk =
    heureValide(h.debut) && heureValide(h.fin) && h.debut !== '24:00'
  const p = heuresOk ? presence(h.debut, h.fin) : 0
  const travail = p - (Number.isNaN(h.pause) ? 0 : h.pause)
  const lendemain = heuresOk && minutes(h.fin) <= minutes(h.debut)
  // Journée étoile (2026-11-02) : plus de minutes en moins, un AUTRE horaire
  // de 7 h contenu dans celui-ci (`etoile.ts`). Dit dans l'aperçu, pour
  // savoir ce que le planning prendra.
  const ceHoraire = { ...h, id: id ?? -1 }
  const versions = heuresOk
    ? versionsEtoile(ceHoraire, referentiel.horaires, regles)
    : []
  const normaux = heuresOk
    ? horairesNormaux(ceHoraire, referentiel.horaires, regles)
    : []
  const listeHoraires = (l: readonly Horaire[]) =>
    l.map((x) => libelleHoraire(x)).join(', ')
  const utilise =
    id === null
      ? 0
      : referentiel.besoins.filter((b) => b.horaire_id === id).length
  const desactive = !modifiable

  return (
    <CarteReglage
      couleur={h.couleur}
      etiquette={
        neuf ? 'Nouvel horaire' : `Horaire ${libelleHoraire(enregistre)}`
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Début"
          value={h.debut}
          placeholder="HH:MM"
          inputMode="numeric"
          maxLength={5}
          disabled={desactive}
          onChange={(e) => heuresDe({ debut: e.target.value })}
          onBlur={(e) => heuresDe({ debut: normaliserHeure(e.target.value) })}
          onKeyDown={(e) => e.key === 'Enter' && void enregistrer()}
          className="h-8 w-20 text-center tabular-nums"
        />
        <span className="text-muted-foreground">→</span>
        <Input
          aria-label="Fin"
          value={h.fin}
          placeholder="HH:MM"
          inputMode="numeric"
          maxLength={5}
          disabled={desactive}
          onChange={(e) => heuresDe({ fin: e.target.value })}
          onBlur={(e) => heuresDe({ fin: normaliserHeure(e.target.value) })}
          onKeyDown={(e) => e.key === 'Enter' && void enregistrer()}
          className="h-8 w-20 text-center tabular-nums"
        />
        {heuresOk && travail > 0 && (
          <Tip label="Temps de travail, pause déduite">
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums"
              tabIndex={0}
            >
              {heures(travail)}
            </span>
          </Tip>
        )}
        {lendemain && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Moon className="size-3" />
            Finit le lendemain
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Champ libelle="Pause">
          <ChampMinutes
            etiquette="Pause en minutes"
            valeur={h.pause}
            max={180}
            pas={5}
            disabled={desactive}
            onChange={(pause) => heuresDe({ pause })}
          />
          min
        </Champ>
      </div>

      {heuresOk && erreurs.length === 0 && (
        <div
          className="grid gap-1 rounded-lg bg-muted/50 p-2 text-xs"
          aria-label="Aperçu des heures"
        >
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">
              {travail >= regles.contrats.journeePleine
                ? 'Journée normale'
                : 'Heures'}
            </span>
            <span className="tabular-nums">
              {heureAffichee(h.debut)} → {heureAffichee(h.fin)} ·{' '}
              {heures(travail)} de travail
            </span>
          </div>
          {travail >= regles.contrats.journeePleine && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Journée étoile</span>
              <span className="text-right tabular-nums">
                {versions.length
                  ? listeHoraires(versions)
                  : `aucun horaire de ${heuresLisibles(regles.contrats.journeeEtoileMin)} contenu dans celui-ci`}
              </span>
            </div>
          )}
          {normaux.length > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Journée étoile de</span>
              <span className="text-right tabular-nums">
                {listeHoraires(normaux)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm text-muted-foreground">Moment</span>
          <span className="text-sm font-medium">
            {libelleMoment(momentDeLaSaisie(h, regles.moments), regles.moments)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {aideMoment(regles.moments, momentDeLaSaisie(h, regles.moments))}.
          Calculé d'après les heures.
        </span>
      </div>

      {/* Couleur EN DUR depuis le 2026-11-11 (`couleurHoraire`) : elle suit
          le moment et la longueur, elle ne se choisit plus. */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Couleur</span>
        <span
          aria-hidden
          className="size-3 rounded-full"
          style={{
            background: couleurHoraire({
              ...h,
              periode: momentDeLaSaisie(h, regles.moments),
            }),
          }}
        />
        <span className="text-xs text-muted-foreground">
          Violet si l'horaire est court, sinon jaune le matin, orange en middle,
          vert le soir, bleu la nuit.
        </span>
      </div>

      <ErreursSaisie erreurs={modifiable ? erreurs : []} />
      {modifiable && heuresChangees && erreurs.length === 0 && (
        <p className="text-xs text-amber-500">
          À l'enregistrement, les shifts déjà posés avec cet horaire prennent
          ces heures, sauf dans les semaines verrouillées.
        </p>
      )}

      <PiedCarte
        modifiable={modifiable}
        neuf={neuf}
        modifie={modifie}
        envoi={envoi}
        invalide={erreurs.length > 0}
        libelleCreer="Créer l'horaire"
        info={
          utilise
            ? `Utilisé dans ${utilise} besoin${utilise > 1 ? 's' : ''}`
            : 'Non utilisé'
        }
        onSupprimer={() => setSuppression(true)}
        onAnnuler={() => (neuf ? onFin?.() : annuler())}
        onEnregistrer={() => void enregistrer()}
      />

      <ConfirmDialog
        open={suppression}
        onOpenChange={setSuppression}
        title={`Supprimer l'horaire ${libelleHoraire(enregistre)} ?`}
        description="Ses besoins sont supprimés. Les shifts déjà posés gardent leurs heures. Il est retiré des fiches et des postes. Impossible s'il est le seul horaire permis d'une fiche ou d'un poste."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void supprimer()}
      />
      <ConfirmDialog
        open={enManuel !== null}
        onOpenChange={(o) => !o && setEnManuel(null)}
        title={`L'horaire ${libelleHoraire(enregistre)} a servi dans des plannings réalisés`}
        description={
          <>
            {enManuel}
            <br />
            <br />
            Les plannings ne changent pas : chaque shift garde ses heures et sa
            pause, il n'est simplement plus relié à cet horaire.
          </>
        }
        confirmLabel="Garder les heures et supprimer"
        destructive
        onConfirm={() => void supprimer(true)}
      />
    </CarteReglage>
  )
}

// ------------------------------------------------------------------ motifs

function CarteMotif({
  id,
  enregistre,
  referentiel,
  absences,
  modifiable,
  onFin,
}: {
  id: number | null
  enregistre: SaisieMotif
  referentiel: Referentiel
  /** Jours d'absence posés (undefined : pas encore lus, ou lecture en échec). */
  absences: LigneAbsence[] | undefined
  modifiable: boolean
  onFin?: () => void
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const {
    brouillon: m,
    modifie,
    changer,
    annuler,
    adopter,
  } = useBrouillon(enregistre)
  const [envoi, setEnvoi] = useState(false)
  const [suppression, setSuppression] = useState(false)
  const neuf = id === null
  const erreurs = erreursMotif(m)
  const desactive = !modifiable

  const enregistrer = async () => {
    if (erreurs.length || envoi || (!modifie && !neuf)) return
    const valeurs = nettoyerMotif(m)
    setEnvoi(true)
    const r = await ecrire(
      () => enregistrerMotif(valeurs, id),
      "Le motif n'a pas pu être enregistré",
    )
    setEnvoi(false)
    if (!r.ok) {
      notifier(r.message, 'danger')
      return
    }
    adopter(valeurs)
    notifier(
      neuf ? `Motif ${valeurs.nom} créé` : `Motif ${valeurs.nom} enregistré`,
    )
    onFin?.()
  }

  const supprimer = async () => {
    if (id === null) return
    setEnvoi(true)
    const r = await ecrire(
      () => supprimerMotif(id),
      `Le motif ${enregistre.nom} n'a pas pu être supprimé`,
    )
    setEnvoi(false)
    notifier(
      r.ok ? `Motif ${enregistre.nom} supprimé` : r.message,
      r.ok ? 'info' : 'danger',
    )
  }

  // Comme le prototype : semaine type ET jours posés. Tant que les jours
  // posés ne sont pas lus, seule la semaine type est comptée, et la
  // confirmation de suppression ne cite pas de nombre de jours.
  const usage =
    id === null
      ? { personnes: 0, jours: 0 }
      : usageMotif(id, referentiel.salaries, absences ?? [])
  const utilise = usage.personnes
  const joursConnus = absences !== undefined
  const nature = NATURES.find((n) => n.valeur === m.nature) ?? NATURES[0]

  return (
    <CarteReglage
      couleur={m.couleur}
      etiquette={neuf ? 'Nouveau motif' : `Motif ${enregistre.nom}`}
    >
      <div className="flex items-center gap-2">
        <Input
          aria-label="Code court"
          value={m.code}
          placeholder={codePropose(m.nom)}
          title="Laissez vide : le code est proposé d'après le nom"
          maxLength={4}
          disabled={desactive}
          onChange={(e) => changer({ code: e.target.value.toUpperCase() })}
          className="h-9 w-16 shrink-0 border-transparent text-center font-semibold uppercase"
          style={{ background: m.couleur, color: texteSur(m.couleur) }}
        />
        <Input
          aria-label="Nom du motif"
          value={m.nom}
          maxLength={80}
          disabled={desactive}
          onChange={(e) => changer({ nom: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && void enregistrer()}
          className="font-medium"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Segmente
          etiquette="Nature du motif"
          valeur={m.nature}
          options={NATURES}
          disabled={desactive}
          onChange={(v) =>
            changer({
              nature: v,
              // Un rôle ne vaut que pour sa nature ; l'école n'est jamais
              // un jour libre.
              role: null,
              libre_weekend: v === 'ecole' ? false : m.libre_weekend,
            })
          }
        />
        <span className="text-xs text-muted-foreground">{nature.texte}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Couleur</span>
        <Nuancier
          valeur={m.couleur}
          disabled={desactive}
          etiquette="Couleur du motif"
          onChange={(couleur) => changer({ couleur })}
        />
      </div>

      {/* École et repos ont leur propre règle d'heures (audit RH du
          2026-11-01) : la case ne servirait à rien. */}
      {m.nature === 'absence' && (
        <label className="flex items-start gap-2 text-sm">
          <Switch
            checked={m.decompte}
            disabled={desactive}
            onCheckedChange={(decompte) => changer({ decompte })}
            aria-label="Compté dans les heures"
            className="mt-0.5"
          />
          <span>
            Compté dans les heures
            <span className="block text-xs text-muted-foreground">
              Un jour de ce motif vaut une journée de travail : il est retiré
              des heures dues de la semaine.
            </span>
          </span>
        </label>
      )}

      {m.nature !== 'ecole' && (
        <label className="flex items-start gap-2 text-sm">
          <Switch
            checked={!!m.libre_weekend}
            disabled={desactive}
            onCheckedChange={(libre_weekend) => changer({ libre_weekend })}
            aria-label="Laisse le week-end libre"
            className="mt-0.5"
          />
          <span>
            Laisse le week-end libre
            <span className="block text-xs text-muted-foreground">
              Un week-end avec ce motif compte comme un week-end libre, comme un
              congé ou un repos. Pas une maladie ni une formation.
            </span>
          </span>
        </label>
      )}

      {m.nature === 'absence' && (
        <label className="flex items-start gap-2 text-sm">
          <Switch
            checked={!!m.reserve_forfait}
            disabled={desactive}
            onCheckedChange={(reserve_forfait) => changer({ reserve_forfait })}
            aria-label="Réservé au forfait jours"
            className="mt-0.5"
          />
          <span>
            Réservé au forfait jours
            <span className="block text-xs text-muted-foreground">
              Proposé seulement aux personnes au forfait jours.
            </span>
          </span>
        </label>
      )}

      {/* Rythme 5 jours puis 2 (décision de l'utilisateur du 2026-11-09) :
          une formation compte toujours comme du travail, même longue. Sans
          objet pour un motif qui n'est pas compté dans les heures (c'est un
          repos pour le rythme). */}
      {m.nature === 'absence' && m.decompte && (
        <label className="flex items-start gap-2 text-sm">
          <Switch
            checked={!!m.rythme_travail}
            disabled={desactive}
            onCheckedChange={(rythme_travail) => changer({ rythme_travail })}
            aria-label="Compte comme du travail pour le rythme"
            className="mt-0.5"
          />
          <span>
            Compte comme du travail pour le rythme
            <span className="block text-xs text-muted-foreground">
              Pour le rythme de 5 jours puis 2 repos, ces jours comptent
              toujours comme des jours de travail, même sur deux semaines. Comme
              une formation. Sinon, une absence de plus de 5 jours coupe le
              rythme.
            </span>
          </span>
        </label>
      )}

      {ROLES[m.nature].length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Rôle dans le planning</span>
          <Segmente
            etiquette="Rôle dans le planning"
            valeur={m.role ?? 'aucun'}
            options={ROLES[m.nature].map((r) => ({
              valeur: r.valeur,
              libelle: r.libelle,
              aide: r.texte,
            }))}
            disabled={desactive}
            onChange={(v) => changer({ role: v === 'aucun' ? null : v })}
          />
          <span className="text-xs text-muted-foreground">
            {ROLES[m.nature].find((r) => r.valeur === (m.role ?? 'aucun'))
              ?.texte ?? ''}{' '}
            {m.role ? 'Un seul motif a ce rôle : il passe à celui-ci.' : ''}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Icône</span>
        <ChoixIcone
          valeur={m.icone ?? null}
          devinee={iconeMotif({ code: m.code, nom: m.nom })}
          disabled={desactive}
          onChange={(icone) => changer({ icone })}
        />
      </div>

      <ErreursSaisie erreurs={modifiable ? erreurs : []} />

      <PiedCarte
        modifiable={modifiable}
        neuf={neuf}
        modifie={modifie}
        envoi={envoi}
        invalide={erreurs.length > 0}
        libelleCreer="Créer le motif"
        info={
          utilise
            ? `Utilisé par ${utilise} personne${utilise > 1 ? 's' : ''}`
            : joursConnus
              ? 'Non utilisé'
              : 'Absent des semaines types'
        }
        onSupprimer={() => setSuppression(true)}
        onAnnuler={() => (neuf ? onFin?.() : annuler())}
        onEnregistrer={() => void enregistrer()}
      />

      <ConfirmDialog
        open={suppression}
        onOpenChange={setSuppression}
        title={`Supprimer le motif ${enregistre.nom} ?`}
        description={`${
          !joursConnus
            ? 'Les jours posés avec ce motif sont retirés du planning'
            : usage.jours
              ? `${usage.jours} jour${usage.jours > 1 ? 's' : ''} d'absence posé${usage.jours > 1 ? 's' : ''} avec ce motif ${usage.jours > 1 ? 'seront effacés' : 'sera effacé'} du planning`
              : "Aucun jour d'absence n'est posé avec ce motif"
        }, et les semaines types qui l'utilisent repassent en libre. Impossible s'il figure dans un planning réalisé (semaine verrouillée).`}
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void supprimer()}
      />
    </CarteReglage>
  )
}

/** L'icône d'un motif (2026-11-06) : « Automatique » garde celle devinée
 * d'après le nom, sinon une des icônes de `ICONES_MOTIF`. */
function ChoixIcone({
  valeur,
  devinee: Devinee,
  disabled,
  onChange,
}: {
  valeur: string | null
  devinee: LucideIcon
  disabled: boolean
  onChange: (cle: string | null) => void
}) {
  const bouton = (cle: string | null, libelle: string, Icone: LucideIcon) => (
    <Tip key={cle ?? 'auto'} label={libelle}>
      <button
        type="button"
        role="radio"
        aria-checked={valeur === cle}
        aria-label={`Icône : ${libelle}`}
        disabled={disabled}
        onClick={() => onChange(cle)}
        className={cn(
          'flex size-8 items-center justify-center rounded-md border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
          valeur === cle
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
        )}
      >
        <Icone aria-hidden className="size-4" />
      </button>
    </Tip>
  )
  return (
    <div
      role="radiogroup"
      aria-label="Icône du motif"
      className="flex flex-wrap gap-1"
    >
      {bouton(null, "Automatique, d'après le nom", Devinee)}
      {ICONES_MOTIF.map((i) => bouton(i.cle, i.libelle, i.Icone))}
    </div>
  )
}

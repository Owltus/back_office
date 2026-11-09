/*
 * Fiche d'un membre du staff, en tiroir (Sheet) : ouverte depuis l'écran
 * Équipe et depuis la colonne staff du planning. CONTRAT partagé entre les
 * écrans : `salarieId` null = création. Port de `FicheSalarie`
 * (prototype `EquipePage.tsx`).
 *
 * Droits : tout le monde la lit ; seule la GESTION la modifie (la fiche est
 * du paramétrage, y compris ses absences, même si la base laisse l'écriture
 * poser une absence au planning).
 *
 * Absences : un jour par ligne en base. La fiche s'ouvre sur une lecture
 * FRAÎCHE, les montre en périodes et, à l'enregistrement, n'applique à la
 * base relue que les jours que la saisie a changés (`fusionnerAbsences`) :
 * un jour posé depuis le planning entre-temps est gardé. Les jours des
 * semaines verrouillées ne sont jamais réécrits (la base refuserait tout).
 */

import { estPrefere } from '#/lib/planning/niveaux.ts'
import { useId, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, X } from 'lucide-react'

import {
  useAujourdhui,
  useDroitsPlanning,
  useEcriture,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  brouillonDe,
  brouillonVierge,
  contratManuel,
  dateFr,
  diffAbsences,
  diffVide,
  enAlternance,
  erreurBrouillon,
  erreurEvolution,
  fusionnerAbsences,
  horsSemainesVerrouillees,
  joursDesPeriodes,
  joursEnBase,
  joursFusionnes,
  messageJoursGardes,
  nomBrouillon,
  planEvolution,
  valeursSalarie,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import type {
  Brouillon,
  DiffAbsences,
  Evolution,
  PlanEvolution,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import { CalendrierEcole } from '#/components/planning/parametres/equipe/CalendrierEcole.tsx'
import {
  dateShift,
  joursEcole,
  messageShiftsRetires,
} from '#/components/planning/parametres/equipe/ecole.ts'
import { SectionIdentite } from '#/components/planning/parametres/equipe/SectionIdentite.tsx'
import { useDepartFiche } from '#/components/planning/parametres/equipe/SommaireFiche.tsx'
import type { PartieFiche } from '#/lib/planning/coherence.ts'

/** Partie d'un lien (`cibleFiche`) → attribut data-partie de sa section. */
const PARTIES_FICHE: Record<PartieFiche, string> = {
  identite: 'Identité et contrat',
  ecole: 'École',
  postes: 'Compétences',
  horaires: 'Horaires autorisés',
  semaine: 'Semaine type',
  absences: 'Absences',
  regles: 'Règles HCR appliquées',
}
import {
  SectionAbsences,
  SectionCompetences,
  SectionHoraires,
  SectionRegles,
  SectionSemaineType,
} from '#/components/planning/parametres/equipe/SectionsFiche.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/planning/erreurs.ts'
import { planningKeys } from '#/lib/planning/keys.ts'
import {
  lireRegles,
  listeContrats,
  nomContrat,
} from '#/lib/planning/reglesEtablissement.ts'
import {
  estEcole,
  joursSautesReposFixes,
  phraseReposFixes,
} from '#/lib/planning/semaine.ts'
import {
  enregistrerSalarie,
  fetchAbsencesSalarie,
  fetchHistoriqueContrats,
  fetchShiftsSalarie,
  poserAbsences,
  supprimerSalarie,
} from '#/lib/planning/service.ts'
import type {
  Absence,
  Affectation,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'
import { chevauche, couvre, parcours } from '#/lib/planning/parcours.ts'
import type { TypeContrat } from '#/lib/planning/types.ts'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Liste } from '#/components/planning/parametres/equipe/Champs.tsx'
import { ajouterJours } from '#/lib/planning/temps.ts'
import { cn } from '#/lib/utils.ts'

/** Pose puis retire les jours qui changent (une transaction par appel). */
async function appliquerAbsences(
  salarieId: number,
  diff: DiffAbsences,
): Promise<void> {
  if (diff.retirer.length) await poserAbsences(salarieId, diff.retirer, null)
  for (const [motif, jours] of diff.poser)
    await poserAbsences(salarieId, jours, motif)
}

export function FicheSalarie({
  salarieId,
  ouvert,
  onFermer,
  groupeId,
  partie,
  onOuvrirContrat,
}: {
  salarieId: number | null
  ouvert: boolean
  onFermer: () => void
  /** Ouvre un autre contrat de la même personne (parcours, 2026-11-03).
   * Absent : la liste des contrats est montrée sans lien. */
  onOuvrirContrat?: (s: Salarie) => void
  /** Groupe proposé à la création (ajout depuis une catégorie). */
  groupeId?: number | null
  /** Partie où ouvrir la fiche (`PartieFiche` d'un lien), sinon le haut. */
  partie?: string
}) {
  const ref = useReferentiel()
  const absences = useQuery({
    queryKey: planningKeys.absences(salarieId ?? 0),
    queryFn: () => fetchAbsencesSalarie(salarieId as number),
    enabled: ouvert && salarieId !== null,
    // La fiche s'ouvre sur l'état du moment : le planning pose aussi des absences.
    staleTime: 0,
  })
  // Fermer en cours de saisie : la fiche demande d'abord (voir CorpsFiche).
  const demandeFermeture = useRef<() => void>(onFermer)
  demandeFermeture.current = onFermer

  const salarie =
    salarieId === null
      ? null
      : ref.data?.salaries.find((s) => s.id === salarieId)
  // Le corps ne s'ouvre que sur une lecture FRAÎCHE des absences (le cache
  // peut dater d'avant une absence posée au planning). Une fois ouvert, il le
  // reste : une relecture après une écriture ne le démonte pas.
  const [montee, setMontee] = useState<number | null>(null)
  const fraiche = absences.isSuccess && !absences.isFetching
  const pret =
    !!ref.data && (salarieId === null || montee === salarieId || fraiche)
  if (!ouvert && montee !== null) setMontee(null)
  else if (ouvert && pret && salarieId !== null && montee !== salarieId)
    setMontee(salarieId)

  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && demandeFermeture.current()}>
      <SheetContent
        showCloseButton={false}
        className="w-full gap-0 sm:max-w-2xl"
        aria-describedby={undefined}
      >
        {ref.data && pret && (salarieId === null || salarie) ? (
          <CorpsFiche
            key={salarieId ?? 'nouveau'}
            initial={
              salarie
                ? brouillonDe(salarie, absences.data ?? [])
                : brouillonVierge(groupeId ?? null, lireRegles(ref.data))
            }
            referentiel={ref.data}
            onFermer={onFermer}
            demandeFermeture={demandeFermeture}
            partie={partie}
            onOuvrirContrat={onOuvrirContrat}
          />
        ) : (
          <EtatFiche
            onFermer={onFermer}
            erreur={ref.isError || absences.isError}
            introuvable={!!ref.data && salarieId !== null && !salarie}
            onReessayer={() => {
              void ref.refetch()
              if (salarieId !== null) void absences.refetch()
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function EtatFiche({
  onFermer,
  erreur,
  introuvable,
  onReessayer,
}: {
  onFermer: () => void
  erreur: boolean
  introuvable: boolean
  onReessayer: () => void
}) {
  return (
    <>
      <SheetHeader className="flex-row items-start justify-between border-b">
        <SheetTitle>Fiche de la personne</SheetTitle>
        <BoutonFermer onFermer={onFermer} />
      </SheetHeader>
      <div className="flex flex-col gap-3 p-4">
        {introuvable ? (
          <p className="text-sm text-muted-foreground">
            Cette fiche n'existe plus.
          </p>
        ) : erreur ? (
          <>
            <p className="text-sm">La fiche n'a pas pu être lue.</p>
            <div>
              <Button variant="outline" size="sm" onClick={onReessayer}>
                Réessayer
              </Button>
            </div>
          </>
        ) : (
          <>
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        )}
      </div>
    </>
  )
}

function BoutonFermer({ onFermer }: { onFermer: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Fermer la fiche"
      onClick={onFermer}
    >
      <X />
    </Button>
  )
}

/** Comparaison de deux brouillons (les clés d'affichage ne comptent pas). */
function empreinte(b: Brouillon): string {
  return JSON.stringify([
    valeursSalarie(b),
    [...joursDesPeriodes(b.absences)].sort(),
    b.absences.map((p) => [p.debut, p.fin, p.motif_id]).sort(),
  ])
}

function CorpsFiche({
  initial,
  referentiel,
  onFermer,
  demandeFermeture,
  partie,
  onOuvrirContrat,
}: {
  initial: Brouillon
  referentiel: Referentiel
  onFermer: () => void
  demandeFermeture: RefObject<() => void>
  partie?: string
  onOuvrirContrat?: (s: Salarie) => void
}) {
  const droits = useDroitsPlanning()
  const gerer = droits.gerer
  const aujourdhui = useAujourdhui()
  const notifier = useNotifier()
  const ecrire = useEcriture()
  const qc = useQueryClient()
  const [b, setB] = useState<Brouillon>(initial)
  const [reference] = useState(() => empreinte(initial))
  // Jours d'absence à l'ouverture : seul l'écart entre eux et la saisie est
  // appliqué à la base relue.
  const [joursInitiaux] = useState(() => joursDesPeriodes(initial.absences))
  const [ecoleInitiale] = useState(() => {
    const motif = referentiel.motifs.find(estEcole)
    return motif ? joursEcole(initial.absences, motif.id) : new Set<string>()
  })
  // Ses shifts à venir : le calendrier d'école montre ceux qu'un jour
  // d'école retirerait.
  const shifts = useQuery({
    queryKey: planningKeys.shiftsSalarie(initial.id ?? 0),
    queryFn: () => fetchShiftsSalarie(initial.id as number, aujourdhui),
    enabled: initial.id !== null,
    staleTime: 0,
  })
  const [confirmerAbandon, setConfirmerAbandon] = useState(false)
  // Le contrat à supprimer (celui ouvert, ou un autre de la liste), ou null.
  const [aSupprimer, setASupprimer] = useState<number | null>(null)
  // Un enregistrement à la fois : un double clic ne crée pas deux fiches.
  const [enCours, setEnCours] = useState(false)
  const verrou = useRef(false)
  const uneFois = async <T,>(
    travail: () => Promise<T>,
  ): Promise<T | undefined> => {
    if (verrou.current) return undefined
    verrou.current = true
    setEnCours(true)
    try {
      return await travail()
    } finally {
      verrou.current = false
      setEnCours(false)
    }
  }

  const modifie = gerer && empreinte(b) !== reference
  demandeFermeture.current = () => {
    if (modifie) setConfirmerAbandon(true)
    else onFermer()
  }
  const maj = (f: (x: Brouillon) => Brouillon) => setB((x) => f(x))

  const ecole = referentiel.motifs.find(estEcole)
  const regles = lireRegles(referentiel)
  const alternance = enAlternance(b.type_contrat, regles)
  const groupe = referentiel.groupes.find((g) => g.id === b.groupe_id)
  const desactive = !gerer || enCours
  const erreur = erreurBrouillon(b, regles)

  /** Jours d'absence en base, relus maintenant (le planning a pu en poser). */
  const absencesEnBase = (id: number) =>
    qc.fetchQuery<Absence[]>({
      queryKey: planningKeys.absences(id),
      queryFn: () => fetchAbsencesSalarie(id),
      staleTime: 0,
    })
  /** Semaines verrouillées, d'après le référentiel relu par la dernière écriture. */
  const verrous = () =>
    qc.getQueryData<Referentiel>(planningKeys.referentiel())?.verrous ??
    referentiel.verrous
  /** Les jours d'absence voulus, sans ceux qui tombent sur un repos fixe
   * (R1, décision utilisateur du 2026-11-09 : la plage les saute, ils
   * restent des repos ; un jour déjà enregistré n'est pas touché). */
  const joursSaisis = () => {
    const jours = joursDesPeriodes(b.absences)
    const sautes = joursSautesReposFixes(
      jours,
      b.semaine_type,
      referentiel.motifs,
      joursInitiaux,
    )
    for (const d of sautes) jours.delete(d)
    return { jours, sautes }
  }

  // Les autres contrats de la personne (parcours, 2026-11-03).
  const autresContrats = () =>
    b.id === null
      ? []
      : (parcours(referentiel.salaries, aujourdhui).find((x) =>
          x.contrats.some((c) => c.id === b.id),
        )?.contrats ?? [])
  const recouvre = (c: Salarie) =>
    contratManuel(c.type_contrat, regles) && !c.date_sortie
      ? `Ces dates recouvrent son contrat ${nomContrat(regles, c.type_contrat)} ${periodeContrat(c)}, qui n'a pas de fin : désactivez-le dans sa fiche (« Inactif »), puis recommencez.`
      : `Ces dates recouvrent son contrat ${periodeContrat(c)} : une personne n'a qu'un contrat à la fois. Changez d'abord les dates de l'un des deux.`

  // Ce que chaque contrat a servi : seul un contrat jamais servi se
  // supprime (bonne pratique RH, la base le refuse aussi).
  const idsContrats = b.id === null ? [] : autresContrats().map((c) => c.id)
  const historique = useQuery({
    queryKey: planningKeys.historique(
      idsContrats.length ? idsContrats : [b.id ?? 0],
    ),
    queryFn: () =>
      fetchHistoriqueContrats(
        idsContrats.length ? idsContrats : [b.id as number],
      ),
    enabled: b.id !== null,
    staleTime: 0,
  })
  /** Vrai : jamais servi ; faux : un historique ; undefined : pas encore lu. */
  const vierge = (id: number): boolean | undefined =>
    historique.data ? (historique.data[id] ?? 0) === 0 : undefined

  /** « CDD du 01/07/2026 au 31/08/2026 » : le contrat visé par la suppression. */
  const cibleSuppression = () => {
    const c = autresContrats().find((x) => x.id === aSupprimer)
    if (!c) return ''
    return `${nomContrat(regles, c.type_contrat)} ${periodeContrat(c)}`
  }

  const enregistrer = () =>
    uneFois(async () => {
      if (!gerer) return
      if (erreur) {
        notifier(erreur, 'attention')
        return
      }
      const pris = chevauche(autresContrats(), b)
      if (pris) {
        notifier(recouvre(pris), 'attention')
        return
      }
      let id = b.id
      const r = await ecrire(async () => {
        id = await enregistrerSalarie(valeursSalarie(b), b.id)
      }, "La fiche n'a pas pu être enregistrée")
      if (!r.ok || id === null) {
        notifier(r.message ?? "La fiche n'a pas pu être enregistrée.", 'danger')
        return
      }
      const idFiche = id
      // Créée : un nouvel essai ne doit pas en créer une seconde.
      setB((x) => ({ ...x, id: idFiche }))
      let gardes = 0
      let retires: Affectation[] = []
      const saisie = joursSaisis()
      const r2 = await ecrire(async () => {
        const base = b.id === null ? [] : await absencesEnBase(idFiche)
        const { diff, gardes: jours } = horsSemainesVerrouillees(
          fusionnerAbsences(joursEnBase(base), joursInitiaux, saisie.jours),
          verrous(),
        )
        gardes = jours.length
        if (diffVide(diff)) return
        // Un jour d'absence posé retire le shift du jour (trigger) : relus
        // juste avant, pour le dire.
        const poses = new Set([...diff.poser.values()].flat())
        if (b.id !== null && poses.size) {
          const depuis = [...poses].sort()[0]
          const avant = await fetchShiftsSalarie(idFiche, depuis)
          retires = avant.filter((s) => poses.has(dateShift(s)))
        }
        await appliquerAbsences(idFiche, diff)
      }, "Fiche enregistrée, mais ses absences n'ont pas pu l'être")
      if (!r2.ok) {
        notifier(r2.message, 'danger')
        return
      }
      const repos = phraseReposFixes(saisie.sautes)
      if (gardes || retires.length || repos)
        notifier(
          `Fiche enregistrée.${repos ? ` ${repos}` : ''}${messageJoursGardes(gardes)}${messageShiftsRetires(retires)}`,
          'attention',
        )
      else notifier('Fiche enregistrée')
      onFermer()
    })

  const supprimer = (id: number) =>
    uneFois(async () => {
      if (!gerer || b.id === null) return
      const prenom = initial.prenom || 'Cette personne'
      const r = await ecrire(
        () => supprimerSalarie(id),
        `${prenom} n'a pas pu être retiré(e) de l'équipe`,
      )
      if (!r.ok) {
        notifier(r.message, 'attention')
        return
      }
      // Un AUTRE contrat que celui ouvert : la fiche reste où elle est.
      if (id !== b.id) {
        notifier('Contrat supprimé')
        return
      }
      // Un autre contrat de la personne reste : on l'ouvre.
      const avant = autresContrats()
      const supprime = avant.find((c) => c.id === id)
      // Comme la base : ce qui suivait le contrat supprimé suit ce qui le
      // précédait (sinon le plus ancien de ses suivants).
      const reste = avant
        .filter((c) => c.id !== id)
        .map((c) =>
          c.suite_de === id
            ? { ...c, suite_de: supprime?.suite_de ?? null }
            : c,
        )
      if (reste.length && onOuvrirContrat) {
        notifier('Contrat supprimé')
        const enCours =
          reste.find((c) => couvre(c, aujourdhui)) ??
          reste.find((c) => !!c.date_entree && c.date_entree > aujourdhui) ??
          (reste.at(-1) as Salarie)
        onOuvrirContrat(enCours)
        return
      }
      notifier(`${prenom} a été retiré(e) de l'équipe`)
      onFermer()
    })

  /** Ajoute un contrat à la personne, à n'importe quelles dates (2026-11-03) :
   * mêmes postes, groupe et semaine type que la fiche ouverte, relié à elle. */
  const ajouterContrat = async (v: NouveauContrat): Promise<boolean> =>
    (await uneFois(async () => {
      const enregistre = referentiel.salaries.find((s) => s.id === b.id)
      if (!gerer || !enregistre) return false
      if (modifie) {
        notifier(
          'Enregistrez ou annulez vos modifications avant d’ajouter un contrat.',
          'attention',
        )
        return false
      }
      const nouveau: Brouillon = {
        ...brouillonDe(enregistre, []),
        id: null,
        type_contrat: v.type,
        heures_hebdo: contratManuel(v.type, regles) ? 0 : v.heures,
        forfait_jours: contratManuel(v.type, regles)
          ? false
          : enregistre.forfait_jours,
        date_entree: v.debut || null,
        date_sortie: v.fin || null,
        actif: true,
        suite_de: enregistre.id,
      }
      const err = erreurBrouillon(nouveau, regles)
      if (err) {
        notifier(err, 'attention')
        return false
      }
      // Un extra embauché (bonne pratique RH) : son contrat placé à la
      // main, sans fin, s'arrête la veille du nouveau contrat ; il reste au
      // parcours.
      let extra: Salarie | null = null
      let contrats = autresContrats()
      const premier = chevauche(contrats, nouveau)
      if (
        premier &&
        contratManuel(premier.type_contrat, regles) &&
        !premier.date_sortie &&
        nouveau.date_entree &&
        (!premier.date_entree || premier.date_entree < nouveau.date_entree)
      ) {
        extra = {
          ...premier,
          date_sortie: ajouterJours(nouveau.date_entree, -1),
        }
        contrats = contrats.map((c) =>
          c.id === premier.id ? (extra as Salarie) : c,
        )
      }
      const pris = chevauche(contrats, nouveau)
      if (pris) {
        notifier(recouvre(pris), 'attention')
        return false
      }
      let nouvelId: number | null = null
      const r = await ecrire(async () => {
        if (extra)
          await enregistrerSalarie(
            valeursSalarie(brouillonDe(extra, [])),
            extra.id,
          )
        nouvelId = await enregistrerSalarie(valeursSalarie(nouveau), null)
      }, "Le contrat n'a pas pu être ajouté")
      if (!r.ok || nouvelId === null) {
        notifier(r.message ?? "Le contrat n'a pas pu être ajouté.", 'danger')
        return false
      }
      notifier(
        extra?.date_sortie
          ? `Contrat ajouté. Son contrat d'extra s'arrête le ${dateFr(extra.date_sortie)}.`
          : 'Contrat ajouté : réglez-le dans sa fiche si besoin',
      )
      onOuvrirContrat?.({
        ...enregistre,
        ...valeursSalarie(nouveau),
        id: nouvelId,
      })
      return true
    })) ?? false

  const evoluer = async (e: Evolution): Promise<boolean> =>
    (await uneFois(async () => {
      if (!gerer || b.id === null) return false
      const err = erreurEvolution(b, e, regles)
      if (err) {
        notifier(err, 'attention')
        return false
      }
      // Le nouveau contrat ne recouvre aucun AUTRE contrat de la personne
      // (relecture du 2026-11-03 : un contrat suivant déjà prévu).
      const sansFin = !(b.date_sortie && b.date_sortie >= e.date)
      const pris = chevauche(
        autresContrats().filter((c) => c.id !== b.id),
        {
          id: null,
          date_entree: e.date,
          date_sortie: sansFin ? null : b.date_sortie,
        },
      )
      if (pris) {
        notifier(recouvre(pris), 'attention')
        return false
      }
      const id = b.id
      // Le contrat tel qu'enregistré (pas la saisie) : c'est lui qu'on rétablit.
      const enregistre = referentiel.salaries.find((s) => s.id === id)
      const fini = async () => {
        await qc.invalidateQueries({ queryKey: planningKeys.all })
      }
      let base: Absence[]
      let plan: PlanEvolution
      try {
        base = await absencesEnBase(id)
        // Les jours à répartir : la base relue, avec les changements saisis.
        plan = planEvolution(
          { ...b, id },
          e,
          referentiel.postes,
          referentiel.groupes,
          referentiel.motifs,
          joursFusionnes(joursEnBase(base), joursInitiaux, joursSaisis().jours),
          regles,
        )
        await enregistrerSalarie(plan.ancien, id)
      } catch (x) {
        notifier(messageErreur(x, "L'évolution du contrat a échoué"), 'danger')
        await fini()
        return false
      }
      let nouveauId: number
      try {
        nouveauId = await enregistrerSalarie(plan.nouveau, null)
      } catch (x) {
        // L'ancien contrat est déjà fermé : on le rouvre tel qu'il était.
        const raison = messageErreur(x, 'Création refusée')
        try {
          await enregistrerSalarie(
            valeursSalarie(enregistre ? brouillonDe(enregistre, []) : initial),
            id,
          )
          notifier(
            `Le nouveau contrat n'a pas pu être créé ; le contrat actuel est rétabli tel quel. ${raison}`,
            'danger',
          )
        } catch {
          notifier(
            `Le nouveau contrat n'a pas pu être créé, et le contrat actuel est resté fermé au ${dateFr(plan.finAncien)} : remettez sa fin de contrat à la main. ${raison}`,
            'danger',
          )
        }
        await fini()
        return false
      }
      // D'abord posées sur le nouveau contrat, puis seulement retirées de
      // l'ancien : un échec en route ne perd aucun jour. Les jours des
      // semaines verrouillées restent où ils sont.
      const nouveau = horsSemainesVerrouillees(
        diffAbsences(new Map(), plan.joursNouveau),
        verrous(),
      )
      const ancien = horsSemainesVerrouillees(
        diffAbsences(joursEnBase(base), plan.joursAncien),
        verrous(),
      )
      const echec = async (x: unknown, action: string) => {
        notifier(messageErreur(x, action), 'danger')
        await fini()
        onFermer()
        return true
      }
      try {
        if (!diffVide(nouveau.diff))
          await appliquerAbsences(nouveauId, nouveau.diff)
      } catch (x) {
        return echec(
          x,
          "Nouveau contrat créé, mais ses absences à venir n'ont pas pu être reprises : elles restent sur le contrat actuel",
        )
      }
      try {
        if (!diffVide(ancien.diff)) await appliquerAbsences(id, ancien.diff)
      } catch (x) {
        return echec(
          x,
          "Nouveau contrat créé avec ses absences à venir, mais elles n'ont pas pu être retirées du contrat actuel",
        )
      }
      await fini()
      const gardes = new Set([...nouveau.gardes, ...ancien.gardes]).size
      notifier(
        `${b.prenom.trim()} : changement prévu à partir du ${dateFr(e.date)}. Sa nouvelle fiche est dans l'équipe, vous pouvez encore la régler${gardes ? `.${messageJoursGardes(gardes)}` : '.'}`,
        gardes ? 'attention' : 'info',
      )
      onFermer()
      return true
    })) ?? false

  const zone = useRef<HTMLDivElement>(null)
  useDepartFiche(
    zone,
    partie ? PARTIES_FICHE[partie as PartieFiche] : undefined,
  )
  const titre =
    b.id !== null
      ? nomBrouillon(initial) || 'Fiche de la personne'
      : 'Nouveau membre'
  const proprietes = { b, maj, referentiel, disabled: desactive }

  return (
    <>
      <SheetHeader className="flex-row items-start justify-between gap-3 border-b">
        <div className="flex min-w-0 flex-col gap-1">
          <SheetTitle className="truncate">{titre}</SheetTitle>
          <SheetDescription>
            {groupe?.nom ?? 'Fiche de la personne'}
            {!gerer && (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                Lecture seule
              </span>
            )}
          </SheetDescription>
        </div>
        <BoutonFermer onFermer={() => demandeFermeture.current()} />
      </SheetHeader>

      <div
        ref={zone}
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 [scrollbar-gutter:stable]"
      >
        {b.id !== null && (
          <ParcoursContrats
            id={b.id}
            referentiel={referentiel}
            aujourdhui={aujourdhui}
            gerer={gerer}
            occupe={enCours}
            onAjouter={ajouterContrat}
            onSupprimer={(s) => setASupprimer(s.id)}
            vierge={vierge}
            onOuvrir={
              onOuvrirContrat &&
              ((s) =>
                modifie
                  ? notifier(
                      'Enregistrez ou annulez vos modifications avant d’ouvrir un autre contrat.',
                      'attention',
                    )
                  : onOuvrirContrat(s))
            }
          />
        )}
        <SectionIdentite
          {...proprietes}
          aujourdhui={aujourdhui}
          enCours={enCours}
          onEvoluer={evoluer}
        />
        {alternance && ecole && (
          <CalendrierEcole
            ecole={ecole}
            absences={b.absences}
            semaineType={b.semaine_type}
            aujourdhui={aujourdhui}
            disabled={desactive}
            verrous={referentiel.verrous}
            joursAvant={ecoleInitiale}
            shifts={shifts.data ?? []}
            postes={referentiel.postes}
            onAbsences={(absences) => maj((x) => ({ ...x, absences }))}
            onSemaineType={(semaine_type) =>
              maj((x) => ({ ...x, semaine_type }))
            }
          />
        )}
        {alternance && !ecole && (
          <p className="text-xs text-muted-foreground">
            Créez un motif de nature École dans Horaires et absences pour saisir
            son calendrier d'école.
          </p>
        )}
        <SectionCompetences {...proprietes} />
        <SectionHoraires {...proprietes} />
        <SectionSemaineType {...proprietes} />
        <SectionAbsences
          {...proprietes}
          aujourdhui={aujourdhui}
          masquerMotif={alternance && ecole ? ecole.id : null}
        />
        <SectionRegles b={b} referentiel={referentiel} />
      </div>

      <SheetFooter className="flex-row items-center justify-end gap-2 border-t">
        {/* Bonne pratique RH : on ne supprime pas quelqu'un qui a travaillé
            (son départ est une fin de contrat) ; seule une fiche créée par
            erreur, jamais servie, s'efface. Un contrat se supprime depuis
            la liste « Contrats ». */}
        {gerer &&
          b.id !== null &&
          autresContrats().length <= 1 &&
          vierge(b.id) === true && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-destructive hover:text-destructive"
              disabled={enCours}
              onClick={() => setASupprimer(b.id)}
            >
              <Trash2 /> Supprimer la fiche créée par erreur
            </Button>
          )}
        {gerer && erreur && b.prenom.trim() !== '' && (
          <span className="mr-auto text-xs text-amber-500">{erreur}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => demandeFermeture.current()}
        >
          {gerer ? 'Annuler' : 'Fermer'}
        </Button>
        {gerer ? (
          <Button
            size="sm"
            disabled={!b.prenom.trim() || enCours}
            onClick={() => void enregistrer()}
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        ) : (
          <Tip label="Lecture seule : seule la gestion du planning modifie les fiches">
            <span tabIndex={0}>
              <Button size="sm" disabled>
                Enregistrer
              </Button>
            </span>
          </Tip>
        )}
      </SheetFooter>

      <ConfirmDialog
        open={confirmerAbandon}
        onOpenChange={setConfirmerAbandon}
        title="Abandonner les modifications ?"
        description="Les changements de cette fiche ne seront pas enregistrés."
        confirmLabel="Abandonner"
        cancelLabel="Continuer la saisie"
        destructive
        onConfirm={onFermer}
      />
      <ConfirmDialog
        open={aSupprimer !== null}
        onOpenChange={(o) => !o && setASupprimer(null)}
        title={
          autresContrats().length > 1
            ? `Supprimer le contrat ${cibleSuppression()} ?`
            : `Effacer la fiche de ${nomBrouillon(initial) || 'cette personne'} ?`
        }
        description={
          autresContrats().length > 1
            ? "Ce contrat n'a jamais servi : il est effacé. La personne et ses autres contrats restent, toujours reliés."
            : "Cette fiche n'a jamais servi (aucun shift, aucune absence) : elle est effacée. Pour quelqu'un qui part, on indique sa fin de contrat."
        }
        confirmLabel={
          autresContrats().length > 1
            ? 'Supprimer le contrat'
            : 'Supprimer la fiche'
        }
        destructive
        onConfirm={() => aSupprimer !== null && void supprimer(aSupprimer)}
      />
    </>
  )
}

/** « du 01/07 au 31/08 », « depuis le … », « jusqu'au … ». */
function periodeContrat(s: Pick<Salarie, 'date_entree' | 'date_sortie'>) {
  return s.date_entree && s.date_sortie
    ? `du ${dateFr(s.date_entree)} au ${dateFr(s.date_sortie)}`
    : s.date_entree
      ? `depuis le ${dateFr(s.date_entree)}`
      : s.date_sortie
        ? `jusqu’au ${dateFr(s.date_sortie)}`
        : 'sans dates'
}

interface NouveauContrat {
  type: TypeContrat
  debut: string
  fin: string
  heures: number
}

/** Les contrats successifs de la personne (parcours RH, 2026-11-03) : du
 * plus ancien au plus récent, celui ouvert marqué ; un clic ouvre un autre
 * contrat ; la gestion en ajoute un à n'importe quelles dates (un contrat
 * se modifie dans sa fiche, et se supprime par « Supprimer »). Rien pour
 * un contrat seul en lecture. */
function ParcoursContrats({
  id,
  referentiel,
  aujourdhui,
  gerer,
  occupe,
  onAjouter,
  onSupprimer,
  vierge,
  onOuvrir,
}: {
  id: number
  referentiel: Referentiel
  aujourdhui: string
  gerer: boolean
  /** Une écriture en cours : les boutons attendent, la liste reste. */
  occupe: boolean
  onAjouter: (v: NouveauContrat) => Promise<boolean>
  /** Supprimer CE contrat (confirmé ensuite), jamais la personne entière. */
  onSupprimer: (s: Salarie) => void
  /** Le contrat n'a jamais servi (seul cas où il se supprime). */
  vierge: (id: number) => boolean | undefined
  onOuvrir?: (s: Salarie) => void
}) {
  const [ajout, setAjout] = useState<NouveauContrat | null>(null)
  const idChamp = useId()
  const p = parcours(referentiel.salaries, aujourdhui).find((x) =>
    x.contrats.some((c) => c.id === id),
  )
  if (!p || (p.contrats.length < 2 && !gerer)) return null
  const regles = lireRegles(referentiel)
  const libelle = (s: Salarie) => nomContrat(regles, s.type_contrat)
  const periode = periodeContrat
  const poste = (s: Salarie) => {
    const c =
      s.competences.find((x) => estPrefere(regles.niveaux, x.niveau)) ??
      s.competences.at(0)
    return referentiel.postes.find((x) => x.id === c?.poste_id)?.nom
  }
  return (
    <section aria-label="Contrats" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        Contrats{' '}
        <span className="text-xs font-normal text-muted-foreground">
          {p.contrats.length}
        </span>
      </h3>
      <ol className="flex flex-col overflow-hidden rounded-lg border">
        {p.contrats.map((s) => {
          const ici = s.id === id
          const contenu = (
            <>
              <span className="font-medium">{libelle(s)}</span>
              <span className="text-muted-foreground">{periode(s)}</span>
              {poste(s) && (
                <span className="truncate text-muted-foreground">
                  · {poste(s)}
                </span>
              )}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {ici
                  ? 'Ce contrat'
                  : couvre(s, aujourdhui)
                    ? 'En cours'
                    : s.date_entree && s.date_entree > aujourdhui
                      ? 'À venir'
                      : 'Terminé'}
              </span>
            </>
          )
          return (
            <li
              key={s.id}
              className="flex items-center border-b last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                {ici || !onOuvrir ? (
                  <div
                    aria-current={ici || undefined}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm',
                      ici && 'bg-primary/5',
                    )}
                  >
                    {contenu}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOuvrir(s)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
                  >
                    {contenu}
                  </button>
                )}
              </div>
              {gerer && p.contrats.length > 1 && (
                <Tip
                  label={
                    vierge(s.id) === false
                      ? 'Ce contrat a un historique : on ne le supprime pas. Changez plutôt ses dates.'
                      : 'Supprimer ce contrat créé par erreur'
                  }
                >
                  <span tabIndex={vierge(s.id) === true ? -1 : 0}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="mr-1 text-muted-foreground hover:text-destructive"
                      aria-label={`Supprimer le contrat ${libelle(s)} ${periode(s)}`}
                      disabled={occupe || vierge(s.id) !== true}
                      onClick={() => onSupprimer(s)}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </Tip>
              )}
            </li>
          )
        })}
      </ol>
      {gerer && !ajout && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={occupe}
            onClick={() =>
              setAjout({
                type: p.courant.type_contrat,
                debut: '',
                fin: '',
                heures: p.courant.heures_hebdo || 35,
              })
            }
          >
            Ajouter un contrat
          </Button>
        </div>
      )}
      {gerer && ajout && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <strong className="text-sm">Nouveau contrat</strong>
          <p className="text-xs text-muted-foreground">
            À n'importe quelles dates : avant, entre ou après ses autres
            contrats, sans les recouvrir. Il reprend les postes, le groupe et la
            semaine type de ce contrat ; tout se règle ensuite dans sa fiche.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Liste
              label="Type de contrat"
              valeur={ajout.type}
              options={listeContrats(regles).map((m) => ({
                valeur: m.code,
                libelle: m.nom,
              }))}
              onChange={(v) => setAjout({ ...ajout, type: v as TypeContrat })}
            />
            {!contratManuel(ajout.type, regles) && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${idChamp}-h`} className="text-xs">
                  Heures par semaine
                </Label>
                <Input
                  id={`${idChamp}-h`}
                  type="number"
                  min={1}
                  max={48}
                  step={0.5}
                  value={ajout.heures}
                  onChange={(e) =>
                    setAjout({ ...ajout, heures: Number(e.target.value) })
                  }
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idChamp}-d`} className="text-xs">
                Début
              </Label>
              <Input
                id={`${idChamp}-d`}
                type="date"
                value={ajout.debut}
                onChange={(e) => setAjout({ ...ajout, debut: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idChamp}-f`} className="text-xs">
                Fin (vide : sans fin)
              </Label>
              <Input
                id={`${idChamp}-f`}
                type="date"
                min={ajout.debut || undefined}
                value={ajout.fin}
                onChange={(e) => setAjout({ ...ajout, fin: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAjout(null)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!ajout.debut || occupe}
              onClick={async () => {
                if (await onAjouter(ajout)) setAjout(null)
              }}
            >
              Ajouter le contrat
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

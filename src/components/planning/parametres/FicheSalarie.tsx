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

import { useRef, useState } from 'react'
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
import { SommaireFiche } from '#/components/planning/parametres/equipe/SommaireFiche.tsx'
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
import { estEcole } from '#/lib/planning/semaine.ts'
import {
  enregistrerSalarie,
  fetchAbsencesSalarie,
  fetchShiftsSalarie,
  poserAbsences,
  supprimerSalarie,
} from '#/lib/planning/service.ts'
import type { Absence, Affectation, Referentiel } from '#/lib/planning/types.ts'

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
}: {
  salarieId: number | null
  ouvert: boolean
  onFermer: () => void
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
                : brouillonVierge(groupeId ?? null)
            }
            referentiel={ref.data}
            onFermer={onFermer}
            demandeFermeture={demandeFermeture}
            partie={partie}
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
}: {
  initial: Brouillon
  referentiel: Referentiel
  onFermer: () => void
  demandeFermeture: RefObject<() => void>
  partie?: string
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
  const [confirmerSuppression, setConfirmerSuppression] = useState(false)
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
  const alternance = enAlternance(b.type_contrat)
  const groupe = referentiel.groupes.find((g) => g.id === b.groupe_id)
  const desactive = !gerer || enCours
  const erreur = erreurBrouillon(b)

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

  const enregistrer = () =>
    uneFois(async () => {
      if (!gerer) return
      if (erreur) {
        notifier(erreur, 'attention')
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
      const r2 = await ecrire(async () => {
        const base = b.id === null ? [] : await absencesEnBase(idFiche)
        const { diff, gardes: jours } = horsSemainesVerrouillees(
          fusionnerAbsences(
            joursEnBase(base),
            joursInitiaux,
            joursDesPeriodes(b.absences),
          ),
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
      if (gardes || retires.length)
        notifier(
          `Fiche enregistrée.${messageJoursGardes(gardes)}${messageShiftsRetires(retires)}`,
          'attention',
        )
      else notifier('Fiche enregistrée')
      onFermer()
    })

  const supprimer = () =>
    uneFois(async () => {
      if (!gerer || b.id === null) return
      const id = b.id
      const prenom = initial.prenom || 'Cette personne'
      const r = await ecrire(
        () => supprimerSalarie(id),
        `${prenom} n'a pas pu être retiré(e) de l'équipe`,
      )
      if (!r.ok) {
        notifier(r.message, 'attention')
        return
      }
      notifier(`${prenom} a été retiré(e) de l'équipe`)
      onFermer()
    })

  const evoluer = async (e: Evolution): Promise<boolean> =>
    (await uneFois(async () => {
      if (!gerer || b.id === null) return false
      const err = erreurEvolution(b, e)
      if (err) {
        notifier(err, 'attention')
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
          joursFusionnes(
            joursEnBase(base),
            joursInitiaux,
            joursDesPeriodes(b.absences),
          ),
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
        `${b.prenom.trim()} : nouveau contrat à partir du ${dateFr(e.date)}${gardes ? `.${messageJoursGardes(gardes)}` : ''}`,
        gardes ? 'attention' : 'info',
      )
      onFermer()
      return true
    })) ?? false

  const zone = useRef<HTMLDivElement>(null)
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
        <SommaireFiche
          zone={zone}
          depart={partie ? PARTIES_FICHE[partie as PartieFiche] : undefined}
          parties={[
            { libelle: 'Identité', partie: PARTIES_FICHE.identite },
            ...(alternance && ecole
              ? [{ libelle: 'École', partie: PARTIES_FICHE.ecole }]
              : []),
            { libelle: 'Postes', partie: PARTIES_FICHE.postes },
            { libelle: 'Horaires', partie: PARTIES_FICHE.horaires },
            { libelle: 'Semaine type', partie: PARTIES_FICHE.semaine },
            { libelle: 'Absences', partie: PARTIES_FICHE.absences },
            { libelle: 'Règles', partie: PARTIES_FICHE.regles },
          ]}
        />
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
        <SectionRegles b={b} />
      </div>

      <SheetFooter className="flex-row items-center justify-end gap-2 border-t">
        {gerer && b.id !== null && (
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto text-destructive hover:text-destructive"
            disabled={enCours}
            onClick={() => setConfirmerSuppression(true)}
          >
            <Trash2 /> Supprimer
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
        open={confirmerSuppression}
        onOpenChange={setConfirmerSuppression}
        title={`Retirer ${nomBrouillon(initial) || 'cette personne'} de l'équipe ?`}
        description="Sa fiche, ses shifts et ses absences sont supprimés. Pour quelqu'un qui part, indiquez plutôt sa fin de contrat : son historique reste."
        confirmLabel="Supprimer la fiche"
        destructive
        onConfirm={() => void supprimer()}
      />
    </>
  )
}

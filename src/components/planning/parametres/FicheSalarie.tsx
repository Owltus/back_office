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
 * Absences : un jour par ligne en base. La fiche les montre en périodes et,
 * à l'enregistrement, ne pose ou ne retire que les jours qui changent, lus
 * à nouveau juste avant (`diffAbsences`).
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
  joursDesPeriodes,
  joursEnBase,
  nomBrouillon,
  planEvolution,
  valeursSalarie,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import type {
  Brouillon,
  DiffAbsences,
  Evolution,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import { CalendrierEcole } from '#/components/planning/parametres/equipe/CalendrierEcole.tsx'
import { SectionIdentite } from '#/components/planning/parametres/equipe/SectionIdentite.tsx'
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
  poserAbsences,
  supprimerSalarie,
} from '#/lib/planning/service.ts'
import type { Absence, Referentiel } from '#/lib/planning/types.ts'

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
}: {
  salarieId: number | null
  ouvert: boolean
  onFermer: () => void
  /** Groupe proposé à la création (ajout depuis une catégorie). */
  groupeId?: number | null
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
  const pret = !!ref.data && (salarieId === null || absences.isSuccess)

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
        <SheetTitle>Fiche du staff</SheetTitle>
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
}: {
  initial: Brouillon
  referentiel: Referentiel
  onFermer: () => void
  demandeFermeture: RefObject<() => void>
}) {
  const droits = useDroitsPlanning()
  const gerer = droits.gerer
  const aujourdhui = useAujourdhui()
  const notifier = useNotifier()
  const ecrire = useEcriture()
  const qc = useQueryClient()
  const [b, setB] = useState<Brouillon>(initial)
  const [reference] = useState(() => empreinte(initial))
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
      const r2 = await ecrire(async () => {
        const base = b.id === null ? [] : await absencesEnBase(idFiche)
        const diff = diffAbsences(
          joursEnBase(base),
          joursDesPeriodes(b.absences),
        )
        if (!diffVide(diff)) await appliquerAbsences(idFiche, diff)
      }, "Fiche enregistrée, mais ses absences n'ont pas pu l'être")
      if (!r2.ok) {
        notifier(r2.message, 'danger')
        return
      }
      notifier('Fiche enregistrée')
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
      const plan = planEvolution(
        { ...b, id },
        e,
        referentiel.postes,
        referentiel.groupes,
        referentiel.motifs,
      )
      const fini = async () => {
        await qc.invalidateQueries({ queryKey: planningKeys.all })
      }
      let base: Absence[]
      try {
        base = await absencesEnBase(id)
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
          await enregistrerSalarie(valeursSalarie(b), id)
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
      try {
        const ancien = diffAbsences(joursEnBase(base), plan.joursAncien)
        if (!diffVide(ancien)) await appliquerAbsences(id, ancien)
        const nouveau = diffAbsences(new Map(), plan.joursNouveau)
        if (!diffVide(nouveau)) await appliquerAbsences(nouveauId, nouveau)
      } catch (x) {
        notifier(
          messageErreur(
            x,
            "Nouveau contrat créé, mais ses absences à venir n'ont pas pu être reprises",
          ),
          'danger',
        )
        await fini()
        onFermer()
        return true
      }
      await fini()
      notifier(
        `${b.prenom.trim()} : nouveau contrat à partir du ${dateFr(e.date)}`,
      )
      onFermer()
      return true
    })) ?? false

  const titre =
    b.id !== null ? nomBrouillon(initial) || 'Fiche du staff' : 'Nouveau membre'
  const proprietes = { b, maj, referentiel, disabled: desactive }

  return (
    <>
      <SheetHeader className="flex-row items-start justify-between gap-3 border-b">
        <div className="flex min-w-0 flex-col gap-1">
          <SheetTitle className="truncate">{titre}</SheetTitle>
          <SheetDescription>
            {groupe?.nom ?? 'Fiche du staff'}
            {!gerer && (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                Lecture seule
              </span>
            )}
          </SheetDescription>
        </div>
        <BoutonFermer onFermer={() => demandeFermeture.current()} />
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
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

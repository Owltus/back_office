/*
 * Vue mois du planning (prototype `pages/planning/VueMois.tsx`, spec §3).
 * Vue d'ensemble de toutes les semaines qui couvrent le mois, retouchable :
 * clic sur un jour pour l'horaire, la validation et la journée étoile (le
 * poste, une absence ou l'école se règlent dans la semaine), glisser pour
 * déplacer, et les actions du mois (compléter, valider, effacer, cadenas).
 *
 * Périmètres (anomalie 9 de la spec) : grille et compteur de validation =
 * jours du mois ; jauge, bouclier, points d'attention et actions = semaines
 * ENTIÈRES. Les actions ne touchent que les semaines OUVERTES (ni passées,
 * ni verrouillées, ni avant le dernier planning réalisé) ; libellés et menu
 * le disent.
 *
 * Droits : lecture = tout voir, un clic ouvre la semaine ; écriture = faire
 * le planning ; gestion = en plus, le cadenas du mois.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

import { useNotifier } from '#/components/planning/Messages.tsx'
import { FicheSalarie } from '#/components/planning/parametres/FicheSalarie.tsx'
import {
  donneesSemaine,
  useAujourdhui,
  useDroitsPlanning,
  useEcriture,
  useGenerer,
  useOccupation,
} from '#/components/planning/hooks/usePlanning.ts'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Button } from '#/components/ui/button.tsx'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { dateCourte, numeroSemaine } from '#/lib/planning/affichage.ts'
import { messageErreur } from '#/lib/planning/erreurs.ts'
import { planningKeys } from '#/lib/planning/keys.ts'
import { analyser } from '#/lib/planning/semaine.ts'
import type { SemaineOut, ShiftOut } from '#/lib/planning/semaine.ts'
import {
  ajouterShift,
  deplacerStatut,
  modifierShift,
  supprimerShift,
  valider,
  verrouiller,
  vider,
} from '#/lib/planning/service.ts'
import type { DonneesShifts, ShiftSaisi } from '#/lib/planning/service.ts'
import type { Horaire, Referentiel } from '#/lib/planning/types.ts'
import { BarreMois } from '#/components/planning/mois/BarreMois.tsx'
import type { ActionMois } from '#/components/planning/mois/BarreMois.tsx'
import {
  GrilleMois,
  dateLongue,
} from '#/components/planning/mois/GrilleMois.tsx'
import type { Depot } from '#/components/planning/mois/GrilleMois.tsx'
import { MenuJour } from '#/components/planning/mois/MenuJour.tsx'
import type { OuvertureMenu } from '#/components/planning/mois/MenuJour.tsx'
import {
  caseDe,
  compter,
  dansLesOuvertes,
  etatSemaine,
  listeSemaines,
  moisDecale,
  pluriel,
  presentsDuMois,
  reperer,
} from '#/components/planning/mois/mois.ts'
import type { EtatSemaine } from '#/components/planning/mois/mois.ts'
import { PanneauAlertesMois } from '#/components/planning/mois/PanneauAlertesMois.tsx'
import {
  etoileProposee,
  poserHoraire as poserHoraireCase,
} from '#/components/planning/semaine/edition.ts'
import {
  useMois,
  usePoserFixesMois,
} from '#/components/planning/mois/useMois.ts'

const NOM_MOIS = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const MOIS_SEUL = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  timeZone: 'UTC',
})

const MSG_VERROU =
  'Semaine verrouillée : planning réalisé. Le cadenas permet de la rouvrir.'
const MSG_HORS =
  'Hors de son contrat ce jour-là (arrivée ou fin de contrat) : voir sa fiche.'
const MSG_CALCUL = 'Calcul en cours : réessayez dans un instant.'
const MSG_DOUBLON =
  'Cette personne a déjà un shift ce jour-là : un seul par jour.'

type Confirmation = 'effacer' | 'remettre' | 'verrou' | null

const AUCUN_VERROU: string[] = []

export function VueMois({
  mois,
  onMois,
  onSemaine,
}: {
  mois: string
  onMois: (mois: string) => void
  onSemaine: (lundi: string) => void
}) {
  const notifier = useNotifier()
  const droits = useDroitsPlanning()
  const aujourdhui = useAujourdhui()
  const { occupe, estOccupe, pendant } = useOccupation()
  const ecriture = useEcriture()
  const generer = useGenerer()
  const qc = useQueryClient()
  const m = useMois(mois)
  const { jours, lundis, semaines, referentiel, charge } = m

  const [progression, setProgression] = useState<{
    libelle: string
    i: number
    n: number
  } | null>(null)
  const [menu, setMenu] = useState<OuvertureMenu | null>(null)
  const [alertesOuvertes, setAlertesOuvertes] = useState(false)
  const [fiche, setFiche] = useState<number | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)

  const verrous = referentiel?.verrous ?? AUCUN_VERROU
  const etats = useMemo(() => {
    const e = new Map<string, EtatSemaine>()
    for (const l of lundis) e.set(l, etatSemaine(l, verrous, aujourdhui))
    return e
  }, [lundis, verrous, aujourdhui])
  const ouvertes = lundis.filter((l) => etats.get(l)?.ouverte)
  const liste = lundis
    .map((l) => semaines.get(l))
    .filter((s): s is SemaineOut => !!s)
  const compteurs = charge ? compter(mois, liste) : null
  const touchables = dansLesOuvertes(liste, ouvertes)
  const presents = useMemo(
    () =>
      referentiel ? presentsDuMois(referentiel.salaries, jours, liste) : [],
    // `liste` suit `semaines` : la dépendance suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [referentiel, jours, semaines],
  )

  const surMessage = useCallback(
    (t: string) => notifier(t, 'danger'),
    [notifier],
  )
  usePoserFixesMois({
    donnees: m.donnees,
    verrous,
    ecrire: droits.ecrire,
    aujourdhui,
    pendant,
    surMessage,
  })

  useEffect(() => {
    if (m.isError) notifier('Le mois ne se charge pas.', 'danger')
  }, [m.isError, notifier])

  // ------------------------------------------------------------ écritures

  /** Lecture fraîche d'une semaine (après une écriture, la relecture est faite). */
  const semaineFraiche = (lundi: string): SemaineOut | null => {
    const ref = qc.getQueryData<Referentiel>(planningKeys.referentiel())
    const shifts = qc.getQueryData<DonneesShifts>(
      planningKeys.mois(lundis[0], lundis.length),
    )
    return ref && shifts ? analyser(donneesSemaine(lundi, ref, shifts)) : null
  }

  /** Une écriture sur une semaine ; signale les règles touchées sur la case. */
  const executer = (
    lundi: string,
    action: () => Promise<unknown>,
    echec: string,
    touche?: { salarieId: number; jour: number },
  ) =>
    pendant(async () => {
      const r = await ecriture(action, echec)
      if (!r.ok) {
        notifier(r.message ?? echec, 'danger')
        return
      }
      if (!touche) return
      const alertes = (semaineFraiche(lundi)?.affectations ?? [])
        .filter(
          (a) => a.salarie_id === touche.salarieId && a.jour === touche.jour,
        )
        .flatMap((a) => a.alertes)
      const loi = alertes.find((a) => a.nature === 'loi')
      if (loi) {
        notifier(
          <span>
            <strong>Règle HCR :</strong> {loi.message}
          </span>,
          'danger',
        )
      } else if (alertes[0]) notifier(alertes[0].message, 'attention')
    })

  const pasMaintenant = () => {
    if (!estOccupe() && charge && droits.pret) return false
    notifier(MSG_CALCUL, 'attention')
    return true
  }

  /** Une action sur des semaines, une à une, dans l'ordre ; arrêt à la
   * première erreur, ce qui est fait reste fait. */
  const parSemaine = async (
    libelle: string,
    visees: string[],
    action: (l: string) => Promise<unknown>,
  ): Promise<boolean> => {
    try {
      for (let i = 0; i < visees.length; i++) {
        const l = visees[i]
        setProgression({ libelle, i: i + 1, n: visees.length })
        try {
          await action(l)
        } catch (err) {
          notifier(
            `${libelle} : ${messageErreur(err, `arrêt à la semaine ${numeroSemaine(l)} (du ${dateCourte(l)})`)}` +
              (i
                ? ` ${i > 1 ? `Les ${i} semaines d'avant sont faites.` : "La semaine d'avant est faite."}`
                : ''),
            'danger',
          )
          return false
        }
      }
      return true
    } finally {
      setProgression(null)
      await qc.invalidateQueries({ queryKey: planningKeys.all })
    }
  }

  const nonTouchees = lundis.length - ouvertes.length
  const noteNonTouchees = nonTouchees
    ? ` (${pluriel(nonTouchees, 'semaine')} passée, verrouillée ou déjà réalisée, non touchée${nonTouchees > 1 ? 's' : ''})`
    : ''

  const completerLeMois = () => {
    if (pasMaintenant()) return
    if (!ouvertes.length) {
      notifier(
        'Aucune semaine à compléter : ce mois est passé, verrouillé ou déjà réalisé.',
        'attention',
      )
      return
    }
    const visees = [...ouvertes]
    const avant = new Map(semaines)
    void pendant(async () => {
      const faites = new Map<string, SemaineOut>()
      // Dans l'ordre : chaque semaine voit la précédente (repos de 11 h).
      const ok = await parSemaine('Génération du mois', visees, async (l) => {
        const r = await generer(l, { aujourdhui })
        faites.set(l, r.semaine)
      })
      if (!ok) return
      const trous = lundis
        .map((l) => faites.get(l) ?? avant.get(l))
        .filter((s): s is SemaineOut => !!s)
        .reduce((n, s) => n + s.stats.places - s.stats.pourvues, 0)
      notifier(
        (trous
          ? `Mois généré · ${pluriel(trous, 'place')} à pourvoir`
          : 'Mois complet généré') + noteNonTouchees,
        trous ? 'attention' : 'info',
      )
    })
  }

  const surLeMois = (
    libelle: string,
    action: (l: string) => Promise<unknown>,
    fait: string,
  ) => {
    if (pasMaintenant()) return
    const visees = [...ouvertes]
    void pendant(async () => {
      if (await parSemaine(libelle, visees, action))
        notifier(fait + noteNonTouchees)
    })
  }

  const moisVerrouille =
    lundis.length > 0 && lundis.every((l) => etats.get(l)?.verrouillee)
  // Semaines que le cadenas du mois changerait (les autres le sont déjà).
  const viseesVerrou = lundis.filter(
    (l) => !!etats.get(l)?.verrouillee === moisVerrouille,
  )
  const basculerMois = () => {
    if (pasMaintenant()) return
    const fermer = !moisVerrouille
    const visees = [...viseesVerrou]
    void pendant(async () => {
      const ok = await parSemaine(
        fermer ? 'Verrouillage du mois' : 'Déverrouillage du mois',
        visees,
        (l) => verrouiller(l, fermer),
      )
      if (ok)
        notifier(
          fermer
            ? 'Mois verrouillé'
            : 'Mois déverrouillé : il se modifie de nouveau',
        )
    })
  }

  // ------------------------------------------------------------ un jour

  const ouvrirJour = (
    salarieId: number,
    date: string,
    x: number,
    y: number,
    clicDroit: boolean,
  ) => {
    const { lundi } = reperer(date)
    if (!droits.ecrire) {
      // Lecture : le détail se lit dans la semaine.
      if (!clicDroit) onSemaine(lundi)
      return
    }
    if (etats.get(lundi)?.verrouillee) return notifier(MSG_VERROU, 'attention')
    if (
      caseDe(semaines, referentiel?.motifs ?? [], salarieId, date)?.type ===
      'hors'
    ) {
      return notifier(MSG_HORS, 'attention')
    }
    if (pasMaintenant()) return
    setMenu({ salarieId, date, x, y })
  }

  const fermerMenu = useCallback(() => setMenu(null), [])

  const champs = (s: ShiftOut): ShiftSaisi => ({
    salarie_id: s.salarie_id,
    poste_id: s.poste_id,
    jour: s.jour,
    horaire_id: s.type_shift_id,
    debut: s.debut,
    fin: s.fin,
    court: s.court,
    pause: s.pause,
    epinglee: true,
  })

  const poserHoraire = (
    salarieId: number,
    date: string,
    h: Horaire,
    posteId: number,
  ) => {
    const { lundi, jour } = reperer(date)
    const c = caseDe(semaines, referentiel?.motifs ?? [], salarieId, date)
    // Même écriture que la semaine : une absence posée à la main est retirée
    // avant de planifier le jour, et remise si le shift est refusé.
    void executer(
      lundi,
      poserHoraireCase(
        lundi,
        { salarie_id: salarieId, jour },
        c?.type === 'shift' ? c.shift : undefined,
        c?.type === 'absence' ? { fixe: c.fixe, motif_id: c.motifId } : null,
        h,
        posteId,
      ),
      "L'horaire n'a pas été posé",
      { salarieId, jour },
    )
  }

  // ------------------------------------------------------------ glisser

  const deposer = ({ vol, salarieId, date, copie }: Depot) => {
    if (pasMaintenant()) return
    const cible = reperer(date)
    if (
      etats.get(cible.lundi)?.verrouillee ||
      etats.get(vol.lundi)?.verrouillee
    ) {
      return notifier(MSG_VERROU, 'attention')
    }
    const motifs = referentiel?.motifs ?? []
    const caseCible = caseDe(semaines, motifs, salarieId, date)
    if (caseCible?.type === 'hors') return notifier(MSG_HORS, 'attention')
    const occupant = semaines
      .get(cible.lundi)
      ?.affectations.find(
        (a) => a.salarie_id === salarieId && a.jour === cible.jour,
      )
    const versCase = { salarie_id: salarieId, jour: cible.jour }

    if (vol.type === 'statut') {
      if (vol.salarieId === salarieId && vol.date === date) return
      if (vol.lundi !== cible.lundi) {
        return notifier(
          "Un repos, une absence ou l'école se déplace dans sa semaine.",
          'attention',
        )
      }
      if (caseCible?.fixe)
        return notifier(
          'Jour fixe de la semaine type : à changer dans la fiche.',
          'attention',
        )
      if (vol.repos && vol.salarieId !== salarieId) {
        return notifier(
          "Un repos se déplace sur la même ligne : il s'échange avec un jour travaillé.",
          'attention',
        )
      }
      void executer(
        vol.lundi,
        () =>
          deplacerStatut({
            lundi: vol.lundi,
            salarieId: vol.salarieId,
            jour: vol.jour,
            versSalarieId: salarieId,
            versJour: cible.jour,
          }),
        "Le jour n'a pas été déplacé",
      )
      return
    }

    const s = vol.shift
    if (s.salarie_id === salarieId && vol.date === date) return
    const touche = { salarieId, jour: cible.jour }
    if (copie) {
      if (occupant) return notifier(MSG_DOUBLON, 'attention')
      void executer(
        cible.lundi,
        () => ajouterShift(cible.lundi, { ...champs(s), ...versCase }),
        "Le shift n'a pas été dupliqué",
        touche,
      )
    } else if (vol.lundi === cible.lundi) {
      // Même semaine : déplacement, ou échange avec le shift déjà posé.
      void executer(
        cible.lundi,
        () => modifierShift(s.id, versCase),
        "Le shift n'a pas été déplacé",
        touche,
      )
    } else {
      // Autre semaine : recréé dans la semaine cible, puis retiré de la sienne.
      if (occupant) return notifier(MSG_DOUBLON, 'attention')
      void executer(
        cible.lundi,
        async () => {
          await ajouterShift(cible.lundi, { ...champs(s), ...versCase })
          try {
            await supprimerShift(s.id)
          } catch (err) {
            notifier(
              `Le shift a été recopié en semaine ${numeroSemaine(cible.lundi)}, mais n'a pas pu être retiré ` +
                `de la semaine ${numeroSemaine(vol.lundi)} : il est en double, à supprimer à la main. ` +
                messageErreur(err, 'Retrait refusé'),
              'danger',
            )
          }
        },
        "Le shift n'a pas été déplacé",
        touche,
      )
    }
  }

  // ------------------------------------------------------------ barre

  const raisonEcriture = !droits.pret
    ? 'Chargement des droits…'
    : !droits.ecrire
      ? 'Lecture seule'
      : !charge
        ? 'Chargement du mois…'
        : occupe
          ? 'Calcul en cours…'
          : undefined
  const portee = ouvertes.length
    ? `Les actions du mois portent sur ${ouvertes.length > 1 ? 'les semaines' : 'la semaine'} ${listeSemaines(ouvertes, numeroSemaine)}, en entier (jours du mois voisin compris).${nonTouchees ? ' Les semaines passées, verrouillées ou déjà réalisées ne sont pas touchées.' : ''}`
    : 'Aucune semaine ouverte : ce mois est passé, verrouillé ou déjà réalisé.'
  const aucuneOuverte = ouvertes.length
    ? undefined
    : 'Aucune semaine ouverte : passée, verrouillée ou déjà réalisée'

  const groupes: Array<{ titre: string; actions: ActionMois[] }> = [
    {
      titre: 'Générer',
      actions: [
        {
          libelle: 'Compléter le mois',
          aide: 'Semi-auto : propose autour de ce qui est validé',
          inactif: aucuneOuverte,
          onClick: completerLeMois,
        },
      ],
    },
    {
      titre: 'Valider',
      actions: [
        {
          libelle: touchables.propositions
            ? `Valider les ${pluriel(touchables.propositions, 'proposition')}`
            : 'Valider les propositions',
          aide: 'Elles deviennent validées : les générations les gardent',
          inactif:
            aucuneOuverte ??
            (touchables.propositions
              ? undefined
              : 'Rien à valider : pas de proposition en attente'),
          onClick: () =>
            surLeMois(
              'Validation du mois',
              (l) => valider(l, null, null, true),
              'Propositions du mois validées',
            ),
        },
        {
          libelle: 'Tout remettre en proposition',
          aide: 'Plus rien de validé : la génération peut tout changer',
          inactif:
            aucuneOuverte ??
            (touchables.valides
              ? undefined
              : 'Rien de validé sur ces semaines'),
          onClick: () => setConfirmation('remettre'),
        },
      ],
    },
    {
      titre: 'Effacer',
      actions: [
        {
          libelle: 'Effacer les propositions du mois',
          aide: "Garde le validé ; dans la semaine en cours, à partir d'aujourd'hui",
          inactif:
            aucuneOuverte ??
            (touchables.propositions
              ? undefined
              : 'Aucune proposition à effacer'),
          danger: true,
          onClick: () => setConfirmation('effacer'),
        },
      ],
    },
  ]

  const verrou = {
    verrouille: moisVerrouille,
    inactif: !droits.pret
      ? 'Chargement des droits…'
      : !droits.gerer
        ? 'Gestion seule : verrouiller ou rouvrir des semaines'
        : !charge
          ? 'Chargement du mois…'
          : occupe
            ? 'Calcul en cours…'
            : undefined,
    onClick: () => {
      if (!pasMaintenant()) setConfirmation('verrou')
    },
  }
  const plusieursVerrou = viseesVerrou.length > 1
  const semainesVerrou = `${plusieursVerrou ? 'Les semaines' : 'La semaine'} ${listeSemaines(viseesVerrou, numeroSemaine)}`

  const nomDuMois = NOM_MOIS.format(new Date(`${mois}-01T12:00:00Z`))
  const ceMois = aujourdhui.slice(0, 7)

  const enCours = progression ? (
    <span
      className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary"
      role="status"
    >
      <Loader2 className="size-3.5 animate-spin" />
      {progression.libelle} · Semaine {progression.i} / {progression.n}
    </span>
  ) : null

  // ------------------------------------------------------------ rendu

  const personneMenu =
    menu && referentiel?.salaries.find((s) => s.id === menu.salarieId)
  const reperesMenu = menu ? reperer(menu.date) : null
  const semaineMenu = reperesMenu ? semaines.get(reperesMenu.lundi) : undefined
  const shiftMenu =
    menu && reperesMenu
      ? semaineMenu?.affectations.find(
          (a) => a.salarie_id === menu.salarieId && a.jour === reperesMenu.jour,
        )
      : undefined
  // Même écriture que la semaine : une seule journée étoile, et début et fin
  // recalculés à chaque bascule (la base enregistre les heures telles quelles).
  const etoile =
    shiftMenu && semaineMenu && personneMenu && referentiel
      ? etoileProposee(semaineMenu, personneMenu, referentiel.horaires, {
          salarie_id: shiftMenu.salarie_id,
          jour: shiftMenu.jour,
        })
      : undefined
  const etoileMenu =
    etoile && shiftMenu && reperesMenu
      ? {
          active: etoile.active,
          onBasculer: () =>
            void executer(
              reperesMenu.lundi,
              etoile.basculer,
              "La journée étoile n'a pas été changée",
              { salarieId: shiftMenu.salarie_id, jour: shiftMenu.jour },
            ),
        }
      : undefined

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <PageHeader
        title="Planning"
        meta={`Vue mois · ${nomDuMois}`}
        actionsAlign="end"
        actions={
          <BarreMois
            compteurs={compteurs}
            occupe={occupe}
            progression={enCours}
            nbAlertes={compteurs?.alertes ?? 0}
            onAlertes={() => setAlertesOuvertes(true)}
            verrou={verrou}
            completer={{
              inactif: raisonEcriture ?? aucuneOuverte,
              aide: `Semi-auto : recalcule les propositions (nouveau tirage à chaque clic) ; le validé ne bouge pas.\n${portee}`,
              onClick: completerLeMois,
            }}
            groupes={groupes}
            menuInactif={raisonEcriture}
            portee={portee}
            nomDuMois={nomDuMois}
            onPrecedent={() => onMois(moisDecale(mois, -1))}
            onSuivant={() => onMois(moisDecale(mois, 1))}
            onCeMois={() => onMois(ceMois)}
            estCeMois={mois === ceMois}
          />
        }
      />

      {m.isError && !charge ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
          <span>Le mois ne se charge pas.</span>
          <Button variant="outline" size="sm" onClick={() => void m.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : !charge || !referentiel ? (
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border bg-card p-4"
          aria-busy="true"
        >
          <span className="sr-only">Chargement du mois…</span>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <GrilleMois
          mois={mois}
          jours={jours}
          lundis={lundis}
          semaines={semaines}
          etats={etats}
          referentiel={referentiel}
          presents={presents}
          aujourdhui={aujourdhui}
          glisser={droits.ecrire && !occupe}
          onSemaine={onSemaine}
          onFiche={setFiche}
          onJour={ouvrirJour}
          onDeposer={deposer}
        />
      )}

      {menu && personneMenu && referentiel && reperesMenu && (
        <MenuJour
          ouverture={menu}
          titre={`${personneMenu.prenom} ${personneMenu.nom} · ${dateLongue(menu.date)}`}
          personne={personneMenu}
          horaires={referentiel.horaires}
          postes={referentiel.postes}
          shift={shiftMenu}
          ecrire={droits.ecrire}
          onHoraire={(h, posteId) =>
            poserHoraire(menu.salarieId, menu.date, h, posteId)
          }
          validation={
            shiftMenu && {
              active: shiftMenu.epinglee,
              onBasculer: () =>
                void executer(
                  reperesMenu.lundi,
                  () =>
                    valider(
                      reperesMenu.lundi,
                      shiftMenu.salarie_id,
                      shiftMenu.jour,
                      !shiftMenu.epinglee,
                    ),
                  "La validation n'a pas été changée",
                ),
            }
          }
          etoile={etoileMenu}
          onSemaine={() => onSemaine(reperesMenu.lundi)}
          onFermer={fermerMenu}
        />
      )}

      {referentiel && (
        <PanneauAlertesMois
          ouvert={alertesOuvertes}
          onFermer={() => setAlertesOuvertes(false)}
          semaines={liste}
          referentiel={referentiel}
          periode={`sur les semaines de ${MOIS_SEUL.format(new Date(`${mois}-01T12:00:00Z`))}`}
        />
      )}

      <FicheSalarie
        salarieId={fiche}
        ouvert={fiche !== null}
        onFermer={() => setFiche(null)}
      />

      <ConfirmDialog
        open={confirmation === 'effacer'}
        onOpenChange={(o) => !o && setConfirmation(null)}
        title="Effacer les propositions du mois ?"
        description={`${pluriel(touchables.propositions, 'proposition')} seront supprimées. Le validé est gardé. ${portee}`}
        confirmLabel="Effacer"
        destructive
        onConfirm={() =>
          surLeMois(
            'Effacement du mois',
            (l) => vider(l, true),
            'Propositions du mois effacées',
          )
        }
      />
      <ConfirmDialog
        open={confirmation === 'remettre'}
        onOpenChange={(o) => !o && setConfirmation(null)}
        title="Tout remettre en proposition ?"
        description={`${pluriel(touchables.valides, 'shift validé', 'shifts validés')} redeviendront des propositions : la prochaine génération pourra les changer. ${portee}`}
        confirmLabel="Remettre en proposition"
        onConfirm={() =>
          surLeMois(
            'Remise en proposition',
            (l) => valider(l, null, null, false),
            'Le mois est remis en proposition',
          )
        }
      />
      <ConfirmDialog
        open={confirmation === 'verrou'}
        onOpenChange={(o) => !o && setConfirmation(null)}
        title={
          moisVerrouille ? 'Déverrouiller le mois ?' : 'Verrouiller le mois ?'
        }
        description={
          moisVerrouille
            ? `${semainesVerrou} ${plusieursVerrou ? 'redeviennent modifiables' : 'redevient modifiable'}, et la génération peut de nouveau ${plusieursVerrou ? 'les' : 'la'} changer.`
            : `${semainesVerrou} ${plusieursVerrou ? 'deviennent' : 'devient'} un planning réalisé : plus aucune modification ni génération, jusqu'à ce que la gestion ${plusieursVerrou ? 'les' : 'la'} rouvre.`
        }
        confirmLabel={moisVerrouille ? 'Déverrouiller' : 'Verrouiller'}
        onConfirm={basculerMois}
      />
    </div>
  )
}

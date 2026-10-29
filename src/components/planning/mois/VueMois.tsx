/*
 * Vue mois du planning (prototype `pages/planning/VueMois.tsx`, spec §3).
 * Vue d'ensemble de toutes les semaines qui couvrent le mois, retouchable :
 * clic sur un jour pour l'éditeur complet du shift (horaire, poste,
 * absence, école…, celui de la semaine), clic droit pour le menu rapide
 * (horaire, validation, journée étoile), glisser pour déplacer, et les
 * actions du mois (compléter, valider, effacer, cadenas).
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
import {
  GardeDemarrage,
  useConfirmationGeneration,
  usePretAGenerer,
} from '#/components/planning/PretAGenerer.tsx'
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
import {
  dateCourte,
  messageGeneration,
  resumeEquite,
  numeroSemaine,
} from '#/lib/planning/affichage.ts'
import { messageErreur } from '#/lib/planning/erreurs.ts'
import { planningKeys } from '#/lib/planning/keys.ts'
import { analyser } from '#/lib/planning/semaine.ts'
import type { SemaineOut, ShiftOut } from '#/lib/planning/semaine.ts'
import {
  ajouterShift,
  deplacerStatut,
  modifierShift,
  poserAbsences,
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
  placesAPourvoir,
  pluriel,
  presentsDuMois,
  reperer,
} from '#/components/planning/mois/mois.ts'
import type { EtatSemaine } from '#/components/planning/mois/mois.ts'
import {
  nombreInfractions,
  pointsAttention,
  porteeMois,
} from '#/components/planning/attention.ts'
import { PanneauAlertes } from '#/components/planning/semaine/PanneauAlertes.tsx'
import {
  absenceDe,
  etoileProposee,
  poserHoraire as poserHoraireCase,
} from '#/components/planning/semaine/edition.ts'
import { EditeurShift } from '#/components/planning/semaine/EditeurShift.tsx'
import type { Edition } from '#/components/planning/semaine/EditeurShift.tsx'
import { ajouterJours } from '#/lib/planning/temps.ts'
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
  // Réglages avant de générer (étape 7 du plan planning-coherence).
  const pretGen = usePretAGenerer(referentiel)
  const confirmGen = useConfirmationGeneration(pretGen)

  const [progression, setProgression] = useState<{
    libelle: string
    i: number
    n: number
  } | null>(null)
  const [menu, setMenu] = useState<OuvertureMenu | null>(null)
  // Éditeur complet d'un jour : la semaine (lundi de la date cliquée) que
  // visent ses écritures.
  const [edition, setEdition] = useState<{
    lundi: string
    edition: Edition
  } | null>(null)
  const [alertesOuvertes, setAlertesOuvertes] = useState(false)
  const [infractionsOuvertes, setInfractionsOuvertes] = useState(false)
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
          // L'arrêt est toujours situé, même quand la base écrit son propre
          // message (PL400, PL409, PL423) : il vient après.
          notifier(
            `${libelle} : arrêt à la semaine S${numeroSemaine(l)} (du ${dateCourte(l)}). ` +
              messageErreur(err, 'Semaine non traitée') +
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
    ? ` ${pluriel(nonTouchees, 'semaine')} passée${nonTouchees > 1 ? 's' : ''}, verrouillée${nonTouchees > 1 ? 's' : ''} ou déjà réalisée${nonTouchees > 1 ? 's' : ''} : non touchée${nonTouchees > 1 ? 's' : ''}.`
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
      const trous = placesAPourvoir(
        mois,
        aujourdhui,
        lundis
          .map((l) => faites.get(l) ?? avant.get(l))
          .filter((s): s is SemaineOut => !!s),
      )
      // Équité (D15) : combien de week-ends chacun, sur les semaines faites.
      const equite = referentiel
        ? resumeEquite(
            [...faites.values()],
            referentiel.salaries,
            referentiel.postes,
          )
        : ''
      notifier(
        messageGeneration(trous, 'Mois') +
          (equite ? ` ${equite}` : '') +
          noteNonTouchees,
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
    if (clicDroit) return setMenu({ salarieId, date, x, y })
    const { jour } = reperer(date)
    const shift = semaines
      .get(lundi)
      ?.affectations.find((a) => a.salarie_id === salarieId && a.jour === jour)
    setEdition({
      lundi,
      edition: shift
        ? { mode: 'modification', shift }
        : { mode: 'creation', salarie_id: salarieId, jour },
    })
  }

  /** Écriture lancée depuis l'éditeur : mêmes gardes qu'à l'ouverture, la
   * semaine ayant pu être verrouillée entre-temps. */
  const depuisEditeur = (
    lundi: string,
    action: () => Promise<unknown>,
    echec: string,
    touche?: { salarieId: number; jour: number },
  ) => {
    setEdition(null)
    if (!droits.ecrire) return
    if (etats.get(lundi)?.verrouillee) return notifier(MSG_VERROU, 'attention')
    if (pasMaintenant()) return
    void executer(lundi, action, echec, touche)
  }
  const horsContrat = (lundi: string, salarieId: number, jour: number) =>
    caseDe(
      semaines,
      referentiel?.motifs ?? [],
      salarieId,
      ajouterJours(lundi, jour),
    )?.type === 'hors'
  const bilanDe = (lundi: string, salarieId: number) =>
    semaines.get(lundi)?.bilan.find((b) => b.salarie_id === salarieId)

  const fermerMenu = useCallback(() => setMenu(null), [])
  // La semaine d'une case et les shifts des semaines voisines : coupure de
  // repos avec le dimanche d'avant ou le lundi d'après. `useMois` lit
  // toujours la semaine d'avant le mois et celle d'après : les bords du mois
  // sont donc vérifiés comme le reste (`donnees.avant` / `donnees.apres`).
  const sourceDe = (lundi: string) => ({
    semaine: semaines.get(lundi),
    avant: m.donnees.get(lundi)?.avant ?? null,
    apres: m.donnees.get(lundi)?.apres ?? null,
  })

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
          aide: 'Propose le reste autour de ce qui est validé',
          inactif: aucuneOuverte ?? pretGen.blocage?.texte,
          onClick: () => confirmGen.demander(completerLeMois),
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
  const nomSeul = MOIS_SEUL.format(new Date(`${mois}-01T12:00:00Z`))
  // Points d'attention : jours à venir des semaines du mois ; le bouton
  // compte ce que le panneau montre.
  const dansLeMois = porteeMois(mois, aujourdhui)
  const nbAlertes = referentiel
    ? pointsAttention(
        liste,
        referentiel.salaries,
        referentiel.postes,
        dansLeMois,
      ).total
    : 0

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
  // Absence ou école du jour (la semaine type la rend fixe : pas d'ici).
  const caseMenu =
    menu && referentiel && !shiftMenu
      ? caseDe(semaines, referentiel.motifs, menu.salarieId, menu.date)
      : null
  const absenceMenu = caseMenu?.type === 'absence' ? caseMenu : null
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
        title={nomDuMois.charAt(0).toUpperCase() + nomDuMois.slice(1)}
        actionsAlign="end"
        actions={
          <BarreMois
            compteurs={
              // Le bouclier compte ce que son panneau montre : les semaines du
              // mois, passé compris.
              compteurs && referentiel
                ? {
                    ...compteurs,
                    infractions: nombreInfractions(
                      pointsAttention(
                        liste,
                        referentiel.salaries,
                        referentiel.postes,
                        porteeMois(mois),
                      ),
                    ),
                  }
                : compteurs
            }
            onInfractions={() => setInfractionsOuvertes(true)}
            occupe={occupe}
            progression={enCours}
            nbAlertes={nbAlertes}
            onAlertes={() => setAlertesOuvertes(true)}
            verrou={verrou}
            completer={{
              inactif:
                raisonEcriture ?? aucuneOuverte ?? pretGen.blocage?.texte,
              aide: `Compléter le mois : recalcule les propositions (nouveau tirage à chaque clic) ; le validé ne bouge pas.\n${portee}`,
              onClick: () => confirmGen.demander(completerLeMois),
            }}
            groupes={groupes}
            menuInactif={raisonEcriture}
            portee={portee}
            nomDuMois={nomDuMois}
            onPrecedent={() => onMois(moisDecale(mois, -1))}
            onSuivant={() => onMois(moisDecale(mois, 1))}
            date={mois === ceMois ? aujourdhui : `${mois}-01`}
            aujourdhui={aujourdhui}
            onDate={(d) => onMois(d.slice(0, 7))}
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
        <GardeDemarrage
          etat={pretGen}
          vide={liste.every((s) => !s.affectations.length)}
        >
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
            onVerrou={
              droits.gerer
                ? (l) => {
                    const verrouillee = !!etats.get(l)?.verrouillee
                    void executer(
                      l,
                      () => verrouiller(l, !verrouillee),
                      "Le verrou n'a pas pu changer",
                    )
                  }
                : undefined
            }
            onDeposer={deposer}
          />
        </GardeDemarrage>
      )}

      {menu && personneMenu && referentiel && reperesMenu && (
        <MenuJour
          ouverture={menu}
          titre={`${personneMenu.prenom} ${personneMenu.nom} · ${dateLongue(menu.date)}`}
          personne={personneMenu}
          referentiel={referentiel}
          jour={reperesMenu.jour}
          source={sourceDe(reperesMenu.lundi)}
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
          onVider={
            shiftMenu
              ? () =>
                  void executer(
                    reperesMenu.lundi,
                    () => supprimerShift(shiftMenu.id),
                    'Suppression impossible',
                  )
              : absenceMenu && !absenceMenu.fixe
                ? () =>
                    void executer(
                      reperesMenu.lundi,
                      () => poserAbsences(menu.salarieId, [menu.date], null),
                      'Absence non retirée',
                    )
                : undefined
          }
          onSemaine={() => onSemaine(reperesMenu.lundi)}
          onFermer={fermerMenu}
        />
      )}

      {edition && referentiel && (
        <EditeurShift
          key={
            edition.edition.mode === 'modification'
              ? `m${edition.edition.shift.id}`
              : `c${edition.edition.salarie_id}:${edition.lundi}:${edition.edition.jour}`
          }
          edition={edition.edition}
          lundi={edition.lundi}
          referentiel={referentiel}
          source={sourceDe(edition.lundi)}
          dateEnLettres
          absence={
            edition.edition.mode === 'creation'
              ? absenceDe(
                  bilanDe(edition.lundi, edition.edition.salarie_id),
                  edition.edition.jour,
                )
              : null
          }
          onFermer={() => setEdition(null)}
          onCreer={(s) => {
            const { lundi } = edition
            if (horsContrat(lundi, s.salarie_id, s.jour)) {
              setEdition(null)
              return notifier(MSG_HORS, 'attention')
            }
            depuisEditeur(
              lundi,
              () => ajouterShift(lundi, s),
              'Ajout impossible',
              { salarieId: s.salarie_id, jour: s.jour },
            )
          }}
          onModifier={(id, v) => {
            const { lundi } = edition
            depuisEditeur(
              lundi,
              () => modifierShift(id, v),
              'Modification impossible',
              v.salarie_id !== undefined && v.jour !== undefined
                ? { salarieId: v.salarie_id, jour: v.jour }
                : undefined,
            )
          }}
          onSupprimer={(id) => {
            const { lundi } = edition
            depuisEditeur(
              lundi,
              () => supprimerShift(id),
              'Suppression impossible',
            )
          }}
          onPoserAbsence={(sid, jour, motifId) => {
            const { lundi } = edition
            if (horsContrat(lundi, sid, jour)) {
              setEdition(null)
              return notifier(MSG_HORS, 'attention')
            }
            depuisEditeur(
              lundi,
              () => poserAbsences(sid, [ajouterJours(lundi, jour)], motifId),
              'Absence non posée',
            )
          }}
          onRetirerAbsence={(sid, jour) => {
            const { lundi } = edition
            depuisEditeur(
              lundi,
              () => poserAbsences(sid, [ajouterJours(lundi, jour)], null),
              'Absence non retirée',
            )
          }}
        />
      )}

      {referentiel && (
        <PanneauAlertes
          ouvert={alertesOuvertes}
          onFermer={() => setAlertesOuvertes(false)}
          semaines={liste}
          salaries={referentiel.salaries}
          postes={referentiel.postes}
          periode={`En ${MOIS_SEUL.format(new Date(`${mois}-01T12:00:00Z`))}`}
          portee={dansLeMois}
          horaires={referentiel.horaires}
          // Étape 8 : « Placer quelqu'un » ouvre le menu du jour sur la case.
          onPlacer={
            droits.ecrire
              ? (d) => ouvrirJour(d.salarieId, d.date, d.x, d.y, true)
              : undefined
          }
        />
      )}

      {referentiel && (
        <PanneauAlertes
          ouvert={infractionsOuvertes}
          onFermer={() => setInfractionsOuvertes(false)}
          semaines={liste}
          salaries={referentiel.salaries}
          postes={referentiel.postes}
          periode={`Semaines ${/^[aeiouy]/i.test(nomSeul) ? "d'" : 'de '}${nomSeul}`}
          portee={porteeMois(mois)}
          infractionsSeules
        />
      )}

      {confirmGen.dialogue}

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

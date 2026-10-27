/*
 * Vue semaine du planning (prototype `pages/PlanningPage.tsx`, spec §2) :
 * l'en-tête (navigation, indicateurs, actions), la grille éditable
 * (glisser-déposer, clic droit, éditeur en tiroir), le panneau des points
 * d'attention et la fiche d'une personne.
 *
 * Droits : lecture = tout voir, aucun geste ; écriture = faire le planning ;
 * gestion = en plus, le cadenas. Semaine verrouillée : plus rien ne bouge.
 * Toute écriture passe par `useEcriture` (relecture complète ensuite) ; une
 * erreur arrive en message lisible dans le fil.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as EvenementSouris } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'

import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  ContextMenu,
  ContextMenuTrigger,
} from '#/components/ui/context-menu.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  useAujourdhui,
  useDroitsPlanning,
  useEcriture,
  useGenerer,
  useOccupation,
  usePoserFixes,
  useSemaine,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { FicheSalarie } from '#/components/planning/parametres/FicheSalarie.tsx'
import {
  nomComplet,
  numeroSemaine,
  parGroupe,
  sousContrat,
} from '#/lib/planning/affichage.ts'
import { messageErreur } from '#/lib/planning/erreurs.ts'
import type { SemaineOut, ShiftOut } from '#/lib/planning/semaine.ts'
import * as service from '#/lib/planning/service.ts'
import { ajouterJours, lundiDe } from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Horaire, Referentiel, Salarie } from '#/lib/planning/types.ts'
import {
  CarteShift,
  CarteStatut,
} from '#/components/planning/semaine/Cartes.tsx'
import type { ContenuCarte } from '#/components/planning/semaine/Cartes.tsx'
import { EditeurShift } from '#/components/planning/semaine/EditeurShift.tsx'
import type { Edition } from '#/components/planning/semaine/EditeurShift.tsx'
import { EnTeteSemaine } from '#/components/planning/semaine/EnTeteSemaine.tsx'
import { GrilleSemaine } from '#/components/planning/semaine/GrilleSemaine.tsx'
import type {
  DonneesLigne,
  RappelsGrille,
} from '#/components/planning/semaine/GrilleSemaine.tsx'
import { MenuCase } from '#/components/planning/semaine/MenuCase.tsx'
import type { OuvertureMenu } from '#/components/planning/semaine/MenuCase.tsx'
import { PanneauAlertes } from '#/components/planning/semaine/PanneauAlertes.tsx'
import {
  absenceDe,
  estEtoile,
  etoileProposee,
  horairesProposes,
  indiceDe,
  posteDeReference,
  poserHoraire,
  shiftDe,
  statutDuJour,
  trous,
} from '#/components/planning/semaine/edition.ts'
import type {
  CaseJour,
  ContenuStatut,
  EnVol,
} from '#/components/planning/semaine/edition.ts'

const MSG_OCCUPE = 'Calcul en cours : réessayez dans un instant.'
const MSG_VERROU =
  'Semaine verrouillée : planning réalisé. Le cadenas permet de la rouvrir.'
const MSG_HORS_CONTRAT =
  'Hors de son contrat ce jour-là (arrivée ou fin de contrat) : voir sa fiche.'
const MSG_FIXE = 'Jour fixe de la semaine type : à changer dans la fiche.'
const MSG_REPOS =
  "Un repos se déplace sur la même ligne : il s'échange avec un jour travaillé."
const MSG_DOUBLON =
  'Cette personne a déjà un shift ce jour-là : un seul par jour.'

type Confirmation = 'vider' | 'fullauto' | 'verrou' | null

/** Déplacement affiché avant la réponse de la base (prototype : optimiste). */
interface Deplacement {
  id: number
  vers: CaseJour
  depuis: CaseJour
  occupant: number | null
}

function avecDeplacement(
  semaine: SemaineOut,
  d: Deplacement | null,
): SemaineOut {
  if (!d) return semaine
  return {
    ...semaine,
    affectations: semaine.affectations.map((a) =>
      a.id === d.id
        ? { ...a, ...d.vers, epinglee: true, alertes: [] }
        : a.id === d.occupant
          ? { ...a, ...d.depuis, epinglee: true, alertes: [] }
          : a,
    ),
  }
}

function contenuCarte(
  a: ShiftOut,
  s: Salarie | undefined,
  ref: Referentiel,
): ContenuCarte {
  return {
    debut: a.debut,
    fin: a.fin,
    // Forfait jours (direction) : on compte des journées, pas des heures.
    duree: s?.forfait_jours ? undefined : a.duree,
    poste: ref.postes.find((p) => p.id === a.poste_id),
    horaire: a.type_shift_id
      ? ref.horaires.find((h) => h.id === a.type_shift_id)
      : undefined,
    epinglee: a.epinglee,
    etoile: estEtoile(s, a),
    role: a.role,
    alertes: a.alertes,
  }
}

const champs = (s: ShiftOut) => ({
  salarie_id: s.salarie_id,
  poste_id: s.poste_id,
  jour: s.jour,
  horaire_id: s.type_shift_id,
  debut: s.debut,
  fin: s.fin,
  court: s.court,
  pause: s.pause,
})

export function VueSemaine({
  lundi,
  onLundi,
  onMois,
}: {
  lundi: string
  onLundi: (lundi: string) => void
  onMois: (mois: string) => void
}) {
  const droits = useDroitsPlanning()
  const aujourdhui = useAujourdhui()
  const { semaine, referentiel, donnees, isError, refetch } = useSemaine(lundi)
  const notifier = useNotifier()
  const ecrire = useEcriture()
  const generer = useGenerer()
  const { occupe, estOccupe, pendant } = useOccupation()

  const lundiCourant = lundiDe(aujourdhui)
  const passee = lundi < lundiCourant
  const enCours = lundi === lundiCourant
  const pret =
    droits.pret && !!semaine && !!referentiel && semaine.lundi === lundi
  const verrou = !!semaine?.verrouillee
  // Gestes d'écriture sur la grille (glisser, +, clic, clic droit).
  const gestes = pret && droits.ecrire && !verrou
  const dates = useMemo(
    () => JOURS.map((_, j) => ajouterJours(lundi, j)),
    [lundi],
  )

  const [deplacement, setDeplacement] = useState<Deplacement | null>(null)
  const [enVol, setEnVol] = useState<EnVol | null>(null)
  const [edition, setEdition] = useState<Edition | null>(null)
  const [ficheId, setFicheId] = useState<number | null>(null)
  const [alertesOuvertes, setAlertesOuvertes] = useState(false)
  const [menu, setMenu] = useState<OuvertureMenu | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [enGeneration, setEnGeneration] = useState(false)
  const [aVerifier, setAVerifier] = useState<(CaseJour & { n: number }) | null>(
    null,
  )

  // Horaires fixes toujours posés à l'ouverture d'une semaine à venir.
  const notifierDanger = useCallback(
    (t: string) => notifier(t, 'danger'),
    [notifier],
  )
  usePoserFixes(
    lundi,
    donnees,
    droits.ecrire && !!semaine && !verrou,
    aujourdhui,
    notifierDanger,
    pendant,
  )

  const affichee = useMemo(
    () => (semaine ? avecDeplacement(semaine, deplacement) : null),
    [semaine, deplacement],
  )

  // ---------------------------------------------------- données de la grille

  // Cache des lignes : une ligne dont rien n'a changé garde son objet, donc
  // la mémoïsation de `LigneStaff` évite de la redessiner après une écriture.
  const cacheLignes = useRef<{
    referentiel: Referentiel | null
    lignes: Map<number, { cle: string; ligne: DonneesLigne }>
  }>({ referentiel: null, lignes: new Map() })
  const { groupes, parSalarie, nbPersonnes } = useMemo(() => {
    const vide = {
      groupes: [],
      parSalarie: new Map<number, DonneesLigne>(),
      nbPersonnes: 0,
    }
    if (!affichee || !referentiel) return vide
    const visibles = referentiel.salaries.filter(
      (s) =>
        sousContrat(s, dates[0], dates[6]) &&
        (s.actif || affichee.affectations.some((a) => a.salarie_id === s.id)),
    )
    const lignes = new Map<number, DonneesLigne>()
    // Le référentiel change (couleur d'un code, nom d'un poste) : tout est redessiné.
    if (cacheLignes.current.referentiel !== referentiel) {
      cacheLignes.current = { referentiel, lignes: new Map() }
    }
    const cache = cacheLignes.current.lignes
    for (const s of visibles) {
      const bilan = affichee.bilan.find((b) => b.salarie_id === s.id)
      const siens = affichee.affectations.filter((a) => a.salarie_id === s.id)
      const cle = JSON.stringify([s, bilan, siens])
      const deja = cache.get(s.id)
      if (deja && deja.cle === cle) {
        lignes.set(s.id, deja.ligne)
        continue
      }
      const planifiee = siens.length > 0
      const ligne: DonneesLigne = {
        salarie: s,
        bilan,
        cases: JOURS.map((_, j) => {
          const a = siens.find((x) => x.jour === j)
          return a
            ? {
                shift: { id: a.id, c: contenuCarte(a, s, referentiel) },
                statut: null,
              }
            : {
                shift: null,
                statut: statutDuJour(bilan, j, planifiee, referentiel.motifs),
              }
        }),
      }
      cache.set(s.id, { cle, ligne })
      lignes.set(s.id, ligne)
    }
    const enGroupes = parGroupe(visibles, referentiel.groupes).map((g) => ({
      id: g.id,
      nom: g.nom,
      lignes: g.membres.map((m) => lignes.get(m.id) as DonneesLigne),
    }))
    return {
      groupes: enGroupes,
      parSalarie: lignes,
      nbPersonnes: visibles.length,
    }
  }, [affichee, referentiel, dates])

  const statutDe = useCallback(
    (salarieId: number, jour: number): ContenuStatut | null => {
      const c = parSalarie.get(salarieId)?.cases[jour]
      return c && !c.shift ? c.statut : null
    },
    [parSalarie],
  )
  const personne = (id: number) =>
    referentiel?.salaries.find((s) => s.id === id)
  const bilanDe = (id: number) =>
    semaine?.bilan.find((b) => b.salarie_id === id)

  const joursAValider = useMemo(
    () =>
      JOURS.map(
        (_, j) =>
          gestes &&
          !!affichee?.affectations.some((a) => a.jour === j && !a.epinglee),
      ),
    [affichee, gestes],
  )

  // -------------------------------------------------------------- écritures

  /** Exécute une écriture ; signale ensuite les alertes de la case touchée. */
  const executer = useCallback(
    async (
      action: () => Promise<unknown>,
      echec: string,
      touche?: CaseJour,
    ) => {
      const r = await pendant(() => ecrire(action, echec))
      if (!r.ok) notifier(r.message ?? `${echec}.`, 'danger')
      else if (touche) setAVerifier({ ...touche, n: Date.now() })
      return r
    },
    [pendant, ecrire, notifier],
  )

  // Après une écriture réussie, les données sont déjà relues : les alertes de
  // la case touchée sont celles de la semaine affichée.
  useEffect(() => {
    if (!aVerifier || !semaine) return
    const alertes = semaine.affectations
      .filter(
        (a) =>
          a.salarie_id === aVerifier.salarie_id && a.jour === aVerifier.jour,
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
    setAVerifier(null)
  }, [aVerifier, semaine, notifier])

  /** Garde-fou commun : semaine ouverte, chargée, rien en cours. */
  const siOuverte = (action: () => void) => {
    if (!droits.ecrire) return
    if (verrou) return notifier(MSG_VERROU, 'attention')
    if (!pret || estOccupe()) return notifier(MSG_OCCUPE, 'attention')
    action()
  }
  const siSousContrat = (salarieId: number, jour: number, action: () => void) =>
    siOuverte(() =>
      statutDe(salarieId, jour)?.genre === 'hors'
        ? notifier(MSG_HORS_CONTRAT, 'attention')
        : action(),
    )

  const lancerGeneration = async (options: { tout?: boolean }) => {
    if (estOccupe() || !pret || verrou || passee) return
    setEnGeneration(true)
    try {
      await pendant(async () => {
        try {
          const r = await generer(lundi, options)
          const n = trous(r.semaine)
          notifier(
            n
              ? `Planning généré en ${r.dureeMs} ms · ${n} place(s) à pourvoir`
              : `Planning complet généré en ${r.dureeMs} ms`,
            n ? 'attention' : 'info',
          )
        } catch (err) {
          notifier(messageErreur(err, 'Génération impossible'), 'danger')
        }
      })
    } finally {
      setEnGeneration(false)
    }
  }

  const basculerVerrou = async () => {
    if (!droits.gerer || estOccupe() || !pret) return
    const etait = verrou
    const r = await executer(
      () => service.verrouiller(lundi, !etait),
      etait ? 'Déverrouillage impossible' : 'Verrouillage impossible',
    )
    // Message de réussite seulement si la base a accepté (anomalie du prototype).
    if (r.ok) {
      notifier(
        etait
          ? 'Semaine déverrouillée : elle se modifie de nouveau'
          : 'Semaine verrouillée',
      )
    }
  }

  const action = (f: () => Promise<unknown>, echec: string) => () =>
    siOuverte(() => void executer(f, echec))

  // ----------------------------------------------------- rappels de la grille

  const rappelsRef = useRef<RappelsGrille | null>(null)
  rappelsRef.current = {
    ajouter: (salarieId, jour) =>
      siSousContrat(salarieId, jour, () =>
        setEdition({ mode: 'creation', salarie_id: salarieId, jour }),
      ),
    ouvrirShift: (id) =>
      siOuverte(() => {
        const shift = semaine?.affectations.find((a) => a.id === id)
        if (shift) setEdition({ mode: 'modification', shift })
      }),
    fiche: (id) => setFicheId(id),
    validerJour: (jour) =>
      siOuverte(
        () =>
          void executer(
            () => service.valider(lundi, null, jour, true),
            'Validation impossible',
          ),
      ),
  }
  const rappels = useMemo<RappelsGrille>(
    () => ({
      ajouter: (s, j) => rappelsRef.current?.ajouter(s, j),
      ouvrirShift: (id) => rappelsRef.current?.ouvrirShift(id),
      fiche: (id) => rappelsRef.current?.fiche(id),
      validerJour: (j) => rappelsRef.current?.validerJour(j),
    }),
    [],
  )

  // ------------------------------------------------------ glisser-déposer

  const capteurs = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  )

  const debutVol = (e: DragStartEvent) => {
    const [type, a, b] = String(e.active.id).split(':')
    if (type === 'statut') {
      const statut = statutDe(Number(a), Number(b))
      if (statut && !statut.fixe) {
        setEnVol({
          type: 'statut',
          salarie_id: Number(a),
          jour: Number(b),
          statut,
        })
      }
    } else {
      const shift = affichee?.affectations.find((x) => x.id === Number(a))
      if (shift) setEnVol({ type: 'shift', shift })
    }
  }

  const finVol = (e: DragEndEvent) => {
    const vol = enVol
    setEnVol(null)
    if (!vol || !e.over || !affichee || verrou || !pret || !droits.ecrire)
      return
    if (estOccupe()) return notifier(MSG_OCCUPE, 'attention')
    const [, sid, j] = String(e.over.id).split(':')
    const cible = { salarie_id: Number(sid), jour: Number(j) }
    const statutCible = statutDe(cible.salarie_id, cible.jour)

    if (vol.type === 'statut') {
      if (vol.salarie_id === cible.salarie_id && vol.jour === cible.jour) return
      if (statutCible?.genre === 'hors')
        return notifier(MSG_HORS_CONTRAT, 'attention')
      if (statutCible?.fixe) return notifier(MSG_FIXE, 'attention')
      if (vol.statut.repos && vol.salarie_id !== cible.salarie_id) {
        return notifier(MSG_REPOS, 'attention')
      }
      void executer(
        () =>
          service.deplacerStatut({
            lundi,
            salarieId: vol.salarie_id,
            jour: vol.jour,
            versSalarieId: cible.salarie_id,
            versJour: cible.jour,
          }),
        'Déplacement impossible',
      )
      return
    }

    const s = vol.shift
    if (s.salarie_id === cible.salarie_id && s.jour === cible.jour) return
    if (statutCible?.genre === 'hors')
      return notifier(MSG_HORS_CONTRAT, 'attention')
    const occupant = shiftDe(affichee, cible)
    const copie = !!(e.activatorEvent as MouseEvent | undefined)?.altKey
    if (copie) {
      if (occupant) return notifier(MSG_DOUBLON, 'attention')
      void executer(
        () =>
          service.ajouterShift(lundi, {
            ...champs(s),
            ...cible,
            epinglee: true,
          }),
        'Copie impossible',
        cible,
      )
      return
    }
    // Déplacement affiché tout de suite ; sur une case occupée, les deux
    // shifts s'échangent (la base fait l'échange). En cas de refus, la
    // semaine relue remet tout en place.
    setDeplacement({
      id: s.id,
      vers: cible,
      depuis: { salarie_id: s.salarie_id, jour: s.jour },
      occupant: occupant?.id ?? null,
    })
    void executer(
      () => service.modifierShift(s.id, cible),
      'Déplacement impossible',
      cible,
    ).finally(() => setDeplacement(null))
  }

  const indice = useCallback(
    (s: Salarie, jour: number, statut: ContenuStatut | null) =>
      indiceDe(
        enVol,
        s,
        jour,
        affichee?.bilan.find((b) => b.salarie_id === s.id),
        statut,
      ),
    [enVol, affichee],
  )

  // ------------------------------------------------------- clic droit

  const ouvrirMenu = (e: EvenementSouris) => {
    const td = (e.target as HTMLElement).closest<HTMLElement>('[data-case]')
    const [sid, j] = (td?.dataset.case ?? '').split(':').map(Number)
    const p = td ? personne(sid) : undefined
    if (!td || !p || !referentiel || !affichee) {
      e.preventDefault()
      return
    }
    let refus: string | null = null
    if (verrou) refus = MSG_VERROU
    else if (!pret || estOccupe()) refus = MSG_OCCUPE
    else if (statutDe(sid, j)?.genre === 'hors') refus = MSG_HORS_CONTRAT
    if (refus) {
      e.preventDefault()
      notifier(refus, 'attention')
      return
    }
    const o = { salarie_id: sid, jour: j }
    const shift = shiftDe(affichee, o)
    const posteId = posteDeReference(p, shift, referentiel.postes)
    const etoile = etoileProposee(affichee, p, referentiel.horaires, o)
    setMenu({
      ...o,
      nom: nomComplet(p),
      actuel: shift?.type_shift_id,
      proposes: horairesProposes(
        p,
        posteId,
        shift,
        referentiel.horaires,
        referentiel.postes,
      ),
      posteId,
      validation: shift
        ? {
            active: shift.epinglee,
            onBasculer: () =>
              siOuverte(
                () =>
                  void executer(
                    () => service.valider(lundi, sid, j, !shift.epinglee),
                    'Validation impossible',
                  ),
              ),
          }
        : undefined,
      etoile: etoile && {
        active: etoile.active,
        onBasculer: () =>
          siOuverte(
            () => void executer(etoile.basculer, 'Journée étoile non posée', o),
          ),
      },
    })
  }

  const choisirHoraire = (h: Horaire, posteId: number) => {
    if (!menu || !affichee) return
    const o = { salarie_id: menu.salarie_id, jour: menu.jour }
    const shift = shiftDe(affichee, o)
    const absence = absenceDe(bilanDe(o.salarie_id), o.jour)
    siOuverte(
      () =>
        void executer(
          poserHoraire(lundi, o, shift, absence, h, posteId),
          'Horaire non posé',
          o,
        ),
    )
  }

  // ------------------------------------------------------------- rendu

  const numero = numeroSemaine(lundi)
  const contenuVol =
    enVol?.type === 'shift' && referentiel
      ? contenuCarte(enVol.shift, personne(enVol.shift.salarie_id), referentiel)
      : null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <EnTeteSemaine
        numero={numero}
        dates={dates}
        semaine={pret ? affichee : null}
        pret={pret}
        ecrire={droits.ecrire}
        gerer={droits.gerer}
        occupe={occupe}
        enGeneration={enGeneration}
        passee={passee}
        enCours={enCours}
        actions={{
          onMois: () => onMois(ajouterJours(lundi, 3).slice(0, 7)),
          onPrecedente: () => onLundi(ajouterJours(lundi, -7)),
          onSuivante: () => onLundi(ajouterJours(lundi, 7)),
          onCetteSemaine: () => onLundi(lundiCourant),
          onVerrou: () => setConfirmation('verrou'),
          onAlertes: () => setAlertesOuvertes(true),
          onCompleter: () => void lancerGeneration({}),
          onFullAuto: () => setConfirmation('fullauto'),
          onValiderSemaine: (epinglee) =>
            action(
              () => service.valider(lundi, null, null, epinglee),
              epinglee
                ? 'Validation impossible'
                : 'Remise en proposition impossible',
            )(),
          onEffacerPropositions: action(
            () => service.vider(lundi, true),
            'Effacement impossible',
          ),
          onVider: () => setConfirmation('vider'),
        }}
      />

      {isError && !semaine ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6 text-sm">
          <p>La semaine ne se charge pas.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Réessayer
          </Button>
        </div>
      ) : !affichee || !referentiel ? (
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border bg-card p-3"
          aria-busy="true"
        >
          <span className="sr-only">Chargement du planning…</span>
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <DndContext
          // Capteurs constants (React exige une liste de même taille) : ce sont
          // les cartes qui se désactivent, hors droits et pendant un calcul.
          sensors={capteurs}
          onDragStart={debutVol}
          onDragEnd={finVol}
          onDragCancel={() => setEnVol(null)}
        >
          <ContextMenu
            onOpenChange={(o) => {
              if (!o) setMenu(null)
            }}
          >
            <ContextMenuTrigger
              asChild
              disabled={!droits.ecrire || !pret}
              onContextMenu={droits.ecrire && pret ? ouvrirMenu : undefined}
            >
              <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-xl border bg-card">
                <GrilleSemaine
                  dates={dates}
                  aujourdhui={aujourdhui}
                  groupes={groupes}
                  nbPersonnes={nbPersonnes}
                  postes={referentiel.postes}
                  gestes={gestes && !occupe}
                  cliquable={pret && droits.ecrire}
                  verrou={verrou}
                  enGlisser={!!enVol}
                  joursAValider={joursAValider}
                  validerJourActif={!occupe}
                  indice={indice}
                  rappels={rappels}
                />
              </div>
            </ContextMenuTrigger>
            <MenuCase ouverture={menu} onHoraire={choisirHoraire} />
          </ContextMenu>
          <DragOverlay dropAnimation={null}>
            {enVol?.type === 'statut' && <CarteStatut s={enVol.statut} enVol />}
            {contenuVol && <CarteShift c={contenuVol} enVol />}
          </DragOverlay>
        </DndContext>
      )}

      {edition && referentiel && (
        <EditeurShift
          key={
            edition.mode === 'modification'
              ? `m${edition.shift.id}`
              : `c${edition.salarie_id}:${edition.jour}`
          }
          edition={edition}
          lundi={lundi}
          referentiel={referentiel}
          absence={
            edition.mode === 'creation'
              ? absenceDe(bilanDe(edition.salarie_id), edition.jour)
              : null
          }
          onFermer={() => setEdition(null)}
          onCreer={(s) => {
            setEdition(null)
            void executer(
              () => service.ajouterShift(lundi, s),
              'Ajout impossible',
              s,
            )
          }}
          onModifier={(id, v) => {
            setEdition(null)
            void executer(
              () => service.modifierShift(id, v),
              'Modification impossible',
              v.salarie_id !== undefined && v.jour !== undefined
                ? { salarie_id: v.salarie_id, jour: v.jour }
                : undefined,
            )
          }}
          onSupprimer={(id) => {
            setEdition(null)
            void executer(
              () => service.supprimerShift(id),
              'Suppression impossible',
            )
          }}
          onPoserAbsence={(sid, jour, motifId) => {
            setEdition(null)
            void executer(
              () =>
                service.poserAbsences(
                  sid,
                  [ajouterJours(lundi, jour)],
                  motifId,
                ),
              'Absence non posée',
            )
          }}
          onRetirerAbsence={(sid, jour) => {
            setEdition(null)
            void executer(
              () =>
                service.poserAbsences(sid, [ajouterJours(lundi, jour)], null),
              'Absence non retirée',
            )
          }}
        />
      )}

      <FicheSalarie
        salarieId={ficheId}
        ouvert={ficheId !== null}
        onFermer={() => setFicheId(null)}
      />

      {semaine && referentiel && (
        <PanneauAlertes
          ouvert={alertesOuvertes}
          onFermer={() => setAlertesOuvertes(false)}
          semaines={[semaine]}
          salaries={referentiel.salaries}
          postes={referentiel.postes}
          periode="cette semaine"
        />
      )}

      <ConfirmDialog
        open={confirmation === 'vider'}
        onOpenChange={(o) => !o && setConfirmation(null)}
        title="Vider la semaine ?"
        description={
          enCours
            ? "Tous les shifts à partir d'aujourd'hui sont supprimés, validés compris. Les absences restent."
            : 'Tous les shifts de la semaine sont supprimés, validés compris. Les absences restent.'
        }
        confirmLabel="Vider la semaine"
        destructive
        onConfirm={action(
          () => service.vider(lundi, false),
          'Vidage impossible',
        )}
      />
      <ConfirmDialog
        open={confirmation === 'fullauto'}
        onOpenChange={(o) => !o && setConfirmation(null)}
        title="Tout recalculer ?"
        description="Full auto repart de zéro : les shifts validés sont eux aussi recalculés."
        confirmLabel="Full auto"
        onConfirm={() => void lancerGeneration({ tout: true })}
      />
      <ConfirmDialog
        open={confirmation === 'verrou'}
        onOpenChange={(o) => !o && setConfirmation(null)}
        title={
          verrou ? 'Déverrouiller la semaine ?' : 'Verrouiller la semaine ?'
        }
        description={
          verrou
            ? 'Le planning réalisé redevient modifiable, et la génération peut de nouveau le changer.'
            : "La semaine devient un planning réalisé : plus aucune modification ni génération, jusqu'à ce que la gestion la rouvre."
        }
        confirmLabel={verrou ? 'Déverrouiller' : 'Verrouiller'}
        onConfirm={() => void basculerVerrou()}
      />
    </div>
  )
}

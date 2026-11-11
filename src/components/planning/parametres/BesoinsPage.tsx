/*
 * Paramètres du Planning : la semaine type des besoins. REFAITE le
 * 2026-10-31 (demande utilisateur : « très compliquée à comprendre, je
 * n'arrive pas à savoir ce que tu attends de moi… j'ai cliqué sur le petit
 * bouton tout à droite et ça a activé le samedi et le dimanche, je ne sais
 * pas comment revenir »), sur le modèle des besoins en personnel de Skello
 * ou Planday :
 *
 * - un poste à la fois, en onglets ; une grille horaires × jours, UN chiffre
 *   par case (les personnes nécessaires) ;
 * - les places pour apprentis ou stagiaires et en plus si besoin sont des
 *   options de la case (son panneau), signalées par un repère ;
 * - recopier sur d'autres jours est un choix explicite du panneau ;
 * - Annuler et Rétablir (boutons de l'en-tête, Ctrl + Z, Ctrl + Y) sur
 *   toute action de la page ;
 * - la présence minimum du matin, du soir et de la nuit sous la grille.
 *
 * TABLEAU DE L'ACCUEIL (décision utilisateur du 2026-11-01, plan
 * `plan/planning-accueil-2026-11-01/`) : la Réception, le Club et la Veille
 * de nuit n'ont plus de grille ; un seul tableau en tête dit combien de
 * personnes il faut exactement le matin, le soir et la nuit. Les onglets ne
 * gardent que les postes à part (Direction, Adjoint, Supervision…).
 *
 * Le modèle et les écritures ne changent pas : chaque case s'enregistre
 * aussitôt (`reglerBesoin` : crée, modifie, ou supprime à 0 / 0 / 0, avec le
 * besoin RELU en base, les écritures l'une après l'autre), chaque présence
 * par `reglerConsigne`. L'écran montre tout de suite la valeur voulue.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Redo2, Undo2 } from 'lucide-react'

import {
  useDroitsPlanning,
  useEcriture,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  GrilleBesoins,
  lignesAffichees,
  presenceSemaine,
} from '#/components/planning/parametres/besoins/GrilleBesoins.tsx'
import type { ActionsGrille } from '#/components/planning/parametres/besoins/GrilleBesoins.tsx'
import {
  HISTORIQUE_VIDE,
  JOURS_COPIE,
  ajouter,
  annuler,
  retablir,
  sansEffet,
} from '#/components/planning/parametres/besoins/historique.ts'
import type {
  Bornes,
  Changement,
  Entree,
  Historique,
} from '#/components/planning/parametres/besoins/historique.ts'
import { TableauAccueil } from '#/components/planning/parametres/besoins/TableauAccueil.tsx'
import {
  HeuresAccueil,
  HeuresPoste,
} from '#/components/planning/parametres/besoins/HeuresAccueil.tsx'
import {
  phrasesOrdreDecision,
  sectionsBesoins,
} from '#/components/planning/parametres/besoins/ordreDecision.ts'
import {
  idCible,
  useOuvrirCible,
} from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import type { PropsOuvrir } from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import {
  CadreReglages,
  EnTeteSection,
} from '#/components/planning/parametres/reglages/cadre.tsx'
import { SectionMoments } from '#/components/planning/parametres/reglages/SectionMoments.tsx'
import {
  RIEN,
  reglerChamp,
  soutienSansBase,
  trouverBesoin,
} from '#/components/planning/parametres/reglages/besoins.ts'
import type {
  LigneBesoin,
  Reglage,
} from '#/components/planning/parametres/reglages/besoins.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '#/components/ui/tabs.tsx'
import { heures, libelleHoraire } from '#/lib/planning/affichage.ts'
import { planningKeys } from '#/lib/planning/keys.ts'
import { estIndispensable } from '#/lib/planning/modele.ts'
import { estPosteAccueil } from '#/lib/planning/presence.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import { zoneDuPoste } from '#/lib/planning/zones.ts'
import { SectionZones } from '#/components/planning/parametres/besoins/SectionZones.tsx'
import { reglerBesoin, reglerConsigne } from '#/lib/planning/service.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Consigne, Poste, Referentiel } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

type Periode = Consigne['periode']
type Section = 'indispensables' | 'autres'

const cleCase = (posteId: number, ligne: LigneBesoin, jour: number) =>
  `${posteId}|${ligne.cle}|${jour}`
const cleConsigne = (zone: number, jour: number, periode: Periode) =>
  `${zone}|${jour}|${periode}`
const AUCUNE_BORNE: Bornes = { minimum: 0, maximum: null }
const AUCUNE: ReadonlySet<string> = new Set()

/** Le focus est dans un champ de saisie : Ctrl + Z lui appartient. */
function dansUnChamp(cible: EventTarget | null): boolean {
  if (!(cible instanceof HTMLElement)) return false
  return (
    cible.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName)
  )
}

export function BesoinsPage({ ouvrir: lien, onOuvert }: PropsOuvrir = {}) {
  const droits = useDroitsPlanning()
  const ref = useReferentiel()
  const modifiable = droits.pret && droits.gerer
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const qc = useQueryClient()
  const data = ref.data

  // Valeurs affichées avant la relecture (mise à jour immédiate) ; vidées
  // quand toutes les écritures en cours ont répondu.
  const [locaux, setLocaux] = useState<Map<string, Reglage>>(new Map())
  const [localesConsignes, setLocalesConsignes] = useState<Map<string, Bornes>>(
    new Map(),
  )
  const file = useRef<Promise<void>>(Promise.resolve())
  const enCours = useRef(0)
  const dernier = useRef<Referentiel | undefined>(undefined)
  dernier.current = data

  // Lignes gardées dans la séance, par poste : ajoutées, ou réglées (une
  // ligne remise à 0 ne disparaît pas sous les doigts).
  const [gardees, setGardees] = useState<Map<number, Set<string>>>(new Map())
  const garder = useCallback((posteId: number, cles: string[]) => {
    setGardees((m) => {
      const avant = m.get(posteId)
      if (cles.every((c) => avant?.has(c))) return m
      return new Map(m).set(posteId, new Set([...(avant ?? []), ...cles]))
    })
  }, [])

  // Les sections d'après le réglage de chaque poste (indispensable ou non,
  // décision utilisateur du 2026-11-05) : un poste neuf y apparaît tout
  // seul. Même règle que le moteur (`estPosteAccueil`) : sans aucun poste
  // du matin et du soir, pas de tableau, tous les postes gardent leur grille.
  const sections = data ? sectionsBesoins(data.postes) : undefined
  const actif = !!sections?.accueil
  // Le poste ouvert dans les onglets de chaque section.
  const [choisis, setChoisis] = useState<Partial<Record<Section, number>>>({})

  const [historique, setHistorique] = useState<Historique>(HISTORIQUE_VIDE)
  const historiqueRef = useRef(historique)
  historiqueRef.current = historique

  // Lien d'un point « À vérifier » : un poste (`poste-<id>`, `soutien-<id>`)
  // ou la présence minimum (`presence`). La relève n'a plus de réglage
  // (fixe, décision utilisateur du 2026-11-06).
  useOuvrirCible(
    lien,
    !!data,
    (cible) => {
      // Limites des moments (déplacées de la page Horaires le 2026-11-05).
      if (cible === 'moments') {
        window.setTimeout(() => allerA('titre-moments'), 0)
        return true
      }
      if (cible === 'presence') {
        window.setTimeout(() => allerA('besoins-presence'), 0)
        return true
      }
      const id = idCible(cible, 'soutien') ?? idCible(cible, 'poste')
      const vise = data?.postes.find((p) => p.id === id)
      if (!vise) return false
      // Un poste de l'accueil n'a plus de grille : son réglage est le tableau.
      if (estPosteAccueil(vise, actif)) {
        window.setTimeout(() => allerA('besoins-presence'), 0)
        return true
      }
      const section: Section = estIndispensable(vise)
        ? 'indispensables'
        : 'autres'
      setChoisis((c) => ({ ...c, [section]: vise.id }))
      window.setTimeout(() => allerA(`besoins-${section}`), 0)
      return true
    },
    onOuvert,
  )

  const relu = () =>
    qc.getQueryData<Referentiel>(planningKeys.referentiel()) ?? dernier.current

  const affiche = (
    posteId: number,
    ligne: LigneBesoin,
    jour: number,
  ): Reglage => {
    const local = locaux.get(cleCase(posteId, ligne, jour))
    if (local) return local
    const b = data
      ? trouverBesoin(data.besoins, posteId, ligne, jour)
      : undefined
    return b
      ? {
          effectif: b.effectif,
          soutien: b.soutien,
          renfort: b.renfort,
          obligatoire: b.obligatoire ?? true,
          niveau_min: b.niveau_min ?? null,
          niveaux: b.niveaux ?? [],
        }
      : RIEN
  }

  /** La zone d'une consigne en base (absente : la première). */
  const premiereZone = data ? Number(lireRegles(data).zones[0].id) : 1
  const zoneDe = (c: Consigne) => c.zone_id ?? premiereZone
  const afficheConsigne = (
    zone: number,
    jour: number,
    periode: Periode,
  ): Bornes => {
    const locale = localesConsignes.get(cleConsigne(zone, jour, periode))
    if (locale) return locale
    const c = data?.consignes.find(
      (x) => zoneDe(x) === zone && x.jour === jour && x.periode === periode,
    )
    return c ? { minimum: c.minimum, maximum: c.maximum } : AUCUNE_BORNE
  }

  /** Écrit les valeurs APRÈS des changements, dans l'ordre, l'une après
   * l'autre : la même écriture pour une action, son annulation et son
   * rétablissement. */
  const appliquer = (changements: Changement[]) => {
    if (!modifiable || !changements.length) return
    const besoins = changements.filter((c) => c.type === 'besoin')
    const consignes = changements.filter((c) => c.type === 'consigne')
    const parPoste = new Map<number, string[]>()
    for (const c of besoins)
      parPoste.set(c.posteId, [...(parPoste.get(c.posteId) ?? []), c.ligne.cle])
    for (const [id, cles] of parPoste) garder(id, cles)
    if (besoins.length)
      setLocaux((m) => {
        const suite = new Map(m)
        for (const c of besoins)
          suite.set(cleCase(c.posteId, c.ligne, c.jour), c.apres)
        return suite
      })
    if (consignes.length)
      setLocalesConsignes((m) => {
        const suite = new Map(m)
        for (const c of consignes)
          suite.set(cleConsigne(c.zone, c.jour, c.periode), c.apres)
        return suite
      })
    enCours.current++
    file.current = file.current.then(async () => {
      if (besoins.length) {
        const r = await ecrire(async () => {
          for (const c of besoins) {
            const enBase = relu()
            await reglerBesoin(
              {
                poste_id: c.posteId,
                jour: c.jour,
                horaire_id: c.ligne.horaire_id,
                debut: c.ligne.debut,
                fin: c.ligne.fin,
                ...c.apres,
              },
              enBase
                ? trouverBesoin(enBase.besoins, c.posteId, c.ligne, c.jour)
                : undefined,
            )
          }
        }, "Le besoin n'a pas pu être enregistré")
        if (!r.ok) notifier(r.message, 'danger')
      }
      if (consignes.length) {
        const r = await ecrire(async () => {
          for (const c of consignes) {
            await reglerConsigne(
              { zone_id: c.zone, jour: c.jour, periode: c.periode, ...c.apres },
              relu()?.consignes.find(
                (x) =>
                  zoneDe(x) === c.zone &&
                  x.jour === c.jour &&
                  x.periode === c.periode,
              ),
            )
          }
        }, "L'accueil n'a pas pu être enregistré")
        if (!r.ok) notifier(r.message, 'danger')
      }
      enCours.current--
      if (enCours.current === 0) {
        setLocaux(new Map())
        setLocalesConsignes(new Map())
      }
    })
  }

  /** Une action de l'utilisateur : gardée pour Annuler, puis écrite. Rend
   * le nombre de cases réellement changées. */
  const faire = (entree: Entree): number => {
    const changements = entree.changements.filter((c) => !sansEffet(c))
    if (!modifiable || !changements.length) return 0
    setHistorique((h) => ajouter(h, { ...entree, changements }))
    appliquer(changements)
    return changements.length
  }

  const defaire = () => {
    const { historique: suite, entree } = annuler(historiqueRef.current)
    if (!entree || !modifiable) return
    historiqueRef.current = suite
    setHistorique(suite)
    appliquer(entree.changements)
    notifier(`Annulé : ${entree.libelle}.`)
  }
  const refaire = () => {
    const { historique: suite, entree } = retablir(historiqueRef.current)
    if (!entree || !modifiable) return
    historiqueRef.current = suite
    setHistorique(suite)
    appliquer(entree.changements)
    notifier(`Rétabli : ${entree.libelle}.`)
  }
  const raccourcis = useRef({ defaire, refaire })
  raccourcis.current = { defaire, refaire }
  useEffect(() => {
    if (!modifiable) return
    const surTouche = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || dansUnChamp(e.target)) return
      const touche = e.key.toLowerCase()
      if (touche === 'z' && !e.shiftKey) {
        e.preventDefault()
        raccourcis.current.defaire()
      } else if (touche === 'y' || (touche === 'z' && e.shiftKey)) {
        e.preventDefault()
        raccourcis.current.refaire()
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [modifiable])

  const changementCase = (
    posteId: number,
    ligne: LigneBesoin,
    jour: number,
    apres: Reglage,
  ): Changement => ({
    type: 'besoin',
    posteId,
    ligne,
    jour,
    avant: affiche(posteId, ligne, jour),
    apres,
  })

  const actionsPour = (poste: Poste): ActionsGrille => ({
    regler: (ligne, jour, champ, v) => {
      faire({
        libelle: `${poste.nom}, ${JOURS[jour].toLowerCase()}, ${libelleHoraire(ligne)}`,
        changements: [
          changementCase(
            poste.id,
            ligne,
            jour,
            reglerChamp(affiche(poste.id, ligne, jour), champ, v),
          ),
        ],
      })
    },
    option: (ligne, jour, patch) => {
      faire({
        libelle: `${poste.nom}, ${JOURS[jour].toLowerCase()}, ${libelleHoraire(ligne)}`,
        changements: [
          changementCase(poste.id, ligne, jour, {
            ...affiche(poste.id, ligne, jour),
            ...patch,
          }),
        ],
      })
    },
    copier: (ligne, jour, cible) => {
      const source = affiche(poste.id, ligne, jour)
      const jours = JOURS_COPIE[cible]
      const n = faire({
        libelle: `copie sur ${jours.length} jours`,
        changements: jours.map((j) =>
          changementCase(poste.id, ligne, j, source),
        ),
      })
      notifier(
        n
          ? `Copié sur ${jours.length} jours. Ctrl + Z pour annuler.`
          : 'Ces jours avaient déjà ces réglages.',
      )
    },
    vider: (ligne) => {
      const n = faire({
        libelle: `ligne ${libelleHoraire(ligne)} vidée`,
        changements: JOURS.map((_, j) =>
          changementCase(poste.id, ligne, j, RIEN),
        ),
      })
      if (n) notifier('Ligne vidée. Ctrl + Z pour annuler.')
    },
    retirerOrphelins: (ligne) => {
      const n = faire({
        libelle: "places d'apprentis retirées",
        changements: JOURS.flatMap((_, j) => {
          const r = affiche(poste.id, ligne, j)
          return soutienSansBase(r)
            ? [changementCase(poste.id, ligne, j, { ...r, soutien: 0 })]
            : []
        }),
      })
      if (n) notifier('Places retirées. Ctrl + Z pour annuler.')
    },
    ajouterLigne: (cle) => garder(poste.id, [cle]),
  })

  const reglerAccueil = (
    zone: number,
    nom: string,
    jour: number,
    periode: Periode,
    b: Bornes,
  ) => {
    const avant = afficheConsigne(zone, jour, periode)
    // Au moins, au plus (un chiffre exact par défaut) ; rien de demandé
    // retire la case.
    const haut = Math.max(b.minimum, b.maximum ?? b.minimum)
    const apres: Bornes =
      haut > 0 ? { minimum: b.minimum, maximum: haut } : AUCUNE_BORNE
    faire({
      libelle: `${nom.toLocaleLowerCase('fr-FR')}, ${JOURS[jour].toLowerCase()} ${periode}`,
      changements: [{ type: 'consigne', zone, jour, periode, avant, apres }],
    })
  }

  const regles = data ? lireRegles(data) : undefined
  // Un tableau par zone (2026-11-06) et ses heures ; puis créer, nommer,
  // retirer une zone. La passation entre les équipes n'a plus de réglage
  // (décision utilisateur du 2026-11-06) : une phrase la dit.
  const accueil = data && regles && (
    <div className="flex flex-col gap-8">
      {regles.zones.map((z, i) => {
        const id = Number(z.id)
        const siens = data.postes.filter((p) => zoneDuPoste(p) === z.id)
        return (
          <div key={z.id} className="flex flex-col gap-8">
            <TableauAccueil
              zone={z}
              premier={i === 0}
              seule={regles.zones.length === 1}
              postes={siens}
              horaires={data.horaires}
              modifiable={modifiable}
              affiche={(j, p) => afficheConsigne(id, j, p)}
              regler={(j, p, b) => reglerAccueil(id, z.nom, j, p, b)}
            />
            {/* Zone tenue en continu : ni ouverture ni fermeture à régler
                (décision utilisateur du 2026-11-11, `aOuvertureFermeture`). */}
            {!z.continue && (
              <div className="grid gap-8 lg:grid-cols-2">
                <HeuresAccueil
                  postes={siens}
                  modifiable={modifiable}
                  duree={regles.passations.dureeOuverture}
                />
              </div>
            )}
          </div>
        )
      })}
      <p
        id="besoins-passation"
        className="max-w-3xl text-sm text-muted-foreground"
      >
        Entre deux équipes, la suivante arrive au plus tard quand la précédente
        part, nuit comprise. Le planning préfère qu'elles se croisent un moment.
      </p>
      <SectionZones referentiel={data} modifiable={modifiable} />
    </div>
  )

  /** Les onglets d'une section : un poste à la fois, sa grille. */
  const ongletsDe = (section: Section, postes: Poste[]) => {
    if (!data || !postes.length) return null
    const poste = postes.find((p) => p.id === choisis[section]) ?? postes[0]
    return (
      <Tabs
        value={String(poste.id)}
        onValueChange={(v) =>
          setChoisis((c) => ({ ...c, [section]: Number(v) }))
        }
        className="min-w-0 gap-3"
      >
        <TabsList
          aria-label={
            section === 'indispensables'
              ? 'Postes indispensables'
              : 'Autres postes'
          }
          className="max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto"
        >
          {postes.map((p) => (
            <TabsTrigger
              key={p.id}
              value={String(p.id)}
              className="h-8 flex-none gap-2 px-3"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: p.couleur }}
              />
              {p.nom}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {heures(
                  presenceSemaine(
                    p,
                    lignesAffichees(p, data, gardees.get(p.id) ?? AUCUNE),
                    affiche,
                  ),
                )}
                <span aria-hidden> / sem.</span>
                <span className="sr-only"> de présence par semaine</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent
          value={String(poste.id)}
          className="flex min-w-0 flex-col gap-4"
        >
          <GrilleBesoins
            poste={poste}
            referentiel={data}
            lignes={lignesAffichees(
              poste,
              data,
              gardees.get(poste.id) ?? AUCUNE,
            )}
            modifiable={modifiable}
            affiche={affiche}
            actions={actionsPour(poste)}
          />
          {/* Ouverture et fermeture de tout poste (2026-11-06) ; ceux de
              l'accueil ont les leurs sous le tableau. */}
          <HeuresPoste
            poste={poste}
            modifiable={modifiable}
            duree={lireRegles(data).passations.dureeOuverture}
          />
        </TabsContent>
      </Tabs>
    )
  }

  return (
    <CadreReglages
      titre="Besoins"
      actif="/planning/besoins"
      modifiable={modifiable}
      pret={droits.pret}
      chargement={ref.isPending}
      erreur={ref.isError}
      onReessayer={() => void ref.refetch()}
      actions={
        modifiable ? (
          <div className="flex items-center gap-1">
            <Tip label="Annuler (Ctrl + Z)">
              <span tabIndex={historique.passe.length ? -1 : 0}>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Annuler"
                  disabled={!historique.passe.length}
                  onClick={defaire}
                >
                  <Undo2 />
                </Button>
              </span>
            </Tip>
            <Tip label="Rétablir (Ctrl + Y)">
              <span tabIndex={historique.futur.length ? -1 : 0}>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Rétablir"
                  disabled={!historique.futur.length}
                  onClick={refaire}
                >
                  <Redo2 />
                </Button>
              </span>
            </Tip>
          </div>
        ) : undefined
      }
    >
      {data && sections && (
        // Largeur bornée (audit UX du 2026-10-31) : étalées sur 1 400 px,
        // les 7 colonnes de jours obligeaient l'œil à traverser l'écran.
        // Trois sections (refonte du 2026-11-05, demande utilisateur : « plus
        // claire ») : les postes indispensables, les autres, les moments.
        <div className="flex w-full max-w-6xl min-w-0 flex-col gap-10">
          <SectionBesoins
            id="besoins-indispensables"
            titre="Postes indispensables"
            vide={
              !sections.accueilIndispensable && !sections.indispensables.length
                ? 'Aucun poste indispensable. Dans Postes, activez Indispensable au fonctionnement.'
                : undefined
            }
          >
            {sections.accueilIndispensable && accueil}
            {ongletsDe('indispensables', sections.indispensables)}
          </SectionBesoins>

          <SectionBesoins
            filet
            id="besoins-autres"
            titre="Autres postes, tenus au mieux"
            texte="L'hôtel tourne sans eux quelques jours. Le planning les remplit s'il reste du monde."
            vide={
              (sections.accueilIndispensable || !sections.accueil) &&
              !sections.autres.length
                ? 'Aucun. Un poste qui n’est pas indispensable apparaît ici.'
                : undefined
            }
          >
            {sections.accueil && !sections.accueilIndispensable && accueil}
            {ongletsDe('autres', sections.autres)}
          </SectionBesoins>

          <div className="border-t pt-8">
            <SectionMoments referentiel={data} modifiable={modifiable} />
          </div>

          <details className="group border-t pt-4 text-sm text-muted-foreground">
            <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-foreground select-none">
              <ChevronRight
                aria-hidden
                className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
              />
              Dans quel ordre le planning décide
            </summary>
            {/* Écrit d'après le réglage des postes (D11, oui / non). */}
            <ol
              data-ordre-decision
              className="mt-2 ml-5 flex max-w-3xl list-decimal flex-col gap-1.5"
            >
              {phrasesOrdreDecision(data.postes).map((phrase) => (
                <li key={phrase}>{phrase}</li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </CadreReglages>
  )
}

/*
 * Défile la SEULE zone de contenu jusqu'à l'élément (`scrollIntoView`
 * faisait aussi défiler la fenêtre, en-tête compris).
 */
function allerA(id: string) {
  const cible = document.getElementById(id)
  let zone = cible?.parentElement ?? null
  while (zone && !/(auto|scroll)/.test(getComputedStyle(zone).overflowY)) {
    zone = zone.parentElement
  }
  if (!cible || !zone) return
  const haut =
    cible.getBoundingClientRect().top -
    zone.getBoundingClientRect().top +
    zone.scrollTop -
    8
  zone.scrollTo({ top: haut, behavior: 'smooth' })
}

/** Une section de la page : titre, une phrase, son contenu (ou une ligne
 * quand elle est vide). Les sections après la première sont séparées par un
 * filet. */
function SectionBesoins({
  filet = false,
  id,
  titre,
  texte,
  vide,
  children,
}: {
  /** Un filet au-dessus : la section suit une autre. */
  filet?: boolean
  id: string
  /** Titre visible ; sans `texte`, il ne sert qu'aux lecteurs d'écran
   * (2026-11-11 : « Postes indispensables » retiré de l'écran). */
  titre: string
  texte?: string
  vide?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={texte ? `${id}-titre` : undefined}
      aria-label={texte ? undefined : titre}
      className={cn(
        'flex min-w-0 scroll-mt-4 flex-col gap-5',
        filet && 'border-t pt-8',
      )}
    >
      {texte && (
        <EnTeteSection id={`${id}-titre`} titre={titre} texte={texte} />
      )}
      {vide ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {vide}
        </p>
      ) : (
        children
      )}
    </section>
  )
}

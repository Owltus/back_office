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
import { useQueryClient } from '@tanstack/react-query'
import { Redo2, Undo2 } from 'lucide-react'

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
import { ReglageReleve } from '#/components/planning/parametres/besoins/ReglageReleve.tsx'
import { HeuresAccueil } from '#/components/planning/parametres/besoins/HeuresAccueil.tsx'
import {
  AIDE_IMPORTANCE,
  LIBELLES_IMPORTANCE,
  phrasesOrdreDecision,
} from '#/components/planning/parametres/besoins/ordreDecision.ts'
import {
  idCible,
  useOuvrirCible,
} from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import type { PropsOuvrir } from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import { CadreReglages } from '#/components/planning/parametres/reglages/cadre.tsx'
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
import { accueilActif, estPosteAccueil } from '#/lib/planning/presence.ts'
import { reglerBesoin, reglerConsigne } from '#/lib/planning/service.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Consigne, Referentiel } from '#/lib/planning/types.ts'

type Periode = Consigne['periode']

const cleCase = (posteId: number, ligne: LigneBesoin, jour: number) =>
  `${posteId}|${ligne.cle}|${jour}`
const cleConsigne = (jour: number, periode: Periode) => `${jour}|${periode}`
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

  const [posteChoisi, setPosteChoisi] = useState<number | undefined>(undefined)
  // Même règle que le moteur (`estPosteAccueil`) : sans aucun poste coché
  // « présence », pas de tableau, tous les postes gardent leur grille.
  const actif = !!data && accueilActif(data.postes)
  const aPart =
    data?.postes.filter((p) => !p.ferme && !estPosteAccueil(p, actif)) ?? []
  const poste = aPart.find((p) => p.id === posteChoisi) ?? aPart.at(0)

  const [historique, setHistorique] = useState<Historique>(HISTORIQUE_VIDE)
  const historiqueRef = useRef(historique)
  historiqueRef.current = historique

  // Lien d'un point « À vérifier » : un poste (`poste-<id>`, `soutien-<id>`)
  // ou la présence minimum (`presence`).
  useOuvrirCible(
    lien,
    !!data,
    (cible) => {
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
      setPosteChoisi(id)
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
          niveau_min: b.niveau_min ?? 'depannage',
        }
      : RIEN
  }

  const afficheConsigne = (jour: number, periode: Periode): Bornes => {
    const locale = localesConsignes.get(cleConsigne(jour, periode))
    if (locale) return locale
    const c = data?.consignes.find(
      (x) => x.jour === jour && x.periode === periode,
    )
    return c ? { minimum: c.minimum, maximum: c.maximum } : AUCUNE_BORNE
  }
  /** Le chiffre exact d'une case de l'accueil (minimum = maximum). */
  const afficheAccueil = (jour: number, periode: Periode) =>
    afficheConsigne(jour, periode).minimum

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
          suite.set(cleConsigne(c.jour, c.periode), c.apres)
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
              { jour: c.jour, periode: c.periode, ...c.apres },
              relu()?.consignes.find(
                (x) => x.jour === c.jour && x.periode === c.periode,
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

  const actions: ActionsGrille | undefined = poste && {
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
  }

  const reglerAccueil = (jour: number, periode: Periode, n: number) => {
    const avant = afficheConsigne(jour, periode)
    // Un chiffre exact (contrainte `planning_consignes_exact`) ; 0 retire la case.
    const apres: Bornes = n > 0 ? { minimum: n, maximum: n } : AUCUNE_BORNE
    faire({
      libelle: `accueil, ${JOURS[jour].toLowerCase()} ${periode}`,
      changements: [{ type: 'consigne', jour, periode, avant, apres }],
    })
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
      {data && (
        // Largeur bornée (audit UX du 2026-10-31) : étalées sur 1 400 px,
        // les 7 colonnes de jours obligeaient l'œil à traverser l'écran.
        <div className="flex w-full max-w-6xl min-w-0 flex-col gap-6">
          <div className="flex max-w-3xl flex-col gap-1">
            <p className="text-sm">
              Indiquez combien de personnes il faut, chaque jour. Le planning
              automatique s'en sert pour placer l'équipe.
            </p>
            {modifiable && (
              <p className="text-xs text-muted-foreground">
                Cliquez sur une case pour la régler.
              </p>
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                Dans quel ordre le planning automatique décide
              </summary>
              {/* Écrit d'après l'importance des postes (étape 7, D11). */}
              <div data-ordre-decision className="mt-1 flex flex-col gap-1">
                {phrasesOrdreDecision(data.postes).map((phrase) => (
                  <p key={phrase}>{phrase}</p>
                ))}
              </div>
            </details>
          </div>

          <TableauAccueil
            postes={data.postes}
            modifiable={modifiable}
            affiche={afficheAccueil}
            regler={reglerAccueil}
          />
          {actif && (
            <HeuresAccueil
              postes={data.postes}
              modifiable={modifiable}
              duree={data.reglages?.duree_ouverture ?? 60}
            />
          )}
          {actif && (
            <ReglageReleve
              minutes={data.reglages?.releve_minutes ?? 30}
              continuite={data.reglages?.continuite_obligatoire ?? true}
              veilleur={data.reglages?.passation_veilleur ?? true}
              tolerance={data.reglages?.equipe_tolerance ?? 30}
              modifiable={modifiable}
            />
          )}

          {actif && <h2 className="text-base font-semibold">Autres postes</h2>}
          {!poste ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Aucun autre poste. Les postes qui ne sont pas à l'accueil
              (Direction, Technique…) se règlent ici.
            </p>
          ) : (
            <Tabs
              value={String(poste.id)}
              onValueChange={(v) => setPosteChoisi(Number(v))}
              className="min-w-0 gap-3"
            >
              <TabsList className="max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto">
                {aPart.map((p) => (
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
                className="flex min-w-0 flex-col gap-3"
              >
                <p data-importance className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Importance :{' '}
                    {LIBELLES_IMPORTANCE[poste.importance ?? 'important']}.
                  </span>{' '}
                  {AIDE_IMPORTANCE[poste.importance ?? 'important']} Se règle
                  dans Postes.
                </p>
                {actions && (
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
                    actions={actions}
                  />
                )}
              </TabsContent>
            </Tabs>
          )}
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

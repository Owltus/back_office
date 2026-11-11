/*
 * Paramètres du Planning : les besoins en personnel. Reprise module par
 * module le 2026-11-11 (demande utilisateur : « imbitable… que le premier
 * venu puisse configurer ») :
 *
 * - le tableau du personnel (les postes indispensables, une seule zone fixe)
 *   dit combien de personnes il faut au minimum, chaque jour, à chaque
 *   moment ; un clic sur une case la règle (`reglerConsigne`) ;
 * - les autres postes n'ont plus de grille : le planning les remplit d'après
 *   les fiches (`besoinsLus`, « tu remplis au mieux suivant chaque
 *   personne ») ;
 * - les Moments, puis l'ordre de décision.
 *
 * Annuler et Rétablir (boutons de l'en-tête, Ctrl + Z, Ctrl + Y) sur toute
 * case. L'écran montre tout de suite la valeur voulue, les écritures partent
 * l'une après l'autre, la consigne RELUE en base.
 */

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Redo2, Undo2 } from 'lucide-react'

import {
  useDroitsPlanning,
  useEcriture,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  HISTORIQUE_VIDE,
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
import { HeuresAccueil } from '#/components/planning/parametres/besoins/HeuresAccueil.tsx'
import { AideBesoins } from '#/components/planning/parametres/besoins/AideBesoins.tsx'
import { useOuvrirCible } from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import type { PropsOuvrir } from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import { CadreReglages } from '#/components/planning/parametres/reglages/cadre.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { planningKeys } from '#/lib/planning/keys.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import { zoneDuPoste } from '#/lib/planning/zones.ts'
import { reglerConsigne } from '#/lib/planning/service.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Consigne, Referentiel } from '#/lib/planning/types.ts'

type Periode = Consigne['periode']

const cleConsigne = (
  zone: number,
  poste: number | null,
  jour: number,
  periode: Periode,
) => `${zone}|${poste ?? ''}|${jour}|${periode}`
const AUCUNE_BORNE: Bornes = { minimum: 0, maximum: null }

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
  const [locales, setLocales] = useState<Map<string, Bornes>>(new Map())
  const file = useRef<Promise<void>>(Promise.resolve())
  const enCours = useRef(0)
  const dernier = useRef<Referentiel | undefined>(undefined)
  dernier.current = data

  const [historique, setHistorique] = useState<Historique>(HISTORIQUE_VIDE)
  const historiqueRef = useRef(historique)
  historiqueRef.current = historique

  // Lien d'un point « À vérifier » : les moments, le tableau, ou un poste
  // (son réglage est le tableau, ou sa fiche quand il n'est pas dedans).
  useOuvrirCible(
    lien,
    !!data,
    (cible) => {
      if (
        cible === 'presence' ||
        cible.startsWith('poste-') ||
        cible.startsWith('soutien-')
      ) {
        window.setTimeout(() => allerA('besoins-presence'), 0)
        return true
      }
      return false
    },
    onOuvert,
  )

  const relu = () =>
    qc.getQueryData<Referentiel>(planningKeys.referentiel()) ?? dernier.current

  /** La zone d'une consigne en base (absente : la première). */
  const premiereZone = data ? Number(lireRegles(data).zones[0].id) : 1
  const zoneDe = (c: Consigne) => c.zone_id ?? premiereZone
  /** La consigne d'une case : zone, poste (null : toute la zone), jour,
   * moment (2026-11-11 : un chiffre par poste). */
  const trouver = (
    liste: readonly Consigne[] | undefined,
    zone: number,
    poste: number | null,
    jour: number,
    periode: Periode,
  ) =>
    liste?.find(
      (x) =>
        zoneDe(x) === zone &&
        (x.poste_id ?? null) === poste &&
        x.jour === jour &&
        x.periode === periode,
    )
  const afficheConsigne = (
    zone: number,
    poste: number | null,
    jour: number,
    periode: Periode,
  ): Bornes => {
    const locale = locales.get(cleConsigne(zone, poste, jour, periode))
    if (locale) return locale
    const c = trouver(data?.consignes, zone, poste, jour, periode)
    return c ? { minimum: c.minimum, maximum: c.maximum } : AUCUNE_BORNE
  }

  /** Écrit les valeurs APRÈS des changements, dans l'ordre, l'une après
   * l'autre : la même écriture pour une action, son annulation et son
   * rétablissement. */
  const appliquer = (changements: Changement[]) => {
    const consignes = changements.filter((c) => c.type === 'consigne')
    if (!modifiable || !consignes.length) return
    setLocales((m) => {
      const suite = new Map(m)
      for (const c of consignes)
        suite.set(cleConsigne(c.zone, c.poste, c.jour, c.periode), c.apres)
      return suite
    })
    enCours.current++
    file.current = file.current.then(async () => {
      const r = await ecrire(async () => {
        for (const c of consignes) {
          await reglerConsigne(
            {
              zone_id: c.zone,
              poste_id: c.poste,
              jour: c.jour,
              periode: c.periode,
              ...c.apres,
            },
            trouver(relu()?.consignes, c.zone, c.poste, c.jour, c.periode),
          )
        }
      }, "Le besoin n'a pas pu être enregistré")
      if (!r.ok) notifier(r.message, 'danger')
      enCours.current--
      if (enCours.current === 0) setLocales(new Map())
    })
  }

  /** Une action de l'utilisateur : gardée pour Annuler, puis écrite. */
  const faire = (entree: Entree) => {
    const changements = entree.changements.filter((c) => !sansEffet(c))
    if (!modifiable || !changements.length) return
    setHistorique((h) => ajouter(h, { ...entree, changements }))
    appliquer(changements)
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

  const reglerAccueil = (
    zone: number,
    poste: number | null,
    nom: string,
    jour: number,
    periode: Periode,
    b: Bornes,
  ) => {
    const avant = afficheConsigne(zone, poste, jour, periode)
    // Un chiffre (minimum = maximum) ; rien de demandé retire la case.
    const haut = Math.max(b.minimum, b.maximum ?? b.minimum)
    const apres: Bornes =
      haut > 0 ? { minimum: b.minimum, maximum: haut } : AUCUNE_BORNE
    faire({
      libelle: `${nom.toLocaleLowerCase('fr-FR')}, ${JOURS[jour].toLowerCase()} ${periode}`,
      changements: [
        { type: 'consigne', zone, poste, jour, periode, avant, apres },
      ],
    })
  }

  const regles = data ? lireRegles(data) : undefined

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
            <AideBesoins />
          </div>
        ) : (
          <AideBesoins />
        )
      }
    >
      {data && regles && (
        // Largeur bornée (audit UX du 2026-10-31) : étalées sur 1 400 px,
        // les 7 colonnes de jours obligeaient l'œil à traverser l'écran.
        <div className="flex w-full max-w-6xl min-w-0 flex-col gap-10">
          <section
            aria-label="Postes indispensables"
            className="flex min-w-0 flex-col gap-8"
          >
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
                    affiche={(poste, j, p) => afficheConsigne(id, poste, j, p)}
                    regler={(poste, nom, j, p, b) =>
                      reglerAccueil(id, poste, nom, j, p, b)
                    }
                  />
                  {/* Zone tenue en continu : ni ouverture ni fermeture à
                      régler (2026-11-11, `aOuvertureFermeture`). */}
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
              Entre deux équipes, la suivante arrive au plus tard quand la
              précédente part, nuit comprise. Le planning préfère qu'elles se
              croisent un moment.
            </p>
          </section>

          {/* « Dans quel ordre le planning décide » : dans l'aide « ? »
              (`AideBesoins`, 2026-11-11). */}
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

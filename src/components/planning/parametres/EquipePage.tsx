/*
 * Écran Équipe du Planning (prototype `EquipePage.tsx`) : le staff rangé par
 * catégorie, en TABLEAU (demande utilisateur du 2026-10-28), une ligne par
 * PERSONNE (2026-11-03 : ses contrats liés ne sont plus des doublons, la
 * ligne montre celui du moment, `parcours.ts`) qui ouvre la fiche ; gestion
 * des catégories en tiroir.
 * Lisible par tous ; ajouter et modifier : gestion seule.
 */

import { estPrefere, NIVEAUX, nomNiveau } from '#/lib/planning/niveaux.ts'
import type { Niveaux } from '#/lib/planning/niveaux.ts'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight, Layers, Scale, UserPlus } from 'lucide-react'

import {
  MenuParametres,
  RetourPlanning,
} from '#/components/planning/EnTeteParametres.tsx'
import {
  useAujourdhui,
  useDroitsPlanning,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import {
  dateFr,
  heuresContrat,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import { GestionCategories } from '#/components/planning/parametres/equipe/GestionCategories.tsx'
import { ReglesContrats } from '#/components/planning/parametres/equipe/ReglesContrats.tsx'
import {
  idCible,
  partieCible,
  useOuvrirCible,
} from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import type { PropsOuvrir } from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import { FicheSalarie } from '#/components/planning/parametres/FicheSalarie.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { PageAvecEnTete } from '#/components/shared/PageAvecEnTete.tsx'
import { LARGEUR_REGLAGES } from '#/components/planning/parametres/reglages/cadre.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  initiales,
  nomComplet,
  aideNiveau,
  parGroupe,
  texteSur,
  deNom,
} from '#/lib/planning/affichage.ts'
import { dansLEquipe, parcours } from '#/lib/planning/parcours.ts'
import type { Parcours } from '#/lib/planning/parcours.ts'
import {
  lireRegles,
  modeleDe,
  nomContrat,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

const GRIS = '#98a2b3'

/** Poste principal : le premier tenu en titulaire, sinon le premier tenu. */
function postePrincipal(
  s: Pick<Salarie, 'competences'>,
  postes: Poste[],
  niveaux: Niveaux = NIVEAUX,
): Poste | undefined {
  const c =
    s.competences.find((x) => estPrefere(niveaux, x.niveau)) ??
    s.competences.at(0)
  return c && postes.find((p) => p.id === c.poste_id)
}

type Fiche = {
  id: number | null
  groupeId: number | null
  /** Partie de la fiche visée par le lien (`salarie-3.semaine`). */
  partie?: string
} | null

export function EquipePage({ ouvrir: lien, onOuvert }: PropsOuvrir = {}) {
  const ref = useReferentiel()
  const { gerer } = useDroitsPlanning()
  const aujourdhui = useAujourdhui()
  const [fiche, setFiche] = useState<Fiche>(null)
  const [categories, setCategories] = useState(false)
  const [regles, setRegles] = useState(false)
  const salaries = ref.data?.salaries ?? []
  useOuvrirCible(
    lien,
    !!ref.data,
    (cible) => {
      // Règles des contrats (point « À vérifier » d'une règle impossible).
      if (cible === 'regles') {
        setRegles(true)
        return true
      }
      const id = idCible(cible, 'salarie')
      const s = ref.data?.salaries.find((x) => x.id === id)
      if (s)
        setFiche({
          id: s.id,
          groupeId: s.groupe_id,
          partie: partieCible(cible),
        })
      return !!s
    },
    onOuvert,
  )

  const ajouter = (
    <Button
      size="sm"
      disabled={!gerer}
      onClick={() => setFiche({ id: null, groupeId: null })}
    >
      <UserPlus /> Ajouter
    </Button>
  )

  // Une ligne par personne, sur son contrat du moment ; les personnes
  // parties vont dans une section repliée en bas : la page montre d'abord
  // l'équipe actuelle.
  const tous = parcours(salaries, aujourdhui)
  const deLaLigne = new Map(tous.map((p) => [p.courant.id, p]))
  const parcoursDe = (s: Salarie) => deLaLigne.get(s.id)
  const actifs = tous
    .filter((p) => dansLEquipe(p, aujourdhui))
    .map((p) => p.courant)
  const anciens = tous
    .filter((p) => !dansLEquipe(p, aujourdhui))
    .map((p) => p.courant)

  return (
    <PageAvecEnTete
      largeur={LARGEUR_REGLAGES}
      entete={
        <PageHeader
          leading={<RetourPlanning />}
          title="Équipe"
          meta={
            ref.data
              ? `${actifs.length} membre${actifs.length > 1 ? 's' : ''} dans l'équipe${anciens.length ? ` · ${anciens.length} ancien${anciens.length > 1 ? 's' : ''}` : ''}`
              : undefined
          }
          actionsAlign="end"
          actions={
            <>
              <ButtonGroup>
                <Tip label="Groupes de l'équipe : rangement et postes autorisés">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!ref.data}
                    onClick={() => setCategories(true)}
                  >
                    <Layers /> Groupes
                  </Button>
                </Tip>
                <Tip label="Règles des contrats : journées, repos et rythme, école">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!ref.data}
                    onClick={() => setRegles(true)}
                  >
                    <Scale /> Règles
                  </Button>
                </Tip>
              </ButtonGroup>
              {gerer ? (
                ajouter
              ) : (
                <Tip label="Lecture seule : seule la gestion du planning ajoute un membre">
                  <span tabIndex={0}>{ajouter}</span>
                </Tip>
              )}
              <MenuParametres actif="/planning/equipe" />
            </>
          }
        />
      }
    >
      {ref.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : ref.isError ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-sm">
          L'équipe n'a pas pu être lue.
          <Button
            variant="outline"
            size="sm"
            onClick={() => void ref.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : salaries.length === 0 ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Personne dans l'équipe pour l'instant.
          {gerer && ' Ajoutez un membre pour commencer.'}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            Chaque fiche décrit le contrat, les postes tenus, la semaine type et
            les absences : le planning automatique s'en sert.
          </p>
          {parGroupe(actifs, ref.data.groupes, ref.data.postes).map((g) => (
            <section
              key={g.id}
              aria-label={g.nom}
              className="flex flex-col gap-2"
            >
              <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                {g.nom}
                <span className="text-xs font-normal text-muted-foreground">
                  {g.membres.length}
                </span>
              </h2>
              <TableauMembres
                membres={g.membres}
                postes={ref.data.postes}
                regles={lireRegles(ref.data)}
                aujourdhui={aujourdhui}
                parcoursDe={parcoursDe}
                onOuvrir={(s) => setFiche({ id: s.id, groupeId: s.groupe_id })}
              />
            </section>
          ))}
          {anciens.length > 0 && (
            <details className="group flex flex-col gap-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                Anciens membres
                <span className="text-xs font-normal">{anciens.length}</span>
                <span className="text-xs font-normal">
                  (partis ou désactivés, gardés pour l'historique)
                </span>
              </summary>
              <div className="mt-2">
                <TableauMembres
                  membres={anciens}
                  postes={ref.data.postes}
                  regles={lireRegles(ref.data)}
                  aujourdhui={aujourdhui}
                  parcoursDe={parcoursDe}
                  onOuvrir={(s) =>
                    setFiche({ id: s.id, groupeId: s.groupe_id })
                  }
                />
              </div>
            </details>
          )}
        </div>
      )}

      <FicheSalarie
        salarieId={fiche?.id ?? null}
        groupeId={fiche?.groupeId ?? null}
        partie={fiche?.partie}
        ouvert={fiche !== null}
        onFermer={() => setFiche(null)}
        onOuvrirContrat={(s) => setFiche({ id: s.id, groupeId: s.groupe_id })}
      />
      {ref.data && (
        <GestionCategories
          ouvert={categories}
          onFermer={() => setCategories(false)}
          groupes={ref.data.groupes}
          postes={ref.data.postes}
          salaries={salaries}
        />
      )}
      {ref.data && (
        <ReglesContrats
          ouvert={regles}
          onFermer={() => setRegles(false)}
          referentiel={ref.data}
        />
      )}
    </PageAvecEnTete>
  )
}

function Puce({
  children,
  ton,
}: {
  children: ReactNode
  ton?: 'depart' | 'arrivee' | 'fin'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        !ton && 'border-border text-muted-foreground',
        ton === 'depart' && 'border-destructive/40 text-destructive',
        ton === 'arrivee' && 'border-primary/40 text-primary',
        ton === 'fin' && 'border-amber-500/40 text-amber-500',
      )}
    >
      {children}
    </span>
  )
}

/*
 * Colonnes FIGÉES (`table-fixed`, largeurs sur l'en-tête) : les tableaux de chaque
 * catégorie s'alignent. Sous 52 rem de large (requête de conteneur), contrat
 * et heures passent sous le nom au lieu d'ouvrir une barre horizontale.
 */
const TH = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground'

function TableauMembres({
  membres,
  postes,
  regles,
  aujourdhui,
  parcoursDe,
  onOuvrir,
}: {
  membres: Salarie[]
  postes: Poste[]
  regles: RegleEtablissement
  aujourdhui: string
  parcoursDe: (s: Salarie) => Parcours | undefined
  onOuvrir: (s: Salarie) => void
}) {
  return (
    <div className="@container overflow-hidden rounded-xl border bg-card">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr className="border-b">
            <th className={cn(TH, 'w-[17rem]')}>Membre</th>
            <th className={cn(TH, 'hidden w-[9rem] @min-[52rem]:table-cell')}>
              Contrat
            </th>
            <th className={cn(TH, 'hidden w-[8rem] @min-[52rem]:table-cell')}>
              Heures
            </th>
            <th className={TH}>Postes</th>
            <th className={cn(TH, 'w-[9rem]')}>Situation</th>
          </tr>
        </thead>
        <tbody>
          {membres.map((s) => (
            <LigneMembre
              key={s.id}
              s={s}
              parcours={parcoursDe(s)}
              postes={postes}
              regles={regles}
              aujourdhui={aujourdhui}
              onOuvrir={() => onOuvrir(s)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Ce que change le contrat suivant : poste, type de contrat, ou rien de
 * plus qu'un nouveau contrat. */
export function texteSuivant(
  courant: Salarie,
  suivant: Salarie,
  postes: Poste[],
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): string {
  const quand = dateFr(suivant.date_entree as string)
  if (
    postePrincipal(courant, postes, regles.niveaux)?.id !==
    postePrincipal(suivant, postes, regles.niveaux)?.id
  )
    return `Nouveau poste le ${quand}`
  if (courant.type_contrat !== suivant.type_contrat)
    return `${nomContrat(regles, suivant.type_contrat)} le ${quand}`
  return `Nouveau contrat le ${quand}`
}

/** Postes d'une personne, une ligne chacun, rangés par niveau puis dans
 * l'ordre des postes ; le niveau toujours écrit à droite. */
function PostesDuMembre({
  s,
  postes,
  regles,
}: {
  s: Salarie
  postes: Poste[]
  regles: RegleEtablissement
}) {
  const lignes = s.competences
    .map((c) => ({
      c,
      p: postes.find((x) => x.id === c.poste_id),
      n: regles.niveaux.parId.get(c.niveau),
    }))
    .filter((l): l is typeof l & { p: Poste } => !!l.p)
    .sort(
      (a, b) =>
        (a.n?.position ?? 99) - (b.n?.position ?? 99) ||
        postes.indexOf(a.p) - postes.indexOf(b.p),
    )
  if (lignes.length === 0)
    return <span className="text-xs text-muted-foreground">Aucun poste</span>
  return (
    <ul className="flex flex-col gap-1">
      {lignes.map(({ c, p, n }) => (
        <li
          key={c.poste_id}
          className="flex min-w-0 items-center gap-2 text-xs"
        >
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ background: p.couleur }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{p.nom}</span>
          <Tip label={n ? aideNiveau(n) : c.niveau}>
            <span className="w-[5.5rem] shrink-0 rounded-full bg-muted px-2 py-0.5 text-center text-muted-foreground">
              {nomNiveau(regles.niveaux, c.niveau)}
            </span>
          </Tip>
        </li>
      ))}
    </ul>
  )
}

function LigneMembre({
  s,
  parcours: p,
  postes,
  regles,
  aujourdhui,
  onOuvrir,
}: {
  regles: RegleEtablissement
  s: Salarie
  parcours?: Parcours
  postes: Poste[]
  aujourdhui: string
  onOuvrir: () => void
}) {
  const couleur = postePrincipal(s, postes, regles.niveaux)?.couleur ?? GRIS
  const sorti = !!s.date_sortie && s.date_sortie < aujourdhui
  const parti = sorti || !s.actif
  const contrat = nomContrat(regles, s.type_contrat)
  const heures = s.forfait_jours
    ? 'Forfait jours'
    : modeleDe(regles, s.type_contrat).placementManuel && !s.heures_hebdo
      ? 'Sans heures'
      : heuresContrat(s.heures_hebdo)
  return (
    // La ligne entière ouvre la fiche ; le bouton du nom la rend
    // atteignable au clavier.
    <tr
      onClick={onOuvrir}
      data-parti={parti || undefined}
      className={cn(
        'cursor-pointer border-b border-border/50 transition-colors last:border-b-0 hover:bg-accent/40',
        parti && 'opacity-55',
      )}
    >
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOuvrir()
          }}
          aria-label={`Ouvrir la fiche ${deNom(nomComplet(s))}`}
          className="flex w-full min-w-0 items-center gap-2.5 rounded-md text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            style={{ background: couleur, color: texteSur(couleur) }}
            aria-hidden
          >
            {initiales(s)}
          </span>
          <span className="flex min-w-0 flex-col">
            <strong className="truncate font-medium">{nomComplet(s)}</strong>
            <span className="truncate text-xs text-muted-foreground @min-[52rem]:hidden">
              {contrat} · {heures}
            </span>
          </span>
        </button>
      </td>
      <td className="hidden truncate px-3 py-2 text-muted-foreground @min-[52rem]:table-cell">
        {contrat}
      </td>
      <td className="hidden truncate px-3 py-2 text-muted-foreground tabular-nums @min-[52rem]:table-cell">
        {heures}
      </td>
      <td className="px-3 py-2">
        <PostesDuMembre s={s} postes={postes} regles={regles} />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {s.mineur && <Puce>Mineur</Puce>}
          {!s.actif && <Puce ton="depart">Désactivé</Puce>}
          {s.date_entree && s.date_entree > aujourdhui && (
            <Puce ton="arrivee">Arrive le {dateFr(s.date_entree)}</Puce>
          )}
          {/* Un contrat qui en suit un autre : le changement, pas une fin. */}
          {p?.suivant ? (
            <Puce ton="arrivee">
              {texteSuivant(s, p.suivant, postes, regles)}
            </Puce>
          ) : (
            s.date_sortie && (
              <Puce ton={sorti ? 'depart' : 'fin'}>
                {sorti ? 'Parti(e) le' : 'Fin le'} {dateFr(s.date_sortie)}
              </Puce>
            )
          )}
          {p && p.contrats.length > 1 && (
            <Tip label="Contrats successifs de la même personne : la fiche les liste.">
              <span>
                <Puce>{p.contrats.length} contrats</Puce>
              </span>
            </Tip>
          )}
        </div>
      </td>
    </tr>
  )
}

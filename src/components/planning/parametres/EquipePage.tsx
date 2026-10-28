/*
 * Écran Équipe du Planning (prototype `EquipePage.tsx`) : le staff rangé par
 * catégorie, en TABLEAU (demande utilisateur du 2026-10-28), une ligne par
 * personne qui ouvre la fiche ; gestion des catégories en tiroir.
 * Lisible par tous ; ajouter et modifier : gestion seule.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight, Layers, UserPlus } from 'lucide-react'

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
import { FicheSalarie } from '#/components/planning/parametres/FicheSalarie.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { PageAvecEnTete } from '#/components/shared/PageAvecEnTete.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  initiales,
  nomComplet,
  NIVEAUX,
  parGroupe,
  texteSur,
  deNom,
} from '#/lib/planning/affichage.ts'
import { TYPES_CONTRAT } from '#/lib/planning/types.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

const CONTRATS = new Map(TYPES_CONTRAT.map((t) => [t.code, t.libelle]))
const GRIS = '#98a2b3'

/** Poste principal : le premier tenu en titulaire, sinon le premier tenu. */
function postePrincipal(
  s: Pick<Salarie, 'competences'>,
  postes: Poste[],
): Poste | undefined {
  const c =
    s.competences.find((x) => x.niveau === 'titulaire') ?? s.competences.at(0)
  return c && postes.find((p) => p.id === c.poste_id)
}

type Fiche = { id: number | null; groupeId: number | null } | null

export function EquipePage() {
  const ref = useReferentiel()
  const { gerer } = useDroitsPlanning()
  const aujourdhui = useAujourdhui()
  const [fiche, setFiche] = useState<Fiche>(null)
  const [categories, setCategories] = useState(false)
  const salaries = ref.data?.salaries ?? []

  const ajouter = (
    <Button
      size="sm"
      disabled={!gerer}
      onClick={() => setFiche({ id: null, groupeId: null })}
    >
      <UserPlus /> Ajouter
    </Button>
  )

  // Les membres partis ou désactivés vont dans une section repliée en bas :
  // la page montre d'abord l'équipe actuelle.
  const actifs = salaries.filter((s) => estActuel(s, aujourdhui))
  const anciens = salaries.filter((s) => !estActuel(s, aujourdhui))

  return (
    <PageAvecEnTete
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
            les absences : le moteur s'en sert pour générer le planning.
          </p>
          {parGroupe(actifs, ref.data.groupes).map((g) => (
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
                aujourdhui={aujourdhui}
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
                  aujourdhui={aujourdhui}
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
        ouvert={fiche !== null}
        onFermer={() => setFiche(null)}
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
    </PageAvecEnTete>
  )
}

/** Dans l'équipe aujourd'hui : actif et sans fin de contrat passée. */
const estActuel = (s: Salarie, aujourdhui: string) =>
  s.actif && (!s.date_sortie || s.date_sortie >= aujourdhui)

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
  aujourdhui,
  onOuvrir,
}: {
  membres: Salarie[]
  postes: Poste[]
  aujourdhui: string
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
              postes={postes}
              aujourdhui={aujourdhui}
              onOuvrir={() => onOuvrir(s)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LigneMembre({
  s,
  postes,
  aujourdhui,
  onOuvrir,
}: {
  s: Salarie
  postes: Poste[]
  aujourdhui: string
  onOuvrir: () => void
}) {
  const couleur = postePrincipal(s, postes)?.couleur ?? GRIS
  const sorti = !!s.date_sortie && s.date_sortie < aujourdhui
  const parti = sorti || !s.actif
  const contrat = CONTRATS.get(s.type_contrat) ?? s.type_contrat
  const heures = s.forfait_jours
    ? 'Forfait jours'
    : s.type_contrat === 'extra' && !s.heures_hebdo
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
        {s.competences.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {s.competences.map((c) => {
              const p = postes.find((x) => x.id === c.poste_id)
              if (!p) return null
              return (
                <Tip key={c.poste_id} label={NIVEAUX[c.niveau].aide}>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: p.couleur }}
                    />
                    {p.nom}
                    {c.niveau !== 'titulaire' && (
                      <span className="text-muted-foreground">
                        · {NIVEAUX[c.niveau].libelle}
                      </span>
                    )}
                  </span>
                </Tip>
              )
            })}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Aucun poste</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {s.mineur && <Puce>Mineur</Puce>}
          {!s.actif && <Puce ton="depart">Désactivé</Puce>}
          {s.date_entree && s.date_entree > aujourdhui && (
            <Puce ton="arrivee">Arrive le {dateFr(s.date_entree)}</Puce>
          )}
          {s.date_sortie && (
            <Puce ton={sorti ? 'depart' : 'fin'}>
              {sorti ? 'Parti(e) le' : 'Fin le'} {dateFr(s.date_sortie)}
            </Puce>
          )}
        </div>
      </td>
    </tr>
  )
}

/*
 * La grille des besoins d'UN poste (refonte du 2026-10-31, demande
 * utilisateur : « très compliquée à comprendre… respecte les bonnes
 * pratiques des applications RH ») : comme la semaine type des besoins en
 * personnel de Skello ou Planday, une ligne par horaire, une colonne par
 * jour, UN chiffre par case, les personnes nécessaires.
 *
 * Les places pour apprentis ou stagiaires et les places en plus si besoin
 * sont des OPTIONS de la case : un clic (ou Entrée) ouvre son panneau, qui
 * règle les trois valeurs et peut les recopier, explicitement, sur d'autres
 * jours de la même ligne. Une case qui a des options le montre par un petit
 * repère (« +1 app. », « +1 si besoin »). Depuis le 2026-11-05 (étape 7,
 * D4), le panneau dit aussi si les personnes nécessaires sont obligatoires
 * ou souhaitées, et le niveau demandé (titulaire seulement, ou titulaire ou
 * dépannage) ; repères « souhaité » et « titulaire ». Aucune action en un clic qui
 * touche plusieurs jours sans le dire : le bouton qui recopiait le lundi sur
 * toute la semaine, pour les trois réglages, est retiré.
 */

import { useState } from 'react'
import { Ellipsis, Plus, TriangleAlert } from 'lucide-react'

import { Segmente } from '#/components/planning/parametres/equipe/Segmente.tsx'
import { Compteur } from '#/components/planning/parametres/reglages/controles.tsx'
import {
  aUneBase,
  estSouhaite,
  horairesAAjouter,
  lignesDuPoste,
  optionsDe,
  soutienSansBase,
  titulaireSeulement,
} from '#/components/planning/parametres/reglages/besoins.ts'
import type {
  LigneBesoin,
  Reglage,
} from '#/components/planning/parametres/reglages/besoins.ts'
import type { CibleCopie } from '#/components/planning/parametres/besoins/historique.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { libelleHoraire, libelleMoment } from '#/lib/planning/affichage.ts'
import { codesDuPoste } from '#/lib/planning/eligibilite.ts'
import { alerteBesoin } from '#/lib/planning/regles.ts'
import { presence } from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type {
  Horaire,
  NiveauDemande,
  Poste,
  Referentiel,
} from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'
import { useMoments } from '#/components/planning/hooks/useMoments.ts'

export type Affiche = (
  posteId: number,
  ligne: LigneBesoin,
  jour: number,
) => Reglage

/** Les lignes montrées pour un poste : ses besoins, plus les horaires
 * ajoutés ou réglés pendant la séance (`gardees`). */
export function lignesAffichees(
  poste: Poste,
  referentiel: Referentiel,
  gardees: ReadonlySet<string>,
): LigneBesoin[] {
  return lignesDuPoste(
    referentiel.besoins.filter((b) => b.poste_id === poste.id),
    referentiel.horaires,
    gardees,
  )
}

/** Présence demandée par semaine, en minutes : personnes nécessaires ×
 * durée de l'horaire (pause non déduite, comme le prototype). */
export function presenceSemaine(
  poste: Poste,
  lignes: LigneBesoin[],
  affiche: Affiche,
): number {
  let total = 0
  for (const l of lignes) {
    for (let j = 0; j < 7; j++) {
      total += affiche(poste.id, l, j).effectif * presence(l.debut, l.fin)
    }
  }
  return total
}

const pluriel = (n: number, un: string, plusieurs: string) =>
  n > 1 ? `${n} ${plusieurs}` : `${n} ${un}`

/** Nom complet d'une case pour les lecteurs d'écran. */
export function nomCase(
  poste: Poste,
  ligne: LigneBesoin,
  jour: number,
  r: Reglage,
): string {
  const n =
    r.effectif === 0
      ? 'aucune personne nécessaire'
      : pluriel(r.effectif, 'personne nécessaire', 'personnes nécessaires')
  const options: string[] = []
  if (r.soutien > 0)
    options.push(
      pluriel(
        r.soutien,
        'place pour apprenti ou stagiaire',
        'places pour apprentis ou stagiaires',
      ),
    )
  if (r.renfort > 0) options.push(`${r.renfort} en plus si besoin`)
  if (r.effectif > 0 && estSouhaite(r)) options.push('souhaité')
  if (r.effectif + r.renfort > 0 && titulaireSeulement(r))
    options.push('titulaire seulement')
  return `${poste.nom}, ${JOURS[jour].toLowerCase()}, ${libelleHoraire(ligne)} : ${[n, ...options].join(', ')}`
}

export interface ActionsGrille {
  /** Un compteur du panneau d'une case. */
  regler: (
    ligne: LigneBesoin,
    jour: number,
    champ: keyof Reglage,
    v: number,
  ) => void
  /** Obligatoire ou souhaité, niveau demandé (2026-11-05). */
  option: (
    ligne: LigneBesoin,
    jour: number,
    patch: { obligatoire?: boolean; niveau_min?: NiveauDemande },
  ) => void
  /** « Appliquer ces réglages à » : toutes les valeurs de la case. */
  copier: (ligne: LigneBesoin, jour: number, cible: CibleCopie) => void
  vider: (ligne: LigneBesoin) => void
  /** Les places d'apprentis sans personne à côté, sur toute la ligne. */
  retirerOrphelins: (ligne: LigneBesoin) => void
  ajouterLigne: (cle: string) => void
}

export function GrilleBesoins({
  poste,
  referentiel,
  lignes,
  modifiable,
  affiche,
  actions,
}: {
  poste: Poste
  referentiel: Referentiel
  lignes: LigneBesoin[]
  modifiable: boolean
  affiche: Affiche
  actions: ActionsGrille
}) {
  const possibles = codesDuPoste(poste, referentiel.horaires)
  const aAjouter = horairesAAjouter(possibles, lignes)
  const restreint = poste.horaires_autorises.length > 0
  const totaux = JOURS.map((_, j) =>
    lignes.reduce((n, l) => n + affiche(poste.id, l, j).effectif, 0),
  )

  return (
    <div className="flex flex-col gap-3">
      {lignes.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {modifiable
            ? "Ce poste n'a besoin de personne pour l'instant. Ajoutez un horaire pour en demander."
            : "Ce poste n'a besoin de personne pour l'instant."}
        </p>
      ) : (
        // Trop large pour l'écran : la grille défile DANS sa carte, jamais
        // la page ; la colonne des horaires reste visible.
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table
            aria-label={`Besoins du poste ${poste.nom}`}
            className="w-full min-w-[44rem] table-fixed border-collapse text-sm"
          >
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-[1] w-[11.5rem] bg-muted px-3 py-2 text-left font-medium">
                  Horaire
                </th>
                {JOURS.map((j) => (
                  <th key={j} className="px-1 py-2 text-center font-medium">
                    <span aria-hidden>{j.slice(0, 3)}.</span>
                    <span className="sr-only">{j}</span>
                  </th>
                ))}
                <th className="w-10 px-1 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <LigneGrille
                  key={ligne.cle}
                  poste={poste}
                  ligne={ligne}
                  horaire={referentiel.horaires.find(
                    (h) => h.id === ligne.horaire_id,
                  )}
                  permise={
                    ligne.horaire_id === null ||
                    possibles.some((h) => h.id === ligne.horaire_id)
                  }
                  modifiable={modifiable}
                  affiche={affiche}
                  actions={actions}
                />
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/50 text-xs">
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-[1] bg-muted px-3 py-2 text-left font-medium text-muted-foreground"
                >
                  Total du jour
                </th>
                {totaux.map((t, j) => (
                  <td
                    key={j}
                    className={cn(
                      'px-1 py-2 text-center font-semibold tabular-nums',
                      t === 0 && 'text-muted-foreground/60',
                    )}
                  >
                    {t}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {modifiable && aAjouter.length > 0 && (
        <div>
          <AjoutHoraire
            poste={poste}
            horaires={aAjouter}
            aide={
              restreint
                ? `Les horaires choisis pour ce poste dans Postes (${possibles.length}).`
                : `Aucun horaire choisi pour ce poste dans Postes : les ${possibles.length} horaires sont proposés.`
            }
            onChoisir={(h) => actions.ajouterLigne(`t${h.id}`)}
          />
        </div>
      )}
    </div>
  )
}

function LigneGrille({
  poste,
  ligne,
  horaire,
  permise,
  modifiable,
  affiche,
  actions,
}: {
  poste: Poste
  ligne: LigneBesoin
  horaire: Horaire | undefined
  permise: boolean
  modifiable: boolean
  affiche: Affiche
  actions: ActionsGrille
}) {
  const moments = useMoments()
  const nom = libelleHoraire(ligne)
  const reglages = JOURS.map((_, j) => affiche(poste.id, ligne, j))
  const trop = alerteBesoin(poste, presence(ligne.debut, ligne.fin))
  const orphelins = reglages.filter(soutienSansBase).length
  const alertes = [
    !permise && "Cet horaire n'est pas dans les horaires possibles du poste.",
    trop && `Trop long : ${trop}.`,
    orphelins > 0 &&
      (orphelins > 1
        ? `Places pour apprentis ou stagiaires sans personne à côté, ${orphelins} jours : elles ne seront jamais pourvues.`
        : 'Place pour apprenti ou stagiaire sans personne à côté : elle ne sera jamais pourvue.'),
  ].filter((a): a is string => typeof a === 'string')
  const vide = reglages.every(
    (r) => r.effectif === 0 && r.soutien === 0 && r.renfort === 0,
  )

  return (
    <tr className="border-t">
      <th
        scope="row"
        className="sticky left-0 z-[1] bg-card px-3 py-2 text-left font-normal"
      >
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-1.5 size-2.5 shrink-0 rounded-full"
            style={{ background: horaire?.couleur ?? '#98a2b3' }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium tabular-nums">{nom}</div>
            <div className="text-xs text-muted-foreground">
              {horaire
                ? libelleMoment(horaire.periode, moments)
                : 'Horaire spécifique'}
            </div>
          </div>
          {alertes.length > 0 && (
            <Tip
              label={
                <span className="flex max-w-64 flex-col gap-1">
                  {alertes.map((a) => (
                    <span key={a}>{a}</span>
                  ))}
                </span>
              }
            >
              <span
                tabIndex={0}
                data-alerte-ligne
                className="mt-0.5 inline-flex shrink-0 rounded text-amber-500 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <TriangleAlert aria-hidden className="size-4" />
                <span className="sr-only">{alertes.join(' ')}</span>
              </span>
            </Tip>
          )}
        </div>
      </th>
      {reglages.map((r, j) => (
        <td key={j} className="p-1 text-center">
          <CaseBesoin
            poste={poste}
            ligne={ligne}
            jour={j}
            reglage={r}
            modifiable={modifiable}
            actions={actions}
          />
        </td>
      ))}
      <td className="px-1 py-2 text-center">
        {modifiable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions de la ligne ${nom}`}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={vide}
                onSelect={() => actions.vider(ligne)}
              >
                Vider cette ligne
              </DropdownMenuItem>
              {orphelins > 0 && (
                <DropdownMenuItem
                  onSelect={() => actions.retirerOrphelins(ligne)}
                >
                  Retirer les places d'apprentis sans personne à côté
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </td>
    </tr>
  )
}

function CaseBesoin({
  poste,
  ligne,
  jour,
  reglage: r,
  modifiable,
  actions,
}: {
  poste: Poste
  ligne: LigneBesoin
  jour: number
  reglage: Reglage
  modifiable: boolean
  actions: ActionsGrille
}) {
  const [ouvert, setOuvert] = useState(false)
  const orphelin = soutienSansBase(r)
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={nomCase(poste, ligne, jour, r)}
          data-case={`${ligne.cle}|${jour}`}
          className={cn(
            'flex min-h-14 w-full flex-col items-center justify-center rounded-md border border-transparent transition-colors outline-none hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
            ouvert && 'border-primary bg-primary/10',
          )}
        >
          <span
            className={cn(
              'text-lg leading-6 font-semibold tabular-nums',
              r.effectif === 0 && 'text-muted-foreground/40',
              r.effectif > 0 && estSouhaite(r) && 'text-muted-foreground',
            )}
          >
            {r.effectif === 0 ? '–' : r.effectif}
          </span>
          <span className="flex min-h-4 flex-wrap justify-center gap-x-1 text-[10px] leading-4 text-muted-foreground">
            {r.soutien > 0 && (
              <span
                data-repere="soutien"
                className={cn(orphelin && 'text-amber-500 line-through')}
              >
                +{r.soutien} app.
              </span>
            )}
            {r.renfort > 0 && (
              <span data-repere="renfort">+{r.renfort} si besoin</span>
            )}
            {r.effectif > 0 && estSouhaite(r) && (
              <span data-repere="souhaite">souhaité</span>
            )}
            {r.effectif + r.renfort > 0 && titulaireSeulement(r) && (
              <span data-repere="titulaire">titulaire</span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-80"
        aria-label={`${poste.nom} · ${JOURS[jour]} · ${libelleHoraire(ligne)}`}
      >
        <PanneauCase
          poste={poste}
          ligne={ligne}
          jour={jour}
          r={r}
          modifiable={modifiable}
          actions={actions}
          fermer={() => setOuvert(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

type ChoixObligation = 'obligatoire' | 'souhaite'

/** Obligatoire ou souhaité, et niveau demandé (2026-11-05, D4) : sans
 * personne nécessaire ni en plus, rien à régler (la case serait vide). */
function OptionsNiveau({
  r,
  modifiable,
  onChange,
}: {
  r: Reglage
  modifiable: boolean
  onChange: (patch: {
    obligatoire?: boolean
    niveau_min?: NiveauDemande
  }) => void
}) {
  const o = optionsDe(r)
  const sansPersonne = r.effectif === 0
  const sansPlace = r.effectif + r.renfort === 0
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <Segmente<ChoixObligation>
          label="Personnes nécessaires obligatoires ou souhaitées"
          valeur={o.obligatoire ? 'obligatoire' : 'souhaite'}
          options={[
            { valeur: 'obligatoire', libelle: 'Obligatoire' },
            { valeur: 'souhaite', libelle: 'Souhaité' },
          ]}
          disabled={!modifiable || sansPersonne}
          onChange={(v) => onChange({ obligatoire: v === 'obligatoire' })}
        />
        <p className="text-xs text-muted-foreground">
          {sansPersonne
            ? "Mettez d'abord une personne nécessaire."
            : o.obligatoire
              ? 'Une place à pourvoir si personne ne la tient.'
              : "Tenue si quelqu'un est libre. Quand il manque du monde, elle reste vide en premier, sans compter comme place à pourvoir."}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium">Niveau demandé</p>
        <Segmente<NiveauDemande>
          label="Niveau demandé"
          valeur={o.niveau_min}
          options={[
            { valeur: 'titulaire', libelle: 'Titulaire seulement' },
            { valeur: 'depannage', libelle: 'Titulaire ou dépannage' },
          ]}
          disabled={!modifiable || sansPlace}
          onChange={(v) => onChange({ niveau_min: v })}
        />
        <p className="text-xs text-muted-foreground">
          {o.niveau_min === 'titulaire'
            ? 'Seule une personne titulaire du poste tient la place. Un apprenti ou un stagiaire peut venir en plus, jamais seul.'
            : "Une personne en dépannage peut tenir la place si aucun titulaire n'est libre."}
        </p>
      </div>
    </div>
  )
}

const COPIES: ReadonlyArray<{ cible: CibleCopie; libelle: string }> = [
  { cible: 'semaine', libelle: 'Toute la semaine' },
  { cible: 'ouvres', libelle: 'Du lundi au vendredi' },
  { cible: 'weekend', libelle: 'Samedi et dimanche' },
]

function PanneauCase({
  poste,
  ligne,
  jour,
  r,
  modifiable,
  actions,
  fermer,
}: {
  poste: Poste
  ligne: LigneBesoin
  jour: number
  r: Reglage
  modifiable: boolean
  actions: ActionsGrille
  fermer: () => void
}) {
  const [options, setOptions] = useState(r.soutien > 0 || r.renfort > 0)
  const base = aUneBase(r)
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-semibold">
        {poste.nom} · {JOURS[jour]} · {libelleHoraire(ligne)}
      </p>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Personnes nécessaires</p>
          <p className="text-xs text-muted-foreground">
            Le planning automatique les place en priorité.
          </p>
        </div>
        <Compteur
          valeur={r.effectif}
          etiquette="Personnes nécessaires"
          disabled={!modifiable}
          onChange={(v) => actions.regler(ligne, jour, 'effectif', v)}
        />
      </div>

      <OptionsNiveau
        r={r}
        modifiable={modifiable}
        onChange={(patch) => actions.option(ligne, jour, patch)}
      />

      <div className="flex flex-col gap-2 border-t pt-2">
        <button
          type="button"
          aria-expanded={options}
          className="self-start text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:underline focus-visible:outline-none"
          onClick={() => setOptions((o) => !o)}
        >
          {options ? 'Masquer les options' : 'Options'}
        </button>
        {options && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  Places pour apprentis ou stagiaires
                </p>
                <p className="text-xs text-muted-foreground">
                  {base
                    ? "Pour quelqu'un qui apprend à côté d'une personne nécessaire. Il ne compte pas seul."
                    : "Mettez d'abord une personne nécessaire : un apprenti ou un stagiaire n'est jamais seul."}
                </p>
              </div>
              <Compteur
                valeur={r.soutien}
                // Sans personne à côté : on peut seulement retirer.
                max={base ? 5 : r.soutien}
                etiquette="Places pour apprentis ou stagiaires"
                disabled={!modifiable}
                onChange={(v) => actions.regler(ligne, jour, 'soutien', v)}
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">En plus si besoin</p>
                <p className="text-xs text-muted-foreground">
                  Des places facultatives. Le planning s'en sert si quelqu'un
                  manque d'heures, ou pour tenir le matin, le soir ou la nuit.
                </p>
              </div>
              <Compteur
                valeur={r.renfort}
                max={5}
                etiquette="En plus si besoin"
                disabled={!modifiable}
                onChange={(v) => actions.regler(ligne, jour, 'renfort', v)}
              />
            </div>
          </>
        )}
      </div>

      {modifiable && (
        <div className="flex flex-col gap-1.5 border-t pt-2">
          <p className="text-xs text-muted-foreground">
            Appliquer ces réglages à :
          </p>
          <div className="flex flex-wrap gap-1.5">
            {COPIES.map(({ cible, libelle }) => (
              <Button
                key={cible}
                variant="outline"
                size="sm"
                onClick={() => {
                  actions.copier(ligne, jour, cible)
                  fermer()
                }}
              >
                {libelle}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Liste des horaires permis qui n'ont pas encore de ligne, rangés par heure. */
function AjoutHoraire({
  poste,
  horaires,
  aide,
  onChoisir,
}: {
  poste: Poste
  horaires: Horaire[]
  /** D'où viennent les horaires proposés (réglage du poste). */
  aide: string
  onChoisir: (h: Horaire) => void
}) {
  const moments = useMoments()
  const [ouvert, setOuvert] = useState(false)
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Ajouter un horaire au poste ${poste.nom}`}
        >
          <Plus />
          Ajouter un horaire
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1">
        <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">{aide}</p>
        <ul
          aria-label="Horaires à ajouter"
          className="flex max-h-80 flex-col overflow-y-auto"
        >
          {horaires.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => {
                  onChoisir(h)
                  setOuvert(false)
                }}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: h.couleur }}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium tabular-nums">
                    {libelleHoraire(h)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {libelleMoment(h.periode, moments)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

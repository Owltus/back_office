/*
 * Section Identité et contrat de la fiche (prototype `FicheSalarie`), avec
 * le bloc Nouveau contrat (évolution du contrat).
 */

import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Repeat } from 'lucide-react'

import {
  changerCategorie,
  changerContrat,
  evolutionParDefaut,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import type {
  Brouillon,
  Evolution,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import {
  Interrupteur,
  Liste,
  Section,
} from '#/components/planning/parametres/equipe/Champs.tsx'
import type { PropsSection } from '#/components/planning/parametres/equipe/SectionsFiche.tsx'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { TYPES_CONTRAT } from '#/lib/planning/types.ts'
import type { TypeContrat } from '#/lib/planning/types.ts'

const OPTIONS_CONTRAT = TYPES_CONTRAT.map((t) => ({
  valeur: t.code,
  libelle: t.libelle,
}))

function Champ({
  label,
  aide,
  children,
}: {
  label: string
  aide?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  const libelle = (
    <Label htmlFor={id} className="w-fit text-xs">
      {label}
    </Label>
  )
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {aide ? <Tip label={aide}>{libelle}</Tip> : libelle}
      {children(id)}
    </div>
  )
}

export function SectionIdentite({
  b,
  maj,
  referentiel,
  disabled,
  aujourdhui,
  enCours,
  onEvoluer,
}: PropsSection & {
  aujourdhui: string
  enCours: boolean
  onEvoluer: (e: Evolution) => Promise<boolean>
}) {
  const notifier = useNotifier()
  const { groupes, postes } = referentiel
  const optionsGroupe = [
    { valeur: 'aucune', libelle: 'Sans groupe' },
    ...groupes.map((g) => ({ valeur: String(g.id), libelle: g.nom })),
  ]
  const [evolution, setEvolution] = useState<Evolution | null>(null)

  const choisirCategorie = (v: string) => {
    const groupeId = v === 'aucune' ? null : Number(v)
    const r = changerCategorie(b, groupeId, postes, groupes)
    maj(() => r.brouillon)
    if (r.perdues) {
      notifier(
        `${r.perdues} compétence${r.perdues > 1 ? 's' : ''} retirée${r.perdues > 1 ? 's' : ''} : poste non prévu pour ce groupe`,
        'attention',
      )
    }
  }

  return (
    <Section titre="Identité et contrat">
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ label="Prénom">
          {(id) => (
            <Input
              id={id}
              value={b.prenom}
              disabled={disabled}
              maxLength={80}
              onChange={(e) => {
                const prenom = e.target.value
                maj((x) => ({ ...x, prenom }))
              }}
            />
          )}
        </Champ>
        <Champ label="Nom">
          {(id) => (
            <Input
              id={id}
              value={b.nom}
              disabled={disabled}
              maxLength={80}
              onChange={(e) => {
                const nom = e.target.value
                maj((x) => ({ ...x, nom }))
              }}
            />
          )}
        </Champ>
        <Liste
          label="Groupe"
          valeur={b.groupe_id === null ? 'aucune' : String(b.groupe_id)}
          options={optionsGroupe}
          onChange={choisirCategorie}
          disabled={disabled}
        />
        <Liste
          label="Contrat"
          valeur={b.type_contrat}
          options={OPTIONS_CONTRAT}
          onChange={(v) => maj((x) => changerContrat(x, v as TypeContrat))}
          disabled={disabled}
        />
        <Champ label="Heures par semaine">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={48}
              step={0.5}
              disabled={disabled}
              value={Number.isFinite(b.heures_hebdo) ? b.heures_hebdo : ''}
              onChange={(e) => {
                const h =
                  e.target.value === '' ? Number.NaN : Number(e.target.value)
                maj((x) => ({ ...x, heures_hebdo: h }))
              }}
            />
          )}
        </Champ>
        <div className="hidden sm:block" />
        <Champ label="Arrivée" aide="Vide : présent depuis toujours">
          {(id) => (
            <Input
              id={id}
              type="date"
              disabled={disabled}
              value={b.date_entree ?? ''}
              onChange={(e) => {
                const v = e.target.value || null
                maj((x) => ({ ...x, date_entree: v }))
              }}
            />
          )}
        </Champ>
        <Champ
          label="Fin de contrat"
          aide="Fin de CDD, démission, fin de contrat… Après cette date, plus jamais planifié(e) ; reste dans l'historique"
        >
          {(id) => (
            <Input
              id={id}
              type="date"
              disabled={disabled}
              min={b.date_entree ?? undefined}
              value={b.date_sortie ?? ''}
              onChange={(e) => {
                const v = e.target.value || null
                maj((x) => ({ ...x, date_sortie: v }))
              }}
            />
          )}
        </Champ>
      </div>
      <div className="flex flex-col gap-2">
        <Interrupteur
          coche={b.forfait_jours}
          disabled={disabled}
          onChange={(v) => maj((x) => ({ ...x, forfait_jours: v }))}
        >
          Cadre au forfait jours
        </Interrupteur>
        <Interrupteur
          coche={b.mineur}
          disabled={disabled}
          onChange={(v) => maj((x) => ({ ...x, mineur: v }))}
        >
          Mineur (16-18 ans)
        </Interrupteur>
        <Interrupteur
          coche={b.actif}
          disabled={disabled}
          onChange={(v) => maj((x) => ({ ...x, actif: v }))}
        >
          {b.actif
            ? 'Actif'
            : 'Désactivé : plus proposé ni affiché au planning (historique gardé)'}
        </Interrupteur>
      </div>
      {b.id !== null && !disabled && !evolution && (
        <div>
          <Tip label="Promotion (apprenti devenu hôtelier), passage en extra, nouveau contrat… L'historique reste sur le contrat actuel.">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEvolution(evolutionParDefaut(b, aujourdhui))}
            >
              <Repeat /> Faire évoluer le contrat
            </Button>
          </Tip>
        </div>
      )}
      {b.id !== null && !disabled && evolution && (
        <BlocEvolution
          evolution={evolution}
          setEvolution={setEvolution}
          b={b}
          referentiel={referentiel}
          enCours={enCours}
          onCreer={async () => {
            if (await onEvoluer(evolution)) setEvolution(null)
          }}
        />
      )}
    </Section>
  )
}

function BlocEvolution({
  evolution,
  setEvolution,
  referentiel,
  enCours,
  onCreer,
}: {
  evolution: Evolution
  setEvolution: (e: Evolution | null) => void
  b: Brouillon
  referentiel: PropsSection['referentiel']
  enCours: boolean
  onCreer: () => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <strong className="text-sm">Nouveau contrat</strong>
      <p className="text-xs text-muted-foreground">
        Le contrat actuel s'arrête la veille ; le nouveau reprend ses postes (le
        soutien devient titulaire hors alternance), ses congés à venir et sa
        semaine type. L'historique reste.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-date`} className="text-xs">
            À partir du
          </Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={evolution.date}
            onChange={(e) =>
              setEvolution({ ...evolution, date: e.target.value })
            }
          />
        </div>
        <Liste
          label="Nouveau contrat"
          valeur={evolution.type_contrat}
          options={OPTIONS_CONTRAT}
          onChange={(v) =>
            setEvolution({ ...evolution, type_contrat: v as TypeContrat })
          }
        />
        <Liste
          label="Groupe du nouveau contrat"
          valeur={
            evolution.groupe_id === null
              ? 'aucune'
              : String(evolution.groupe_id)
          }
          options={[
            { valeur: 'aucune', libelle: 'Sans groupe' },
            ...referentiel.groupes.map((g) => ({
              valeur: String(g.id),
              libelle: g.nom,
            })),
          ]}
          onChange={(v) =>
            setEvolution({
              ...evolution,
              groupe_id: v === 'aucune' ? null : Number(v),
            })
          }
        />
        {evolution.type_contrat !== 'extra' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-heures`} className="text-xs">
              Heures par semaine
            </Label>
            <Input
              id={`${id}-heures`}
              type="number"
              min={1}
              max={48}
              step={0.5}
              value={evolution.heures_hebdo}
              onChange={(e) =>
                setEvolution({
                  ...evolution,
                  heures_hebdo: Number(e.target.value),
                })
              }
            />
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEvolution(null)}
        >
          Annuler
        </Button>
        <Button type="button" size="sm" disabled={enCours} onClick={onCreer}>
          {enCours ? 'Création…' : 'Créer le nouveau contrat'}
        </Button>
      </div>
    </div>
  )
}

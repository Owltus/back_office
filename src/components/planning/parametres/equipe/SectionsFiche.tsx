/*
 * Sections de la fiche d'un membre du staff (prototype `FicheSalarie`) :
 * compétences, horaires autorisés, semaine type, absences, règles HCR.
 * Identité et contrat : `SectionIdentite.tsx`.
 */

import { NOM_ZONE_ACCUEIL, tientLaNuit } from '#/lib/planning/presence.ts'
import { useMemo, useState } from 'react'
import { Plus, Star, Trash2, X } from 'lucide-react'

import {
  choisirJourEtoile,
  etoilePossible,
  jourEtoile,
  joursEtoilePossibles,
  texteJourEtoile,
  ficheApercu,
  niveauParDefaut,
  nouvelleCle,
  reglerJour,
  reglerNiveau,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import type {
  Brouillon,
  PeriodeBrouillon,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import {
  Liste,
  Section,
} from '#/components/planning/parametres/equipe/Champs.tsx'
import { Segmente } from '#/components/planning/parametres/equipe/Segmente.tsx'
import {
  codesDeSesPostes,
  codesMorts,
  codesParPoste,
  codesSemaineType,
} from '#/components/planning/parametres/equipe/codesFiche.ts'
import { ChoixCodes } from '#/components/planning/parametres/reglages/ChoixCodes.tsx'
import { modificationPermise } from '#/components/planning/parametres/reglages/tousOuCertains.ts'
import { TousOuCertains } from '#/components/planning/parametres/reglages/TousOuCertains.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  grouperHoraires,
  libelleHoraire,
  NIVEAUX,
  postesDuGroupe,
} from '#/lib/planning/affichage.ts'
import { resume } from '#/lib/planning/regles.ts'
import type { LigneRegle } from '#/lib/planning/regles.ts'
import { estEcole } from '#/lib/planning/semaine.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { horairesEtoileDuJour } from '#/lib/planning/etoile.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type {
  Horaire,
  ModeJour,
  Niveau,
  Referentiel,
} from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

export interface PropsSection {
  b: Brouillon
  maj: (f: (b: Brouillon) => Brouillon) => void
  referentiel: Referentiel
  disabled: boolean
}

const OPTIONS_NIVEAU = (Object.keys(NIVEAUX) as Niveau[]).map((n) => ({
  valeur: n,
  libelle: NIVEAUX[n].libelle,
  aide: NIVEAUX[n].aide,
}))

const MODES: ReadonlyArray<{ valeur: ModeJour; libelle: string }> = [
  { valeur: 'auto', libelle: 'Libre' },
  { valeur: 'travail', libelle: 'Travaille' },
  { valeur: 'repos', libelle: 'Repos' },
]

const optionHoraire = (h: Horaire) => ({
  valeur: String(h.id),
  libelle: libelleHoraire(h),
})

const pastille = (couleur: string) => (
  <span
    className="inline-block size-2.5 shrink-0 rounded-full"
    style={{ background: couleur }}
  />
)

// ------------------------------------------------------------ compétences

export function SectionCompetences({
  b,
  maj,
  referentiel,
  disabled,
}: PropsSection) {
  const { postes, groupes } = referentiel
  const groupe = groupes.find((g) => g.id === b.groupe_id)
  const niveaux = new Map(b.competences.map((c) => [c.poste_id, c.niveau]))
  const tenus = postes.filter((p) => niveaux.has(p.id))
  // Un poste fermé n'est plus proposé (U3) ; l'accueil d'abord, les postes
  // à part ensuite (U10 : déduit, plus de réglage « rangé à part »).
  const ajoutables = postesDuGroupe(postes, groupe).filter(
    (p) => !niveaux.has(p.id) && !p.ferme,
  )
  const deLAccueil = (p: (typeof postes)[number]) =>
    p.presence || tientLaNuit(p)
  const courants = ajoutables.filter(deLAccueil)
  const aPart = ajoutables.filter((p) => !deLAccueil(p))
  const regler = (posteId: number, niveau: Niveau | 'aucun') =>
    maj((x) => ({
      ...x,
      competences: reglerNiveau(x.competences, posteId, niveau),
    }))

  return (
    <Section
      titre="Compétences"
      aide="Les postes qu'elle tient, et comment. Titulaire : seule sur le poste. Dépannage : seule aussi, mais le planning automatique préfère un titulaire, sauf si celui-ci ferait des heures en plus ou un 6e jour. Soutien (apprenti, stagiaire) : ne compte pas seule, toujours avec une personne autonome."
    >
      {tenus.length === 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Aucun poste : elle ne peut pas être planifiée. Ajoutez-lui au moins un
          poste.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {tenus.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm">
              {pastille(p.couleur)}
              <span className="truncate">{p.nom}</span>
              {p.ferme && (
                <small className="text-muted-foreground">· poste fermé</small>
              )}
            </span>
            <span className="flex items-center gap-1">
              <Segmente<Niveau>
                label={`Niveau sur ${p.nom}`}
                valeur={niveaux.get(p.id) ?? 'titulaire'}
                options={OPTIONS_NIVEAU}
                onChange={(n) => regler(p.id, n)}
                disabled={disabled}
              />
              {!disabled && (
                <Tip label={`Retirer le poste ${p.nom} de sa fiche`}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Retirer ${p.nom}`}
                    onClick={() => regler(p.id, 'aucun')}
                  >
                    <X />
                  </Button>
                </Tip>
              )}
            </span>
          </li>
        ))}
      </ul>
      {!disabled && ajoutables.length > 0 && (
        <Liste
          label="Ajouter un poste"
          libelleVisible={false}
          className="w-full sm:w-80"
          valeur=""
          placeholder={`+ Ajouter un poste${groupe?.postes_autorises.length ? ` (prévus pour ${groupe.nom})` : ''}`}
          onChange={(v) =>
            v &&
            regler(
              Number(v),
              niveauParDefaut(b.type_contrat, lireRegles(referentiel)),
            )
          }
          groupes={[
            {
              titre:
                aPart.length && courants.length ? NOM_ZONE_ACCUEIL : undefined,
              options: courants.map((p) => ({
                valeur: String(p.id),
                libelle: p.nom,
              })),
            },
            {
              titre: 'Autres postes',
              options: aPart.map((p) => ({
                valeur: String(p.id),
                libelle: p.nom,
              })),
            },
          ]}
        />
      )}
    </Section>
  )
}

// ------------------------------------------------------ horaires autorisés

export function SectionHoraires({
  b,
  maj,
  referentiel,
  disabled,
}: PropsSection) {
  // La fiche hérite des horaires de ses postes et ne peut que les restreindre
  // (D5). Une seule liste en base pour tous ses postes : elle se choisit
  // parmi l'union, chaque poste dit ce qu'il en reste pour elle.
  const { postes, horaires } = referentiel
  const deSesPostes = codesDeSesPostes(b, postes, horaires)
  const ouverts = deSesPostes.map((h) => h.id)
  const parPoste = codesParPoste(b, postes, horaires)
  const morts = codesMorts(b, postes, horaires)
  const restreint = b.shifts_autorises.length > 0
  const retirer = (id: number) =>
    maj((x) => ({
      ...x,
      shifts_autorises: x.shifts_autorises.filter((c) => c !== id),
    }))
  return (
    <Section
      titre="Horaires autorisés"
      aide="Les horaires qu'elle fait, parmi ceux de ses postes : par exemple seulement le soir pour quelqu'un qui ne fait jamais le matin, ou la nuit seule pour quelqu'un qui ne fait que des nuits. Les horaires d'un poste se règlent dans Postes."
    >
      {parPoste.length > 0 && (
        <ul
          className="flex flex-col gap-1 text-sm"
          aria-label="Horaires par poste"
        >
          {parPoste.map(({ poste, codes, utilisables }) => (
            <li key={poste.id} className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2">
                {pastille(poste.couleur)}
                <span>
                  {poste.nom} : {codes.length > 1 ? 'les ' : 'le '}
                  {codes.length} horaire{codes.length > 1 ? 's' : ''} du poste
                  {restreint && utilisables.length > 0 && (
                    <span className="text-muted-foreground">
                      , {utilisables.length} pour elle
                    </span>
                  )}
                </span>
              </span>
              {!utilisables.length && (
                <span className="ml-4.5 text-xs text-amber-600 dark:text-amber-400">
                  Aucun de ses horaires n'est prévu sur ce poste : elle n'y sera
                  pas planifiée.
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <TousOuCertains
        etiquette="Horaires autorisés"
        choisis={b.shifts_autorises}
        proposes={ouverts}
        onChange={(shifts_autorises) =>
          maj((x) => ({ ...x, shifts_autorises }))
        }
        disabled={disabled}
        texteTous={
          b.competences.length
            ? `Les ${ouverts.length} horaires de ses postes.`
            : `Les ${ouverts.length} horaires.`
        }
      >
        {(liste) => (
          <ChoixCodes
            etiquette="Horaires autorisés"
            horaires={deSesPostes}
            choisis={liste.choisis}
            onChange={liste.onChange}
            disabled={disabled}
          />
        )}
      </TousOuCertains>
      {morts.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Horaires plus prévus">
          {morts.map((h) => {
            const reste = b.shifts_autorises.filter((c) => c !== h.id)
            const dernier = modificationPermise(reste, ouverts) === null
            const bouton = (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled || dernier}
                aria-label={`Retirer ${libelleHoraire(h)}`}
                onClick={() => retirer(h.id)}
              >
                Retirer
              </Button>
            )
            return (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="text-muted-foreground line-through">
                  {libelleHoraire(h)}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Cet horaire n'est plus prévu pour ses postes.
                </span>
                {!disabled &&
                  (dernier ? (
                    <Tip label="Choisissez d'abord un autre horaire, ou Tous.">
                      <span>{bouton}</span>
                    </Tip>
                  ) : (
                    bouton
                  ))}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

// ------------------------------------------------------------ semaine type

export function SectionSemaineType({
  b,
  maj,
  referentiel,
  disabled,
}: PropsSection) {
  const { horaires, motifs, postes } = referentiel
  const regles = lireRegles(referentiel)
  const etoile = etoilePossible(b, regles)

  // Seulement ce que la règle unique permet ce jour-là sur ses postes.
  const possibles = (jour: number) =>
    codesSemaineType(b, postes, horaires, jour, regles)
  return (
    <Section
      titre="Semaine type"
      aide={`Libre : le planning automatique décide si elle travaille ; avec un horaire choisi, ce sera celui-là les jours où elle travaille (de nuit le week-end, par exemple). Travaille : son jour habituel, le planning la fait travailler ce jour-là dès qu'il le peut. Repos : jamais planifiée ce jour-là. Une absence se pose à sa date, plus bas. École : jour hors de l'hôtel, compté comme une journée de travail complète.${
        etoile ? ' ★ : jour de la journée étoile, choisi plus bas.' : ''
      }`}
    >
      <ul className="flex flex-col gap-1.5">
        {JOURS.map((nom, j) => {
          const e = b.semaine_type[j]
          const jour = nom.toLowerCase()
          const travaille = e.mode === 'auto' || e.mode === 'travail'
          const fixe = horaires.find((h) => h.id === e.type_shift_id)
          const fixeImpossible =
            travaille && fixe && !possibles(j).some((h) => h.id === fixe.id)
              ? fixe
              : null
          return (
            <li
              key={nom}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="flex w-20 items-center gap-1 text-sm">
                {nom}
                {etoile && e.etoile && (
                  <Star
                    aria-label="Journée étoile"
                    className="size-3.5 fill-amber-400 text-amber-400"
                  />
                )}
              </span>
              <span className="flex flex-wrap items-center justify-end gap-1.5">
                {travaille && (
                  <Liste
                    label={`Horaire du ${jour}`}
                    libelleVisible={false}
                    className="w-48"
                    disabled={disabled}
                    valeur={e.type_shift_id ? String(e.type_shift_id) : 'tous'}
                    onChange={(v) =>
                      maj((x) => ({
                        ...x,
                        semaine_type: reglerJour(
                          x.semaine_type,
                          j,
                          { type_shift_id: v === 'tous' ? null : Number(v) },
                          motifs,
                        ),
                      }))
                    }
                    options={[{ valeur: 'tous', libelle: 'Ses horaires' }]}
                    groupes={[
                      ...grouperHoraires(possibles(j), regles.moments).map(
                        (g) => ({
                          titre: g.libelle,
                          options: g.horaires.map(optionHoraire),
                        }),
                      ),
                      ...(fixeImpossible
                        ? [
                            {
                              titre: 'Plus possible',
                              options: [optionHoraire(fixeImpossible)],
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
                {fixeImpossible && (
                  <span className="order-last w-full text-right text-xs text-amber-600 dark:text-amber-400">
                    {libelleHoraire(fixeImpossible)} n'est plus possible pour
                    elle ce jour-là. Choisissez un autre horaire.
                  </span>
                )}
                <Segmente<ModeJour>
                  label={`Le ${jour}`}
                  valeur={e.mode}
                  options={MODES}
                  disabled={disabled}
                  onChange={(mode) =>
                    maj((x) => ({
                      ...x,
                      semaine_type: reglerJour(
                        x.semaine_type,
                        j,
                        { mode },
                        motifs,
                      ),
                    }))
                  }
                />
              </span>
            </li>
          )
        })}
      </ul>
      {etoile && (
        <ChoixJourEtoile
          b={b}
          maj={maj}
          disabled={disabled}
          regles={regles}
          possibles={possibles}
          horaires={horaires}
        />
      )}
    </Section>
  )
}

/** Le jour de la journée étoile (D6 : « si choisie c'est comme cela, sinon
 * c'est appliqué de la meilleure façon ») : au choix du planning, ou un jour
 * imposé chaque semaine, l'horaire plus court choisi par le planning. Les
 * horaires possibles ce jour-là sont montrés ; aucun : la fiche le dit, comme
 * « À vérifier » (même source, `horairesEtoileDuJour`). */
function ChoixJourEtoile({
  b,
  maj,
  disabled,
  regles,
  possibles,
  horaires,
}: Pick<PropsSection, 'b' | 'maj' | 'disabled'> & {
  regles: RegleEtablissement
  possibles: (jour: number) => Horaire[]
  horaires: Horaire[]
}) {
  const j = jourEtoile(b.semaine_type)
  const jours = joursEtoilePossibles(b.semaine_type)
  const fixe =
    j === null
      ? null
      : horaires.find((h) => h.id === b.semaine_type[j].type_shift_id)
  const choix =
    j === null
      ? []
      : horairesEtoileDuJour(
          possibles(j),
          fixe,
          Math.round(Number(b.heures_hebdo) * 60),
          regles,
        )
  const jour = j === null ? '' : JOURS[j].toLowerCase()
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Star className="size-4 text-amber-400" />
          Jour de la journée courte
        </span>
        <Liste
          label="Jour de la journée courte"
          libelleVisible={false}
          className="w-48"
          disabled={disabled}
          valeur={j === null ? 'planning' : String(j)}
          onChange={(v) =>
            maj((x) => ({
              ...x,
              semaine_type: choisirJourEtoile(
                x.semaine_type,
                v === 'planning' ? null : Number(v),
              ),
            }))
          }
          options={[
            { valeur: 'planning', libelle: 'Au choix du planning' },
            ...jours.map((k) => ({ valeur: String(k), libelle: JOURS[k] })),
          ]}
        />
      </div>
      {j === null ? (
        <p className="text-xs text-muted-foreground">
          Le planning place la journée courte au mieux chaque semaine, selon les
          besoins.
        </p>
      ) : choix.length ? (
        <p className="text-xs text-muted-foreground">
          Chaque {jour}, un horaire plus court choisi par le planning parmi :{' '}
          {choix.map((h) => libelleHoraire(h)).join(', ')}.
        </p>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Aucun horaire de journée étoile n'est possible le {jour} sur ses
          postes. Le planning automatique ne pourra pas la placer ce jour-là.
          Choisissez un autre jour, ou permettez un horaire plus court sur ses
          postes.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- absences

/** Combien de périodes passées on montre d'abord (les plus récentes). */
export const PASSEES_VISIBLES = 10

/** Les absences de la fiche (rework du 2026-11-03, demande utilisateur : « les
 * choses exceptionnelles, pas ce qui revient de manière régulière ; avec les
 * années, on va être noyé ») : jamais les repos (semaine type et planning),
 * jamais l'école (bloc École) ; deux onglets, À venir (en cours compris, la
 * plus proche d'abord) et Passées (la plus récente d'abord, les plus
 * anciennes repliées). Les périodes masquées restent dans le brouillon :
 * rien n'est perdu à l'enregistrement. */
export function SectionAbsences({
  b,
  maj,
  referentiel,
  disabled,
  aujourdhui,
  masquerMotif,
}: PropsSection & {
  aujourdhui: string
  /** Motif géré ailleurs (l'école, par le bloc École) : ses périodes sont masquées. */
  masquerMotif: number | null
}) {
  const [onglet, setOnglet] = useState<'avenir' | 'passees'>('avenir')
  const [toutes, setToutes] = useState(false)
  const repos = new Set(
    referentiel.motifs.filter((m) => m.nature === 'repos').map((m) => m.id),
  )
  // Les motifs d'une absence exceptionnelle : ni l'école, ni un repos.
  const motifsAbsence = referentiel.motifs.filter(
    (m) => !estEcole(m) && m.nature !== 'repos',
  )
  const exceptionnelles = b.absences.filter(
    (p) => p.motif_id !== masquerMotif && !repos.has(p.motif_id),
  )
  // Une période en cours de saisie (sans fin) reste à venir.
  const passee = (p: PeriodeBrouillon) => !!p.fin && p.fin < aujourdhui
  const avenir = exceptionnelles
    .filter((p) => !passee(p))
    .sort((x, y) => x.debut.localeCompare(y.debut) || x.cle - y.cle)
  const passees = exceptionnelles
    .filter(passee)
    .sort((x, y) => y.debut.localeCompare(x.debut) || y.cle - x.cle)
  const liste =
    onglet === 'avenir'
      ? avenir
      : toutes
        ? passees
        : passees.slice(0, PASSEES_VISIBLES)
  const changer = (
    cle: number,
    f: (p: Brouillon['absences'][number]) => Brouillon['absences'][number],
  ) =>
    maj((x) => ({
      ...x,
      absences: x.absences.map((p) => (p.cle === cle ? f(p) : p)),
    }))

  return (
    <Section
      titre="Absences"
      aide="Congés payés, maladie, formation, sans solde, repos exceptionnels : une période par ligne, week-end compris. Les repos de chaque semaine se règlent dans la semaine type et au planning, ils ne sont pas listés ici. Les motifs se créent dans Horaires et absences."
    >
      <div role="tablist" aria-label="Absences" className="flex gap-1 border-b">
        {(
          [
            ['avenir', 'À venir', avenir.length],
            ['passees', 'Passées', passees.length],
          ] as const
        ).map(([cle, libelle, n]) => (
          <button
            key={cle}
            type="button"
            role="tab"
            aria-selected={onglet === cle}
            onClick={() => setOnglet(cle)}
            className={cn(
              '-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors',
              onglet === cle
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {libelle}{' '}
            <span className="text-xs text-muted-foreground tabular-nums">
              {n}
            </span>
          </button>
        ))}
      </div>
      {liste.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {onglet === 'avenir'
            ? 'Aucune absence à venir.'
            : 'Aucune absence passée.'}
        </p>
      )}
      <ul role="tabpanel" className="flex flex-col gap-1.5">
        {liste.map((p) => (
          <li
            key={p.cle}
            className="flex flex-wrap items-center gap-1.5"
            data-testid="periode-absence"
          >
            <Input
              type="date"
              aria-label="Du"
              className="h-8 w-40"
              disabled={disabled}
              value={p.debut}
              onChange={(e) => {
                const debut = e.target.value
                changer(p.cle, (x) => ({
                  ...x,
                  debut,
                  fin: debut && x.fin < debut ? debut : x.fin,
                }))
              }}
            />
            <span className="text-xs text-muted-foreground">au</span>
            <Input
              type="date"
              aria-label="Au"
              className="h-8 w-40"
              min={p.debut || undefined}
              disabled={disabled}
              value={p.fin}
              onChange={(e) =>
                changer(p.cle, (x) => ({ ...x, fin: e.target.value }))
              }
            />
            <Liste
              label="Motif"
              libelleVisible={false}
              className="w-40"
              disabled={disabled}
              valeur={String(p.motif_id)}
              onChange={(v) =>
                changer(p.cle, (x) => ({ ...x, motif_id: Number(v) }))
              }
              options={referentiel.motifs
                .filter(
                  (m) =>
                    (!estEcole(m) && m.nature !== 'repos') ||
                    m.id === p.motif_id,
                )
                .map((m) => ({ valeur: String(m.id), libelle: m.nom }))}
            />
            {!disabled && (
              <Tip label="Retirer cette absence">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Retirer l'absence"
                  onClick={() =>
                    maj((x) => ({
                      ...x,
                      absences: x.absences.filter((y) => y.cle !== p.cle),
                    }))
                  }
                >
                  <Trash2 />
                </Button>
              </Tip>
            )}
          </li>
        ))}
      </ul>
      {onglet === 'passees' && !toutes && passees.length > PASSEES_VISIBLES && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setToutes(true)}
          >
            Afficher les plus anciennes ({passees.length - PASSEES_VISIBLES})
          </Button>
        </div>
      )}
      {!disabled && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={motifsAbsence.length === 0}
            onClick={() => {
              setOnglet('avenir')
              maj((x) => ({
                ...x,
                absences: [
                  ...x.absences,
                  {
                    cle: nouvelleCle(),
                    debut: aujourdhui,
                    fin: aujourdhui,
                    motif_id: motifsAbsence[0].id,
                  },
                ],
              }))
            }}
          >
            <Plus /> Ajouter une absence
          </Button>
        </div>
      )}
    </Section>
  )
}

// ----------------------------------------------------------- règles HCR

export function SectionRegles({
  b,
  referentiel,
}: Pick<PropsSection, 'b'> & {
  referentiel?: Pick<Referentiel, 'reglages' | 'modelesContrat'>
}) {
  const etoile = texteJourEtoile(b, lireRegles(referentiel))
  const cle = `${b.type_contrat}|${b.heures_hebdo}|${b.forfait_jours}|${b.mineur}`
  const regles = useMemo<LigneRegle[]>(() => {
    try {
      return resume(ficheApercu(b))
    } catch {
      return []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])
  return (
    <Section titre="Règles HCR appliquées">
      <ul className="flex flex-col gap-1" aria-label="Règles HCR appliquées">
        {regles.map((r) => (
          <li key={r.regle} data-regle={r.regle} className="text-sm">
            {r.texte}
          </li>
        ))}
        {etoile && (
          <li data-regle="R-JOURNEE-ETOILE" className="text-sm">
            {etoile}
          </li>
        )}
      </ul>
    </Section>
  )
}

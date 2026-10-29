/*
 * Sections de la fiche d'un membre du staff (prototype `FicheSalarie`) :
 * compétences, horaires autorisés, semaine type, absences, règles HCR.
 * Identité et contrat : `SectionIdentite.tsx`.
 */

import { useMemo } from 'react'
import { Plus, Star, Trash2, X } from 'lucide-react'

import {
  basculerEtoile,
  etoilePossible,
  ficheApercu,
  niveauParDefaut,
  nouvelleCle,
  reglerJour,
  reglerNiveau,
} from '#/components/planning/parametres/equipe/brouillon.ts'
import type { Brouillon } from '#/components/planning/parametres/equipe/brouillon.ts'
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
  NIVEAUX,
  postesDuGroupe,
} from '#/lib/planning/affichage.ts'
import { resume } from '#/lib/planning/regles.ts'
import type { LigneRegle } from '#/lib/planning/regles.ts'
import { estEcole } from '#/lib/planning/semaine.ts'
import { heureAffichee } from '#/lib/planning/temps.ts'
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
  { valeur: 'absence', libelle: 'Absence' },
]

const optionHoraire = (h: Horaire) => ({
  valeur: String(h.id),
  libelle: `${h.nom} (${heureAffichee(h.debut)}-${heureAffichee(h.fin)})`,
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
  const ajoutables = postesDuGroupe(postes, groupe).filter(
    (p) => !niveaux.has(p.id),
  )
  const courants = ajoutables.filter((p) => !p.a_part)
  const aPart = ajoutables.filter((p) => p.a_part)
  const regler = (posteId: number, niveau: Niveau | 'aucun') =>
    maj((x) => ({
      ...x,
      competences: reglerNiveau(x.competences, posteId, niveau),
    }))

  return (
    <Section
      titre="Compétences"
      aide="Les postes qu'elle tient, et comment. Titulaire : seule sur le poste. Dépannage : seule aussi, mais le moteur préfère un titulaire, sauf si celui-ci ferait des heures en plus ou un 6e jour. Soutien (apprenti, stagiaire) : ne compte pas seule, toujours avec une personne autonome."
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
              {p.a_part && (
                <small className="text-muted-foreground">· rangé à part</small>
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
            v && regler(Number(v), niveauParDefaut(b.type_contrat))
          }
          groupes={[
            {
              titre: aPart.length ? 'Postes courants' : undefined,
              options: courants.map((p) => ({
                valeur: String(p.id),
                libelle: p.nom,
              })),
            },
            {
              titre:
                'Postes rangés à part (direction, supervision, technique…)',
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
  // La fiche hérite des codes de ses postes et ne peut que les restreindre
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
      aide="Les horaires qu'elle fait, parmi ceux de ses postes : par exemple seulement le soir pour quelqu'un qui ne fait jamais le matin, ou la nuit seule pour un veilleur. Les codes d'un poste se règlent dans Postes."
    >
      {parPoste.length > 0 && (
        <ul
          className="flex flex-col gap-1 text-sm"
          aria-label="Codes par poste"
        >
          {parPoste.map(({ poste, codes, utilisables }) => (
            <li key={poste.id} className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2">
                {pastille(poste.couleur)}
                <span>
                  {poste.nom} : les {codes.length} code
                  {codes.length > 1 ? 's' : ''} du poste
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
            ? `Les ${ouverts.length} codes de ses postes.`
            : `Les ${ouverts.length} codes.`
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
        <ul className="flex flex-col gap-1" aria-label="Codes plus prévus">
          {morts.map((h) => {
            const reste = b.shifts_autorises.filter((c) => c !== h.id)
            const dernier = modificationPermise(reste, ouverts) === null
            const bouton = (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled || dernier}
                aria-label={`Retirer ${h.code}`}
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
                  {h.code} {h.nom}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Ce code n'est plus prévu pour ses postes.
                </span>
                {!disabled &&
                  (dernier ? (
                    <Tip label="Choisissez d'abord un autre code, ou Tous.">
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
  const etoile = etoilePossible(b)
  // Seulement ce que la règle unique permet ce jour-là sur ses postes.
  const possibles = (jour: number) =>
    codesSemaineType(b, postes, horaires, jour)
  return (
    <Section
      titre="Semaine type"
      aide={`Libre : le moteur décide si elle travaille ; avec un horaire choisi, ce sera celui-là les jours où elle travaille (de nuit le week-end, par exemple). Travaille : elle travaille toujours ce jour-là. Repos et Absence : jamais planifiée ce jour-là. École : jour hors de l'hôtel, compté comme une journée de travail complète.${
        etoile
          ? ' ★ : journée étoile (la journée courte) fixée ce jour-là ; sans étoile, le moteur la place selon les besoins.'
          : ''
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
              <span className="w-20 text-sm">{nom}</span>
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
                      ...grouperHoraires(possibles(j)).map((g) => ({
                        titre: g.libelle,
                        options: g.horaires.map(optionHoraire),
                      })),
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
                    {fixeImpossible.code} n'est plus possible pour elle ce
                    jour-là. Choisissez un autre horaire.
                  </span>
                )}
                {e.mode === 'absence' && (
                  <Liste
                    label={`Motif d'absence le ${jour}`}
                    libelleVisible={false}
                    className="w-48"
                    disabled={disabled}
                    valeur={e.type_absence_id ? String(e.type_absence_id) : ''}
                    placeholder="Motif"
                    onChange={(v) =>
                      maj((x) => ({
                        ...x,
                        semaine_type: reglerJour(
                          x.semaine_type,
                          j,
                          { type_absence_id: Number(v) },
                          motifs,
                        ),
                      }))
                    }
                    options={motifs.map((m) => ({
                      valeur: String(m.id),
                      libelle: m.nom,
                    }))}
                  />
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
                {etoile && travaille && (
                  <Tip
                    label={
                      e.etoile
                        ? `Journée étoile fixée le ${jour} : cliquez pour la laisser variable`
                        : `Fixer la journée étoile (courte) le ${jour}`
                    }
                  >
                    <Button
                      type="button"
                      variant={e.etoile ? 'secondary' : 'ghost'}
                      size="icon-sm"
                      disabled={disabled}
                      aria-pressed={!!e.etoile}
                      aria-label={`Journée étoile le ${jour}`}
                      onClick={() =>
                        maj((x) => ({
                          ...x,
                          semaine_type: basculerEtoile(x.semaine_type, j),
                        }))
                      }
                    >
                      <Star
                        className={cn(
                          e.etoile && 'fill-amber-400 text-amber-400',
                        )}
                      />
                    </Button>
                  </Tip>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------- absences

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
  const motifsAbsence = referentiel.motifs.filter((m) => !estEcole(m))
  const visibles = [...b.absences]
    .filter((p) => p.motif_id !== masquerMotif)
    .sort((x, y) =>
      x.debut < y.debut ? -1 : x.debut > y.debut ? 1 : x.cle - y.cle,
    )
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
      aide="Vacances, repos exceptionnels, sans solde, maladie : une période par ligne, week-end compris. Les motifs se créent dans Horaires et absences."
    >
      {visibles.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune absence.</p>
      )}
      <ul className="flex flex-col gap-1.5">
        {visibles.map((p) => (
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
                .filter((m) => !estEcole(m) || m.id === p.motif_id)
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
      {!disabled && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={motifsAbsence.length === 0}
            onClick={() =>
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
            }
          >
            <Plus /> Ajouter une absence
          </Button>
        </div>
      )}
    </Section>
  )
}

// ----------------------------------------------------------- règles HCR

export function SectionRegles({ b }: Pick<PropsSection, 'b'>) {
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
          <li
            key={r.regle}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <span>{r.texte}</span>
            {r.regle.startsWith('R-') && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {r.regle}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

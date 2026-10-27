/*
 * Paramètres du Planning : codes horaires et motifs d'absence (prototype
 * `HorairesPage.tsx`, spec §5.2). Différence voulue avec le prototype : rien
 * ne part à la frappe (anomalie 12) ; chaque carte s'enregistre par son
 * bouton, après contrôle des mêmes règles que la base (pause plus courte que
 * l'horaire, journée courte qui garde du temps de travail…). Un code horaire
 * modifié fait suivre les shifts à venir (trigger en base), jamais ceux des
 * semaines verrouillées. Seule la gestion modifie.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Moon, Plus, Trash2 } from 'lucide-react'

import {
  useDroitsPlanning,
  useEcriture,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  compterAbsencesParMotif,
  usageMotif,
} from '#/components/planning/parametres/reglages/absencesParMotif.ts'
import type { LigneAbsence } from '#/components/planning/parametres/reglages/absencesParMotif.ts'
import {
  CadreReglages,
  EnTeteSection,
  useBrouillon,
} from '#/components/planning/parametres/reglages/cadre.tsx'
import {
  CarteReglage,
  ErreursSaisie,
  Nuancier,
  PALETTE,
  Segmente,
} from '#/components/planning/parametres/reglages/controles.tsx'
import {
  erreursHoraire,
  erreursMotif,
  heureValide,
  nettoyerHoraire,
  nettoyerMotif,
  normaliserHeure,
} from '#/components/planning/parametres/reglages/validation.ts'
import type {
  SaisieHoraire,
  SaisieMotif,
} from '#/components/planning/parametres/reglages/validation.ts'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { heures, ROUGE_CODE, texteSur } from '#/lib/planning/affichage.ts'
import {
  enregistrerHoraire,
  enregistrerMotif,
  supprimerHoraire,
  supprimerMotif,
} from '#/lib/planning/service.ts'
import {
  heureAffichee,
  horaireDe,
  minutes,
  presence,
} from '#/lib/planning/temps.ts'
import type {
  Horaire,
  Motif,
  NatureMotif,
  Periode,
  Referentiel,
} from '#/lib/planning/types.ts'

const NATURES: ReadonlyArray<{
  valeur: NatureMotif
  libelle: string
  aide: string
  texte: string
}> = [
  {
    valeur: 'absence',
    libelle: 'Absence',
    aide: 'Absence : vacances, repos exceptionnel, sans solde, maladie…',
    texte: 'La personne est absente ce jour-là.',
  },
  {
    valeur: 'ecole',
    libelle: 'École',
    aide: 'École : formation hors établissement (apprentis)',
    texte:
      "Formation hors établissement : comptée comme du travail, ce n'est pas une absence.",
  },
]

const saisieHoraire = (h: Horaire): SaisieHoraire => ({
  code: h.code,
  nom: h.nom,
  debut: h.debut,
  fin: h.fin,
  couleur: h.couleur,
  pause: h.pause,
  raccourci: h.raccourci,
  raccourci_debut: h.raccourci_debut,
  periode: h.periode,
  code_rouge: h.code_rouge,
})

/** Famille d'un code (consignes de présence, couleur) ; « aucune » : à part. */
const PERIODES: ReadonlyArray<{
  valeur: Periode | 'aucune'
  libelle: string
  aide: string
}> = [
  {
    valeur: 'matin',
    libelle: 'Matin',
    aide: 'Compte dans la présence du matin',
  },
  {
    valeur: 'middle',
    libelle: 'Middle',
    aide: 'À cheval entre le matin et le soir : compte selon son heure de début',
  },
  { valeur: 'soir', libelle: 'Soir', aide: 'Compte dans la présence du soir' },
  { valeur: 'nuit', libelle: 'Nuit', aide: 'Nuit : hors des consignes' },
  {
    valeur: 'court',
    libelle: 'Court',
    aide: 'Moins de 7 h de travail : compte selon son heure de début',
  },
  {
    valeur: 'aucune',
    libelle: 'À part',
    aide: 'À part (direction, supervision…) : hors des consignes',
  },
]

/** Les codes rangés par période, dans l'ordre de la journée. */
const GROUPES_CODES: ReadonlyArray<{ titre: string; periode: Periode | null }> =
  [
    { titre: 'Matin', periode: 'matin' },
    { titre: 'Middle', periode: 'middle' },
    { titre: 'Soir', periode: 'soir' },
    { titre: 'Nuit', periode: 'nuit' },
    { titre: 'Court', periode: 'court' },
    { titre: 'À part', periode: null },
  ]

const saisieMotif = (m: Motif): SaisieMotif => ({
  code: m.code,
  nom: m.nom,
  couleur: m.couleur,
  decompte: m.decompte,
  nature: m.nature,
})

export function HorairesPage() {
  const droits = useDroitsPlanning()
  const ref = useReferentiel()
  const modifiable = droits.pret && droits.gerer
  const [nouvelHoraire, setNouvelHoraire] = useState<SaisieHoraire | null>(null)
  const [nouveauMotif, setNouveauMotif] = useState<SaisieMotif | null>(null)
  const data = ref.data
  // Jours d'absence posés, pour l'usage des motifs (clé `planning` : relue
  // après chaque écriture, jamais sur disque).
  const absences = useQuery({
    queryKey: ['planning', 'absences-par-motif'],
    queryFn: compterAbsencesParMotif,
    staleTime: 0,
  })

  const creerHoraire = () => {
    if (!data) return
    setNouvelHoraire({
      code: 'X',
      nom: 'Nouvel horaire',
      debut: '09:00',
      fin: '17:45',
      couleur: PALETTE[data.horaires.length % PALETTE.length],
      pause: 45,
      raccourci: 60,
      raccourci_debut: 0,
      periode: null,
      code_rouge: false,
    })
  }
  const creerMotif = () => {
    if (!data) return
    setNouveauMotif({
      code: 'AB',
      nom: 'Nouveau motif',
      couleur: PALETTE[(data.motifs.length + 5) % PALETTE.length],
      decompte: true,
      nature: 'absence',
    })
  }

  return (
    <CadreReglages
      titre="Horaires et absences"
      actif="/planning/horaires"
      modifiable={modifiable}
      pret={droits.pret}
      chargement={ref.isPending}
      erreur={ref.isError}
      onReessayer={() => void ref.refetch()}
    >
      {data && (
        <>
          <section
            className="flex flex-col gap-4"
            aria-labelledby="titre-codes-horaires"
          >
            <div id="titre-codes-horaires">
              <EnTeteSection
                titre="Codes horaires"
                texte="Les horaires types de l'hôtel (matin, middle, après-midi, nuit…). Chacun a sa couleur, reprise sur les cartes du planning. La pause compte dans la présence mais pas dans les heures. La journée courte finit plus tôt (39 h = 4 × 8 h + 1 × 7 h, choisie par le planning). Modifier un horaire met à jour les shifts déjà posés avec ce code, sauf dans les semaines verrouillées."
                actions={
                  modifiable && (
                    <Button
                      size="sm"
                      onClick={creerHoraire}
                      disabled={!!nouvelHoraire}
                    >
                      <Plus />
                      Nouveau code
                    </Button>
                  )
                }
              />
            </div>
            {nouvelHoraire && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <CarteHoraire
                  key="nouveau"
                  id={null}
                  enregistre={nouvelHoraire}
                  referentiel={data}
                  modifiable={modifiable}
                  onFin={() => setNouvelHoraire(null)}
                />
              </div>
            )}
            {GROUPES_CODES.map((g) => {
              const liste = data.horaires.filter(
                (h) => (h.periode ?? null) === g.periode,
              )
              if (!liste.length) return null
              return (
                <div key={g.titre} className="flex flex-col gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    {g.titre}
                    <span className="rounded-full bg-muted px-2 text-xs tabular-nums">
                      {liste.length}
                    </span>
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {liste.map((h) => (
                      <CarteHoraire
                        key={h.id}
                        id={h.id}
                        enregistre={saisieHoraire(h)}
                        referentiel={data}
                        modifiable={modifiable}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            {data.horaires.length > 0 && <Frise horaires={data.horaires} />}
          </section>

          <section
            className="flex flex-col gap-4"
            aria-labelledby="titre-motifs"
          >
            <div id="titre-motifs">
              <EnTeteSection
                titre="Absences et école"
                texte="Chaque motif a sa couleur, se pose sur une case du planning comme un horaire et s'utilise dans les fiches. Absences : vacances, repos exceptionnels, sans solde, maladie… École : la formation hors établissement des apprentis, qui n'est pas une absence."
                actions={
                  modifiable && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={creerMotif}
                      disabled={!!nouveauMotif}
                    >
                      <Plus />
                      Nouveau motif
                    </Button>
                  )
                }
              />
            </div>
            {[
              { titre: 'Absences', nature: 'absence' as const },
              { titre: 'École', nature: 'ecole' as const },
            ].map((g) => {
              const liste = data.motifs.filter((m) => m.nature === g.nature)
              const brouillonIci = nouveauMotif && g.nature === 'absence'
              if (!liste.length && g.nature === 'ecole') return null
              return (
                <div key={g.nature} className="flex flex-col gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    {g.titre}
                    <span className="rounded-full bg-muted px-2 text-xs tabular-nums">
                      {liste.length}
                    </span>
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {brouillonIci && (
                      <CarteMotif
                        key="nouveau"
                        id={null}
                        enregistre={nouveauMotif}
                        referentiel={data}
                        absences={absences.data}
                        modifiable={modifiable}
                        onFin={() => setNouveauMotif(null)}
                      />
                    )}
                    {liste.map((m) => (
                      <CarteMotif
                        key={m.id}
                        id={m.id}
                        enregistre={saisieMotif(m)}
                        referentiel={data}
                        absences={absences.data}
                        modifiable={modifiable}
                      />
                    ))}
                    {!liste.length && !brouillonIci && (
                      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                        Aucun motif d'absence.
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        </>
      )}
    </CadreReglages>
  )
}

// ------------------------------------------------------------ boutons du bas

function PiedCarte({
  modifiable,
  neuf,
  modifie,
  envoi,
  invalide,
  libelleCreer,
  info,
  onSupprimer,
  onAnnuler,
  onEnregistrer,
}: {
  modifiable: boolean
  neuf: boolean
  modifie: boolean
  envoi: boolean
  invalide: boolean
  libelleCreer: string
  info: ReactNode
  onSupprimer: () => void
  onAnnuler: () => void
  onEnregistrer: () => void
}) {
  return (
    <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">
      {(!modifiable || !(modifie || neuf)) && (
        <span className="mr-auto text-xs text-muted-foreground">{info}</span>
      )}
      {modifiable && !neuf && !modifie && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={envoi}
          onClick={onSupprimer}
        >
          <Trash2 />
          Supprimer
        </Button>
      )}
      {modifiable && (modifie || neuf) && (
        <>
          {modifie && !neuf && (
            <span className="mr-auto text-xs text-muted-foreground">
              Non enregistré
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={envoi}
            onClick={onAnnuler}
          >
            Annuler
          </Button>
          <Button
            size="sm"
            disabled={envoi || invalide}
            onClick={onEnregistrer}
          >
            {neuf ? libelleCreer : 'Enregistrer'}
          </Button>
        </>
      )}
    </div>
  )
}

function Champ({
  libelle,
  children,
  aide,
}: {
  libelle: string
  children: ReactNode
  aide?: string
}) {
  const contenu = (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {libelle}
      {children}
    </label>
  )
  return aide ? <Tip label={aide}>{contenu}</Tip> : contenu
}

/** Champ de minutes : vide = NaN (le contrôle le refuse). */
function ChampMinutes({
  valeur,
  onChange,
  max,
  pas,
  disabled,
  etiquette,
}: {
  valeur: number
  onChange: (v: number) => void
  max: number
  pas: number
  disabled: boolean
  etiquette: string
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      step={pas}
      aria-label={etiquette}
      disabled={disabled}
      value={Number.isNaN(valeur) ? '' : valeur}
      onChange={(e) =>
        onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))
      }
      className="h-8 w-20 tabular-nums"
    />
  )
}

// ------------------------------------------------------------ codes horaires

function CarteHoraire({
  id,
  enregistre,
  referentiel,
  modifiable,
  onFin,
}: {
  id: number | null
  enregistre: SaisieHoraire
  referentiel: Referentiel
  modifiable: boolean
  onFin?: () => void
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const {
    brouillon: h,
    modifie,
    changer,
    annuler,
    adopter,
  } = useBrouillon(enregistre)
  const [envoi, setEnvoi] = useState(false)
  const [suppression, setSuppression] = useState(false)
  const neuf = id === null
  const erreurs = erreursHoraire(h)
  const heuresChangees =
    !neuf &&
    (h.debut !== enregistre.debut ||
      h.fin !== enregistre.fin ||
      h.pause !== enregistre.pause ||
      h.raccourci !== enregistre.raccourci ||
      h.raccourci_debut !== enregistre.raccourci_debut)

  const enregistrer = async () => {
    if (erreurs.length || envoi || (!modifie && !neuf)) return
    const valeurs = nettoyerHoraire(h)
    setEnvoi(true)
    const r = await ecrire(
      () => enregistrerHoraire(valeurs, id),
      "Le code horaire n'a pas pu être enregistré",
    )
    setEnvoi(false)
    if (!r.ok) {
      notifier(r.message, 'danger')
      return
    }
    adopter(valeurs)
    notifier(
      neuf
        ? `Code horaire ${valeurs.code} créé`
        : heuresChangees
          ? `Code ${valeurs.code} enregistré. Les shifts à venir posés avec ce code ont suivi ; les semaines verrouillées ne changent pas.`
          : `Code ${valeurs.code} enregistré`,
    )
    onFin?.()
  }

  const supprimer = async () => {
    if (id === null) return
    setEnvoi(true)
    const r = await ecrire(
      () => supprimerHoraire(id),
      `Le code ${enregistre.code} n'a pas pu être supprimé`,
    )
    setEnvoi(false)
    notifier(
      r.ok ? `Code ${enregistre.code} supprimé` : r.message,
      r.ok ? 'info' : 'danger',
    )
  }

  const heuresOk =
    heureValide(h.debut) && heureValide(h.fin) && h.debut !== '24:00'
  const p = heuresOk ? presence(h.debut, h.fin) : 0
  const travail = p - (Number.isNaN(h.pause) ? 0 : h.pause)
  const lendemain = heuresOk && minutes(h.fin) <= minutes(h.debut)
  const raccourci = Number.isNaN(h.raccourci) ? 0 : h.raccourci
  const court =
    heuresOk && raccourci > 0
      ? horaireDe(
          {
            ...h,
            raccourci,
            raccourci_debut: Number.isNaN(h.raccourci_debut)
              ? 0
              : h.raccourci_debut,
          },
          true,
        )
      : null
  const utilise =
    id === null
      ? 0
      : referentiel.besoins.filter((b) => b.horaire_id === id).length
  const desactive = !modifiable

  return (
    <CarteReglage
      couleur={h.couleur}
      etiquette={neuf ? 'Nouveau code horaire' : `Code ${enregistre.code}`}
    >
      <div className="flex items-center gap-2">
        <Input
          aria-label="Code court"
          value={h.code}
          maxLength={4}
          disabled={desactive}
          onChange={(e) => changer({ code: e.target.value.toUpperCase() })}
          className="h-9 w-16 shrink-0 border-transparent text-center font-semibold uppercase"
          style={{
            background: h.couleur,
            color: h.code_rouge ? ROUGE_CODE : texteSur(h.couleur),
          }}
        />
        <Input
          aria-label="Nom de l'horaire"
          value={h.nom}
          maxLength={80}
          disabled={desactive}
          onChange={(e) => changer({ nom: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && void enregistrer()}
          className="font-medium"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Début"
          value={h.debut}
          placeholder="HH:MM"
          inputMode="numeric"
          maxLength={5}
          disabled={desactive}
          onChange={(e) => changer({ debut: e.target.value })}
          onBlur={(e) => changer({ debut: normaliserHeure(e.target.value) })}
          className="h-8 w-20 text-center tabular-nums"
        />
        <span className="text-muted-foreground">→</span>
        <Input
          aria-label="Fin"
          value={h.fin}
          placeholder="HH:MM"
          inputMode="numeric"
          maxLength={5}
          disabled={desactive}
          onChange={(e) => changer({ fin: e.target.value })}
          onBlur={(e) => changer({ fin: normaliserHeure(e.target.value) })}
          className="h-8 w-20 text-center tabular-nums"
        />
        {heuresOk && travail > 0 && (
          <Tip label="Temps de travail, pause déduite">
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums"
              tabIndex={0}
            >
              {heures(travail)}
            </span>
          </Tip>
        )}
        {lendemain && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Moon className="size-3" />
            Finit le lendemain
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Champ libelle="Pause">
          <ChampMinutes
            etiquette="Pause en minutes"
            valeur={h.pause}
            max={180}
            pas={5}
            disabled={desactive}
            onChange={(pause) => changer({ pause })}
          />
          min
        </Champ>
        <Champ libelle="Journée courte">
          <ChampMinutes
            etiquette="Journée courte : minutes en moins"
            valeur={h.raccourci}
            max={240}
            pas={15}
            disabled={desactive}
            onChange={(v) =>
              changer({
                raccourci: v,
                // « dont au début » plafonné au raccourci (prototype).
                raccourci_debut:
                  !Number.isNaN(v) && h.raccourci_debut > v
                    ? Math.max(0, v)
                    : h.raccourci_debut,
              })
            }
          />
          min de moins
        </Champ>
        {raccourci > 0 && (
          <Champ
            libelle="dont"
            aide="Minutes retirées au début : la journée courte commence plus tard"
          >
            <ChampMinutes
              etiquette="Minutes retirées au début"
              valeur={h.raccourci_debut}
              max={raccourci}
              pas={15}
              disabled={desactive}
              onChange={(v) =>
                changer({
                  raccourci_debut: Number.isNaN(v) ? v : Math.min(raccourci, v),
                })
              }
            />
            min au début
          </Champ>
        )}
      </div>

      {heuresOk && erreurs.length === 0 && (
        <div
          className="grid gap-1 rounded-lg bg-muted/50 p-2 text-xs"
          aria-label="Aperçu des heures"
        >
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Journée normale</span>
            <span className="tabular-nums">
              {heureAffichee(h.debut)} → {heureAffichee(h.fin)} ·{' '}
              {heures(travail)} de travail
            </span>
          </div>
          {court && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Journée courte</span>
              <span className="tabular-nums">
                {heureAffichee(court.debut)} → {heureAffichee(court.fin)} ·{' '}
                {heures(travail - raccourci)} de travail
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm text-muted-foreground">Famille</span>
        <Segmente
          etiquette="Famille du code"
          valeur={h.periode ?? 'aucune'}
          options={PERIODES}
          disabled={desactive}
          onChange={(v) => changer({ periode: v === 'aucune' ? null : v })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Couleur</span>
        <Nuancier
          valeur={h.couleur}
          disabled={desactive}
          etiquette="Couleur du code horaire"
          onChange={(couleur) => changer({ couleur })}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch
            checked={h.code_rouge}
            disabled={desactive}
            onCheckedChange={(code_rouge) => changer({ code_rouge })}
            aria-label="Code écrit en rouge"
          />
          Code écrit en rouge
        </label>
      </div>

      <ErreursSaisie erreurs={modifiable ? erreurs : []} />
      {modifiable && heuresChangees && erreurs.length === 0 && (
        <p className="text-xs text-amber-500">
          À l'enregistrement, les shifts déjà posés avec ce code prennent ces
          heures, sauf dans les semaines verrouillées.
        </p>
      )}

      <PiedCarte
        modifiable={modifiable}
        neuf={neuf}
        modifie={modifie}
        envoi={envoi}
        invalide={erreurs.length > 0}
        libelleCreer="Créer le code"
        info={
          utilise
            ? `Utilisé dans ${utilise} besoin${utilise > 1 ? 's' : ''}`
            : 'Non utilisé'
        }
        onSupprimer={() => setSuppression(true)}
        onAnnuler={() => (neuf ? onFin?.() : annuler())}
        onEnregistrer={() => void enregistrer()}
      />

      <ConfirmDialog
        open={suppression}
        onOpenChange={setSuppression}
        title={`Supprimer le code ${enregistre.code} ?`}
        description="Ses besoins sont supprimés ; les shifts déjà posés gardent leurs heures, sans code. Il est retiré des fiches et des postes. Impossible s'il figure dans un planning réalisé, ou s'il est le seul horaire permis d'une fiche ou d'un poste."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void supprimer()}
      />
    </CarteReglage>
  )
}

// ------------------------------------------------------------------ motifs

function CarteMotif({
  id,
  enregistre,
  referentiel,
  absences,
  modifiable,
  onFin,
}: {
  id: number | null
  enregistre: SaisieMotif
  referentiel: Referentiel
  /** Jours d'absence posés (undefined : pas encore lus, ou lecture en échec). */
  absences: LigneAbsence[] | undefined
  modifiable: boolean
  onFin?: () => void
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const {
    brouillon: m,
    modifie,
    changer,
    annuler,
    adopter,
  } = useBrouillon(enregistre)
  const [envoi, setEnvoi] = useState(false)
  const [suppression, setSuppression] = useState(false)
  const neuf = id === null
  const erreurs = erreursMotif(m)
  const desactive = !modifiable

  const enregistrer = async () => {
    if (erreurs.length || envoi || (!modifie && !neuf)) return
    const valeurs = nettoyerMotif(m)
    setEnvoi(true)
    const r = await ecrire(
      () => enregistrerMotif(valeurs, id),
      "Le motif n'a pas pu être enregistré",
    )
    setEnvoi(false)
    if (!r.ok) {
      notifier(r.message, 'danger')
      return
    }
    adopter(valeurs)
    notifier(
      neuf ? `Motif ${valeurs.nom} créé` : `Motif ${valeurs.nom} enregistré`,
    )
    onFin?.()
  }

  const supprimer = async () => {
    if (id === null) return
    setEnvoi(true)
    const r = await ecrire(
      () => supprimerMotif(id),
      `Le motif ${enregistre.nom} n'a pas pu être supprimé`,
    )
    setEnvoi(false)
    notifier(
      r.ok ? `Motif ${enregistre.nom} supprimé` : r.message,
      r.ok ? 'info' : 'danger',
    )
  }

  // Comme le prototype : semaine type ET jours posés. Tant que les jours
  // posés ne sont pas lus, seule la semaine type est comptée, et la
  // confirmation de suppression ne cite pas de nombre de jours.
  const usage =
    id === null
      ? { personnes: 0, jours: 0 }
      : usageMotif(id, referentiel.salaries, absences ?? [])
  const utilise = usage.personnes
  const joursConnus = absences !== undefined
  const nature = NATURES.find((n) => n.valeur === m.nature) ?? NATURES[0]

  return (
    <CarteReglage
      couleur={m.couleur}
      etiquette={neuf ? 'Nouveau motif' : `Motif ${enregistre.nom}`}
    >
      <div className="flex items-center gap-2">
        <Input
          aria-label="Code court"
          value={m.code}
          maxLength={4}
          disabled={desactive}
          onChange={(e) => changer({ code: e.target.value.toUpperCase() })}
          className="h-9 w-16 shrink-0 border-transparent text-center font-semibold uppercase"
          style={{ background: m.couleur, color: texteSur(m.couleur) }}
        />
        <Input
          aria-label="Nom du motif"
          value={m.nom}
          maxLength={80}
          disabled={desactive}
          onChange={(e) => changer({ nom: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && void enregistrer()}
          className="font-medium"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Segmente
          etiquette="Nature du motif"
          valeur={m.nature}
          options={NATURES}
          disabled={desactive}
          onChange={(v) => changer({ nature: v })}
        />
        <span className="text-xs text-muted-foreground">{nature.texte}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Couleur</span>
        <Nuancier
          valeur={m.couleur}
          disabled={desactive}
          etiquette="Couleur du motif"
          onChange={(couleur) => changer({ couleur })}
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Switch
          checked={m.decompte}
          disabled={desactive}
          onCheckedChange={(decompte) => changer({ decompte })}
          aria-label="Compté dans les heures"
          className="mt-0.5"
        />
        <span>
          Compté dans les heures
          <span className="block text-xs text-muted-foreground">
            Un jour de ce motif vaut une journée de travail : il est retiré des
            heures dues de la semaine.
          </span>
        </span>
      </label>

      <ErreursSaisie erreurs={modifiable ? erreurs : []} />

      <PiedCarte
        modifiable={modifiable}
        neuf={neuf}
        modifie={modifie}
        envoi={envoi}
        invalide={erreurs.length > 0}
        libelleCreer="Créer le motif"
        info={
          utilise
            ? `Utilisé par ${utilise} personne${utilise > 1 ? 's' : ''}`
            : joursConnus
              ? 'Non utilisé'
              : 'Absent des semaines types'
        }
        onSupprimer={() => setSuppression(true)}
        onAnnuler={() => (neuf ? onFin?.() : annuler())}
        onEnregistrer={() => void enregistrer()}
      />

      <ConfirmDialog
        open={suppression}
        onOpenChange={setSuppression}
        title={`Supprimer le motif ${enregistre.nom} ?`}
        description={`${
          !joursConnus
            ? 'Les jours posés avec ce motif sont retirés du planning'
            : usage.jours
              ? `${usage.jours} jour${usage.jours > 1 ? 's' : ''} d'absence posé${usage.jours > 1 ? 's' : ''} avec ce motif ${usage.jours > 1 ? 'seront effacés' : 'sera effacé'} du planning`
              : "Aucun jour d'absence n'est posé avec ce motif"
        }, et les semaines types qui l'utilisent repassent en libre. Impossible s'il figure dans un planning réalisé (semaine verrouillée).`}
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void supprimer()}
      />
    </CarteReglage>
  )
}

// --------------------------------------------------------- frise journée type

function Frise({ horaires }: { horaires: Horaire[] }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Journée type</h3>
      <div className="relative mb-2 h-4 text-[10px] text-muted-foreground">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((x) => (
          <span
            key={x}
            className="absolute -translate-x-1/2 tabular-nums"
            style={{ left: `${(x / 24) * 100}%` }}
          >
            {x}h
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {horaires.map((h) => {
          if (!heureValide(h.debut) || !heureValide(h.fin)) return null
          const d = minutes(h.debut)
          const duree = presence(h.debut, h.fin)
          // Un horaire de nuit se coupe en deux barres : jusqu'à minuit, puis le matin.
          const morceaux: Array<[number, number]> =
            d + duree > 1440
              ? [
                  [d, 1440 - d],
                  [0, d + duree - 1440],
                ]
              : [[d, duree]]
          return (
            <div key={h.id} className="relative h-6 rounded bg-muted/50">
              {morceaux.map(([debut, longueur], i) => (
                <Tip
                  key={i}
                  label={`${h.nom} ${heureAffichee(h.debut)} à ${heureAffichee(h.fin)}`}
                >
                  <div
                    tabIndex={0}
                    className="absolute inset-y-0 truncate rounded px-1.5 text-[11px] leading-6 font-medium"
                    style={{
                      left: `${(debut / 1440) * 100}%`,
                      width: `${(longueur / 1440) * 100}%`,
                      background: h.couleur,
                      color: texteSur(h.couleur),
                    }}
                  >
                    {i === 0 && `${h.code} · ${h.nom}`}
                  </div>
                </Tip>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

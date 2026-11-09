/*
 * Règles des contrats, en tiroir depuis la page Équipe (étape 5 du plan
 * `planning-moteur-configurable-2026-11-05`, D7 : les règles de
 * l'établissement sont RÉPARTIES dans les pages où on les cherche ; celles
 * des personnes ici, comme les groupes). Journées imposées par durée de
 * contrat, règles de chaque type de contrat, repos et rythme, école, congés,
 * puis la loi en lecture seule. Enregistrement par un bouton (brouillon),
 * gestion seule ; les autres lisent. Aucun poids n'est montré, aucune valeur
 * ne descend sous la loi (bornes = CHECK de la base).
 */

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Plus, Scale, Trash2, X } from 'lucide-react'

import {
  useDroitsPlanning,
  useEcriture,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  Interrupteur,
  Liste,
  Section,
} from '#/components/planning/parametres/equipe/Champs.tsx'
import {
  avertissementsSaisie,
  BORNES,
  changementsContrats,
  CRITERES_EQUITE,
  contratNeuf,
  erreursSaisie,
  ligneNeuve,
  PHRASES,
  phraseLigne,
  reglagesDepuis,
  saisieDepuis,
} from '#/components/planning/parametres/equipe/reglesContrats.ts'
import type {
  LigneJournees,
  SaisieReglesContrats,
} from '#/components/planning/parametres/equipe/reglesContrats.ts'
import { Segmente } from '#/components/planning/parametres/equipe/Segmente.tsx'
import { useBrouillon } from '#/components/planning/parametres/reglages/cadre.tsx'
import {
  Compteur,
  ErreursSaisie,
} from '#/components/planning/parametres/reglages/controles.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { cn } from '#/lib/utils.ts'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import {
  JOUR_MAX_LOI,
  JOURS_TRAVAILLES_MAX,
  MINEUR_JOUR_MAX,
  MINEUR_REPOS_QUOTIDIEN,
  MINEUR_SEMAINE_MAX,
  REPOS_QUOTIDIEN,
  SEMAINE_MAX,
} from '#/lib/planning/regles.ts'
import {
  ajouterModeleContrat,
  enregistrerModeleContrat,
  enregistrerReglages,
  supprimerModeleContrat,
} from '#/lib/planning/service.ts'
import { heuresLisibles, hhmm } from '#/lib/planning/temps.ts'
import type {
  ForceRegle,
  JourIsole,
  ModeleContrat,
  Referentiel,
  TypeContrat,
} from '#/lib/planning/types.ts'

const H = 60
const h = heuresLisibles

/** Durées proposées, de `de` à `a` par quart d'heure ; la valeur actuelle
 * est toujours dans la liste, même hors du pas. */
function durees(de: number, a: number, actuelle: number, pas = 15) {
  const liste: number[] = []
  for (let m = de; m <= a; m += pas) liste.push(m)
  if (!liste.includes(actuelle)) liste.push(actuelle)
  return liste
    .sort((x, y) => x - y)
    .map((m) => ({ valeur: String(m), libelle: h(m) }))
}

/** Heures du jour proposées par demi-heure, la valeur actuelle comprise. */
function heuresDuJour(de: number, a: number, actuelle: number) {
  const liste: number[] = []
  for (let m = de; m <= a; m += 30) liste.push(m)
  if (!liste.includes(actuelle)) liste.push(actuelle)
  return liste
    .sort((x, y) => x - y)
    .map((m) => ({ valeur: String(m), libelle: hhmm(m) }))
}

const FORCES: ReadonlyArray<{ valeur: ForceRegle; libelle: string }> = [
  { valeur: 'obligatoire', libelle: 'Obligatoire' },
  { valeur: 'souhaite', libelle: 'Souhaité' },
  { valeur: 'aucune', libelle: 'Sans règle' },
]
const ISOLE: ReadonlyArray<{ valeur: JourIsole; libelle: string }> = [
  { valeur: 'interdit', libelle: 'Interdit' },
  { valeur: 'a_eviter', libelle: 'À éviter' },
  { valeur: 'aucune', libelle: 'Sans règle' },
]
type Feries = 'rattrapes' | 'jour_meme' | 'aucun'
const FERIES: ReadonlyArray<{ valeur: Feries; libelle: string }> = [
  { valeur: 'rattrapes', libelle: 'Rattrapés' },
  { valeur: 'jour_meme', libelle: 'Le jour même' },
  { valeur: 'aucun', libelle: 'Aucun' },
]
/** « Après un an », « Après 6 mois », « Dès l'arrivée ». */
function anciennete(mois: number): string {
  if (mois === 0) return "Dès l'arrivée"
  if (mois % 12 === 0) {
    const ans = mois / 12
    return `Après ${ans} an${ans > 1 ? 's' : ''}`
  }
  return `Après ${mois} mois`
}
const phraseFeries = (f: Feries, mois: number): string =>
  f === 'rattrapes'
    ? `${anciennete(mois)}, un jour férié travaillé ouvre un jour férié rattrapé, proposé dans les semaines qui suivent.`
    : f === 'jour_meme'
      ? 'Les jours fériés sont pris le jour même, sans rattrapage.'
      : 'Aucun jour férié particulier.'
/** Durée max d'un jour pour un contrat : « Celle du poste » ou une durée. */
const SANS_MAX = 'poste'
const feriesDe = (m: ModeleContrat): Feries =>
  m.ferie_rattrape ? 'rattrapes' : m.feries_jour_meme ? 'jour_meme' : 'aucun'

/** Un réglage : son intitulé, son contrôle, et la phrase de ce qu'il fait. */
const NOMS_JOURS = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const

/** « le samedi et le dimanche ». */
function listeJours(jours: readonly number[]): string {
  const noms = [...jours]
    .sort((a, b) => a - b)
    .map((j) => `le ${NOMS_JOURS[j]}`)
  return noms.length > 1
    ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}`
    : (noms[0] ?? 'aucun jour')
}

/** « le vendredi soir » : la veille du premier jour du week-end. */
function veilleDe(jours: readonly number[]): string {
  const premier = Math.min(...jours)
  return premier > 0
    ? `le ${NOMS_JOURS[premier - 1]} soir`
    : 'la veille au soir'
}

/** Les jours du week-end, à cocher (1 à 3). */
function JoursWeekend({
  jours,
  disabled,
  onChange,
}: {
  jours: readonly number[]
  disabled: boolean
  onChange: (jours: number[]) => void
}) {
  return (
    <div
      role="group"
      aria-label="Jours du week-end"
      className="inline-flex rounded-md border bg-background/60 p-0.5"
    >
      {NOMS_JOURS.map((nom, j) => {
        const pris = jours.includes(j)
        return (
          <button
            key={nom}
            type="button"
            aria-pressed={pris}
            aria-label={nom}
            disabled={
              disabled ||
              (pris && jours.length === 1) ||
              (!pris && jours.length >= BORNES.weekendJoursMax)
            }
            onClick={() =>
              onChange(
                pris
                  ? jours.filter((x) => x !== j)
                  : [...jours, j].sort((a, b) => a - b),
              )
            }
            className={cn(
              'w-8 rounded py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
              pris
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground disabled:opacity-60',
            )}
          >
            {nom.slice(0, 2)}
          </button>
        )
      })}
    </div>
  )
}

function Reglage({
  titre,
  effet,
  children,
}: {
  titre: string
  effet: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{titre}</span>
        {children}
      </div>
      <p className="text-xs text-muted-foreground">{effet}</p>
    </div>
  )
}

export function ReglesContrats({
  ouvert,
  onFermer,
  referentiel,
}: {
  ouvert: boolean
  onFermer: () => void
  referentiel: Pick<Referentiel, 'reglages' | 'modelesContrat'> &
    Partial<Pick<Referentiel, 'salaries'>>
}) {
  const { gerer } = useDroitsPlanning()
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const enregistre = useMemo(
    () => saisieDepuis(referentiel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [referentiel.reglages, referentiel.modelesContrat],
  )
  const {
    brouillon: b,
    modifie,
    changer,
    annuler,
    adopter,
  } = useBrouillon<SaisieReglesContrats>(enregistre)
  const [choisi, setType] = useState<TypeContrat | null>(null)
  const [envoi, setEnvoi] = useState(false)
  /** Enregistrement en deux temps (réglages, puis types de contrat) : le
   * second a échoué, le premier est fait. Dit tant que la saisie reste. */
  const [partiel, setPartiel] = useState(false)
  const erreurs = erreursSaisie(b)
  const avertissements = avertissementsSaisie(b)
  const off = !gerer || envoi

  const fermer = () => {
    annuler()
    setPartiel(false)
    onFermer()
  }
  const changerLigne = (cle: string, maj: Partial<LigneJournees>) =>
    changer({
      journees: b.journees.map((l) => (l.cle === cle ? { ...l, ...maj } : l)),
    })
  // Le contrat montré : celui choisi, sinon le premier de la liste.
  const modele =
    b.modeles.find((m) => m.type_contrat === choisi) ?? b.modeles.at(0)
  const type = modele?.type_contrat
  /** Fiches (tous contrats, anciens compris) qui utilisent un type. */
  const fiches = (t: TypeContrat) =>
    (referentiel.salaries ?? []).filter((x) => x.type_contrat === t).length
  const ajouterContrat = () => {
    const neuf = contratNeuf(b)
    changer({ modeles: [...b.modeles, neuf] })
    setType(neuf.type_contrat)
  }
  const retirerContrat = (t: TypeContrat) => {
    changer({ modeles: b.modeles.filter((m) => m.type_contrat !== t) })
    setType(null)
  }
  const changerModele = (maj: Partial<ModeleContrat>) =>
    changer({
      modeles: b.modeles.map((m) =>
        m.type_contrat === type ? { ...m, ...maj } : m,
      ),
    })

  const enregistrer = async () => {
    if (!gerer || envoi || erreurs.length) return
    setEnvoi(true)
    let reglagesFaits = false
    const { ajoutes, changes, retires } = changementsContrats(enregistre, b)
    const r = await ecrire(async () => {
      await enregistrerReglages(reglagesDepuis(b))
      reglagesFaits = true
      // Créer, puis mettre à jour, puis retirer (refusé par la base s'il
      // sert encore).
      for (const m of ajoutes) await ajouterModeleContrat(m)
      for (const m of changes) await enregistrerModeleContrat(m)
      for (const t of retires) await supprimerModeleContrat(t)
    }, "Les règles des contrats n'ont pas pu être enregistrées")
    setEnvoi(false)
    setPartiel(!r.ok && reglagesFaits)
    if (r.ok) {
      adopter(b)
      notifier('Règles des contrats enregistrées')
    } else if (reglagesFaits)
      // Rien n'est adopté : la saisie reste à l'écran, à renvoyer.
      notifier(MESSAGE_PARTIEL, 'danger')
    else notifier(r.message, 'danger')
  }

  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <SheetContent
        showCloseButton={false}
        className="w-full gap-0 sm:max-w-xl"
      >
        <SheetHeader className="flex-row items-start justify-between gap-3 border-b">
          <div className="flex flex-col gap-1">
            <SheetTitle>Règles des contrats</SheetTitle>
            <SheetDescription>
              Ce que le planning automatique respecte pour chaque contrat
              {!gerer && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                  Lecture seule
                </span>
              )}
            </SheetDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Fermer"
            onClick={fermer}
          >
            <X />
          </Button>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <Section
            titre="Journées des contrats"
            aide="Pour ces contrats, le planning automatique ne pose que ces journées. Pour un autre contrat, il fait au mieux. Un horaire posé à la main n'est jamais refusé."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Liste
                label="Journée pleine"
                valeur={String(b.journee_pleine)}
                disabled={off}
                onChange={(v) => changer({ journee_pleine: Number(v) })}
                options={durees(
                  BORNES.pleineMin,
                  BORNES.pleineMax,
                  b.journee_pleine,
                )}
              />
              <Liste
                label="Journée étoile, au moins"
                valeur={String(b.journee_etoile_min)}
                disabled={off}
                onChange={(v) => changer({ journee_etoile_min: Number(v) })}
                options={durees(
                  4 * H,
                  b.journee_pleine - 15,
                  b.journee_etoile_min,
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Au-delà de 35 h, une journée de la semaine est plus courte : la
              journée étoile. Elle fait de {h(b.journee_etoile_min)} à moins de{' '}
              {h(b.journee_pleine)}.
            </p>
            <ul
              className="flex flex-col gap-2"
              aria-label="Journées par contrat"
            >
              {b.journees.map((l) => (
                <li
                  key={l.cle}
                  aria-label={`Contrat de ${h(l.minutes)}`}
                  className="flex flex-col gap-2 rounded-lg border bg-card p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Compteur
                      etiquette={`Heures par semaine du contrat de ${h(l.minutes)}`}
                      valeur={Math.round(l.minutes / H)}
                      min={BORNES.contratMin / H}
                      max={BORNES.contratMax / H}
                      disabled={off}
                      onChange={(v) => changerLigne(l.cle, { minutes: v * H })}
                    />
                    <span className="text-sm">h par semaine</span>
                    <Segmente<LigneJournees['mode']>
                      label={`Journées du contrat de ${h(l.minutes)}`}
                      valeur={l.mode}
                      disabled={off}
                      options={[
                        { valeur: 'egales', libelle: 'Toutes égales' },
                        {
                          valeur: 'etoile',
                          libelle: 'Avec une journée étoile',
                        },
                      ]}
                      onChange={(mode) => changerLigne(l.cle, { mode })}
                    />
                    <span className="ml-auto flex items-center gap-1">
                      <Liste
                        label={
                          l.mode === 'etoile'
                            ? `Journée étoile du contrat de ${h(l.minutes)}`
                            : `Journée du contrat de ${h(l.minutes)}`
                        }
                        libelleVisible={false}
                        className="w-28"
                        disabled={off}
                        valeur={String(
                          l.mode === 'etoile' ? l.courte : l.duree,
                        )}
                        onChange={(v) =>
                          changerLigne(
                            l.cle,
                            l.mode === 'etoile'
                              ? { courte: Number(v) }
                              : { duree: Number(v) },
                          )
                        }
                        options={
                          l.mode === 'etoile'
                            ? durees(
                                b.journee_etoile_min,
                                b.journee_pleine - 15,
                                l.courte,
                              )
                            : durees(
                                BORNES.journeeMin,
                                BORNES.journeeMax,
                                l.duree,
                              )
                        }
                      />
                      {gerer && (
                        <Tip label="Retirer ce contrat de la liste">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Retirer le contrat de ${h(l.minutes)}`}
                            disabled={envoi}
                            onClick={() =>
                              changer({
                                journees: b.journees.filter(
                                  (x) => x.cle !== l.cle,
                                ),
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        </Tip>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {phraseLigne(l, b.journee_pleine)}
                  </p>
                </li>
              ))}
            </ul>
            {gerer && b.journees.length < BORNES.lignesMax && (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={envoi}
                  onClick={() =>
                    changer({ journees: [...b.journees, ligneNeuve(b)] })
                  }
                >
                  <Plus /> Ajouter un contrat
                </Button>
              </div>
            )}
          </Section>

          <Section
            titre="Types de contrat"
            aide="Les contrats de l'établissement et ce qui change selon le contrat. Chaque fiche suit les règles du sien."
          >
            <div className="flex flex-wrap items-center gap-2">
              {modele && type && (
                <Segmente<TypeContrat>
                  label="Type de contrat"
                  valeur={type}
                  options={b.modeles.map((m) => ({
                    valeur: m.type_contrat,
                    libelle: m.nom?.trim() || 'Sans nom',
                  }))}
                  onChange={setType}
                />
              )}
              {gerer && b.modeles.length < BORNES.contratsMax && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={envoi}
                  onClick={ajouterContrat}
                >
                  <Plus /> Nouveau contrat
                </Button>
              )}
            </div>
            {modele && type && (
              <div
                className="flex flex-col gap-3"
                role="group"
                aria-label={`Règles du type ${modele.nom ?? ''}`}
              >
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-xs font-medium">
                    Nom du contrat
                    <Input
                      value={modele.nom ?? ''}
                      maxLength={BORNES.nomContratMax}
                      disabled={off}
                      onChange={(e) => changerModele({ nom: e.target.value })}
                    />
                  </label>
                  {gerer &&
                    (fiches(type) > 0 ? (
                      <Tip
                        label={`Utilisé par ${fiches(type)} fiche${fiches(type) > 1 ? 's' : ''} : changez d'abord leur contrat.`}
                      >
                        <span tabIndex={0}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled
                          >
                            <Trash2 /> Retirer ce contrat
                          </Button>
                        </span>
                      </Tip>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={envoi || b.modeles.length < 2}
                        onClick={() => retirerContrat(type)}
                      >
                        <Trash2 /> Retirer ce contrat
                      </Button>
                    ))}
                </div>
                <Effet
                  texte={
                    modele.journees_imposees
                      ? 'Le planning ne pose que les journées de la liste ci-dessus.'
                      : 'Le planning choisit librement la durée des journées.'
                  }
                >
                  <Interrupteur
                    coche={modele.journees_imposees}
                    disabled={off}
                    onChange={(v) => changerModele({ journees_imposees: v })}
                  >
                    Journées imposées
                  </Interrupteur>
                </Effet>
                <Effet
                  texte={
                    modele.journee_etoile
                      ? 'Au-delà de 35 h, une journée étoile chaque semaine.'
                      : 'Pas de journée étoile, quelles que soient les heures.'
                  }
                >
                  <Interrupteur
                    coche={modele.journee_etoile}
                    disabled={off}
                    onChange={(v) => changerModele({ journee_etoile: v })}
                  >
                    Journée étoile
                  </Interrupteur>
                </Effet>
                <Effet
                  texte={
                    modele.placement_manuel
                      ? "Le planning automatique ne le place jamais : on l'appelle d'abord, puis on pose ses shifts à la main."
                      : 'Le planning automatique peut le placer.'
                  }
                >
                  <Interrupteur
                    coche={modele.placement_manuel}
                    disabled={off}
                    onChange={(v) => changerModele({ placement_manuel: v })}
                  >
                    Posé à la main seulement
                  </Interrupteur>
                </Effet>
                {/* Un contrat posé à la main seulement (l'extra) : il n'a
                    pas de durée contractuelle. Tout autre contrat suit la
                    loi du temps partiel (B1). Une base qui l'aurait coché
                    ailleurs le montre, pour pouvoir le décocher. */}
                {(modele.placement_manuel || modele.contrat_indicatif) && (
                  <Effet
                    texte={
                      modele.contrat_indicatif
                        ? 'Aucune heure due : le planning ne cherche pas à remplir le contrat.'
                        : 'Les heures du contrat sont dues chaque semaine.'
                    }
                  >
                    <Interrupteur
                      coche={modele.contrat_indicatif}
                      disabled={off}
                      onChange={(v) => changerModele({ contrat_indicatif: v })}
                    >
                      Heures indicatives
                    </Interrupteur>
                  </Effet>
                )}
                <Effet
                  texte={
                    modele.alternance
                      ? "La fiche a un calendrier d'école. Un jour d'école compte comme une journée de travail."
                      : "Pas de calendrier d'école."
                  }
                >
                  <Interrupteur
                    coche={modele.alternance}
                    disabled={off}
                    onChange={(v) => changerModele({ alternance: v })}
                  >
                    Alternance
                  </Interrupteur>
                </Effet>
                <Effet
                  texte={
                    modele.soutien_par_defaut
                      ? 'Proposé en soutien quand on ajoute un poste (modifiable dans la fiche).'
                      : 'Proposé titulaire quand on ajoute un poste (modifiable dans la fiche).'
                  }
                >
                  <Interrupteur
                    coche={!!modele.soutien_par_defaut}
                    disabled={off}
                    onChange={(v) => changerModele({ soutien_par_defaut: v })}
                  >
                    Proposé en soutien
                  </Interrupteur>
                </Effet>
                <Effet
                  texte={
                    modele.accompagne
                      ? 'Toujours avec un salarié confirmé pendant tout son shift (titulaire ou dépannage, d’un contrat sans cette case), sur un poste de la même zone, ou sur son poste s’il n’a pas de zone. Sinon, la place reste vide.'
                      : 'Peut être seul sur son poste, selon son niveau.'
                  }
                >
                  <Interrupteur
                    coche={!!modele.accompagne}
                    disabled={off}
                    onChange={(v) => changerModele({ accompagne: v })}
                  >
                    Jamais sans un salarié confirmé
                  </Interrupteur>
                </Effet>
                <Effet
                  texte={
                    modele.mineur_possible
                      ? 'La fiche peut être déclarée mineure : la loi des mineurs s’applique alors.'
                      : 'Toujours majeur.'
                  }
                >
                  <Interrupteur
                    coche={!!modele.mineur_possible}
                    disabled={off}
                    onChange={(v) => changerModele({ mineur_possible: v })}
                  >
                    Peut être mineur
                  </Interrupteur>
                </Effet>
                <Effet
                  texte={
                    modele.forfait_possible
                      ? 'Cadre au forfait jours possible, dans un groupe qui le permet.'
                      : 'Jamais au forfait jours.'
                  }
                >
                  <Interrupteur
                    coche={!!modele.forfait_possible}
                    disabled={off}
                    onChange={(v) => changerModele({ forfait_possible: v })}
                  >
                    Forfait jours possible
                  </Interrupteur>
                </Effet>
                <Effet
                  texte={
                    modele.fin_obligatoire
                      ? 'La fiche ne s’enregistre pas sans sa fin de contrat.'
                      : 'La fin de contrat est facultative.'
                  }
                >
                  <Interrupteur
                    coche={!!modele.fin_obligatoire}
                    disabled={off}
                    onChange={(v) => changerModele({ fin_obligatoire: v })}
                  >
                    Fin de contrat obligatoire
                  </Interrupteur>
                </Effet>
                <Reglage
                  titre="Durée max d'un jour"
                  effet={
                    modele.jour_max_minutes == null
                      ? 'Celle du poste tenu.'
                      : `Au plus ${h(Math.min(modele.jour_max_minutes, JOUR_MAX_LOI))} par jour, quel que soit le poste.`
                  }
                >
                  <Liste
                    label={`Durée max d'un jour du contrat ${modele.nom ?? ''}`}
                    libelleVisible={false}
                    className="w-36"
                    valeur={
                      modele.jour_max_minutes == null
                        ? SANS_MAX
                        : String(modele.jour_max_minutes)
                    }
                    disabled={off}
                    onChange={(v) =>
                      changerModele({
                        jour_max_minutes: v === SANS_MAX ? null : Number(v),
                      })
                    }
                    options={[
                      { valeur: SANS_MAX, libelle: 'Celle du poste' },
                      ...durees(
                        BORNES.jourMaxContratMin,
                        BORNES.jourMaxContratMax,
                        modele.jour_max_minutes ?? 10 * H,
                        30,
                      ),
                    ]}
                  />
                </Reglage>
                <Reglage
                  titre="Jours fériés"
                  effet={phraseFeries(
                    feriesDe(modele),
                    b.ferie_anciennete_mois,
                  )}
                >
                  <Segmente<Feries>
                    label="Jours fériés"
                    valeur={feriesDe(modele)}
                    options={FERIES}
                    disabled={off}
                    onChange={(v) =>
                      changerModele({
                        ferie_rattrape: v === 'rattrapes',
                        feries_jour_meme: v === 'jour_meme',
                      })
                    }
                  />
                </Reglage>
              </div>
            )}
          </Section>

          <Section titre="Repos et rythme">
            <Reglage
              titre="Deux jours de repos de suite"
              effet={PHRASES.deuxRepos[b.deux_repos_de_suite]}
            >
              <Segmente<ForceRegle>
                label="Deux jours de repos de suite"
                valeur={b.deux_repos_de_suite}
                options={FORCES}
                disabled={off}
                onChange={(v) => changer({ deux_repos_de_suite: v })}
              />
            </Reglage>
            <Reglage
              titre="Jours de travail d'affilée, au plus"
              effet={`Semaines voisines comprises. La loi en permet ${JOURS_TRAVAILLES_MAX} au plus.`}
            >
              <Compteur
                etiquette="Jours de travail d'affilée, au plus"
                valeur={b.jours_affiles_max}
                min={1}
                max={BORNES.joursAffilesMax}
                disabled={off}
                onChange={(v) =>
                  changer({
                    jours_affiles_max: v,
                    jours_affiles_conseilles: Math.min(
                      v,
                      b.jours_affiles_conseilles,
                    ),
                  })
                }
              />
            </Reglage>
            <Reglage
              titre="Jours d'affilée conseillés"
              effet={`Au-delà de ${b.jours_affiles_conseilles} jours, le planning évite. Pour les contrats de ${h(b.rythme_contrat_min)} et plus, il ne dépasse jamais.`}
            >
              <Compteur
                etiquette="Jours d'affilée conseillés"
                valeur={b.jours_affiles_conseilles}
                // Jour seul interdit : 2 au moins, sinon aucun jour n'est
                // plaçable (même CHECK en base).
                min={b.jour_isole === 'interdit' ? 2 : 1}
                max={b.jours_affiles_max}
                disabled={off}
                onChange={(v) => changer({ jours_affiles_conseilles: v })}
              />
            </Reglage>
            <Reglage
              titre="Jour de travail seul"
              effet={PHRASES.jourIsole[b.jour_isole]}
            >
              <Segmente<JourIsole>
                label="Jour de travail seul"
                valeur={b.jour_isole}
                options={ISOLE}
                disabled={off}
                onChange={(v) => changer({ jour_isole: v })}
              />
            </Reglage>
            <Reglage
              titre="Rythme 5 jours puis 2 jours strict"
              effet={
                b.rythme_strict
                  ? `Pour les contrats de ${h(b.rythme_contrat_min)} et plus : toujours 5 jours de travail, puis 2 jours de repos. L'école et une absence de 5 jours au plus comptent comme du travail ; seuls le début et la fin du contrat, et une absence de plus de 5 jours, coupent ce rythme. Une place peut rester vide pour lui.`
                  : 'Le planning ne suit pas ce rythme. Les règles ci-dessus suffisent.'
              }
            >
              <Interrupteur
                coche={b.rythme_strict}
                disabled={off}
                onChange={(v) => changer({ rythme_strict: v })}
              >
                Rythme 5 jours puis 2 jours strict
              </Interrupteur>
            </Reglage>
            <Reglage
              titre="Contrats concernés par le rythme"
              effet={`Le jour seul, les jours d'affilée conseillés et le rythme 5 jours puis 2 jours valent pour les contrats de ${h(b.rythme_contrat_min)} et plus. Un petit contrat a des jours seuls par nature.`}
            >
              <span className="flex items-center gap-2 text-sm">
                <Compteur
                  etiquette="Contrats concernés par le rythme, à partir de"
                  valeur={Math.round(b.rythme_contrat_min / H)}
                  min={0}
                  max={48}
                  disabled={off}
                  onChange={(v) => changer({ rythme_contrat_min: v * H })}
                />
                h et plus
              </span>
            </Reglage>
            <Reglage
              titre="Repos conseillé entre deux services"
              effet={`La loi impose ${h(REPOS_QUOTIDIEN)}. Le planning cherche à laisser au moins ${h(b.repos_confort)}.`}
            >
              <Liste
                label="Repos conseillé entre deux services"
                libelleVisible={false}
                className="w-28"
                valeur={String(b.repos_confort)}
                disabled={off}
                onChange={(v) => changer({ repos_confort: Number(v) })}
                options={durees(
                  BORNES.reposConfortMin,
                  16 * H,
                  b.repos_confort,
                  30,
                )}
              />
            </Reglage>
            <Reglage
              titre="Changements de moment par semaine, au plus"
              effet="Passer du matin au soir, ou du soir au matin, compte un changement."
            >
              <Compteur
                etiquette="Changements de moment par semaine, au plus"
                valeur={b.changements_moment_max}
                min={0}
                max={BORNES.changementsMax}
                disabled={off}
                onChange={(v) => changer({ changements_moment_max: v })}
              />
            </Reglage>
            <Reglage
              titre="Pas de matin après un soir"
              effet={
                b.moment_arriere_jours
                  ? `Après un soir, pas de matin dans les ${b.moment_arriere_jours} jours qui suivent.`
                  : 'Un matin peut suivre un soir dès le lendemain, repos de la loi respecté.'
              }
            >
              <span className="flex items-center gap-2 text-sm">
                <Compteur
                  etiquette="Pas de matin après un soir, pendant"
                  valeur={b.moment_arriere_jours}
                  min={0}
                  max={BORNES.arriereMax}
                  disabled={off}
                  onChange={(v) => changer({ moment_arriere_jours: v })}
                />
                jours
              </span>
            </Reglage>
            <Reglage
              titre="Nuits d'affilée, au plus"
              effet={`Personne ne fait plus de ${b.nuits_affilees_max} nuits de suite. Ensuite, ${b.repos_apres_nuits} jour${b.repos_apres_nuits > 1 ? 's' : ''} sans travail.`}
            >
              <span className="flex items-center gap-2 text-sm">
                <Compteur
                  etiquette="Nuits d'affilée, au plus"
                  valeur={b.nuits_affilees_max}
                  min={1}
                  max={BORNES.nuitsMax}
                  disabled={off}
                  onChange={(v) => changer({ nuits_affilees_max: v })}
                />
                puis
                <Compteur
                  etiquette="Jours sans travail après des nuits"
                  valeur={b.repos_apres_nuits}
                  min={0}
                  max={BORNES.reposApresNuitsMax}
                  disabled={off}
                  onChange={(v) => changer({ repos_apres_nuits: v })}
                />
                jours libres
              </span>
            </Reglage>
          </Section>

          <Section
            titre="École"
            aide="Pour les apprentis et les stagiaires, autour d'un jour d'école."
          >
            <Reglage
              titre="La veille, fin au plus tard"
              effet={`La veille d'un jour d'école, pas de service qui finit après ${hhmm(b.ecole_veille_fin)}.`}
            >
              <Liste
                label="La veille d'un jour d'école, fin au plus tard"
                libelleVisible={false}
                className="w-28"
                valeur={String(b.ecole_veille_fin)}
                disabled={off}
                onChange={(v) => changer({ ecole_veille_fin: Number(v) })}
                options={heuresDuJour(16 * H, 24 * H, b.ecole_veille_fin)}
              />
            </Reglage>
            <Reglage
              titre="Le lendemain, début au plus tôt"
              effet={`Le lendemain d'un jour d'école, pas de service qui commence avant ${hhmm(b.ecole_lendemain_debut)}.`}
            >
              <Liste
                label="Le lendemain d'un jour d'école, début au plus tôt"
                libelleVisible={false}
                className="w-28"
                valeur={String(b.ecole_lendemain_debut)}
                disabled={off}
                onChange={(v) => changer({ ecole_lendemain_debut: Number(v) })}
                options={heuresDuJour(0, 12 * H, b.ecole_lendemain_debut)}
              />
            </Reglage>
          </Section>

          <Section
            titre="Jours fériés"
            aide="Pour les contrats aux jours fériés rattrapés."
          >
            <Reglage
              titre="Ancienneté qui ouvre le rattrapage"
              effet={`${anciennete(b.ferie_anciennete_mois)}, un jour férié travaillé ouvre un jour férié rattrapé.`}
            >
              <span className="flex items-center gap-2 text-sm">
                <Compteur
                  etiquette="Ancienneté qui ouvre le rattrapage, en mois"
                  valeur={b.ferie_anciennete_mois}
                  min={0}
                  max={BORNES.ancienneteMax}
                  disabled={off}
                  onChange={(v) => changer({ ferie_anciennete_mois: v })}
                />
                mois
              </span>
            </Reglage>
            <Reglage
              titre="Délai pour le rattraper"
              effet={`Le planning le propose pendant ${b.ferie_rattrapage_jours} jours. Il reste signalé tant qu'il n'est pas rendu.`}
            >
              <span className="flex items-center gap-2 text-sm">
                <Compteur
                  etiquette="Délai pour rattraper un jour férié, en jours"
                  valeur={b.ferie_rattrapage_jours}
                  min={BORNES.rattrapageMin}
                  max={BORNES.rattrapageMax}
                  disabled={off}
                  onChange={(v) => changer({ ferie_rattrapage_jours: v })}
                />
                jours
              </span>
            </Reglage>
          </Section>

          <Section titre="Partage et week-end">
            <Reglage
              titre="Jours du week-end"
              effet={`Un week-end libre, c'est ${listeJours(b.weekend_jours)} sans travail. Le partage des week-ends compte ces jours.`}
            >
              <JoursWeekend
                jours={b.weekend_jours}
                disabled={off}
                onChange={(weekend_jours) => changer({ weekend_jours })}
              />
            </Reglage>
            <Reglage
              titre="La nuit de la veille compte"
              effet={
                b.weekend_nuit_veille
                  ? `Une nuit commencée ${veilleDe(b.weekend_jours)} rend le week-end travaillé.`
                  : 'Seuls les jours du week-end comptent.'
              }
            >
              <Interrupteur
                coche={b.weekend_nuit_veille}
                disabled={off}
                onChange={(weekend_nuit_veille) =>
                  changer({ weekend_nuit_veille })
                }
              >
                <span className="sr-only">La nuit de la veille compte</span>
              </Interrupteur>
            </Reglage>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Partagés à part égale</span>
              <div className="flex flex-col gap-1.5">
                {CRITERES_EQUITE.map((c) => (
                  <Interrupteur
                    key={c.cle}
                    coche={b.equite_criteres.includes(c.cle)}
                    disabled={off}
                    onChange={(oui) =>
                      changer({
                        equite_criteres: oui
                          ? [...b.equite_criteres, c.cle]
                          : b.equite_criteres.filter((x) => x !== c.cle),
                      })
                    }
                  >
                    {c.libelle}
                  </Interrupteur>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Chacun en fait sa part, selon ses heures de contrat. Une semaine
                d'absence ne met personne en retard.
              </p>
            </div>
            <Reglage
              titre="Semaines regardées"
              effet={`Le partage compte les ${b.equite_semaines} dernières semaines.`}
            >
              <span className="flex items-center gap-2 text-sm">
                <Compteur
                  etiquette="Semaines regardées pour le partage"
                  valeur={b.equite_semaines}
                  min={Math.max(1, b.semaines_en_plus_alerte)}
                  max={BORNES.equiteSemainesMax}
                  disabled={off}
                  onChange={(v) => changer({ equite_semaines: v })}
                />
                semaines
              </span>
            </Reglage>
          </Section>

          <Section titre="Congés et heures">
            <Reglage
              titre="Retour de congé en douceur"
              effet={`Après ${b.conge_long} jours de congé d'affilée ou plus, le planning adoucit la reprise.`}
            >
              <span className="flex items-center gap-2 text-sm">
                <Compteur
                  etiquette="Retour de congé en douceur, après"
                  valeur={b.conge_long}
                  min={1}
                  max={BORNES.congeLongMax}
                  disabled={off}
                  onChange={(v) => changer({ conge_long: v })}
                />
                jours
              </span>
            </Reglage>
            <Reglage
              titre="Heures en plus"
              effet={`Une alerte quand quelqu'un dépasse son contrat ${b.semaines_en_plus_alerte} semaine${b.semaines_en_plus_alerte > 1 ? 's' : ''} sur les ${b.equite_semaines} dernières.`}
            >
              <span className="flex items-center gap-2 text-sm">
                <Compteur
                  etiquette="Heures en plus, alerte après"
                  valeur={b.semaines_en_plus_alerte}
                  min={1}
                  max={Math.min(BORNES.semainesEnPlusMax, b.equite_semaines)}
                  disabled={off}
                  onChange={(v) => changer({ semaines_en_plus_alerte: v })}
                />
                sur {b.equite_semaines}
              </span>
            </Reglage>
          </Section>

          <EncadreLoi />
        </div>

        <SheetFooter className="flex-col items-stretch gap-2 border-t">
          {partiel && modifie && (
            <p role="alert" className="text-xs text-destructive">
              {MESSAGE_PARTIEL}
            </p>
          )}
          <ErreursSaisie erreurs={erreurs} />
          {avertissements.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs text-amber-600 dark:text-amber-400">
              {avertissements.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            {gerer ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!modifie || envoi}
                  onClick={annuler}
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  disabled={!modifie || envoi || erreurs.length > 0}
                  onClick={() => void enregistrer()}
                >
                  Enregistrer
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={fermer}>
                Terminé
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

const MESSAGE_PARTIEL =
  "Les réglages de repos et de journées sont enregistrés, mais pas tous les types de contrat. Vos modifications restent à l'écran : enregistrez à nouveau."

function Effet({ texte, children }: { texte: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {children}
      <p className="pl-11 text-xs text-muted-foreground">{texte}</p>
    </div>
  )
}

/** La loi : jamais réglable, dite en phrases simples. */
export function EncadreLoi() {
  return (
    <section
      aria-label="La loi"
      className="flex flex-col gap-2 rounded-lg border border-dashed bg-muted/30 p-3"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Scale className="size-4" />
        La loi, toujours respectée
      </h3>
      <p className="text-xs text-muted-foreground">
        Ces règles ne se règlent pas. Les règles ci-dessus ne peuvent pas
        descendre en dessous.
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        <li>
          Au moins {h(REPOS_QUOTIDIEN)} de repos entre deux services (
          {h(MINEUR_REPOS_QUOTIDIEN)} pour un mineur).
        </li>
        <li>Au plus {h(SEMAINE_MAX)} de travail par semaine.</li>
        <li>
          Au plus {JOURS_TRAVAILLES_MAX} jours de travail d'affilée, et deux
          jours de repos par semaine en principe.
        </li>
        <li>
          Au plus {h(JOUR_MAX_LOI)} de présence par jour. Chaque poste et chaque
          contrat peut en demander moins.
        </li>
        <li>
          Un mineur : au plus {h(MINEUR_JOUR_MAX)} par jour et{' '}
          {h(MINEUR_SEMAINE_MAX)} par semaine, jamais entre 22 h et 6 h, deux
          jours de repos de suite.
        </li>
      </ul>
    </section>
  )
}

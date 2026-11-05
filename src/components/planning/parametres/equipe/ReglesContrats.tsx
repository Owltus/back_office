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
  erreursSaisie,
  ligneNeuve,
  modelesChanges,
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
import { Button } from '#/components/ui/button.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import {
  JOUR_MAX_CATEGORIE,
  JOURS_TRAVAILLES_MAX,
  MINEUR_JOUR_MAX,
  MINEUR_REPOS_QUOTIDIEN,
  MINEUR_SEMAINE_MAX,
  REPOS_QUOTIDIEN,
  SEMAINE_MAX,
  STAGE_JOUR_MAX,
} from '#/lib/planning/regles.ts'
import {
  enregistrerModeleContrat,
  enregistrerReglages,
} from '#/lib/planning/service.ts'
import { heuresLisibles, hhmm } from '#/lib/planning/temps.ts'
import { TYPES_CONTRAT } from '#/lib/planning/types.ts'
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
const PHRASE_FERIES: Record<Feries, string> = {
  rattrapes:
    'Après un an, un jour férié travaillé ouvre un jour férié rattrapé, proposé dans les semaines qui suivent.',
  jour_meme: 'Les jours fériés sont pris le jour même, sans rattrapage.',
  aucun: 'Aucun jour férié particulier.',
}
const feriesDe = (m: ModeleContrat): Feries =>
  m.ferie_rattrape ? 'rattrapes' : m.feries_jour_meme ? 'jour_meme' : 'aucun'

/** Un réglage : son intitulé, son contrôle, et la phrase de ce qu'il fait. */
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
  referentiel: Pick<Referentiel, 'reglages' | 'modelesContrat'>
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
  const [type, setType] = useState<TypeContrat>('cdi')
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
  const modele = b.modeles.find((m) => m.type_contrat === type)
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
    const r = await ecrire(async () => {
      await enregistrerReglages(reglagesDepuis(b))
      reglagesFaits = true
      for (const m of modelesChanges(enregistre, b))
        await enregistrerModeleContrat(m)
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
            aide="Ce qui change selon le type de contrat. Chaque fiche suit les règles de son type."
          >
            <Segmente<TypeContrat>
              label="Type de contrat"
              valeur={type}
              options={TYPES_CONTRAT.map((t) => ({
                valeur: t.code,
                libelle: t.libelle,
              }))}
              onChange={setType}
            />
            {modele && (
              <div
                className="flex flex-col gap-3"
                role="group"
                aria-label={`Règles du type ${TYPES_CONTRAT.find((t) => t.code === type)?.libelle}`}
              >
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
                {/* Un extra seulement : il n'a pas de durée contractuelle.
                    Tout autre contrat suit la loi du temps partiel (B1).
                    Une base qui l'aurait coché ailleurs le montre, pour
                    pouvoir le décocher. */}
                {(type === 'extra' || modele.contrat_indicatif) && (
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
                <Reglage
                  titre="Jours fériés"
                  effet={PHRASE_FERIES[feriesDe(modele)]}
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
              titre="Contrats concernés par le rythme"
              effet={`Le jour seul et les jours d'affilée conseillés valent pour les contrats de ${h(b.rythme_contrat_min)} et plus. Un petit contrat a des jours seuls par nature.`}
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
              effet={`Le Veilleur fait au plus ${b.nuits_affilees_max} nuits de suite, puis ${b.repos_apres_nuits} jour${b.repos_apres_nuits > 1 ? 's' : ''} sans travail.`}
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
              effet={`Une alerte quand quelqu'un dépasse son contrat ${b.semaines_en_plus_alerte} semaine${b.semaines_en_plus_alerte > 1 ? 's' : ''} sur les 4 dernières.`}
            >
              <span className="flex items-center gap-2 text-sm">
                <Compteur
                  etiquette="Heures en plus, alerte après"
                  valeur={b.semaines_en_plus_alerte}
                  min={1}
                  max={BORNES.semainesEnPlusMax}
                  disabled={off}
                  onChange={(v) => changer({ semaines_en_plus_alerte: v })}
                />
                sur 4
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
  "Les réglages de repos et de journées sont enregistrés, mais les règles des types de contrat n'ont pas été enregistrées. Vos modifications restent à l'écran : enregistrez à nouveau."

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
  const jourMax = Math.max(...Object.values(JOUR_MAX_CATEGORIE))
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
          Au plus {h(jourMax)} de présence par jour selon le poste (
          {h(STAGE_JOUR_MAX)} pour un stagiaire).
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

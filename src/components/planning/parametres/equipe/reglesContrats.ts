/*
 * Règles des contrats (étape 5 du plan `planning-moteur-configurable-
 * 2026-11-05`, D7 : réglages RÉPARTIS, ceux de l'équipe dans la page
 * Équipe). Passage pur entre les règles de l'établissement (`lireRegles`)
 * et la saisie du tiroir « Règles des contrats », contrôle de la saisie
 * avant l'envoi (mêmes bornes que les CHECK de la base, jamais sous la
 * loi) et phrases d'effet. Aucun poids n'est montré ni réglé.
 */

import {
  joursDuContrat,
  lireRegles,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { JOURS_TRAVAILLES_MAX, TEMPS_PLEIN } from '#/lib/planning/regles.ts'
import { heuresLisibles } from '#/lib/planning/temps.ts'
import type {
  ForceRegle,
  JourIsole,
  JourneesContratLigne,
  ModeleContrat,
  Referentiel,
  Reglages,
  TypeContrat,
} from '#/lib/planning/types.ts'
import { TYPES_CONTRAT } from '#/lib/planning/types.ts'

const H = 60

/** Les journées imposées d'une durée de contrat. `etoile` : des journées
 * pleines et une journée étoile plus courte ; `egales` : toutes de `duree`. */
export interface LigneJournees {
  /** Clé stable de la ligne à l'écran. */
  cle: string
  /** Minutes par semaine. */
  minutes: number
  mode: 'egales' | 'etoile'
  /** Durée de chaque journée (mode `egales`). */
  duree: number
  /** Durée de la journée étoile (mode `etoile`). */
  courte: number
}

export interface SaisieReglesContrats {
  journees: LigneJournees[]
  journee_pleine: number
  journee_etoile_min: number
  deux_repos_de_suite: ForceRegle
  jours_affiles_max: number
  jours_affiles_conseilles: number
  jour_isole: JourIsole
  rythme_contrat_min: number
  repos_confort: number
  changements_moment_max: number
  moment_arriere_jours: number
  nuits_affilees_max: number
  repos_apres_nuits: number
  ecole_veille_fin: number
  ecole_lendemain_debut: number
  conge_long: number
  semaines_en_plus_alerte: number
  /** Une ligne par type de contrat, dans l'ordre de `TYPES_CONTRAT`. */
  modeles: ModeleContrat[]
}

/** Bornes de la saisie : celles des CHECK de la base (migration
 * 20261105100000). Rien ne descend sous la loi : 11 h de repos, 6 jours
 * d'affilée au plus, 48 h par semaine. */
export const BORNES = {
  contratMin: 1 * H,
  contratMax: 48 * H,
  journeeMin: 1 * H,
  journeeMax: 12 * H,
  pleineMin: 6 * H,
  pleineMax: 12 * H,
  joursAffilesMax: JOURS_TRAVAILLES_MAX,
  reposConfortMin: 11 * H,
  reposConfortMax: 24 * H,
  changementsMax: 6,
  arriereMax: 6,
  nuitsMax: 6,
  reposApresNuitsMax: 3,
  congeLongMax: 30,
  semainesEnPlusMax: 4,
  lignesMax: 10,
} as const

const nouvelleCle = (() => {
  let n = 0
  return () => `ligne-${++n}`
})()

function ligneDe(
  j: RegleEtablissement['contrats']['journees'][number],
  i: number,
): LigneJournees {
  const etoile = j.courtesMax > 0 && j.durees.length > 1
  return {
    // Clé stable d'une lecture à l'autre : le brouillon ne se croit pas
    // modifié quand la base est relue.
    cle: `base-${i}`,
    minutes: j.minutesHebdo,
    mode: etoile ? 'etoile' : 'egales',
    duree: Math.max(...j.durees),
    courte: Math.min(...j.durees),
  }
}

function modeleDeLaBase(
  type: TypeContrat,
  regles: RegleEtablissement,
): ModeleContrat {
  const m = regles.modeles[type]
  return {
    type_contrat: type,
    journees_imposees: m.journeesImposees,
    journee_etoile: m.journeeEtoile,
    placement_manuel: m.placementManuel,
    contrat_indicatif: m.contratIndicatif,
    ferie_rattrape: m.ferieRattrape,
    feries_jour_meme: m.feriesJourMeme,
    alternance: m.alternance,
  }
}

/** La saisie du tiroir, d'après les règles lues en base. */
export function saisieDepuis(
  referentiel: Pick<Referentiel, 'reglages' | 'modelesContrat'>,
): SaisieReglesContrats {
  const r = lireRegles(referentiel)
  return {
    journees: r.contrats.journees.map(ligneDe),
    journee_pleine: r.contrats.journeePleine,
    journee_etoile_min: r.contrats.journeeEtoileMin,
    deux_repos_de_suite: r.repos.deuxReposDeSuite,
    jours_affiles_max: r.repos.joursAffilesMax,
    jours_affiles_conseilles: r.repos.joursAffilesConseilles,
    jour_isole: r.repos.jourIsole,
    rythme_contrat_min: r.repos.rythmeContratMin,
    repos_confort: r.repos.reposConfort,
    changements_moment_max: r.repos.changementsMomentMax,
    moment_arriere_jours: r.repos.momentArriereJours,
    nuits_affilees_max: r.repos.nuitsAffileesMax,
    repos_apres_nuits: r.repos.reposApresNuits,
    ecole_veille_fin: r.ecole.veilleFin,
    ecole_lendemain_debut: r.ecole.lendemainDebut,
    conge_long: r.conges.congeLong,
    semaines_en_plus_alerte: r.heures.semainesEnPlusAlerte,
    modeles: TYPES_CONTRAT.map((t) => modeleDeLaBase(t.code, r)),
  }
}

/** Les journées d'une ligne telles que la base les range. */
export function journeesDeLaLigne(
  l: LigneJournees,
  pleine: number,
): JourneesContratLigne {
  return l.mode === 'etoile'
    ? { minutes_hebdo: l.minutes, durees: [pleine, l.courte], courtes_max: 1 }
    : { minutes_hebdo: l.minutes, durees: [l.duree], courtes_max: 0 }
}

/** Les colonnes de `planning_reglages` à écrire (champs de ce tiroir
 * seulement : la relève, les moments, les passations ne bougent pas). */
export function reglagesDepuis(s: SaisieReglesContrats): Partial<Reglages> {
  return {
    journees_contrats: [...s.journees]
      .sort((a, b) => a.minutes - b.minutes)
      .map((l) => journeesDeLaLigne(l, s.journee_pleine)),
    journee_pleine: s.journee_pleine,
    journee_etoile_min: s.journee_etoile_min,
    deux_repos_de_suite: s.deux_repos_de_suite,
    jours_affiles_max: s.jours_affiles_max,
    jours_affiles_conseilles: s.jours_affiles_conseilles,
    jour_isole: s.jour_isole,
    rythme_contrat_min: s.rythme_contrat_min,
    repos_confort: s.repos_confort,
    changements_moment_max: s.changements_moment_max,
    moment_arriere_jours: s.moment_arriere_jours,
    nuits_affilees_max: s.nuits_affilees_max,
    repos_apres_nuits: s.repos_apres_nuits,
    ecole_veille_fin: s.ecole_veille_fin,
    ecole_lendemain_debut: s.ecole_lendemain_debut,
    conge_long: s.conge_long,
    semaines_en_plus_alerte: s.semaines_en_plus_alerte,
  }
}

/** Les types de contrat dont les règles ont changé. */
export function modelesChanges(
  avant: SaisieReglesContrats,
  apres: SaisieReglesContrats,
): ModeleContrat[] {
  return apres.modeles.filter((m) => {
    const a = avant.modeles.find((x) => x.type_contrat === m.type_contrat)
    return !a || JSON.stringify(a) !== JSON.stringify(m)
  })
}

/** Une ligne neuve : la première durée libre au-dessus des autres. */
export function ligneNeuve(s: SaisieReglesContrats): LigneJournees {
  const prises = new Set(s.journees.map((l) => l.minutes))
  let minutes = 24 * H
  while (prises.has(minutes) && minutes < BORNES.contratMax) minutes += H
  return {
    cle: nouvelleCle(),
    minutes,
    mode: 'egales',
    duree: Math.min(s.journee_pleine, Math.max(BORNES.journeeMin, 7 * H)),
    courte: s.journee_etoile_min,
  }
}

const h = heuresLisibles

/** Jours de travail par semaine que donnent les journées d'une ligne
 * (`joursDuContrat`, la règle déduite du moteur). */
export function joursDeLaLigne(
  l: LigneJournees,
  pleine: number,
): number | null {
  const r = journeesDeLaLigne(l, pleine)
  return joursDuContrat(
    {
      ...REGLES_PAR_DEFAUT,
      contrats: {
        ...REGLES_PAR_DEFAUT.contrats,
        journees: [
          {
            minutesHebdo: r.minutes_hebdo,
            durees: r.durees,
            courtesMax: r.courtes_max,
          },
        ],
      },
    },
    l.minutes,
  )
}

/** La phrase d'une ligne : ce que le planning automatique pose. */
export function phraseLigne(l: LigneJournees, pleine: number): string {
  const jours = joursDeLaLigne(l, pleine)
  const nb =
    jours === null
      ? ''
      : ` Soit ${jours} jour${jours > 1 ? 's' : ''} de travail par semaine.`
  return l.mode === 'etoile'
    ? `Le planning pose des journées de ${h(pleine)} et une journée étoile de ${h(l.courte)}.${nb}`
    : `Le planning ne pose que des journées de ${h(l.duree)}.${nb}`
}

/** Ce qui empêche d'enregistrer (vide : rien). */
export function erreursSaisie(s: SaisieReglesContrats): string[] {
  const erreurs: string[] = []
  const vues = new Set<number>()
  if (s.journees.length > BORNES.lignesMax)
    erreurs.push(`Au plus ${BORNES.lignesMax} contrats aux journées imposées.`)
  if (s.journee_etoile_min >= s.journee_pleine)
    erreurs.push(
      `La journée étoile doit être plus courte que la journée pleine (${h(s.journee_pleine)}).`,
    )
  for (const l of s.journees) {
    const nom = `Contrat de ${h(l.minutes)}`
    if (vues.has(l.minutes)) erreurs.push(`${nom} : il est déjà dans la liste.`)
    vues.add(l.minutes)
    if (l.minutes < BORNES.contratMin || l.minutes > BORNES.contratMax)
      erreurs.push(`${nom} : de 1 h à 48 h par semaine, comme le veut la loi.`)
    if (l.mode === 'etoile') {
      if (l.minutes <= TEMPS_PLEIN)
        erreurs.push(
          `${nom} : la journée étoile ne vaut qu'au-delà de 35 h par semaine.`,
        )
      if (l.courte < s.journee_etoile_min || l.courte >= s.journee_pleine)
        erreurs.push(
          `${nom} : la journée étoile fait de ${h(s.journee_etoile_min)} à moins de ${h(s.journee_pleine)}.`,
        )
    } else if (l.duree < BORNES.journeeMin || l.duree > BORNES.journeeMax) {
      erreurs.push(`${nom} : une journée fait de 1 h à 12 h.`)
    }
    const jours = joursDeLaLigne(l, s.journee_pleine)
    if (jours !== null && jours > JOURS_TRAVAILLES_MAX)
      erreurs.push(
        `${nom} : ces journées demandent ${jours} jours par semaine, plus que les ${JOURS_TRAVAILLES_MAX} permis par la loi.`,
      )
  }
  if (s.jours_affiles_conseilles > s.jours_affiles_max)
    erreurs.push(
      "Les jours d'affilée conseillés ne dépassent pas le plafond de jours d'affilée.",
    )
  for (const m of s.modeles)
    if (m.ferie_rattrape && m.feries_jour_meme)
      erreurs.push(
        'Un contrat prend ses jours fériés le jour même ou les rattrape, pas les deux.',
      )
  return erreurs
}

/** Ce qui mérite d'être dit sans bloquer : un contrat que ses journées ne
 * remplissent pas exactement (le planning n'ajoute jamais d'heures en plus). */
export function avertissementsSaisie(s: SaisieReglesContrats): string[] {
  return s.journees.flatMap((l) => {
    const pleine = l.mode === 'etoile' ? s.journee_pleine : l.duree
    const courte = l.mode === 'etoile' ? l.courte : l.duree
    const reste = l.minutes - (l.mode === 'etoile' ? courte : 0)
    if (reste >= 0 && reste % pleine === 0) return []
    return [
      `Contrat de ${h(l.minutes)} : ces journées ne tombent pas juste. Le planning n'ajoute jamais d'heures, il en manquera chaque semaine.`,
    ]
  })
}

/** Phrases d'effet des réglages à choix. */
export const PHRASES = {
  deuxRepos: {
    obligatoire:
      'Chacun a deux jours de repos de suite chaque semaine. Une place reste vide plutôt que de les casser.',
    souhaite:
      "Le planning cherche deux jours de repos de suite, mais peut les séparer s'il manque du monde.",
    aucune:
      'Les deux jours de repos peuvent tomber séparément. Les mineurs gardent les leurs, comme le veut la loi.',
  } satisfies Record<ForceRegle, string>,
  jourIsole: {
    interdit:
      'Jamais un jour de travail seul entre deux jours de repos, pour les contrats concernés.',
    a_eviter:
      'Le planning évite un jour de travail seul entre deux repos, sans en faire une obligation.',
    aucune: 'Un jour de travail seul entre deux repos est permis.',
  } satisfies Record<JourIsole, string>,
} as const

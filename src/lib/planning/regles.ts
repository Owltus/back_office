/*
 * Traduction « fiche salarié + règles HCR → plafonds chiffrés » pour le
 * solveur (prototype `regles.py`). C'est le SEUL endroit où vivent les
 * chiffres de la convention (HCR, IDCC 1979) ; chaque constante renvoie à
 * l'identifiant de sa règle dans `docs/regles-hcr.md` du prototype.
 * Le solveur ne connaît pas la convention : il applique des nombres.
 */

import { salarieSolveur } from '#/lib/planning/modele.ts'
import type { SalarieSolveur } from '#/lib/planning/modele.ts'
import { heuresLisibles } from '#/lib/planning/temps.ts'
import type { Categorie, TypeContrat } from '#/lib/planning/types.ts'

const H = 60

/** R-JOUR-MAX : durée maximale d'un service selon la catégorie du poste. */
export const JOUR_MAX_CATEGORIE: Record<Categorie, number> = {
  reception: 12 * H,
  veille_nuit: 12 * H,
  cuisine: 11 * H,
  administratif_hors_site: 10 * H,
  autre: 11 * H + 30,
}

export const SEMAINE_MAX = 48 * H // R-SEMAINE-MAX-ABS
export const REPOS_QUOTIDIEN = 11 * H // R-REPOS-QUOTIDIEN
export const REPOS_HEBDO_MIN = 35 * H // R-REPOS-HEBDO-35H : 24 h + 11 h
export const JOURS_TRAVAILLES_MAX = 6 // R-SIX-JOURS-MAX
/** R-REPOS-HEBDO-HCR : 5 jours de préférence, 6 en cas de besoin, et au
 * moins 3 jours de repos sur deux semaines consécutives. */
export const JOURS_TRAVAILLES_PREFERES = 5
export const REPOS_DEUX_SEMAINES = 3
export const TEMPS_PLEIN = 35 * H
/** R-JOURNEE-ETOILE (organisation de l'hôtel) : au-delà de 35 h, une seule
 * journée courte par semaine, 39 h = 4 × 8 h + 1 × 7 h. */
export const JOURNEE_PLEINE = 8 * H
export const JOURNEES_COURTES_MAX = 1
/** R-ABSENCE-HEURES : un jour d'absence compté vaut une journée ; 5 au plus. */
export const JOURS_CONTRAT = 5
/** R-CADRE-FJ : seuls le repos de 11 h et le repos hebdo, soit 13 h d'amplitude. */
export const FORFAIT_JOUR_MAX = 13 * H
export const FORFAIT_SEMAINE_MAX = JOURS_TRAVAILLES_PREFERES * FORFAIT_JOUR_MAX
export const STAGE_JOUR_MAX = 10 * H // R-STAGE-TEMPS (prototype, À VÉRIFIER)
export const MINEUR_JOUR_MAX = 8 * H // R-MINEUR-JOUR-MAX
export const MINEUR_SEMAINE_MAX = 35 * H // R-MINEUR-SEMAINE-MAX
export const MINEUR_REPOS_QUOTIDIEN = 12 * H // R-REPOS-QUOTIDIEN-MINEUR

/** Ce que la fiche d'un membre du staff dit de son contrat, pour une semaine. */
export interface Fiche {
  id: string
  postes: ReadonlySet<string>
  typeContrat: TypeContrat
  minutesHebdo: number
  forfaitJours?: boolean
  mineur?: boolean
  indisponibilites?: ReadonlySet<number>
  reposFixes?: ReadonlySet<number>
  travailFixe?: ReadonlySet<number>
  shiftImpose?: ReadonlyArray<readonly [number, string]>
  shiftsAutorises?: ReadonlySet<string>
  postesOccasionnels?: ReadonlySet<string>
  postesSoutien?: ReadonlySet<string>
  /** Jours d'absence de la semaine comptés dans les heures. */
  joursAbsenceDecomptes?: number
  joursEcole?: ReadonlySet<number>
  horsContrat?: ReadonlySet<number>
  etoileFixe?: ReadonlySet<number>
  contratDebut?: number | null
  contratFin?: number | null
  personne?: string | null
}

const vide: ReadonlySet<number> = new Set()

function plafondTempsPartiel(f: Fiche): number {
  if (f.minutesHebdo < TEMPS_PLEIN) {
    // R-TP-HEURES-COMPL : heures complémentaires ≤ 1/3 du contrat et total < 35 h.
    return Math.min(
      f.minutesHebdo + Math.floor(f.minutesHebdo / 3),
      TEMPS_PLEIN - 1,
    )
  }
  return SEMAINE_MAX
}

export function plafondHebdo(f: Fiche): number {
  if (f.mineur) {
    return Math.min(MINEUR_SEMAINE_MAX, SEMAINE_MAX, plafondTempsPartiel(f))
  }
  if (f.forfaitJours) return FORFAIT_SEMAINE_MAX
  // Un extra n'a pas de durée contractuelle (À VÉRIFIER) : le plafond absolu.
  if (f.typeContrat === 'extra') return SEMAINE_MAX
  return plafondTempsPartiel(f)
}

export function plafondJour(f: Fiche): number {
  if (f.mineur) return MINEUR_JOUR_MAX
  if (f.typeContrat === 'stagiaire') return STAGE_JOUR_MAX
  if (f.forfaitJours) return FORFAIT_JOUR_MAX
  // Le plafond propre à chaque poste est porté par chaque créneau.
  return Math.max(...Object.values(JOUR_MAX_CATEGORIE))
}

/** R-JOUR-MAX : présence maximale d'un service sur un poste de cette catégorie. */
export function presenceMaxPoste(categorie: string): number | null {
  return (JOUR_MAX_CATEGORIE as Record<string, number>)[categorie] ?? null
}

/** R-JOURNEE-ETOILE : contrats au-delà de 35 h payés à l'heure. */
export function journeeEtoile(f: Fiche): boolean {
  return (
    f.minutesHebdo > TEMPS_PLEIN && !f.forfaitJours && f.typeContrat !== 'extra'
  )
}

/** Sa journée étoile est fixée sur un jour où il peut encore travailler. */
export function etoileTravaillable(f: Fiche): boolean {
  const bloques = new Set([
    ...(f.indisponibilites ?? vide),
    ...(f.horsContrat ?? vide),
    ...(f.reposFixes ?? vide),
  ])
  return [...(f.etoileFixe ?? vide)].some((j) => !bloques.has(j))
}

/**
 * R-ABSENCE-HEURES : heures à planifier dans la semaine, absences déduites.
 * Sans absence : le contrat. Sinon des journées pleines sur les jours qui
 * restent (39 h et un congé : 4 × 8 h) ; à 35 h ou moins, contrat / 5 par
 * jour. Journée étoile fixée sur un jour travaillable : comptée courte.
 */
export function heuresDues(f: Fiche): number {
  const absents = Math.min(f.joursAbsenceDecomptes ?? 0, JOURS_CONTRAT)
  if (!absents) return f.minutesHebdo
  if (!journeeEtoile(f)) {
    const journee = Math.floor(f.minutesHebdo / JOURS_CONTRAT)
    return Math.max(
      0,
      Math.min(f.minutesHebdo, (JOURS_CONTRAT - absents) * journee),
    )
  }
  let dues = (JOURS_CONTRAT - absents) * JOURNEE_PLEINE
  if (dues && etoileTravaillable(f)) {
    const courte = f.minutesHebdo - (JOURS_CONTRAT - 1) * JOURNEE_PLEINE
    dues -= JOURNEE_PLEINE - Math.max(0, Math.min(JOURNEE_PLEINE, courte))
  }
  return Math.max(0, Math.min(f.minutesHebdo, dues))
}

export function versSolveur(f: Fiche): SalarieSolveur {
  const ecole = f.joursEcole ?? vide
  const etoile = journeeEtoile(f)
  return salarieSolveur({
    id: f.id,
    postes: f.postes,
    minutesHebdoContrat: heuresDues(f),
    minutesHebdoMax: plafondHebdo(f),
    minutesJourMax: plafondJour(f),
    // Mineurs : deux jours de repos consécutifs (R-REPOS-HEBDO-MINEUR).
    joursTravaillesMaxSemaine: f.mineur
      ? JOURS_TRAVAILLES_PREFERES
      : JOURS_TRAVAILLES_MAX,
    joursPreferesSemaine: JOURS_TRAVAILLES_PREFERES,
    reposDeuxSemaines: REPOS_DEUX_SEMAINES,
    reposQuotidienMin: f.mineur ? MINEUR_REPOS_QUOTIDIEN : REPOS_QUOTIDIEN,
    reposHebdoMin: f.mineur ? 0 : REPOS_HEBDO_MIN,
    jourMaxPoste: !f.forfaitJours, // R-CADRE-FJ
    contratDebut: f.contratDebut ?? null,
    contratFin: f.contratFin ?? null,
    personne: f.personne ?? null,
    indisponibilites: new Set([...(f.indisponibilites ?? vide), ...ecole]),
    joursHorsSite: ecole,
    reposConsecutifs: !!f.mineur,
    nuitInterdite: !!f.mineur, // R-NUIT-MINEUR
    reposFixes: f.reposFixes ?? vide,
    travailFixe: f.travailFixe ?? vide,
    horsContrat: f.horsContrat ?? vide,
    etoileFixe: etoile ? (f.etoileFixe ?? vide) : vide,
    journeesCourtesMax: etoile ? JOURNEES_COURTES_MAX : null,
    journeePleine: JOURNEE_PLEINE,
    contratIndicatif: !!f.forfaitJours || f.typeContrat === 'extra',
    placementManuel: f.typeContrat === 'extra',
    shiftImpose: f.shiftImpose ?? [],
    shiftsAutorises: f.shiftsAutorises ?? new Set(),
    postesOccasionnels: f.postesOccasionnels ?? new Set(),
    postesSoutien: f.postesSoutien ?? new Set(),
  })
}

/** Un besoin plus long que le maximum HCR de sa catégorie ne peut être tenu. */
export function alerteBesoin(
  categorie: string,
  dureeMinutes: number,
): string | null {
  const maximum = presenceMaxPoste(categorie)
  if (maximum !== null && dureeMinutes > maximum) {
    const h = Math.floor(maximum / 60)
    const m = maximum % 60
    return `dépasse la durée maximale d'un service pour cette catégorie (${h} h ${String(m).padStart(2, '0')}, R-JOUR-MAX)`
  }
  return null
}

export interface LigneRegle {
  regle: string
  texte: string
}

/** Les règles appliquées à cette fiche, en clair, pour l'écran. */
export function resume(f: Fiche): LigneRegle[] {
  const s = versSolveur(f)
  const lignes: Array<[string, string]> = [
    [
      'CONTRAT',
      `Objectif : ${heuresLisibles(s.minutesHebdoContrat)} par semaine`,
    ],
    [
      'R-SEMAINE-MAX',
      `Au plus ${heuresLisibles(s.minutesHebdoMax)} par semaine`,
    ],
    [
      'R-JOUR-MAX',
      `Au plus ${heuresLisibles(s.minutesJourMax)} par jour (moins selon le poste)`,
    ],
    [
      'R-REPOS-QUOTIDIEN',
      `Au moins ${heuresLisibles(s.reposQuotidienMin)} de repos entre deux services`,
    ],
    [
      'R-REPOS-HEBDO-HCR',
      `2 jours de repos par semaine (${s.joursPreferesSemaine} jours travaillés ; 6 en cas de besoin, avec au moins ${s.reposDeuxSemaines} jours de repos sur deux semaines)`,
    ],
  ]
  if (s.reposHebdoMin) {
    lignes.push([
      'R-REPOS-HEBDO-35H',
      `Au moins ${heuresLisibles(s.reposHebdoMin)} de repos d'affilée par semaine`,
    ])
  }
  if (f.minutesHebdo < TEMPS_PLEIN && !f.forfaitJours) {
    lignes.push([
      'R-TP-HEURES-COMPL',
      'Temps partiel : heures complémentaires ≤ 1/3 du contrat',
    ])
  }
  if (f.forfaitJours) {
    lignes.push([
      'R-CADRE-FJ',
      'Forfait jours : pas de décompte horaire, 218 jours par an',
    ])
  }
  if (f.typeContrat === 'stagiaire') {
    lignes.push([
      'R-STAGE-TEMPS',
      'Stagiaire : mêmes durées et repos que les salariés',
    ])
  }
  if (f.mineur) {
    lignes.push(['R-NUIT-MINEUR', 'Mineur : aucun travail entre 22 h et 6 h'])
    lignes.push([
      'R-REPOS-HEBDO-MINEUR',
      'Mineur : 2 jours de repos consécutifs',
    ])
  }
  return lignes.map(([regle, texte]) => ({ regle, texte }))
}

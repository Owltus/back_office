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
/** Jours de travail d'affilée, semaines voisines comprises (demande
 * utilisateur du 2026-11-02 : « 9 jours d'affilée sans pause… il faut les
 * laisser se reposer »). Le générateur l'évite (`POIDS_JOUR_AFFILE`), le
 * vérificateur le signale (JOURS-AFFILES) ; la loi en permet jusqu'à 12. */
export const JOURS_AFFILES_MAX = 6
/** Contrats à rythme de 5 jours : 35 h et plus (2026-11-01). */
export const RYTHME_CONTRAT_MIN = 35 * 60
/** Jours d'affilée visés (demande utilisateur du 2026-11-02 : « tu abuses
 * encore beaucoup trop des 6 jours d'affilée ») : le 6e jour enchaîné d'une
 * semaine à l'autre coûte déjà (`POIDS_JOUR_AFFILE_CONSEILLE`). */
export const JOURS_AFFILES_CONSEILLES = 5

/*
 * Règles morales du PRD (`plan/planning-bonnes-pratiques/PRD.md`, partie 4).
 * Ce ne sont pas des règles de la convention : la loi n'est qu'un plancher.
 * Le générateur les évite (poids sous les places et les heures dues, Q1),
 * le vérificateur les signale (alertes d'organisation, jamais bloquantes).
 * Seuils décidés par l'assistant le 2026-11-02 (questions Q1, Q7, Q8
 * déléguées par l'utilisateur), revus par l'utilisateur le 2026-11-03,
 * modifiables ici seulement.
 */
/** Règle 3 : repos conseillé entre la fin d'un service et le début du
 * suivant (la loi dit 11 h, `REPOS_QUOTIDIEN`, qui reste dure). 12 h :
 * décision utilisateur du 2026-11-03 (13 h avant). */
export const REPOS_CONFORT = 12 * H
/** Règle 17 (demande utilisateur du 2026-11-03 : « qu'ils restent ensemble
 * le maximum possible, à trente minutes près, synchro comme le matin ») :
 * à l'accueil, les personnes d'un même moment (matin, soir) arrivent à
 * cette tolérance près, celles du soir partent à cette tolérance près. */
export const EQUIPE_TOLERANCE = 30
/** Règle 6 : changements de moment (matin, middle, soir, nuit) au plus
 * dans une semaine, et de préférence vers plus tard (matin puis soir). */
export const CHANGEMENTS_MOMENT_MAX = 1
/** Règle 6 : un jour à un moment plus tôt qu'un des jours d'avant (soir puis
 * matin) compte quand ce jour-là est à moins de ce nombre de jours ; au-delà,
 * les jours de repos ont remis l'horloge à zéro. */
export const MOMENT_ARRIERE_JOURS = 2
/** Règle 7 : nuits d'affilée au plus. */
export const NUITS_AFFILEES_MAX = 5
/** Règle 7 : jours sans travail après une série de nuits, avant de
 * reprendre de jour. */
export const REPOS_APRES_NUITS = 2
/** Règle 13 : un congé d'au moins ce nombre de jours d'absence décomptée
 * d'affilée ouvre une semaine de retour en douceur. Les repos (fixes, posés)
 * font le pont sans compter ; l'école coupe la suite (`avecHistoire`). */
export const CONGE_LONG = 5
/** Règle 14 : la veille d'un jour d'école, pas de service qui finit après
 * cette heure (minutes depuis minuit). */
export const ECOLE_VEILLE_FIN = 21 * H
/** Règle 14 : le lendemain d'un jour d'école, pas de service qui commence
 * avant cette heure. */
export const ECOLE_LENDEMAIN_DEBUT = 8 * H
/** Règle 12 : au-delà du contrat ce nombre de semaines sur 4 (celle-ci
 * comprise) : alerte. */
export const SEMAINES_EN_PLUS_ALERTE = 3

export const REPOS_DEUX_SEMAINES = 3
export const TEMPS_PLEIN = 35 * H
/** R-JOURNEE-ETOILE (organisation de l'hôtel) : au-delà de 35 h, une seule
 * journée courte par semaine, 39 h = 4 × 8 h + 1 × 7 h. La journée étoile est
 * le jour d'un horaire de MOINS de `JOURNEE_PLEINE` (décision utilisateur du
 * 2026-11-02 : un horaire qui existe, plus aucun raccourci). */
export const JOURNEE_PLEINE = 8 * H
export const JOURNEES_COURTES_MAX = 1
/** Version étoile d'un horaire de 8 h (`etoile.ts`) : un horaire d'AU MOINS
 * 7 h (et de moins de 8 h), la journée de 7 h des 39 h. Un horaire plus
 * court (3 h, 5 h) n'est pas proposé comme journée étoile. */
export const JOURNEE_ETOILE_MIN = JOURNEE_PLEINE - H
/** R-ABSENCE-HEURES : un jour d'absence compté vaut une journée ; 5 au plus. */
export const JOURS_CONTRAT = 5
/** R-CADRE-FJ : seuls le repos de 11 h et le repos hebdo, soit 13 h d'amplitude. */
export const FORFAIT_JOUR_MAX = 13 * H
export const FORFAIT_SEMAINE_MAX = JOURS_TRAVAILLES_PREFERES * FORFAIT_JOUR_MAX
export const STAGE_JOUR_MAX = 10 * H // R-STAGE-TEMPS (prototype, À VÉRIFIER)
export const MINEUR_JOUR_MAX = 8 * H // R-MINEUR-JOUR-MAX
export const MINEUR_SEMAINE_MAX = 35 * H // R-MINEUR-SEMAINE-MAX
export const MINEUR_REPOS_QUOTIDIEN = 12 * H // R-REPOS-QUOTIDIEN-MINEUR

/** Repos quotidien dû (R-REPOS-QUOTIDIEN, R-REPOS-QUOTIDIEN-MINEUR). */
export function reposQuotidienMin(mineur: boolean | undefined): number {
  return mineur ? MINEUR_REPOS_QUOTIDIEN : REPOS_QUOTIDIEN
}

/** Ce que la fiche d'un membre du staff dit de son contrat, pour une semaine. */
export interface Fiche {
  id: string
  postes: ReadonlySet<string>
  typeContrat: TypeContrat
  minutesHebdo: number
  forfaitJours?: boolean
  mineur?: boolean
  /** Jours fériés de la semaine, pour un mineur (évités, MINEUR-FERIE). */
  feriesEvites?: ReadonlySet<number>
  indisponibilites?: ReadonlySet<number>
  reposFixes?: ReadonlySet<number>
  travailFixe?: ReadonlySet<number>
  shiftImpose?: ReadonlyArray<readonly [number, string]>
  shiftsAutorises?: ReadonlySet<string>
  postesOccasionnels?: ReadonlySet<string>
  postesSoutien?: ReadonlySet<string>
  /** Jours d'absence de la semaine comptés dans les heures, HORS jours
   * d'école (`heuresDues` les ajoute : une journée de contrat chacun). */
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
    ...(f.joursEcole ?? vide),
    ...(f.horsContrat ?? vide),
    ...(f.reposFixes ?? vide),
  ])
  return [...(f.etoileFixe ?? vide)].some((j) => !bloques.has(j))
}

/**
 * Journée de contrat d'une personne : ce que vaut un jour d'absence décompté
 * ou un jour d'école. Contrat à journée étoile (au-delà de 35 h) : une
 * journée pleine de 8 h. Sinon le contrat divisé par 5 (35 h : 7 h). Contrat
 * sans durée horaire (forfait jours, extra) : au moins 8 h, la valeur la plus
 * prudente (plus de temps réservé dans le plafond de la semaine).
 */
export function journeeContrat(f: Fiche): number {
  if (journeeEtoile(f)) return JOURNEE_PLEINE
  const parJour = Math.floor(Math.max(0, f.minutesHebdo) / JOURS_CONTRAT)
  if (f.forfaitJours || f.typeContrat === 'extra') {
    return Math.max(JOURNEE_PLEINE, parJour)
  }
  return parJour
}

/**
 * R-ABSENCE-HEURES : heures à planifier dans la semaine, absences déduites.
 * Sans absence : le contrat. Sinon une journée de contrat (`journeeContrat`)
 * sur chaque jour qui reste (39 h et un congé : 4 × 8 h ; 35 h : 4 × 7 h).
 * Journée étoile fixée sur un jour travaillable : comptée courte.
 *
 * R-ECOLE-HEURES (L6222-24, décision utilisateur du 2026-10-29) : un jour
 * d'école est une journée de travail COMPLÈTE, décomptée comme un jour
 * d'absence (39 h et deux jours d'école : 3 × 8 h, moins 1 h si la journée
 * étoile tombe sur un jour qui reste). Le plafond de la semaine lui réserve
 * la même journée (`versSolveur`) : dues et plafond restent d'accord. École
 * et absences qui couvrent les cinq jours du contrat : rien de dû. Seule
 * source des heures dues : générateur, vérificateur et affichage les lisent.
 */
export function heuresDues(f: Fiche): number {
  const absents = Math.min(
    (f.joursAbsenceDecomptes ?? 0) + (f.joursEcole?.size ?? 0),
    JOURS_CONTRAT,
  )
  if (!absents) return f.minutesHebdo
  if (!journeeEtoile(f)) {
    return Math.max(
      0,
      Math.min(f.minutesHebdo, (JOURS_CONTRAT - absents) * journeeContrat(f)),
    )
  }
  let dues = (JOURS_CONTRAT - absents) * journeeContrat(f)
  if (dues && etoileTravaillable(f)) {
    const courte = f.minutesHebdo - (JOURS_CONTRAT - 1) * JOURNEE_PLEINE
    dues -= JOURNEE_PLEINE - Math.max(0, Math.min(JOURNEE_PLEINE, courte))
  }
  return Math.max(0, Math.min(f.minutesHebdo, dues))
}

/**
 * R-FERIE-RATTRAPE (décisions utilisateur du 2026-11-02) : la première année
 * du contrat, aucun jour férié ; ensuite, chaque jour férié TRAVAILLÉ est un
 * jour récupéré, le « Jour férié rattrapé » (JFR, `feries.ts`). Ouvre droit le
 * jour férié `ferie` si la date d'entrée est connue et passée d'un an au
 * moins (un an pile compte), hors extra et stagiaire. Date d'entrée vide :
 * moins d'un an, aucun droit (« si pas d'informations, pars du principe que
 * ça fait moins d'un an »).
 */
export function droitAuRattrapage(
  x: { type_contrat: TypeContrat; date_entree: string | null },
  ferie: string,
): boolean {
  if (x.type_contrat === 'extra' || x.type_contrat === 'stagiaire') return false
  if (!x.date_entree) return false
  const annee = Number(x.date_entree.slice(0, 4)) + 1
  // Comparaison de textes AAAA-MM-JJ : une entrée un 29 février ouvre droit
  // le 1er mars suivant.
  return ferie >= `${annee}${x.date_entree.slice(4, 10)}`
}

/** R-FERIE-RATTRAPE : un jour férié travaillé reste DÛ, avec son alerte
 * (JOUR-FERIE), et le calcul propose son JFR chaque semaine, jusqu'à ce
 * qu'il soit rendu (décision utilisateur du 2026-11-03, Q9 et Q14 : avant,
 * il se perdait sans prévenir au bout de 4 semaines). Borne de lecture :
 * 13 semaines (un trimestre) ; au-delà, les vues ne lisent plus ce jour
 * férié. Les vues lisent deux fois cette étendue (`premierLundiLu`). */
export const FERIE_RATTRAPAGE_JOURS = 91

/** R-FERIE-RATTRAPE : un JFR vaut un jour d'absence décompté, comme un
 * congé (`heuresDues` avec un jour de plus) : ce qu'il retire aux heures
 * dues de la semaine (35 h : 4 × 7 h restent, 7 h de moins ; 39 h : 4 × 8 h
 * restent, 7 h de moins ; 39 h avec la journée étoile fixée : 31 h restent,
 * 8 h de moins). Le JFR n'est jamais placé sur le jour de l'étoile fixée
 * (`preparerGeneration`) : la baisse vaut pour chacun des jours permis. */
export function reductionJourFerie(f: Fiche): number {
  return Math.max(
    0,
    heuresDues(f) -
      heuresDues({
        ...f,
        joursAbsenceDecomptes: (f.joursAbsenceDecomptes ?? 0) + 1,
      }),
  )
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
    reposQuotidienMin: reposQuotidienMin(f.mineur),
    reposHebdoMin: f.mineur ? 0 : REPOS_HEBDO_MIN,
    jourMaxPoste: !f.forfaitJours, // R-CADRE-FJ
    contratDebut: f.contratDebut ?? null,
    contratFin: f.contratFin ?? null,
    personne: f.personne ?? null,
    indisponibilites: new Set([...(f.indisponibilites ?? vide), ...ecole]),
    joursHorsSite: ecole,
    // R-ECOLE-HEURES : un jour d'école compte une journée de contrat.
    minutesEcoleJour: journeeContrat(f),
    reposConsecutifs: !!f.mineur,
    feriesEvites: f.feriesEvites ?? vide,
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
      `2 jours de repos par semaine, ${s.joursPreferesSemaine} jours travaillés. 6 jours en cas de besoin, avec ${s.reposDeuxSemaines} jours de repos sur deux semaines. Au-delà, possible à la main avec une alerte, jusqu'à 12 jours d'affilée.`,
    ],
  ]
  if (s.reposHebdoMin) {
    lignes.push([
      'R-REPOS-HEBDO-35H',
      // Un seul jour libre suffit (24 h + les 11 h du repos quotidien), si
      // la veille ne finit pas tard et le lendemain ne commence pas tôt
      // (question utilisateur du 2026-10-31 : ce n'est pas deux jours).
      `Au moins ${heuresLisibles(s.reposHebdoMin)} de repos d'affilée par semaine : un jour libre suffit, sans finir tard la veille ni commencer tôt le lendemain`,
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
      'Forfait jours : pas de décompte des heures. Le repos de 11 h et le repos de la semaine s’appliquent.',
    ])
  }
  if (f.typeContrat === 'stagiaire') {
    lignes.push([
      'R-STAGE-TEMPS',
      'Stagiaire : au plus 10 h par jour, mêmes repos que les salariés',
    ])
  }
  if (f.typeContrat === 'apprenti' || f.joursEcole?.size) {
    lignes.push([
      'R-ECOLE-HEURES',
      `Un jour d'école compte comme une journée de travail complète (${heuresLisibles(s.minutesEcoleJour)})`,
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

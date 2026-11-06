/*
 * Traduction « fiche salarié + règles HCR → plafonds chiffrés » pour le
 * solveur (prototype `regles.py`). C'est le SEUL endroit où vivent les
 * chiffres de la convention (HCR, IDCC 1979) ; chaque constante renvoie à
 * l'identifiant de sa règle dans `docs/regles-hcr.md` du prototype.
 * Le solveur ne connaît pas la convention : il applique des nombres.
 */

import { salarieSolveur } from '#/lib/planning/modele.ts'
import {
  aJourneeCourteImposee,
  dureesImposees,
  journeesDuContrat,
  modeleDe,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import type { SalarieSolveur } from '#/lib/planning/modele.ts'
import type { NiveauSolveur } from '#/lib/planning/niveaux.ts'
import { heuresLisibles } from '#/lib/planning/temps.ts'
import type { Poste, TypeContrat } from '#/lib/planning/types.ts'

const H = 60

/** R-JOUR-MAX : la loi borne un service à 12 h (réception et veille de
 * nuit, HCR ; les autres métiers ont moins). Depuis le 2026-11-06, la durée
 * max d'un service se règle sur le POSTE (`Poste.jour_max_minutes`), jamais
 * au-delà de cette borne. */
export const JOUR_MAX_LOI = 12 * H
/** Durée max d'un poste sans réglage (données de test) : 11 h 30, le défaut
 * de la base (ancienne catégorie « autre »). */
export const JOUR_MAX_POSTE_DEFAUT = 11 * H + 30

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
export const JOURS_AFFILES_MAX = REGLES_PAR_DEFAUT.repos.joursAffilesMax
/** Contrats à rythme de 5 jours : 35 h et plus (2026-11-01). */
export const RYTHME_CONTRAT_MIN = REGLES_PAR_DEFAUT.repos.rythmeContratMin

/** Les semaines « humaines » du 2026-11-04 (décision d'une responsable) :
 * au plus `JOURS_AFFILES_CONSEILLES` jours d'affilée et jamais un jour de
 * travail seul entre deux repos, DURS pour le calcul. Pour un contrat de
 * 35 h et plus, ni forfait jours ni extra : un petit contrat a des jours
 * seuls par nature. Une seule source pour le générateur, le vérificateur
 * et les repos obligés. */
export function rythmeHumain(
  s: {
    contratIndicatif: boolean
    placementManuel: boolean
    minutesHebdoContrat: number
    minutesContrat?: number
  },
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): boolean {
  // Le contrat, jamais les heures dues de la semaine : un congé, un JFR ou
  // l'école ne doivent pas lever ces règles (relecture du 2026-11-04 : 39 h
  // et quatre jours de congé, le vendredi restait seul).
  return (
    !s.contratIndicatif &&
    !s.placementManuel &&
    (s.minutesContrat ?? s.minutesHebdoContrat) >= regles.repos.rythmeContratMin
  )
}

/** Le jour de travail seul entre deux repos, tel que la règle de
 * l'établissement le dit pour cette personne : interdit (dur pour le calcul,
 * bloque une place), à éviter (conseil), ou sans règle. Interdit seulement
 * au rythme humain (`rythmeHumain`) : les autres contrats ont des jours
 * seuls par nature, au plus un conseil. */
export function jourIsoleDe(
  s: Parameters<typeof rythmeHumain>[0],
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): 'interdit' | 'a_eviter' | 'aucune' {
  const r = regles.repos.jourIsole
  if (r === 'aucune') return 'aucune'
  return r === 'interdit' && rythmeHumain(s, regles) ? 'interdit' : 'a_eviter'
}

/** Le jour `v` (0 = lundi de la période ; négatif, la semaine d'avant ;
 * au-delà, la suivante) est APRÈS la fin du contrat. Pour le jour isolé, il
 * compte comme du travail : le dernier jour d'un contrat n'est pas un jour
 * seul. Les jours AVANT l'arrivée, eux, comptent comme du repos : un stage
 * ne commence ni par un jour seul, ni par ses repos (relecture du
 * 2026-11-04). Une heure de marge pour un changement d'heure. */
export function apresContrat(
  s: { contratFin: number | null },
  v: number,
): boolean {
  return s.contratFin !== null && v * 24 * 60 >= s.contratFin - 60
}
/** Jours d'affilée visés (demande utilisateur du 2026-11-02 : « tu abuses
 * encore beaucoup trop des 6 jours d'affilée ») : le 6e jour enchaîné d'une
 * semaine à l'autre coûte déjà (`POIDS_JOUR_AFFILE_CONSEILLE`). */
export const JOURS_AFFILES_CONSEILLES =
  REGLES_PAR_DEFAUT.repos.joursAffilesConseilles

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
export const REPOS_CONFORT = REGLES_PAR_DEFAUT.repos.reposConfort
/** Règle 17 (demande utilisateur du 2026-11-03 : « qu'ils restent ensemble
 * le maximum possible, à trente minutes près, synchro comme le matin ») :
 * à l'accueil, les personnes d'un même moment (matin, soir) arrivent à
 * cette tolérance près, celles du soir partent à cette tolérance près. */
export const EQUIPE_TOLERANCE = 30
/** Relève : temps que le planning cherche à faire passer ENSEMBLE l'équipe
 * du matin et celle de l'après-midi, chacun sa personne de l'autre équipe
 * (une préférence ; le minimum, c'est la continuité). */
export const RELEVE_MINUTES = 30
/*
 * PASSATION ENTRE LES ÉQUIPES : FIXE (décision utilisateur du 2026-11-06 :
 * « cette notion n'a pas besoin d'être paramétrable. Dis-toi simplement que
 * c'est toujours, par défaut, la transition parfaite, genre terminer à 15h00
 * et l'autre commence à 15h00, mais si possible de chevauchement, privilégie
 * le chevauchement. Donc retire le paramétrage de cela. »). Dans toute zone
 * tenue en continu, et seulement là :
 *   - continuité OBLIGATOIRE au prix d'une place nécessaire (D8) : aucun trou
 *     entre deux équipes, nuit comprise ;
 *   - passation avec la nuit : le dernier du soir attend le veilleur, le
 *     premier du matin le relaie ;
 *   - relève préférée de `RELEVE_MINUTES` ;
 *   - équipe du soir ensemble à `EQUIPE_TOLERANCE` près.
 * Les colonnes de la base (`planning_reglages.continuite_obligatoire`,
 * `releve_minutes`, `passation_veilleur`, `equipe_tolerance`, et celles de
 * `planning_zones`) restent, plus lues. NE PAS les rendre réglables.
 */
/** Règle 6 : changements de moment (matin, middle, soir, nuit) au plus
 * dans une semaine, et de préférence vers plus tard (matin puis soir). */
export const CHANGEMENTS_MOMENT_MAX =
  REGLES_PAR_DEFAUT.repos.changementsMomentMax
/** Règle 6 : un jour à un moment plus tôt qu'un des jours d'avant (soir puis
 * matin) compte quand ce jour-là est à moins de ce nombre de jours ; au-delà,
 * les jours de repos ont remis l'horloge à zéro. */
export const MOMENT_ARRIERE_JOURS = REGLES_PAR_DEFAUT.repos.momentArriereJours
/** Règle 7 : nuits d'affilée au plus. */
export const NUITS_AFFILEES_MAX = REGLES_PAR_DEFAUT.repos.nuitsAffileesMax
/** Règle 7 : jours sans travail après une série de nuits, avant de
 * reprendre de jour. */
export const REPOS_APRES_NUITS = REGLES_PAR_DEFAUT.repos.reposApresNuits
/** Règle 13 : un congé d'au moins ce nombre de jours d'absence décomptée
 * d'affilée ouvre une semaine de retour en douceur. Les repos (fixes, posés)
 * font le pont sans compter ; l'école coupe la suite (`avecHistoire`). */
export const CONGE_LONG = REGLES_PAR_DEFAUT.conges.congeLong
/** Règle 14 : la veille d'un jour d'école, pas de service qui finit après
 * cette heure (minutes depuis minuit). */
export const ECOLE_VEILLE_FIN = REGLES_PAR_DEFAUT.ecole.veilleFin
/** Règle 14 : le lendemain d'un jour d'école, pas de service qui commence
 * avant cette heure. */
export const ECOLE_LENDEMAIN_DEBUT = REGLES_PAR_DEFAUT.ecole.lendemainDebut
/** Règle 12 : au-delà du contrat ce nombre de semaines sur 4 (celle-ci
 * comprise) : alerte. */
export const SEMAINES_EN_PLUS_ALERTE =
  REGLES_PAR_DEFAUT.heures.semainesEnPlusAlerte

export const REPOS_DEUX_SEMAINES = 3
export const TEMPS_PLEIN = 35 * H
/** R-JOURNEE-ETOILE (organisation de l'hôtel) : au-delà de 35 h, une seule
 * journée courte par semaine, 39 h = 4 × 8 h + 1 × 7 h. La journée étoile est
 * le jour d'un horaire de MOINS de `JOURNEE_PLEINE` (décision utilisateur du
 * 2026-11-02 : un horaire qui existe, plus aucun raccourci). */
export const JOURNEE_PLEINE = REGLES_PAR_DEFAUT.contrats.journeePleine
export const JOURNEES_COURTES_MAX =
  REGLES_PAR_DEFAUT.contrats.journeesCourtesMax
/** Version étoile d'un horaire de 8 h (`etoile.ts`) : un horaire d'AU MOINS
 * 7 h (et de moins de 8 h), la journée de 7 h des 39 h. Un horaire plus
 * court (3 h, 5 h) n'est pas proposé comme journée étoile. */
export const JOURNEE_ETOILE_MIN = REGLES_PAR_DEFAUT.contrats.journeeEtoileMin
/** Les journées du calcul (`journeesDuCalcul`) : 7 h et 8 h pile, et les
 * deux contrats qui en ont une. */
export const JOURNEE_COURTE = REGLES_PAR_DEFAUT.contrats.journeeCourte
export const CONTRAT_35H = REGLES_PAR_DEFAUT.contrats.journees[0].minutesHebdo
export const CONTRAT_39H = REGLES_PAR_DEFAUT.contrats.journees[1].minutesHebdo
/** R-ABSENCE-HEURES : un jour d'absence compté vaut une journée ; 5 au plus. */
export const JOURS_CONTRAT = 5
/** R-CADRE-FJ : seuls le repos de 11 h et le repos hebdo, soit 13 h d'amplitude. */
export const FORFAIT_JOUR_MAX = 13 * H
export const FORFAIT_SEMAINE_MAX = JOURS_TRAVAILLES_PREFERES * FORFAIT_JOUR_MAX
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
  /** Travail (minutes) de chaque horaire de `shiftImpose` : la semaine type
   * ne prend la main sur les journées du calcul que si l'un d'eux n'est ni
   * de 7 h ni de 8 h (`journeesDuCalcul`). Absent : inconnu, elle la prend. */
  journeesFixees?: ReadonlySet<number>
  shiftsAutorises?: ReadonlySet<string>
  postesOccasionnels?: ReadonlySet<string>
  postesSoutien?: ReadonlySet<string>
  /** Niveau de chaque poste tenu (`niveaux.ts`). */
  niveauxPostes?: ReadonlyMap<string, NiveauSolveur>
  /** Jours d'absence de la semaine comptés dans les heures, HORS jours
   * d'école (`heuresDues` les ajoute : une journée de contrat chacun). */
  joursAbsenceDecomptes?: number
  joursEcole?: ReadonlySet<number>
  horsContrat?: ReadonlySet<number>
  etoileFixe?: ReadonlySet<number>
  contratDebut?: number | null
  contratFin?: number | null
  personne?: string | null
  /** Règles de l'établissement (`lireRegles`) ; absent : les défauts. */
  regles?: RegleEtablissement
}

const reglesDe = (f: Pick<Fiche, 'regles'>) => f.regles ?? REGLES_PAR_DEFAUT
const modeleFiche = (f: Pick<Fiche, 'regles' | 'typeContrat'>) =>
  modeleDe(reglesDe(f), f.typeContrat)

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
  // Un contrat placé à la main (l'extra) n'a pas de durée contractuelle (À
  // VÉRIFIER) : le plafond absolu. Tout autre contrat suit la loi du temps
  // partiel, heures indicatives ou non (relecture du 2026-11-05 : « Heures
  // indicatives » sur un CDI de 24 h ouvrait 48 h). La loi n'est jamais
  // réglable (B1). Seul un contrat SANS heures fixées (0 h) prend le plafond
  // absolu : une case ne lève jamais la loi d'un contrat qui a des heures
  // (relecture du 2026-11-06 : un CDI de 24 h « posé à la main » ouvrait 48 h).
  if (modeleFiche(f).placementManuel && f.minutesHebdo <= 0) return SEMAINE_MAX
  return plafondTempsPartiel(f)
}

export function plafondJour(f: Fiche): number {
  if (f.mineur) return MINEUR_JOUR_MAX
  // Durée max du contrat (le stagiaire : 10 h, R-STAGE-TEMPS), réglée dans
  // son modèle, jamais au-delà de la loi.
  const jourMax = modeleFiche(f).jourMaxMinutes
  if (jourMax !== null) return Math.min(jourMax, JOUR_MAX_LOI)
  if (f.forfaitJours) return FORFAIT_JOUR_MAX
  // Le plafond propre à chaque poste est porté par chaque créneau.
  return JOUR_MAX_LOI
}

/** R-JOUR-MAX : présence maximale d'un service sur ce poste (son réglage,
 * borné par la loi). */
export function presenceMaxPoste(
  poste: Pick<Poste, 'jour_max_minutes'>,
): number {
  return Math.min(poste.jour_max_minutes ?? JOUR_MAX_POSTE_DEFAUT, JOUR_MAX_LOI)
}

/** R-JOURNEE-ETOILE : contrats au-delà de 35 h payés à l'heure. */
export function journeeEtoile(f: Fiche): boolean {
  return (
    f.minutesHebdo > TEMPS_PLEIN &&
    !f.forfaitJours &&
    modeleFiche(f).journeeEtoile
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

/** Jours de la semaine pris par une absence décomptée ou l'école (au plus
 * les cinq jours du contrat). */
function joursAbsents(f: Fiche): number {
  return Math.min(
    (f.joursAbsenceDecomptes ?? 0) + (f.joursEcole?.size ?? 0),
    JOURS_CONTRAT,
  )
}

/** La journée étoile SAUTE la semaine d'une absence décomptée ou de l'école
 * (décision d'une responsable du 2026-11-04 : « un congé, une formation,
 * ça compte comme une journée complète ; en 39 h, tu sacrifies la journée
 * étoile et tu mets une journée de 8 h ») : tous les jours travaillés sont
 * des journées pleines. */
export function etoileSacrifiee(f: Fiche): boolean {
  // Le 39 h seulement : les autres contrats à étoile gardent leur calcul
  // (« si ce n'est ni 35 h ni 39 h, fais au mieux »).
  // Un contrat dont les journées imposées ont une journée courte (le 39 h).
  return (
    journeeEtoile(f) &&
    aJourneeCourteImposee(reglesDe(f), f.minutesHebdo) &&
    joursAbsents(f) > 0
  )
}

/**
 * Les journées du calcul (décision d'une responsable du 2026-11-04 : « en
 * 35 h, uniquement des horaires de 7 h ; en 39 h, des journées de 8 h sauf
 * une à 7 h ; les autres horaires ne seront placés que manuellement ») :
 * durées de travail (présence moins pause) que le calcul peut poser. 35 h :
 * 7 h (5 × 7 h). 39 h : 8 h, et 7 h pour la journée étoile (4 × 8 h + 7 h),
 * 8 h seulement la semaine où elle saute (`etoileSacrifiee`). Un autre
 * contrat, un forfait jours, un extra, une semaine type qui fixe un
 * horaire ni de 7 h ni de 8 h : null, aucune contrainte (« si ce n'est ni 35 h ni 39 h, fais
 * au mieux »). Un horaire posé à la main n'est jamais refusé (le calcul
 * garde les shifts posés).
 */
export function journeesDuCalcul(f: Fiche): ReadonlySet<number> | null {
  const R = reglesDe(f)
  if (f.forfaitJours || !modeleFiche(f).journeesImposees) return null
  // Une semaine type qui fixe un horaire ni de 7 h ni de 8 h décide seule
  // (relecture du 2026-11-04) : un horaire choisi à la main n'est jamais
  // refusé ni remplacé. Des horaires fixés de 7 h ou de 8 h (le veilleur, la
  // technique) restent dans la règle, plafond compris.
  const imposees = dureesImposees(R)
  if (
    f.shiftImpose?.length &&
    (!f.journeesFixees || [...f.journeesFixees].some((t) => !imposees.has(t)))
  )
    return null
  const j = journeesDuContrat(R, f.minutesHebdo)
  if (!j) return null
  // La semaine où la journée étoile saute : la plus longue seule.
  return etoileSacrifiee(f)
    ? new Set([Math.max(...j.durees)])
    : new Set(j.durees)
}

/**
 * Journée de contrat d'une personne : ce que vaut un jour d'absence décompté
 * ou un jour d'école. Contrat à journée étoile (au-delà de 35 h) : une
 * journée pleine de 8 h. Sinon le contrat divisé par 5 (35 h : 7 h). Contrat
 * sans durée horaire (forfait jours, extra) : au moins 8 h, la valeur la plus
 * prudente (plus de temps réservé dans le plafond de la semaine).
 */
export function journeeContrat(f: Fiche): number {
  const pleine = reglesDe(f).contrats.journeePleine
  if (journeeEtoile(f)) return pleine
  const parJour = Math.floor(Math.max(0, f.minutesHebdo) / JOURS_CONTRAT)
  if (f.forfaitJours || modeleFiche(f).contratIndicatif) {
    return Math.max(pleine, parJour)
  }
  return parJour
}

/**
 * R-ABSENCE-HEURES : heures à planifier dans la semaine, absences déduites.
 * Sans absence : le contrat. Sinon une journée de contrat (`journeeContrat`)
 * sur chaque jour qui reste (39 h et un congé : 4 × 8 h ; 35 h : 4 × 7 h).
 * Pour un 39 h, la journée étoile saute alors (`etoileSacrifiee`,
 * 2026-11-04), même fixée. Pour un autre contrat à journée étoile, une
 * journée étoile fixée sur un jour travaillable reste comptée courte.
 *
 * R-ECOLE-HEURES (L6222-24, décision utilisateur du 2026-10-29) : un jour
 * d'école est une journée de travail COMPLÈTE, décomptée comme un jour
 * d'absence (39 h et deux jours d'école : 3 × 8 h). Le plafond de la semaine lui réserve
 * la même journée (`versSolveur`) : dues et plafond restent d'accord. École
 * et absences qui couvrent les cinq jours du contrat : rien de dû. Seule
 * source des heures dues : générateur, vérificateur et affichage les lisent.
 */
export function heuresDues(f: Fiche): number {
  const absents = joursAbsents(f)
  if (!absents) return f.minutesHebdo
  let dues = (JOURS_CONTRAT - absents) * journeeContrat(f)
  if (
    journeeEtoile(f) &&
    !etoileSacrifiee(f) &&
    dues &&
    etoileTravaillable(f)
  ) {
    const pleine = reglesDe(f).contrats.journeePleine
    const courte = f.minutesHebdo - (JOURS_CONTRAT - 1) * pleine
    dues -= pleine - Math.max(0, Math.min(pleine, courte))
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
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): boolean {
  if (!modeleDe(regles, x.type_contrat).ferieRattrape) return false
  if (!x.date_entree) return false
  // L'ancienneté des règles (12 mois à l'hôtel), ajoutée mois par mois.
  const mois =
    Number(x.date_entree.slice(5, 7)) - 1 + regles.feries.ancienneteMois
  const annee = Number(x.date_entree.slice(0, 4)) + Math.floor(mois / 12)
  const mm = String((mois % 12) + 1).padStart(2, '0')
  // Comparaison de textes AAAA-MM-JJ : une entrée un 29 février ouvre droit
  // le 1er mars suivant.
  return ferie >= `${annee}-${mm}${x.date_entree.slice(7, 10)}`
}

/** R-FERIE-RATTRAPE : un jour férié travaillé reste DÛ, avec son alerte
 * (JOUR-FERIE), et le calcul propose son JFR chaque semaine, jusqu'à ce
 * qu'il soit rendu (décision utilisateur du 2026-11-03, Q9 et Q14 : avant,
 * il se perdait sans prévenir au bout de 4 semaines). Borne de lecture :
 * 13 semaines (un trimestre) à l'hôtel, réglée dans les règles
 * (`feries.rattrapageJours`, 2026-11-06) ; au-delà, les vues ne lisent plus
 * ce jour férié. Les vues lisent deux fois cette étendue (`premierLundiLu`).
 * Cette constante n'est plus que le défaut. */
export const FERIE_RATTRAPAGE_JOURS = REGLES_PAR_DEFAUT.feries.rattrapageJours

/** R-FERIE-RATTRAPE : un JFR vaut un jour d'absence décompté, comme un
 * congé (`heuresDues` avec un jour de plus) : ce qu'il retire aux heures
 * dues de la semaine (35 h : 4 × 7 h restent, 7 h de moins ; 39 h : 4 × 8 h
 * restent, 7 h de moins ; 39 h avec la journée étoile fixée : 31 h restent,
 * 8 h de moins ; 39 h : la journée étoile saute, 4 × 8 h, 7 h de moins quel
 * que soit le jour). Pour un autre contrat à étoile, le JFR n'est jamais
 * placé sur le jour de l'étoile fixée (`preparerGeneration`) : la baisse
 * vaut pour chacun des jours permis. */
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
    minutesContrat: f.minutesHebdo,
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
    // La semaine où la journée étoile saute, son jour fixé n'a plus rien
    // de particulier : une journée de 8 h comme les autres.
    etoileFixe: etoile && !etoileSacrifiee(f) ? (f.etoileFixe ?? vide) : vide,
    journeesCalcul: journeesDuCalcul(f),
    journeesCourtesMax: etoile ? reglesDe(f).contrats.journeesCourtesMax : null,
    journeePleine: reglesDe(f).contrats.journeePleine,
    contratIndicatif: !!f.forfaitJours || modeleFiche(f).contratIndicatif,
    placementManuel: modeleFiche(f).placementManuel,
    shiftImpose: f.shiftImpose ?? [],
    shiftsAutorises: f.shiftsAutorises ?? new Set(),
    postesOccasionnels: f.postesOccasionnels ?? new Set(),
    postesSoutien: f.postesSoutien ?? new Set(),
    ...(f.niveauxPostes ? { niveauxPostes: f.niveauxPostes } : {}),
  })
}

/** Un besoin plus long que la durée max d'un service sur son poste ne peut
 * être tenu. */
export function alerteBesoin(
  poste: Pick<Poste, 'jour_max_minutes'>,
  dureeMinutes: number,
): string | null {
  const maximum = presenceMaxPoste(poste)
  if (dureeMinutes > maximum) {
    const h = Math.floor(maximum / 60)
    const m = maximum % 60
    return `dépasse la durée maximale d'un service sur ce poste (${h} h ${String(m).padStart(2, '0')}, R-JOUR-MAX)`
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
  const modele = modeleFiche(f)
  if (modele.jourMaxMinutes !== null) {
    lignes.push([
      'R-STAGE-TEMPS',
      `${modele.nom} : au plus ${heuresLisibles(Math.min(modele.jourMaxMinutes, JOUR_MAX_LOI))} par jour, mêmes repos que les salariés`,
    ])
  }
  if (modeleFiche(f).alternance || f.joursEcole?.size) {
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

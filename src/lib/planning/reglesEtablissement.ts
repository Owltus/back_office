/*
 * Les RÈGLES DE L'ÉTABLISSEMENT (plan `planning-moteur-configurable-2026-11-05`,
 * étape 2) : tout ce que l'hôtel a choisi et qu'un autre choix rendrait
 * légitime, réuni en UN objet. Trois étages, jamais mélangés :
 *   - la LOI (repos de 11 h, 48 h, 6 jours, mineurs) : `regles.ts`, jamais
 *     réglable ;
 *   - les règles de l'établissement : ICI, valeurs par défaut = l'hôtel
 *     d'aujourd'hui, chiffre pour chiffre (B3) ;
 *   - les réglages internes (poids du calcul) : `generateur.ts`, jamais
 *     montrés.
 * `lireRegles` est la SEULE fabrique de l'objet. Depuis l'étape 4, le
 * moteur la lit : `Contexte.regles` (semaine.ts) passe dans chaque fiche
 * (`Fiche.regles`) et dans le problème (`Probleme.regles`), que le
 * générateur ET le vérificateur lisent. Les constantes de `regles.ts`
 * (`JOURS_AFFILES_MAX`…) ne sont plus que les défauts, pour l'aide.
 */

import type {
  CritereEquite,
  FerieAjoute,
  ModeleContrat,
  Referentiel,
  Reglages,
  TypeContrat,
} from '#/lib/planning/types.ts'

const H = 60

/** Force d'une règle de l'établissement. */
export type Force = 'obligatoire' | 'souhaite' | 'aucune'

/** Les journées que le calcul pose pour un contrat d'une durée donnée. */
export interface JourneesContrat {
  /** Durée hebdomadaire du contrat (minutes). */
  minutesHebdo: number
  /** Durées de travail permises (présence moins pause, minutes). */
  durees: readonly number[]
  /** Journées courtes (étoile) au plus par semaine. */
  courtesMax: number
}

/** Un type de contrat de l'établissement et ses règles
 * (`planning_modeles_contrat`). Depuis le 2026-11-06, la LISTE des contrats
 * est celle de l'établissement : le code n'est jamais comparé, seules ces
 * cases sont lues. */
export interface ModeleContratRegle {
  /** Identifiant (`type_contrat`), jamais montré. */
  code: TypeContrat
  /** Nom affiché. */
  nom: string
  /** Rang dans les listes. */
  ordre: number
  /** Durée max d'un jour de travail (minutes), null : celle du poste. */
  jourMaxMinutes: number | null
  /** Peut être déclaré mineur. */
  mineurPossible: boolean
  /** Peut être cadre au forfait jours (si son groupe le permet). */
  forfaitPossible: boolean
  /** La fiche exige une fin de contrat. */
  finObligatoire: boolean
  /** Le calcul ne pose que les journées de `contrats.journees`. */
  journeesImposees: boolean
  /** Au-delà de 35 h, une journée étoile chaque semaine. */
  journeeEtoile: boolean
  /** Jamais placé par le calcul (à appeler, posé à la main). */
  placementManuel: boolean
  /** Heures du contrat indicatives (aucune heure due). */
  contratIndicatif: boolean
  /** Un jour férié travaillé ouvre un jour férié rattrapé, après un an. */
  ferieRattrape: boolean
  /** Jours fériés pris le jour même. */
  feriesJourMeme: boolean
  /** Alternance (école, CFA). */
  alternance: boolean
}

export interface RegleEtablissement {
  contrats: {
    /** Contrats dont les journées sont imposées au calcul ; un autre
     * contrat : aucune contrainte (« fais au mieux »). */
    journees: readonly JourneesContrat[]
    /** Journée pleine : au-delà de 35 h, toute journée qui n'est pas
     * l'étoile. */
    journeePleine: number
    /** Journée courte (la journée étoile du 39 h, la journée du 35 h). */
    journeeCourte: number
    /** Version étoile d'un horaire de 8 h : au moins cette durée. */
    journeeEtoileMin: number
    /** Journées courtes au plus par semaine (contrat à journée étoile). */
    journeesCourtesMax: number
  }
  repos: {
    /** Deux jours de repos de suite dans la semaine (mineurs : la loi). */
    deuxReposDeSuite: Force
    /** Jours de travail d'affilée, semaines voisines comprises. */
    joursAffilesMax: number
    /** Jours d'affilée conseillés (au-delà, le calcul évite ; rythme
     * humain : dur). */
    joursAffilesConseilles: number
    /** Jour de travail seul entre deux repos, pour un contrat au rythme
     * humain. */
    jourIsole: 'interdit' | 'a_eviter' | 'aucune'
    /** Contrat (minutes) à partir duquel le rythme humain s'applique. */
    rythmeContratMin: number
    /** Repos conseillé entre deux services (la loi : 11 h). */
    reposConfort: number
    /** Changements de moment au plus dans la semaine. */
    changementsMomentMax: number
    /** Un retour au matin compte s'il vient moins de N jours après un soir. */
    momentArriereJours: number
    /** Nuits d'affilée au plus. */
    nuitsAffileesMax: number
    /** Jours sans travail après une série de nuits. */
    reposApresNuits: number
  }
  passations: {
    /** Temps passé ensemble par l'équipe du matin et celle du soir. */
    releveMinutes: number
    /** Aucun trou entre la fin d'une équipe et le début de la suivante,
     * passation avec le veilleur comprise : au niveau d'une place
     * nécessaire (D8, vrai depuis le 2026-11-05), sinon une préférence. */
    continuiteObligatoire: boolean
    /** Le dernier du soir attend le veilleur, le premier du matin le
     * relaie. */
    passationVeilleur: boolean
    /** Les personnes d'un même moment arrivent (et le soir partent) à
     * cette tolérance près. */
    equipeTolerance: number
    /** Première heure d'un poste à ouverture : quelqu'un dessus. */
    dureeOuverture: number
  }
  /** Limites des moments, en minutes depuis minuit (`momentPropose`). */
  moments: {
    /** Nuit : commence à cette heure ou plus tard… */
    nuitDebut: number
    /** … ou avant celle-ci. */
    nuitFin: number
    /** Soir : finit à cette heure ou plus tard… */
    soirFin: number
    /** … ou commence à celle-ci ou plus tard. */
    soirDebut: number
    /** Matin : commence avant cette heure… */
    matinDebutAvant: number
    /** … et finit au plus tard à celle-ci. */
    matinFinMax: number
    /** Horaire libre sans fin connue (`periodeLibre`) : la nuit suit
     * `nuitDebut` / `nuitFin` (une seule source depuis le 2026-11-05 ; avant,
     * 22 h ici contre 21 h pour un horaire), le matin s'arrête à cette
     * heure. */
    libreMatinAvant: number
  }
  accueil: {
    /** Personnes la nuit au calcul (plafond dur, un deuxième se pose à la
     * main). */
    personnesNuit: number
  }
  ecole: {
    /** La veille d'un jour d'école, pas de fin après cette heure. */
    veilleFin: number
    /** Le lendemain, pas de début avant celle-ci. */
    lendemainDebut: number
  }
  conges: {
    /** Jours d'absence décomptée d'affilée qui ouvrent un retour en
     * douceur. */
    congeLong: number
  }
  heures: {
    /** Semaines au-delà du contrat (sur 4) avant l'alerte. */
    semainesEnPlusAlerte: number
  }
  feries: {
    /** Ancienneté (mois) qui ouvre le rattrapage d'un jour férié travaillé. */
    ancienneteMois: number
    /** Un jour férié travaillé reste à rattraper ce nombre de jours. */
    rattrapageJours: number
    /** Jours fériés en plus des 11 calculés (2026-11-06). */
    ajoutes: readonly FerieAjoute[]
  }
  /** Partage à part égale et week-end (2026-11-06, lot 1b). */
  equite: {
    /** Jours du week-end (0 = lundi), dans l'ordre : règle du week-end
     * libre, partage des week-ends, reprise après un congé. */
    weekendJours: readonly number[]
    /** Une nuit écrite la veille du premier jour du week-end (du vendredi
     * au samedi) rend le week-end travaillé. */
    nuitVeille: boolean
    /** Ce que le planning répartit à part égale dans un groupe. */
    criteres: readonly CritereEquite[]
    /** Semaines regardées pour le partage et les heures en plus. */
    semaines: number
  }
  /** Les types de contrat de l'établissement, par identifiant. */
  modeles: Readonly<Record<TypeContrat, ModeleContratRegle>>
}

/** Un salarié « ordinaire » (CDI, CDD) : rattrapage des jours fériés après
 * un an, journées imposées, journée étoile au-delà de 35 h. Sert aussi de
 * modèle à un contrat inconnu (jamais en base : clé étrangère). */
const MODELE_ORDINAIRE: Omit<ModeleContratRegle, 'code' | 'nom' | 'ordre'> = {
  jourMaxMinutes: null,
  mineurPossible: false,
  forfaitPossible: true,
  finObligatoire: false,
  journeesImposees: true,
  journeeEtoile: true,
  placementManuel: false,
  contratIndicatif: false,
  ferieRattrape: true,
  feriesJourMeme: false,
  alternance: false,
}

/** L'hôtel d'aujourd'hui, chiffre pour chiffre (B3). */
export const REGLES_PAR_DEFAUT: RegleEtablissement = {
  contrats: {
    journees: [
      { minutesHebdo: 35 * H, durees: [7 * H], courtesMax: 0 },
      { minutesHebdo: 39 * H, durees: [8 * H, 7 * H], courtesMax: 1 },
    ],
    journeePleine: 8 * H,
    journeeCourte: 7 * H,
    journeeEtoileMin: 7 * H,
    journeesCourtesMax: 1,
  },
  repos: {
    deuxReposDeSuite: 'obligatoire',
    joursAffilesMax: 6,
    joursAffilesConseilles: 5,
    jourIsole: 'interdit',
    rythmeContratMin: 35 * H,
    reposConfort: 12 * H,
    changementsMomentMax: 1,
    momentArriereJours: 2,
    nuitsAffileesMax: 5,
    reposApresNuits: 2,
  },
  passations: {
    releveMinutes: 30,
    // D8 (décision utilisateur du 2026-11-05) : obligatoire.
    continuiteObligatoire: true,
    passationVeilleur: true,
    equipeTolerance: 30,
    dureeOuverture: 60,
  },
  moments: {
    nuitDebut: 21 * H,
    nuitFin: 5 * H,
    soirFin: 21 * H,
    soirDebut: 15 * H,
    matinDebutAvant: 9 * H,
    matinFinMax: 17 * H + 45,
    libreMatinAvant: 12 * H + 30,
  },
  accueil: { personnesNuit: 1 },
  ecole: { veilleFin: 21 * H, lendemainDebut: 8 * H },
  conges: { congeLong: 5 },
  heures: { semainesEnPlusAlerte: 3 },
  feries: { ancienneteMois: 12, rattrapageJours: 91, ajoutes: [] },
  equite: {
    weekendJours: [5, 6],
    nuitVeille: true,
    criteres: ['weekends', 'soirs', 'matins_tot'],
    semaines: 4,
  },
  // Mêmes lignes que les migrations 20261105100000 et 20261106100000.
  modeles: {
    cdi: { ...MODELE_ORDINAIRE, code: 'cdi', nom: 'CDI', ordre: 0 },
    cdd: {
      ...MODELE_ORDINAIRE,
      code: 'cdd',
      nom: 'CDD',
      ordre: 1,
      finObligatoire: true,
    },
    extra: {
      ...MODELE_ORDINAIRE,
      code: 'extra',
      nom: 'Extra',
      ordre: 2,
      forfaitPossible: false,
      journeesImposees: false,
      journeeEtoile: false,
      placementManuel: true,
      contratIndicatif: true,
      ferieRattrape: false,
    },
    stagiaire: {
      ...MODELE_ORDINAIRE,
      code: 'stagiaire',
      nom: 'Stagiaire',
      ordre: 3,
      jourMaxMinutes: 10 * H,
      mineurPossible: true,
      forfaitPossible: false,
      finObligatoire: true,
      ferieRattrape: false,
      feriesJourMeme: true,
      alternance: true,
    },
    apprenti: {
      ...MODELE_ORDINAIRE,
      code: 'apprenti',
      nom: 'Apprenti',
      ordre: 4,
      mineurPossible: true,
      forfaitPossible: false,
      finObligatoire: true,
      alternance: true,
    },
  },
}

/** Les règles de l'établissement d'un référentiel : la SEULE fabrique.
 * Ce que la base ne porte pas (données de test, réglage absent) reprend la
 * valeur par défaut. */
export function lireRegles(
  referentiel?: Partial<
    Pick<Referentiel, 'reglages' | 'modelesContrat' | 'feriesAjoutes'>
  > | null,
): RegleEtablissement {
  const r: Partial<Reglages> = referentiel?.reglages ?? {}
  const d = REGLES_PAR_DEFAUT
  return {
    contrats: {
      journees: r.journees_contrats
        ? r.journees_contrats.map((j) => ({
            minutesHebdo: j.minutes_hebdo,
            durees: [...j.durees],
            courtesMax: j.courtes_max,
          }))
        : d.contrats.journees,
      journeePleine: r.journee_pleine ?? d.contrats.journeePleine,
      journeeCourte: r.journee_courte ?? d.contrats.journeeCourte,
      journeeEtoileMin: r.journee_etoile_min ?? d.contrats.journeeEtoileMin,
      journeesCourtesMax:
        r.journees_courtes_max ?? d.contrats.journeesCourtesMax,
    },
    repos: {
      deuxReposDeSuite: r.deux_repos_de_suite ?? d.repos.deuxReposDeSuite,
      joursAffilesMax: r.jours_affiles_max ?? d.repos.joursAffilesMax,
      joursAffilesConseilles:
        r.jours_affiles_conseilles ?? d.repos.joursAffilesConseilles,
      jourIsole: r.jour_isole ?? d.repos.jourIsole,
      rythmeContratMin: r.rythme_contrat_min ?? d.repos.rythmeContratMin,
      reposConfort: r.repos_confort ?? d.repos.reposConfort,
      changementsMomentMax:
        r.changements_moment_max ?? d.repos.changementsMomentMax,
      momentArriereJours: r.moment_arriere_jours ?? d.repos.momentArriereJours,
      nuitsAffileesMax: r.nuits_affilees_max ?? d.repos.nuitsAffileesMax,
      reposApresNuits: r.repos_apres_nuits ?? d.repos.reposApresNuits,
    },
    passations: {
      releveMinutes: r.releve_minutes ?? d.passations.releveMinutes,
      continuiteObligatoire:
        r.continuite_obligatoire ?? d.passations.continuiteObligatoire,
      passationVeilleur: r.passation_veilleur ?? d.passations.passationVeilleur,
      equipeTolerance: r.equipe_tolerance ?? d.passations.equipeTolerance,
      dureeOuverture: r.duree_ouverture ?? d.passations.dureeOuverture,
    },
    moments: {
      nuitDebut: r.nuit_debut ?? d.moments.nuitDebut,
      nuitFin: r.nuit_fin ?? d.moments.nuitFin,
      soirFin: r.soir_fin ?? d.moments.soirFin,
      soirDebut: r.soir_debut ?? d.moments.soirDebut,
      matinDebutAvant: r.matin_debut_avant ?? d.moments.matinDebutAvant,
      matinFinMax: r.matin_fin_max ?? d.moments.matinFinMax,
      libreMatinAvant: r.libre_matin_avant ?? d.moments.libreMatinAvant,
    },
    accueil: {
      personnesNuit: r.personnes_nuit ?? d.accueil.personnesNuit,
    },
    ecole: {
      veilleFin: r.ecole_veille_fin ?? d.ecole.veilleFin,
      lendemainDebut: r.ecole_lendemain_debut ?? d.ecole.lendemainDebut,
    },
    conges: { congeLong: r.conge_long ?? d.conges.congeLong },
    heures: {
      semainesEnPlusAlerte:
        r.semaines_en_plus_alerte ?? d.heures.semainesEnPlusAlerte,
    },
    feries: {
      ancienneteMois: r.ferie_anciennete_mois ?? d.feries.ancienneteMois,
      rattrapageJours: r.ferie_rattrapage_jours ?? d.feries.rattrapageJours,
      ajoutes: referentiel?.feriesAjoutes ?? d.feries.ajoutes,
    },
    equite: {
      weekendJours: r.weekend_jours?.length
        ? [...new Set(r.weekend_jours.map(Number))].sort((a, b) => a - b)
        : d.equite.weekendJours,
      nuitVeille: r.weekend_nuit_veille ?? d.equite.nuitVeille,
      criteres: r.equite_criteres ?? d.equite.criteres,
      semaines: r.equite_semaines ?? d.equite.semaines,
    },
    modeles: lireModeles(referentiel?.modelesContrat),
  }
}

/** Les contrats de la base : ils SONT la liste (un contrat retiré n'y est
 * plus). Sans ligne (données de test, base pas encore migrée) : les
 * défauts. Une case absente d'une ligne (données de test) reprend le défaut
 * du contrat de même identifiant, sinon celui d'un contrat ordinaire. */
function lireModeles(
  lignes: readonly ModeleContrat[] | undefined,
): Readonly<Record<TypeContrat, ModeleContratRegle>> {
  if (!lignes?.length) return REGLES_PAR_DEFAUT.modeles
  const r: Record<TypeContrat, ModeleContratRegle> = {}
  for (const m of lignes) {
    const d = modeleDefaut(m.type_contrat)
    r[m.type_contrat] = {
      code: m.type_contrat,
      nom: m.nom ?? d.nom,
      ordre: m.ordre ?? d.ordre,
      jourMaxMinutes:
        m.jour_max_minutes === undefined
          ? d.jourMaxMinutes
          : m.jour_max_minutes,
      mineurPossible: m.mineur_possible ?? d.mineurPossible,
      forfaitPossible: m.forfait_possible ?? d.forfaitPossible,
      finObligatoire: m.fin_obligatoire ?? d.finObligatoire,
      journeesImposees: m.journees_imposees,
      journeeEtoile: m.journee_etoile,
      placementManuel: m.placement_manuel,
      contratIndicatif: m.contrat_indicatif,
      ferieRattrape: m.ferie_rattrape,
      feriesJourMeme: m.feries_jour_meme,
      alternance: m.alternance,
    }
  }
  return r
}

/** Les journées imposées au calcul pour un contrat de cette durée, ou null
 * (aucune contrainte). */
export function journeesDuContrat(
  regles: RegleEtablissement,
  minutesHebdo: number,
): JourneesContrat | null {
  return (
    regles.contrats.journees.find((j) => j.minutesHebdo === minutesHebdo) ??
    null
  )
}

/** Règle déduite : jours de travail d'un contrat = ses heures ÷ ses
 * journées (39 h = 4 × 8 h + 7 h : 5 jours). Null : contrat sans journées
 * imposées. */
export function joursDuContrat(
  regles: RegleEtablissement,
  minutesHebdo: number,
): number | null {
  const j = journeesDuContrat(regles, minutesHebdo)
  if (!j || !j.durees.length) return null
  const pleine = Math.max(...j.durees)
  const courte = Math.min(...j.durees)
  let reste = minutesHebdo
  let jours = 0
  for (let k = 0; k < j.courtesMax && reste >= courte && courte < pleine; k++) {
    reste -= courte
    jours++
  }
  return jours + Math.ceil(reste / pleine)
}

/** Règle déduite : la passation avec le veilleur n'existe que si un poste
 * tient la nuit (`tientLaNuit`, presence.ts). */
export function passationVeilleurActive(
  regles: RegleEtablissement,
  unPosteTientLaNuit: boolean,
): boolean {
  return regles.passations.passationVeilleur && unPosteTientLaNuit
}

/** Le défaut d'un identifiant : le contrat de l'hôtel de même identifiant,
 * sinon un contrat ordinaire nommé par sa clé. */
function modeleDefaut(type: TypeContrat): ModeleContratRegle {
  return Object.hasOwn(REGLES_PAR_DEFAUT.modeles, type)
    ? REGLES_PAR_DEFAUT.modeles[type]
    : { ...MODELE_ORDINAIRE, code: type, nom: type, ordre: 0 }
}

/** Les règles d'un type de contrat. */
export function modeleDe(
  regles: RegleEtablissement,
  type: TypeContrat,
): ModeleContratRegle {
  return Object.hasOwn(regles.modeles, type)
    ? regles.modeles[type]
    : modeleDefaut(type)
}

/** Les contrats de l'établissement, dans l'ordre des listes. */
export function listeContrats(
  regles: RegleEtablissement,
): ModeleContratRegle[] {
  return Object.values(regles.modeles).sort(
    (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'),
  )
}

/** Le nom affiché d'un contrat. */
export const nomContrat = (regles: RegleEtablissement, type: TypeContrat) =>
  modeleDe(regles, type).nom

/** Toutes les durées de journée que les contrats imposent (7 h et 8 h à
 * l'hôtel) : une semaine type qui fixe un horaire d'une autre durée décide
 * seule (`journeesDuCalcul`). */
export function dureesImposees(regles: RegleEtablissement): Set<number> {
  return new Set(regles.contrats.journees.flatMap((j) => j.durees))
}

/** Le contrat a une journée courte imposée (le 39 h : 4 × 8 h + 7 h) : la
 * semaine d'une absence, de l'école ou d'un JFR, sa journée étoile saute
 * (`etoileSacrifiee`, regles.ts). */
export function aJourneeCourteImposee(
  regles: RegleEtablissement,
  minutesHebdo: number,
): boolean {
  const j = journeesDuContrat(regles, minutesHebdo)
  return !!j && j.courtesMax > 0 && j.durees.length > 1
}

// ------------------------------------------------- week-end et partage

/** Le jour `j` (0 = lundi ; au-delà de 6, une semaine suivante) est-il un
 * jour du week-end de l'établissement ? */
export function estJourWeekend(regles: RegleEtablissement, j: number): boolean {
  return regles.equite.weekendJours.includes(((j % 7) + 7) % 7)
}

/** Le jour dont la NUIT rend le week-end travaillé (la veille du premier
 * jour du week-end, le vendredi à l'hôtel), ou null : réglage coupé, ou
 * week-end qui commence le lundi (sa veille est dans la semaine d'avant). */
export function jourVeilleWeekend(regles: RegleEtablissement): number | null {
  if (!regles.equite.nuitVeille) return null
  const premier = regles.equite.weekendJours[0]
  return premier !== undefined && premier > 0 ? premier - 1 : null
}

/** Le planning répartit-il ce critère à part égale ? */
export function repartit(
  regles: RegleEtablissement,
  critere: (typeof regles.equite.criteres)[number],
): boolean {
  return regles.equite.criteres.includes(critere)
}

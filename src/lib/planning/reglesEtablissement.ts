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
 * `lireRegles` est la SEULE fabrique de l'objet. Les constantes de
 * `regles.ts`, `moment.ts` et `presence.ts` sont tirées de
 * `REGLES_PAR_DEFAUT` : leurs appelants ne changent pas tant que l'étape 4
 * ne les a pas branchés sur `lireRegles`.
 */

import type { Referentiel } from '#/lib/planning/types.ts'

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
    /** Aucun trou entre la fin d'une équipe et le début de la suivante :
     * obligation (D8) ou forte préférence (aujourd'hui). */
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
    continuiteObligatoire: false,
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
}

/** Les règles de l'établissement d'un référentiel : la SEULE fabrique.
 * Ce que la base ne porte pas (données de test, réglage absent) reprend la
 * valeur par défaut. */
export function lireRegles(
  referentiel?: Pick<Referentiel, 'reglages'> | null,
): RegleEtablissement {
  const r = referentiel?.reglages
  return {
    ...REGLES_PAR_DEFAUT,
    passations: {
      ...REGLES_PAR_DEFAUT.passations,
      releveMinutes:
        r?.releve_minutes ?? REGLES_PAR_DEFAUT.passations.releveMinutes,
    },
  }
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

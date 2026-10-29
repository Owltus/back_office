/*
 * Pourquoi une place reste vide, en clair, et où agir (étape 8 du plan
 * `planning-coherence-2026-10-28`). `raisonsBlocage` (`verificateur.ts`)
 * rend, pour chaque personne qui tient le poste, les règles qu'elle
 * enfreindrait en prenant la place. Ici, chaque règle devient une phrase
 * courte et :
 * - soit un LIEN vers le réglage qui la débloque (fiche de la personne,
 *   écran Équipe, Besoins), avec `?ouvrir=` (`coherence.ts`) ;
 * - soit une MENTION quand il n'y a rien à régler : limite légale, au-delà
 *   de son contrat, absence posée, déjà placé, à appeler.
 *
 * Pur. La logique de `raisonsBlocage` n'est pas touchée : on ne lit que
 * l'identifiant de la règle (et le message, pour les deux règles qui en
 * portent plusieurs sens).
 */

import { cibleFiche } from '#/lib/planning/coherence.ts'
import type { LienReglage, PartieFiche } from '#/lib/planning/coherence.ts'

export type Mention =
  | 'limite légale'
  | 'au-delà de son contrat'
  | 'absence posée'
  | 'déjà placé'
  | 'à appeler'
  | 'à placer'

export type Issue =
  | { genre: 'lien'; lien: LienReglage; action: string }
  | { genre: 'mention'; mention: Mention }

export interface RaisonClaire {
  /** Stable : sert à regrouper la même raison sur plusieurs jours. */
  cle: string
  phrase: string
  issue: Issue
}

/** Toutes les règles que `raisonsBlocage` peut rendre (`violationsSalarie`
 * plus `EXTRA`). Le test exhaustif parcourt cette liste : une règle ajoutée
 * au vérificateur doit l'être ici. */
export const REGLES_BLOCAGE = [
  'POSTE',
  'HORS-CONTRAT',
  'ABSENCE',
  'REPOS-FIXE',
  'HORAIRE-PERSO',
  'R-JOUR-MAX',
  'R-NUIT-MINEUR',
  'R-REPOS-QUOTIDIEN',
  'CHEVAUCHEMENT',
  'UN-SERVICE-PAR-JOUR',
  'R-SIX-JOURS-MAX',
  'R-REPOS-HEBDO-HCR',
  'SIXIEME-JOUR',
  'R-SEMAINE-MAX',
  'R-JOURNEE-ETOILE',
  'R-REPOS-HEBDO-35H',
  'R-REPOS-HEBDO-MINEUR',
  'EXTRA',
] as const

/** Sans aucune règle enfreinte : la personne peut prendre la place. On ne
 * dit rien de ses heures (rien ne les a comptées ici) : une place nécessaire
 * vide passe avant les heures en plus (`coutPlaceVide`), donc le planning
 * automatique l'aurait prise ; c'est une place laissée vide à la main ou
 * pas encore générée. */
export const RAISON_LIBRE = 'LIBRE'

const fiche = (
  salarieId: number,
  action: string,
  partie?: PartieFiche,
): Issue => ({
  genre: 'lien',
  lien: { page: '/planning/equipe', cible: cibleFiche(salarieId, partie) },
  action,
})
const mention = (m: Mention): Issue => ({ genre: 'mention', mention: m })

/** « maximum 48 h » lu dans le message du vérificateur, s'il y est. */
function maximum(message: string): string | null {
  return message.match(/maximum (\d+(?: h(?: \d\d)?)?)/)?.[1] ?? null
}

/**
 * Une règle de `raisonsBlocage` en clair. `regle` inconnue : le message du
 * vérificateur tel quel, avec la fiche de la personne (jamais rien de muet).
 */
export function raisonClaire(
  regle: string,
  message: string,
  salarieId: number,
): RaisonClaire {
  const r = (phrase: string, issue: Issue, cle = regle): RaisonClaire => ({
    cle,
    phrase,
    issue,
  })
  const max = maximum(message)
  switch (regle) {
    case RAISON_LIBRE:
      return r('Libre ce jour-là', mention('à placer'))
    case 'POSTE':
      return r(
        'Ne tient pas ce poste',
        fiche(salarieId, 'Postes de la fiche', 'postes'),
      )
    case 'HORS-CONTRAT':
      return r(
        'Hors des dates de son contrat',
        fiche(salarieId, 'Dates du contrat', 'identite'),
      )
    case 'ABSENCE':
      return r("Absent ou à l'école ce jour-là", mention('absence posée'))
    case 'REPOS-FIXE':
      return r(
        'En repos fixe ce jour-là',
        fiche(salarieId, 'Semaine type', 'semaine'),
      )
    case 'HORAIRE-PERSO':
      return message.includes('autre horaire')
        ? r(
            'Un autre code est fixé ce jour-là',
            fiche(salarieId, 'Semaine type', 'semaine'),
            'HORAIRE-PERSO:impose',
          )
        : r(
            "Ce code n'est pas dans ses codes",
            fiche(salarieId, 'Codes de la fiche', 'horaires'),
            'HORAIRE-PERSO:fiche',
          )
    case 'R-JOUR-MAX':
      return r(
        max ? `Journée trop longue (maximum ${max})` : 'Journée trop longue',
        mention('limite légale'),
      )
    case 'R-NUIT-MINEUR':
      return r('Mineur : pas de travail de nuit', mention('limite légale'))
    case 'R-REPOS-QUOTIDIEN':
      return r(
        'Pas assez de repos avec un autre shift',
        mention('limite légale'),
      )
    case 'CHEVAUCHEMENT':
      return r('Déjà en service à cette heure', mention('déjà placé'))
    case 'UN-SERVICE-PAR-JOUR':
      return r('A déjà un shift ce jour-là', mention('déjà placé'))
    case 'R-SIX-JOURS-MAX':
    case 'R-REPOS-HEBDO-HCR':
      return r(
        message.includes('deux semaines')
          ? 'Trop de jours sur deux semaines'
          : max
            ? `Trop de jours dans la semaine (maximum ${max} jours)`
            : 'Trop de jours dans la semaine',
        mention('limite légale'),
        message.includes('deux semaines') ? `${regle}:deux` : regle,
      )
    case 'SIXIEME-JOUR':
      return r('Ce serait un 6e jour', mention('au-delà de son contrat'))
    case 'R-SEMAINE-MAX':
      return r(
        // L'école compte dans la semaine (R-ECOLE-HEURES) : le dire.
        (max
          ? `${max} atteintes dans la semaine`
          : 'Heures de la semaine atteintes') +
          (message.includes('école comprise') ? ', école comprise' : ''),
        mention('limite légale'),
      )
    case 'R-JOURNEE-ETOILE':
      return message.includes('fixée')
        ? r(
            'Sa journée courte est fixée ce jour-là',
            fiche(salarieId, 'Semaine type', 'semaine'),
            'R-JOURNEE-ETOILE:fixee',
          )
        : r(
            'Une seule journée courte au contrat',
            mention('au-delà de son contrat'),
            'R-JOURNEE-ETOILE:nombre',
          )
    case 'R-REPOS-HEBDO-35H':
      // Deux sens : la semaine elle-même, ou la reprise qui couperait le
      // repos de 35 h de la semaine d'avant.
      return message.includes('semaine précédente')
        ? r(
            "Reprise trop tôt après le repos de 35 h de la semaine d'avant",
            mention('limite légale'),
            'R-REPOS-HEBDO-35H:avant',
          )
        : r('Pas de repos de 35 h dans la semaine', mention('limite légale'))
    case 'R-REPOS-HEBDO-MINEUR':
      return r(
        'Mineur : deux jours de repos de suite',
        mention('limite légale'),
      )
    case 'EXTRA':
      return r('Extra libre', mention('à appeler'))
    default:
      return r(
        message.charAt(0).toUpperCase() + message.slice(1),
        fiche(salarieId, 'Fiche'),
        `${regle}|${message}`,
      )
  }
}

/** Les raisons d'une personne, sans doublon (même clé). Aucune règle :
 * `RAISON_LIBRE`. */
export function raisonsClaires(
  salarieId: number,
  regles: readonly string[],
  messages: readonly string[],
): RaisonClaire[] {
  if (!messages.length) return [raisonClaire(RAISON_LIBRE, '', salarieId)]
  const vues = new Map<string, RaisonClaire>()
  messages.forEach((m, i) => {
    const c = raisonClaire(regles[i] ?? '', m, salarieId)
    if (!vues.has(c.cle)) vues.set(c.cle, c)
  })
  return [...vues.values()]
}

/** La personne peut prendre la place : rien ne l'en empêche, sinon ses
 * heures (6e jour, journée courte) ou un appel (extra). */
export const estPossible = (raisons: readonly RaisonClaire[]) =>
  raisons.every(
    (r) =>
      r.issue.genre === 'mention' &&
      (r.issue.mention === 'au-delà de son contrat' ||
        r.issue.mention === 'à appeler' ||
        r.issue.mention === 'à placer'),
  )

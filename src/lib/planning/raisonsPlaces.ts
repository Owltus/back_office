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

/** Raisons DÉCISIVES, par ordre : la première famille présente suffit à
 * dire pourquoi, les autres raisons ne sont que la conséquence d'un shift
 * imaginé là quand même (passage navigateur du 2026-10-29 : « Ce code n'est
 * pas dans ses codes » suivi de cinq limites du même shift). D'abord ce qui
 * se règle dans la fiche ou ferme le jour, puis le fait d'être déjà placé. */
const DECISIVES: ReadonlyArray<ReadonlySet<string>> = [
  new Set([
    'POSTE',
    'HORS-CONTRAT',
    'ABSENCE',
    'REPOS-FIXE',
    'HORAIRE-PERSO:impose',
    'HORAIRE-PERSO:fiche',
  ]),
  new Set(['UN-SERVICE-PAR-JOUR', 'CHEVAUCHEMENT']),
]

/** Les raisons d'une personne, sans doublon (même clé), réduites aux
 * raisons décisives quand il y en a (`DECISIVES`). « A déjà un shift ce
 * jour-là » couvre « Déjà en service à cette heure » : une seule des deux.
 * Aucune règle : `RAISON_LIBRE`. */
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
  if (vues.has('UN-SERVICE-PAR-JOUR')) vues.delete('CHEVAUCHEMENT')
  const toutes = [...vues.values()]
  for (const famille of DECISIVES) {
    const decisives = toutes.filter((r) => famille.has(r.cle))
    if (decisives.length) return decisives
  }
  return toutes
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

// ------------------------------------------------- place que rien ne remplit

/** La règle qui bloque TOUT LE MONDE sur une place (`raison_commune` de
 * `analyser`, plan `planning-cycles-2026-10-30` étape 5), dite pour la place
 * entière : « Je ne peux pas remplir ce M3. » puis cette phrase. Seul
 * l'identifiant est connu (pas de message) : la phrase reste générale.
 * Une phrase par règle de `REGLES_BLOCAGE` (test exhaustif). */
const PHRASES_COMMUNES: Record<(typeof REGLES_BLOCAGE)[number], string> = {
  POSTE: 'Personne ne tient ce poste.',
  'HORS-CONTRAT': "Personne n'est sous contrat ce jour-là.",
  ABSENCE: "Tout le monde est absent ou à l'école ce jour-là.",
  'REPOS-FIXE': 'Tout le monde est en repos fixe ce jour-là.',
  'HORAIRE-PERSO': "Personne n'a ce code ce jour-là.",
  'R-JOUR-MAX': 'La journée serait trop longue pour tout le monde.',
  'R-NUIT-MINEUR': 'Tout le monde est mineur : pas de travail de nuit.',
  'R-REPOS-QUOTIDIEN': "Personne n'a assez de repos avec ses autres shifts.",
  CHEVAUCHEMENT: 'Tout le monde est déjà en service à cette heure.',
  'UN-SERVICE-PAR-JOUR': 'Tout le monde a déjà un shift ce jour-là.',
  'R-SIX-JOURS-MAX': 'Tout le monde a déjà trop de jours de travail.',
  'R-REPOS-HEBDO-HCR': 'Tout le monde a déjà trop de jours de travail.',
  'SIXIEME-JOUR': 'Ce serait un 6e jour pour tout le monde.',
  'R-SEMAINE-MAX': 'Tout le monde est au maximum de ses heures.',
  'R-JOURNEE-ETOILE': 'Tout le monde a déjà sa journée courte.',
  'R-REPOS-HEBDO-35H': 'Personne ne garderait son repos de 35 h.',
  'R-REPOS-HEBDO-MINEUR':
    'Tout le monde est mineur : deux jours de repos de suite.',
  EXTRA: 'Seuls des extras sont libres.',
}

/** Phrase de la règle commune, ou null si la règle est inconnue ou si elle
 * ne BLOQUE pas vraiment (6e jour, journée courte au contrat, extra à
 * appeler : quelqu'un peut prendre la place, ses heures ou un appel
 * mis à part, donc « Je ne peux pas » serait faux). */
export function phraseCommune(regle: string | null | undefined): string | null {
  if (!regle || !Object.hasOwn(PHRASES_COMMUNES, regle)) return null
  if (estPossible([raisonClaire(regle, '', 0)])) return null
  return PHRASES_COMMUNES[regle as keyof typeof PHRASES_COMMUNES]
}

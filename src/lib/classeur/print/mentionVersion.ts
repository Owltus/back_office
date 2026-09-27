/*
 * Mention de version imprimée sous le pied de page d'un document —
 * amélioration n° 22 de `plan/classeur-editeur-ameliorations`, forme
 * choisie par l'utilisateur le 2026-09-27 : « sur le papier, de manière
 * ultra discrète, sans briser la mise en page, sous le footer, centrée,
 * opacité 0,2 ». La date est celle du dernier enregistrement du document
 * (`updated_at`), à l'heure de l'hôtel quel que soit le poste.
 */

const FUSEAU = 'Europe/Paris'

export function mentionVersion(updatedAt: string): string | undefined {
  const d = new Date(updatedAt)
  if (Number.isNaN(d.getTime())) return undefined
  const date = d.toLocaleDateString('fr-FR', {
    timeZone: FUSEAU,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const heure = d.toLocaleTimeString('fr-FR', {
    timeZone: FUSEAU,
    hour: '2-digit',
    minute: '2-digit',
  })
  return `Version du ${date} à ${heure}`
}

/** Pendant l'édition : la version affichée n'est pas encore enregistrée. */
export const MENTION_EN_COURS = 'Version en cours de modification'

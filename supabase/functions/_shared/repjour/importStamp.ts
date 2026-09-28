// Mention « Rapport importé le … » du pied du PDF automatique.
//
// POURQUOI un module à part : l'Edge Function tourne en UTC. `format()` de
// date-fns formate dans le fuseau du PROCESSUS, si bien que le PDF envoyé la
// nuit affichait « à 00h32 » pour un import fait à 02h32 heure de Paris (et, près
// de minuit, la veille). Le PDF du navigateur, lui, est formaté à l'heure locale
// de l'hôtel. On fixe donc le fuseau explicitement : Europe/Paris, quel que soit
// l'hôte — même rendu que le bouton « Imprimer » (« d MMMM yyyy 'à' HH'h'mm »).

import { MONTHS } from './dates.ts'

const PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** « 28 septembre 2026 à 02h32 », à l'heure de Paris. */
export function formatImportStamp(importedAt: string | Date): string {
  const parts = PARIS.formatToParts(new Date(importedAt))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  const hour = get('hour').padStart(2, '0')
  const minute = get('minute').padStart(2, '0')
  return `${Number(get('day'))} ${MONTHS[Number(get('month'))]} ${get('year')} à ${hour}h${minute}`
}

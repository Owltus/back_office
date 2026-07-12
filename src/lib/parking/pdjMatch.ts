/*
 * Rapprochement PARKING ↔ PDJ : retrouver le numéro de chambre d'un client
 * parking à partir des lignes PDJ (petits-déjeuners) du même jour, par
 * correspondance de NOM.
 *
 * Deux garde-fous, car il s'agit de données personnelles imprimées :
 *  - RGPD : le PDJ ne conserve le nom (`guest_name`) que pour le JOUR COURANT ;
 *    toute date passée est purgée (guest_name = null). Le rapprochement n'aboutit
 *    donc, en l'état, que pour aujourd'hui. Les lignes sans nom sont ignorées.
 *  - Prudence : on ne renvoie une chambre que si UN SEUL client PDJ correspond
 *    sans ambiguïté. Zéro correspondance, ou plusieurs → on ne remplit rien.
 */

/** Ligne PDJ minimale nécessaire au rapprochement (chambre + nom éventuel). */
export interface PdjNameRow {
  room: number
  guest_name: string | null
}

/** Normalise un nom pour comparaison : sans accents, majuscules, ponctuation
 * ramenée à des espaces, espaces compactés. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Numéro de chambre pour un client parking, ou `null` si aucune correspondance
 * fiable. Le nom PDJ est au format « NOM, Prénom ».
 *
 * On considère qu'il y a correspondance si :
 *  - le client parking égale exactement le NOM de famille PDJ, ou le nom complet ;
 *  - ou le NOM de famille PDJ (≥ 3 lettres) figure comme mot entier du client ;
 *  - ou tous les mots du nom PDJ (≥ 2 mots) figurent dans le client.
 * Puis on exige l'UNICITÉ de la chambre trouvée.
 */
export function matchRoom(client: string, pdjRows: PdjNameRow[]): number | null {
  const c = norm(client)
  if (!c) return null
  const cTokens = new Set(c.split(' '))
  const rooms = new Set<number>()

  for (const r of pdjRows) {
    if (!r.guest_name) continue // nom purgé (RGPD) ou absent
    const last = norm(r.guest_name.split(',')[0] ?? '')
    if (!last) continue
    const full = norm(r.guest_name.replace(/,/g, ' '))
    const fullTokens = full.split(' ').filter(Boolean)

    const matched =
      c === last ||
      c === full ||
      (last.length >= 3 && cTokens.has(last)) ||
      (fullTokens.length >= 2 && fullTokens.every((t) => cTokens.has(t)))

    if (matched) rooms.add(r.room)
  }

  return rooms.size === 1 ? [...rooms][0] : null
}

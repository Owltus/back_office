/*
 * Compteurs du tableau des classeurs (`/classeur`, 2026-10-19) : nombre de
 * chapitres, de documents et date de la dernière modification, par classeur.
 *
 * Lus en UNE requête sur `classeur_chapters` (une ligne par chapitre non
 * supprimé, avec le compte de ses documents et le plus récent d'entre eux,
 * voir `fetchStatsClasseurs`), puis agrégés ici. Rendu en tableau d'objets
 * nus : la donnée survit au JSON du cache persisté (`survitAuJson`).
 */

/** Une ligne lue : un chapitre non supprimé. */
export interface LigneStatsChapitre {
  classeur_id: number
  updated_at: string
  documents: Array<{ count: number }> | null
  dernier: Array<{ updated_at: string }> | null
}

export interface StatsClasseur {
  classeurId: number
  chapitres: number
  documents: number
  /** Plus récente modification d'un chapitre ou d'un document (ISO). */
  misAJour: string | null
}

/** Plus récente de deux dates ISO (`null` ignoré, illisible ignoré). */
function plusRecente(a: string | null, b: string | null): string | null {
  const ta = a == null ? NaN : Date.parse(a)
  const tb = b == null ? NaN : Date.parse(b)
  if (Number.isNaN(ta)) return Number.isNaN(tb) ? null : b
  if (Number.isNaN(tb)) return a
  return tb > ta ? b : a
}

/** Agrège les lignes par classeur, dans l'ordre de première apparition. */
export function agregerStats(lignes: LigneStatsChapitre[]): StatsClasseur[] {
  const parClasseur = new Map<number, StatsClasseur>()
  for (const l of lignes) {
    const s = parClasseur.get(l.classeur_id) ?? {
      classeurId: l.classeur_id,
      chapitres: 0,
      documents: 0,
      misAJour: null,
    }
    s.chapitres += 1
    s.documents += l.documents?.[0]?.count ?? 0
    s.misAJour = plusRecente(s.misAJour, l.updated_at)
    s.misAJour = plusRecente(s.misAJour, l.dernier?.[0]?.updated_at ?? null)
    parClasseur.set(l.classeur_id, s)
  }
  return [...parClasseur.values()]
}

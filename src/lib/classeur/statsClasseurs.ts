/*
 * Date de la dernière modification de chaque classeur, pour le tableau de
 * `/classeur` (2026-10-19 ; les compteurs de chapitres et de documents ont
 * été retirés le même jour, décision utilisateur).
 *
 * Lue en UNE requête sur `classeur_chapters` (une ligne par chapitre non
 * supprimé, avec son document le plus récent, voir `fetchStatsClasseurs`),
 * puis agrégée ici. Rendu en tableau d'objets
 * nus : la donnée survit au JSON du cache persisté (`survitAuJson`).
 */

/** Une ligne lue : un chapitre non supprimé. */
export interface LigneStatsChapitre {
  classeur_id: number
  updated_at: string
  dernier: Array<{ updated_at: string }> | null
}

export interface StatsClasseur {
  classeurId: number
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
      misAJour: null,
    }
    s.misAJour = plusRecente(s.misAJour, l.updated_at)
    s.misAJour = plusRecente(s.misAJour, l.dernier?.[0]?.updated_at ?? null)
    parClasseur.set(l.classeur_id, s)
  }
  return [...parClasseur.values()]
}

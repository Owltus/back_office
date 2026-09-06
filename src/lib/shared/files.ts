/**
 * Bornes d'entrée des fichiers importés (audit red team 2026-09-06).
 *
 * Aucun handler ne contrôlait `file.size` : un CSV de plusieurs centaines de Mo
 * ou un PDF scanné de 500 pages gelait l'onglet (OOM). Les bornes sont larges
 * pour l'usage réel (exports PMS de quelques centaines de Ko, factures de
 * quelques pages) et bloquent seulement l'aberrant.
 */
export const MAX_CSV_BYTES = 10 * 1024 * 1024
export const MAX_JSON_BYTES = 10 * 1024 * 1024

/** Message d'erreur si le fichier dépasse la borne, `null` sinon. */
export function fileTooLarge(file: File, maxBytes: number): string | null {
  if (file.size <= maxBytes) return null
  const mo = Math.round(maxBytes / (1024 * 1024))
  return `Fichier trop volumineux (${mo} Mo maximum) : ${file.name}`
}

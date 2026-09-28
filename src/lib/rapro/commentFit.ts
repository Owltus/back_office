/*
 * Commentaire du PDF : le texte est coupé à la hauteur de son cadre pour ne
 * jamais déborder sur les signatures. Pur (la mesure de largeur est injectée),
 * donc testable sans jsPDF.
 *
 * Une copie identique vit dans lib/caisse et lib/rapro : chaque feature garde
 * son PDF autonome (aucun import croisé entre features).
 */

/** Nombre de lignes qui tiennent dans un cadre de hauteur `boxH` (mm), la
 * première ligne de base étant à `firstBaseline` du haut, avec `bottomPad` de
 * marge sous la dernière. Toujours ≥ 0. */
export function maxCommentLines(
  boxH: number,
  firstBaseline: number,
  lineH: number,
  bottomPad: number,
): number {
  const room = boxH - firstBaseline - bottomPad
  if (room < 0 || lineH <= 0) return 0
  return Math.floor(room / lineH) + 1
}

/** Garde au plus `maxLines` lignes ; si le texte est coupé, la dernière ligne
 * se termine par « … » (raccourcie jusqu'à ce que `fits` l'accepte). */
export function fitCommentLines(
  lines: string[],
  maxLines: number,
  fits: (line: string) => boolean,
): string[] {
  if (lines.length <= maxLines) return lines
  if (maxLines <= 0) return []
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1].trimEnd()
  while (last && !fits(`${last}…`)) last = last.slice(0, -1).trimEnd()
  kept[maxLines - 1] = `${last}…`
  return kept
}

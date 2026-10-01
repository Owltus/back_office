/*
 * Mise en forme des blocs `:::photos` et `:::etape` (2026-10-01), APRÈS
 * `rehypeFigures` : tout se décide ici, en HTML pur, parce que les pages A4
 * sont des COPIES HTML du conteneur de mesure (aucun composant React ne
 * survit à la copie).
 *
 * - `:::photos` : `data-colonnes` selon le nombre de photos (1, 2, 3, 2 × 2,
 *   puis 3 colonnes) ; tout ce qui n'est pas une photo occupe une rangée
 *   entière (`photos-hors`) — jamais perdu.
 * - `:::etape` : le texte à gauche (`etape-texte`), les photos dans une
 *   colonne à droite (`etape-photos`). Sans photo, le bloc reste du texte.
 */

import {
  estElement,
  significatifs,
} from '#/lib/classeur/print/rehypeFigures.ts'
import type { NoeudHast } from '#/lib/classeur/print/rehypeFigures.ts'

/** Colonnes d'une planche de `n` photos. */
export function colonnesPlanche(n: number): number {
  if (n <= 1) return 1
  if (n === 2 || n === 4) return 2
  return 3
}

function bloc(n: NoeudHast): string | null {
  if (!estElement(n, 'div')) return null
  const b = n.properties?.dataBloc
  return typeof b === 'string' ? b : null
}

function classe(n: NoeudHast, nom: string): void {
  const avant = n.properties?.className
  const liste = Array.isArray(avant) ? avant.map(String) : []
  n.properties = { ...n.properties, className: [...liste, nom] }
}

function planche(n: NoeudHast): void {
  const enfants = significatifs(n)
  const photos = enfants.filter((c) => estElement(c, 'figure'))
  for (const c of enfants) {
    if (c.type === 'element' && !estElement(c, 'figure'))
      classe(c, 'photos-hors')
  }
  n.children = enfants
  n.properties = {
    ...n.properties,
    dataColonnes: String(colonnesPlanche(photos.length)),
  }
}

/** Taille de la première image d'une figure (titre Markdown), `auto` sinon. */
function tailleFigure(f: NoeudHast): string {
  const img = (f.children ?? []).find((c) => estElement(c, 'img'))
  const titre = img?.properties?.title
  const m = /(?:^|\s)(petite|moyenne|grande|pleine)(?:\s|$)/.exec(
    typeof titre === 'string' ? titre : '',
  )
  return m ? m[1] : 'moyenne'
}

function etape(n: NoeudHast): void {
  const enfants = significatifs(n)
  const photos = enfants.filter((c) => estElement(c, 'figure'))
  if (photos.length === 0) return
  const texte = enfants.filter((c) => !estElement(c, 'figure'))
  // Largeur de la colonne photo : taille de la première image (petite 25 %,
  // moyenne 33 %, grande et pleine 45 %, `classeur.css`).
  n.properties = { ...n.properties, dataLargeur: tailleFigure(photos[0]) }
  n.children = [
    {
      type: 'element',
      tagName: 'div',
      properties: { className: ['etape-texte'] },
      children: texte,
    },
    {
      type: 'element',
      tagName: 'div',
      properties: { className: ['etape-photos'] },
      children: photos,
    },
  ]
  n.properties = { ...n.properties, dataPhotos: String(photos.length) }
}

function parcourir(n: NoeudHast): void {
  n.children?.forEach(parcourir)
  const b = bloc(n)
  if (b === 'photos') planche(n)
  else if (b === 'etape') etape(n)
}

/** Plugin rehype, APRÈS `rehypeFigures`. */
export function rehypeBlocs() {
  return (arbre: NoeudHast) => {
    parcourir(arbre)
  }
}

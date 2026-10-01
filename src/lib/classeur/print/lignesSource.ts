/*
 * Lien entre l'aperçu A4 et le texte de l'éditeur — amélioration n° 16 de
 * `plan/classeur-editeur-ameliorations` (« très important ») : cliquer
 * dans l'aperçu amène le curseur sur la ligne du texte, et déplacer le
 * curseur amène l'aperçu sur le bloc correspondant.
 *
 * 1. `rehypeLignesSource` pose `data-ligne` (ligne de départ dans le texte
 *    RENDU) sur chaque élément HTML. Les pages A4 sont des copies HTML du
 *    conteneur de mesure : l'attribut les suit, et n'a aucun effet sur la
 *    mise en page ni sur l'impression.
 * 2. Le texte rendu n'est pas tout à fait le texte tapé : chaque ligne
 *    `===` (saut de page) y devient trois lignes (`preprocessPageBreaks`) ;
 *    un ancien `+++` devient une ligne vide (une ligne : rien à compenser).
 *    `ligneRendueVersSource` / `ligneSourceVersRendue` compensent.
 */

interface NoeudHast {
  type: string
  properties?: Record<string, unknown>
  position?: { start: { line: number } }
  children?: NoeudHast[]
}

function poser(noeud: NoeudHast): void {
  if (noeud.type === 'element' && noeud.position) {
    noeud.properties = {
      ...noeud.properties,
      dataLigne: noeud.position.start.line,
    }
  }
  noeud.children?.forEach(poser)
}

/** Plugin rehype : `data-ligne` sur chaque élément positionné. */
export function rehypeLignesSource() {
  return (arbre: NoeudHast) => {
    poser(arbre)
  }
}

const RE_SAUT = /^===\s*$/

/** Ligne du texte TAPÉ (1 = première) pour une ligne du texte rendu. */
export function ligneRendueVersSource(
  source: string,
  ligneRendue: number,
): number {
  const lignes = source.split('\n')
  let rendue = 0
  for (let i = 0; i < lignes.length; i++) {
    // Un saut occupe 3 lignes rendues (vide, marqueur, vide).
    const hauteur = RE_SAUT.test(lignes[i]) ? 3 : 1
    if (ligneRendue <= rendue + hauteur) return i + 1
    rendue += hauteur
  }
  return lignes.length
}

/** Ligne du texte rendu correspondant à une ligne du texte TAPÉ. */
export function ligneSourceVersRendue(
  source: string,
  ligneSource: number,
): number {
  const lignes = source.split('\n')
  let rendue = 0
  for (let i = 0; i < Math.min(ligneSource - 1, lignes.length); i++) {
    rendue += RE_SAUT.test(lignes[i]) ? 3 : 1
  }
  // Hors du texte : `undefined` à l'exécution malgré le type.
  const courante = lignes[ligneSource - 1] as string | undefined
  // Sur une ligne `===`, viser le marqueur (ligne du milieu).
  return rendue + (courante !== undefined && RE_SAUT.test(courante) ? 2 : 1)
}

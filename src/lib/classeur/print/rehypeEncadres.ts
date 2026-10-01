/*
 * Encadrés typés (2026-10-01) : un encadré dont la première ligne est
 * `[!WARNING]`, `[!IMPORTANT]`, `[!TIP]` ou `[!NOTE]` (syntaxe des alertes
 * GitHub, `markdownEdition.encadrer`) reçoit `data-encadre` et son mot en
 * tête (« Attention », « Important »…) ; le repère disparaît. Mise en forme
 * noir et blanc dans `classeur.css`. Un encadré ordinaire ne change pas.
 */

import {
  LIBELLE_ENCADRE,
  typeDepuisMot,
} from '#/lib/classeur/markdownEdition.ts'
import {
  estElement,
  significatifs,
} from '#/lib/classeur/print/rehypeFigures.ts'
import type { NoeudHast } from '#/lib/classeur/print/rehypeFigures.ts'

const REPERE = /^\s*\[!([A-Za-z]+)\][ \t]*(?:\n|$)/

function typer(bq: NoeudHast): void {
  const premier = significatifs(bq)[0] as NoeudHast | undefined
  if (!premier || !estElement(premier, 'p')) return
  const texte = premier.children?.[0]
  if (texte?.type !== 'text') return
  const m = REPERE.exec(texte.value ?? '')
  if (!m) return
  const type = typeDepuisMot(m[1])
  if (type === null) return
  texte.value = (texte.value ?? '').slice(m[0].length)
  // Le paragraphe ne portait que le repère : il disparaît.
  if (
    significatifs(premier).length === 0 ||
    (premier.children?.length === 1 && texte.value.trim() === '')
  )
    bq.children = (bq.children ?? []).filter((c) => c !== premier)
  bq.properties = { ...bq.properties, dataEncadre: type }
  bq.children = [
    {
      type: 'element',
      tagName: 'p',
      properties: { className: ['encadre-titre'] },
      children: [{ type: 'text', value: LIBELLE_ENCADRE[type] }],
    },
    ...(bq.children ?? []),
  ]
}

function parcourir(n: NoeudHast): void {
  n.children?.forEach(parcourir)
  if (estElement(n, 'blockquote')) typer(n)
}

/** Plugin rehype. */
export function rehypeEncadres() {
  return (arbre: NoeudHast) => {
    parcourir(arbre)
  }
}

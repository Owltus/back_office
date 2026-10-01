/*
 * Blocs de mise en page du Classeur (2026-10-01, plan
 * `plan/classeur-images-blocs`) : directives conteneur `:::photos` et
 * `:::etape`, syntaxe des « generic directives » (proposition CommonMark,
 * plugin officiel `remark-directive`, celle des encadrés Docusaurus).
 *
 * `remark-directive` lit AUSSI `:mot` comme directive de TEXTE, chiffres
 * compris : « RDV à 10:30, code:4400 » perdait `:30` et `:4400` en
 * silence (vérifié au banc). Ce plugin est donc une LISTE BLANCHE : seuls
 * les conteneurs `photos` et `etape` deviennent des blocs ; toute autre
 * directive (texte, feuille, conteneur inconnu) est remise en texte À
 * L'IDENTIQUE, d'après la source (offsets), jamais reconstruite depuis
 * l'arbre.
 */

export const BLOCS = ['photos', 'etape'] as const
export type NomBloc = (typeof BLOCS)[number]

interface Point {
  line: number
  offset?: number
}

interface NoeudMd {
  type: string
  name?: string
  value?: string
  children?: NoeudMd[]
  position?: { start: Point; end: Point }
  data?: Record<string, unknown>
}

function estBloc(nom: string | undefined): nom is NomBloc {
  return (BLOCS as readonly string[]).includes(nom ?? '')
}

function tranche(n: NoeudMd, source: string): string {
  const debut = n.position?.start.offset
  const fin = n.position?.end.offset
  if (debut === undefined || fin === undefined) return ''
  return source.slice(debut, fin)
}

/** Ligne `numero` (1 = première) de la source. */
function ligne(source: string, numero: number): string {
  return source.split('\n')[numero - 1] ?? ''
}

function paragraphe(texte: string, position?: NoeudMd['position']): NoeudMd {
  return {
    type: 'paragraph',
    children: [{ type: 'text', value: texte }],
    ...(position ? { position } : {}),
  }
}

function traiter(parent: NoeudMd, source: string): void {
  if (!parent.children) return
  const sortie: NoeudMd[] = []
  for (const n of parent.children) {
    if (n.type === 'containerDirective' && estBloc(n.name)) {
      n.data = { ...n.data, hName: 'div', hProperties: { dataBloc: n.name } }
      traiter(n, source)
      sortie.push(n)
    } else if (n.type === 'textDirective') {
      sortie.push({ type: 'text', value: tranche(n, source) })
    } else if (n.type === 'leafDirective') {
      sortie.push(paragraphe(tranche(n, source), n.position))
    } else if (n.type === 'containerDirective') {
      // Conteneur inconnu : ses lignes `:::` redeviennent du texte, son
      // contenu reste du Markdown (le libellé est déjà dans la 1re ligne).
      traiter(n, source)
      const debut = n.position?.start.line
      const fin = n.position?.end.line
      if (debut !== undefined) sortie.push(paragraphe(ligne(source, debut)))
      for (const c of n.children ?? []) {
        if (!c.data?.directiveLabel) sortie.push(c)
      }
      if (fin !== undefined && fin !== debut) {
        const derniere = ligne(source, fin)
        if (/^\s*:{3,}\s*$/.test(derniere)) sortie.push(paragraphe(derniere))
      }
    } else {
      traiter(n, source)
      sortie.push(n)
    }
  }
  parent.children = sortie
}

/** Plugin remark, à placer APRÈS `remark-directive`. */
export function remarkBlocs() {
  return (arbre: NoeudMd, fichier: { value?: unknown }) => {
    traiter(arbre, String(fichier.value ?? ''))
  }
}

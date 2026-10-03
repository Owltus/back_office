/*
 * Rendu des diagrammes Mermaid du Classeur — porté de Registre
 * (`src/lib/mermaid.ts`), avec deux écarts délibérés :
 *
 * 1. `mermaid` est chargé par `import()` DYNAMIQUE, au premier diagramme
 *    seulement. La bibliothèque pèse plusieurs Mo : elle ne doit entrer ni
 *    dans le chunk d'entrée ni dans celui de la route (règle CLAUDE.md
 *    « lazy-load des grosses libs client-only »). Aucun import statique de
 *    `mermaid` ne doit apparaître dans ce dépôt.
 * 2. Un seul thème, CLAIR. Les pages A4 restent blanches à l'écran quel que
 *    soit le thème de l'app (dark navy forcé) : la variante sombre et le
 *    hook `useDarkMode` de Registre n'ont plus d'objet.
 */

// Import de TYPE seulement : effacé à la compilation, il ne tire pas la lib.
import type { Mermaid } from 'mermaid'

type MermaidModule = Mermaid

/**
 * Variables de thème NOIR ET BLANC, comme le reste du document imprimé
 * (relecture visuelle du 2026-10-03 : les nœuds bleu pastel détonnaient
 * dans une procédure en noir et blanc, photocopiable).
 */
const lightVars = {
  primaryColor: '#ffffff',
  primaryTextColor: '#000000',
  primaryBorderColor: '#000000',
  lineColor: '#333333',
  secondaryColor: '#f2f2f2',
  secondaryTextColor: '#000000',
  secondaryBorderColor: '#555555',
  tertiaryColor: '#f7f7f7',
  tertiaryTextColor: '#000000',
  tertiaryBorderColor: '#888888',
  textColor: '#000000',
  mainBkg: '#ffffff',
  nodeBorder: '#000000',
  clusterBkg: '#f7f7f7',
  clusterBorder: '#888888',
  edgeLabelBackground: '#ffffff',
  titleColor: '#000000',
  nodeTextColor: '#000000',
  actorBkg: '#ffffff',
  actorTextColor: '#000000',
  actorBorder: '#000000',
  actorLineColor: '#555555',
  signalColor: '#333333',
  signalTextColor: '#000000',
  labelBoxBkgColor: '#f2f2f2',
  labelTextColor: '#000000',
  noteBkgColor: '#f2f2f2',
  noteTextColor: '#000000',
  noteBorderColor: '#888888',
  activationBkgColor: '#f2f2f2',
  activationBorderColor: '#555555',
}

/** Chargement unique (single-flight) : la promesse est partagée. */
let modulePromise: Promise<MermaidModule> | null = null

/**
 * Charge `mermaid` à la demande et l'initialise une seule fois avec le
 * thème clair. Les appels suivants réutilisent la même promesse.
 */
export function loadMermaid(): Promise<MermaidModule> {
  if (!modulePromise) {
    modulePromise = import('mermaid')
      .then((mod) => {
        const mermaid = mod.default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: lightVars,
          securityLevel: 'strict',
        })
        return mermaid
      })
      .catch((err: unknown) => {
        // Un échec de chargement (réseau) ne doit pas figer le module :
        // le prochain diagramme retentera.
        modulePromise = null
        throw err
      })
  }
  return modulePromise
}

let renderCounter = 0

/**
 * Rend un diagramme Mermaid et retourne le SVG ASSAINI, prêt à injecter.
 *
 * `securityLevel: 'strict'` nettoie déjà les libellés ; DOMPurify repasse
 * sur le SVG complet (audit du 2026-09-28 : le nettoyage par expressions
 * régulières qui le précédait se contournait). `foreignObject` est gardé :
 * Mermaid y pose ses libellés HTML. Chargé à la demande, comme Mermaid.
 */
export async function renderMermaid(code: string): Promise<string> {
  const [mermaid, { default: DOMPurify }] = await Promise.all([
    loadMermaid(),
    import('dompurify'),
  ])
  const id = `classeur-mermaid-${++renderCounter}`
  const { svg } = await mermaid.render(id, code)
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject'],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  })
}

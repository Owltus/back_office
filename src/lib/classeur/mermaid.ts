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
 * Variables de thème alignées sur la palette slate/indigo de l'app, en
 * version claire (celle du papier).
 */
const lightVars = {
  // Nœuds principaux — bleu doux, cohérent avec le primary navy de l'app
  primaryColor: '#dbeafe',
  primaryTextColor: '#1e3a5f',
  primaryBorderColor: '#93c5fd',
  // Lignes et flèches
  lineColor: '#475569',
  // Nœuds secondaires — indigo très clair
  secondaryColor: '#e0e7ff',
  secondaryTextColor: '#1e3a5f',
  secondaryBorderColor: '#a5b4fc',
  // Nœuds tertiaires — slate neutre
  tertiaryColor: '#f1f5f9',
  tertiaryTextColor: '#0f172a',
  tertiaryBorderColor: '#cbd5e1',
  // Général
  textColor: '#0f172a',
  mainBkg: '#dbeafe',
  nodeBorder: '#93c5fd',
  clusterBkg: '#eff6ff',
  clusterBorder: '#bfdbfe',
  edgeLabelBackground: '#ffffff',
  titleColor: '#0f172a',
  nodeTextColor: '#1e3a5f',
  // Diagrammes de séquence
  actorBkg: '#dbeafe',
  actorTextColor: '#1e3a5f',
  actorBorder: '#93c5fd',
  actorLineColor: '#93c5fd',
  signalColor: '#475569',
  signalTextColor: '#0f172a',
  labelBoxBkgColor: '#eff6ff',
  labelTextColor: '#0f172a',
  noteBkgColor: '#e0e7ff',
  noteTextColor: '#1e3a5f',
  noteBorderColor: '#a5b4fc',
  activationBkgColor: '#dbeafe',
  activationBorderColor: '#93c5fd',
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

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

import {
  ECHELLE_LISIBLE,
  affichageSchema,
  echelleAffichee,
  orientationAlternative,
  tailleNaturelle,
} from '#/lib/classeur/mermaidMiseEnPage.ts'
import type {
  AffichageSchema,
  TailleSchema,
} from '#/lib/classeur/mermaidMiseEnPage.ts'

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
/** Un schéma prêt à poser : SVG assaini, taille naturelle, affichage. */
export interface SchemaRendu {
  svg: string
  taille: TailleSchema | null
  affichage: AffichageSchema
  /** Vrai si l'organigramme a été retourné (LR ↔ TD) pour rester lisible. */
  retourne: boolean
}

async function rendreBrut(code: string): Promise<string> {
  const [mermaid, { default: DOMPurify }] = await Promise.all([
    loadMermaid(),
    import('dompurify'),
  ])
  const id = `classeur-mermaid-${String(++renderCounter)}`
  const { svg } = await mermaid.render(id, code)
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['foreignObject'],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  })
}

/**
 * Rend un schéma et choisit son affichage (`mermaidMiseEnPage.ts`) : un
 * organigramme trop réduit dans son sens est essayé dans l'autre, le plus
 * lisible est gardé.
 */
export async function renderMermaid(code: string): Promise<SchemaRendu> {
  const svg = await rendreBrut(code)
  const taille = tailleNaturelle(svg)
  if (taille && echelleAffichee(taille) < ECHELLE_LISIBLE) {
    const autre = orientationAlternative(code)
    if (autre) {
      try {
        const svg2 = await rendreBrut(autre)
        const taille2 = tailleNaturelle(svg2)
        if (taille2 && echelleAffichee(taille2) > echelleAffichee(taille) * 1.1)
          return {
            svg: svg2,
            taille: taille2,
            affichage: affichageSchema(taille2),
            retourne: true,
          }
      } catch {
        // L'autre sens ne se dessine pas : on garde le premier.
      }
    }
  }
  return {
    svg,
    taille,
    affichage: taille ? affichageSchema(taille) : 'page',
    retourne: false,
  }
}

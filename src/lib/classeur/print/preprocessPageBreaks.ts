/*
 * Pré-traitement des marqueurs de saut de page — porté de Registre.
 *
 * L'utilisateur écrit `===` seul sur une ligne pour forcer un saut de page.
 * ReactMarkdown transformerait `===` en <hr> (ou en soulignement setext du
 * paragraphe précédent), donc on le remplace par un marqueur Unicode unique,
 * détecté par le composant `p` custom de `DocumentPages`, qui rend alors un
 * `<div data-page-break>` que `paginate` reconnaît.
 */

export const PAGEBREAK_MARKER = '⧨SAUT_DE_PAGE⧩' // ⧨SAUT_DE_PAGE⧩
const PAGEBREAK_REGEX = /^===\s*$/gm

export function preprocessPageBreaks(content: string): string {
  return content.replace(PAGEBREAK_REGEX, `\n${PAGEBREAK_MARKER}\n`)
}

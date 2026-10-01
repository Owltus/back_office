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

/**
 * `+++` seul sur une ligne : ancienne commande « reprendre sous l'image »
 * (2026-09-30), RETIRÉE le 2026-10-01 avec l'habillage des images (plan
 * `classeur-images-blocs`). Les anciens textes, versions et points de
 * restauration peuvent encore en contenir : elle devient une LIGNE VIDE —
 * même nombre de lignes, donc rien à compenser dans `lignesSource`.
 */
const ANCIEN_SOUS_IMAGE_REGEX = /^\+\+\+[ \t]*$/gm

export function preprocessPageBreaks(content: string): string {
  return content
    .replace(ANCIEN_SOUS_IMAGE_REGEX, '')
    .replace(PAGEBREAK_REGEX, `\n${PAGEBREAK_MARKER}\n`)
}

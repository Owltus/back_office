/*
 * Construit un document HTML complet à partir des pages A4 affichées dans le
 * conteneur d'aperçu — porté de Registre, puis corrigé le 2026-09-26.
 *
 * RÈGLE : ce que l'aperçu montre est ce qui s'imprime. Le document
 * imprimé doit donc être stylé EXACTEMENT comme la page qui affiche
 * l'aperçu. Pour cela :
 *
 * 1. Les feuilles de style sont reprises TELLES QUE LA PAGE LES CHARGE :
 *    chaque `<link rel="stylesheet">` est réémis comme `<link>` (même
 *    origine, autorisé par `style-src 'self'`) et chaque `<style>` est
 *    recopié. La version portée de Registre récupérait les `<link>` par
 *    `fetch()` pour les inliner : en mode dev, Vite répond à un `fetch()`
 *    de `/src/styles.css` par un MODULE JAVASCRIPT (`text/javascript`, «
 *    import { createHotContext } … »), pas par du CSS — le document imprimé
 *    n'avait alors AUCUN style de l'app (liens bleus, titres, tableaux et
 *    marges du navigateur), constaté par l'utilisateur le 26/09. Un
 *    `<link>` est demandé par le navigateur comme feuille de style, donc
 *    servi comme telle, en dev comme en production. L'attente de leur
 *    chargement est faite par `printIframe.ts` (`attendreFeuilles`).
 *
 * 2. La racine `<html>` reprend la classe et les attributs `data-*` de la
 *    page (`dark`, thème forcé de l'app) : les tokens CSS se résolvent aux
 *    mêmes valeurs que dans l'aperçu.
 *
 * 3. Les autres pages (RepJour, PDJ, Rapro, Caisse, Analytique) déclarent
 *    leurs propres `@page { margin: 10-12mm; size: A4 portrait }` dans la
 *    feuille globale ; le bloc d'impression du classeur est émis EN
 *    DERNIER pour l'emporter (`margin: 0`, la marge est dans la page A4).
 */

/** Bloc d'impression propre au classeur — toujours émis en dernier. */
export const PRINT_CSS = `
html, body { margin: 0; padding: 0; background: white; color-scheme: light; }
.a4-page { box-shadow: none !important; margin: 0 !important; }
@media print {
  @page { size: 210mm 297mm; margin: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { width: 210mm; }
  .a4-page { break-after: page; page-break-after: always; }
  .a4-page:last-child { break-after: auto; page-break-after: auto; }
}`

function echapperAttribut(valeur: string): string {
  return valeur
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** Attributs de `<html>` à reprendre : classe (thème) et `data-*`. */
function attributsRacine(racine: HTMLElement): string {
  const parts: string[] = ['lang="fr"']
  if (racine.className) {
    parts.push(`class="${echapperAttribut(racine.className)}"`)
  }
  for (const attr of Array.from(racine.attributes)) {
    if (attr.name.startsWith('data-')) {
      parts.push(`${attr.name}="${echapperAttribut(attr.value)}"`)
    }
  }
  return parts.join(' ')
}

/** Les feuilles de la page, dans l'ordre du document, réémises telles quelles. */
function feuillesDeLaPage(doc: Document): string {
  const parts: string[] = []
  const elements = doc.querySelectorAll('style, link[rel="stylesheet"]')
  for (const el of elements) {
    if (el instanceof HTMLStyleElement) {
      parts.push(`<style>${el.textContent}</style>`)
    } else if (el instanceof HTMLLinkElement && el.href) {
      const media = el.media ? ` media="${echapperAttribut(el.media)}"` : ''
      parts.push(
        `<link rel="stylesheet" href="${echapperAttribut(el.href)}"${media}>`,
      )
    }
  }
  return parts.join('\n')
}

export function buildPrintHtml(scrollContainer: HTMLElement): string {
  const doc = scrollContainer.ownerDocument
  const pages = scrollContainer.querySelectorAll<HTMLElement>('.a4-page')
  if (pages.length === 0) throw new Error('Aucune page A4 trouvée')

  const pagesHtml = Array.from(pages)
    .map((page) => page.outerHTML)
    .join('\n')

  return `<!DOCTYPE html>
<html ${attributsRacine(doc.documentElement)}>
<head>
<meta charset="utf-8">
<base href="${echapperAttribut(doc.baseURI)}">
${feuillesDeLaPage(doc)}
<style>${PRINT_CSS}</style>
</head>
<body>
${pagesHtml}
</body>
</html>`
}

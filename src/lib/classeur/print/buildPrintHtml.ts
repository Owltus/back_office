/*
 * Construit un document HTML complet et autonome à partir des pages A4
 * affichées dans le conteneur d'aperçu — porté de Registre.
 *
 * Le HTML résultant est auto-suffisant : les feuilles de style externes
 * (`<link rel="stylesheet">`, même origine, autorisées par `connect-src
 * 'self'`) sont récupérées via fetch() et inlinées ; les `<style>` du
 * document sont recopiés tels quels. C'est ce document qui est écrit dans
 * l'iframe d'impression (`printIframe.ts`).
 */
export async function buildPrintHtml(
  scrollContainer: HTMLElement,
): Promise<string> {
  // Récupérer toutes les pages A4
  const pages = scrollContainer.querySelectorAll<HTMLElement>('.a4-page')
  if (pages.length === 0) throw new Error('Aucune page A4 trouvée')

  const pagesHtml = Array.from(pages)
    .map((page) => page.outerHTML)
    .join('\n')

  // Collecter les styles : inline immédiatement, fetch en parallèle pour les <link>
  const styleParts: string[] = []
  const fetchPromises: { index: number; promise: Promise<string | null> }[] = []

  const styleElements = document.querySelectorAll(
    'style, link[rel="stylesheet"]',
  )
  for (const el of styleElements) {
    if (el instanceof HTMLStyleElement) {
      styleParts.push(`<style>${el.textContent}</style>`)
    } else if (el instanceof HTMLLinkElement) {
      const idx = styleParts.length
      styleParts.push('') // placeholder
      fetchPromises.push({
        index: idx,
        promise: fetch(el.href)
          .then((r) => r.text())
          .then((css) => `<style>/* ${el.href} */\n${css}</style>`)
          .catch(() => null),
      })
    }
  }

  // Résoudre tous les fetches en parallèle
  const results = await Promise.all(fetchPromises.map((f) => f.promise))
  for (let i = 0; i < fetchPromises.length; i++) {
    const css = results[i]
    if (css) {
      styleParts[fetchPromises[i].index] = css
    }
  }

  // Retirer les placeholders vides (stylesheets ayant échoué)
  const filledParts = styleParts.filter((s) => s !== '')

  // Styles d'impression spécifiques
  const printCss = `<style>
    @media print {
      @page { size: 210mm 297mm; margin: 0; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    html, body { margin: 0; padding: 0; background: white; }
    .a4-page {
      box-shadow: none !important;
      break-after: page;
      margin: 0 !important;
    }
    .a4-page:last-child {
      break-after: auto;
    }
  </style>`

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
${filledParts.join('\n')}
${printCss}
</head>
<body>
${pagesHtml}
</body>
</html>`
}

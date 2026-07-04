/**
 * Impression avec titre de document temporaire : le navigateur propose
 * `documentTitle` comme nom de fichier PDF, puis le titre de l'onglet est
 * restauré. `afterprint` est plus fiable que le timeout seul (impression
 * asynchrone) ; le timeout reste en filet de sécurité, restaurer deux fois
 * est sans effet.
 */
export function printWithTitle(documentTitle: string): void {
  const previousTitle = document.title
  document.title = documentTitle
  const restore = () => {
    document.title = previousTitle
  }
  window.addEventListener('afterprint', restore, { once: true })
  window.print()
  setTimeout(restore, 1000)
}

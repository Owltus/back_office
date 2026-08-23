/**
 * Impression avec titre de document temporaire : le navigateur propose
 * `documentTitle` comme nom de fichier PDF, puis le titre de l'onglet est
 * restauré. `afterprint` est plus fiable que le timeout seul (impression
 * asynchrone) ; le timeout reste en filet de sécurité, restaurer deux fois
 * est sans effet.
 *
 * Réentrant : un double-appel avant restauration (double-tap, ou un
 * appelant sans garde `pdfBusy` pendant l'appel synchrone lui-même) annule
 * le timer et l'écouteur précédents au lieu de les empiler, et garde le
 * VRAI titre d'origine (pas le titre temporaire déjà posé) pour la
 * restauration finale.
 */
let originalTitle: string | null = null
let restoreTimer: ReturnType<typeof setTimeout> | null = null
let restoreListener: (() => void) | null = null

export function printWithTitle(documentTitle: string): void {
  if (originalTitle === null) {
    originalTitle = document.title
  }
  if (restoreTimer !== null) {
    clearTimeout(restoreTimer)
  }
  if (restoreListener !== null) {
    window.removeEventListener('afterprint', restoreListener)
  }
  document.title = documentTitle
  const restore = () => {
    document.title = originalTitle ?? documentTitle
    originalTitle = null
    restoreTimer = null
    restoreListener = null
  }
  restoreListener = restore
  window.addEventListener('afterprint', restore, { once: true })
  window.print()
  restoreTimer = setTimeout(restore, 1000)
}

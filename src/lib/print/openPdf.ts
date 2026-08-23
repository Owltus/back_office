import type { jsPDF } from 'jspdf'

/**
 * Ouvre un PDF déjà rendu pour impression — SOURCE UNIQUE partagée par
 * rapro/repjour/parking/caisse/analytique : le document produit est
 * identique souris et tactile (même `jsPDF`, même `renderXxxDocument`),
 * seule sa PRÉSENTATION change :
 *
 *  - SOURIS (`target` absent) : iframe caché recyclé + `autoPrint()`
 *    (action « imprimer » intégrée au PDF). Fonctionne parce que le
 *    navigateur de bureau rend le PDF dans une visionneuse NATIVE à
 *    l'intérieur de l'iframe, qui exécute l'action embarquée — aucun
 *    téléchargement, aucune popup.
 *
 *  - TACTILE (`target` fourni par l'appelant, une fenêtre `window.open('',
 *    '_blank')` ouverte SYNCHRONE avec le clic, avant tout `await` — sinon
 *    le bloqueur de popups l'annule) : la plupart des navigateurs mobiles
 *    (iOS Safari, Chrome Android) ne rendent PAS de visionneuse PDF dans un
 *    iframe caché, `autoPrint()` n'y déclenche donc rien. On ouvre le MÊME
 *    PDF dans un nouvel onglet VISIBLE à la place : la visionneuse native du
 *    téléphone/de la tablette s'affiche, et l'utilisateur y appuie sur son
 *    propre bouton imprimer/partager — un geste de plus qu'au bureau, mais
 *    un document strictement identique, sans CSS d'impression à maintenir
 *    en parallèle du PDF.
 *
 * `URL.revokeObjectURL` différé au `load` de l'iframe (jamais immédiat : le
 * navigateur a encore besoin du blob le temps de charger le PDF dedans).
 */
export function openPrintablePdf(
  pdf: jsPDF,
  frameId: string,
  target?: Window | null,
): void {
  pdf.autoPrint()
  const blobUrl = pdf.output('bloburl').toString()

  if (target) {
    target.location.href = blobUrl
    return
  }

  document.getElementById(frameId)?.remove()
  const iframe = document.createElement('iframe')
  iframe.id = frameId
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  iframe.addEventListener('load', () => URL.revokeObjectURL(blobUrl), {
    once: true,
  })
  iframe.src = blobUrl
  document.body.appendChild(iframe)
}

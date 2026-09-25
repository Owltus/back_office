import { buildPrintHtml } from '#/lib/classeur/print/buildPrintHtml.ts'

/*
 * Impression via iframe caché — porté de Registre.
 *
 * Clone les pages A4 visibles dans l'aperçu dans un iframe temporaire
 * (`about:blank`, qui hérite de l'origine et de la CSP du parent — les
 * `<style>` inlinés sont couverts par `style-src 'unsafe-inline'`), y copie
 * les feuilles de style, puis appelle print() sur l'iframe. Cela contourne
 * les limitations du Dialog Radix (position fixed, flex, overflow) qui
 * empêchent window.print() d'afficher toutes les pages.
 *
 * C'est aussi LE chemin « PDF » de la page Classeur : le dialogue
 * d'impression du navigateur propose « Enregistrer en PDF » sur ce même
 * HTML A4 (décision du plan `page-classeur` : pas de jsPDF, le contenu est
 * du Markdown mis en page par le DOM).
 */
export async function printViaIframe(
  scrollContainer: HTMLElement,
): Promise<void> {
  // Créer l'iframe caché
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  const nettoyer = () => {
    if (iframe.parentNode) {
      document.body.removeChild(iframe)
    }
  }

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      nettoyer()
      return
    }

    // Construire le HTML complet via la fonction partagée
    const html = await buildPrintHtml(scrollContainer)

    // Écrire dans l'iframe
    iframeDoc.open()
    iframeDoc.write(html)
    iframeDoc.close()

    // Attendre le chargement des polices, puis imprimer
    await iframeDoc.fonts.ready

    // Double rAF pour s'assurer que le layout est calculé
    iframe.contentWindow?.requestAnimationFrame(() => {
      iframe.contentWindow?.requestAnimationFrame(() => {
        iframe.contentWindow?.print()

        // Nettoyer après fermeture du dialog d'impression
        setTimeout(nettoyer, 1000)
      })
    })
  } catch (err) {
    // Nettoyer l'iframe en cas d'erreur, puis laisser l'appelant décider
    nettoyer()
    throw err
  }
}

/**
 * Alias explicite de `printViaIframe` : imprime (ou enregistre en PDF, via
 * le dialogue du navigateur) les pages A4 contenues dans `scrollContainer`.
 */
export const imprimerApercu = printViaIframe

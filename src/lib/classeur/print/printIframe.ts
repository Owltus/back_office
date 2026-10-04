import {
  MiseEnPageEnCours,
  SELECTEUR_PAGINATION_EN_COURS,
  buildPrintHtml,
  titreImpression,
} from '#/lib/classeur/print/buildPrintHtml.ts'
import type { OptionsImpression } from '#/lib/classeur/print/buildPrintHtml.ts'

/*
 * Impression via iframe caché — porté de Registre.
 *
 * Clone les pages A4 visibles dans l'aperçu dans un iframe temporaire
 * (`about:blank`, qui hérite de l'origine et de la CSP du parent), avec les
 * MÊMES feuilles de style que la page (voir `buildPrintHtml.ts`), attend
 * qu'elles soient chargées ainsi que les polices, puis appelle print() sur
 * l'iframe. Cela contourne les limitations du Dialog Radix (position fixed,
 * flex, overflow) qui empêchent window.print() d'afficher toutes les pages.
 *
 * C'est aussi LE chemin « PDF » de la page Classeur : le dialogue
 * d'impression du navigateur propose « Enregistrer en PDF » sur ce même
 * HTML A4 (décision du plan `page-classeur` : pas de jsPDF, le contenu est
 * du Markdown mis en page par le DOM).
 */

/**
 * Pose `titre` sur le document parent le temps de l'impression et rend la
 * fonction qui remet l'ancien (une seule fois). Le nom de fichier proposé
 * par « Enregistrer au format PDF » vient du `<title>` du document
 * imprimé — l'iframe ; on pose aussi celui du parent par prudence (selon le
 * navigateur, c'est lui qui est lu). Le titre n'est remis que s'il n'a pas
 * été changé entre-temps par l'app.
 */
export function titreTemporaire(doc: Document, titre: string): () => void {
  const avant = doc.title
  doc.title = titre
  let fait = false
  return () => {
    if (fait) return
    fait = true
    if (doc.title === titre) doc.title = avant
  }
}

/** Délai maximal d'attente des feuilles et des polices avant d'imprimer quand même. */
const ATTENTE_MAX_MS = 5000

/**
 * Résout quand toutes les `<link rel="stylesheet">` du document sont
 * chargées (ou en erreur). Une feuille déjà chargée expose `sheet` ; sinon
 * on écoute `load`/`error`.
 */
export function attendreFeuilles(doc: Document): Promise<void> {
  const links = Array.from(
    doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  )
  return Promise.all(
    links.map(
      (link) =>
        new Promise<void>((resolve) => {
          if (link.sheet) {
            resolve()
            return
          }
          link.addEventListener('load', () => resolve(), { once: true })
          link.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  ).then(() => undefined)
}

function avecDelai(promesse: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const minuteur = setTimeout(resolve, ms)
    promesse.then(
      () => {
        clearTimeout(minuteur)
        resolve()
      },
      () => {
        clearTimeout(minuteur)
        resolve()
      },
    )
  })
}

/** Délai maximal d'attente de la fin de la pagination avant d'abandonner. */
export const PAGINATION_ATTENTE_MAX_MS = 15000

/**
 * Résout quand plus aucun document du conteneur ne mesure (marqueur
 * `data-pagination="en-cours"` de `DocumentPages`), et LÈVE
 * `MiseEnPageEnCours` au bout de `maxMs` — jamais une impression
 * incomplète, jamais une attente sans fin (Chrome suspend
 * `requestAnimationFrame` dans un onglet caché : la mesure peut ne pas
 * finir). Aucune boucle : un MutationObserver et un minuteur.
 */
export function attendrePagination(
  conteneur: HTMLElement,
  maxMs: number = PAGINATION_ATTENTE_MAX_MS,
): Promise<void> {
  const enCours = () =>
    conteneur.querySelector(SELECTEUR_PAGINATION_EN_COURS) !== null
  if (!enCours()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (enCours()) return
      clearTimeout(minuteur)
      observer.disconnect()
      resolve()
    })
    const minuteur = setTimeout(() => {
      observer.disconnect()
      reject(new MiseEnPageEnCours())
    }, maxMs)
    observer.observe(conteneur, {
      attributes: true,
      attributeFilter: ['data-pagination'],
      childList: true,
      subtree: true,
    })
  })
}

export async function printViaIframe(
  scrollContainer: HTMLElement,
  options: OptionsImpression = {},
): Promise<void> {
  // AVANT tout : un document qui mesure encore manquerait à l'impression.
  await attendrePagination(scrollContainer)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  let remettreTitre: () => void = () => {}
  const nettoyer = () => {
    remettreTitre()
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

    const html = buildPrintHtml(scrollContainer, options)
    remettreTitre = titreTemporaire(document, titreImpression(options))

    iframeDoc.open()
    iframeDoc.write(html)
    iframeDoc.close()

    // Feuilles de style PUIS polices : `fonts.ready` ne connaît les
    // `@font-face` qu'une fois les feuilles analysées.
    await avecDelai(attendreFeuilles(iframeDoc), ATTENTE_MAX_MS)
    await avecDelai(iframeDoc.fonts.ready, ATTENTE_MAX_MS)

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

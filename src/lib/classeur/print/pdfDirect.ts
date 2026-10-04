import { attendrePagination } from '#/lib/classeur/print/printIframe.ts'
import { titreImpression } from '#/lib/classeur/print/buildPrintHtml.ts'
import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
} from '#/lib/classeur/print/constants.ts'

/*
 * « Télécharger le PDF » — étape 9 du plan `classeur-fonctions-2026-10-04`,
 * décision D19 RENVERSÉE par l'utilisateur le 2026-10-04 (voie B,
 * navigateur) : un fichier PDF prêt à envoyer, SANS la fenêtre
 * d'impression du navigateur.
 *
 * Chaque `.a4-page` de l'aperçu est capturée en image (html2canvas-pro, qui
 * lit les couleurs `oklch` de Tailwind v4 — la html2canvas 1.4.1 ne les lit
 * pas), puis posée pleine page dans un PDF A4 portrait (jsPDF). Le texte du
 * PDF est donc une IMAGE : pour un texte sélectionnable, « Imprimer » puis
 * « Enregistrer au format PDF » reste la voie vectorielle.
 *
 * Ce module est chargé par `import()` au clic, et charge lui-même
 * html2canvas-pro et jspdf par `import()` : aucune des deux n'entre dans le
 * chunk d'entrée ni dans celui de la page Classeur.
 *
 * Sécurité / CSP (vérifié dans le code de html2canvas-pro 2.5.1) : les
 * images sont rechargées par `new Image()` (les URL `blob:` des images
 * privées sont permises par `img-src blob:`), JAMAIS par `fetch` — la
 * `connect-src` de production refuse un `fetch(blob:)`. Ni proxy, ni CORS,
 * ni `allowTaint` : rien ne quitte l'origine. Un schéma Mermaid (SVG à
 * `foreignObject`) est sérialisé en image `data:image/svg+xml` par la
 * librairie elle-même.
 *
 * Mise à l'échelle : la page capturée est un CLONE (le document cloné par
 * html2canvas-pro), sorti de l'aperçu et posé en `fixed` en haut à gauche,
 * `transform`/`zoom` neutralisés : la capture fait toujours 210 × 297 mm,
 * quel que soit l'affichage de l'aperçu. Les AUTRES pages sont exclues du
 * clone (`ignoreElements`) : cloner N pages pour en capturer une serait N²
 * sur un classeur entier.
 */

/** Qualité JPEG des pages (0,92 : texte net, ~300 à 800 ko par page). */
export const QUALITE_JPEG = 0.92
/** Échelle de capture : 2 au minimum, la densité de l'écran au-delà, bornée à 3. */
export function echelleCapture(dpr: number | undefined): number {
  const d = typeof dpr === 'number' && Number.isFinite(dpr) ? dpr : 1
  return Math.min(3, Math.max(2, d))
}

/** Ce que l'on demande à la fonction de capture. */
export interface OptionsCapture {
  scale: number
  backgroundColor: string
  /** Pages à exclure du clone (toutes sauf celle capturée). */
  ignoreElements: (el: Element) => boolean
  onclone: (doc: Document, element: HTMLElement) => void
  useCORS: false
  allowTaint: false
  logging: false
  windowWidth: number
  windowHeight: number
}

/** Le sous-ensemble de jsPDF utilisé ici (remplaçable dans les tests). */
export interface PdfMinimal {
  addPage: (format: string, orientation: 'portrait') => unknown
  addImage: (
    data: string,
    format: 'JPEG',
    x: number,
    y: number,
    w: number,
    h: number,
    alias?: string,
    compression?: 'FAST' | 'NONE',
  ) => unknown
  save: (nom: string) => unknown
}

export interface OutilsPdf {
  capturer: (
    page: HTMLElement,
    options: OptionsCapture,
  ) => Promise<HTMLCanvasElement>
  creerPdf: () => PdfMinimal
}

export interface OptionsPdfDirect {
  /** Nom du fichier, sans extension (voir `nomFichierImpression`). */
  nomFichier?: string
  /** Progression : page `fait` sur `total` terminée (0 avant la première). */
  onProgression?: (fait: number, total: number) => void
  /** Injection (tests) : par défaut html2canvas-pro et jspdf. */
  outils?: OutilsPdf
}

/** Nom du fichier téléchargé : « Classeur - Titre.pdf ». */
export function nomFichierPdf(nomFichier?: string): string {
  return `${titreImpression({ nomFichier })}.pdf`
}

async function outilsParDefaut(): Promise<OutilsPdf> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])
  return {
    capturer: (page, options) => html2canvas(page, options),
    creerPdf: () =>
      new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
        compress: true,
      }),
  }
}

/** Attente bornée des polices (absent sous jsdom). */
async function attendrePolices(doc: Document): Promise<void> {
  if (!('fonts' in doc)) return
  await Promise.race([
    doc.fonts.ready.then(() => undefined),
    new Promise<void>((r) => setTimeout(r, 5000)),
  ])
}

/**
 * Dans le document CLONÉ : sort la page de l'aperçu (dialogue centré par
 * `transform`, défilement), la pose en haut à gauche, à l'échelle 1, sans
 * ombre. N'agit jamais sur la page affichée.
 */
export function isolerPageClonee(doc: Document, page: HTMLElement): void {
  doc.body.appendChild(page)
  const s = page.style
  s.position = 'fixed'
  s.left = '0'
  s.top = '0'
  s.margin = '0'
  s.transform = 'none'
  s.zoom = '1'
  s.boxShadow = 'none'
  s.zIndex = '2147483647'
  s.background = '#ffffff'
  redessinerContoursMasques(doc, page)
}

/**
 * Défaut de html2canvas-pro 2.5.1, constaté au navigateur le 2026-10-04 :
 * le `outline` d'un élément en `overflow: hidden` est rogné par son PROPRE
 * masque (un navigateur le dessine dehors). Or le cadre noir 0,75 pt de
 * toute image du classeur est justement un `outline` sur la fenêtre
 * `.classeur-image-cadre`, masquée : il disparaissait du PDF. Dans le CLONE
 * seulement, chacun de ces contours est retiré et redessiné par un calque
 * en `border`, posé à la même place au premier niveau de la page (hors de
 * tout masque). La mise en page ne bouge pas : un calque absolu n'occupe
 * aucune place, un `outline` non plus.
 */
const masque = (v: string) => v !== '' && v !== 'visible'

export function redessinerContoursMasques(
  doc: Document,
  page: HTMLElement,
): number {
  const vue = doc.defaultView
  if (!vue) return 0
  const base = page.getBoundingClientRect()
  let n = 0
  for (const el of Array.from(page.querySelectorAll<HTMLElement>('*'))) {
    const st = vue.getComputedStyle(el)
    if (st.outlineStyle === 'none' || st.outlineStyle === 'hidden') continue
    const largeur = parseFloat(st.outlineWidth)
    if (!(largeur > 0)) continue
    if (!masque(st.overflowX) && !masque(st.overflowY)) continue
    const r = el.getBoundingClientRect()
    const ecart = (parseFloat(st.outlineOffset) || 0) + largeur
    const calque = doc.createElement('div')
    calque.setAttribute('data-contour-capture', '')
    const c = calque.style
    c.position = 'absolute'
    c.left = `${r.left - base.left - page.clientLeft - ecart}px`
    c.top = `${r.top - base.top - page.clientTop - ecart}px`
    c.width = `${r.width + 2 * ecart}px`
    c.height = `${r.height + 2 * ecart}px`
    c.boxSizing = 'border-box'
    c.border = `${largeur}px ${st.outlineStyle} ${st.outlineColor}`
    c.pointerEvents = 'none'
    el.style.outlineStyle = 'none'
    page.appendChild(calque)
    n++
  }
  return n
}

/**
 * Produit et télécharge le PDF des pages A4 contenues dans `conteneur`.
 * Lève `MiseEnPageEnCours` si un document mesure encore au bout de 15 s,
 * et toute erreur de capture (aucun fichier partiel n'est enregistré).
 */
export async function telechargerPdf(
  conteneur: HTMLElement,
  options: OptionsPdfDirect = {},
): Promise<{ pages: number; nom: string }> {
  // AVANT tout : un document qui mesure encore manquerait au PDF.
  await attendrePagination(conteneur)
  const doc = conteneur.ownerDocument
  await attendrePolices(doc)

  const pages = Array.from(conteneur.querySelectorAll<HTMLElement>('.a4-page'))
  if (pages.length === 0) throw new Error('Aucune page A4 trouvée')

  const outils = options.outils ?? (await outilsParDefaut())
  const total = pages.length
  options.onProgression?.(0, total)

  const scale = echelleCapture(doc.defaultView?.devicePixelRatio)
  const vue = doc.defaultView
  const pdf = outils.creerPdf()

  for (let i = 0; i < total; i++) {
    const page = pages[i]
    const canvas = await outils.capturer(page, {
      scale,
      backgroundColor: '#ffffff',
      ignoreElements: (el) => el !== page && el.classList.contains('a4-page'),
      onclone: (_doc, clone) => isolerPageClonee(_doc, clone),
      useCORS: false,
      allowTaint: false,
      logging: false,
      windowWidth: Math.max(vue?.innerWidth ?? 0, 1200),
      windowHeight: Math.max(vue?.innerHeight ?? 0, 1200),
    })
    const image = canvas.toDataURL('image/jpeg', QUALITE_JPEG)
    // Libère la mémoire de la page avant la suivante.
    canvas.width = 0
    canvas.height = 0
    if (i > 0) pdf.addPage('a4', 'portrait')
    pdf.addImage(
      image,
      'JPEG',
      0,
      0,
      PAGE_WIDTH_MM,
      PAGE_HEIGHT_MM,
      `page-${i + 1}`,
      'FAST',
    )
    options.onProgression?.(i + 1, total)
    // Laisse respirer l'interface (progression affichée) entre deux pages.
    await new Promise<void>((r) => setTimeout(r, 0))
  }

  const nom = nomFichierPdf(options.nomFichier)
  pdf.save(nom)
  return { pages: total, nom }
}

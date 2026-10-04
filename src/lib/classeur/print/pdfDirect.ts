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
 * quel que soit l'affichage de l'aperçu (zoom de l'écran compris).
 *
 * Performance (audit du 2026-10-04 : 64 pages gelaient l'onglet ~3 min,
 * 1,2 puis 2 s par page et plus) : html2canvas-pro clone TOUT le document à
 * chaque page, styles calculés compris, puis attend chaque image du clone.
 * Or le corps de la page contient l'application entière sous le dialogue
 * et les conteneurs de MESURE de chaque document (portails cachés, avec
 * leurs images et leurs schémas). `filtreClone` ne garde que la chaîne des
 * ancêtres de la page, la page elle-même, et les feuilles de style : le
 * reste n'est jamais cloné. Entre deux pages, `rendreLaMain` laisse le
 * navigateur afficher la progression et répondre (Annuler, Fermer).
 *
 * Annulation : `signal` (AbortSignal) est relu avant et après chaque page,
 * et transmis à html2canvas-pro. Annulé, rien n'est enregistré et
 * `PdfAnnule` est levée.
 */

/** Levée quand la création est annulée (aucun fichier enregistré). */
export class PdfAnnule extends Error {
  constructor() {
    super('Création du PDF annulée.')
    this.name = 'PdfAnnule'
  }
}

/** Balises toujours gardées dans le clone : ce sont les styles. */
const BALISES_STYLE = new Set(['STYLE', 'LINK'])

/**
 * Filtre `ignoreElements` pour capturer `page` : vrai (= ne pas cloner)
 * pour tout élément du CORPS qui ne contient pas la page et n'y est pas
 * contenu. La tête du document (`head`, ses `style` et `link`) et tout
 * `style`/`link` du corps sont gardés : la page en a besoin pour être
 * dessinée comme à l'écran.
 */
export function filtreClone(page: HTMLElement): (el: Element) => boolean {
  return (el) => {
    if (el === page) return false
    if (BALISES_STYLE.has(el.tagName)) return false
    const body = el.ownerDocument.body as HTMLElement | null
    // Hors du corps (tête, élément détaché) : jamais filtré.
    if (!body || el === body || !body.contains(el)) return false
    return !el.contains(page) && !page.contains(el)
  }
}

/**
 * Rend la main au navigateur (une tâche) : rendu de la progression,
 * clics. `MessageChannel` plutôt que `setTimeout` : pas de bridage à 4 ms
 * ni à 1 s quand l'onglet passe en arrière-plan.
 */
export function rendreLaMain(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0)
      return
    }
    const canal = new MessageChannel()
    canal.port1.onmessage = () => {
      canal.port1.close()
      canal.port2.close()
      resolve()
    }
    canal.port2.postMessage(null)
  })
}

function verifierAnnulation(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PdfAnnule()
}

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
  /** Tout ce qui n'est ni la page, ni un de ses ancêtres, ni un style. */
  ignoreElements: (el: Element) => boolean
  /** Annulation transmise à html2canvas-pro. */
  signal?: AbortSignal
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
  /** Annulation : arrêt entre deux pages, aucun fichier, `PdfAnnule`. */
  signal?: AbortSignal
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
 * `PdfAnnule` si `signal` est annulé, et toute erreur de capture (aucun
 * fichier partiel n'est enregistré).
 */
export async function telechargerPdf(
  conteneur: HTMLElement,
  options: OptionsPdfDirect = {},
): Promise<{ pages: number; nom: string }> {
  const { signal } = options
  verifierAnnulation(signal)
  // AVANT tout : un document qui mesure encore manquerait au PDF.
  await attendrePagination(conteneur)
  const doc = conteneur.ownerDocument
  await attendrePolices(doc)
  verifierAnnulation(signal)

  const pages = Array.from(conteneur.querySelectorAll<HTMLElement>('.a4-page'))
  if (pages.length === 0) throw new Error('Aucune page A4 trouvée')

  const outils = options.outils ?? (await outilsParDefaut())
  verifierAnnulation(signal)
  const total = pages.length
  options.onProgression?.(0, total)

  const scale = echelleCapture(doc.defaultView?.devicePixelRatio)
  const vue = doc.defaultView
  const pdf = outils.creerPdf()

  for (let i = 0; i < total; i++) {
    // Entre deux pages : le navigateur affiche la progression et traite un
    // clic sur Annuler ou Fermer AVANT la capture suivante.
    await rendreLaMain()
    verifierAnnulation(signal)
    const page = pages[i]
    let canvas: HTMLCanvasElement
    try {
      canvas = await outils.capturer(page, {
        scale,
        backgroundColor: '#ffffff',
        ignoreElements: filtreClone(page),
        onclone: (_doc, clone) => isolerPageClonee(_doc, clone),
        useCORS: false,
        allowTaint: false,
        logging: false,
        windowWidth: Math.max(vue?.innerWidth ?? 0, 1200),
        windowHeight: Math.max(vue?.innerHeight ?? 0, 1200),
        ...(signal ? { signal } : {}),
      })
    } catch (err) {
      // html2canvas-pro lève sa propre erreur sur un signal annulé.
      verifierAnnulation(signal)
      throw err
    }
    verifierAnnulation(signal)
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
  }

  await rendreLaMain()
  verifierAnnulation(signal)
  const nom = nomFichierPdf(options.nomFichier)
  pdf.save(nom)
  return { pages: total, nom }
}

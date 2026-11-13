/*
 * Export Markdown de la page Classeur — porté de Registre
 * (`src/lib/exportMarkdown.ts` : `exportMarkdown`, `exportClasseurZip`).
 *
 * Deux formes :
 *   - un document seul → un fichier `.md` ;
 *   - un chapitre ou un classeur → une archive ZIP, un dossier par chapitre,
 *     un fichier `.md` par élément.
 *
 * Arborescence de l'archive, fidèle à la source (dossier « N - Libellé »,
 * noms passés par `sanitizeFilename`, extension `.md`) et complétée sur
 * deux points :
 *   - les fichiers sont NUMÉROTÉS (« N - Titre.md ») : un explorateur de
 *     fichiers trie par nom, la numérotation conserve l'ordre du chapitre ;
 *   - les quatre natures d'élément sont exportées, pas seulement les
 *     documents. Une feuille de suivi ou de signature devient un tableau
 *     Markdown vide aux colonnes de la page imprimée (`TrackingSheetPage`,
 *     `SignatureSheetPage`), un intercalaire un titre et sa description.
 *
 * JSZip (≈ 100 ko) est chargé par `import()` DYNAMIQUE au moment de
 * l'appel, jamais en import statique — règle du projet sur les libs
 * lourdes (CLAUDE.md, « Lazy-load des grosses libs client-only »).
 */

import { telechargerBlob, telechargerTexte } from '#/lib/classeur/download.ts'
import { imagesReferencees, telechargerImage } from '#/lib/classeur/images.ts'
import { sanitizeFilename, stripAccents } from '#/lib/classeur/slug.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import type {
  ChapterContent,
  ChapterItem,
  DbChapter,
  DbPeriodicite,
} from '#/lib/classeur/types.ts'

/** Titre d'un élément sans titre (comme Registre). */
const SANS_TITRE = 'Sans titre'

/** Nom d'archive d'un classeur sans nom (comme Registre). */
const NOM_CLASSEUR_REPLI = 'Classeur'

/** Nombre de lignes d'une feuille de suivi dont la périodicité est inconnue. */
const LIGNES_SUIVI_REPLI = 8

/** Un titre de niveau 1 en tête de contenu (après d'éventuelles lignes vides). */
const RE_TITRE_H1 = /^\s*#\s+\S/

// ---------------------------------------------------------------------------
// Rendu Markdown des quatre natures
// ---------------------------------------------------------------------------

/**
 * Contenu d'un document : le Markdown tel quel, précédé de `# titre` s'il
 * ne commence pas déjà par un titre de niveau 1 (le titre vit en base, pas
 * dans le contenu ; un fichier isolé doit le porter).
 */
export function documentEnMarkdown(titre: string, contenu: string): string {
  const t = titre.trim() || SANS_TITRE
  if (RE_TITRE_H1.test(contenu)) return contenu
  const corps = contenu.trim()
  return corps === '' ? `# ${t}\n` : `# ${t}\n\n${corps}\n`
}

/** Tableau Markdown vide : en-tête + `lignes` lignes blanches. */
function tableauVide(colonnes: string[], lignes: number): string {
  const entete = `| ${colonnes.join(' | ')} |`
  const separateur = `|${colonnes.map(() => ' --- ').join('|')}|`
  const vide = `|${colonnes.map(() => '   ').join('|')}|`
  const corps = Array.from({ length: Math.max(0, lignes) }, () => vide)
  return [entete, separateur, ...corps].join('\n')
}

/** Vrai pour la périodicité « Non défini » (comparée sans accent ni casse). */
function estNonDefinie(label: string): boolean {
  return stripAccents(label).toLowerCase().trim() === 'non defini'
}

/**
 * Feuille de suivi : titre, périodicité (omise si « Non défini », comme le
 * sous-titre de la page imprimée), puis le tableau Date | Note | Signature
 * avec autant de lignes que la périodicité en prévoit (8 si inconnue).
 */
export function feuilleSuiviEnMarkdown(
  titre: string,
  periodicite: Pick<DbPeriodicite, 'label' | 'nombre'> | undefined,
): string {
  const t = titre.trim() || SANS_TITRE
  const lignes = periodicite?.nombre ?? LIGNES_SUIVI_REPLI
  const sousTitre =
    periodicite && !estNonDefinie(periodicite.label)
      ? `Périodicité : ${periodicite.label}\n\n`
      : ''
  return `# ${t}\n\n${sousTitre}${tableauVide(['Date', 'Note', 'Signature'], lignes)}\n`
}

/**
 * Feuille de signature : titre, description éventuelle, puis le tableau
 * Date | Nom / Prénom | Signature avec `nombre` lignes.
 */
export function feuilleSignatureEnMarkdown(
  titre: string,
  description: string,
  nombre: number,
): string {
  const t = titre.trim() || SANS_TITRE
  const desc = description.trim()
  const sousTitre = desc === '' ? '' : `${desc}\n\n`
  return `# ${t}\n\n${sousTitre}${tableauVide(['Date', 'Nom / Prénom', 'Signature'], nombre)}\n`
}

/** Intercalaire : titre et description (page de séparation, rien d'autre). */
export function intercalaireEnMarkdown(
  titre: string,
  description: string,
): string {
  const t = titre.trim() || SANS_TITRE
  const desc = description.trim()
  return desc === '' ? `# ${t}\n` : `# ${t}\n\n${desc}\n`
}

/** Rendu Markdown d'un élément selon sa nature. */
export function elementEnMarkdown(
  item: ChapterItem,
  periodicites: readonly DbPeriodicite[] = [],
): string {
  switch (item.kind) {
    case 'document':
      return documentEnMarkdown(item.data.title, item.data.content)
    case 'tracking_sheet':
      return feuilleSuiviEnMarkdown(
        item.data.title,
        periodicites.find((p) => p.id === item.data.periodicite_id),
      )
    case 'signature_sheet':
      return feuilleSignatureEnMarkdown(
        item.data.title,
        item.data.description,
        item.data.nombre,
      )
    case 'intercalaire':
      return intercalaireEnMarkdown(item.data.title, item.data.description)
  }
}

// ---------------------------------------------------------------------------
// Noms de dossiers et de fichiers
// ---------------------------------------------------------------------------

/** « N - Libellé », nettoyé — le nom de dossier d'un chapitre (Registre). */
export function nomDossierChapitre(numero: number, label: string): string {
  return sanitizeFilename(`${numero} - ${label}`)
}

/** « N - Titre.md », nettoyé — le nom de fichier d'un élément. */
export function nomFichierElement(numero: number, titre: string): string {
  return `${sanitizeFilename(`${numero} - ${titre.trim() || SANS_TITRE}`)}.md`
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

export interface OptionsArchive {
  /**
   * Référentiel des périodicités : libellé et nombre de lignes des feuilles
   * de suivi. Sans lui, une feuille de suivi est rendue sans périodicité et
   * avec 8 lignes.
   */
  periodicites?: readonly DbPeriodicite[]
  /**
   * Numéro du dossier d'un chapitre : sa POSITION dans la liste (1, 2, 3…,
   * défaut — le tableau de bord de Registre renumérote ainsi) ou son
   * `sort_order` (export d'un seul chapitre, qui garde son rang réel).
   */
  numerotation?: 'position' | 'sort_order'
  /**
   * Lecture d'une image du classeur (`telechargerImage` dans l'app). Donnée,
   * les images des documents sont mises dans un dossier `images/` à la
   * racine de l'archive et les chemins réécrits vers lui ; absente, le
   * texte garde les chemins de l'app (comme avant le 2026-11-13).
   */
  lireImage?: (chemin: string) => Promise<Blob>
  /** `false` : chaque image devient sa légende en texte (`retirerImages`). */
  avecImages?: boolean
}

/**
 * Sans les images : chaque image devient sa légende en italique
 * (« *Image : Le comptoir* »), une image sans légende disparaît. Les
 * emplacements « à insérer » suivent la même règle.
 */
export function retirerImages(markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_t, legende: string) => {
    const l = legende.trim()
    return l === '' ? '' : `*Image : ${l}*`
  })
}

/** Dossier des images à la racine d'une archive. */
export const DOSSIER_IMAGES = 'images'

/** Le nom de fichier d'une image dans l'archive (`<uuid>.webp`). */
function nomImage(chemin: string): string {
  return chemin.slice(chemin.indexOf('/') + 1).toLowerCase()
}

const RE_LIEN_IMAGE =
  /(!\[[^\]]*\]\(\s*<?)([0-9]{1,12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp)/gi

/**
 * Réécrit les chemins d'images connus (`<classeur>/<uuid>.webp`) vers
 * `<prefixe><uuid>.webp`. Les autres (emplacement à insérer, image non
 * lue) restent tels quels.
 */
export function redirigerImages(
  markdown: string,
  connues: ReadonlySet<string>,
  prefixe: string,
): string {
  return markdown.replace(
    RE_LIEN_IMAGE,
    (tout: string, debut: string, chemin: string) =>
      connues.has(chemin.toLowerCase())
        ? `${debut}${prefixe}${nomImage(chemin)}`
        : tout,
  )
}

interface DossierZip {
  file: (nom: string, donnees: Uint8Array | string) => unknown
}

/**
 * Lit les images référencées par les documents et les range dans le
 * dossier `images/` de l'archive. Rend les chemins effectivement mis : une
 * image illisible (supprimée, réseau) est sautée, son lien reste.
 */
async function ajouterImages(
  zip: { folder: (nom: string) => DossierZip | null },
  documents: readonly { content: string; deleted_at: string | null }[],
  lireImage: (chemin: string) => Promise<Blob>,
): Promise<Set<string>> {
  const chemins = new Set<string>()
  for (const d of documents) {
    if (d.deleted_at !== null) continue
    for (const c of imagesReferencees(d.content)) chemins.add(c)
  }
  const mises = new Set<string>()
  if (chemins.size === 0) return mises
  const dossier = zip.folder(DOSSIER_IMAGES)
  if (!dossier) return mises
  // Quatre à la fois : assez pour aller vite, sans noyer la base.
  const liste = [...chemins]
  for (let i = 0; i < liste.length; i += 4) {
    await Promise.all(
      liste.slice(i, i + 4).map(async (c) => {
        try {
          const blob = await lireImage(c)
          dossier.file(nomImage(c), new Uint8Array(await blob.arrayBuffer()))
          mises.add(c)
        } catch {
          // Image illisible : le lien reste, rien ne casse.
        }
      }),
    )
  }
  return mises
}

/**
 * Construit l'archive ZIP d'un ou plusieurs chapitres : un dossier par
 * chapitre (dans l'ordre de `sort_order`), un fichier `.md` par élément
 * (dans l'ordre de `flattenItems`). `content` peut porter les éléments de
 * plusieurs chapitres : chacun est filtré sur son `chapter_id`. Le nom du
 * classeur n'entre pas dans l'archive (la source non plus : il ne nommait
 * que le `.zip`, voir `exporterClasseurZip`).
 */
export async function construireArchiveMarkdown(
  chapters: readonly DbChapter[],
  content: ChapterContent,
  options: OptionsArchive = {},
): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const periodicites = options.periodicites ?? []
  const numerotation = options.numerotation ?? 'position'

  const tries = [...chapters].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )
  const idsChapitres = new Set(tries.map((c) => c.id))
  const images = options.lireImage
    ? await ajouterImages(
        zip,
        content.documents.filter((d) => idsChapitres.has(d.chapter_id)),
        options.lireImage,
      )
    : new Set<string>()

  tries.forEach((ch, index) => {
    const numero = numerotation === 'sort_order' ? ch.sort_order : index + 1
    const dossier = zip.folder(nomDossierChapitre(numero, ch.label))
    if (!dossier) return

    const items = flattenItems(contenuDuChapitre(content, ch.id))
    items.forEach((item, i) => {
      const brut = elementEnMarkdown(item, periodicites)
      const texte = options.avecImages === false ? retirerImages(brut) : brut
      dossier.file(
        nomFichierElement(i + 1, item.data.title),
        images.size > 0
          ? redirigerImages(texte, images, `../${DOSSIER_IMAGES}/`)
          : texte,
      )
    })
  })

  // `uint8array` puis `Blob` maison : ne dépend pas de la détection de
  // `Blob` interne à JSZip (même code en navigateur et sous Node/Vitest).
  const octets = await zip.generateAsync({ type: 'uint8array' })
  return new Blob([octets as BlobPart], { type: 'application/zip' })
}

/** Les quatre familles d'un seul chapitre, extraites d'un contenu global. */
function contenuDuChapitre(
  content: ChapterContent,
  chapterId: number,
): ChapterContent {
  return {
    documents: content.documents.filter((d) => d.chapter_id === chapterId),
    tracking_sheets: content.tracking_sheets.filter(
      (d) => d.chapter_id === chapterId,
    ),
    signature_sheets: content.signature_sheets.filter(
      (d) => d.chapter_id === chapterId,
    ),
    intercalaires: content.intercalaires.filter(
      (d) => d.chapter_id === chapterId,
    ),
  }
}

// ---------------------------------------------------------------------------
// Un seul fichier (2026-11-13, demande utilisateur : « tout dans un seul
// fichier MD », images gérées : le .md et un dossier images/ dans un ZIP)
// ---------------------------------------------------------------------------

/**
 * Décale les titres Markdown de `n` niveaux (plafond `######`), hors des
 * blocs de code : un document rangé sous son chapitre garde sa hiérarchie.
 */
export function decalerTitres(markdown: string, n: number): string {
  let dansCode = false
  return markdown
    .split('\n')
    .map((ligne) => {
      if (/^\s*(```|~~~)/.test(ligne)) {
        dansCode = !dansCode
        return ligne
      }
      if (dansCode) return ligne
      const m = /^(#{1,6})(\s.*|$)/.exec(ligne)
      if (!m) return ligne
      return `${'#'.repeat(Math.min(6, m[1].length + n))}${m[2]}`
    })
    .join('\n')
}

/**
 * Le classeur entier en UN texte Markdown : nom du classeur en `#`, chaque
 * chapitre en `##` (numéroté, avec sa description), chaque élément en `###`
 * et le contenu des documents décalé de deux niveaux.
 */
export function classeurEnMarkdown(
  classeurName: string,
  chapters: readonly DbChapter[],
  content: ChapterContent,
  periodicites: readonly DbPeriodicite[] = [],
  numerotation: 'position' | 'sort_order' = 'position',
): string {
  const nom = classeurName.trim() || NOM_CLASSEUR_REPLI
  const tries = [...chapters].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )
  const blocs: string[] = [`# ${nom}`]
  tries.forEach((ch, index) => {
    const desc = ch.description.trim()
    blocs.push(
      `## ${String(numerotation === 'sort_order' ? ch.sort_order : index + 1)}. ${ch.label.trim() || SANS_TITRE}${desc === '' ? '' : `\n\n${desc}`}`,
    )
    for (const item of flattenItems(contenuDuChapitre(content, ch.id))) {
      if (item.data.deleted_at !== null) continue
      // Chaque rendu commence par `# titre` : décalé de deux, il devient
      // `### titre` sous le chapitre.
      blocs.push(decalerTitres(elementEnMarkdown(item, periodicites).trim(), 2))
    }
  })
  return `${blocs.join('\n\n')}\n`
}

/**
 * L'archive du fichier unique : `<classeur>.md` à la racine et, s'il y a
 * des images lisibles, le dossier `images/` à côté.
 */
export async function construireMarkdownUnique(
  classeurName: string,
  chapters: readonly DbChapter[],
  content: ChapterContent,
  options: OptionsArchive = {},
): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const ids = new Set(chapters.map((c) => c.id))
  const images = options.lireImage
    ? await ajouterImages(
        zip,
        content.documents.filter((d) => ids.has(d.chapter_id)),
        options.lireImage,
      )
    : new Set<string>()
  const brut = classeurEnMarkdown(
    classeurName,
    chapters,
    content,
    options.periodicites ?? [],
    options.numerotation,
  )
  const texte = options.avecImages === false ? retirerImages(brut) : brut
  zip.file(
    `${nomBase(classeurName)}.md`,
    images.size > 0
      ? redirigerImages(texte, images, `${DOSSIER_IMAGES}/`)
      : texte,
  )
  const octets = await zip.generateAsync({ type: 'uint8array' })
  return new Blob([octets as BlobPart], { type: 'application/zip' })
}

function nomBase(classeurName: string): string {
  return (
    sanitizeFilename(classeurName.trim() || NOM_CLASSEUR_REPLI) ||
    NOM_CLASSEUR_REPLI
  )
}

// ---------------------------------------------------------------------------
// Export au choix (2026-11-13, demande utilisateur : « un seul bouton avec
// une fenêtre de choix… si c'est que du Markdown, pas besoin d'archive »)
// ---------------------------------------------------------------------------

export type FormeExport = 'unique' | 'dossiers'

export interface ChoixExport {
  forme: FormeExport
  avecImages: boolean
}

/** Ce qu'on exporte : tout le classeur, ou un seul chapitre. */
export interface PorteeExport {
  classeurName: string
  chapters: readonly DbChapter[]
  content: ChapterContent
  /** Un seul chapitre : son nom entre dans celui du fichier. */
  chapitre?: DbChapter
}

/** Nombre d'images (distinctes) référencées par les documents de la portée. */
export function nombreImages(portee: PorteeExport): number {
  const ids = new Set(portee.chapters.map((c) => c.id))
  const chemins = new Set<string>()
  for (const d of portee.content.documents) {
    if (d.deleted_at !== null || !ids.has(d.chapter_id)) continue
    for (const c of imagesReferencees(d.content)) chemins.add(c)
  }
  return chemins.size
}

/** Le fichier que l'on obtiendra, pour le dire avant de télécharger. */
export function fichierExport(
  portee: PorteeExport,
  choix: ChoixExport,
): { nom: string; archive: boolean } {
  const base =
    sanitizeFilename(
      portee.chapitre
        ? `${portee.classeurName.trim() || NOM_CLASSEUR_REPLI} - ${portee.chapitre.label}`
        : portee.classeurName.trim() || NOM_CLASSEUR_REPLI,
    ) || NOM_CLASSEUR_REPLI
  const archive =
    choix.forme === 'dossiers' || (choix.avecImages && nombreImages(portee) > 0)
  return { nom: `${base}.${archive ? 'zip' : 'md'}`, archive }
}

/**
 * Télécharge l'export choisi : un `.md` seul quand il n'y a qu'un fichier
 * et aucune image à joindre, sinon une archive ZIP.
 */
export async function exporterMarkdown(
  portee: PorteeExport,
  choix: ChoixExport,
  periodicites: readonly DbPeriodicite[] = [],
  lireImage: (chemin: string) => Promise<Blob> = telechargerImage,
): Promise<void> {
  const { nom, archive } = fichierExport(portee, choix)
  const numerotation = portee.chapitre ? 'sort_order' : 'position'
  if (!archive) {
    const brut = classeurEnMarkdown(
      portee.classeurName,
      portee.chapters,
      portee.content,
      periodicites,
      numerotation,
    )
    telechargerTexte(nom, choix.avecImages ? brut : retirerImages(brut))
    return
  }
  const options: OptionsArchive = {
    periodicites,
    numerotation,
    avecImages: choix.avecImages,
    lireImage: choix.avecImages ? lireImage : undefined,
  }
  const blob =
    choix.forme === 'unique'
      ? await construireMarkdownUnique(
          portee.classeurName,
          portee.chapters,
          portee.content,
          options,
        )
      : await construireArchiveMarkdown(
          portee.chapters,
          portee.content,
          options,
        )
  telechargerBlob(nom, blob)
}

// ---------------------------------------------------------------------------
// Points d'entrée (téléchargement)
// ---------------------------------------------------------------------------

/** Un document seul → `<titre>.md`. */
export function exporterDocumentMarkdown(titre: string, contenu: string): void {
  const nom = `${sanitizeFilename(titre.trim() || SANS_TITRE) || SANS_TITRE}.md`
  telechargerTexte(nom, documentEnMarkdown(titre, contenu))
}

/**
 * Un seul chapitre → `<classeur> - <chapitre>.zip`, dossier numéroté par
 * son `sort_order` (comme la page chapitre de Registre).
 */
export async function exporterChapitreZip(
  classeurName: string,
  chapter: DbChapter,
  content: ChapterContent,
  periodicites: readonly DbPeriodicite[] = [],
): Promise<void> {
  const base = `${classeurName.trim() || NOM_CLASSEUR_REPLI} - ${chapter.label}`
  const nom = `${sanitizeFilename(base) || NOM_CLASSEUR_REPLI}.zip`
  const blob = await construireArchiveMarkdown([chapter], content, {
    periodicites,
    numerotation: 'sort_order',
    lireImage: telechargerImage,
  })
  telechargerBlob(nom, blob)
}

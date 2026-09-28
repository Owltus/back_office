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

  tries.forEach((ch, index) => {
    const numero = numerotation === 'sort_order' ? ch.sort_order : index + 1
    const dossier = zip.folder(nomDossierChapitre(numero, ch.label))
    if (!dossier) return

    const items = flattenItems(contenuDuChapitre(content, ch.id))
    items.forEach((item, i) => {
      dossier.file(
        nomFichierElement(i + 1, item.data.title),
        elementEnMarkdown(item, periodicites),
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
// Points d'entrée (téléchargement)
// ---------------------------------------------------------------------------

/** Un document seul → `<titre>.md`. */
export function exporterDocumentMarkdown(titre: string, contenu: string): void {
  const nom = `${sanitizeFilename(titre.trim() || SANS_TITRE) || SANS_TITRE}.md`
  telechargerTexte(nom, documentEnMarkdown(titre, contenu))
}

/** Un classeur entier → `<classeur>.zip`, dossiers numérotés par position. */
export async function exporterClasseurZip(
  classeurName: string,
  chapters: readonly DbChapter[],
  content: ChapterContent,
  periodicites: readonly DbPeriodicite[] = [],
): Promise<void> {
  const nom = `${sanitizeFilename(classeurName.trim() || NOM_CLASSEUR_REPLI) || NOM_CLASSEUR_REPLI}.zip`
  const blob = await construireArchiveMarkdown(chapters, content, {
    periodicites,
    numerotation: 'position',
  })
  telechargerBlob(nom, blob)
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
  })
  telechargerBlob(nom, blob)
}

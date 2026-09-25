import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import {
  construireArchiveMarkdown,
  documentEnMarkdown,
  feuilleSignatureEnMarkdown,
  feuilleSuiviEnMarkdown,
  intercalaireEnMarkdown,
  nomDossierChapitre,
  nomFichierElement,
} from '#/lib/classeur/exportMarkdown.ts'
import type {
  ChapterContent,
  DbChapter,
  DbDocument,
  DbIntercalaire,
  DbPeriodicite,
  DbSignatureSheet,
  DbTrackingSheet,
} from '#/lib/classeur/types.ts'

/*
 * L'archive est RELUE avec JSZip et son arborescence comparée à la liste
 * exacte attendue : un dossier renommé, un fichier dénuméroté ou un
 * élément oublié fait échouer le test.
 */

const HORODATAGE = {
  deleted_at: null,
  created_at: '2026-09-25T10:00:00Z',
  updated_at: '2026-09-25T10:00:00Z',
}

function chapitre(id: number, label: string, sort_order: number): DbChapter {
  return {
    id,
    uuid: `ch-${id}`,
    classeur_id: 1,
    label,
    icon: 'FileText',
    description: '',
    sort_order,
    ...HORODATAGE,
  }
}

const PERIODICITES: DbPeriodicite[] = [
  { id: 1, label: 'Mensuel', nombre: 8, sort_order: 1 },
  { id: 6, label: 'Triennal', nombre: 4, sort_order: 6 },
  { id: 9, label: 'Non défini', nombre: 8, sort_order: 9 },
]

// Deux chapitres, passés dans le DÉSORDRE : l'archive doit les trier.
const CHAPITRES: DbChapter[] = [
  chapitre(20, 'Gaz : contrôles', 2),
  chapitre(10, 'Sécurité incendie', 1),
]

const DOCUMENT: DbDocument = {
  id: 100,
  uuid: 'doc-100',
  chapter_id: 10,
  title: 'Consignes d’évacuation',
  description: '',
  content: 'Sortir **calmement**.\n\n| Étage | Issue |\n| --- | --- |\n| 1 | A |\n',
  sort_order: 2,
  ...HORODATAGE,
}

const SUIVI: DbTrackingSheet = {
  id: 200,
  uuid: 'ts-200',
  chapter_id: 10,
  title: 'Vérification des extincteurs',
  periodicite_id: 6,
  sort_order: 1,
  ...HORODATAGE,
}

const SIGNATURE: DbSignatureSheet = {
  id: 300,
  uuid: 'ss-300',
  chapter_id: 20,
  title: 'Émargement formation',
  description: 'Personnel présent',
  nombre: 3,
  sort_order: 1,
  ...HORODATAGE,
}

const INTERCALAIRE: DbIntercalaire = {
  id: 400,
  uuid: 'ic-400',
  chapter_id: 20,
  title: 'Rapports externes',
  description: 'Classer ici les rapports du bureau de contrôle.',
  sort_order: 2,
  ...HORODATAGE,
}

const CONTENU: ChapterContent = {
  documents: [DOCUMENT],
  tracking_sheets: [SUIVI],
  signature_sheets: [SIGNATURE],
  intercalaires: [INTERCALAIRE],
}

async function relire(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer())
}

/** Chemins de l'archive, dossiers compris, triés. */
function chemins(zip: JSZip): string[] {
  return Object.keys(zip.files).sort()
}

describe('construireArchiveMarkdown — arborescence exacte', () => {
  it('un dossier « N - Libellé » par chapitre, un fichier « N - Titre.md » par élément', async () => {
    const blob = await construireArchiveMarkdown(CHAPITRES, CONTENU, {
      periodicites: PERIODICITES,
    })
    expect(blob.type).toBe('application/zip')

    const zip = await relire(blob)
    expect(chemins(zip)).toEqual([
      '1 - Sécurité incendie/',
      '1 - Sécurité incendie/1 - Vérification des extincteurs.md',
      '1 - Sécurité incendie/2 - Consignes d’évacuation.md',
      '2 - Gaz contrôles/',
      '2 - Gaz contrôles/1 - Émargement formation.md',
      '2 - Gaz contrôles/2 - Rapports externes.md',
    ])
  })

  it('le document porte son titre en tête, puis son Markdown intact', async () => {
    const zip = await relire(await construireArchiveMarkdown(CHAPITRES, CONTENU))
    const texte = await zip
      .file('1 - Sécurité incendie/2 - Consignes d’évacuation.md')!
      .async('string')
    expect(texte).toBe(
      '# Consignes d’évacuation\n\nSortir **calmement**.\n\n| Étage | Issue |\n| --- | --- |\n| 1 | A |\n',
    )
  })

  it('la feuille de suivi devient un tableau vide aux lignes de sa périodicité', async () => {
    const zip = await relire(
      await construireArchiveMarkdown(CHAPITRES, CONTENU, {
        periodicites: PERIODICITES,
      }),
    )
    const texte = await zip
      .file('1 - Sécurité incendie/1 - Vérification des extincteurs.md')!
      .async('string')
    expect(texte).toBe(
      [
        '# Vérification des extincteurs',
        '',
        'Périodicité : Triennal',
        '',
        '| Date | Note | Signature |',
        '| --- | --- | --- |',
        '|   |   |   |',
        '|   |   |   |',
        '|   |   |   |',
        '|   |   |   |',
        '',
      ].join('\n'),
    )
  })

  it('la feuille de signature et l’intercalaire sont rendus', async () => {
    const zip = await relire(await construireArchiveMarkdown(CHAPITRES, CONTENU))
    const signature = await zip
      .file('2 - Gaz contrôles/1 - Émargement formation.md')!
      .async('string')
    expect(signature).toBe(
      [
        '# Émargement formation',
        '',
        'Personnel présent',
        '',
        '| Date | Nom / Prénom | Signature |',
        '| --- | --- | --- |',
        '|   |   |   |',
        '|   |   |   |',
        '|   |   |   |',
        '',
      ].join('\n'),
    )
    const intercalaire = await zip
      .file('2 - Gaz contrôles/2 - Rapports externes.md')!
      .async('string')
    expect(intercalaire).toBe(
      '# Rapports externes\n\nClasser ici les rapports du bureau de contrôle.\n',
    )
  })

  it('numérotation par `sort_order` : un chapitre seul garde son rang', async () => {
    const zip = await relire(
      await construireArchiveMarkdown([CHAPITRES[0]], CONTENU, {
        numerotation: 'sort_order',
      }),
    )
    expect(chemins(zip)).toEqual([
      '2 - Gaz contrôles/',
      '2 - Gaz contrôles/1 - Émargement formation.md',
      '2 - Gaz contrôles/2 - Rapports externes.md',
    ])
  })

  it('un chapitre vide donne un dossier vide, un contenu étranger est ignoré', async () => {
    const zip = await relire(
      await construireArchiveMarkdown([chapitre(99, 'Vide', 1)], CONTENU),
    )
    expect(chemins(zip)).toEqual(['1 - Vide/'])
  })
})

describe('rendus Markdown unitaires', () => {
  it('documentEnMarkdown ne double pas un titre déjà présent', () => {
    expect(documentEnMarkdown('Titre', '# Déjà là\n\ncorps')).toBe('# Déjà là\n\ncorps')
    expect(documentEnMarkdown('Titre', '\n\n# Déjà là')).toBe('\n\n# Déjà là')
  })

  it('documentEnMarkdown ajoute le titre sinon (« ## » ou « #tag » ne comptent pas)', () => {
    expect(documentEnMarkdown('Titre', '## Sous-titre')).toBe('# Titre\n\n## Sous-titre\n')
    expect(documentEnMarkdown('Titre', '#tag')).toBe('# Titre\n\n#tag\n')
    expect(documentEnMarkdown('  ', '')).toBe('# Sans titre\n')
  })

  it('feuilleSuiviEnMarkdown : périodicité inconnue = 8 lignes sans sous-titre', () => {
    const texte = feuilleSuiviEnMarkdown('Suivi', undefined)
    expect(texte.startsWith('# Suivi\n\n| Date | Note | Signature |\n')).toBe(true)
    expect(texte.match(/\| {3}\| {3}\| {3}\|/g)).toHaveLength(8)
  })

  it('feuilleSuiviEnMarkdown : « Non défini » n’affiche pas de périodicité', () => {
    expect(feuilleSuiviEnMarkdown('S', PERIODICITES[2])).not.toContain('Périodicité')
    expect(feuilleSuiviEnMarkdown('S', PERIODICITES[0])).toContain('Périodicité : Mensuel')
  })

  it('feuilleSignatureEnMarkdown sans description, intercalaire sans description', () => {
    expect(feuilleSignatureEnMarkdown('S', '  ', 1)).toBe(
      '# S\n\n| Date | Nom / Prénom | Signature |\n| --- | --- | --- |\n|   |   |   |\n',
    )
    expect(intercalaireEnMarkdown('I', '')).toBe('# I\n')
  })

  it('noms nettoyés : caractères interdits retirés, « Sans titre » par défaut', () => {
    expect(nomDossierChapitre(3, 'A/B: C?')).toBe('3 - AB C')
    expect(nomFichierElement(1, '')).toBe('1 - Sans titre.md')
    expect(nomFichierElement(2, ' Un <titre> ')).toBe('2 - Un titre.md')
  })
})

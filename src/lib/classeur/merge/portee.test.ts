import { describe, expect, it } from 'vitest'

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
  signature,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'
import { planifierChangements } from '#/lib/classeur/merge/changements.ts'
import {
  construireExportChapitre,
  construireExportDocument,
  extraireJson,
  lignesImport,
  lirePortee,
} from '#/lib/classeur/merge/portee.ts'
import {
  construireExport,
  parseImportJson,
} from '#/lib/classeur/merge/schema.ts'

/*
 * Export d'un chapitre ou d'un document (portee.ts). Ce qui compte :
 *   - le fichier embarque sa portée et les consignes pour un LLM ;
 *   - les réglages des feuilles se lisent en clair dans l'aperçu.
 */

const A = chapitre({ id: 10, label: 'Accueil', sort_order: 1 })
const B = chapitre({ id: 20, label: 'Sécurité', sort_order: 2 })
const docA1 = document({
  id: 1,
  chapter_id: 10,
  title: 'Check-in',
  content: 'Ancien texte',
  sort_order: 1,
})
const docA2 = document({
  id: 2,
  chapter_id: 10,
  title: 'Check-out',
  sort_order: 2,
})
const suiviA = suivi({
  id: 3,
  chapter_id: 10,
  title: 'Contrôle',
  sort_order: 3,
})
const docB = document({
  id: 4,
  chapter_id: 20,
  title: 'Incendie',
  sort_order: 1,
})
const local = () =>
  etat([A, B], { documents: [docA1, docA2, docB], tracking_sheets: [suiviA] })

const aller = (e: unknown) => parseImportJson(JSON.stringify(e))
const exportA = () =>
  construireExportChapitre(classeur(), A, local().content, PERIODICITES)

describe('export d’un chapitre', () => {
  it('ne contient que ce chapitre, avec sa portée et les consignes', () => {
    const f = exportA()
    expect(f.chapters).toHaveLength(1)
    expect(f.chapters[0].uuid).toBe(A.uuid)
    expect(f.chapters[0].items.map((i) => i.title)).toEqual([
      'Check-in',
      'Check-out',
      'Contrôle',
    ])
    expect(f._metadata.portee).toEqual({
      type: 'chapitre',
      chapitre_uuid: A.uuid,
      chapitre_label: 'Accueil',
    })
    expect(f._metadata.instructions.join('\n')).toMatch(/Ne modifie JAMAIS/)
    expect(f._metadata.instructions.join('\n')).toMatch(/===/)
    // Toujours lisible par l'import standard, et la portée se relit.
    expect(aller(f).chapters[0].label).toBe('Accueil')
    expect(lirePortee(JSON.stringify(f))).toEqual(f._metadata.portee)
  })

  it('un fichier de classeur complet n’a pas de portée', () => {
    expect(
      lirePortee(JSON.stringify({ format_version: 2, chapters: [] })),
    ).toBe(null)
    expect(lirePortee('pas du json')).toBe(null)
  })
})

describe('export d’un document', () => {
  it('ne contient que ce document, avec sa portée', () => {
    const brut = construireExportDocument(classeur(), A, docA1, PERIODICITES)
    expect(brut.chapters[0].items).toHaveLength(1)
    expect(brut.chapters[0].items[0].uuid).toBe(docA1.uuid)
    expect(brut._metadata.portee).toMatchObject({
      type: 'document',
      document_uuid: docA1.uuid,
    })
  })
})

describe('extraireJson', () => {
  it('retire les balises et les phrases autour du JSON collé', () => {
    const json = '{"format_version":2,"chapters":[]}'
    expect(extraireJson('```json\n' + json + '\n```')).toBe(json)
    expect(
      extraireJson('Voici le fichier corrigé :\n' + json + '\nBonne journée !'),
    ).toBe(json)
    expect(extraireJson('  ' + json + '  ')).toBe(json)
    expect(() => extraireJson('rien ici')).toThrow(
      /ne contient pas de changements/,
    )
  })
})

describe('consignes LLM — les TROIS exports (classeur, chapitre, document)', () => {
  const lesExports = {
    classeur: construireExport(
      classeur(),
      [A, B],
      local().content,
      PERIODICITES,
    ),
    chapitre: construireExportChapitre(
      classeur(),
      A,
      local().content,
      PERIODICITES,
    ),
    document: construireExportDocument(classeur(), A, docA1, PERIODICITES),
  }

  it('portent tous les conventions de la page', () => {
    for (const [nom, e] of Object.entries(lesExports)) {
      const texte = (e._metadata?.instructions ?? []).join(' ')
      for (const convention of [
        'Ne modifie JAMAIS',
        '`===`',
        '`:::photos`',
        '`:::etape`',
        '[!WARNING]',
        '(a-inserer)',
        'entiere',
        'LÉGENDE',
        '"pleine"',
        'Conserve le CHEMIN',
      ]) {
        expect(texte, `${nom} : ${convention}`).toContain(convention)
      }
      // L'habillage (2026-09-30) est retiré : les consignes ne doivent plus
      // jamais le proposer, seulement dire de le remplacer.
      expect(texte, nom).not.toMatch(/position=(gauche|droite)/)
      expect(texte, nom).toMatch(/`\+\+\+` est obsolète/)
    }
  })

  it('chacun annonce SA portée', () => {
    expect(lesExports.classeur._metadata?.instructions?.[0]).toMatch(
      /en entier/,
    )
    const classeurTexte = (
      lesExports.classeur._metadata?.instructions ?? []
    ).join(' ')
    // Étape 2 du plan `classeur-echange-ia-2026-10-19` : la consigne de
    // réimport en REMPLACEMENT est retirée (l'import d'un fichier d'IA
    // n'impose plus ce choix, étape 5).
    expect(classeurTexte).not.toMatch(/REMPLACEMENT/)
    expect(classeurTexte).toMatch(/AJOUTER un chapitre/)
    expect(lesExports.chapitre._metadata.instructions[0]).toMatch(/chapitre/)
    expect(lesExports.document._metadata.instructions[0]).toMatch(
      /seul document/,
    )
  })

  it('les consignes survivent à la relecture du fichier (aller-retour)', () => {
    const relu = parseImportJson(JSON.stringify(lesExports.classeur))
    expect(relu._metadata?.instructions).toEqual(
      lesExports.classeur._metadata?.instructions,
    )
  })
})

describe('lignesImport — réglages en clair (étape 6, D4)', () => {
  it('périodicité et nombre de lignes : avant → après, valeur à la création', () => {
    const C = chapitre({ id: 10, label: 'Accueil' })
    const local = etat([C], {
      tracking_sheets: [suivi({ id: 3, chapter_id: 10, title: 'Relevé' })],
      signature_sheets: [
        signature({ id: 4, chapter_id: 10, title: 'Émargement', nombre: 14 }),
      ],
    })
    const f = construireExportChapitre(
      classeur(),
      C,
      local.content,
      PERIODICITES,
    )
    const [ts, sig] = f.chapters[0].items
    const plan = planifierChangements(
      local,
      classeur(),
      {
        portee: f._metadata.portee,
        periodicites: f._metadata.periodicites,
        avertissements: [],
        changements: [
          { action: 'modifier', uuid: ts.uuid, periodicite_id: 44 },
          { action: 'modifier', uuid: sig.uuid, nombre: 20 },
          {
            action: 'ajouter',
            kind: 'signature_sheet',
            title: 'Formation',
            nombre: 1,
          },
        ],
      },
      { type: 'chapitre', chapitreId: 10 },
    ).plan
    expect(lignesImport(local, plan).map((l) => l.reglage)).toEqual([
      'Mensuel → Annuel',
      '14 → 20 lignes',
      '1 ligne',
    ])
  })
})

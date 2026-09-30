import { describe, expect, it } from 'vitest'

import {
  PERIODICITES,
  T0,
  chJson,
  chapitre,
  classeur,
  document,
  etat,
  fichier,
  itJson,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import {
  construireExportChapitre,
  construireExportDocument,
  extraireJson,
  lirePortee,
  planifierFusionPortee,
} from '#/lib/classeur/merge/portee.ts'
import {
  construireExport,
  parseImportJson,
} from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'

/*
 * Export / réimport d'un chapitre ou d'un document (portee.ts). Ce qui compte :
 *   - le fichier embarque sa portée et les consignes pour un LLM ;
 *   - un texte retravaillé par un LLM (horodatage INCHANGÉ) est bien appliqué ;
 *   - rien HORS de la portée n'est jamais modifié ni supprimé.
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

describe('réimport d’un chapitre', () => {
  it('applique le texte d’un LLM même si son horodatage n’a pas bougé', () => {
    const f = aller(exportA())
    f.chapters[0].items[0].content = 'Texte retravaillé'
    // Une fusion ordinaire l'ignorerait (même updated_at) : c'est le piège.
    expect(
      planifierFusion(local(), f, { replace: false }).resultat.updated,
    ).toBe(0)
    const plan = planifierFusionPortee(
      local(),
      f,
      { type: 'chapitre', chapitreId: 10 },
      { supprimerAbsents: false },
    )
    const modif = plan.actions.find((a) => a.type === 'modifierItem')
    expect(modif).toMatchObject({
      type: 'modifierItem',
      id: 1,
      item: { kind: 'document', input: { content: 'Texte retravaillé' } },
    })
    // Horodatage du fichier NON recopié : la base datera la réimportation.
    expect(modif).not.toHaveProperty('updated_at')
    expect(plan.resultat.updated).toBe(1)
  })

  it('ne touche jamais aux autres chapitres ni à leurs éléments', () => {
    const f = aller(exportA())
    f.chapters[0].items = []
    const plan = planifierFusionPortee(
      local(),
      f,
      { type: 'chapitre', chapitreId: 10 },
      { supprimerAbsents: true },
    )
    expect(plan.actions.some((a) => a.type === 'supprimerChapitre')).toBe(false)
    const supprimes = plan.actions.flatMap((a) =>
      a.type === 'supprimerItem' ? [`${a.kind}:${a.id}`] : [],
    )
    expect(supprimes.sort()).toEqual([
      'document:1',
      'document:2',
      'tracking_sheet:3',
    ])
    expect(plan.resultat.deleted).toBe(3)
    expect(plan.apercu.filter((l) => l.action === 'delete')).toHaveLength(3)
  })

  it('sans l’option, un élément absent du fichier n’est PAS supprimé', () => {
    const f = aller(exportA())
    f.chapters[0].items = f.chapters[0].items.slice(0, 1)
    const plan = planifierFusionPortee(
      local(),
      f,
      { type: 'chapitre', chapitreId: 10 },
      { supprimerAbsents: false },
    )
    expect(plan.actions.some((a) => a.type === 'supprimerItem')).toBe(false)
    expect(plan.resultat.deleted).toBe(0)
  })

  it('crée un document ajouté sans uuid, dans ce chapitre', () => {
    const f = aller(exportA())
    f.chapters[0].items.push(
      itJson({
        kind: 'document',
        title: 'Nouveau',
        content: 'x',
        sort_order: 9,
      }),
    )
    const plan = planifierFusionPortee(
      local(),
      f,
      { type: 'chapitre', chapitreId: 10 },
      { supprimerAbsents: false },
    )
    expect(plan.actions).toContainEqual(
      expect.objectContaining({
        type: 'creerItem',
        chapitre: { type: 'local', id: 10 },
        uuid: null,
      }),
    )
  })

  it('garde la position du chapitre dans le classeur', () => {
    const f = aller(exportA())
    f.chapters[0].sort_order = 99
    f.chapters[0].description = 'Nouvelle description'
    const plan = planifierFusionPortee(
      local(),
      f,
      { type: 'chapitre', chapitreId: 10 },
      { supprimerAbsents: false },
    )
    const ch = plan.actions.find((a) => a.type === 'modifierChapitre')
    expect(ch).toMatchObject({ id: 10, description: 'Nouvelle description' })
    expect(ch).not.toHaveProperty('sort_order')
  })

  it('refuse un fichier d’un autre chapitre ou de plusieurs chapitres', () => {
    const f = aller(exportA())
    expect(() =>
      planifierFusionPortee(
        local(),
        f,
        { type: 'chapitre', chapitreId: 20 },
        { supprimerAbsents: false },
      ),
    ).toThrow(/autre chapitre/)
    const deux: ClasseurJson = fichier([
      chJson({ label: 'Accueil' }),
      chJson({ label: 'Sécurité' }),
    ])
    expect(() =>
      planifierFusionPortee(
        local(),
        deux,
        { type: 'chapitre', chapitreId: 10 },
        { supprimerAbsents: false },
      ),
    ).toThrow(/2 chapitres/)
  })
})

describe('export et réimport d’un document', () => {
  const exportDoc = () =>
    aller(construireExportDocument(classeur(), A, docA1, PERIODICITES))

  it('ne contient que ce document, avec sa portée', () => {
    const brut = construireExportDocument(classeur(), A, docA1, PERIODICITES)
    expect(brut.chapters[0].items).toHaveLength(1)
    expect(brut.chapters[0].items[0].uuid).toBe(docA1.uuid)
    expect(brut._metadata.portee).toMatchObject({
      type: 'document',
      document_uuid: docA1.uuid,
    })
  })

  it('ne modifie que ce document, jamais le chapitre ni sa position', () => {
    const f = exportDoc()
    f.chapters[0].label = 'Chapitre renommé par le LLM'
    f.chapters[0].items[0].content = 'Nouveau texte'
    f.chapters[0].items[0].sort_order = 50
    const plan = planifierFusionPortee(
      local(),
      f,
      { type: 'document', documentId: 1 },
      { supprimerAbsents: true },
    )
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]).toMatchObject({
      type: 'modifierItem',
      id: 1,
      item: { input: { content: 'Nouveau texte' } },
    })
    expect(plan.actions[0]).not.toHaveProperty('sort_order')
    expect(plan.actions[0]).not.toHaveProperty('updated_at')
    expect(plan.resultat).toMatchObject({ updated: 1, deleted: 0 })
  })

  it('sans changement : rien à appliquer', () => {
    const plan = planifierFusionPortee(
      local(),
      exportDoc(),
      { type: 'document', documentId: 1 },
      { supprimerAbsents: false },
    )
    expect(plan.actions).toHaveLength(0)
    expect(plan.resultat.unchanged).toBe(1)
  })

  it('refuse un autre document, un uuid retiré ou plusieurs éléments', () => {
    expect(() =>
      planifierFusionPortee(
        local(),
        exportDoc(),
        { type: 'document', documentId: 2 },
        { supprimerAbsents: false },
      ),
    ).toThrow(/autre document/)

    const sansUuid = exportDoc()
    delete sansUuid.chapters[0].items[0].uuid
    expect(() =>
      planifierFusionPortee(
        local(),
        sansUuid,
        { type: 'document', documentId: 1 },
        { supprimerAbsents: false },
      ),
    ).toThrow(/identifiant/)

    const deux = exportDoc()
    deux.chapters[0].items.push(itJson({ kind: 'document', title: 'Autre' }))
    expect(() =>
      planifierFusionPortee(
        local(),
        deux,
        { type: 'document', documentId: 1 },
        { supprimerAbsents: false },
      ),
    ).toThrow(/exactement un document/)
  })

  it('l’horodatage de l’export ne remonte pas en base', () => {
    const f = exportDoc()
    expect(f.chapters[0].items[0].updated_at).toBe(T0)
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
    expect(extraireJson('rien ici')).toBe('rien ici')
  })
})

describe('consignes LLM — les TROIS exports (classeur, chapitre, document)', () => {
  const exports = {
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
    for (const [nom, e] of Object.entries(exports)) {
      const texte = (e._metadata?.instructions ?? []).join(' ')
      for (const convention of [
        'Ne modifie JAMAIS',
        '`===`',
        '`+++`',
        'largeur=',
        'position=',
        'Conserve le CHEMIN',
      ]) {
        expect(texte, `${nom} : ${convention}`).toContain(convention)
      }
    }
  })

  it('chacun annonce SA portée', () => {
    expect(exports.classeur._metadata?.instructions?.[0]).toMatch(/en entier/)
    expect(exports.chapitre._metadata.instructions[0]).toMatch(/chapitre/)
    expect(exports.document._metadata.instructions[0]).toMatch(/seul document/)
  })

  it('les consignes survivent à la relecture du fichier (aller-retour)', () => {
    const relu = parseImportJson(JSON.stringify(exports.classeur))
    expect(relu._metadata?.instructions).toEqual(
      exports.classeur._metadata?.instructions,
    )
  })
})

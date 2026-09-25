import { describe, expect, it } from 'vitest'

import {
  DEFAUTS,
  SCHEMA_DESCRIPTIF,
  construireExport,
  estKindConnu,
  parseImportJson,
} from '#/lib/classeur/merge/schema.ts'
import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  intercalaire,
  signature,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'

/*
 * Oracles : les structs serde de `files.rs` (champs requis / optionnels /
 * `skip_serializing_if`), `CLASSEUR_SCHEMA` (défauts), `parse_import_json`
 * (versions 1 et 2 seules) et `do_export_json` (forme du fichier).
 */

/** Horodatage de suppression douce des fixtures. */
const T = '2026-02-02T00:00:00+00:00'

describe('parseImportJson — format v2 nominal', () => {
  it('lit un export v2 complet, _metadata.periodicites compris', () => {
    const texte = JSON.stringify({
      format_version: 2,
      _metadata: {
        description: 'x',
        generated_at: '2026-09-25T10:00:00Z',
        note: 'y',
        schema: { quelconque: true },
        periodicites: [{ id: 1, label: 'Mensuel', nombre: 8 }],
      },
      classeur: {
        name: 'A',
        icon: 'Shield',
        etablissement: 'E',
        etablissement_complement: 'C',
      },
      chapters: [
        {
          uid: 'securite',
          uuid: 'u-ch',
          label: 'Sécurité',
          icon: 'Flame',
          description: 'd',
          sort_order: 3,
          items: [
            {
              kind: 'tracking_sheet',
              uuid: 'u-it',
              title: 'Extincteurs',
              periodicite_id: 1,
              updated_at: '2026-09-01 10:00:00',
              sort_order: 2,
            },
          ],
        },
      ],
    })
    const f = parseImportJson(texte)
    expect(f.format_version).toBe(2)
    expect(f._metadata?.periodicites).toEqual([
      { id: 1, label: 'Mensuel', nombre: 8 },
    ])
    expect(f.classeur).toEqual({
      name: 'A',
      icon: 'Shield',
      etablissement: 'E',
      etablissement_complement: 'C',
    })
    expect(f.chapters[0]).toMatchObject({
      uid: 'securite',
      uuid: 'u-ch',
      sort_order: 3,
    })
    expect(f.chapters[0].items[0]).toEqual({
      kind: 'tracking_sheet',
      uuid: 'u-it',
      title: 'Extincteurs',
      periodicite_id: 1,
      updated_at: '2026-09-01 10:00:00',
      sort_order: 2,
    })
  })
})

describe('parseImportJson — format v1 et défauts du schéma', () => {
  it('accepte un v1 sans uuid ni updated_at ni _metadata, et dérive uid = slugify(label)', () => {
    // Oracle : schéma « Les fichiers v1 (sans uuid/updated_at) sont acceptés ».
    const f = parseImportJson(
      JSON.stringify({
        format_version: 1,
        classeur: {
          name: 'V1',
          icon: 'BookOpen',
          etablissement: '',
          etablissement_complement: '',
        },
        chapters: [
          {
            label: 'Sécurité incendie',
            items: [{ kind: 'document', title: 'Consignes' }],
          },
        ],
      }),
    )
    expect(f._metadata).toBeUndefined()
    const ch = f.chapters[0]
    expect(ch.uid).toBe('securite-incendie')
    expect(ch.uuid).toBeUndefined()
    expect(ch.icon).toBe(DEFAUTS.chapter.icon)
    expect(ch.description).toBe('')
    expect(ch.items[0]).toEqual({
      kind: 'document',
      title: 'Consignes',
      description: '',
      content: '',
      sort_order: 1,
    })
    expect('uuid' in ch.items[0]).toBe(false)
    expect('updated_at' in ch.items[0]).toBe(false)
  })

  it('applique les défauts du bloc classeur et de sort_order (position)', () => {
    const f = parseImportJson(
      JSON.stringify({
        format_version: 2,
        chapters: [{ label: 'A' }, { label: 'B' }],
      }),
    )
    expect(f.classeur).toEqual(DEFAUTS.classeur)
    expect(f.chapters.map((c) => c.sort_order)).toEqual([1, 2])
    expect(f.chapters[0].items).toEqual([])
  })

  it('ne garde que les champs de la nature : nombre 14 par défaut, pas de description sur un suivi', () => {
    // Oracle : `specific_fields` de CLASSEUR_SCHEMA par type.
    const f = parseImportJson(
      JSON.stringify({
        format_version: 2,
        chapters: [
          {
            label: 'A',
            items: [
              { kind: 'signature_sheet', title: 'S', nombre: null },
              { kind: 'tracking_sheet', title: 'T', description: 'parasite' },
              { kind: 'document', title: 'D', nombre: 3, periodicite_id: 1 },
              { kind: 'intercalaire', title: 'I', content: 'parasite' },
            ],
          },
        ],
      }),
    )
    const [s, t, d, i] = f.chapters[0].items
    expect(s).toEqual({
      kind: 'signature_sheet',
      title: 'S',
      description: '',
      nombre: 14,
      sort_order: 1,
    })
    expect(t).toEqual({ kind: 'tracking_sheet', title: 'T', sort_order: 2 })
    expect(d).toEqual({
      kind: 'document',
      title: 'D',
      description: '',
      content: '',
      sort_order: 3,
    })
    expect(i).toEqual({
      kind: 'intercalaire',
      title: 'I',
      description: '',
      sort_order: 4,
    })
  })

  it('laisse passer un type inconnu avec ses seuls champs communs (compatibilité ascendante)', () => {
    // Oracle : « Les types inconnus sont ignorés silencieusement » ; do_merge les compte ensuite.
    const f = parseImportJson(
      JSON.stringify({
        format_version: 2,
        chapters: [
          {
            label: 'A',
            items: [{ kind: 'video', title: 'V', url: 'x', sort_order: 7 }],
          },
        ],
      }),
    )
    expect(f.chapters[0].items[0]).toEqual({
      kind: 'video',
      title: 'V',
      sort_order: 7,
    })
    expect(estKindConnu('video')).toBe(false)
    expect(estKindConnu('document')).toBe(true)
  })
})

describe('parseImportJson — refus', () => {
  const cas: Array<[string, string, string]> = [
    ['JSON illisible', '{ pas du json', 'JSON valide'],
    ['pas un objet', '[1, 2]', 'objet attendu'],
    ['format_version absent', '{"chapters":[]}', 'format_version'],
    [
      'format_version 3',
      '{"format_version":3,"chapters":[]}',
      'plus récente (format 3)',
    ],
    ['format_version 0', '{"format_version":0,"chapters":[]}', 'non supportée'],
    ['chapters absent', '{"format_version":2}', "'chapters' absente"],
    [
      'chapitre sans label',
      '{"format_version":2,"chapters":[{"items":[]}]}',
      'aucun libellé',
    ],
    [
      'élément sans kind',
      '{"format_version":2,"chapters":[{"label":"A","items":[{"title":"x"}]}]}',
      "n'a pas de champ 'kind'",
    ],
    [
      'élément sans titre',
      '{"format_version":2,"chapters":[{"label":"A","items":[{"kind":"document"}]}]}',
      "n'a pas de titre",
    ],
    [
      'sort_order non entier',
      '{"format_version":2,"chapters":[{"label":"A","sort_order":"1"}]}',
      'nombre entier',
    ],
    [
      'items pas une liste',
      '{"format_version":2,"chapters":[{"label":"A","items":{}}]}',
      'doit être une liste',
    ],
  ]
  it.each(cas)('%s → message français lisible', (_nom, texte, attendu) => {
    // Oracle : parse_import_json refuse (« JSON invalide », « Version de format non supportée »).
    expect(() => parseImportJson(texte)).toThrow(attendu)
  })
})

describe('construireExport — forme exacte de do_export_json', () => {
  const chapters = [
    chapitre({ id: 2, label: 'Sécurité', sort_order: 2, uuid: 'u2' }),
    chapitre({
      id: 1,
      label: 'Securite',
      sort_order: 1,
      uuid: 'u1',
      icon: 'Flame',
      description: 'd',
    }),
    chapitre({ id: 3, label: 'Supprimé', sort_order: 3, deleted_at: T }),
  ]
  const content = {
    documents: [
      document({
        id: 10,
        chapter_id: 1,
        title: 'Doc',
        sort_order: 2,
        description: 'dd',
        content: '# x',
      }),
      document({ id: 11, chapter_id: 1, title: 'Effacé', deleted_at: T }),
    ],
    tracking_sheets: [
      suivi({
        id: 20,
        chapter_id: 1,
        title: 'Suivi',
        sort_order: 1,
        periodicite_id: 44,
      }),
    ],
    signature_sheets: [
      signature({
        id: 30,
        chapter_id: 2,
        title: 'Sig',
        nombre: 20,
        description: 'sd',
      }),
    ],
    intercalaires: [
      intercalaire({ id: 40, chapter_id: 1, title: 'Inter', sort_order: 3 }),
    ],
  }
  const date = new Date('2026-09-25T10:11:12.345Z')
  const exp = construireExport(
    classeur(),
    chapters,
    content,
    PERIODICITES,
    date,
  )

  it('en-tête : version 2, _metadata complet (schéma embarqué, périodicités par id, horodatage sans fraction)', () => {
    expect(exp.format_version).toBe(2)
    expect(exp._metadata?.schema).toEqual(SCHEMA_DESCRIPTIF)
    expect(exp._metadata?.generated_at).toBe('2026-09-25T10:11:12Z')
    expect(exp._metadata?.periodicites).toEqual([
      { id: 41, label: 'Mensuel', nombre: 8 },
      { id: 44, label: 'Annuel', nombre: 8 },
      { id: 49, label: 'Non défini', nombre: 8 },
    ])
    expect(exp.classeur).toEqual({
      name: 'Registre de sécurité',
      icon: 'Shield',
      etablissement: 'OKKO Nantes',
      etablissement_complement: '',
    })
  })

  it('chapitres : non supprimés, par sort_order, uid dédoublonné « -2 » comme slug_counts', () => {
    expect(exp.chapters.map((c) => c.uid)).toEqual(['securite', 'securite-2'])
    expect(exp.chapters.map((c) => c.uuid)).toEqual(['u1', 'u2'])
    expect(exp.chapters[0]).toMatchObject({
      label: 'Securite',
      icon: 'Flame',
      description: 'd',
      sort_order: 1,
    })
  })

  it('éléments : non supprimés, triés par sort_order toutes natures confondues, champs exacts par nature', () => {
    const items = exp.chapters[0].items
    expect(items.map((i) => i.title)).toEqual(['Suivi', 'Doc', 'Inter'])
    // Oracle : ItemJson serde — tracking_sheet sans description, signature_sheet avec nombre,
    // document avec description + content ; None jamais sérialisé.
    expect(Object.keys(items[0])).toEqual([
      'kind',
      'uuid',
      'title',
      'periodicite_id',
      'updated_at',
      'sort_order',
    ])
    expect(Object.keys(items[1])).toEqual([
      'kind',
      'uuid',
      'title',
      'description',
      'content',
      'updated_at',
      'sort_order',
    ])
    expect(Object.keys(items[2])).toEqual([
      'kind',
      'uuid',
      'title',
      'description',
      'updated_at',
      'sort_order',
    ])
    const sig = exp.chapters[1].items[0]
    expect(Object.keys(sig)).toEqual([
      'kind',
      'uuid',
      'title',
      'description',
      'nombre',
      'updated_at',
      'sort_order',
    ])
    expect(sig).toMatchObject({ nombre: 20, description: 'sd', uuid: 'sig-30' })
    expect(items[0]).toMatchObject({ periodicite_id: 44 })
  })

  it('export → JSON → parse rend un objet identique (aller-retour)', () => {
    expect(parseImportJson(JSON.stringify(exp))).toEqual(exp)
  })

  it('une icône de classeur vide prend le défaut BookOpen (COALESCE)', () => {
    const e = construireExport(classeur({ icon: '' }), [], content, [], date)
    expect(e.classeur.icon).toBe('BookOpen')
    expect(e.chapters).toEqual([])
  })
})

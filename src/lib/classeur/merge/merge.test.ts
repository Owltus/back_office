import { describe, expect, it } from 'vitest'

import {
  fichierPlusRecent,
  planifierFusion,
  resumerPlan,
} from '#/lib/classeur/merge/merge.ts'
import type { ActionFusion, PlanFusion } from '#/lib/classeur/merge/merge.ts'
import {
  construireExport,
  parseImportJson,
} from '#/lib/classeur/merge/schema.ts'
import {
  PERIODICITES,
  chJson,
  chapitre,
  classeur,
  document,
  etat,
  fichier,
  intercalaire,
  itJson,
  signature,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'

/*
 * Oracles : les règles R1…R12 de `do_merge` (files.rs, l. 746-1125) telles
 * que numérotées en tête de merge.ts, et les écarts assumés E1…E5. Chaque
 * `it` cite la règle qu'il vérifie. Aucune valeur attendue n'est recopiée
 * d'une sortie : elles se déduisent de la règle.
 */

const T_SUPPR = '2026-02-02T00:00:00+00:00'
const compteurs = (plan: PlanFusion) => plan.resultat
const types = (plan: PlanFusion) => plan.actions.map((a) => a.type)
const fusion = { replace: false }
const remplacement = { replace: true }

describe('R3/R10 — classeur vide + fichier : tout est inséré', () => {
  const f = fichier([
    chJson({
      label: 'Sécurité',
      uuid: 'u-sec',
      icon: 'Flame',
      description: 'd',
      sort_order: 9,
      items: [
        itJson({
          kind: 'document',
          title: 'Consignes',
          uuid: 'u-doc',
          content: '# a',
          sort_order: 3,
        }),
        itJson({
          kind: 'signature_sheet',
          title: 'Émargement',
          nombre: 20,
          sort_order: 1,
        }),
      ],
    }),
    chJson({
      label: 'Sanitaire',
      items: [itJson({ kind: 'intercalaire', title: 'Inter' })],
    }),
  ])
  const plan = planifierFusion(etat([]), f, fusion)

  it('compte 2 chapitres + 3 éléments en inserted, rien d’autre', () => {
    expect(compteurs(plan)).toEqual({
      inserted: 5,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      deleted: 0,
    })
    expect(plan.warnings).toEqual([])
    expect(plan.apercu.every((l) => l.action === 'insert')).toBe(true)
    expect(plan.apercu).toHaveLength(5)
  })

  it('crée chaque chapitre AVANT ses éléments, référencés par index de création', () => {
    expect(types(plan)).toEqual([
      'creerChapitre',
      'creerItem',
      'creerItem',
      'creerChapitre',
      'creerItem',
    ])
    const [ch0, it0, it1, ch1, it2] = plan.actions
    expect(ch0).toMatchObject({
      type: 'creerChapitre',
      index: 0,
      uuid: 'u-sec',
      label: 'Sécurité',
      icon: 'Flame',
      description: 'd',
    })
    expect(ch1).toMatchObject({ type: 'creerChapitre', index: 1, uuid: null })
    expect(it0).toMatchObject({
      type: 'creerItem',
      chapitre: { type: 'nouveau', index: 0 },
    })
    expect(it1).toMatchObject({
      type: 'creerItem',
      chapitre: { type: 'nouveau', index: 0 },
    })
    expect(it2).toMatchObject({
      type: 'creerItem',
      chapitre: { type: 'nouveau', index: 1 },
    })
  })

  it('R3 : les chapitres neufs vont en FIN (max local + 1), pas au sort_order du fichier', () => {
    // Vide : max = 0 → 1 puis 2. Le fichier disait 9 pour le premier.
    expect(plan.actions[0]).toMatchObject({ sort_order: 1 })
    expect(plan.actions[3]).toMatchObject({ sort_order: 2 })
    const local = etat([chapitre({ id: 1, label: 'Autre', sort_order: 5 })])
    const plan2 = planifierFusion(local, f, fusion)
    expect(plan2.actions[0]).toMatchObject({
      type: 'creerChapitre',
      sort_order: 6,
    })
  })

  it('R10 : un élément neuf garde le sort_order et l’uuid du fichier, champs de sa nature seulement', () => {
    expect(plan.actions[1]).toEqual({
      type: 'creerItem',
      chapitre: { type: 'nouveau', index: 0 },
      uuid: 'u-doc',
      sort_order: 3,
      item: {
        kind: 'document',
        input: { title: 'Consignes', description: '', content: '# a' },
      },
    })
    expect(plan.actions[2]).toMatchObject({
      uuid: null,
      sort_order: 1,
      item: {
        kind: 'signature_sheet',
        input: { title: 'Émargement', description: '', nombre: 20 },
      },
    })
  })
})

describe('R2/R9/R12 — le même fichier deux fois : tout inchangé (export réel → parse → fusion)', () => {
  const chapters = [
    chapitre({
      id: 1,
      label: 'Sécurité incendie',
      icon: 'Flame',
      description: 'x',
    }),
    chapitre({ id: 2, label: 'Sanitaire' }),
    chapitre({ id: 3, label: 'Effacé', deleted_at: T_SUPPR }),
  ]
  const content = {
    documents: [
      document({
        id: 10,
        chapter_id: 1,
        title: 'Consignes',
        content: '# a',
        updated_at: '2026-03-01T10:00:00+00:00',
      }),
      document({ id: 11, chapter_id: 1, title: 'Vieux', deleted_at: T_SUPPR }),
    ],
    tracking_sheets: [
      suivi({
        id: 20,
        chapter_id: 1,
        title: 'Extincteurs',
        periodicite_id: 44,
      }),
    ],
    signature_sheets: [
      signature({ id: 30, chapter_id: 2, title: 'Émargement', nombre: 20 }),
    ],
    intercalaires: [intercalaire({ id: 40, chapter_id: 2, title: 'Inter' })],
  }
  const local = etat(chapters, content)
  const exporte = construireExport(classeur(), chapters, content, PERIODICITES)
  const relu = parseImportJson(JSON.stringify(exporte))

  it.each([fusion, remplacement])(
    'mode %o : 2 chapitres + 4 éléments inchangés, aucune action',
    (opts) => {
      // Les supprimés ne sont pas exportés, donc ni comptés ni (en replace) re-supprimés.
      const plan = planifierFusion(local, relu, opts)
      expect(compteurs(plan)).toEqual({
        inserted: 0,
        updated: 0,
        unchanged: 6,
        skipped: 0,
        deleted: 0,
      })
      expect(plan.actions).toEqual([])
      expect(plan.warnings).toEqual([])
      // R12 : l'aperçu ne liste pas les inchangés.
      expect(plan.apercu).toEqual([])
    },
  )

  it('ne mute ni l’état local ni le fichier', () => {
    const avantLocal = JSON.stringify(local)
    const avantFichier = JSON.stringify(relu)
    planifierFusion(local, relu, remplacement)
    expect(JSON.stringify(local)).toBe(avantLocal)
    expect(JSON.stringify(relu)).toBe(avantFichier)
  })
})

describe('R7 — dernier écrit gagne (mode fusion)', () => {
  const local = etat([chapitre({ id: 1, label: 'A' })], {
    documents: [
      document({
        id: 10,
        chapter_id: 1,
        title: 'Ancien titre',
        updated_at: '2026-03-01T09:00:00+00:00',
      }),
    ],
  })
  const avec = (updated_at?: string) =>
    fichier([
      chJson({
        label: 'A',
        uuid: 'ch-1',
        items: [
          itJson({
            kind: 'document',
            title: 'Nouveau titre',
            uuid: 'doc-10',
            updated_at,
          }),
        ],
      }),
    ])

  it('fichier plus récent → update', () => {
    const plan = planifierFusion(
      local,
      avec('2026-03-01T11:00:00+00:00'),
      fusion,
    )
    expect(compteurs(plan)).toMatchObject({ updated: 1, unchanged: 1 })
    expect(plan.actions).toEqual([
      {
        type: 'modifierItem',
        id: 10,
        item: {
          kind: 'document',
          input: { title: 'Nouveau titre', description: '', content: '' },
        },
      },
    ])
    expect(plan.apercu).toEqual([
      {
        action: 'update',
        kind: 'document',
        title: 'Nouveau titre',
        chapter_label: 'A',
        icon: 'FileText',
      },
    ])
  })

  it('fichier plus ancien → unchanged, même si le contenu diffère (aucune action)', () => {
    const plan = planifierFusion(
      local,
      avec('2026-03-01T08:00:00+00:00'),
      fusion,
    )
    expect(compteurs(plan)).toMatchObject({ updated: 0, unchanged: 2 })
    expect(plan.actions).toEqual([])
  })

  it('horodatage égal → unchanged (strictement plus récent exigé : `json_ts > local_ts`)', () => {
    const plan = planifierFusion(
      local,
      avec('2026-03-01T09:00:00+00:00'),
      fusion,
    )
    expect(compteurs(plan)).toMatchObject({ updated: 0, unchanged: 2 })
  })

  it('horodatage absent du fichier → le fichier s’applique (`_ => true`)', () => {
    const plan = planifierFusion(local, avec(undefined), fusion)
    expect(types(plan)).toEqual(['modifierItem'])
  })

  it('horodatage absent en local → le fichier s’applique (`(Some, None) => true`)', () => {
    const sansDate = etat([chapitre({ id: 1, label: 'A' })], {
      documents: [
        document({
          id: 10,
          chapter_id: 1,
          title: 'Ancien titre',
          updated_at: '',
        }),
      ],
    })
    const plan = planifierFusion(sansDate, avec('2000-01-01T00:00:00Z'), fusion)
    expect(types(plan)).toEqual(['modifierItem'])
  })

  it('E4 : un horodatage SQLite (« 2026-03-01 10:00:00 », UTC) est comparé comme instant, pas comme chaîne', () => {
    // Lexicographiquement ' ' < 'T' ferait perdre le fichier ; comme instant, 10 h > 9 h.
    expect(
      fichierPlusRecent('2026-03-01 10:00:00', '2026-03-01T09:00:00+00:00'),
    ).toBe(true)
    expect(
      fichierPlusRecent('2026-03-01 08:00:00', '2026-03-01T09:00:00+00:00'),
    ).toBe(false)
    expect(
      fichierPlusRecent('2026-03-01T11:00:00+02:00', '2026-03-01T09:30:00Z'),
    ).toBe(false)
    // Illisible des deux côtés : repli lexicographique.
    expect(fichierPlusRecent('b', 'a')).toBe(true)
    expect(fichierPlusRecent('a', 'b')).toBe(false)
    const plan = planifierFusion(local, avec('2026-03-01 10:00:00'), fusion)
    expect(types(plan)).toEqual(['modifierItem'])
  })

  it('R8 : en mode remplacement les horodatages sont ignorés', () => {
    const plan = planifierFusion(
      local,
      avec('2000-01-01T00:00:00Z'),
      remplacement,
    )
    expect(types(plan)).toEqual(['modifierItem'])
  })
})

describe('R1/R2/R5 — appariement sans uuid (fichier v1) : slug du chapitre, puis nature + titre', () => {
  const local = etat(
    [chapitre({ id: 1, label: 'Sécurité incendie', icon: 'Flame' })],
    {
      documents: [
        document({ id: 10, chapter_id: 1, title: 'Consignes', content: '# a' }),
      ],
      intercalaires: [
        intercalaire({ id: 40, chapter_id: 1, title: 'Consignes' }),
      ],
    },
  )
  const v1 = fichier(
    [
      chJson({
        label: 'SECURITE INCENDIE',
        icon: 'Flame',
        items: [
          itJson({ kind: 'document', title: 'Consignes', content: '# a' }),
          itJson({ kind: 'intercalaire', title: 'Consignes' }),
          itJson({ kind: 'signature_sheet', title: 'Consignes' }),
        ],
      }),
    ],
    { format_version: 1 },
  )
  const plan = planifierFusion(local, v1, fusion)

  it('R1 : le chapitre est apparié par slugify(label) ; R2 : son libellé diffère → update', () => {
    expect(plan.actions[0]).toEqual({
      type: 'modifierChapitre',
      id: 1,
      label: 'SECURITE INCENDIE',
      icon: 'Flame',
      description: '',
    })
    expect(plan.apercu[0]).toEqual({
      action: 'update',
      kind: 'chapter',
      title: 'SECURITE INCENDIE',
      chapter_label: 'SECURITE INCENDIE',
      icon: 'Flame',
    })
  })

  it('R5/E2 : même titre + même nature → apparié (inchangé) ; même titre, autre nature → inséré', () => {
    expect(compteurs(plan)).toEqual({
      inserted: 1,
      updated: 1,
      unchanged: 2,
      skipped: 0,
      deleted: 0,
    })
    expect(types(plan)).toEqual(['modifierChapitre', 'creerItem'])
    expect(plan.actions[1]).toMatchObject({
      type: 'creerItem',
      chapitre: { type: 'local', id: 1 },
      item: { kind: 'signature_sheet' },
    })
  })

  it('R2 : un chapitre identique (label, icon, description) est inchangé sans action', () => {
    const plan2 = planifierFusion(
      local,
      fichier([chJson({ label: 'Sécurité incendie', icon: 'Flame' })]),
      fusion,
    )
    expect(plan2.actions).toEqual([])
    expect(compteurs(plan2)).toMatchObject({ unchanged: 1 })
  })

  it('R1 : l’uuid prime sur le slug (libellé complètement différent, même uuid → même chapitre)', () => {
    const plan3 = planifierFusion(
      local,
      fichier([chJson({ label: 'Renommé', uuid: 'ch-1', icon: 'Flame' })]),
      fusion,
    )
    expect(plan3.actions).toEqual([
      {
        type: 'modifierChapitre',
        id: 1,
        label: 'Renommé',
        icon: 'Flame',
        description: '',
      },
    ])
  })
})

describe('E1/R1 — chapitre supprimé localement puis présent dans le fichier', () => {
  const local = etat(
    [
      chapitre({
        id: 1,
        label: 'Sécurité',
        deleted_at: T_SUPPR,
        sort_order: 4,
      }),
      chapitre({ id: 2, label: 'Vivant', sort_order: 1 }),
    ],
    {
      documents: [
        document({ id: 10, chapter_id: 1, title: 'Doc', deleted_at: T_SUPPR }),
      ],
    },
  )

  it('avec uuid → restauré (compté insert), et ses éléments visent le chapitre local', () => {
    const f = fichier([
      chJson({
        label: 'Sécurité',
        uuid: 'ch-1',
        items: [itJson({ kind: 'document', title: 'Neuf' })],
      }),
    ])
    const plan = planifierFusion(local, f, fusion)
    expect(plan.actions[0]).toEqual({
      type: 'restaurerChapitre',
      id: 1,
      label: 'Sécurité',
      icon: 'FileText',
      description: '',
    })
    expect(plan.actions[1]).toMatchObject({
      type: 'creerItem',
      chapitre: { type: 'local', id: 1 },
    })
    expect(compteurs(plan)).toEqual({
      inserted: 2,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      deleted: 0,
    })
    expect(plan.apercu[0]).toMatchObject({ action: 'insert', kind: 'chapter' })
  })

  it('sans uuid → le slug ne cherche que parmi les non supprimés : nouveau chapitre', () => {
    const plan = planifierFusion(
      local,
      fichier([chJson({ label: 'Sécurité' })]),
      fusion,
    )
    // R3 : max des sort_order NON supprimés = 1 → 2 (le 4 du supprimé ne compte pas).
    expect(plan.actions).toEqual([
      {
        type: 'creerChapitre',
        index: 0,
        uuid: null,
        label: 'Sécurité',
        icon: 'FileText',
        description: '',
        sort_order: 2,
      },
    ])
  })
})

describe('R5/R6 — éléments appariés par uuid : autre chapitre, supprimés', () => {
  const local = etat(
    [chapitre({ id: 1, label: 'A' }), chapitre({ id: 2, label: 'B' })],
    {
      documents: [
        document({ id: 10, chapter_id: 1, title: 'Doc', content: 'v1' }),
        document({
          id: 11,
          chapter_id: 1,
          title: 'Effacé',
          deleted_at: T_SUPPR,
        }),
      ],
    },
  )

  it('R5 : trouvé par uuid dans un AUTRE chapitre → mis à jour sur place, jamais déplacé', () => {
    const f = fichier([
      chJson({
        label: 'B',
        uuid: 'ch-2',
        items: [
          itJson({
            kind: 'document',
            title: 'Doc',
            uuid: 'doc-10',
            content: 'v2',
          }),
        ],
      }),
    ])
    const plan = planifierFusion(local, f, fusion)
    expect(plan.actions).toEqual([
      {
        type: 'modifierItem',
        id: 10,
        item: {
          kind: 'document',
          input: { title: 'Doc', description: '', content: 'v2' },
        },
      },
    ])
    expect(compteurs(plan)).toMatchObject({ updated: 1, inserted: 0 })
  })

  it('R6 fusion : supprimé localement → skip (ni recréé, ni restauré)', () => {
    const f = fichier([
      chJson({
        label: 'A',
        uuid: 'ch-1',
        items: [itJson({ kind: 'document', title: 'Effacé', uuid: 'doc-11' })],
      }),
    ])
    const plan = planifierFusion(local, f, fusion)
    expect(plan.actions).toEqual([])
    expect(compteurs(plan)).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 1,
      skipped: 1,
      deleted: 0,
    })
    expect(plan.apercu).toEqual([
      {
        action: 'skip',
        kind: 'document',
        title: 'Effacé',
        chapter_label: 'A',
        icon: 'FileText',
      },
    ])
  })

  it('R6 remplacement : supprimé localement → restauré tel quel, compté insert', () => {
    const f = fichier([
      chJson({
        label: 'A',
        uuid: 'ch-1',
        items: [
          itJson({
            kind: 'document',
            title: 'Effacé',
            uuid: 'doc-11',
            content: 'ignoré',
          }),
          itJson({
            kind: 'document',
            title: 'Doc',
            uuid: 'doc-10',
            content: 'v1',
          }),
        ],
      }),
      chJson({ label: 'B', uuid: 'ch-2' }),
    ])
    const plan = planifierFusion(local, f, remplacement)
    expect(plan.actions).toEqual([
      { type: 'restaurerItem', kind: 'document', id: 11 },
    ])
    expect(compteurs(plan)).toEqual({
      inserted: 1,
      updated: 0,
      unchanged: 3,
      skipped: 0,
      deleted: 0,
    })
  })

  it('R5 : un uuid porté par un élément d’une autre nature n’apparie pas (repli, puis insertion)', () => {
    const f = fichier([
      chJson({
        label: 'A',
        uuid: 'ch-1',
        items: [
          itJson({ kind: 'intercalaire', title: 'Autre', uuid: 'doc-10' }),
        ],
      }),
    ])
    const plan = planifierFusion(local, f, fusion)
    expect(types(plan)).toEqual(['creerItem'])
  })
})

describe('R11 — mode remplacement : les orphelins locaux sont supprimés (douce)', () => {
  const local = etat(
    [
      chapitre({ id: 1, label: 'Gardé', icon: 'Flame', sort_order: 1 }),
      chapitre({ id: 2, label: 'Orphelin', icon: 'Trash', sort_order: 2 }),
      chapitre({
        id: 3,
        label: 'Déjà supprimé',
        deleted_at: T_SUPPR,
        sort_order: 3,
      }),
    ],
    {
      documents: [
        document({ id: 10, chapter_id: 1, title: 'Reste' }),
        document({ id: 11, chapter_id: 1, title: 'Part', sort_order: 12 }),
        document({ id: 12, chapter_id: 3, title: 'Dans un chapitre supprimé' }),
      ],
      signature_sheets: [
        signature({
          id: 30,
          chapter_id: 2,
          title: 'Part aussi',
          sort_order: 30,
        }),
      ],
      intercalaires: [
        intercalaire({
          id: 40,
          chapter_id: 1,
          title: 'Déjà parti',
          deleted_at: T_SUPPR,
        }),
      ],
    },
  )
  const f = fichier([
    chJson({
      label: 'Gardé',
      uuid: 'ch-1',
      icon: 'Flame',
      items: [itJson({ kind: 'document', title: 'Reste', uuid: 'doc-10' })],
    }),
  ])

  it('supprime les éléments non appariés (même dans un chapitre supprimé) puis les chapitres, dans l’ordre local', () => {
    const plan = planifierFusion(local, f, remplacement)
    expect(plan.actions).toEqual([
      { type: 'supprimerItem', kind: 'document', id: 11 },
      { type: 'supprimerItem', kind: 'document', id: 12 },
      { type: 'supprimerItem', kind: 'signature_sheet', id: 30 },
      { type: 'supprimerChapitre', id: 2 },
    ] satisfies ActionFusion[])
    // 1 chapitre + 1 élément inchangés ; 3 éléments + 1 chapitre supprimés ; les déjà supprimés ne comptent pas.
    expect(compteurs(plan)).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 2,
      skipped: 0,
      deleted: 4,
    })
  })

  it('l’aperçu des suppressions porte le chapitre LOCAL (vide pour un chapitre supprimé)', () => {
    const plan = planifierFusion(local, f, remplacement)
    expect(plan.apercu).toEqual([
      {
        action: 'delete',
        kind: 'document',
        title: 'Part',
        chapter_label: 'Gardé',
        icon: 'Flame',
      },
      {
        action: 'delete',
        kind: 'document',
        title: 'Dans un chapitre supprimé',
        chapter_label: '',
        icon: '',
      },
      {
        action: 'delete',
        kind: 'signature_sheet',
        title: 'Part aussi',
        chapter_label: 'Orphelin',
        icon: 'Trash',
      },
      {
        action: 'delete',
        kind: 'chapter',
        title: 'Orphelin',
        chapter_label: 'Orphelin',
        icon: 'Trash',
      },
    ])
  })

  it('le mode fusion ne supprime jamais (« no_deletion »)', () => {
    const plan = planifierFusion(local, f, fusion)
    expect(plan.actions).toEqual([])
    expect(compteurs(plan).deleted).toBe(0)
  })
})

describe('E3 — periodicite_id apparié par LIBELLÉ via _metadata.periodicites', () => {
  const meta = {
    description: '',
    generated_at: '',
    note: '',
    schema: null,
    periodicites: [
      { id: 1, label: 'Mensuel', nombre: 8 },
      { id: 4, label: 'Annuel', nombre: 8 },
      { id: 7, label: 'Hebdomadaire', nombre: 12 },
    ],
  }
  const local = etat([chapitre({ id: 1, label: 'A' })], {
    tracking_sheets: [
      suivi({ id: 20, chapter_id: 1, title: 'Existant', periodicite_id: 44 }),
    ],
  })
  const avecMeta = (items: ReturnType<typeof itJson>[]) =>
    fichier([chJson({ label: 'A', uuid: 'ch-1', items })], { _metadata: meta })

  it('création : id 4 « Annuel » du fichier → id 44 local ; id 1 « Mensuel » → 41', () => {
    const plan = planifierFusion(
      local,
      avecMeta([
        itJson({ kind: 'tracking_sheet', title: 'Neuf', periodicite_id: 4 }),
        itJson({ kind: 'tracking_sheet', title: 'Neuf 2', periodicite_id: 1 }),
      ]),
      fusion,
    )
    expect(
      plan.actions.map((a) => (a.type === 'creerItem' ? a.item.input : null)),
    ).toEqual([
      { title: 'Neuf', periodicite_id: 44 },
      { title: 'Neuf 2', periodicite_id: 41 },
    ])
    expect(plan.warnings).toEqual([])
  })

  it('mise à jour : l’existant à 44 reçoit l’id 4 « Annuel » → inchangé (les ids diffèrent, le libellé non)', () => {
    const plan = planifierFusion(
      local,
      avecMeta([
        itJson({
          kind: 'tracking_sheet',
          title: 'Existant',
          uuid: 'ts-20',
          periodicite_id: 4,
        }),
      ]),
      fusion,
    )
    expect(plan.actions).toEqual([])
    expect(compteurs(plan)).toMatchObject({ unchanged: 2 })
  })

  it('libellé inconnu localement : l’existant conserve sa périodicité, le neuf reçoit « Non défini », avec avertissement', () => {
    const plan = planifierFusion(
      local,
      avecMeta([
        itJson({
          kind: 'tracking_sheet',
          title: 'Existant',
          uuid: 'ts-20',
          periodicite_id: 7,
        }),
        itJson({ kind: 'tracking_sheet', title: 'Neuf', periodicite_id: 7 }),
      ]),
      fusion,
    )
    expect(plan.actions).toEqual([
      expect.objectContaining({
        type: 'creerItem',
        item: {
          kind: 'tracking_sheet',
          input: { title: 'Neuf', periodicite_id: 49 },
        },
      }),
    ])
    expect(compteurs(plan)).toMatchObject({ inserted: 1, unchanged: 2 })
    expect(plan.warnings).toHaveLength(2)
    expect(plan.warnings[0]).toContain("'Hebdomadaire'")
    expect(plan.warnings[0]).toContain('conservée')
    expect(plan.warnings[1]).toContain('par défaut')
  })

  it('sans _metadata (v1) : l’id est pris tel quel s’il existe localement, sinon défaut + avertissement', () => {
    const sansMeta = fichier([
      chJson({
        label: 'A',
        uuid: 'ch-1',
        items: [
          itJson({ kind: 'tracking_sheet', title: 'X', periodicite_id: 41 }),
          itJson({ kind: 'tracking_sheet', title: 'Y', periodicite_id: 7 }),
        ],
      }),
    ])
    const plan = planifierFusion(local, sansMeta, fusion)
    expect(
      plan.actions.map((a) => (a.type === 'creerItem' ? a.item.input : null)),
    ).toEqual([
      { title: 'X', periodicite_id: 41 },
      { title: 'Y', periodicite_id: 49 },
    ])
    expect(plan.warnings).toEqual([
      "Feuille de suivi 'Y' : périodicité n° 7 inconnue dans cette base, périodicité par défaut appliquée",
    ])
  })

  it('sans référentiel local fourni : l’id est copié tel quel (comportement Rust)', () => {
    const plan = planifierFusion(
      etat([chapitre({ id: 1, label: 'A' })], {}, null),
      fichier([
        chJson({
          label: 'A',
          uuid: 'ch-1',
          items: [
            itJson({ kind: 'tracking_sheet', title: 'X', periodicite_id: 7 }),
          ],
        }),
      ]),
      fusion,
    )
    expect(plan.actions[0]).toMatchObject({
      item: { input: { periodicite_id: 7 } },
    })
  })

  it('référentiel local vide et périodicité absente du fichier : création impossible → skip', () => {
    const plan = planifierFusion(
      etat([chapitre({ id: 1, label: 'A' })], {}, []),
      fichier([
        chJson({
          label: 'A',
          uuid: 'ch-1',
          items: [itJson({ kind: 'tracking_sheet', title: 'X' })],
        }),
      ]),
      fusion,
    )
    expect(plan.actions).toEqual([])
    expect(compteurs(plan)).toMatchObject({ skipped: 1 })
    expect(plan.apercu).toEqual([
      {
        action: 'skip',
        kind: 'tracking_sheet',
        title: 'X',
        chapter_label: 'A',
        icon: 'FileText',
      },
    ])
  })
})

describe('R4 — éléments ignorés : type inconnu, titre vide', () => {
  const f = fichier([
    chJson({
      label: 'A',
      items: [
        itJson({ kind: 'video', title: 'Clip' }),
        itJson({ kind: 'document', title: '   ' }),
        itJson({ kind: 'document', title: 'Valide' }),
      ],
    }),
  ])
  const plan = planifierFusion(etat([]), f, fusion)

  it('compte 2 skipped avec les avertissements du Rust, et n’émet aucune action pour eux', () => {
    expect(compteurs(plan)).toEqual({
      inserted: 2,
      updated: 0,
      unchanged: 0,
      skipped: 2,
      deleted: 0,
    })
    expect(plan.warnings).toEqual([
      "Chapitre 'A': item de type inconnu 'video' ignoré",
      "Chapitre 'A': item sans titre ignoré",
    ])
    expect(types(plan)).toEqual(['creerChapitre', 'creerItem'])
    expect(plan.apercu.slice(1, 3)).toEqual([
      {
        action: 'skip',
        kind: 'video',
        title: 'Clip',
        chapter_label: 'A',
        icon: 'FileText',
      },
      {
        action: 'skip',
        kind: 'document',
        title: '(sans titre)',
        chapter_label: 'A',
        icon: 'FileText',
      },
    ])
  })
})

describe('R9 — comparaison champ à champ par nature', () => {
  const local = etat([chapitre({ id: 1, label: 'A' })], {
    signature_sheets: [
      signature({ id: 30, chapter_id: 1, title: 'S', nombre: 14 }),
    ],
    intercalaires: [
      intercalaire({ id: 40, chapter_id: 1, title: 'I', description: 'd' }),
    ],
  })

  it('signature : nombre absent du fichier vaut 14 (défaut du schéma) → inchangé ; 20 → update', () => {
    const p1 = planifierFusion(
      local,
      fichier([
        chJson({
          label: 'A',
          uuid: 'ch-1',
          items: [itJson({ kind: 'signature_sheet', title: 'S' })],
        }),
      ]),
      fusion,
    )
    expect(p1.actions).toEqual([])
    const p2 = planifierFusion(
      local,
      fichier([
        chJson({
          label: 'A',
          uuid: 'ch-1',
          items: [itJson({ kind: 'signature_sheet', title: 'S', nombre: 20 })],
        }),
      ]),
      fusion,
    )
    expect(p2.actions).toEqual([
      {
        type: 'modifierItem',
        id: 30,
        item: {
          kind: 'signature_sheet',
          input: { title: 'S', description: '', nombre: 20 },
        },
      },
    ])
  })

  it('intercalaire : description absente du fichier vaut "" → diffère de "d" → update', () => {
    const plan = planifierFusion(
      local,
      fichier([
        chJson({
          label: 'A',
          uuid: 'ch-1',
          items: [itJson({ kind: 'intercalaire', title: 'I' })],
        }),
      ]),
      fusion,
    )
    expect(plan.actions).toEqual([
      {
        type: 'modifierItem',
        id: 40,
        item: { kind: 'intercalaire', input: { title: 'I', description: '' } },
      },
    ])
  })
})

describe('resumerPlan', () => {
  const plan = (r: Partial<PlanFusion['resultat']>): PlanFusion => ({
    actions: [],
    apercu: [],
    warnings: [],
    resultat: {
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      deleted: 0,
      ...r,
    },
  })

  it('énumère ajouts, modifications, inchangés ; suppressions et ignorés seulement s’il y en a', () => {
    expect(resumerPlan(plan({ inserted: 3, updated: 2, unchanged: 12 }))).toBe(
      '3 ajouts, 2 modifications, 12 inchangés',
    )
    expect(
      resumerPlan(
        plan({ inserted: 1, updated: 1, unchanged: 1, deleted: 1, skipped: 4 }),
      ),
    ).toBe('1 ajout, 1 modification, 1 inchangé, 1 suppression, 4 ignorés')
    expect(resumerPlan(plan({}))).toBe('Aucun élément à fusionner')
  })
})

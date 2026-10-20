import { describe, expect, it } from 'vitest'

import {
  PERIODICITES,
  chJson,
  chapitre,
  classeur,
  document,
  etat,
  fichier,
  itJson,
  intercalaire,
  signature,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'
import type {
  ActionFusion,
  ChampsItem,
  PlanFusion,
} from '#/lib/classeur/merge/merge.ts'
import {
  alignerApercu,
  cleAction,
  clesActions,
  construireExportChapitre,
  filtrerPlan,
  lignesImport,
  planifierFusionPortee,
} from '#/lib/classeur/merge/portee.ts'
import type { LigneImport } from '#/lib/classeur/merge/portee.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'

/*
 * Refus d'un élément à l'import JSON (étape 1 du plan
 * `classeur-fonctions-2026-10-04`) — exemples écrits À LA MAIN (valeurs
 * attendues posées avant d'exécuter le code). Les lois générales sont dans
 * `exclusion.property.test.ts`.
 */

const doc = (input: {
  title: string
  description?: string
  content?: string
}): ChampsItem => ({
  kind: 'document',
  input: { description: '', content: '', ...input },
})

describe('cleAction / clesActions (D13)', () => {
  it('kind:id pour une modification, une restauration, une suppression', () => {
    expect(
      cleAction({ type: 'modifierItem', id: 7, item: doc({ title: 'A' }) }),
    ).toBe('document:7')
    expect(
      cleAction({
        type: 'restaurerItem',
        id: 8,
        item: { kind: 'intercalaire', input: { title: 'I', description: '' } },
        chapitre: { type: 'local', id: 1 },
        sort_order: 2,
      }),
    ).toBe('intercalaire:8')
    expect(
      cleAction({ type: 'supprimerItem', kind: 'tracking_sheet', id: 9 }),
    ).toBe('tracking_sheet:9')
  })

  it('position + titre pour une création, null pour un chapitre', () => {
    expect(
      cleAction({
        type: 'creerItem',
        chapitre: { type: 'local', id: 1 },
        uuid: null,
        sort_order: 3,
        item: doc({ title: 'Annexe' }),
      }),
    ).toBe('nouveau:document:3:Annexe')
    const chapitres: ActionFusion[] = [
      {
        type: 'creerChapitre',
        index: 0,
        uuid: null,
        label: 'L',
        icon: '',
        description: '',
        sort_order: 1,
      },
      {
        type: 'modifierChapitre',
        id: 1,
        label: 'L',
        icon: '',
        description: '',
      },
      {
        type: 'restaurerChapitre',
        id: 1,
        label: 'L',
        icon: '',
        description: '',
      },
    ]
    for (const a of chapitres) expect(cleAction(a)).toBeNull()
    // Mise à la corbeille d'un chapitre (2026-10-20) : refusable.
    expect(cleAction({ type: 'supprimerChapitre', id: 1 })).toBe('chapitre:1')
  })

  it('deux créations identiques : la seconde porte #2, la troisième #3', () => {
    const creer = (title: string, sort_order: number): ActionFusion => ({
      type: 'creerItem',
      chapitre: { type: 'local', id: 1 },
      uuid: null,
      sort_order,
      item: doc({ title }),
    })
    expect(
      clesActions([
        {
          type: 'modifierChapitre',
          id: 1,
          label: 'L',
          icon: '',
          description: '',
        },
        creer('X', 1),
        creer('X', 1),
        creer('Y', 1),
        creer('X', 2),
        creer('X', 1),
      ]),
    ).toEqual([
      null,
      'nouveau:document:1:X',
      'nouveau:document:1:X#2',
      'nouveau:document:1:Y',
      'nouveau:document:2:X',
      'nouveau:document:1:X#3',
    ])
  })
})

// ---------------------------------------------------------------------------

const A = chapitre({ id: 10, label: 'Accueil' })
const d1 = document({
  id: 1,
  chapter_id: 10,
  title: 'Check-in',
  description: 'Arrivée',
  content: 'Accueillir\nRemettre la clé',
  sort_order: 1,
  version_majeure: 2,
  version_mineure: 3,
})
const d2 = document({
  id: 2,
  chapter_id: 10,
  title: 'Check-out',
  content: 'Rendre la clé',
  sort_order: 2,
})
const d3 = document({
  id: 3,
  chapter_id: 10,
  title: 'Ancien',
  content: 'À jeter',
  sort_order: 3,
})
const local = etat([A], { documents: [d1, d2, d3] })

/** Le JSON du chapitre, retravaillé comme le ferait un LLM. */
function fichierRetravaille() {
  const f = parseImportJson(
    JSON.stringify(
      construireExportChapitre(classeur(), A, local.content, PERIODICITES),
    ),
  )
  const items = f.chapters[0].items
  items[0].content = 'Accueillir avec le sourire\nRemettre la clé'
  items[1].sort_order = 5 // Check-out déplacé, texte inchangé
  f.chapters[0].items = [
    items[0],
    items[1],
    // Ancien : gardé dans le fichier, marqué pour la corbeille (2026-10-20).
    { ...items[2], supprimer: true },
    {
      kind: 'document',
      title: 'Nouveau',
      description: '',
      content: 'L1\nL2',
      sort_order: 4,
    },
  ]
  f.chapters[0].label = 'Accueil et départ'
  return f
}

describe('lignesImport : avant / après de chaque action', () => {
  const plan = planifierFusionPortee(local, fichierRetravaille(), {
    type: 'chapitre',
    chapitreId: 10,
  })
  const lignes = lignesImport(local, plan)
  const parCle = new Map(lignes.map((l) => [l.cle, l]))

  it('le chapitre : ligne sans case, libellé avant → après', () => {
    const ch = parCle.get(null) as LigneImport
    expect(ch.genre).toBe('chapitre')
    expect(ch.kind).toBe('chapter')
    expect(ch.titre).toBe('Accueil et départ')
    expect(ch.avant.title).toBe('Accueil')
    expect(ch.apres.title).toBe('Accueil et départ')
    expect(ch.changement).toBe('texte')
    expect(ch.ordreChange).toBe(false)
    expect(ch.numero).toBeNull()
  })

  it('une modification de texte : ancien contenu, nouveau contenu, numéro actuel', () => {
    const l = parCle.get('document:1') as LigneImport
    expect(l.genre).toBe('modification')
    expect(l.titre).toBe('Check-in')
    expect(l.avant).toEqual({
      title: 'Check-in',
      description: 'Arrivée',
      content: 'Accueillir\nRemettre la clé',
    })
    expect(l.apres).toEqual({
      title: 'Check-in',
      description: 'Arrivée',
      content: 'Accueillir avec le sourire\nRemettre la clé',
    })
    expect(l.changement).toBe('texte')
    expect(l.ordreChange).toBe(false)
    expect(l.numero).toEqual({ majeure: 2, mineure: 3 })
  })

  it('un document seulement déplacé : « ordre », textes identiques', () => {
    const l = parCle.get('document:2') as LigneImport
    expect(l.genre).toBe('modification')
    expect(l.changement).toBe('ordre')
    expect(l.ordreChange).toBe(true)
    expect(l.avant).toEqual(l.apres)
    expect(l.numero).toEqual({ majeure: 1, mineure: 0 })
  })

  it('une création : rien avant, le texte entier après', () => {
    const l = parCle.get('nouveau:document:4:Nouveau') as LigneImport
    expect(l.genre).toBe('creation')
    expect(l.avant).toEqual({ title: '', description: '', content: '' })
    expect(l.apres).toEqual({
      title: 'Nouveau',
      description: '',
      content: 'L1\nL2',
    })
    expect(l.changement).toBe('texte')
    expect(l.ordreChange).toBe(false)
    expect(l.numero).toBeNull()
  })

  it('une suppression : le texte retiré, rien après', () => {
    const l = parCle.get('document:3') as LigneImport
    expect(l.genre).toBe('suppression')
    expect(l.titre).toBe('Ancien')
    expect(l.avant.content).toBe('À jeter')
    expect(l.apres).toEqual({ title: '', description: '', content: '' })
    expect(l.ordreChange).toBe(false)
    expect(l.numero).toBeNull()
  })

  it('cinq lignes, dans l’ordre du plan', () => {
    expect(lignes.map((l) => l.cle)).toEqual([
      null,
      'document:1',
      'document:2',
      'nouveau:document:4:Nouveau',
      'document:3',
    ])
  })
})

describe('lignesImport : autres familles et cas limites', () => {
  it('feuille de suivi : périodicité changée = « autre », sans texte changé', () => {
    const s = suivi({
      id: 5,
      chapter_id: 10,
      title: 'Contrôle',
      periodicite_id: 41,
    })
    const loc = etat([A], { tracking_sheets: [s] })
    const plan: PlanFusion = {
      actions: [
        {
          type: 'modifierItem',
          id: 5,
          item: {
            kind: 'tracking_sheet',
            input: { title: 'Contrôle', periodicite_id: 44 },
          },
          sort_order: 2,
        },
      ],
      resultat: {
        inserted: 0,
        updated: 1,
        unchanged: 0,
        skipped: 0,
        deleted: 0,
      },
      apercu: [],
      warnings: [],
    }
    const [l] = lignesImport(loc, plan)
    expect(l.changement).toBe('autre')
    expect(l.ordreChange).toBe(true)
    expect(l.avant).toEqual({ title: 'Contrôle', description: '', content: '' })
    expect(l.numero).toBeNull()
  })

  it('feuille de suivi : même périodicité, seul l’ordre change = « ordre »', () => {
    const s = suivi({
      id: 5,
      chapter_id: 10,
      title: 'Contrôle',
      periodicite_id: 41,
    })
    const loc = etat([A], { tracking_sheets: [s] })
    const [l] = lignesImport(loc, {
      actions: [
        {
          type: 'modifierItem',
          id: 5,
          item: {
            kind: 'tracking_sheet',
            input: { title: 'Contrôle', periodicite_id: 41 },
          },
          chapitre: { type: 'local', id: 10 },
        },
      ],
      resultat: {
        inserted: 0,
        updated: 1,
        unchanged: 0,
        skipped: 0,
        deleted: 0,
      },
      apercu: [],
      warnings: [],
    })
    expect(l.changement).toBe('ordre')
    expect(l.ordreChange).toBe(true)
  })

  it('feuille de signature : nombre de lignes changé = « autre »', () => {
    const s = signature({
      id: 6,
      chapter_id: 10,
      title: 'Émargement',
      nombre: 14,
    })
    const loc = etat([A], { signature_sheets: [s] })
    const action = (nombre: number): ActionFusion => ({
      type: 'modifierItem',
      id: 6,
      item: {
        kind: 'signature_sheet',
        input: { title: 'Émargement', description: '', nombre },
      },
      sort_order: 3,
    })
    const plan = (a: ActionFusion): PlanFusion => ({
      actions: [a],
      resultat: {
        inserted: 0,
        updated: 1,
        unchanged: 0,
        skipped: 0,
        deleted: 0,
      },
      apercu: [],
      warnings: [],
    })
    expect(lignesImport(loc, plan(action(20)))[0].changement).toBe('autre')
    expect(lignesImport(loc, plan(action(14)))[0].changement).toBe('ordre')
  })

  it('identifiant adopté (uuid) sans autre changement = « autre », pas « déplacé »', () => {
    const i = intercalaire({ id: 7, chapter_id: 10, title: 'Partie 1' })
    const loc = etat([A], { intercalaires: [i] })
    const [l] = lignesImport(loc, {
      actions: [
        {
          type: 'modifierItem',
          id: 7,
          item: {
            kind: 'intercalaire',
            input: { title: 'Partie 1', description: '' },
          },
          sort_order: 2,
          uuid: 'nouvel-uuid',
        },
      ],
      resultat: {
        inserted: 0,
        updated: 1,
        unchanged: 0,
        skipped: 0,
        deleted: 0,
      },
      apercu: [],
      warnings: [],
    })
    expect(l.changement).toBe('autre')
  })

  it('modification sans changement de place ni de texte = « autre »', () => {
    const loc = etat([A], { documents: [d2] })
    const [l] = lignesImport(loc, {
      actions: [
        {
          type: 'modifierItem',
          id: 2,
          item: doc({ title: 'Check-out', content: 'Rendre la clé' }),
        },
      ],
      resultat: {
        inserted: 0,
        updated: 1,
        unchanged: 0,
        skipped: 0,
        deleted: 0,
      },
      apercu: [],
      warnings: [],
    })
    expect(l.changement).toBe('autre')
    expect(l.ordreChange).toBe(false)
  })

  it('restauration : genre « restauration », jamais « ordre ambigu »', () => {
    const supprime = document({
      id: 4,
      chapter_id: 10,
      title: 'Revenu',
      content: 'Vieux',
      deleted_at: '2026-02-01T00:00:00+00:00',
    })
    const loc = etat([A], { documents: [supprime] })
    const [l] = lignesImport(loc, {
      actions: [
        {
          type: 'restaurerItem',
          id: 4,
          item: doc({ title: 'Revenu', content: 'Neuf' }),
          chapitre: { type: 'local', id: 10 },
          sort_order: 1,
        },
      ],
      resultat: {
        inserted: 1,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        deleted: 0,
      },
      apercu: [],
      warnings: [],
    })
    expect(l.genre).toBe('restauration')
    expect(l.avant.content).toBe('Vieux')
    expect(l.apres.content).toBe('Neuf')
    expect(l.ordreChange).toBe(false)
    expect(l.numero).toEqual({ majeure: 1, mineure: 0 })
  })

  it('élément inconnu localement : avant vide, sans numéro', () => {
    const [m, s] = lignesImport(etat([A]), {
      actions: [
        {
          type: 'modifierItem',
          id: 404,
          item: doc({ title: 'T', content: 'x' }),
        },
        { type: 'supprimerItem', kind: 'document', id: 405 },
      ],
      resultat: {
        inserted: 0,
        updated: 1,
        unchanged: 0,
        skipped: 0,
        deleted: 1,
      },
      apercu: [],
      warnings: [],
    })
    expect(m.avant).toEqual({ title: '', description: '', content: '' })
    expect(m.changement).toBe('texte')
    expect(m.numero).toBeNull()
    expect(s.titre).toBe('')
    expect(s.avant).toEqual({ title: '', description: '', content: '' })
  })

  it('chapitre créé ou restauré : lignes sans case ; mis à la corbeille : refusable', () => {
    const loc = etat([chapitre({ id: 11, label: 'Ancien', description: 'd' })])
    const lignes = lignesImport(loc, {
      actions: [
        {
          type: 'creerChapitre',
          index: 0,
          uuid: null,
          label: 'Neuf',
          icon: '',
          description: '',
          sort_order: 3,
        },
        {
          type: 'restaurerChapitre',
          id: 11,
          label: 'Ancien',
          icon: '',
          description: 'd',
          sort_order: 2,
        },
        { type: 'supprimerChapitre', id: 11 },
      ],
      resultat: {
        inserted: 2,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        deleted: 1,
      },
      apercu: [],
      warnings: [],
    })
    expect(
      lignes.map((l) => [l.cle, l.genre, l.titre, l.changement, l.ordreChange]),
    ).toEqual([
      [null, 'chapitre', 'Neuf', 'texte', false],
      [null, 'chapitre', 'Ancien', 'autre', false],
      ['chapitre:11', 'suppression', 'Ancien', 'texte', false],
    ])
    expect(lignes[0].avant).toEqual({ title: '', description: '', content: '' })
    expect(lignes[2].apres).toEqual({ title: '', description: '', content: '' })
    expect(lignes[2].avant).toEqual({
      title: 'Ancien',
      description: 'd',
      content: '',
    })
  })
})

// ---------------------------------------------------------------------------

describe('filtrerPlan : exemples', () => {
  const plan = planifierFusionPortee(local, fichierRetravaille(), {
    type: 'chapitre',
    chapitreId: 10,
  })

  it('le plan de départ (vérifié à la main)', () => {
    expect(plan.resultat).toEqual({
      inserted: 1,
      updated: 3,
      unchanged: 0,
      skipped: 0,
      deleted: 1,
    })
    expect(plan.apercu.map((l) => `${l.action}:${l.title}`)).toEqual([
      'update:Accueil et départ',
      'update:Check-in',
      'update:Check-out',
      'insert:Nouveau',
      'delete:Ancien',
    ])
  })

  it('refuser une modification : passe en inchangé, sa ligne d’aperçu part', () => {
    const { plan: p, ignores } = filtrerPlan(plan, new Set(['document:1']))
    expect(ignores).toBe(1)
    expect(p.resultat).toEqual({
      inserted: 1,
      updated: 2,
      unchanged: 1,
      skipped: 0,
      deleted: 1,
    })
    expect(p.apercu.map((l) => l.title)).toEqual([
      'Accueil et départ',
      'Check-out',
      'Nouveau',
      'Ancien',
    ])
    expect(p.warnings).toBe(plan.warnings)
  })

  it('refuser une création : passe en ignoré', () => {
    const { plan: p } = filtrerPlan(
      plan,
      new Set(['nouveau:document:4:Nouveau']),
    )
    expect(p.resultat).toEqual({
      inserted: 0,
      updated: 3,
      unchanged: 0,
      skipped: 1,
      deleted: 1,
    })
    expect(p.actions.some((a) => a.type === 'creerItem')).toBe(false)
  })

  it('refuser une suppression : passe en inchangé', () => {
    const { plan: p } = filtrerPlan(plan, new Set(['document:3']))
    expect(p.resultat).toEqual({
      inserted: 1,
      updated: 3,
      unchanged: 1,
      skipped: 0,
      deleted: 0,
    })
    expect(p.apercu.map((l) => l.action)).toEqual([
      'update',
      'update',
      'update',
      'insert',
    ])
  })

  it('refuser une restauration : passe en ignoré', () => {
    const p: PlanFusion = {
      actions: [
        {
          type: 'restaurerItem',
          id: 4,
          item: doc({ title: 'R' }),
          chapitre: { type: 'local', id: 10 },
          sort_order: 1,
        },
      ],
      resultat: {
        inserted: 1,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        deleted: 0,
      },
      apercu: [
        { action: 'insert', kind: 'document', title: 'R', chapter_label: 'A' },
      ],
      warnings: [],
    }
    const { plan: f, ignores } = filtrerPlan(p, new Set(['document:4']))
    expect(ignores).toBe(1)
    expect(f.actions).toEqual([])
    expect(f.apercu).toEqual([])
    expect(f.resultat).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 1,
      deleted: 0,
    })
  })

  it('aucun refus effectif (clé inconnue) : le MÊME plan est rendu', () => {
    const r = filtrerPlan(plan, new Set(['document:777']))
    expect(r.plan).toBe(plan)
    expect(r.ignores).toBe(0)
  })

  it('le chapitre ne se refuse pas : seul ce qui a une clé part', () => {
    const tout = new Set(
      clesActions(plan.actions).filter((k): k is string => k !== null),
    )
    const { plan: p, ignores } = filtrerPlan(plan, tout)
    expect(ignores).toBe(4)
    expect(p.actions.map((a) => a.type)).toEqual(['modifierChapitre'])
    expect(p.apercu.map((l) => l.kind)).toEqual(['chapter'])
  })
})

describe('alignerApercu', () => {
  it('saute les lignes « ignoré » et apparie par action et famille', () => {
    const actions: ActionFusion[] = [
      { type: 'modifierItem', id: 1, item: doc({ title: 'A' }) },
      { type: 'supprimerItem', kind: 'intercalaire', id: 2 },
    ]
    expect(
      alignerApercu(actions, [
        { action: 'skip', kind: 'document', title: 'X', chapter_label: '' },
        {
          action: 'update',
          kind: 'intercalaire',
          title: 'Y',
          chapter_label: '',
        },
        { action: 'update', kind: 'document', title: 'A', chapter_label: '' },
        { action: 'delete', kind: 'document', title: 'Z', chapter_label: '' },
        {
          action: 'delete',
          kind: 'intercalaire',
          title: 'B',
          chapter_label: '',
        },
      ]),
    ).toEqual([2, 4])
  })

  it('une action sans ligne rend −1 sans consommer la suite', () => {
    const actions: ActionFusion[] = [
      { type: 'supprimerChapitre', id: 1 },
      {
        type: 'creerChapitre',
        index: 0,
        uuid: null,
        label: 'C',
        icon: '',
        description: '',
        sort_order: 1,
      },
      {
        type: 'restaurerChapitre',
        id: 2,
        label: 'R',
        icon: '',
        description: '',
      },
      {
        type: 'creerItem',
        chapitre: { type: 'nouveau', index: 0 },
        uuid: null,
        sort_order: 1,
        item: doc({ title: 'D' }),
      },
    ]
    expect(
      alignerApercu(actions, [
        { action: 'insert', kind: 'chapter', title: 'C', chapter_label: '' },
        { action: 'insert', kind: 'chapter', title: 'R', chapter_label: '' },
        { action: 'insert', kind: 'document', title: 'D', chapter_label: '' },
      ]),
    ).toEqual([-1, 0, 1, 2])
  })

  it('une ligne ne sert qu’une fois', () => {
    const m: ActionFusion = {
      type: 'modifierItem',
      id: 1,
      item: doc({ title: 'A' }),
    }
    expect(
      alignerApercu(
        [m, m],
        [{ action: 'update', kind: 'document', title: 'A', chapter_label: '' }],
      ),
    ).toEqual([0, -1])
  })
})

describe('planifierFusionPortee(…, exclus) : document seul', () => {
  it('refuser le document : plan vide, compté inchangé', () => {
    const loc = etat([A], { documents: [d1] })
    const f = parseImportJson(
      JSON.stringify(
        fichier([
          chJson({
            label: 'Accueil',
            uuid: A.uuid,
            items: [
              itJson({
                kind: 'document',
                title: 'Check-in',
                uuid: d1.uuid,
                content: 'Autre',
              }),
            ],
          }),
        ]),
      ),
    )
    const cible = { type: 'document' as const, documentId: 1 }
    const plein = planifierFusionPortee(loc, f, cible)
    expect(clesActions(plein.actions)).toEqual(['document:1'])
    const vide = planifierFusionPortee(loc, f, cible, new Set(['document:1']))
    expect(vide.actions).toEqual([])
    expect(vide.apercu).toEqual([])
    expect(vide.resultat).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 1,
      skipped: 0,
      deleted: 0,
    })
  })
})

describe('compléments (mutants survivants de Stryker)', () => {
  const plan1 = (actions: ActionFusion[]): PlanFusion => ({
    actions,
    resultat: { inserted: 0, updated: 0, unchanged: 0, skipped: 0, deleted: 0 },
    apercu: [],
    warnings: [],
  })

  it('deux actions de chapitre : toutes deux sans clé (jamais « null#2 »)', () => {
    const m: ActionFusion = {
      type: 'modifierChapitre',
      id: 1,
      label: 'L',
      icon: '',
      description: '',
    }
    expect(clesActions([m, m, { type: 'supprimerChapitre', id: 2 }])).toEqual([
      null,
      null,
      'chapitre:2',
    ])
  })

  it('supprimerChapitre s’apparie à une ligne « delete » de chapitre', () => {
    expect(
      alignerApercu(
        [{ type: 'supprimerChapitre', id: 1 }],
        [
          { action: 'delete', kind: 'document', title: 'd', chapter_label: '' },
          { action: 'insert', kind: 'chapter', title: 'c', chapter_label: '' },
          { action: 'delete', kind: 'chapter', title: 'c', chapter_label: '' },
        ],
      ),
    ).toEqual([2])
  })

  it('seule la description change : « texte »', () => {
    const loc = etat([A], { documents: [d2] })
    const [l] = lignesImport(
      loc,
      plan1([
        {
          type: 'modifierItem',
          id: 2,
          item: doc({
            title: 'Check-out',
            description: 'Nouvelle',
            content: 'Rendre la clé',
          }),
          sort_order: 9,
        },
      ]),
    )
    expect(l.changement).toBe('texte')
  })

  it('suppression : changement « texte »', () => {
    const [l] = lignesImport(
      local,
      plan1([{ type: 'supprimerItem', kind: 'document', id: 3 }]),
    )
    expect(l.changement).toBe('texte')
    expect(l.genre).toBe('suppression')
  })

  it('élément inconnu localement, textes vides et place changée : « autre », jamais « ordre »', () => {
    const [l] = lignesImport(
      etat([A]),
      plan1([
        {
          type: 'modifierItem',
          id: 404,
          item: doc({ title: '' }),
          sort_order: 2,
        },
      ]),
    )
    expect(l.changement).toBe('autre')
  })

  it('chapitre : l’avant est lu sur le BON chapitre parmi plusieurs', () => {
    const loc = etat([
      chapitre({ id: 11, label: 'Premier' }),
      chapitre({ id: 12, label: 'Second', description: 'd2' }),
    ])
    const [l] = lignesImport(
      loc,
      plan1([
        {
          type: 'modifierChapitre',
          id: 12,
          label: 'Second bis',
          icon: '',
          description: 'd2',
        },
      ]),
    )
    expect(l.avant).toEqual({ title: 'Second', description: 'd2', content: '' })
  })

  it('réglages comparés seulement entre éléments de même famille', () => {
    // Un document local (sans périodicité) face à une action de feuille de
    // suivi de même id : les réglages ne se comparent pas.
    const loc = etat([A], {
      documents: [document({ id: 5, chapter_id: 10, title: 'Contrôle' })],
    })
    const [l] = lignesImport(
      loc,
      plan1([
        {
          type: 'modifierItem',
          id: 5,
          item: {
            kind: 'tracking_sheet',
            input: { title: 'Contrôle', periodicite_id: 44 },
          },
          sort_order: 2,
        },
      ]),
    )
    // La clé de l'action est `tracking_sheet:5` : aucun élément local apparié.
    expect(l.avant.title).toBe('')
  })
})

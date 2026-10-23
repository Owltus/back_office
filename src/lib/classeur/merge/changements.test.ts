import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
  signature,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'
import { executerPlan } from '#/lib/classeur/merge/apply.ts'
import type { Ecrivain } from '#/lib/classeur/merge/apply.ts'
import {
  MESSAGE_CLASSEUR_COMPLET,
  MESSAGE_ILLISIBLE,
  MESSAGE_SANS_CHANGEMENTS,
  clesChangeesDepuisExport,
  lireChangements,
  numeroter,
  planifierChangements,
  resumerImport,
} from '#/lib/classeur/merge/changements.ts'
import type {
  ChangementJson,
  ContexteImport,
  FichierChangements,
} from '#/lib/classeur/merge/changements.ts'
import type { ActionFusion } from '#/lib/classeur/merge/merge.ts'
import {
  chapitresDesLignes,
  clesActions,
  filtrerPlan,
  lignesImport,
} from '#/lib/classeur/merge/portee.ts'
import type { Portee } from '#/lib/classeur/merge/schema.ts'

/*
 * Import des changements d'un LLM (`changements.ts`, règles C1 à C9).
 * Valeurs attendues posées À LA MAIN avant d'exécuter le code ; les
 * propriétés de la numérotation sont en fin de fichier.
 */

const A = chapitre({ id: 10, label: 'Accueil', sort_order: 1 })
const B = chapitre({ id: 20, label: 'Sécurité', sort_order: 2 })
const d1 = document({
  id: 1,
  chapter_id: 10,
  title: 'Check-in',
  content: 'Arriver',
  sort_order: 1,
})
const d2 = document({
  id: 2,
  chapter_id: 10,
  title: 'Check-out',
  sort_order: 2,
})
const d3 = document({ id: 3, chapter_id: 10, title: 'Clés', sort_order: 3 })
const d4 = document({ id: 4, chapter_id: 20, title: 'Incendie', sort_order: 1 })
const ts5 = suivi({ id: 5, chapter_id: 20, title: 'Relevé', sort_order: 2 })
const sig6 = signature({
  id: 6,
  chapter_id: 20,
  title: 'Formation',
  sort_order: 3,
})
const vieux = document({
  id: 7,
  chapter_id: 10,
  title: 'Ancien',
  sort_order: 9,
  deleted_at: '2026-02-01T00:00:00+00:00',
})

const local = etat([A, B], {
  documents: [d1, d2, d3, d4, vieux],
  tracking_sheets: [ts5],
  signature_sheets: [sig6],
})

const PORTEE_CLASSEUR: Portee = {
  type: 'classeur',
  classeur_uuid: 'cl-uuid',
  classeur_name: 'Registre de sécurité',
}

function fichier(
  changements: ChangementJson[],
  portee: Portee | null = PORTEE_CLASSEUR,
): FichierChangements {
  return {
    changements,
    periodicites: PERIODICITES.map((p) => ({
      id: p.id,
      label: p.label,
      nombre: p.nombre,
    })),
    avertissements: [],
    ...(portee === null ? {} : { portee }),
  }
}

const CLASSEUR: ContexteImport = { type: 'classeur' }

function planDe(
  changements: ChangementJson[],
  options: {
    portee?: Portee | null
    contexte?: ContexteImport
    exclus?: ReadonlySet<string>
    etat?: typeof local
  } = {},
) {
  return planifierChangements(
    options.etat ?? local,
    classeur(),
    fichier(
      changements,
      options.portee === undefined ? PORTEE_CLASSEUR : options.portee,
    ),
    options.contexte ?? CLASSEUR,
    options.exclus,
  )
}

const types = (actions: ActionFusion[]) => actions.map((a) => a.type)

// ---------------------------------------------------------------------------

describe('lireChangements', () => {
  it('un classeur entier est refusé, avec la voie à suivre', () => {
    expect(() => lireChangements('{"format_version":2,"chapters":[]}')).toThrow(
      MESSAGE_CLASSEUR_COMPLET,
    )
    expect(MESSAGE_CLASSEUR_COMPLET).toMatch(/Points de restauration/)
  })

  it('un texte illisible ou sans liste : message pour la personne', () => {
    expect(() => lireChangements('pas du json')).toThrow(MESSAGE_ILLISIBLE)
    expect(() => lireChangements('{"a":1}')).toThrow(MESSAGE_SANS_CHANGEMENTS)
    expect(() => lireChangements('{"changements":{}}')).toThrow(
      MESSAGE_SANS_CHANGEMENTS,
    )
  })

  it('un changement mal écrit est signalé, pas bloquant', () => {
    const f = lireChangements(
      '{"changements":[1,{"action":"modifier","uuid":5,"title":"T","apres":3}]}',
    )
    expect(f.changements).toEqual([{}, { action: 'modifier', title: 'T' }])
    expect(f.avertissements).toEqual([
      'Le changement n° 1 est mal écrit : il est ignoré.',
      'Le changement n° 2 : une information est mal écrite, elle est ignorée.',
    ])
  })

  it('relit portée, périodicités, date d’export et `apres: null`', () => {
    const f = lireChangements(
      JSON.stringify({
        _metadata: {
          portee: PORTEE_CLASSEUR,
          periodicites: [{ id: 44, label: 'Annuel', nombre: 8 }],
          generated_at: '2026-10-23T08:00:00Z',
        },
        changements: [
          { action: 'deplacer', uuid: 'doc-3', title: 'Clés', apres: null },
        ],
      }),
    )
    expect(f.portee).toEqual(PORTEE_CLASSEUR)
    expect(f.periodicites).toEqual([{ id: 44, label: 'Annuel', nombre: 8 }])
    expect(f.exporteLe).toBe('2026-10-23T08:00:00Z')
    expect(f.changements[0].apres).toBeNull()
  })
})

describe('C1 — sans action annoncée, rien ne passe', () => {
  it('un changement sans action est ignoré, avec un avertissement', () => {
    const { plan } = planDe([{ uuid: 'doc-1', content: 'Réécrit en silence' }])
    expect(plan.actions).toEqual([])
    expect(plan.resultat.skipped).toBe(1)
    expect(plan.warnings).toEqual([
      "Le document Check-in : aucune action n'est indiquée (modifier, supprimer, déplacer ou ajouter), ce changement est ignoré.",
    ])
  })

  it('une action inconnue aussi', () => {
    const { plan } = planDe([{ action: 'renommer', uuid: 'doc-1', title: 'X' }])
    expect(plan.actions).toEqual([])
    expect(plan.warnings[0]).toMatch(/l'action renommer est inconnue/)
  })

  it('la casse et les espaces de l’action ne comptent pas', () => {
    const { plan } = planDe([
      { action: ' Modifier ', uuid: 'doc-1', content: 'x' },
    ])
    expect(types(plan.actions)).toEqual(['modifierItem'])
  })
})

describe('C2 — l’identifiant désigne un élément d’ici, vivant, de la même nature', () => {
  it.each([
    [
      { action: 'modifier', uuid: 'inconnu', content: 'x' },
      'il est introuvable dans ce classeur',
    ],
    [
      { action: 'modifier', kind: 'tracking_sheet', uuid: 'doc-1', title: 'x' },
      'sa nature ne peut pas changer',
    ],
    [
      { action: 'modifier', uuid: 'doc-7', content: 'x' },
      'il est déjà à la corbeille',
    ],
    [{ action: 'supprimer', title: 'Clés' }, 'son identifiant (uuid) manque'],
  ])('%j : ignoré', (c, raison) => {
    const { plan } = planDe([c])
    expect(plan.actions).toEqual([])
    expect(plan.warnings[0]).toContain(raison)
  })
})

describe('C3 — supprimer ou déplacer exige le titre actuel', () => {
  it('sans titre, ou avec un autre titre : rien n’est supprimé', () => {
    expect(
      planDe([{ action: 'supprimer', uuid: 'doc-3' }]).plan.actions,
    ).toEqual([])
    const autre = planDe([
      { action: 'supprimer', uuid: 'doc-3', title: 'Check-in' },
    ])
    expect(autre.plan.actions).toEqual([])
    expect(autre.plan.warnings[0]).toBe(
      "Le document Clés : le titre donné (Check-in) n'est pas le sien, ce changement est ignoré.",
    )
    expect(
      planDe([{ action: 'deplacer', uuid: 'doc-3', title: 'X', apres: null }])
        .plan.actions,
    ).toEqual([])
  })

  it('le bon titre (casse et espaces ignorés) : à la corbeille, ligne dans l’aperçu', () => {
    const { plan } = planDe([
      { action: 'supprimer', uuid: 'doc-3', title: '  clés ' },
    ])
    expect(plan.actions).toEqual([
      { type: 'supprimerItem', kind: 'document', id: 3 },
    ])
    expect(plan.resultat.deleted).toBe(1)
    expect(plan.apercu).toEqual([
      {
        action: 'delete',
        kind: 'document',
        title: 'Clés',
        chapter_label: 'Accueil',
        icon: 'FileText',
      },
    ])
  })
})

describe('C4 — modifier ne change que les champs présents', () => {
  it('le titre seul : le texte reste', () => {
    const { plan } = planDe([
      { action: 'modifier', uuid: 'doc-1', title: 'Arrivée' },
    ])
    expect(plan.actions).toEqual([
      {
        type: 'modifierItem',
        id: 1,
        item: {
          kind: 'document',
          input: { title: 'Arrivée', description: '', content: 'Arriver' },
        },
      },
    ])
  })

  it('titre vidé : gardé, et rien d’autre ne change donc inchangé', () => {
    const { plan } = planDe([
      { action: 'modifier', uuid: 'doc-1', title: '  ' },
    ])
    expect(plan.actions).toEqual([])
    expect(plan.resultat.unchanged).toBe(1)
    expect(plan.warnings).toEqual([
      "Le document Check-in : un titre vide n'est pas possible, le titre actuel est gardé.",
    ])
  })

  it('nombre de lignes borné à 60, non entier refusé', () => {
    const haut = planDe([
      { action: 'modifier', uuid: 'sig-6', nombre: 100 },
    ]).plan
    expect(haut.actions[0]).toMatchObject({ item: { input: { nombre: 60 } } })
    expect(haut.warnings[0]).toMatch(
      /100 lignes n'est pas possible \(de 1 à 60\), 60 est appliqué/,
    )
    const demi = planDe([
      { action: 'modifier', uuid: 'sig-6', nombre: 2.5 },
    ]).plan
    expect(demi.actions).toEqual([])
    expect(demi.warnings[0]).toMatch(/nombre entier, 14 est gardé/)
  })

  it('périodicité : par libellé du fichier ; inconnue, l’actuelle reste', () => {
    const ok = planDe([
      { action: 'modifier', uuid: 'ts-5', periodicite_id: 44 },
    ]).plan
    expect(ok.actions[0]).toMatchObject({
      item: { input: { periodicite_id: 44 } },
    })
    const inconnue = planDe([
      { action: 'modifier', uuid: 'ts-5', periodicite_id: 999 },
    ]).plan
    expect(inconnue.actions).toEqual([])
    expect(inconnue.warnings[0]).toMatch(/l'actuelle est gardée/)
  })
})

describe('C5 — les places, par « apres », sans heurter les absents', () => {
  it('en tête du chapitre : renuméroté, les voisins à part (sans ligne)', () => {
    const { plan } = planDe([
      { action: 'deplacer', uuid: 'doc-3', title: 'Clés', apres: null },
    ])
    expect(plan.actions).toEqual([
      {
        type: 'modifierItem',
        id: 3,
        item: {
          kind: 'document',
          input: { title: 'Clés', description: '', content: '' },
        },
        sort_order: 1,
      },
      {
        type: 'ordonnerItem',
        kind: 'document',
        id: 1,
        sort_order: 2,
        causes: ['document:3'],
      },
      {
        type: 'ordonnerItem',
        kind: 'document',
        id: 2,
        sort_order: 3,
        causes: ['document:3'],
      },
    ])
    expect(plan.apercu).toHaveLength(1)
    expect(
      lignesImport(local, plan).map((l) => [l.titre, l.changement]),
    ).toEqual([['Clés', 'ordre']])
  })

  it('à la fin, derrière un numéro libre : aucun voisin renuméroté', () => {
    const { plan } = planDe([
      { action: 'deplacer', uuid: 'doc-1', title: 'Check-in', apres: 'doc-3' },
    ])
    expect(plan.actions).toEqual([
      expect.objectContaining({ type: 'modifierItem', id: 1, sort_order: 4 }),
    ])
  })

  it('vers un autre chapitre, sans « apres » : à sa fin, la provenance est dite', () => {
    const { plan } = planDe([
      {
        action: 'deplacer',
        uuid: 'doc-1',
        title: 'Check-in',
        chapitre: 'ch-20',
      },
    ])
    expect(plan.actions).toEqual([
      expect.objectContaining({
        type: 'modifierItem',
        id: 1,
        chapitre: { type: 'local', id: 20 },
        sort_order: 4,
      }),
    ])
    expect(lignesImport(local, plan)[0]).toMatchObject({
      provenance: 'Accueil',
      changement: 'ordre',
    })
    expect(chapitresDesLignes(local, plan)).toEqual([
      { cle: 'local:20', libelle: 'Sécurité' },
    ])
  })

  it('ajouter au milieu : la création prend la place, la suite est renumérotée', () => {
    const { plan } = planDe([
      {
        action: 'ajouter',
        kind: 'document',
        title: 'Badge',
        chapitre: 'ch-10',
        apres: 'doc-1',
      },
    ])
    expect(plan.actions).toEqual([
      {
        type: 'creerItem',
        chapitre: { type: 'local', id: 10 },
        uuid: null,
        sort_order: 2,
        item: {
          kind: 'document',
          input: { title: 'Badge', description: '', content: '' },
        },
        cle: 'nouveau:document:0:Badge',
      },
      {
        type: 'ordonnerItem',
        kind: 'document',
        id: 2,
        sort_order: 3,
        causes: ['nouveau:document:0:Badge'],
      },
      {
        type: 'ordonnerItem',
        kind: 'document',
        id: 3,
        sort_order: 4,
        causes: ['nouveau:document:0:Badge'],
      },
    ])
    expect(clesActions(plan.actions)).toEqual([
      'nouveau:document:0:Badge',
      null,
      null,
    ])
  })

  it('ajouter sans « apres » : à la fin, numéro suivant', () => {
    const { plan } = planDe([
      {
        action: 'ajouter',
        kind: 'intercalaire',
        title: 'Partie 2',
        chapitre: 'ch-10',
      },
    ])
    expect(plan.actions).toEqual([
      expect.objectContaining({ type: 'creerItem', sort_order: 4 }),
    ])
  })

  it('« apres » d’un autre chapitre : à la fin, avec un avertissement', () => {
    const { plan } = planDe([
      {
        action: 'ajouter',
        kind: 'document',
        title: 'Badge',
        chapitre: 'ch-10',
        apres: 'doc-4',
      },
    ])
    expect(plan.actions).toEqual([
      expect.objectContaining({ type: 'creerItem', sort_order: 4 }),
    ])
    expect(plan.warnings).toEqual([
      "Le document Badge : l'élément après lequel le placer n'est pas dans ce chapitre, il est mis à la fin.",
    ])
  })

  it('une liste sans changement de place garde ses numéros, même en double', () => {
    const e = etat([A], {
      documents: [
        document({ id: 1, chapter_id: 10, title: 'Un', sort_order: 5 }),
        document({ id: 2, chapter_id: 10, title: 'Deux', sort_order: 5 }),
      ],
    })
    const { plan } = planDe(
      [{ action: 'modifier', uuid: 'doc-1', content: 'x' }],
      { etat: e },
    )
    expect(types(plan.actions)).toEqual(['modifierItem'])
    expect(plan.actions[0]).not.toHaveProperty('sort_order')
  })

  it('déplacer sans dire où : ignoré', () => {
    const { plan } = planDe([
      { action: 'deplacer', uuid: 'doc-1', title: 'Check-in' },
    ])
    expect(plan.actions).toEqual([])
    expect(plan.warnings[0]).toMatch(/la place où le mettre/)
  })
})

describe('C6 — un élément n’est visé qu’une fois', () => {
  it('le second changement est ignoré', () => {
    const { plan } = planDe([
      { action: 'modifier', uuid: 'doc-1', content: 'A' },
      { action: 'supprimer', uuid: 'doc-1', title: 'Check-in' },
    ])
    expect(types(plan.actions)).toEqual(['modifierItem'])
    expect(plan.warnings[0]).toMatch(/déjà visé par un autre changement/)
  })
})

describe('C7 — un chapitre à la corbeille emporte ses éléments', () => {
  it('ce qui y vise est ignoré ; corbeille en dernier', () => {
    const { plan } = planDe([
      { action: 'modifier', uuid: 'doc-4', content: 'x' },
      { action: 'ajouter', kind: 'document', title: 'Neuf', chapitre: 'ch-20' },
      { action: 'supprimer', uuid: 'doc-1', title: 'Check-in' },
      { action: 'supprimer', uuid: 'ch-20', label: 'sécurité' },
    ])
    expect(plan.actions).toEqual([
      { type: 'supprimerItem', kind: 'document', id: 1 },
      { type: 'supprimerChapitre', id: 20 },
    ])
    expect(plan.warnings).toEqual([
      'Le document Incendie : son chapitre part à la corbeille, ce changement est ignoré.',
      'Le document Neuf : son chapitre est introuvable ici, ce changement est ignoré.',
    ])
    expect(
      lignesImport(local, plan).map((l) => [l.genre, l.titre, l.cle]),
    ).toEqual([
      ['suppression', 'Check-in', 'document:1'],
      ['suppression', 'Sécurité', 'chapitre:20'],
    ])
  })
})

describe('chapitres : ajouter, déplacer', () => {
  it('un chapitre ajouté reçoit les éléments qui le citent par « ref »', () => {
    const { plan } = planDe([
      { action: 'ajouter', kind: 'document', title: 'Plan', chapitre: 'R' },
      {
        action: 'ajouter',
        kind: 'chapitre',
        ref: 'R',
        label: 'Maintenance',
        apres: 'ch-10',
      },
    ])
    expect(plan.actions).toEqual([
      {
        type: 'creerChapitre',
        index: 0,
        uuid: null,
        label: 'Maintenance',
        icon: 'FileText',
        description: '',
        sort_order: 2,
      },
      { type: 'ordonnerChapitre', id: 20, sort_order: 3, causes: [] },
      expect.objectContaining({
        type: 'creerItem',
        chapitre: { type: 'nouveau', index: 0 },
        sort_order: 1,
      }),
    ])
    expect(chapitresDesLignes(local, plan).map((c) => c.libelle)).toEqual([
      'Maintenance',
      'Maintenance',
    ])
  })

  it('un chapitre déplacé en tête se lit « déplacé »', () => {
    const { plan } = planDe([
      { action: 'deplacer', uuid: 'ch-20', label: 'Sécurité', apres: null },
    ])
    expect(plan.actions).toEqual([
      {
        type: 'modifierChapitre',
        id: 20,
        label: 'Sécurité',
        icon: 'FileText',
        description: '',
        sort_order: 1,
      },
      { type: 'ordonnerChapitre', id: 10, sort_order: 2, causes: [] },
    ])
    expect(lignesImport(local, plan)[0]).toMatchObject({
      genre: 'chapitre',
      actionChapitre: 'deplacement',
    })
  })

  it('un chapitre ajouté sans nom : ignoré, et ses éléments aussi', () => {
    const { plan } = planDe([
      { action: 'ajouter', kind: 'chapitre', ref: 'R', label: ' ' },
      { action: 'ajouter', kind: 'document', title: 'Plan', chapitre: 'R' },
    ])
    expect(plan.actions).toEqual([])
    expect(plan.resultat.skipped).toBe(2)
  })
})

describe('C8 — la portée borne ce qui change', () => {
  const porteeA: Portee = {
    type: 'chapitre',
    chapitre_uuid: 'ch-10',
    chapitre_label: 'Accueil',
  }
  const porteeD1: Portee = {
    type: 'document',
    document_uuid: 'doc-1',
    document_title: 'Check-in',
    chapitre_label: 'Accueil',
  }

  it('export d’un chapitre : rien hors de lui, ni la structure du classeur', () => {
    const r = planDe(
      [
        { action: 'modifier', uuid: 'doc-4', content: 'x' },
        { action: 'ajouter', kind: 'chapitre', label: 'Neuf' },
        { action: 'deplacer', uuid: 'ch-10', label: 'Accueil', apres: null },
        { action: 'modifier', uuid: 'ch-10', label: 'Accueil et départ' },
        { action: 'ajouter', kind: 'document', title: 'Badge' },
      ],
      { portee: porteeA, contexte: { type: 'chapitre', chapitreId: 10 } },
    )
    expect(r.destination).toEqual({
      cible: { type: 'chapitre', chapitreId: 10 },
      note: null,
    })
    expect(types(r.plan.actions)).toEqual(['modifierChapitre', 'creerItem'])
    expect(r.plan.actions[1]).toMatchObject({
      chapitre: { type: 'local', id: 10 },
      sort_order: 4,
    })
    expect(r.plan.warnings).toEqual([
      "Le document Incendie : l'export d'un chapitre ne change que ce chapitre, ce changement est ignoré.",
      "Le chapitre Neuf : un chapitre s'ajoute depuis l'export du classeur entier, ce changement est ignoré.",
      "Le chapitre Accueil : on supprime ou déplace un chapitre depuis l'export du classeur entier, ce changement est ignoré.",
    ])
  })

  it('export d’un document : lui seul, jamais déplacé', () => {
    const r = planDe(
      [
        { action: 'modifier', uuid: 'doc-1', content: 'Nouveau', apres: null },
        { action: 'modifier', uuid: 'doc-2', content: 'x' },
        { action: 'ajouter', kind: 'document', title: 'Badge' },
      ],
      { portee: porteeD1, contexte: { type: 'chapitre', chapitreId: 10 } },
    )
    expect(r.destination.note).toBe(
      'Ce fichier concerne le document Check-in. Le reste du classeur ne change pas.',
    )
    expect(r.plan.actions).toEqual([
      {
        type: 'modifierItem',
        id: 1,
        item: {
          kind: 'document',
          input: { title: 'Check-in', description: '', content: 'Nouveau' },
        },
      },
    ])
    expect(r.plan.warnings).toHaveLength(3)
    expect(r.plan.warnings[0]).toMatch(/ne le déplace pas, il reste à sa place/)
  })

  it('un fichier d’ailleurs est refusé, sans rien calculer', () => {
    expect(() =>
      planDe([], {
        portee: {
          ...PORTEE_CLASSEUR,
          classeur_uuid: 'autre',
          classeur_name: 'Carnet',
        },
      }),
    ).toThrow('Ce fichier vient du classeur Carnet, pas de celui-ci.')
    expect(() =>
      planDe([], {
        portee: {
          type: 'chapitre',
          chapitre_uuid: 'ch-99',
          chapitre_label: 'Cuisine',
        },
      }),
    ).toThrow(/Le chapitre Cuisine n'est pas dans ce classeur/)
  })

  it('sans portée : le classeur, chaque uuid désigne son élément', () => {
    const r = planDe([{ action: 'modifier', uuid: 'doc-4', content: 'x' }], {
      portee: null,
      contexte: { type: 'chapitre', chapitreId: 10 },
    })
    expect(r.destination).toEqual({
      cible: { type: 'classeur' },
      note: 'Ce fichier concerne tout le classeur.',
    })
    expect(types(r.plan.actions)).toEqual(['modifierItem'])
  })
})

describe('C9 — un refus vaut pour le changement, positions recalculées', () => {
  const deplacement: ChangementJson[] = [
    { action: 'deplacer', uuid: 'doc-3', title: 'Clés', apres: null },
  ]

  it('refuser un déplacement : plus aucune renumérotation', () => {
    const r = planDe(deplacement, { exclus: new Set(['document:3']) })
    expect(r.plan.actions).toEqual([])
    expect(r.ignores).toBe(1)
  })

  it('côté aperçu, `filtrerPlan` retire aussi les renumérotations qu’il imposait', () => {
    const { plan } = planDe(deplacement)
    const filtre = filtrerPlan(plan, new Set(['document:3']))
    expect(filtre.plan.actions).toEqual([])
    expect(filtre.ignores).toBe(1)
  })

  it('refuser un ajout : sa clé vient du changement, pas de sa place', () => {
    const c: ChangementJson[] = [
      {
        action: 'ajouter',
        kind: 'document',
        title: 'Badge',
        chapitre: 'ch-10',
        apres: 'doc-1',
      },
    ]
    const r = planDe(c, { exclus: new Set(['nouveau:document:0:Badge']) })
    expect(r.plan.actions).toEqual([])
    expect(r.ignores).toBe(1)
  })

  it('refuser un document réécrit ne défait pas l’ordre voulu des autres', () => {
    const c: ChangementJson[] = [
      { action: 'modifier', uuid: 'doc-1', content: 'Réécrit' },
      { action: 'deplacer', uuid: 'doc-3', title: 'Clés', apres: null },
    ]
    const r = planDe(c, { exclus: new Set(['document:1']) })
    expect(types(r.plan.actions)).toEqual([
      'modifierItem',
      'ordonnerItem',
      'ordonnerItem',
    ])
    expect(r.plan.actions[0]).toMatchObject({ id: 3, sort_order: 1 })
  })
})

describe('changés dans l’application depuis l’export', () => {
  const recent = etat([A], {
    documents: [{ ...d1, updated_at: '2026-10-23T09:00:00.123456+00:00' }, d3],
  })
  const f = (changements: ChangementJson[]): FichierChangements => ({
    ...fichier(changements),
    exporteLe: '2026-10-23T08:00:00Z',
  })

  it('une réécriture d’un texte changé depuis est proposée refusée', () => {
    const fich = f([{ action: 'modifier', uuid: 'doc-1', content: 'x' }])
    const { plan } = planifierChangements(recent, classeur(), fich, CLASSEUR)
    expect(clesChangeesDepuisExport(recent, fich, plan)).toEqual(['document:1'])
  })

  it('un simple déplacement, ou un texte inchangé depuis, ne l’est pas', () => {
    const fich = f([
      { action: 'deplacer', uuid: 'doc-1', title: 'Check-in', apres: 'doc-3' },
      { action: 'modifier', uuid: 'doc-3', content: 'y' },
    ])
    const { plan } = planifierChangements(recent, classeur(), fich, CLASSEUR)
    expect(clesChangeesDepuisExport(recent, fich, plan)).toEqual([])
  })
})

describe('resumerImport', () => {
  it('ne parle que de ce qui change', () => {
    const { plan } = planDe([
      { action: 'supprimer', uuid: 'doc-3', title: 'Clés' },
      {
        action: 'ajouter',
        kind: 'document',
        title: 'Badge',
        chapitre: 'ch-10',
      },
      { action: 'modifier', uuid: 'inconnu', content: 'x' },
    ])
    expect(resumerImport(plan)).toBe('1 ajout, 1 mis à la corbeille, 1 ignoré')
    expect(resumerImport(planDe([]).plan)).toBe('Rien à importer')
  })
})

describe('executerPlan : une renumérotation n’écrit que le numéro', () => {
  it('ordonnerItem et ordonnerChapitre', async () => {
    const ecrivain = {
      updateItem: vi.fn(() => Promise.resolve()),
      updateChapter: vi.fn(() => Promise.resolve()),
    } as unknown as Ecrivain
    await executerPlan(
      1,
      [
        {
          type: 'ordonnerItem',
          kind: 'document',
          id: 2,
          sort_order: 3,
          causes: [],
        },
        { type: 'ordonnerChapitre', id: 10, sort_order: 2, causes: [] },
      ],
      ecrivain,
    )
    expect(ecrivain.updateItem).toHaveBeenCalledWith('document', 2, {
      sort_order: 3,
    })
    expect(ecrivain.updateChapter).toHaveBeenCalledWith(10, { sort_order: 2 })
  })
})

// ---------------------------------------------------------------------------
// Numérotation : propriétés
// ---------------------------------------------------------------------------

describe('numeroter', () => {
  it('garde les fixes quand la place le permet', () => {
    const actuels = new Map([
      ['a', 2],
      ['b', 5],
    ])
    expect([
      ...numeroter(['a', 'x', 'b', 'y'], actuels, new Set(['a', 'b'])),
    ]).toEqual([
      ['a', 2],
      ['x', 3],
      ['b', 5],
      ['y', 6],
    ])
  })

  it('sans place, ou fixes en désordre : 1 à n', () => {
    const actuels = new Map([
      ['a', 1],
      ['b', 2],
    ])
    expect([
      ...numeroter(['a', 'x', 'b'], actuels, new Set(['a', 'b'])).values(),
    ]).toEqual([1, 2, 3])
    expect([
      ...numeroter(['b', 'a'], actuels, new Set(['a', 'b'])).values(),
    ]).toEqual([1, 2])
  })

  it('propriété : numéros strictement croissants dans l’ordre voulu, ≥ 1', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            fixe: fc.boolean(),
            n: fc.integer({ min: -3, max: 40 }),
          }),
          {
            maxLength: 25,
          },
        ),
        (entrees) => {
          const liste = entrees.map((_, i) => `e${String(i)}`)
          const actuels = new Map(entrees.map((e, i) => [`e${String(i)}`, e.n]))
          const fixes = new Set(liste.filter((_, i) => entrees[i].fixe))
          const r = numeroter(liste, actuels, fixes)
          const valeurs = liste.map((p) => r.get(p) as number)
          expect(valeurs.every((v) => Number.isInteger(v) && v >= 1)).toBe(true)
          for (let i = 1; i < valeurs.length; i++)
            expect(valeurs[i]).toBeGreaterThan(valeurs[i - 1])
        },
      ),
      { numRuns: 1000, seed: 20261023 },
    )
  })

  it('propriété : des fixes croissants avec de la place gardent leur numéro', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 3 }), {
          minLength: 1,
          maxLength: 12,
        }),
        fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 12 }),
        (insertions, finEnAttente) => {
          // Fixes espacés de 10 : place pour au plus 9 entre deux.
          const liste: string[] = []
          const actuels = new Map<string, number>()
          const fixes = new Set<string>()
          insertions.forEach((k, i) => {
            for (let j = 0; j < k; j++) liste.push(`n${String(i)}-${String(j)}`)
            const f = `f${String(i)}`
            liste.push(f)
            actuels.set(f, 10 * (i + 1))
            fixes.add(f)
          })
          finEnAttente.forEach((_, j) => liste.push(`fin${String(j)}`))
          const r = numeroter(liste, actuels, fixes)
          for (const f of fixes) expect(r.get(f)).toBe(actuels.get(f))
        },
      ),
      { numRuns: 500, seed: 20261023 },
    )
  })
})

// ---------------------------------------------------------------------------
// Propriété : l'ordre obtenu est l'ordre voulu
// ---------------------------------------------------------------------------

describe('propriété : appliquer le plan donne l’ordre que les changements décrivent', () => {
  const N = 6
  const docs = Array.from({ length: N }, (_, i) =>
    document({
      id: i + 1,
      chapter_id: i < 3 ? 10 : 20,
      title: `D${String(i + 1)}`,
      sort_order: (i % 3) + 1,
    }),
  )
  const base = etat([A, B], { documents: docs })

  it('déplacements au hasard (1 000 cas)', () => {
    const changementArb = fc.record({
      id: fc.integer({ min: 1, max: N }),
      vers: fc.constantFrom(undefined, 'ch-10', 'ch-20'),
      apres: fc.constantFrom<string | null | undefined>(
        undefined,
        null,
        ...docs.map((d) => d.uuid),
      ),
    })
    fc.assert(
      fc.property(fc.array(changementArb, { maxLength: 5 }), (bruts) => {
        const changements: ChangementJson[] = bruts.map((b) => ({
          action: 'deplacer',
          uuid: `doc-${String(b.id)}`,
          title: `D${String(b.id)}`,
          ...(b.vers === undefined ? {} : { chapitre: b.vers }),
          ...(b.apres === undefined ? {} : { apres: b.apres }),
        }))
        // Oracle indépendant : listes par chapitre, opérations naïves.
        const listes: Record<string, number[]> = {
          'ch-10': [1, 2, 3],
          'ch-20': [4, 5, 6],
        }
        const vus = new Set<number>()
        for (const b of bruts) {
          if (vus.has(b.id)) continue
          const ici = listes['ch-10'].includes(b.id) ? 'ch-10' : 'ch-20'
          // Ni place ni AUTRE chapitre : rien ne bouge (C5).
          if ((b.vers === undefined || b.vers === ici) && b.apres === undefined)
            continue
          vus.add(b.id)
          const de = listes['ch-10'].includes(b.id) ? 'ch-10' : 'ch-20'
          const vers = b.vers ?? de
          listes[de] = listes[de].filter((x) => x !== b.id)
          const dest = listes[vers]
          if (b.apres === null) dest.unshift(b.id)
          else if (b.apres === undefined) dest.push(b.id)
          else {
            const j = dest.indexOf(Number(b.apres.slice(4)))
            if (j === -1) dest.push(b.id)
            else dest.splice(j + 1, 0, b.id)
          }
        }
        // Le plan appliqué à un modèle de la base.
        const { plan } = planifierChangements(
          base,
          classeur(),
          fichier(changements),
          CLASSEUR,
        )
        const modele = new Map(
          docs.map((d) => [d.id, { ch: d.chapter_id, n: d.sort_order }]),
        )
        for (const a of plan.actions) {
          if (a.type === 'modifierItem' || a.type === 'ordonnerItem') {
            const m = modele.get(a.id)
            if (m === undefined) throw new Error('élément inconnu')
            if (a.type === 'modifierItem' && a.chapitre?.type === 'local')
              m.ch = a.chapitre.id
            if (a.sort_order !== undefined) m.n = a.sort_order
          }
        }
        for (const [ch, id] of [
          ['ch-10', 10],
          ['ch-20', 20],
        ] as const) {
          const obtenu = [...modele]
            .filter(([, m]) => m.ch === id)
            .sort((x, y) => x[1].n - y[1].n || x[0] - y[0])
            .map(([d]) => d)
          expect(obtenu).toEqual(listes[ch])
          const numeros = [...modele]
            .filter(([, m]) => m.ch === id)
            .map(([, m]) => m.n)
          expect(new Set(numeros).size).toBe(numeros.length)
        }
      }),
      { numRuns: 1000, seed: 20261023 },
    )
  })
})

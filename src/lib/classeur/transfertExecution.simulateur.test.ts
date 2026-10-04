import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type {
  Ligne,
  Operation,
} from '#/lib/classeur/test/simulateurSupabase.ts'
import type { RefEcriture } from '#/lib/classeur/service.ts'
import type { NiveauEffectif } from '#/lib/classeur/droits.ts'
import type { ModeTransfert } from '#/lib/classeur/transfert.ts'

/*
 * Transfert vers un autre classeur (étape 7b), exécuté contre le SIMULATEUR
 * PostgREST + Storage (la base de production n'est jamais touchée, D21 = B).
 * La RLS y est MODÉLISÉE d'après le catalogue lu le 2026-10-04 : lecture /
 * écriture par classeur, `USING` sur l'ancienne ligne et `WITH CHECK` sur la
 * nouvelle, `storage.copy` = lecture de la source + insert de la destination.
 *
 * Phase /martin : panne injectée à CHAQUE appel (boucle sur N), refus RLS
 * EXHAUSTIFS par (table, opération), matrice des droits par classeur, et
 * leur produit (une panne pendant le retour arrière d'un refus). Après
 * chaque scénario, `invariants()` vérifie :
 *   I1 aucun document ne référence un fichier de l'arrivée absent ;
 *   I2 à l'arrivée, fichiers du bucket = fichiers des fiches VIVANTES
 *      (ni fiche sans fichier, ni fichier copié sans fiche) ;
 *   I3 points de restauration des DEUX classeurs avant la 1re écriture ;
 *   I4 un refus à l'arrivée n'écrit rien à l'origine.
 * Valeurs attendues écrites à la main.
 */

/** Dernier index vérifiant `pred` (pas de findLastIndex : cible ES2022). */
function dernierIndex<T>(liste: readonly T[], pred: (x: T) => boolean): number {
  for (let i = liste.length - 1; i >= 0; i--) if (pred(liste[i])) return i
  return -1
}

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const { definirGardeEcriture, definirOubliDeplacement } =
  await import('#/lib/classeur/service.ts')
const { copierImageVersClasseur, transfererItems } =
  await import('#/lib/classeur/transfertExecution.ts')

const BUCKET = 'classeur-images'
const ORIGINE = 2
const ARRIVEE = 5
const T = '2026-09-20T10:00:00.000Z'

const A = '2/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
const A_ORIG = '2/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.original.webp'
const B = '2/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp'
/** Fiche supprimée, fichier absent : « introuvable », jamais copiée. */
const X = '2/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp'
/** Image déjà à l'arrivée : jamais touchée. */
const D = '5/dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp'

const uuidN = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const NOUVEAU_A = `5/${uuidN(1)}.webp`
const NOUVEAU_A_ORIG = `5/${uuidN(1)}.original.webp`
const NOUVEAU_B = `5/${uuidN(2)}.webp`

const CONTENU_100 = [
  '# Accueil',
  '',
  `![Porte d’entrée](${A} "moyenne cadre=10,10,80,80")`,
  '',
  `Texte ![b](${B}) fin.`,
  '',
  `![encore](${A})`,
  '',
  '![vide](a-inserer)',
  '',
  `![perdue](${X})`,
].join('\n')

const CONTENU_100_REECRIT = [
  '# Accueil',
  '',
  `![Porte d’entrée](${NOUVEAU_A} "moyenne cadre=10,10,80,80")`,
  '',
  `Texte ![b](${NOUVEAU_B}) fin.`,
  '',
  `![encore](${NOUVEAU_A})`,
  '',
  '![vide](a-inserer)',
  '',
  `![perdue](${X})`,
].join('\n')

function fiche(
  id: number,
  classeur_id: number,
  chemin: string,
  original: string | null,
  deleted_at: string | null = null,
): Ligne {
  return {
    id,
    uuid: `fiche-${String(id)}`,
    classeur_id,
    chemin,
    nom: `Image ${String(id)}`,
    taille: 1000 + id,
    largeur: 800,
    hauteur: 600,
    original_chemin: original,
    original_largeur: original ? 4000 : null,
    original_hauteur: original ? 3000 : null,
    original_taille: original ? 90_000 : null,
    deleted_at,
    created_at: T,
    updated_at: T,
    created_by: null,
  }
}

function monde(): SimulateurSupabase {
  const sim = new SimulateurSupabase({
    classeur_chapters: [
      {
        id: 20,
        classeur_id: ORIGINE,
        label: 'Réception',
        sort_order: 1,
        updated_at: T,
      },
      {
        id: 21,
        classeur_id: ORIGINE,
        label: 'Nuit',
        sort_order: 2,
        updated_at: T,
      },
      {
        id: 50,
        classeur_id: ARRIVEE,
        label: 'Arrivée',
        sort_order: 1,
        updated_at: T,
      },
      {
        id: 70,
        classeur_id: 7,
        label: 'Ailleurs',
        sort_order: 1,
        updated_at: T,
      },
    ],
    classeur_documents: [
      {
        id: 100,
        uuid: 'u-100',
        chapter_id: 20,
        title: 'Procédure porte',
        description: 'Ouvrir',
        content: CONTENU_100,
        version_majeure: 3,
        version_mineure: 2,
        sort_order: 1,
        updated_at: T,
      },
      {
        id: 101,
        uuid: 'u-101',
        chapter_id: 20,
        title: 'Sans image',
        description: '',
        content: 'Rien à copier.',
        version_majeure: 1,
        version_mineure: 4,
        sort_order: 2,
        updated_at: T,
      },
      {
        id: 500,
        uuid: 'u-500',
        chapter_id: 50,
        title: 'Déjà à l’arrivée',
        description: '',
        content: `![d](${D})`,
        version_majeure: 1,
        version_mineure: 0,
        sort_order: 3,
        updated_at: T,
      },
    ],
    classeur_intercalaires: [
      {
        id: 102,
        uuid: 'u-102',
        chapter_id: 20,
        title: 'Séparateur',
        description: 'Partie 2',
        sort_order: 3,
        updated_at: T,
      },
    ],
    classeur_tracking_sheets: [
      {
        id: 103,
        uuid: 'u-103',
        chapter_id: 21,
        title: 'Relevés',
        periodicite_id: 4,
        sort_order: 1,
        updated_at: T,
      },
    ],
    classeur_signature_sheets: [],
    classeur_images: [
      fiche(1, ORIGINE, A, A_ORIG),
      fiche(2, ORIGINE, B, null),
      fiche(3, ORIGINE, X, null, '2026-09-25T00:00:00.000Z'),
      fiche(9, ARRIVEE, D, null),
    ],
    classeur_document_versions: [
      { id: 1, document_id: 100, classeur_id: ORIGINE },
    ],
  })
  sim.stockage[BUCKET] = new Map<string, unknown>([
    [A, 'octets A'],
    [A_ORIG, 'octets A original'],
    [B, 'octets B'],
    [D, 'octets D'],
  ])
  return sim
}

type Niveau = 'aucun' | 'lecture' | 'ecriture'

const TABLES_ELEMENTS = [
  'classeur_documents',
  'classeur_tracking_sheets',
  'classeur_signature_sheets',
  'classeur_intercalaires',
]

/** RLS modélisée d'après `pg_policies` (lu le 2026-10-04). */
function poserRls(sim: SimulateurSupabase, droits: Record<number, Niveau>) {
  const niveau = (c: unknown): Niveau => droits[Number(c)] ?? 'aucun'
  const lit = (c: unknown) => niveau(c) !== 'aucun'
  const ecrit = (c: unknown) => niveau(c) === 'ecriture'
  const classeurDe = (chapterId: unknown) =>
    sim.table('classeur_chapters').find((c) => c.id === chapterId)?.classeur_id
  const dossier = (chemin: string) => Number(chemin.split('/')[0])
  sim.politique('classeur_chapters', 'select', {
    using: (l) => lit(l.classeur_id),
  })
  for (const t of TABLES_ELEMENTS) {
    sim.politique(t, 'select', { using: (l) => lit(classeurDe(l.chapter_id)) })
    sim.politique(t, 'insert', {
      check: (l) => ecrit(classeurDe(l.chapter_id)),
    })
    sim.politique(t, 'update', {
      using: (l) => ecrit(classeurDe(l.chapter_id)),
      check: (l) => ecrit(classeurDe(l.chapter_id)),
    })
  }
  sim.politique('classeur_images', 'select', {
    using: (l) => lit(l.classeur_id),
  })
  sim.politique('classeur_images', 'insert', {
    // + contrainte `classeur_images_chemin_du_classeur`.
    check: (l) =>
      ecrit(l.classeur_id) &&
      String(l.chemin).split('/')[0] === String(l.classeur_id),
  })
  sim.politique('classeur_images', 'update', {
    using: (l) => ecrit(l.classeur_id),
    check: (l) => ecrit(l.classeur_id),
  })
  sim.politiqueStockage(BUCKET, 'select', (c) => lit(dossier(c)))
  sim.politiqueStockage(
    BUCKET,
    'insert',
    (c) => ecrit(dossier(c)) && c.endsWith('.webp'),
  )
  sim.politiqueStockage(BUCKET, 'delete', (c) => ecrit(dossier(c)))
}

let sim: SimulateurSupabase
let gardes: Array<{ ref: RefEcriture; appelsAvant: number }>
let oublis: Array<{ kind: string; id: number }>

beforeEach(() => {
  gardes = []
  oublis = []
  definirGardeEcriture(async (ref) => {
    gardes.push({ ref, appelsAvant: etat.sim.journal.length })
  })
  definirOubliDeplacement((refs) => {
    oublis.push(...refs)
  })
  sim = monde()
  etat.sim = sim
})

function nouveauxUuids() {
  let n = 0
  return () => uuidN(++n)
}

const TOUS = [
  { kind: 'document' as const, id: 100 },
  { kind: 'intercalaire' as const, id: 102 },
  { kind: 'tracking_sheet' as const, id: 103 },
  { kind: 'document' as const, id: 101 },
]

function demande(
  mode: ModeTransfert,
  niveaux: { origine: NiveauEffectif; arrivee: NiveauEffectif } = {
    origine: 'ecriture',
    arrivee: 'ecriture',
  },
  elements = TOUS,
) {
  return {
    mode,
    elements,
    origine: ORIGINE,
    arrivee: ARRIVEE,
    chapitreArrivee: 50,
    niveaux,
    nouveauxUuids: nouveauxUuids(),
  }
}

function ligne(table: string, id: number): Ligne {
  const l = sim.table(table).find((x) => x.id === id)
  if (!l) throw new Error(`ligne ${table}:${String(id)} absente`)
  return l
}

const REF = /([0-9]{1,12}\/[0-9a-f-]{36}(?:\.original)?\.webp)/g

/** Photo de tout ce qui appartient à l'ORIGINE (lignes et fichiers). */
function photoOrigine(s: SimulateurSupabase): string {
  const chapitres = new Set([20, 21])
  const elements = TABLES_ELEMENTS.flatMap((t) =>
    s.table(t).filter((l) => chapitres.has(l.chapter_id as number)),
  )
  const images = s
    .table('classeur_images')
    .filter((l) => l.classeur_id === ORIGINE)
  const fichiers = [...s.stockage[BUCKET].keys()]
    .filter((c) => c.startsWith('2/'))
    .sort()
  return JSON.stringify({ elements, images, fichiers })
}

const ECRITURES = new Set([
  'insert',
  'upsert',
  'update',
  'delete',
  'copy',
  'remove',
  'upload',
])

function invariants(
  origineAvant: string,
  refusArrivee: boolean,
  fichiersOrphelinsToleres = false,
) {
  const fichiers = new Set(sim.stockage[BUCKET].keys())
  // I1
  for (const d of sim.table('classeur_documents')) {
    for (const m of String(d.content).matchAll(REF)) {
      if (m[1].startsWith(`${String(ARRIVEE)}/`)) {
        expect(fichiers.has(m[1]), `I1 doc ${String(d.id)} → ${m[1]}`).toBe(
          true,
        )
      }
    }
  }
  // I2
  const attendus = new Set<string>()
  for (const f of sim.table('classeur_images')) {
    if (f.classeur_id !== ARRIVEE || f.deleted_at !== null) continue
    attendus.add(String(f.chemin))
    if (f.original_chemin) attendus.add(String(f.original_chemin))
  }
  const presents = [...fichiers].filter((c) => c.startsWith('5/')).sort()
  // I2a (critique) : toute fiche vivante a ses fichiers.
  for (const c of attendus) expect(fichiers.has(c), `I2a fiche ${c}`).toBe(true)
  // I2b : aucun fichier sans fiche vivante — sauf si la policy delete est
  // refusée quand l'insert est permis (impossible en base : même prédicat
  // `classeur_write_ok`) ; un fichier pas encore rattaché resterait alors.
  if (!fichiersOrphelinsToleres) {
    expect(presents, 'I2b fichiers = fiches vivantes').toEqual(
      [...attendus].sort(),
    )
  } else {
    // Même toléré, un fichier d'une fiche MARQUÉE supprimée est une faute :
    // sa fiche devait revivre.
    for (const f of sim.table('classeur_images')) {
      if (f.classeur_id !== ARRIVEE || f.deleted_at === null) continue
      expect(
        fichiers.has(String(f.chemin)),
        `I2b fiche morte ${String(f.chemin)}`,
      ).toBe(false)
    }
  }
  // I3
  const premiere = sim.journal.findIndex((j) => ECRITURES.has(j.operation))
  if (premiere >= 0) {
    for (const c of [ORIGINE, ARRIVEE]) {
      const g = gardes.find(
        (x) => 'classeurId' in x.ref && x.ref.classeurId === c,
      )
      expect(g, `I3 point du classeur ${String(c)}`).toBeDefined()
      expect(
        g!.appelsAvant,
        `I3 point ${String(c)} avant l’écriture`,
      ).toBeLessThanOrEqual(premiere)
    }
  }
  // I4
  if (refusArrivee) {
    expect(photoOrigine(sim), 'I4 rien à l’origine').toBe(origineAvant)
  }
}

/** Exécute une demande ; rend l'erreur ou `null`. */
async function jouer(mode: ModeTransfert, d = demande(mode)) {
  try {
    await transfererItems(d)
    return null
  } catch (err) {
    return err
  }
}

// ---------------------------------------------------------------------------
// Chemin nominal
// ---------------------------------------------------------------------------

describe('copier vers un autre classeur', () => {
  it('copie les éléments en fin du chapitre d’arrivée, images comprises', async () => {
    poserRls(sim, { 2: 'ecriture', 5: 'ecriture' })
    const avant = photoOrigine(sim)
    const r = await transfererItems(demande('copier'))
    expect(r).toEqual({
      mode: 'copier',
      deplaces: 0,
      copies: 4,
      imagesCopiees: 2,
      introuvables: [X],
    })
    const arrivee = TABLES_ELEMENTS.flatMap((t) =>
      sim.table(t).filter((l) => l.chapter_id === 50 && l.id !== 500),
    ).sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    expect(arrivee.map((l) => [l.title, l.sort_order])).toEqual([
      ['Procédure porte', 4],
      ['Séparateur', 5],
      ['Relevés', 6],
      ['Sans image', 7],
    ])
    const doc = arrivee[0]
    expect(doc.content).toBe(CONTENU_100_REECRIT)
    expect([doc.version_majeure, doc.version_mineure]).toEqual([1, 0])
    expect(doc.description).toBe('Ouvrir')
    // Aucun uuid envoyé : la base le pose (le simulateur n'en invente pas).
    for (const l of arrivee) expect(l.uuid).toBeUndefined()
    expect(arrivee[2].periodicite_id).toBe(4)
    // Fichiers : A une seule fois (utilisée deux fois), son original, B.
    expect(sim.stockage[BUCKET].get(NOUVEAU_A)).toBe('octets A')
    expect(sim.stockage[BUCKET].get(NOUVEAU_A_ORIG)).toBe('octets A original')
    expect(sim.stockage[BUCKET].get(NOUVEAU_B)).toBe('octets B')
    const copies = sim.journal.filter((j) => j.operation === 'copy')
    expect(copies).toHaveLength(3)
    // Jamais d'option `upsert` (ni d'option du tout).
    for (const c of copies) expect(c.options).toBeUndefined()
    // Fiches à l'arrivée.
    const fiches = sim
      .table('classeur_images')
      .filter((f) => f.classeur_id === ARRIVEE && f.id !== 9)
    expect(
      fiches.map((f) => [
        f.chemin,
        f.nom,
        f.taille,
        f.original_chemin,
        f.original_largeur,
      ]),
    ).toEqual([
      [NOUVEAU_A, 'Image 1', 1001, NOUVEAU_A_ORIG, 4000],
      [NOUVEAU_B, 'Image 2', 1002, null, null],
    ])
    // L'origine n'a pas bougé ; l'image déjà à l'arrivée non plus.
    expect(photoOrigine(sim)).toBe(avant)
    expect(ligne('classeur_images', 9).deleted_at).toBeNull()
    expect(oublis).toEqual([])
    invariants(avant, true)
  })

  it('images, PUIS fiches, PUIS éléments : aucun élément avant la dernière fiche', async () => {
    await transfererItems(demande('copier'))
    const j = sim.journal
    const derniereImage = Math.max(
      dernierIndex(j, (x) => x.operation === 'copy'),
      dernierIndex(
        j,
        (x) => x.cible === 'classeur_images' && x.operation === 'insert',
      ),
    )
    const premierElement = j.findIndex(
      (x) => TABLES_ELEMENTS.includes(x.cible) && x.operation === 'insert',
    )
    expect(derniereImage).toBeGreaterThan(0)
    expect(premierElement).toBeGreaterThan(derniereImage)
    // Le fichier d'une image avant SA fiche.
    const ficheA = j.findIndex(
      (x) => x.cible === 'classeur_images' && x.operation === 'insert',
    )
    expect(j.findIndex((x) => x.operation === 'copy')).toBeLessThan(ficheA)
  })

  it('points de restauration : origine puis arrivée, avant toute écriture', async () => {
    await transfererItems(demande('copier'))
    expect(gardes.map((g) => g.ref)).toEqual([
      { classeurId: ORIGINE },
      { classeurId: ARRIVEE },
    ])
    invariants(photoOrigine(sim), false)
  })
})

describe('déplacer vers un autre classeur', () => {
  it('change le chapitre, réécrit les chemins, garde numéro et historique', async () => {
    poserRls(sim, { 2: 'ecriture', 5: 'ecriture' })
    const r = await transfererItems(demande('deplacer'))
    expect(r).toEqual({
      mode: 'deplacer',
      deplaces: 4,
      copies: 0,
      imagesCopiees: 2,
      introuvables: [X],
    })
    expect(ligne('classeur_documents', 100)).toMatchObject({
      chapter_id: 50,
      sort_order: 4,
      content: CONTENU_100_REECRIT,
      version_majeure: 3,
      version_mineure: 2,
      // uuid NEUF (unique sur toute la table : le point de l'origine doit
      // pouvoir recréer l'élément avec l'ancien), tiré après les images.
      uuid: uuidN(3),
    })
    expect(ligne('classeur_intercalaires', 102).uuid).toBe(uuidN(4))
    expect(ligne('classeur_intercalaires', 102)).toMatchObject({
      chapter_id: 50,
      sort_order: 5,
    })
    expect(ligne('classeur_tracking_sheets', 103)).toMatchObject({
      chapter_id: 50,
      sort_order: 6,
    })
    // Sans image : contenu inchangé.
    expect(ligne('classeur_documents', 101)).toMatchObject({
      chapter_id: 50,
      sort_order: 7,
      content: 'Rien à copier.',
    })
    // L'historique a suivi (trigger `classeur_versions_suivent`).
    expect(ligne('classeur_document_versions', 1).classeur_id).toBe(ARRIVEE)
    // Les originaux restent à l'origine (d'autres documents peuvent s'en servir).
    expect(sim.stockage[BUCKET].has(A)).toBe(true)
    expect(ligne('classeur_images', 1).deleted_at).toBeNull()
    // La garde oublie chaque élément déplacé.
    expect(oublis).toEqual([
      { kind: 'document', id: 100 },
      { kind: 'intercalaire', id: 102 },
      { kind: 'tracking_sheet', id: 103 },
      { kind: 'document', id: 101 },
    ])
    invariants('', false)
  })

  it('dans le MÊME classeur : aucune image copiée, un seul point', async () => {
    poserRls(sim, { 2: 'ecriture' })
    const r = await transfererItems({
      ...demande('deplacer', undefined, [{ kind: 'document', id: 100 }]),
      arrivee: ORIGINE,
      chapitreArrivee: 21,
    })
    expect(r.imagesCopiees).toBe(0)
    expect(ligne('classeur_documents', 100)).toMatchObject({
      chapter_id: 21,
      sort_order: 2,
      content: CONTENU_100,
    })
    expect(gardes.map((g) => g.ref)).toEqual([{ classeurId: ORIGINE }])
    expect(sim.journal.some((j) => j.operation === 'copy')).toBe(false)
  })

  it('un document modifié entre la lecture et l’écriture : arrêt, copies retirées', async () => {
    sim.surAppel = (_n, cible, op) => {
      if (cible === 'classeur_documents' && op === 'update') {
        ligne('classeur_documents', 100).updated_at = '2026-09-30T00:00:00.000Z'
      }
    }
    const err = await jouer('deplacer')
    expect(String((err as Error).message)).toMatch(/modifié entre-temps/)
    expect(ligne('classeur_documents', 100).chapter_id).toBe(20)
    invariants('', false)
    expect(
      [...sim.stockage[BUCKET].keys()].filter((c) => c.startsWith('5/')),
    ).toEqual([D])
  })

  it('arrêt après un premier élément déplacé : ses images restent, le reste est retiré', async () => {
    poserRls(sim, { 2: 'ecriture', 5: 'ecriture' })
    // Le 2e document (101) est refusé à l'origine (USING).
    sim.politique('classeur_documents', 'update', {
      using: (l) => l.id !== 101,
    })
    const err = await jouer(
      'deplacer',
      demande('deplacer', undefined, [
        { kind: 'document', id: 100 },
        { kind: 'document', id: 101 },
      ]),
    )
    expect(String((err as Error).message)).toMatch(
      /interrompu après 1 élément\(s\) sur 2/,
    )
    // Le point auto peut être sauté (un point récent sert) ou échouer en
    // silence : le message ne promet pas qu'un point vient d'être pris.
    expect(String((err as Error).message)).not.toMatch(/a été pris/)
    expect(String((err as Error).message)).toMatch(
      /points de restauration des deux classeurs/,
    )
    expect(ligne('classeur_documents', 100).chapter_id).toBe(50)
    expect(ligne('classeur_documents', 101).chapter_id).toBe(20)
    // Le document déplacé pointe vers ses copies : elles restent.
    expect(sim.stockage[BUCKET].has(NOUVEAU_A)).toBe(true)
    invariants('', false)
  })
})

describe('refus avant toute écriture', () => {
  it('D6 : copier sans le droit d’écriture sur l’ORIGINE est refusé, rien n’est lu', async () => {
    const err = await jouer(
      'copier',
      demande('copier', { origine: 'lecture', arrivee: 'ecriture' }),
    )
    expect(err).toMatchObject({ code: '42501' })
    expect(sim.journal).toEqual([])
    expect(gardes).toEqual([])
  })

  it('chapitre d’arrivée d’un AUTRE classeur : erreur, rien d’écrit', async () => {
    const err = await jouer('copier', {
      ...demande('copier'),
      chapitreArrivee: 70,
    })
    expect(String((err as Error).message)).toMatch(/chapitre d’arrivée/)
    expect(sim.journal.some((j) => ECRITURES.has(j.operation))).toBe(false)
  })

  it('élément qui n’est pas (ou plus) à l’origine : erreur, rien d’écrit', async () => {
    const err = await jouer(
      'copier',
      demande('copier', undefined, [{ kind: 'document', id: 500 }]),
    )
    expect(String((err as Error).message)).toMatch(/supprimé ou déplacé/)
    expect(sim.journal.some((j) => ECRITURES.has(j.operation))).toBe(false)
  })

  it('aucun élément : rien, pas même un point', async () => {
    const r = await transfererItems(demande('copier', undefined, []))
    expect(r.copies).toBe(0)
    expect(sim.journal).toEqual([])
    expect(gardes).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// /martin : matrice des droits, refus exhaustifs, pannes à chaque pas
// ---------------------------------------------------------------------------

const NIVEAUX: Niveau[] = ['aucun', 'lecture', 'ecriture']

describe('matrice des droits par classeur (base) × ce que croit l’interface', () => {
  for (const mode of ['copier', 'deplacer'] as const) {
    for (const o of NIVEAUX) {
      for (const a of NIVEAUX) {
        it(`${mode} — origine ${o}, arrivée ${a} (interface contournée)`, async () => {
          poserRls(sim, { 2: o, 5: a })
          const avant = photoOrigine(sim)
          // L'interface croit tout permis : seule la BASE décide ici.
          const err = await jouer(mode)
          const permis =
            a === 'ecriture' &&
            (mode === 'copier' ? o !== 'aucun' : o === 'ecriture')
          if (permis) {
            expect(err).toBeNull()
          } else {
            expect(err).not.toBeNull()
          }
          invariants(avant, a !== 'ecriture')
          if (!permis) {
            // Rien d'écrit nulle part quand le premier pas est refusé.
            expect(photoOrigine(sim)).toBe(avant)
          }
        })
      }
    }
  }
})

const REFUS: Array<[string, Operation]> = [
  ['classeur_chapters', 'select'],
  ['classeur_documents', 'select'],
  ['classeur_documents', 'insert'],
  ['classeur_documents', 'update'],
  ['classeur_intercalaires', 'select'],
  ['classeur_intercalaires', 'insert'],
  ['classeur_intercalaires', 'update'],
  ['classeur_tracking_sheets', 'insert'],
  ['classeur_tracking_sheets', 'update'],
  ['classeur_images', 'select'],
  ['classeur_images', 'insert'],
  ['classeur_images', 'update'],
]
const REFUS_STOCKAGE = ['copy', 'remove'] as const

/** Nombre d'appels d'une exécution donnée (pour borner la boucle des pannes). */
async function compterAppels(
  preparer: (s: SimulateurSupabase) => void,
  mode: ModeTransfert,
) {
  sim = monde()
  etat.sim = sim
  preparer(sim)
  await jouer(mode)
  return sim.journal.length
}

const SCENARIOS: Array<[string, (s: SimulateurSupabase) => void]> = [
  ['aucun refus', () => {}],
  ...REFUS.map(([t, op]): [string, (s: SimulateurSupabase) => void] => [
    `refus ${t}:${op}`,
    (s) => s.refuser(t, op),
  ]),
  ...REFUS_STOCKAGE.map((op): [string, (s: SimulateurSupabase) => void] => [
    `refus stockage:${op}`,
    (s) => s.refuserStockage(BUCKET, op),
  ]),
]

/** Ces refus empêchent le retour arrière lui-même : une copie peut survivre (cohérente). */
const RETOUR_ARRIERE_BLOQUE = new Set([
  'refus classeur_images:update',
  'refus stockage:remove',
])

describe('refus RLS exhaustifs × panne injectée à chaque appel', () => {
  for (const mode of ['copier', 'deplacer'] as const) {
    for (const [nom, preparer] of SCENARIOS) {
      it(`${mode} — ${nom}`, async () => {
        const total = await compterAppels(preparer, mode)
        expect(total).toBeGreaterThan(0)
        // N = 0 : sans panne ; puis une panne à chaque appel (retour
        // arrière compris), et une au-delà.
        for (let n = 0; n <= total + 1; n++) {
          sim = monde()
          etat.sim = sim
          gardes = []
          preparer(sim)
          if (n > 0) sim.panneAuAppel(n)
          const avant = photoOrigine(sim)
          const err = await jouer(mode)
          const ecritAlArrivee = TABLES_ELEMENTS.some((t) =>
            sim.table(t).some((l) => l.chapter_id === 50 && l.id !== 500),
          )
          if (
            err !== null &&
            !ecritAlArrivee &&
            !RETOUR_ARRIERE_BLOQUE.has(nom)
          ) {
            // Échec sans élément écrit : ni copie ni fiche ne survit.
            expect(
              sim
                .table('classeur_images')
                .filter(
                  (f) =>
                    f.classeur_id === ARRIVEE &&
                    f.id !== 9 &&
                    f.deleted_at === null,
                ),
              `${nom} n=${String(n)} fiches`,
            ).toEqual([])
          }
          // Une erreur toujours LISIBLE (jamais un objet nu sans message).
          if (err !== null) expect(err).toHaveProperty('message')
          // I4 : rien à l'origine tant qu'aucun élément n'est arrivé (un
          // refus ou une panne côté arrivée), et jamais pour une copie.
          invariants(
            avant,
            mode === 'copier' || !ecritAlArrivee,
            nom === 'refus stockage:remove',
          )
        }
      })
    }
  }
})

describe('les refus qui DOIVENT échouer échouent (plus aucun succès annoncé)', () => {
  const doiventEchouer: Array<
    [ModeTransfert, string, (s: SimulateurSupabase) => void]
  > = [
    [
      'copier',
      'insert document',
      (s) => s.refuser('classeur_documents', 'insert'),
    ],
    ['copier', 'insert fiche', (s) => s.refuser('classeur_images', 'insert')],
    ['copier', 'copie de fichier', (s) => s.refuserStockage(BUCKET, 'copy')],
    [
      'deplacer',
      'update document',
      (s) => s.refuser('classeur_documents', 'update'),
    ],
    [
      'deplacer',
      'update intercalaire',
      (s) => s.refuser('classeur_intercalaires', 'update'),
    ],
    [
      'deplacer',
      'lecture des chapitres',
      (s) => s.refuser('classeur_chapters', 'select'),
    ],
  ]
  for (const [mode, nom, preparer] of doiventEchouer) {
    it(`${mode} : ${nom}`, async () => {
      preparer(sim)
      expect(await jouer(mode)).not.toBeNull()
    })
  }

  it('refus RLS rendu en 42501 (lisible par `messageErreur`)', async () => {
    sim.refuserStockage(BUCKET, 'copy')
    expect(await jouer('copier')).toMatchObject({ code: '42501' })
    sim = monde()
    etat.sim = sim
    sim.refuser('classeur_documents', 'update')
    expect(await jouer('deplacer')).toMatchObject({ code: '42501' })
  })
})

// ---------------------------------------------------------------------------
// copierImageVersClasseur seule
// ---------------------------------------------------------------------------

describe('copierImageVersClasseur', () => {
  const imageA = () =>
    ligne('classeur_images', 1) as unknown as Parameters<
      typeof copierImageVersClasseur
    >[0]

  it('copie l’affichage et l’original, crée la fiche à l’arrivée', async () => {
    const f = await copierImageVersClasseur(imageA(), ARRIVEE, uuidN(7))
    expect(f).toMatchObject({
      classeur_id: ARRIVEE,
      chemin: `5/${uuidN(7)}.webp`,
      original_chemin: `5/${uuidN(7)}.original.webp`,
      nom: 'Image 1',
    })
    expect(sim.stockage[BUCKET].get(`5/${uuidN(7)}.original.webp`)).toBe(
      'octets A original',
    )
  })

  it('la fiche échoue : les deux fichiers copiés sont retirés', async () => {
    sim.refuser('classeur_images', 'insert')
    await expect(
      copierImageVersClasseur(imageA(), ARRIVEE, uuidN(7)),
    ).rejects.toMatchObject({
      code: '42501',
    })
    expect(
      [...sim.stockage[BUCKET].keys()].filter((c) => c.startsWith('5/')),
    ).toEqual([D])
  })

  it('l’original échoue : la copie d’affichage est retirée', async () => {
    sim.panneAuAppel(2)
    await expect(
      copierImageVersClasseur(imageA(), ARRIVEE, uuidN(7)),
    ).rejects.toBeTruthy()
    expect(
      [...sim.stockage[BUCKET].keys()].filter((c) => c.startsWith('5/')),
    ).toEqual([D])
  })

  it('image sans original : un seul fichier', async () => {
    const f = await copierImageVersClasseur(
      ligne('classeur_images', 2) as unknown as Parameters<
        typeof copierImageVersClasseur
      >[0],
      ARRIVEE,
      uuidN(8),
    )
    expect(f.original_chemin).toBeNull()
    expect(sim.journal.filter((j) => j.operation === 'copy')).toHaveLength(1)
  })
})

describe('refus du seul classeur d’ARRIVÉE sur le déplacement (WITH CHECK)', () => {
  it('erreur 42501, rien n’a bougé à l’origine, copies retirées', async () => {
    poserRls(sim, { 2: 'ecriture', 5: 'ecriture' })
    // Images permises à l'arrivée, mais la NOUVELLE ligne du document y
    // est refusée (droits retirés entre-temps sur le chapitre d'arrivée).
    sim.politique('classeur_documents', 'update', {
      check: (l) => l.chapter_id !== 50,
    })
    const avant = photoOrigine(sim)
    const err = await jouer('deplacer')
    expect(err).toMatchObject({ code: '42501' })
    expect(photoOrigine(sim)).toBe(avant)
    invariants(avant, true)
    expect(
      [...sim.stockage[BUCKET].keys()].filter((c) => c.startsWith('5/')),
    ).toEqual([D])
  })
})

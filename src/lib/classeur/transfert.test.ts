import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import { niveauEffectif } from '#/lib/classeur/droits.ts'
import type {
  NiveauClasseur,
  NiveauEffectif,
  NiveauPage,
} from '#/lib/classeur/droits.ts'
import { imagesReferencees } from '#/lib/classeur/images.ts'
import {
  classeursCibles,
  imagesATransferer,
  peutTransferer,
  planTransfert,
  reecrireChemins,
} from '#/lib/classeur/transfert.ts'
import type {
  DemandeTransfert,
  OperationTransfert,
} from '#/lib/classeur/transfert.ts'
import type { ChapterItem, DbDocument, DbImage } from '#/lib/classeur/types.ts'

// `vi.mock` est hissé : `images.ts` importe le service, donc le client.
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

/*
 * ORACLES écrits à la main AVANT le code (règle /martin) :
 *   - le générateur de Markdown sait quels chemins de l'origine il a posés
 *     (modèle) ;
 *   - `CHEMIN_ORIGINE` repère une destination `](2/<uuid>.webp` ou
 *     `]: 2/<uuid>.webp` — jamais « 12/… » (piège du préfixe) ;
 *   - `TOUT_CHEMIN` masque n'importe quel chemin de bucket pour comparer
 *     le reste de la ligne au caractère près.
 */
const ORIGINE = 2
const AUTRE_CLASSEUR = 12 // « 12/ » contient « 2/ » : piège du préfixe
const ARRIVEE = 7
const CHEMIN_ORIGINE =
  /(?:\]\(\s*<?|\]:[ \t]*<?)2\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp/gi
const TOUT_CHEMIN =
  /[0-9]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp/gi
const masquer = (s: string) => s.replace(TOUT_CHEMIN, '§')
const PARAMS = { numRuns: 1000, seed: 20261004 }

const U = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'abcdefab-cdef-4abc-8def-abcdefabcdef',
]
/** Une image de la médiathèque de l'origine qui n'est utilisée nulle part. */
const U_INUTILISEE = '99999999-9999-4999-8999-999999999999'
const chemin = (classeur: number, uuid: string) =>
  `${String(classeur)}/${uuid}.webp`

function fiche(uuid: string, extra: Partial<DbImage> = {}): DbImage {
  return {
    id: parseInt(uuid.slice(0, 6), 16),
    uuid,
    classeur_id: ORIGINE,
    chemin: chemin(ORIGINE, uuid),
    nom: `photo ${uuid.slice(0, 4)}`,
    taille: 1000,
    largeur: 1600,
    hauteur: 1200,
    original_chemin: `${String(ORIGINE)}/${uuid}.original.webp`,
    original_largeur: 4000,
    original_hauteur: 3000,
    original_taille: 9000,
    deleted_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    created_by: null,
    ...extra,
  }
}

/** Médiathèque : toutes les images du jeu (une sans original) + une inutilisée. */
const MEDIATHEQUE: DbImage[] = [
  fiche(U[0]),
  fiche(U[1], { original_chemin: null, original_largeur: null }),
  fiche(U[2]),
  fiche(U[3]),
  fiche(U_INUTILISEE),
]

function uuidsSequentiels(): () => string {
  let n = 0
  return () => {
    n += 1
    return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
  }
}

function doc(id: number, content: string, extra: Partial<DbDocument> = {}) {
  return {
    kind: 'document' as const,
    data: {
      id,
      uuid: `uuid-doc-${String(id)}`,
      chapter_id: 50,
      title: `Doc ${String(id)}`,
      description: 'desc',
      content,
      sort_order: id,
      deleted_at: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-02T00:00:00Z',
      version_majeure: 3,
      version_mineure: 4,
      ...extra,
    },
  }
}

// ---------------------------------------------------------------------------
// Générateur de Markdown avec modèle
// ---------------------------------------------------------------------------

interface Fragment {
  texte: string
  /** Chemins de l'origine posés (minuscules). */
  origines: string[]
}

const caractere = fc.constantFrom(
  'a',
  'é',
  ' ',
  ']',
  '[',
  '"',
  '(',
  ')',
  '!',
  ':',
  '<',
  '>',
  '\\',
  '2',
  '/',
)
const morceau = fc.array(caractere, { maxLength: 8 }).map((cs) => cs.join(''))

const cible = fc.oneof(
  fc.constantFrom(...U).map((u) => ({ c: chemin(ORIGINE, u), o: true })),
  // Même image en majuscules : même fichier pour la base (comparaison
  // insensible à la casse, comme `imagesReferencees`).
  fc
    .constantFrom(...U)
    .map((u) => ({ c: chemin(ORIGINE, u).toUpperCase(), o: true })),
  fc
    .constantFrom(...U)
    .map((u) => ({ c: chemin(AUTRE_CLASSEUR, u), o: false })),
  fc.constant({ c: 'a-inserer', o: false }),
  fc.constant({ c: 'https://exemple.fr/photo.webp', o: false }),
  fc.constant({ c: `https://exemple.fr/${chemin(ORIGINE, U[0])}`, o: false }),
)

const titre = fc.constantFrom(
  '',
  ' "petite"',
  ' "moyenne cadre=10.5,20,30,40"',
  ' "entiere cadre=0,0,50,50"',
  ' "grande"',
  ' "a "b" c"',
)

const image: fc.Arbitrary<Fragment> = fc
  .tuple(morceau, cible, titre, fc.constantFrom('', '<', ' '))
  .map(([legende, { c, o }, t, ouvrant]) => ({
    texte: `![${legende}](${ouvrant}${c}${ouvrant === '<' ? '>' : ''}${t})`,
    origines: o ? [c.toLowerCase()] : [],
  }))

const definition: fc.Arbitrary<Fragment> = cible.map(({ c, o }) => ({
  texte: `[ref]: ${c}`,
  origines: o ? [c.toLowerCase()] : [],
}))

const ligneSpeciale = fc
  .constantFrom(
    ':::photos',
    ':::etape{photo=gauche}',
    ':::',
    '```',
    '===',
    '> [!WARNING]',
    '',
    '- [ ] case',
  )
  .map((texte): Fragment => ({ texte, origines: [] }))

const ligne: fc.Arbitrary<Fragment> = fc.oneof(
  ligneSpeciale,
  definition,
  fc
    .array(
      fc.oneof(
        morceau.map((texte): Fragment => ({ texte, origines: [] })),
        image,
      ),
      { maxLength: 5 },
    )
    .map((fs) => ({
      texte: fs.map((f) => f.texte).join(''),
      origines: fs.flatMap((f) => f.origines),
    })),
)

const markdown: fc.Arbitrary<Fragment> = fc
  .array(ligne, { maxLength: 12 })
  .map((ls) => ({
    texte: ls.map((l) => l.texte).join('\n'),
    origines: ls.flatMap((l) => l.origines),
  }))

const correspondancesFixes = new Map(
  U.map((u, i) => [
    chemin(ORIGINE, u),
    chemin(ARRIVEE, `00000000-0000-4000-8000-00000000000${String(i)}`),
  ]),
)

// ---------------------------------------------------------------------------
// imagesATransferer + reecrireChemins : propriétés
// ---------------------------------------------------------------------------

describe('imagesATransferer — propriétés (modèle du générateur)', () => {
  it('exactement les images de l’origine posées, chacune une fois', () => {
    fc.assert(
      fc.property(fc.array(markdown, { maxLength: 4 }), (docs) => {
        const attendu = new Set(docs.flatMap((d) => d.origines))
        const obtenu = imagesATransferer(
          docs.map((d) => ({ content: d.texte })),
          ORIGINE,
        )
        expect(new Set(obtenu).size).toBe(obtenu.length)
        expect(new Set(obtenu)).toEqual(attendu)
      }),
      PARAMS,
    )
  })

  it('contient ce que voit `imagesReferencees` (filtré sur l’origine)', () => {
    fc.assert(
      fc.property(markdown, (md) => {
        const obtenu = new Set(
          imagesATransferer([{ content: md.texte }], ORIGINE),
        )
        for (const c of imagesReferencees(md.texte)) {
          if (c.startsWith(`${String(ORIGINE)}/`))
            expect(obtenu.has(c)).toBe(true)
        }
      }),
      PARAMS,
    )
  })
})

describe('reecrireChemins — propriétés', () => {
  it('plus aucun chemin de l’origine après réécriture', () => {
    fc.assert(
      fc.property(markdown, (md) => {
        const r = reecrireChemins(md.texte, correspondancesFixes)
        expect(r.match(CHEMIN_ORIGINE)).toBeNull()
      }),
      PARAMS,
    )
  })

  it('hors chemin, chaque ligne est identique au caractère près', () => {
    fc.assert(
      fc.property(markdown, (md) => {
        const r = reecrireChemins(md.texte, correspondancesFixes)
        const avant = md.texte.split('\n')
        const apres = r.split('\n')
        expect(apres.length).toBe(avant.length)
        apres.forEach((l, i) => {
          expect(masquer(l)).toBe(masquer(avant[i]))
        })
      }),
      PARAMS,
    )
  })

  it('chaque chemin de l’origine devient SA correspondance (et rien d’autre ne bouge)', () => {
    fc.assert(
      fc.property(markdown, (md) => {
        const r = reecrireChemins(md.texte, correspondancesFixes)
        const chemins = (s: string) => s.match(TOUT_CHEMIN) ?? []
        const avant = chemins(md.texte)
        const apres = chemins(r)
        expect(apres.length).toBe(avant.length)
        // Les chemins hors destination (URL externe) gardent la forme 2/… :
        // on ne vérifie que ceux que le modèle a posés en destination.
        let k = 0
        for (const c of md.origines) {
          const nouveau = correspondancesFixes.get(c)
          expect(nouveau).toBeDefined()
          expect(r.includes(nouveau ?? '')).toBe(true)
          k += 1
        }
        expect(k).toBe(md.origines.length)
      }),
      PARAMS,
    )
  })

  it('a-inserer et URL externes intacts ; idempotence', () => {
    fc.assert(
      fc.property(markdown, (md) => {
        const r = reecrireChemins(md.texte, correspondancesFixes)
        const compte = (s: string, motif: string) => s.split(motif).length - 1
        expect(compte(r, '](a-inserer')).toBe(compte(md.texte, '](a-inserer'))
        expect(compte(r, 'https://exemple.fr/photo.webp')).toBe(
          compte(md.texte, 'https://exemple.fr/photo.webp'),
        )
        expect(compte(r, `https://exemple.fr/${chemin(ORIGINE, U[0])}`)).toBe(
          compte(md.texte, `https://exemple.fr/${chemin(ORIGINE, U[0])}`),
        )
        expect(reecrireChemins(r, correspondancesFixes)).toBe(r)
      }),
      PARAMS,
    )
  })
})

describe('reecrireChemins — exemples écrits à la main', () => {
  const a = chemin(ORIGINE, U[0])
  const b = chemin(ARRIVEE, U[3])
  const table = new Map([[a, b]])

  it('légende avec ] et ", titre, cadre : seul le chemin change (D9)', () => {
    const md = `Avant ![Vue \\] "1" [détail]](${a} "moyenne cadre=10,20,30,40") après`
    expect(reecrireChemins(md, table)).toBe(
      `Avant ![Vue \\] "1" [détail]](${b} "moyenne cadre=10,20,30,40") après`,
    )
  })

  it('chevrons, espace, majuscules et définition de référence', () => {
    expect(reecrireChemins(`![x](<${a}> "entiere")`, table)).toBe(
      `![x](<${b}> "entiere")`,
    )
    expect(reecrireChemins(`![x]( ${a})`, table)).toBe(`![x]( ${b})`)
    expect(reecrireChemins(`![x](${a.toUpperCase()})`, table)).toBe(
      `![x](${b})`,
    )
    expect(reecrireChemins(`[r]: ${a}\n`, table)).toBe(`[r]: ${b}\n`)
    expect(reecrireChemins(`[r]:\t<${a}>`, table)).toBe(`[r]:\t<${b}>`)
    expect(reecrireChemins(`[r]:<${a}>`, table)).toBe(`[r]:<${b}>`)
  })

  it('ne touche pas : autre classeur, a-inserer, URL, chemin sans fin propre, texte nu', () => {
    const intacts = [
      `![x](${chemin(AUTRE_CLASSEUR, U[0])})`,
      '![x](a-inserer "petite")',
      `![x](https://exemple.fr/${a})`,
      `![x](${a}x)`,
      `Voir ${a} dans le texte`,
      `![x](${a.replace('.webp', '.original.webp')})`,
    ]
    for (const md of intacts) expect(reecrireChemins(md, table)).toBe(md)
  })

  it('un chemin absent de la table reste tel quel ; table vide = identité', () => {
    const md = `![x](${chemin(ORIGINE, U[1])})`
    expect(reecrireChemins(md, table)).toBe(md)
    expect(reecrireChemins(`![x](${a})`, new Map())).toBe(`![x](${a})`)
  })

  it('imagesATransferer : ordre d’apparition, doublons, piège 12/, définitions', () => {
    const c1 = chemin(ORIGINE, U[1])
    const docs = [
      { content: `![](${c1}) ![](${a}) ![](${c1.toUpperCase()})` },
      {
        content: `![](${chemin(AUTRE_CLASSEUR, U[2])}) ![](a-inserer)\n[r]: ${chemin(ORIGINE, U[2])}`,
      },
    ]
    expect(imagesATransferer(docs, ORIGINE)).toEqual([
      c1,
      a,
      chemin(ORIGINE, U[2]),
    ])
    expect(imagesATransferer(docs, AUTRE_CLASSEUR)).toEqual([
      chemin(AUTRE_CLASSEUR, U[2]),
    ])
    expect(imagesATransferer([], ORIGINE)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Droits
// ---------------------------------------------------------------------------

const NIVEAUX: NiveauEffectif[] = ['aucun', 'lecture', 'ecriture', 'gestion']

describe('peutTransferer — table complète (D6)', () => {
  it('écriture ou gestion des DEUX côtés, dans les deux modes', () => {
    const ok = (n: NiveauEffectif) => n === 'ecriture' || n === 'gestion'
    for (const mode of ['copier', 'deplacer'] as const)
      for (const o of NIVEAUX)
        for (const a of NIVEAUX)
          expect(peutTransferer(mode, o, a)).toBe(ok(o) && ok(a))
  })
})

describe('classeursCibles', () => {
  const MOI = '00000000-0000-0000-0000-000000000001'
  const AUTRE = '00000000-0000-0000-0000-000000000002'
  const niveauC = fc.constantFrom<NiveauClasseur>(
    'aucun',
    'lecture',
    'ecriture',
  )
  const classeur = fc.record({
    id: fc.integer({ min: 1, max: 8 }),
    created_by: fc.constantFrom<string | null>(MOI, AUTRE, null),
    acces_tous: niveauC,
    deleted_at: fc.constantFrom<string | null>(null, null, '2026-10-01'),
  })

  it('jamais un classeur sous l’écriture, jamais l’origine ni un supprimé, rien d’oublié (oracle niveauEffectif)', () => {
    fc.assert(
      fc.property(
        fc.array(classeur, { maxLength: 8 }),
        fc.constantFrom<NiveauPage>(null, 'lecture', 'ecriture', 'gestion'),
        fc.array(fc.tuple(fc.integer({ min: 1, max: 8 }), niveauC), {
          maxLength: 5,
        }),
        fc.constantFrom<string | null>(MOI, null),
        fc.integer({ min: 1, max: 8 }),
        fc.constantFrom('copier' as const, 'deplacer' as const),
        (classeurs, page, exc, userId, origine, mode) => {
          const exceptions = new Map(exc)
          const droits = { page, exceptions, userId }
          const r = classeursCibles(classeurs, droits, origine, mode)
          const niveau = (c: (typeof classeurs)[number]) =>
            niveauEffectif(page, c, exceptions.get(c.id), userId)
          for (const c of r) {
            expect(['ecriture', 'gestion']).toContain(niveau(c))
            expect(c.id).not.toBe(origine)
            expect(c.deleted_at).toBeNull()
          }
          const attendu = classeurs.filter(
            (c) =>
              c.id !== origine &&
              c.deleted_at === null &&
              (niveau(c) === 'ecriture' || niveau(c) === 'gestion'),
          )
          expect(r).toEqual(attendu)
        },
      ),
      { numRuns: 500, seed: 20261004 },
    )
  })

  it('exemples : privé non accessible absent, exception lecture retire le créateur', () => {
    const cs = [
      {
        id: 1,
        created_by: AUTRE,
        acces_tous: 'ecriture' as const,
        deleted_at: null,
      },
      {
        id: 2,
        created_by: AUTRE,
        acces_tous: 'aucun' as const,
        deleted_at: null,
      },
      {
        id: 3,
        created_by: MOI,
        acces_tous: 'lecture' as const,
        deleted_at: null,
      },
      {
        id: 4,
        created_by: AUTRE,
        acces_tous: 'lecture' as const,
        deleted_at: null,
      },
    ]
    const droits = {
      page: 'ecriture' as const,
      exceptions: new Map<number, NiveauClasseur>([[3, 'lecture']]),
      userId: MOI,
    }
    expect(classeursCibles(cs, droits, 9, 'copier').map((c) => c.id)).toEqual([
      1,
    ])
    expect(classeursCibles(cs, droits, 1, 'deplacer').map((c) => c.id)).toEqual(
      [],
    )
    const gestion = { ...droits, page: 'gestion' as const }
    expect(classeursCibles(cs, gestion, 1, 'copier').map((c) => c.id)).toEqual([
      2, 3, 4,
    ])
  })
})

// ---------------------------------------------------------------------------
// planTransfert
// ---------------------------------------------------------------------------

function demande(
  elements: ChapterItem[],
  extra: Partial<DemandeTransfert> = {},
): DemandeTransfert {
  return {
    mode: 'copier',
    elements,
    origine: ORIGINE,
    arrivee: ARRIVEE,
    chapitreArrivee: 70,
    ordreSuivant: 5,
    imagesOrigine: MEDIATHEQUE,
    nouveauxUuids: uuidsSequentiels(),
    ...extra,
  }
}

const estEcriture = (o: OperationTransfert) =>
  o.type === 'insererElement' || o.type === 'deplacerElement'

describe('planTransfert — propriétés', () => {
  it('points en tête, copies uniques avant les fiches puis les éléments, aucun chemin cassé', () => {
    fc.assert(
      fc.property(
        fc.array(markdown, { minLength: 1, maxLength: 4 }),
        fc.constantFrom('copier' as const, 'deplacer' as const),
        (docs, mode) => {
          const elements = docs.map((d, i) => doc(i + 1, d.texte))
          const plan = planTransfert(demande(elements, { mode }))
          const ops = plan.operations
          const utilisees = new Set(docs.flatMap((d) => d.origines))

          // 1. Les deux points, en tête, avant toute écriture.
          expect(ops.slice(0, 2)).toEqual([
            { type: 'point', classeurId: ORIGINE },
            { type: 'point', classeurId: ARRIVEE },
          ])
          expect(ops.slice(2).some((o) => o.type === 'point')).toBe(false)

          // 2. Copie unique par image UTILISÉE ; l'inutilisée jamais.
          const copies = ops.filter((o) => o.type === 'copierFichier')
          const sources = copies.map((o) => o.source)
          expect(new Set(sources).size).toBe(sources.length)
          const affichages = sources.filter((s) => !s.includes('.original.'))
          expect(new Set(affichages)).toEqual(utilisees)
          expect(sources.some((s) => s.includes(U_INUTILISEE))).toBe(false)
          expect(plan.introuvables).toEqual([])

          // 3. Chaque fiche après SES fichiers ; toute écriture après tout ça.
          const premiereEcriture = ops.findIndex(estEcriture)
          ops.forEach((o, i) => {
            if (o.type === 'creerFiche') {
              const avant = ops
                .slice(0, i)
                .flatMap((p) =>
                  p.type === 'copierFichier' ? [p.destination] : [],
                )
              expect(avant).toContain(o.fiche.chemin)
              if (o.fiche.original_chemin !== null)
                expect(avant).toContain(o.fiche.original_chemin)
              expect(i).toBeLessThan(premiereEcriture)
            }
            if (o.type === 'copierFichier')
              expect(i).toBeLessThan(premiereEcriture)
          })

          // 4. Les éléments : contenu sans chemin de l'origine, chaque chemin
          //    d'arrivée adossé à une fiche créée.
          const fichesCreees = new Set(
            ops.flatMap((o) =>
              o.type === 'creerFiche' ? [o.fiche.chemin] : [],
            ),
          )
          const ecritures = ops.filter(estEcriture)
          expect(ecritures.length).toBe(elements.length)
          ecritures.forEach((o, i) => {
            expect(o.sortOrder).toBe(5 + i)
            expect(o.chapterId).toBe(70)
            const contenu =
              o.type === 'insererElement'
                ? o.kind === 'document'
                  ? o.champs.content
                  : ''
                : (o.content ?? elements[i].data.content)
            expect(contenu.match(CHEMIN_ORIGINE)).toBeNull()
            for (const c of imagesATransferer([{ content: contenu }], ARRIVEE))
              expect(fichesCreees.has(c)).toBe(true)
            if (o.type === 'insererElement') {
              expect(o.kind).toBe('document')
              if (o.kind === 'document') {
                expect(o.champs.version_majeure).toBe(1)
                expect(o.champs.version_mineure).toBe(0)
                expect(masquer(o.champs.content)).toBe(
                  masquer(elements[i].data.content),
                )
              }
              expect('uuid' in o.champs).toBe(false)
              expect('id' in o.champs).toBe(false)
            } else {
              expect(o.id).toBe(elements[i].data.id)
              // Le contenu n'est réécrit QUE s'il change.
              expect(o.content === undefined).toBe(
                elements[i].data.content.match(CHEMIN_ORIGINE) === null,
              )
            }
          })
        },
      ),
      PARAMS,
    )
  })
})

describe('planTransfert — exemples', () => {
  const a = chemin(ORIGINE, U[0])
  const sansOriginal = chemin(ORIGINE, U[1])

  it('copie : suite exacte des opérations', () => {
    const plan = planTransfert(
      demande([
        doc(
          1,
          `![Légende](${a} "moyenne cadre=1,2,3,4")\n![x](${sansOriginal})\n![](${a})`,
        ),
      ]),
    )
    const n1 = chemin(ARRIVEE, '00000000-0000-4000-8000-000000000001')
    const n2 = chemin(ARRIVEE, '00000000-0000-4000-8000-000000000002')
    const f0 = MEDIATHEQUE[0]
    const f1 = MEDIATHEQUE[1]
    expect(plan.operations).toEqual([
      { type: 'point', classeurId: ORIGINE },
      { type: 'point', classeurId: ARRIVEE },
      { type: 'copierFichier', source: a, destination: n1 },
      {
        type: 'copierFichier',
        source: `2/${U[0]}.original.webp`,
        destination: `7/00000000-0000-4000-8000-000000000001.original.webp`,
      },
      {
        type: 'creerFiche',
        classeurId: ARRIVEE,
        ficheOrigineId: f0.id,
        fiche: {
          chemin: n1,
          nom: f0.nom,
          taille: 1000,
          largeur: 1600,
          hauteur: 1200,
          original_chemin: `7/00000000-0000-4000-8000-000000000001.original.webp`,
          original_largeur: 4000,
          original_hauteur: 3000,
          original_taille: 9000,
        },
      },
      { type: 'copierFichier', source: sansOriginal, destination: n2 },
      {
        type: 'creerFiche',
        classeurId: ARRIVEE,
        ficheOrigineId: f1.id,
        fiche: {
          chemin: n2,
          nom: f1.nom,
          taille: 1000,
          largeur: 1600,
          hauteur: 1200,
          original_chemin: null,
          original_largeur: null,
          original_hauteur: 3000,
          original_taille: 9000,
        },
      },
      {
        type: 'insererElement',
        elementOrigineId: 1,
        chapterId: 70,
        sortOrder: 5,
        kind: 'document',
        champs: {
          title: 'Doc 1',
          description: 'desc',
          content: `![Légende](${n1} "moyenne cadre=1,2,3,4")\n![x](${n2})\n![](${n1})`,
          version_majeure: 1,
          version_mineure: 0,
        },
      },
    ])
    expect(plan.correspondances).toEqual([
      { source: a, destination: n1 },
      { source: sansOriginal, destination: n2 },
    ])
  })

  it('copie des autres natures : leurs champs, sans uuid ni id', () => {
    const base = {
      uuid: 'u',
      chapter_id: 50,
      sort_order: 1,
      deleted_at: null,
      created_at: '',
      updated_at: '',
    }
    const plan = planTransfert(
      demande([
        {
          kind: 'tracking_sheet',
          data: { ...base, id: 11, title: 'Suivi', periodicite_id: 3 },
        },
        {
          kind: 'signature_sheet',
          data: {
            ...base,
            id: 12,
            title: 'Émargement',
            description: 'd',
            nombre: 20,
          },
        },
        {
          kind: 'intercalaire',
          data: { ...base, id: 13, title: 'Partie', description: 'p' },
        },
      ]),
    )
    expect(plan.operations.slice(2)).toEqual([
      {
        type: 'insererElement',
        elementOrigineId: 11,
        chapterId: 70,
        sortOrder: 5,
        kind: 'tracking_sheet',
        champs: { title: 'Suivi', periodicite_id: 3 },
      },
      {
        type: 'insererElement',
        elementOrigineId: 12,
        chapterId: 70,
        sortOrder: 6,
        kind: 'signature_sheet',
        champs: { title: 'Émargement', description: 'd', nombre: 20 },
      },
      {
        type: 'insererElement',
        elementOrigineId: 13,
        chapterId: 70,
        sortOrder: 7,
        kind: 'intercalaire',
        champs: { title: 'Partie', description: 'p' },
      },
    ])
  })

  it('déplacement : chapitre et ordre ; contenu seulement s’il change', () => {
    const plan = planTransfert(
      demande([doc(1, 'Sans image'), doc(2, `![](${a})`)], {
        mode: 'deplacer',
      }),
    )
    const ecritures = plan.operations.filter(estEcriture)
    expect(ecritures).toEqual([
      {
        type: 'deplacerElement',
        kind: 'document',
        id: 1,
        chapterId: 70,
        sortOrder: 5,
      },
      {
        type: 'deplacerElement',
        kind: 'document',
        id: 2,
        chapterId: 70,
        sortOrder: 6,
        content: `![](${chemin(ARRIVEE, '00000000-0000-4000-8000-000000000001')})`,
      },
    ])
  })

  it('déplacement d’un élément sans contenu : chapitre et ordre seuls', () => {
    const plan = planTransfert(
      demande(
        [
          {
            kind: 'intercalaire',
            data: {
              id: 13,
              uuid: 'u',
              chapter_id: 50,
              title: 'Partie',
              description: 'p',
              sort_order: 1,
              deleted_at: null,
              created_at: '',
              updated_at: '',
            },
          },
        ],
        { mode: 'deplacer' },
      ),
    )
    expect(plan.operations.at(-1)).toEqual({
      type: 'deplacerElement',
      kind: 'intercalaire',
      id: 13,
      chapterId: 70,
      sortOrder: 5,
    })
  })

  it('déplacement dans le même classeur : un seul point, rien à copier', () => {
    const plan = planTransfert(
      demande([doc(1, `![](${a})`)], { mode: 'deplacer', arrivee: ORIGINE }),
    )
    expect(plan.operations).toEqual([
      { type: 'point', classeurId: ORIGINE },
      {
        type: 'deplacerElement',
        kind: 'document',
        id: 1,
        chapterId: 70,
        sortOrder: 5,
      },
    ])
    expect(plan.correspondances).toEqual([])
    expect(plan.introuvables).toEqual([])
  })

  it('image sans fiche vivante : introuvable, ni copiée ni réécrite', () => {
    const supprimee = chemin(ORIGINE, U[2])
    const orpheline = chemin(ORIGINE, '44444444-4444-4444-8444-444444444444')
    const plan = planTransfert(
      demande([doc(1, `![](${supprimee}) ![](${orpheline}) ![](${a})`)], {
        imagesOrigine: [fiche(U[0]), fiche(U[2], { deleted_at: '2026-10-02' })],
      }),
    )
    expect(plan.introuvables).toEqual([supprimee, orpheline])
    expect(plan.correspondances.map((c) => c.source)).toEqual([a])
    const ins = plan.operations.at(-1)
    expect(
      ins?.type === 'insererElement' &&
        ins.kind === 'document' &&
        ins.champs.content,
    ).toBe(
      `![](${supprimee}) ![](${orpheline}) ![](${chemin(ARRIVEE, '00000000-0000-4000-8000-000000000001')})`,
    )
  })

  it('fiche rangée en majuscules : retrouvée', () => {
    const plan = planTransfert(
      demande([doc(1, `![](${a})`)], {
        imagesOrigine: [fiche(U[0], { chemin: a.toUpperCase() })],
      }),
    )
    expect(plan.introuvables).toEqual([])
    expect(plan.operations[2]).toEqual({
      type: 'copierFichier',
      source: a.toUpperCase(),
      destination: chemin(ARRIVEE, '00000000-0000-4000-8000-000000000001'),
    })
  })

  it('refus : copie vers le même classeur, élément supprimé, uuid invalide ou répété', () => {
    expect(() =>
      planTransfert(demande([doc(1, '')], { arrivee: ORIGINE })),
    ).toThrow(/autre classeur/)
    expect(() =>
      planTransfert(
        demande([doc(1, '', { deleted_at: '2026-10-01' })], {
          mode: 'deplacer',
        }),
      ),
    ).toThrow(/supprimé/)
    expect(() =>
      planTransfert(
        demande([doc(1, ''), doc(2, '', { deleted_at: '2026-10-01' })]),
      ),
    ).toThrow(/supprimé/)
    expect(() =>
      planTransfert(
        demande([doc(1, `![](${a})`)], { nouveauxUuids: () => 'pas-un-uuid' }),
      ),
    ).toThrow(/invalide/)
    expect(() =>
      planTransfert(
        demande([doc(1, `![](${a}) ![](${sansOriginal})`)], {
          nouveauxUuids: () => U[3],
        }),
      ),
    ).toThrow(/invalide/)
    // Majuscules générées : rangées en minuscules.
    const plan = planTransfert(
      demande([doc(1, `![](${a})`)], {
        nouveauxUuids: () => U[3].toUpperCase(),
      }),
    )
    expect(plan.correspondances[0].destination).toBe(chemin(ARRIVEE, U[3]))
  })
})

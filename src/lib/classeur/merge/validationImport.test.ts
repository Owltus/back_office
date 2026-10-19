import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

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
import { planifierImportIa } from '#/lib/classeur/merge/importIa.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import { planifierFusionPortee } from '#/lib/classeur/merge/portee.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import {
  estUuid,
  planAvecValidation,
  validerFichierImport,
} from '#/lib/classeur/merge/validationImport.ts'
import type { ChapterContent, DbChapter } from '#/lib/classeur/types.ts'
import { ITEM_KINDS } from '#/lib/classeur/types.ts'

/*
 * Validation avant toute écriture (étape 6 du plan
 * `classeur-echange-ia-2026-10-19`), règles V1 à V8 de `validationImport.ts`.
 * Oracles posés à la main (messages exacts) ; un fichier VALIDE est rendu
 * tel quel (même objet), propriété sur 1000 états.
 */

const U = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const A = chapitre({ id: 10, label: 'Accueil', uuid: U(10) })
const ts = suivi({
  id: 3,
  chapter_id: 10,
  title: 'Relevé',
  uuid: U(3),
  periodicite_id: 41,
})
const sig = signature({
  id: 4,
  chapter_id: 10,
  title: 'Émargement',
  uuid: U(4),
  nombre: 14,
})
const doc = document({
  id: 1,
  chapter_id: 10,
  title: 'Check-in',
  uuid: U(1),
  content: 'Accueillir',
})
const local = etat([A], {
  documents: [doc],
  tracking_sheets: [ts],
  signature_sheets: [sig],
})
const exp = () => construireExport(classeur(), [A], local.content, PERIODICITES)

/** Le fichier d'un seul chapitre, avec ces éléments. */
const avec = (items: ClasseurJson['chapters'][number]['items']) =>
  fichier([chJson({ label: 'Accueil', uuid: U(10), items })], {
    _metadata: exp()._metadata,
  })

const messages = (f: ClasseurJson) =>
  validerFichierImport(f, local).avertissements

describe('validerFichierImport — un fichier valide passe TEL QUEL', () => {
  it('l’export lui-même : même objet, aucun avertissement', () => {
    const f = exp()
    const v = validerFichierImport(f, local)
    expect(v.fichier).toBe(f)
    expect(v.avertissements).toEqual([])
    expect(v.proteges.size).toBe(0)
  })

  it('uuids de test non canoniques mais CONNUS localement : gardés', () => {
    const B = chapitre({ id: 20, label: 'B' })
    const l = etat([B], {
      documents: [document({ id: 7, chapter_id: 20, title: 'D' })],
    })
    const f = construireExport(classeur(), [B], l.content, PERIODICITES)
    expect(validerFichierImport(f, l).fichier).toBe(f)
  })

  const etatArb = fc
    .array(
      fc.record({
        kind: fc.constantFrom(...ITEM_KINDS),
        titre: fc.constantFrom('a', 'Consignes', ' x ', ''),
        uuid: fc.uuid(),
        nombre: fc.integer({ min: 1, max: 60 }),
        perio: fc.constantFrom(41, 44, 49),
        supprime: fc.boolean(),
      }),
      { maxLength: 8 },
    )
    .map((items) => {
      const ch: DbChapter = chapitre({ id: 10, label: 'C', uuid: U(10) })
      const content: ChapterContent = {
        documents: [],
        tracking_sheets: [],
        signature_sheets: [],
        intercalaires: [],
      }
      items.forEach((it, i) => {
        const base = {
          id: i + 1,
          chapter_id: 10,
          title: it.titre,
          uuid: it.uuid,
          sort_order: i,
          deleted_at: it.supprime ? '2026-02-01T00:00:00+00:00' : null,
        }
        if (it.kind === 'document') content.documents.push(document(base))
        else if (it.kind === 'tracking_sheet')
          content.tracking_sheets.push(
            suivi({ ...base, periodicite_id: it.perio }),
          )
        else if (it.kind === 'signature_sheet')
          content.signature_sheets.push(
            signature({ ...base, nombre: it.nombre }),
          )
        else content.intercalaires.push(intercalaire(base))
      })
      return etat([ch], content)
    })

  it('propriété : tout export de la base est rendu tel quel (1000 états)', () => {
    fc.assert(
      fc.property(etatArb, (l) => {
        const f = construireExport(
          classeur(),
          l.chapters,
          l.content,
          PERIODICITES,
        )
        const v = validerFichierImport(f, l)
        expect(v.fichier).toBe(f)
        expect(v.avertissements).toEqual([])
        // Et le plan validé est celui d'avant l'étape 6.
        const planifier = (x: ClasseurJson) =>
          planifierImportIa(l, x, { supprimerAbsents: true })
        expect(planAvecValidation(l, f, planifier)).toEqual(planifier(f))
      }),
      { numRuns: 1000, seed: 20261020 },
    )
  })
})

describe('V1 — nombre de lignes d’une feuille de signature', () => {
  const feuille = (nombre: number) =>
    avec([itJson({ kind: 'signature_sheet', title: 'Émargement', nombre })])
  const nombreDe = (f: ClasseurJson) =>
    validerFichierImport(f, local).fichier.chapters[0].items[0].nombre

  it('dans la borne : inchangé, sans message', () => {
    for (const n of [1, 14, 60]) {
      expect(nombreDe(feuille(n))).toBe(n)
      expect(messages(feuille(n))).toEqual([])
    }
  })

  it('au-delà, en deçà, non entier, illisible : borné, un message', () => {
    expect(nombreDe(feuille(100))).toBe(60)
    expect(messages(feuille(100))).toEqual([
      'Feuille de signature Émargement : 100 lignes demandées, 60 au plus.',
    ])
    expect(nombreDe(feuille(61))).toBe(60)
    expect(nombreDe(feuille(0))).toBe(1)
    expect(messages(feuille(0))).toEqual([
      'Feuille de signature Émargement : 0 ligne demandée, 1 au moins.',
    ])
    expect(nombreDe(feuille(-3))).toBe(1)
    expect(nombreDe(feuille(14.5))).toBe(15)
    expect(messages(feuille(14.5))).toEqual([
      'Feuille de signature Émargement : 14,5 lignes, arrondi à 15.',
    ])
    expect(nombreDe(feuille(Number.NaN))).toBe(14)
    expect(nombreDe(feuille(Number.POSITIVE_INFINITY))).toBe(14)
    expect(nombreDe(feuille(1e20))).toBe(60)
  })
})

describe('V2 — identifiants', () => {
  it('uuid mal formé et inconnu : retiré, un message', () => {
    const f = avec([
      itJson({ kind: 'document', title: 'Plan', uuid: 'doc-1', content: '' }),
    ])
    const v = validerFichierImport(f, local)
    expect('uuid' in v.fichier.chapters[0].items[0]).toBe(false)
    expect(v.avertissements).toEqual([
      'Document Plan : identifiant invalide, retiré.',
    ])
  })

  it('uuid canonique (neuf ou connu) : gardé ; casse indifférente', () => {
    const neuf = '7C9E6679-7425-40DE-944B-E07FC1F90AE7'
    const f = avec([
      itJson({ kind: 'document', title: 'Plan', uuid: neuf, content: '' }),
    ])
    expect(validerFichierImport(f, local).fichier).toBe(f)
  })

  it('uuid de chapitre mal formé : retiré', () => {
    const f = fichier([chJson({ label: 'Neuf', uuid: 'chap-1' })])
    const v = validerFichierImport(f, local)
    expect('uuid' in v.fichier.chapters[0]).toBe(false)
    expect(v.avertissements).toEqual([
      'Chapitre Neuf : identifiant invalide, retiré.',
    ])
  })

  it('estUuid : forme canonique seulement', () => {
    expect(estUuid(U(1))).toBe(true)
    for (const x of [
      '',
      'doc-1',
      `${U(1)}x`,
      `x${U(1)}`,
      U(1).replaceAll('-', ''),
      `{${U(1)}}`,
      '00000000-0000-4000-8000-00000000000g',
    ])
      expect(estUuid(x), x).toBe(false)
  })
})

describe('V3, V4, V5 — périodicités', () => {
  const feuille = (over: Record<string, unknown>) =>
    avec([itJson({ kind: 'tracking_sheet', title: 'Relevé', ...over })])

  it('V3 : id inconnu, feuille existante : périodicité actuelle gardée', () => {
    const f = feuille({ uuid: U(3), periodicite_id: 999 })
    const v = validerFichierImport(f, local)
    expect(v.fichier.chapters[0].items[0].periodicite_id).toBeNull()
    expect(v.avertissements).toEqual([
      'Feuille de suivi Relevé : périodicité n° 999 inconnue, la périodicité actuelle est gardée.',
    ])
    // Et le plan ne change pas la périodicité.
    const plan = planAvecValidation(local, f, (x) =>
      planifierImportIa(local, x, { supprimerAbsents: false }),
    )
    expect(plan.actions).toEqual([])
  })

  it('V3 : id inconnu, création : Non défini appliquée', () => {
    const f = avec([
      itJson({ kind: 'tracking_sheet', title: 'Neuve', periodicite_id: 999 }),
    ])
    expect(messages(f)).toEqual([
      'Feuille de suivi Neuve : périodicité n° 999 inconnue, Non défini appliquée.',
    ])
  })

  it('V3 : id inventé avec un libellé dans le bloc des périodicités', () => {
    const f = avec([
      itJson({ kind: 'tracking_sheet', title: 'Neuve', periodicite_id: 7 }),
    ])
    f._metadata = {
      ...exp()._metadata!,
      periodicites: [{ id: 7, label: 'Trimestriel', nombre: 4 }],
    }
    expect(messages(f)).toEqual([
      'Feuille de suivi Neuve : périodicité Trimestriel inconnue, Non défini appliquée.',
    ])
  })

  it('V4 : libellé du fichier différent de celui de l’id', () => {
    expect(
      messages(
        feuille({ uuid: U(3), periodicite_id: 41, periodicite: 'Annuel' }),
      ),
    ).toEqual([
      'Feuille de suivi Relevé : le fichier dit Annuel, mais la périodicité choisie est Mensuel. Mensuel est gardée.',
    ])
    // Casse et accents : même libellé.
    expect(
      messages(
        feuille({ uuid: U(3), periodicite_id: 41, periodicite: 'MENSUEL' }),
      ),
    ).toEqual([])
  })

  it('V5 : création sans périodicité ; une feuille existante, rien à dire', () => {
    expect(
      messages(avec([itJson({ kind: 'tracking_sheet', title: 'Neuve' })])),
    ).toEqual([
      'Feuille de suivi Neuve : aucune périodicité donnée, Non défini appliquée.',
    ])
    expect(messages(feuille({ uuid: U(3) }))).toEqual([])
    // Existante par son titre (fichier sans uuid).
    expect(messages(feuille({}))).toEqual([])
  })

  it('référentiel absent ou vide : la fusion décide seule, comme avant', () => {
    const f = feuille({ periodicite_id: 999 })
    const sans = { ...local, periodicites: undefined }
    expect(validerFichierImport(f, sans).fichier).toBe(f)
    expect(
      validerFichierImport(f, { ...local, periodicites: [] }).fichier,
    ).toBe(f)
  })
})

describe('V6 — titre vide', () => {
  it('sur un élément existant : ignoré, protégé, un message', () => {
    const f = avec([itJson({ kind: 'document', title: ' ', uuid: U(1) })])
    const v = validerFichierImport(f, local)
    expect(v.fichier.chapters[0].items).toEqual([])
    expect([...v.proteges]).toEqual([U(1)])
    expect(v.avertissements).toEqual([
      'Document Check-in : titre vide dans le fichier, élément laissé tel quel.',
    ])
  })

  it('protégé : jamais supprimé, même case cochée ; le reste l’est', () => {
    const f = avec([itJson({ kind: 'document', title: '', uuid: U(1) })])
    const plan = planAvecValidation(local, f, (x) =>
      planifierFusionPortee(
        local,
        x,
        { type: 'chapitre', chapitreId: 10 },
        { supprimerAbsents: true },
      ),
    )
    const supprimes = plan.actions.flatMap((a) =>
      a.type === 'supprimerItem' ? [`${a.kind}:${String(a.id)}`] : [],
    )
    expect(supprimes).toEqual(['tracking_sheet:3', 'signature_sheet:4'])
    expect(plan.resultat.deleted).toBe(2)
    expect(plan.warnings[0]).toMatch(/titre vide dans le fichier/)
  })

  it('sans élément existant : ignoré, un message', () => {
    expect(
      messages(avec([itJson({ kind: 'intercalaire', title: '' })])),
    ).toEqual(['Chapitre Accueil : un élément sans titre a été ignoré.'])
  })

  it('déjà sans titre en base : passe tel quel (E8)', () => {
    const vide = etat([A], {
      documents: [{ ...doc, title: '' }],
    })
    const f = construireExport(classeur(), [A], vide.content, PERIODICITES)
    expect(validerFichierImport(f, vide).fichier).toBe(f)
  })
})

describe('V7 — bloc des périodicités retouché', () => {
  it('venu de cette base, une entrée changée : remplacé, un message', () => {
    const f = avec([
      itJson({ kind: 'tracking_sheet', title: 'Relevé', periodicite_id: 41 }),
    ])
    f._metadata = {
      ...exp()._metadata!,
      periodicites: [
        { id: 41, label: 'Trimestriel', nombre: 8 },
        { id: 44, label: 'Annuel', nombre: 8 },
      ],
    }
    const v = validerFichierImport(f, local)
    expect(v.avertissements).toEqual([
      "La liste des périodicités a été modifiée dans le fichier (Trimestriel) : seule celle de l'application compte.",
    ])
    expect(v.fichier._metadata?.periodicites.map((p) => p.label)).toEqual([
      'Mensuel',
      'Annuel',
      'Non défini',
    ])
    // La feuille garde Mensuel (id 41 lu dans le référentiel local).
    const plan = planifierFusion(local, v.fichier, { replace: true })
    expect(
      plan.actions.some(
        (a) =>
          a.type === 'modifierItem' &&
          a.item.kind === 'tracking_sheet' &&
          a.item.input.periodicite_id !== 41,
      ),
    ).toBe(false)
  })

  it('venu d’une autre base (ids différents) : pas touché', () => {
    const f = avec([])
    f._metadata = {
      ...exp()._metadata!,
      periodicites: [
        { id: 1, label: 'Mensuel', nombre: 8 },
        { id: 4, label: 'Annuel', nombre: 8 },
      ],
    }
    expect(validerFichierImport(f, local).fichier).toBe(f)
  })
})

describe('V8 — positions', () => {
  it('hors des entiers de la base : ramenée dans la borne', () => {
    const f = avec([
      itJson({ kind: 'document', title: 'Plan', sort_order: 1e12 }),
    ])
    const v = validerFichierImport(f, local)
    expect(v.fichier.chapters[0].items[0].sort_order).toBe(2_147_483_647)
    expect(v.avertissements).toEqual([
      'Document Plan : position hors limites, corrigée.',
    ])
  })
})

describe('le cas du plan : nombre 100, uuid « doc-1 », périodicité 999', () => {
  it('trois avertissements, en tête du plan', () => {
    const f = avec([
      itJson({ kind: 'signature_sheet', title: 'Émargement', nombre: 100 }),
      itJson({ kind: 'document', title: 'Plan', uuid: 'doc-1', content: '' }),
      itJson({ kind: 'tracking_sheet', title: 'Neuve', periodicite_id: 999 }),
    ])
    const plan = planAvecValidation(local, f, (x) =>
      planifierImportIa(local, x, { supprimerAbsents: false }),
    )
    expect(plan.warnings).toEqual([
      'Feuille de signature Émargement : 100 lignes demandées, 60 au plus.',
      'Document Plan : identifiant invalide, retiré.',
      'Feuille de suivi Neuve : périodicité n° 999 inconnue, Non défini appliquée.',
    ])
    for (const a of plan.actions) {
      if (a.type === 'creerItem') expect(a.uuid).toBeNull()
      if (
        (a.type === 'creerItem' || a.type === 'modifierItem') &&
        a.item.kind === 'signature_sheet'
      )
        expect(a.item.input.nombre).toBe(60)
    }
  })
})

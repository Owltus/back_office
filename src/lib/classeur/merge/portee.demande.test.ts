import { readFileSync } from 'node:fs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { serialiserExport } from '#/lib/classeur/exportJson.ts'
import { DEMANDES_LLM, composerDemande } from '#/lib/classeur/llmDemandes.ts'
import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'
import {
  construireExportChapitre,
  construireExportDocument,
} from '#/lib/classeur/merge/portee.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'

/*
 * `_metadata.demande` (étape 3) : posée SEULEMENT si une demande existe.
 *
 * Oracle de non-régression : `__oracle__/export-portee-avant-demandes.json`,
 * capturé AVANT l'étape (2026-10-04) sur les mêmes données. Seule différence
 * admise sans demande : la phrase de `COMMUNES` qui explique la demande au
 * LLM, retirée des consignes avant la comparaison octet pour octet.
 */

const ORACLE = JSON.parse(
  readFileSync(
    new URL('./__oracle__/export-portee-avant-demandes.json', import.meta.url),
    'utf8',
  ),
) as { chapitre: string; document: string }

// Mêmes données que la capture de l'oracle.
const A = chapitre({
  id: 10,
  label: 'Accueil',
  sort_order: 1,
  // Tel que capturé (l'antislash de la capture a été absorbé par le shell).
  description: 'Arrivée "VIP"  ok',
})
const d1 = document({
  id: 1,
  chapter_id: 10,
  title: 'Check-in',
  content: 'Ancien texte\n\n![x](a-inserer)',
  sort_order: 1,
})
const s = suivi({ id: 3, chapter_id: 10, title: 'Contrôle', sort_order: 2 })
const e = etat([A], { documents: [d1], tracking_sheets: [s] })
const T = new Date('2026-10-04T08:00:00Z')

const IDS = DEMANDES_LLM.map((d) => d.id)

/** Retire la phrase qui documente la demande (seul ajout aux consignes). */
function sansPhraseDemande(json: string): string {
  const o = JSON.parse(json) as { _metadata: { instructions: string[] } }
  const avant = o._metadata.instructions.length
  o._metadata.instructions = o._metadata.instructions.filter(
    (l) => !l.startsWith("DEMANDE DE L'UTILISATEUR"),
  )
  expect(o._metadata.instructions.length).toBe(avant - 1)
  return serialiserExport(o)
}

function exports(demande: string | null) {
  return {
    chapitre: serialiserExport(
      construireExportChapitre(
        classeur(),
        A,
        e.content,
        PERIODICITES,
        T,
        demande,
      ),
    ),
    document: serialiserExport(
      construireExportDocument(classeur(), A, d1, PERIODICITES, T, demande),
    ),
  }
}

/** Demande vide : rien de coché, champ libre blanc. */
const videArb = fc.tuple(
  fc.constant<string[]>([]),
  fc.stringMatching(/^[ \t\r\n]{0,6}$/),
)

describe('export sans demande : identique à l’export d’avant l’étape', () => {
  it('chapitre et document, octet pour octet (hors phrase ajoutée)', () => {
    const x = exports(null)
    expect(sansPhraseDemande(x.chapitre)).toBe(ORACLE.chapitre)
    expect(sansPhraseDemande(x.document)).toBe(ORACLE.document)
    expect(x.chapitre).not.toContain('"demande"')
  })

  it('propriété : aucune demande composée ⇒ export identique, sans clé `demande`', () => {
    fc.assert(
      fc.property(videArb, ([ids, libre]) => {
        const demande = composerDemande(ids, libre)
        expect(demande).toBeNull()
        const x = exports(demande)
        expect(sansPhraseDemande(x.chapitre)).toBe(ORACLE.chapitre)
        expect(sansPhraseDemande(x.document)).toBe(ORACLE.document)
        // Appel sans l'argument : même résultat.
        expect(x.chapitre).toBe(
          serialiserExport(
            construireExportChapitre(classeur(), A, e.content, PERIODICITES, T),
          ),
        )
      }),
      { numRuns: 500, seed: 31 },
    )
  })
})

describe('export avec demande', () => {
  const libreArb = fc.oneof(
    fc.string({ unit: 'grapheme', maxLength: 30 }),
    fc.constantFrom('"', '\\', 'a\r\nb', '😀', '</script>', ' '),
  )

  it('propriété : `_metadata.demande` = la demande composée ; JSON valide ; aller-retour', () => {
    fc.assert(
      fc.property(fc.subarray(IDS), libreArb, (ids, libre) => {
        const demande = composerDemande(ids, libre)
        const x = exports(demande)
        for (const json of [x.chapitre, x.document]) {
          const brut = JSON.parse(json) as { _metadata: { demande?: string } }
          if (demande === null) {
            expect('demande' in brut._metadata).toBe(false)
          } else {
            expect(brut._metadata.demande).toBe(demande)
          }
          // Aller-retour par la lecture de l'import (`lireMetadata`).
          expect(parseImportJson(json)._metadata?.demande).toBe(
            demande ?? undefined,
          )
          // Avec une demande, seul `_metadata.demande` diffère de l'export sans.
          const sans = JSON.parse(
            json === x.chapitre
              ? exports(null).chapitre
              : exports(null).document,
          ) as { _metadata: Record<string, unknown> }
          delete (brut._metadata as Record<string, unknown>).demande
          expect(brut).toEqual(sans)
        }
      }),
      { numRuns: 500, seed: 32 },
    )
  })

  it('la demande se place après les consignes, avant la portée', () => {
    const f = construireExportDocument(
      classeur(),
      A,
      d1,
      PERIODICITES,
      T,
      '- Corriger.',
    )
    expect(Object.keys(f._metadata)).toEqual([
      'description',
      'generated_at',
      'note',
      'schema',
      'periodicites',
      'instructions',
      'demande',
      'portee',
    ])
  })

  it('une demande non textuelle à la relecture est ignorée', () => {
    const json = exports('- x').chapitre.replace(
      '"demande": "- x"',
      '"demande": 3',
    )
    expect(parseImportJson(json)._metadata?.demande).toBeUndefined()
  })
})

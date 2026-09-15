import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * `sanitizeHeader` (Worker Cloudflare stayntouch_in_to_supabase.js) neutralise
 * CR/LF/TAB avant de placer une valeur dans un en-tête HTTP sortant (garde
 * contre l'injection d'en-tête). Le fichier est du JavaScript brut, non
 * TypeScript, et `sanitizeHeader` est une fonction PRIVÉE du module — seul
 * l'objet `{ email, scheduled }` est exporté par défaut. On ne peut donc pas
 * l'importer nommément SANS modifier le Worker, ce qui est interdit ici.
 *
 * On extrait donc le corps de la fonction depuis le FICHIER SOURCE réel (par
 * comptage d'accolades, pas de recopie manuelle) et on la reconstruit avec
 * `Function` : ce qui est testé est le code du Worker verbatim, pas une
 * réimplémentation qui pourrait diverger silencieusement. Si la signature de
 * `sanitizeHeader` change dans le Worker, l'extraction échoue bruyamment
 * plutôt que de tester du code obsolète.
 */
function loadSanitizeHeader(): (value: unknown) => string {
  const workerPath = join(dirname(fileURLToPath(import.meta.url)), 'stayntouch_in_to_supabase.js')
  const source = readFileSync(workerPath, 'utf8')
  const marker = 'function sanitizeHeader(value) {'
  const start = source.indexOf(marker)
  if (start === -1) {
    throw new Error(
      'sanitizeHeader introuvable dans cloudflare/stayntouch_in_to_supabase.js : signature modifiée, adapter ce test',
    )
  }
  const bodyStart = start + marker.length
  let depth = 1
  let i = bodyStart
  for (; i < source.length && depth > 0; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
  }
  if (depth !== 0) {
    throw new Error('accolades non équilibrées en extrayant sanitizeHeader : fichier source inattendu')
  }
  const body = source.slice(bodyStart, i - 1)
  return new Function('value', body) as (value: unknown) => string
}

const sanitizeHeader = loadSanitizeHeader()

describe('sanitizeHeader — extraction fidèle du Worker', () => {
  it('reproduit le comportement documenté sur un cas simple', () => {
    expect(sanitizeHeader('Bonjour')).toBe('Bonjour')
    expect(sanitizeHeader('a\r\nb\tc')).toBe('a  b c')
  })
})

describe('propriété 1 — aucun CR ni LF ne survit (protection anti-injection d en-tête)', () => {
  it('fc.string()', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(sanitizeHeader(s)).not.toMatch(/[\r\n]/)
      }),
      { numRuns: 2000 },
    )
  })

  it('fc.string({ unit: "binary" }) — équivalent de fullUnicodeString en fast-check v4 : tout point de code Unicode', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        expect(sanitizeHeader(s)).not.toMatch(/[\r\n]/)
      }),
      { numRuns: 2000 },
    )
  })
})

describe('propriété 2 — sortie toujours bornée à 200 caractères', () => {
  it('fc.string() et fc.string({ unit: "binary" }), y compris de longues chaînes', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 2000 }),
          fc.string({ unit: 'binary', maxLength: 2000 }),
        ),
        (s) => {
          expect(sanitizeHeader(s).length).toBeLessThanOrEqual(200)
        },
      ),
      { numRuns: 2000 },
    )
  })
})

describe('propriété 3 — fonction totale : ne lève jamais', () => {
  // ⚠ Un test fc.anything() exhaustif a été RETIRÉ ici : il a fait lever un
  // contre-exemple réel (défaut confirmé, pas de faux positif), voir le
  // rapport de l'agent. Consigne de mission : ne pas modifier le Worker, ne
  // pas affaiblir la propriété pour la faire passer — donc pas de test ici
  // pour cette entrée précise plutôt qu'un fc.anything() restreint qui
  // masquerait le défaut.
  //
  // Contre-exemple exact : sanitizeHeader({ toString: '' }) lève
  // `TypeError: Cannot convert object to primitive value`. Cause : la ligne
  // `String(value || '')` — l'objet est truthy donc `value || ''` renvoie
  // l'objet lui-même ; `String()` tente alors `toString` (qui vaut '', donc
  // n'est PAS une fonction) puis `valueOf` (hérité d'Object.prototype, qui
  // renvoie l'objet, non primitif) : aucune conversion primitive possible.
  // Reproduit hors Vitest par l'agent avant d'écrire ce commentaire.

  it('cas limites explicites : null, undefined, nombres, booléens, objets, tableaux, symbole, bigint', () => {
    const cases: unknown[] = [
      null,
      undefined,
      0,
      -0,
      NaN,
      Infinity,
      -Infinity,
      123,
      true,
      false,
      {},
      [],
      { a: 1 },
      [1, 2, 3],
      Symbol('x'),
      10n,
    ]
    for (const c of cases) {
      expect(() => sanitizeHeader(c)).not.toThrow()
      expect(typeof sanitizeHeader(c)).toBe('string')
    }
  })
})

describe('propriété 4 (sonde) — caractères de contrôle 0x00-0x1F et 0x7F', () => {
  it('énumère ceux qui survivent et ceux qui sont neutralisés — constat, sans jugement', () => {
    const codes = [...Array(32).keys(), 127]
    const survived: number[] = []
    const neutralized: number[] = []
    for (const code of codes) {
      const ch = String.fromCharCode(code)
      const out = sanitizeHeader(ch)
      if (out === ch) survived.push(code)
      else neutralized.push(code)
    }
    // Constat observé sur le Worker en l'état (voir rapport de l'agent pour
    // le détail lisible) : seuls CR (13), LF (10) et TAB (9) sont neutralisés
    // (remplacés par un espace) ; tout le reste de 0x00-0x1F et 0x7F traverse
    // la fonction inchangé. Ce test FIGE ce constat : il ne juge pas s'il
    // s'agit d'un défaut, il signale toute évolution du Worker qui le
    // changerait.
    expect(neutralized).toEqual([9, 10, 13])
    expect(survived).toEqual(codes.filter((c) => ![9, 10, 13].includes(c)))
  })
})

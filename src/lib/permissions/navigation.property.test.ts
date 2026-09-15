import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { homePage, orderedPages, sanitizePageOrder } from '#/lib/permissions/navigation.ts'
import { canView } from '#/lib/permissions/index.ts'
import type { PagePermissions } from '#/lib/permissions/index.ts'
import type { Grade, PageLevel } from '#/lib/permissions/levels.ts'
import type { PageKey } from '#/lib/permissions/pages.ts'
import { PAGES } from '#/lib/permissions/pages.ts'

/*
 * Propriétés de navigation.ts sur des préférences d'ordre ARBITRAIRES :
 * vides, nulles, périmées, avec clés inconnues, avec doublons, dans le
 * désordre. Complète navigation.test.ts (lu avant d'écrire ce fichier) sans
 * dupliquer ses cas nommés — ici, la génération aléatoire fait le travail
 * d'exploration, avec les mêmes invariants figés en assertions.
 */

const KNOWN_KEYS: PageKey[] = PAGES.map((p) => p.key)

// Clés « inventées » : une page renommée ou retirée laisse ce genre de trace
// dans une préférence déjà stockée en base.
const INVENTED_KEYS = ['inconnue', 'xyz', 'facturation_v2', 'pdj-old', '']

const levelArb = fc.constantFrom<PageLevel>('lecture', 'ecriture', 'gestion')

const permsArb: fc.Arbitrary<PagePermissions> = fc.record({
  repjour: fc.option(levelArb, { nil: undefined }),
  pdj: fc.option(levelArb, { nil: undefined }),
  parking: fc.option(levelArb, { nil: undefined }),
  rapro: fc.option(levelArb, { nil: undefined }),
  caisse: fc.option(levelArb, { nil: undefined }),
  affichage: fc.option(levelArb, { nil: undefined }),
  facturation: fc.option(levelArb, { nil: undefined }),
  literie: fc.option(levelArb, { nil: undefined }),
})

const gradeArb = fc.constantFrom<Grade>('utilisateur', 'admin')

// Un élément de préférence : une clé connue OU une clé inventée — mélange
// volontaire pour forcer le filtrage `isKnownPage`.
const orderItemArb = fc.oneof(fc.constantFrom(...KNOWN_KEYS), fc.constantFrom(...INVENTED_KEYS))

// Préférence arbitraire : `null`, `undefined`, ou un tableau (potentiellement
// avec doublons, clés inconnues, dans le désordre).
const storedArb: fc.Arbitrary<readonly string[] | null | undefined> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 4, arbitrary: fc.array(orderItemArb, { maxLength: 24 }) },
)

describe('invariant 4 — orderedPages ne masque JAMAIS une page accordée', () => {
  it('fast-check : l ensemble des pages rendues est toujours EXACTEMENT l ensemble des pages autorisées', () => {
    fc.assert(
      fc.property(permsArb, gradeArb, storedArb, (perms, grade, stored) => {
        const expectedAllowed = new Set(KNOWN_KEYS.filter((key) => canView(perms, grade, key)))
        const got = orderedPages(perms, grade, stored)
        const gotKeys = got.map((p) => p.key)

        // Aucun doublon en sortie.
        expect(new Set(gotKeys).size).toBe(gotKeys.length)
        // Exactement l'ensemble des pages autorisées, ni plus (pas de fuite
        // d'une page interdite via la préférence), ni moins (pas de perte
        // d'une page accordée absente de la préférence, ou périmée, ou
        // masquée par une clé inconnue/doublon).
        expect(new Set(gotKeys)).toEqual(expectedAllowed)
      }),
      { numRuns: 2000 },
    )
  })

  it('cas non couvert par navigation.test.ts : tableau VIDE, distinct de null', () => {
    const perms: PagePermissions = { parking: 'lecture', caisse: 'ecriture' }
    const withEmptyArray = orderedPages(perms, 'utilisateur', []).map((p) => p.key)
    const withNull = orderedPages(perms, 'utilisateur', null).map((p) => p.key)
    const withUndefined = orderedPages(perms, 'utilisateur', undefined).map((p) => p.key)

    // Un tableau vide doit se comporter comme l'absence de préférence : repli
    // intégral sur l'ordre du registre.
    expect(withEmptyArray).toEqual(withNull)
    expect(withEmptyArray).toEqual(withUndefined)
    expect(withEmptyArray).toEqual(['parking', 'caisse'])
  })
})

describe('invariant 5 — homePage ne renvoie jamais une page non autorisée', () => {
  it('fast-check : soit null (aucun droit), soit une page vérifiée par canView', () => {
    fc.assert(
      fc.property(permsArb, gradeArb, storedArb, (perms, grade, stored) => {
        const home = homePage(perms, grade, stored)
        if (home === null) {
          // Cohérence : si homePage dit "rien", aucune page ne doit être
          // accordée — sinon une redirection perdrait un compte qui a
          // pourtant accès à quelque chose.
          expect(KNOWN_KEYS.some((key) => canView(perms, grade, key))).toBe(false)
        } else {
          expect(canView(perms, grade, home)).toBe(true)
        }
      }),
      { numRuns: 2000 },
    )
  })
})

describe('invariant 6 — sanitizePageOrder : sans doublon, clés connues, idempotente', () => {
  it('fast-check', () => {
    fc.assert(
      fc.property(fc.array(orderItemArb, { maxLength: 24 }), (order) => {
        const sanitized = sanitizePageOrder(order)

        // Sans doublon.
        expect(new Set(sanitized).size).toBe(sanitized.length)
        // Uniquement des clés connues du registre.
        for (const key of sanitized) {
          expect(KNOWN_KEYS).toContain(key)
        }
        // Idempotente : assainir une sortie déjà assainie ne change rien.
        expect(sanitizePageOrder(sanitized)).toEqual(sanitized)
      }),
      { numRuns: 1000 },
    )
  })

  it('entrée vide ⇒ sortie vide (cas limite)', () => {
    expect(sanitizePageOrder([])).toEqual([])
  })
})

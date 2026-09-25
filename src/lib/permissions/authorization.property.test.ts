import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { atLeast, canView, levelOf } from '#/lib/permissions/index.ts'
import type { PagePermissions } from '#/lib/permissions/index.ts'
import type { Grade, PageLevel } from '#/lib/permissions/levels.ts'
import { GRADES, PAGE_LEVELS } from '#/lib/permissions/levels.ts'
import type { PageKey } from '#/lib/permissions/pages.ts'
import { PAGES } from '#/lib/permissions/pages.ts'

/*
 * Test COMBINATOIRE EXHAUSTIF des décisions d'autorisation (levelOf, canView,
 * atLeast). L'oracle ci-dessous est écrit À LA MAIN, INDÉPENDAMMENT de
 * l'implémentation testée (aucun appel à levelOf/canView/atLeast) : une table
 * de rang recopiée volontairement depuis le contrat documenté, pour détecter
 * une régression de la vraie implémentation plutôt que de confirmer sa propre
 * logique en miroir.
 */

const PAGE_KEYS: PageKey[] = PAGES.map((p) => p.key)

// Rang oracle : lecture < écriture < gestion, recopié depuis le contrat
// documenté (levels.ts), sans référence au code testé.
const ORACLE_RANK: Record<PageLevel, number> = { lecture: 1, ecriture: 2, gestion: 3 }

function oracleLevelOf(storedLevel: PageLevel | undefined, grade: Grade): PageLevel | null {
  // Décision métier « grade avant table » : un admin a toujours 'gestion',
  // quoi que dise (ou ne dise pas) la table de permissions.
  if (grade === 'admin') return 'gestion'
  return storedLevel ?? null
}

function oracleCanView(storedLevel: PageLevel | undefined, grade: Grade): boolean {
  return oracleLevelOf(storedLevel, grade) !== null
}

function oracleAtLeast(storedLevel: PageLevel | undefined, grade: Grade, min: PageLevel): boolean {
  const level = oracleLevelOf(storedLevel, grade)
  const rank = level ? ORACLE_RANK[level] : 0
  return rank >= ORACLE_RANK[min]
}

// Les 4 valeurs stockables pour UNE page : rien (aucun droit) ou l'un des 3
// niveaux. levelOf/canView/atLeast ne regardent QUE perms[page] : cette
// matrice est donc EXHAUSTIVE pour ces trois fonctions — 2 grades × 9 pages ×
// 4 valeurs stockées × 3 niveaux demandés = 216 cellules.
const STORED_VALUES: (PageLevel | undefined)[] = [undefined, 'lecture', 'ecriture', 'gestion']

const levelArb = fc.constantFrom<PageLevel>('lecture', 'ecriture', 'gestion')

// Table de permissions arbitraire : chacune des 9 pages a soit un niveau,
// soit rien — couvre aussi les tables « contradictoires » vis-à-vis d'un
// grade admin, et les tables partielles.
const permsArb: fc.Arbitrary<PagePermissions> = fc.record({
  repjour: fc.option(levelArb, { nil: undefined }),
  pdj: fc.option(levelArb, { nil: undefined }),
  parking: fc.option(levelArb, { nil: undefined }),
  rapro: fc.option(levelArb, { nil: undefined }),
  caisse: fc.option(levelArb, { nil: undefined }),
  affichage: fc.option(levelArb, { nil: undefined }),
  facturation: fc.option(levelArb, { nil: undefined }),
  literie: fc.option(levelArb, { nil: undefined }),
  classeur: fc.option(levelArb, { nil: undefined }),
})

const gradeArb = fc.constantFrom<Grade>(...GRADES)
const pageArb = fc.constantFrom<PageKey>(...PAGE_KEYS)

describe('levelOf / canView / atLeast — matrice exhaustive', () => {
  it('couvre les 216 cellules (2 grades × 9 pages × 4 valeurs stockées × 3 niveaux demandés)', () => {
    const mismatches: string[] = []
    let cells = 0

    for (const grade of GRADES) {
      for (const page of PAGE_KEYS) {
        for (const stored of STORED_VALUES) {
          const perms: PagePermissions = stored === undefined ? {} : { [page]: stored }

          const gotLevel = levelOf(perms, grade, page)
          const wantLevel = oracleLevelOf(stored, grade)
          if (gotLevel !== wantLevel) {
            mismatches.push(
              `levelOf(${grade}, ${page}, stored=${stored}) = ${gotLevel}, attendu ${wantLevel}`,
            )
          }

          const gotView = canView(perms, grade, page)
          const wantView = oracleCanView(stored, grade)
          if (gotView !== wantView) {
            mismatches.push(
              `canView(${grade}, ${page}, stored=${stored}) = ${gotView}, attendu ${wantView}`,
            )
          }

          for (const min of PAGE_LEVELS) {
            cells++
            const gotAtLeast = atLeast(perms, grade, page, min)
            const wantAtLeast = oracleAtLeast(stored, grade, min)
            if (gotAtLeast !== wantAtLeast) {
              mismatches.push(
                `atLeast(${grade}, ${page}, stored=${stored}, min=${min}) = ${gotAtLeast}, attendu ${wantAtLeast}`,
              )
            }
          }
        }
      }
    }

    // Garde-fou : si le registre de pages ou de niveaux change de taille, la
    // matrice doit rester ce qu'elle prétend être.
    expect(cells).toBe(GRADES.length * PAGE_KEYS.length * STORED_VALUES.length * PAGE_LEVELS.length)
    expect(mismatches).toEqual([])
  })
})

describe('invariant 1 — un admin voit toujours tout, au niveau le plus élevé', () => {
  it('table de permissions vide', () => {
    for (const page of PAGE_KEYS) {
      expect(levelOf({}, 'admin', page)).toBe('gestion')
      expect(canView({}, 'admin', page)).toBe(true)
      expect(atLeast({}, 'admin', page, 'gestion')).toBe(true)
    }
  })

  it('table CONTRADICTOIRE (droits bas ou absents explicitement posés sur un compte marqué admin)', () => {
    // Un admin ne devrait jamais dépendre de ce que contient sa ligne
    // user_page_permissions : le grade prime, même si la table dit l'inverse.
    const contradictory: PagePermissions = Object.fromEntries(
      PAGE_KEYS.map((p, i) => [p, i % 2 === 0 ? 'lecture' : undefined]),
    )
    for (const page of PAGE_KEYS) {
      expect(levelOf(contradictory, 'admin', page)).toBe('gestion')
      expect(atLeast(contradictory, 'admin', page, 'gestion')).toBe(true)
    }
  })

  it('fast-check : quelle que soit la table (vide, partielle ou contradictoire), admin = gestion partout', () => {
    fc.assert(
      fc.property(permsArb, (perms) => {
        for (const page of PAGE_KEYS) {
          expect(levelOf(perms, 'admin', page)).toBe('gestion')
          expect(canView(perms, 'admin', page)).toBe(true)
          expect(atLeast(perms, 'admin', page, 'gestion')).toBe(true)
        }
      }),
      { numRuns: 500 },
    )
  })
})

describe('invariant 2 — une absence de droit n accorde jamais rien', () => {
  it('exhaustif : perms[page] absent, grade utilisateur ⇒ levelOf null, canView faux, atLeast faux aux 3 niveaux', () => {
    for (const page of PAGE_KEYS) {
      const perms: PagePermissions = {}
      expect(levelOf(perms, 'utilisateur', page)).toBeNull()
      expect(canView(perms, 'utilisateur', page)).toBe(false)
      for (const min of PAGE_LEVELS) {
        expect(atLeast(perms, 'utilisateur', page, min)).toBe(false)
      }
    }
  })

  it('fast-check : sur une table arbitraire, une page absente de la table reste sans droit pour un non-admin', () => {
    fc.assert(
      fc.property(permsArb, pageArb, (perms, page) => {
        const withoutThatPage: PagePermissions = { ...perms, [page]: undefined }
        expect(levelOf(withoutThatPage, 'utilisateur', page)).toBeNull()
        expect(canView(withoutThatPage, 'utilisateur', page)).toBe(false)
        for (const min of PAGE_LEVELS) {
          expect(atLeast(withoutThatPage, 'utilisateur', page, min)).toBe(false)
        }
      }),
      { numRuns: 500 },
    )
  })
})

describe('invariant 3 — monotonie des niveaux (gestion ⇒ écriture ⇒ lecture, jamais l inverse)', () => {
  it('exhaustif sur toute la matrice', () => {
    for (const grade of GRADES) {
      for (const page of PAGE_KEYS) {
        for (const stored of STORED_VALUES) {
          const perms: PagePermissions = stored === undefined ? {} : { [page]: stored }
          const gestion = atLeast(perms, grade, page, 'gestion')
          const ecriture = atLeast(perms, grade, page, 'ecriture')
          const lecture = atLeast(perms, grade, page, 'lecture')
          if (gestion) {
            expect(ecriture).toBe(true)
            expect(lecture).toBe(true)
          }
          if (ecriture) {
            expect(lecture).toBe(true)
          }
        }
      }
    }
  })

  it('fast-check : la même implication tient sur des tables et des pages arbitraires', () => {
    fc.assert(
      fc.property(permsArb, gradeArb, pageArb, (perms, grade, page) => {
        const gestion = atLeast(perms, grade, page, 'gestion')
        const ecriture = atLeast(perms, grade, page, 'ecriture')
        const lecture = atLeast(perms, grade, page, 'lecture')
        if (gestion) expect(ecriture && lecture).toBe(true)
        if (ecriture) expect(lecture).toBe(true)
      }),
      { numRuns: 1000 },
    )
  })
})

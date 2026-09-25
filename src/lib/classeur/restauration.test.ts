import { describe, expect, it, vi } from 'vitest'

import { entreesAElaguerParGenre } from '#/lib/classeur/merge/snapshot.ts'
import {
  FENETRE_AUTO_MS,
  QUOTAS,
  dernierPoint,
  doitCreerPointAuto,
  estMajeur,
} from '#/lib/classeur/restauration.ts'

// `vi.mock` est hissé par vitest : les imports ci-dessus voient le service simulé.
vi.mock('#/lib/classeur/service.ts', () => ({
  definirGardeEcriture: vi.fn(),
  deleteMergeHistory: vi.fn(),
  fetchChapter: vi.fn(),
  fetchChapters: vi.fn(),
  fetchClasseur: vi.fn(),
  fetchContentParChapitres: vi.fn(),
  fetchItem: vi.fn(),
  fetchMergeHistory: vi.fn(),
  fetchMergeSnapshot: vi.fn(),
  fetchPeriodicites: vi.fn(),
  insertMergeHistory: vi.fn(),
}))

/*
 * La partie PURE des points de restauration : la décision « faut-il un point
 * auto maintenant », le dernier point d'un genre, et l'élagage par genre.
 * Le branchement Supabase (`creerPoint`, `assurerPointAuto`) est exercé par
 * l'usage en production ; ici on fige les règles.
 */

const T = (h: number) => `2026-09-26T${String(h).padStart(2, '0')}:00:00Z`

describe('doitCreerPointAuto — un point par fenêtre', () => {
  it('oui sans point précédent, oui si la fenêtre est écoulée, non sinon', () => {
    const maintenant = Date.parse('2026-09-26T10:00:00Z')
    expect(doitCreerPointAuto(null, maintenant)).toBe(true)
    expect(doitCreerPointAuto('2026-09-26T09:00:00Z', maintenant)).toBe(true)
    expect(doitCreerPointAuto('2026-09-26T09:50:00Z', maintenant)).toBe(false)
    // Exactement la fenêtre : on reprend.
    expect(
      doitCreerPointAuto(
        new Date(maintenant - FENETRE_AUTO_MS).toISOString(),
        maintenant,
      ),
    ).toBe(true)
  })

  it('un horodatage illisible ne bloque jamais la prise d’un point', () => {
    expect(doitCreerPointAuto('n importe quoi')).toBe(true)
  })
})

describe('dernierPoint', () => {
  it('rend le plus récent du genre demandé, l’id départageant', () => {
    const entrees = [
      { id: 1, kind: 'auto' as const, merged_at: T(8) },
      { id: 2, kind: 'manuel' as const, merged_at: T(9) },
      { id: 3, kind: 'auto' as const, merged_at: T(9) },
      { id: 4, kind: 'auto' as const, merged_at: T(9) },
    ]
    expect(dernierPoint(entrees, 'auto')?.id).toBe(4)
    expect(dernierPoint(entrees, 'manuel')?.id).toBe(2)
    expect(dernierPoint(entrees, 'fusion')).toBeNull()
    // Sans genre : le plus récent de tous (c'est lui qui sert au dédoublonnage).
    expect(dernierPoint(entrees)?.id).toBe(4)
    expect(dernierPoint([])).toBeNull()
  })
})

describe('entreesAElaguerParGenre — deux quotas', () => {
  it('garde 10 points auto et 10 majeurs, indépendamment', () => {
    expect(QUOTAS).toEqual({ auto: 10, majeur: 10 })
    const auto = Array.from({ length: 12 }, (_, i) => ({
      id: 100 + i,
      kind: 'auto',
      merged_at: T(i + 1),
    }))
    const majeurs = Array.from({ length: 11 }, (_, i) => ({
      id: 200 + i,
      kind: i % 2 === 0 ? 'manuel' : 'fusion',
      merged_at: T(i + 1),
    }))
    const ids = entreesAElaguerParGenre([...majeurs, ...auto])
    // Les deux plus vieux auto (T1, T2) et le plus vieux majeur (T1).
    expect(ids.sort((a, b) => a - b)).toEqual([100, 101, 200])
  })

  it('à quota majeur atteint, les points de sécurité partent en premier', () => {
    const entrees = [
      ...Array.from({ length: 9 }, (_, i) => ({
        id: 300 + i,
        kind: 'manuel',
        merged_at: T(i + 1),
      })),
      { id: 400, kind: 'securite', merged_at: T(23) }, // le plus récent de tous
      { id: 401, kind: 'fusion', merged_at: T(12) },
    ]
    // 11 majeurs : un de trop. Le filet part, pas le plus vieux jalon.
    expect(entreesAElaguerParGenre(entrees)).toEqual([400])
  })

  it('ne touche à rien sous les quotas', () => {
    expect(
      entreesAElaguerParGenre([
        { id: 1, kind: 'auto', merged_at: T(1) },
        { id: 2, kind: 'securite', merged_at: T(2) },
      ]),
    ).toEqual([])
  })
})

describe('estMajeur', () => {
  it('seul le point auto est mineur', () => {
    expect(estMajeur('auto')).toBe(false)
    for (const k of ['manuel', 'fusion', 'securite'] as const) {
      expect(estMajeur(k)).toBe(true)
    }
  })
})

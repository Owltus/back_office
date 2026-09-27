import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * `sauvegarderDocumentSiInchange` (amélioration n° 2) contre un client
 * Supabase simulé : la base n'est jamais touchée. Le simulateur applique
 * vraiment le filtre `updated_at = base`, comme PostgREST.
 */

interface Ligne {
  id: number
  updated_at: string
  deleted_at: string | null
  content: string
}

const base = { ligne: null as Ligne | null, rlsRefuse: false, updates: 0 }

vi.mock('#/lib/supabase.ts', () => {
  const from = () => {
    const filtres: Record<string, unknown> = {}
    let patch: Partial<Ligne> | null = null
    const q = {
      update(p: Partial<Ligne>) {
        patch = p
        return q
      },
      select() {
        return q
      },
      eq(col: string, val: unknown) {
        filtres[col] = val
        return q
      },
      // `update … select` est attendu directement (thenable).
      then(resolve: (r: { data: unknown; error: null }) => void) {
        const l = base.ligne
        const correspond =
          l !== null &&
          !base.rlsRefuse &&
          Object.entries(filtres).every(
            ([k, v]) => (l as unknown as Record<string, unknown>)[k] === v,
          )
        if (patch && correspond) {
          base.updates++
          Object.assign(l, patch, { updated_at: 'T-nouveau' })
          resolve({ data: [{ updated_at: l.updated_at }], error: null })
        } else {
          resolve({ data: [], error: null })
        }
      },
      maybeSingle() {
        const l = base.ligne
        return Promise.resolve({
          data:
            l && filtres.id === l.id
              ? { updated_at: l.updated_at, deleted_at: l.deleted_at }
              : null,
          error: null,
        })
      },
    }
    return q
  }
  return { supabase: { from } }
})

const { sauvegarderDocumentSiInchange } =
  await import('#/lib/classeur/service.ts')

const V1 = '2026-09-27T07:35:19.817052+00:00'

beforeEach(() => {
  base.ligne = { id: 17, updated_at: V1, deleted_at: null, content: 'avant' }
  base.rlsRefuse = false
  base.updates = 0
})

describe('sauvegarderDocumentSiInchange', () => {
  it('document inchangé depuis le début de l’édition : écrit', async () => {
    const r = await sauvegarderDocumentSiInchange(17, { content: 'moi' }, V1)
    expect(r).toEqual({ statut: 'ok', updatedAt: 'T-nouveau' })
    expect(base.ligne?.content).toBe('moi')
  })
  it('un collègue a sauvegardé entre-temps : conflit, RIEN d’écrit', async () => {
    base.ligne!.updated_at = '2026-09-27T09:00:00.000001+00:00'
    base.ligne!.content = 'collègue'
    const r = await sauvegarderDocumentSiInchange(17, { content: 'moi' }, V1)
    expect(r).toEqual({
      statut: 'conflit',
      updatedAt: '2026-09-27T09:00:00.000001+00:00',
    })
    expect(base.updates).toBe(0)
    expect(base.ligne?.content).toBe('collègue')
  })
  it('document supprimé entre-temps : erreur explicite', async () => {
    base.ligne!.updated_at = 'T-suppr'
    base.ligne!.deleted_at = 'T-suppr'
    await expect(
      sauvegarderDocumentSiInchange(17, { content: 'moi' }, V1),
    ).rejects.toThrow(/supprimé/)
  })
  it('même version mais rien d’écrit (RLS) : refus de droits 42501', async () => {
    base.rlsRefuse = true
    await expect(
      sauvegarderDocumentSiInchange(17, { content: 'moi' }, V1),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

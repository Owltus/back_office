import { describe, expect, it } from 'vitest'

import {
  besoinTsc,
  erreursMessage,
  indexesEnPartie,
  sourcesATester,
} from './commit-plan.ts'

const ATTRIBUTION =
  '\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/x'

describe('besoinTsc', () => {
  it('oui pour un fichier typé ou un script', () => {
    expect(besoinTsc(['src/a.tsx'])).toBe(true)
    expect(besoinTsc(['scripts/livrer-plan.d.mts'])).toBe(true)
    expect(besoinTsc(['scripts/livrer.mjs'])).toBe(true)
  })
  it('non pour de la documentation ou du SQL', () => {
    expect(besoinTsc(['CLAUDE.md', 'supabase/migrations/1_x.sql'])).toBe(false)
  })
})

describe('sourcesATester', () => {
  it('garde le code, écarte les déclarations et le reste', () => {
    expect(
      sourcesATester(['src/a.ts', 'x.d.mts', 'scripts/b.mjs', 'README.md']),
    ).toEqual(['src/a.ts', 'scripts/b.mjs'])
  })
})

describe('indexesEnPartie', () => {
  it('les fichiers aussi modifiés hors index', () => {
    expect(indexesEnPartie(['a', 'b'], ['b', 'c'])).toEqual(['b'])
  })
})

describe('erreursMessage', () => {
  it('accepte un message conforme', () => {
    expect(
      erreursMessage('fix(livraison): x\n\ncorps' + ATTRIBUTION, {
        assistant: true,
      }),
    ).toEqual([])
    expect(erreursMessage('feat!: x', { assistant: false })).toEqual([])
  })
  it('refuse un sujet hors convention, vide ou trop long', () => {
    expect(
      erreursMessage('corrige un truc', { assistant: false }),
    ).toHaveLength(1)
    expect(erreursMessage('', { assistant: false })).toHaveLength(1)
    expect(
      erreursMessage(`fix: ${'a'.repeat(100)}`, { assistant: false }),
    ).toHaveLength(1)
  })
  it('exige la ligne vide après le sujet', () => {
    expect(erreursMessage('fix: x\ncorps', { assistant: false })).toHaveLength(
      1,
    )
  })
  it('exige l’attribution pour l’assistant seulement', () => {
    expect(erreursMessage('fix: x', { assistant: true })).toHaveLength(2)
    expect(erreursMessage('fix: x', { assistant: false })).toEqual([])
  })
})

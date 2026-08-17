import { describe, expect, it } from 'vitest'

import { invert } from '#/lib/baby-cots/history.ts'
import type { CotCommand } from '#/lib/baby-cots/history.ts'
import type { CotAssignment } from '#/lib/baby-cots/types.ts'

const A: CotAssignment = {
  id: 'a1',
  cotId: 'cot-1',
  label: 'Dupont — ch. 205',
  startDate: '2026-08-10',
  endDate: '2026-08-12',
  comment: '',
}

describe('invert — inverse d\'une commande lits bébé', () => {
  it('create devient delete, même snapshot', () => {
    const cmd: CotCommand = { kind: 'create', snapshot: A }
    expect(invert(cmd)).toEqual({ kind: 'delete', snapshot: A })
  })

  it('delete devient create, même snapshot', () => {
    const cmd: CotCommand = { kind: 'delete', snapshot: A }
    expect(invert(cmd)).toEqual({ kind: 'create', snapshot: A })
  })

  it('update échange before et after, garde l\'id', () => {
    const cmd: CotCommand = {
      kind: 'update',
      id: 'a1',
      before: { startDate: '2026-08-10', endDate: '2026-08-12' },
      after: { startDate: '2026-08-11', endDate: '2026-08-13' },
    }
    expect(invert(cmd)).toEqual({
      kind: 'update',
      id: 'a1',
      before: { startDate: '2026-08-11', endDate: '2026-08-13' },
      after: { startDate: '2026-08-10', endDate: '2026-08-12' },
    })
  })

  it('est une involution : invert(invert(cmd)) === cmd pour les trois formes', () => {
    const cmds: CotCommand[] = [
      { kind: 'create', snapshot: A },
      { kind: 'delete', snapshot: A },
      { kind: 'update', id: 'a1', before: { cotId: 'cot-1' }, after: { cotId: 'cot-2' } },
    ]
    for (const cmd of cmds) {
      expect(invert(invert(cmd))).toEqual(cmd)
    }
  })
})

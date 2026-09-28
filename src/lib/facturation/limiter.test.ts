import { describe, expect, it } from 'vitest'

import { createLimiter } from '#/lib/facturation/limiter.ts'

/** Tâche pilotable : on la termine à la main. */
function deferred() {
  let done!: () => void
  const promise = new Promise<void>((r) => (done = r))
  return { promise, done }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('createLimiter — au plus N tâches à la fois', () => {
  it('ne lance jamais plus de 2 tâches en parallèle', async () => {
    const run = createLimiter(2)
    const tasks = Array.from({ length: 5 }, deferred)
    let running = 0
    let peak = 0
    const started: number[] = []
    const all = tasks.map((t, i) =>
      run(async () => {
        started.push(i)
        running++
        peak = Math.max(peak, running)
        await t.promise
        running--
      }),
    )
    await tick()
    expect(started).toEqual([0, 1])
    tasks[0].done()
    await tick()
    expect(started).toEqual([0, 1, 2])
    for (const t of tasks) t.done()
    await Promise.all(all)
    expect(started).toEqual([0, 1, 2, 3, 4])
    expect(peak).toBe(2)
  })

  it('un échec libère sa place et remonte à l’appelant', async () => {
    const run = createLimiter(1)
    const failed = run(() => Promise.reject(new Error('non')))
    const ok = run(() => Promise.resolve(42))
    await expect(failed).rejects.toThrow('non')
    await expect(ok).resolves.toBe(42)
  })
})

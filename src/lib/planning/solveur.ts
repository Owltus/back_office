/*
 * Appel du solveur depuis l'écran : dans un Web Worker (`solveur.worker.ts`),
 * chargé à la première génération seulement (HiGHS pèse ~3 Mo). Sans Worker,
 * repli dans la page.
 */

import type { Probleme, Resultat } from '#/lib/planning/modele.ts'

let worker: Worker | null = null
let suivant = 0
const attentes = new Map<
  number,
  { ok: (r: Resultat) => void; ko: (e: Error) => void }
>()

function lancer(): Worker | null {
  if (worker) return worker
  if (typeof Worker === 'undefined') return null
  worker = new Worker(new URL('./solveur.worker.ts', import.meta.url), {
    type: 'module',
  })
  worker.onmessage = (
    e: MessageEvent<{ id: number; resultat?: Resultat; erreur?: string }>,
  ) => {
    const attente = attentes.get(e.data.id)
    if (!attente) return
    attentes.delete(e.data.id)
    if (e.data.resultat) attente.ok(e.data.resultat)
    else attente.ko(new Error(e.data.erreur ?? 'le calcul a échoué'))
  }
  worker.onerror = () => {
    for (const a of attentes.values())
      a.ko(new Error('le moteur de calcul ne répond pas'))
    attentes.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export async function resoudre(probleme: Probleme): Promise<Resultat> {
  const w = lancer()
  if (!w) {
    const [{ default: highsLoader }, { generer }] = await Promise.all([
      import('highs'),
      import('#/lib/planning/generateur.ts'),
    ])
    const highs = await highsLoader()
    return generer(probleme, highs as unknown as Parameters<typeof generer>[1])
  }
  const id = ++suivant
  return new Promise<Resultat>((ok, ko) => {
    attentes.set(id, { ok, ko })
    w.postMessage({ id, probleme })
  })
}

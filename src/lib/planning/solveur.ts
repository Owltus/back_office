/*
 * Appel du solveur depuis l'écran : dans un Web Worker (`solveur.worker.ts`),
 * chargé à la première génération seulement (HiGHS pèse ~3 Mo). Sans Worker,
 * repli dans la page.
 *
 * Arrêt (demande utilisateur du 2026-11-02 : « la génération est longue, un
 * second clic l'arrête ») : `arreterCalcul` coupe le Worker en plein calcul,
 * le calcul en cours échoue par `CalculArrete`, et un Worker neuf est lancé
 * au calcul suivant.
 */

import type { Probleme, Resultat } from '#/lib/planning/modele.ts'

/** Calcul arrêté à la demande : rien n'est écrit pour la semaine en cours. */
export class CalculArrete extends Error {
  constructor() {
    super('Calcul arrêté')
    this.name = 'CalculArrete'
  }
}

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

/** Coupe le calcul en cours (sans effet sans Worker). */
export function arreterCalcul() {
  if (!worker) return
  worker.terminate()
  worker = null
  for (const a of attentes.values()) a.ko(new CalculArrete())
  attentes.clear()
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

/*
 * Worker du solveur : charge HiGHS (WebAssembly) une fois, résout chaque
 * problème reçu, rend le résultat. Hors du fil principal : une génération
 * de plusieurs secondes ne fige pas l'écran.
 */

import highsLoader from 'highs'
import wasmUrl from 'highs/runtime?url'

import { generer, type Highs } from '#/lib/planning/generateur.ts'
import type { Probleme } from '#/lib/planning/modele.ts'

let highs: Promise<Highs> | null = null

function charger(): Promise<Highs> {
  highs ??= highsLoader({
    locateFile: () => wasmUrl,
  }) as unknown as Promise<Highs>
  return highs
}

self.onmessage = async (
  e: MessageEvent<{ id: number; probleme: Probleme }>,
) => {
  const { id, probleme } = e.data
  try {
    const resultat = generer(probleme, await charger())
    self.postMessage({ id, resultat })
  } catch (err) {
    self.postMessage({
      id,
      erreur: err instanceof Error ? err.message : String(err),
    })
  }
}

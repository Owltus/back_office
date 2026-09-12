import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  DAY_CUTOFF_HOUR,
  PIPELINE_WINDOW_END_HOUR,
  PIPELINE_WINDOW_START_HOUR,
} from '#/lib/businessDay.ts'

/*
 * La fenêtre d'automatisation existe en DEUX exemplaires : ici (navigateur) et
 * dans `supabase/functions/_shared/businessDay.ts` (Deno). Les deux arbres sont
 * disjoints — alias `#/` et Vite d'un côté, spécificateurs `jsr:` de l'autre —
 * donc rien ne les relie à la compilation, et le seul garde-fou était un
 * commentaire disant « COPIE CONFORME ».
 *
 * Ce projet a déjà été mordu par une autorité dupliquée qui divergeait en
 * silence (le « revert silencieux » des policies RLS, 2026-08-04). Le symptôme
 * serait ici indirect : un bandeau qui alarme alors que le rapport peut encore
 * partir tout seul, ou l'inverse. Ce test compare les littéraux et échoue au
 * premier écart.
 */
const EDGE = readFileSync(
  'supabase/functions/_shared/businessDay.ts',
  'utf-8',
)

describe('businessDay — les deux copies ne doivent pas diverger', () => {
  it('la fenêtre d automatisation est la même des deux côtés', () => {
    expect(EDGE).toContain(
      `PIPELINE_WINDOW_START_HOUR = ${PIPELINE_WINDOW_START_HOUR}`,
    )
    expect(EDGE).toContain(
      `PIPELINE_WINDOW_END_HOUR = ${PIPELINE_WINDOW_END_HOUR}`,
    )
  })

  it('la bascule du jour hôtelier est la même des deux côtés', () => {
    expect(EDGE).toContain(`DAY_CUTOFF_HOUR = ${DAY_CUTOFF_HOUR}`)
  })

  it('la bascule du jour ouvre la fenêtre — invariant du candidat', () => {
    // Tant que les deux coïncident, le nom du cycle est constant sur toute la
    // fenêtre d'envoi : le rapport candidat ne peut pas changer en cours de
    // nuit. Déplacer l'une sans l'autre romprait cette garantie sans bruit.
    expect(DAY_CUTOFF_HOUR).toBe(PIPELINE_WINDOW_START_HOUR)
  })
})

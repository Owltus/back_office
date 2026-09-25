import { describe, expect, it } from 'vitest'

import {
  NOMBRE_MAX_HISTORIQUE,
  entreesAElaguer,
  instantaneEgal,
  retirerMetadata,
} from '#/lib/classeur/merge/snapshot.ts'
import { chJson, fichier, itJson } from '#/lib/classeur/merge/fixtures.ts'

/*
 * Oracles : `strip_metadata` (retire la clé `_metadata` seule) et
 * `snapshots_equal` (égalité de `serde_json::Value` : clés non ordonnées,
 * tableaux ordonnés) ; `prune_merge_history` (garde les N plus récents par
 * `merged_at` décroissant).
 */

const meta = (generated_at: string) => ({
  description: '',
  generated_at,
  note: '',
  schema: null,
  periodicites: [],
})

describe('instantaneEgal', () => {
  const base = fichier([
    chJson({
      label: 'A',
      items: [itJson({ kind: 'document', title: 'D', updated_at: 'x' })],
    }),
  ])

  it('ignore _metadata (generated_at volatil) et l’ordre des clés', () => {
    const a = { ...base, _metadata: meta('2026-01-01T00:00:00Z') }
    const b = {
      chapters: base.chapters,
      classeur: base.classeur,
      format_version: 2,
      _metadata: meta('2026-02-02T00:00:00Z'),
    }
    expect(instantaneEgal(a, b)).toBe(true)
    expect(retirerMetadata(a)).not.toHaveProperty('_metadata')
  })

  it('distingue une donnée qui change, y compris updated_at d’un élément et l’ordre des tableaux', () => {
    const autreTitre = fichier([
      chJson({
        label: 'A',
        items: [itJson({ kind: 'document', title: 'E', updated_at: 'x' })],
      }),
    ])
    expect(instantaneEgal(base, autreTitre)).toBe(false)
    const autreDate = fichier([
      chJson({
        label: 'A',
        items: [itJson({ kind: 'document', title: 'D', updated_at: 'y' })],
      }),
    ])
    expect(instantaneEgal(base, autreDate)).toBe(false)
    const deux = fichier([chJson({ label: 'A' }), chJson({ label: 'B' })])
    const inverse = fichier([chJson({ label: 'B' }), chJson({ label: 'A' })])
    expect(instantaneEgal(deux, inverse)).toBe(false)
    expect(
      instantaneEgal(
        deux,
        fichier([chJson({ label: 'A' }), chJson({ label: 'B' })]),
      ),
    ).toBe(true)
  })

  it('accepte des valeurs quelconques (instantané relu de la base) sans planter', () => {
    expect(instantaneEgal(null, null)).toBe(true)
    expect(instantaneEgal(null, base)).toBe(false)
    expect(instantaneEgal('x', 'x')).toBe(true)
    expect(instantaneEgal(JSON.parse(JSON.stringify(base)), base)).toBe(true)
  })
})

describe('entreesAElaguer', () => {
  it('garde les 10 plus récentes par défaut et rend les identifiants des autres', () => {
    expect(NOMBRE_MAX_HISTORIQUE).toBe(10)
    const entrees = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      merged_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }))
    expect(entreesAElaguer(entrees)).toEqual([2, 1])
    expect(entreesAElaguer(entrees, 3)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(entreesAElaguer(entrees.slice(0, 3))).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'

import { parseComparisonMetrics } from '#/lib/repjour/parse/metrics.ts'

/* Extrait fidèle d'un export « Comparison By Date » : un en-tête, une valeur
 * entière, un pourcentage, un couple adultes/enfants, un négatif, une ligne
 * vide, et deux libellés identiques (le piège de la clé par libellé). */
const CSV = `SECTION,TODAY,MTD,LAST YEAR MTD,MTD VARIANCE,YTD,LAST YEAR YTD,YTD VARIANCE
 No Show Rooms,1.00,4.00,2.00,2.00,87.00,85.00,2.00
 Occupied Rooms,74.00,504.00,534.00,-30.00,10811.00,10295.00,516.00
 Guests (Adults / Children),82 / 0,624 / 16,721 / 4,-97 / 12,13916 / 105,13314 / 69,602 / 36
 Total Occupancy %,92.50%,78.75%,83.44%,-4.69%,71.50%,68.09%,3.41%
Petit-déjeuner Groupe,0.00,454.50,418.14,36.36,10835.28,7272.00,3563.28
Petit-déjeuner Groupe,0.00,0.00,0.00,0.00,0.00,0.00,0.00

`

describe('parseComparisonMetrics', () => {
  const rows = parseComparisonMetrics(CSV)

  it('capture chaque ligne de données et écarte les lignes vides', () => {
    expect(rows).toHaveLength(6)
    expect(rows.map((r) => r.lineNo)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('rogne les espaces du libellé, que le PMS ajoute en tête', () => {
    expect(rows[0].section).toBe('No Show Rooms')
  })

  it('lit le no-show du jour, la donnée que le rapprochement affiche', () => {
    expect(rows[0].today).toBe(1)
    expect(rows[1].today).toBe(74)
  })

  it("n'invente pas de nombre à partir d'un couple « 82 / 0 »", () => {
    // parseFloat('82 / 0') vaudrait 82 : le champ numérique doit rester null…
    expect(rows[2].today).toBeNull()
    expect(rows[2].mtd).toBeNull()
    // …et la valeur d'origine survivre dans `raw`.
    expect(rows[2].raw.today).toBe('82 / 0')
  })

  it('convertit les pourcentages et conserve leur écriture d’origine', () => {
    expect(rows[3].today).toBe(92.5)
    expect(rows[3].mtdVariance).toBe(-4.69)
    expect(rows[3].raw.today).toBe('92.50%')
  })

  it('distingue deux libellés identiques par leur rang', () => {
    expect(rows[4].section).toBe(rows[5].section)
    expect(rows[4].mtd).toBe(454.5)
    expect(rows[5].mtd).toBe(0)
  })

  it('rejette un fichier sans colonne TODAY', () => {
    expect(() => parseComparisonMetrics('SECTION,MTD\nFoo,1')).toThrow(/TODAY/)
  })
})

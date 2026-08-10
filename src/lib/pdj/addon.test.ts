import { describe, expect, it } from 'vitest'

import {
  breakfastServiceDate,
  isBreakfastCode,
  parseAddonProduction,
  parseAddonProductionRange,
} from '#/lib/pdj/addon.ts'

/*
 * Parseur du CSV « Addon Production ». Données ANONYMISÉES inline (les exports
 * bruts contiennent des PII et sont gitignorés). Structure réelle : préambule
 * (Hotel Code…, Date Range…) puis en-tête des codes portant la date « clôture »,
 * puis une ligne par code.
 */

// CSV d'exemple (structure réelle, cf. plan). La date « clôture » (2026-08-09)
// est sur la ligne d'en-tête des codes, PAS sur « Generated Date » (10-08-2026).
const EXAMPLE =
  'Hotel Code,Hotel Name,Generated Date,Generated Time,Report Name\n' +
  '4401NACH,Okko Hotels Nantes Centre Ville,10-08-2026,12:05:02,Addon Production\n' +
  'Date Range,Total number,Total Revenue,Average revenue\n' +
  '2026-08-09 - 2026-08-09,25,877.00,35.08\n' +
  '"",Total Count,Total Revenue,Average revenue,2026-08-09,""\n' +
  'PDJ,22,817.00,37.14,22,817.00\n' +
  'PDJBB,3,60.00,20.00,3,60.00\n'

describe('isBreakfastCode', () => {
  it('matche PDJ et PDJBB, écarte le reste (trim/upper)', () => {
    expect(isBreakfastCode('PDJ')).toBe(true)
    expect(isBreakfastCode('PDJBB')).toBe(true)
    expect(isBreakfastCode('  pdj ')).toBe(true)
    expect(isBreakfastCode('PARKING')).toBe(false)
    expect(isBreakfastCode('TAXE')).toBe(false)
    expect(isBreakfastCode('')).toBe(false)
  })
})

describe('parseAddonProduction', () => {
  it('exemple : businessDate = 2026-08-09, PDJ 22/817 et PDJBB 3/60', () => {
    const parsed = parseAddonProduction(EXAMPLE)

    expect(parsed.businessDate).toBe('2026-08-09')
    expect(parsed.rows).toHaveLength(2)

    const pdj = parsed.rows.find((r) => r.code === 'PDJ')!
    expect(pdj.count).toBe(22)
    expect(pdj.revenue).toBe(817)

    const pdjbb = parsed.rows.find((r) => r.code === 'PDJBB')!
    expect(pdjbb.count).toBe(3)
    expect(pdjbb.revenue).toBe(60)
  })

  it('écarte les codes non petit-déjeuner (parking, taxe…)', () => {
    const csv =
      '"",Total Count,Total Revenue,Average revenue,2026-08-09,""\n' +
      'PDJ,22,817.00,37.14,22,817.00\n' +
      'PARKING,10,150.00,15.00,10,150.00\n' +
      'TAXE DE SEJOUR,25,45.00,1.80,25,45.00\n'
    const parsed = parseAddonProduction(csv)

    expect(parsed.rows.map((r) => r.code)).toEqual(['PDJ'])
  })

  it('normalise le code en trim/upper', () => {
    const csv =
      '"",Total Count,Total Revenue,Average revenue,2026-08-09,""\n' +
      ' pdjbb ,3,60.00,20.00,3,60.00\n'
    const parsed = parseAddonProduction(csv)

    expect(parsed.rows[0].code).toBe('PDJBB')
  })

  it('robuste à un BOM en tête', () => {
    const parsed = parseAddonProduction('﻿' + EXAMPLE)

    expect(parsed.businessDate).toBe('2026-08-09')
    expect(parsed.rows).toHaveLength(2)
  })

  it('robuste au séparateur point-virgule et aux décimales virgule', () => {
    const csv =
      '"";Total Count;Total Revenue;Average revenue;2026-08-09;""\n' +
      'PDJ;22;817,00;37,14;22;817,00\n' +
      'PDJBB;3;60,00;20,00;3;60,00\n'
    const parsed = parseAddonProduction(csv)

    expect(parsed.businessDate).toBe('2026-08-09')
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows.find((r) => r.code === 'PDJ')!.revenue).toBe(817)
    expect(parsed.rows.find((r) => r.code === 'PDJBB')!.revenue).toBe(60)
  })

  it('repli sur la borne gauche de Date Range si l’en-tête des codes n’a pas de date', () => {
    const csv =
      'Date Range,Total number,Total Revenue,Average revenue\n' +
      '2026-08-09 - 2026-08-09,25,877.00,35.08\n' +
      '"",Total Count,Total Revenue,Average revenue,""\n' +
      'PDJ,22,817.00,37.14,22,817.00\n'
    const parsed = parseAddonProduction(csv)

    expect(parsed.businessDate).toBe('2026-08-09')
    expect(parsed.rows).toHaveLength(1)
  })

  it('en-tête introuvable : businessDate null, aucune ligne', () => {
    const parsed = parseAddonProduction('nawak,pas,des,colonnes\n1,2,3,4\n')

    expect(parsed.businessDate).toBeNull()
    expect(parsed.rows).toHaveLength(0)
  })
})

describe('breakfastServiceDate', () => {
  it('date métier + 1 jour (jour du board)', () => {
    expect(breakfastServiceDate('2026-08-09')).toBe('2026-08-10')
  })

  it('fin de mois : report sur le mois suivant', () => {
    expect(breakfastServiceDate('2026-08-31')).toBe('2026-09-01')
  })

  it('fin d’année : report sur l’année suivante', () => {
    expect(breakfastServiceDate('2026-12-31')).toBe('2027-01-01')
  })

  it('fin de février (année non bissextile)', () => {
    expect(breakfastServiceDate('2026-02-28')).toBe('2026-03-01')
  })
})

describe('parseAddonProductionRange', () => {
  // Format LARGE : une paire (count, revenue) par jour après les 3 colonnes de total.
  const RANGE =
    'Date Range,Total number,Total Revenue,Average revenue\n' +
    '2026-07-02 - 2026-07-03,33,650.00,19.70\n' +
    '"",Total Count,Total Revenue,Average revenue,2026-07-02,"",2026-07-03,""\n' +
    'PDJ,15,400.00,26.67,10,300.00,5,100.00\n' +
    'PDJBB,3,50.00,16.67,0,0.00,3,50.00\n' +
    'PARKING,12,200.00,16.67,6,100.00,6,100.00\n'

  it('extrait une ligne par (jour, code PDJ), colonnes count/revenue du jour', () => {
    const rows = parseAddonProductionRange(RANGE)
    // jour 02 : PDJ 10/300 ; PDJBB 0/0 (ignoré). jour 03 : PDJ 5/100 ; PDJBB 3/50.
    // PARKING écarté (hors petit-déjeuner).
    expect(rows).toEqual([
      { businessDate: '2026-07-02', code: 'PDJ', count: 10, revenue: 300 },
      { businessDate: '2026-07-03', code: 'PDJ', count: 5, revenue: 100 },
      { businessDate: '2026-07-03', code: 'PDJBB', count: 3, revenue: 50 },
    ])
  })

  it('gère un fichier mono-jour (une seule colonne date)', () => {
    const rows = parseAddonProductionRange(EXAMPLE)
    expect(rows).toEqual([
      { businessDate: '2026-08-09', code: 'PDJ', count: 22, revenue: 817 },
      { businessDate: '2026-08-09', code: 'PDJBB', count: 3, revenue: 60 },
    ])
  })

  it('structure non reconnue : tableau vide', () => {
    expect(parseAddonProductionRange('nawak,pas,des,colonnes\n1,2,3,4\n')).toEqual(
      [],
    )
  })
})

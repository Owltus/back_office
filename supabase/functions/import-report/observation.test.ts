// Étape 8 du plan securite-audit-run2-2026-11-18 : contrôles de l'import en
// OBSERVATION (Hotel Code, dates du calendrier, compteurs de l'Addon, âge du
// Forecast). Aucun de ces contrôles ne doit refuser un vrai fichier.
//
// Lancer : `deno test --no-check --node-modules-dir=none --allow-read supabase/functions/import-report/observation.test.ts`
// (`--allow-read` : deux tests relisent les fixtures `.eml` ; sans lui, ils
// sont signalés « ignored », les autres tournent.)

import { assertEquals } from 'jsr:@std/assert@1'
import {
  ageForecastMinutes,
  decisionHotelCode,
  generatedAtOf,
  hotelCodeOf,
  pourJournal,
} from './entete.ts'
import { serviceDateFromFilename } from './pdj.ts'
import { extractReportDateFromCsv } from './repjour.ts'
import { parseAddonProduction } from './addon.ts'

const FIXTURES = new URL('../../tests/fixtures/', import.meta.url)
const fixturesLisibles =
  Deno.permissions.querySync({ name: 'read', path: FIXTURES }).state === 'granted'

const PREAMBULE =
  'Hotel Code,Hotel Name,Generated Date,Generated Time,Report Name\n' +
  '9999DEMO,Hotel de Demonstration (fictif),14-10-2026,02:30:41,Forecast By Date Range\n' +
  'DATE,OCC,OCC %,ADR,REV\n' +
  '01-10-2026,56,70.00%,133.93,7500.20\n'

// --- hotelCodeOf -----------------------------------------------------------

Deno.test('hotelCodeOf : bloc présent', () => {
  assertEquals(hotelCodeOf(PREAMBULE), '9999DEMO')
})

Deno.test('hotelCodeOf : BOM en tête', () => {
  assertEquals(hotelCodeOf('﻿' + PREAMBULE), '9999DEMO')
})

Deno.test('hotelCodeOf : séparateur « ; » et fins de ligne Windows', () => {
  const csv =
    'Hotel Code;Hotel Name;Generated Date\r\n4401NACH;Okko Hotels Nantes;10-08-2026\r\nDATE;OCC\r\n'
  assertEquals(hotelCodeOf(csv), '4401NACH')
})

Deno.test('hotelCodeOf : guillemets et espaces retirés', () => {
  assertEquals(hotelCodeOf('"Hotel Code","Hotel Name"\n" 4401NACH ","x"\n'), '4401NACH')
})

Deno.test('hotelCodeOf : bloc absent (export manuel) → null', () => {
  assertEquals(hotelCodeOf('DATE,OCC,OCC %,ADR,REV\n01-10-2026,56,70%,1,2\n'), null)
  assertEquals(hotelCodeOf(''), null)
})

Deno.test('hotelCodeOf : en-tête sans ligne de valeurs, ou valeur vide → null', () => {
  assertEquals(hotelCodeOf('Hotel Code,Hotel Name\n'), null)
  assertEquals(hotelCodeOf('Hotel Code,Hotel Name\n,Hotel X\n'), null)
})

Deno.test('hotelCodeOf : colonne Hotel Code qui n est pas la première', () => {
  assertEquals(hotelCodeOf('Report Name,Hotel Code\nAddon,4401NACH\n'), '4401NACH')
})

Deno.test({
  name: 'hotelCodeOf : vrais fichiers de fixtures',
  ignore: !fixturesLisibles,
  fn: async () => {
    for (const nom of ['comparison', 'forecast', 'in-house', 'addon-production']) {
      const eml = await Deno.readTextFile(new URL(`${nom}.eml`, FIXTURES))
      const debut = eml.indexOf('Hotel Code,')
      assertEquals(hotelCodeOf(eml.slice(debut)), '9999DEMO', nom)
    }
  },
})

// --- decisionHotelCode ------------------------------------------------------

Deno.test('Hotel Code : variable absente = aucun contrôle', () => {
  assertEquals(decisionHotelCode('AUTRE', undefined, 'true').etat, 'sans-controle')
  assertEquals(decisionHotelCode('AUTRE', '  ', 'true').refuser, false)
})

Deno.test('Hotel Code : code absent du fichier = journal seul, jamais refusé', () => {
  const d = decisionHotelCode(null, '4401NACH', 'true')
  assertEquals(d.etat, 'absent')
  assertEquals(d.refuser, false)
})

Deno.test('Hotel Code : code identique = OK (casse et espaces ignorés)', () => {
  assertEquals(decisionHotelCode('4401NACH', '4401NACH', 'true').etat, 'ok')
  assertEquals(decisionHotelCode('4401nach', ' 4401NACH ', undefined).etat, 'ok')
})

Deno.test('Hotel Code : code différent = observation tant que ENFORCE ≠ « true »', () => {
  for (const enforce of [undefined, '', 'false', 'TRUE', '1', ' true', 'yes']) {
    const d = decisionHotelCode('9999DEMO', '4401NACH', enforce)
    assertEquals(d.etat, 'different', String(enforce))
    assertEquals(d.refuser, false, String(enforce))
  }
})

Deno.test('Hotel Code : code différent refusé avec ENFORCE exactement « true »', () => {
  const d = decisionHotelCode('9999DEMO', '4401NACH', 'true')
  assertEquals(d.etat, 'different')
  assertEquals(d.refuser, true)
})

Deno.test('pourJournal : retire les caractères de contrôle et borne la longueur', () => {
  assertEquals(pourJournal('44\r\n01\tNACH'), '44  01 NACH')
  assertEquals(pourJournal('x'.repeat(100)).length, 40)
})

// --- Âge du Forecast ---------------------------------------------------------

Deno.test('generatedAtOf : lit Generated Date et Generated Time', () => {
  assertEquals(generatedAtOf(PREAMBULE), { date: '2026-10-14', heure: '02:30:41' })
})

Deno.test('generatedAtOf : absent ou date impossible → null', () => {
  assertEquals(generatedAtOf('DATE,OCC\n'), null)
  assertEquals(
    generatedAtOf('Hotel Code,Generated Date,Generated Time\nX,31-02-2026,02:00:00\n'),
    null,
  )
})

Deno.test('ageForecastMinutes : heure lue comme heure de Paris', () => {
  // 14/10/2026 02:30:41 à Paris (heure d'été, UTC+2) = 00:30:41 UTC.
  const maintenant = new Date('2026-10-14T00:40:41Z')
  assertEquals(ageForecastMinutes({ date: '2026-10-14', heure: '02:30:41' }, maintenant), 10)
  // Heure absente : minuit.
  assertEquals(
    ageForecastMinutes({ date: '2026-01-15', heure: null }, new Date('2026-01-15T00:00:00Z')),
    60,
  )
})

// --- Dates du calendrier -------------------------------------------------------

Deno.test('serviceDateFromFilename : vraie date inchangée', () => {
  assertEquals(
    serviceDateFromFilename('9999DEMO_in_house_guests_report_DAILY_20261014030258.csv'),
    '2026-10-14',
  )
  assertEquals(serviceDateFromFilename('audit_in_house_20010101.csv'), '2001-01-01')
})

Deno.test('serviceDateFromFilename : date impossible refusée (31/02, mois 13)', () => {
  assertEquals(serviceDateFromFilename('x_in_house_20260231.csv'), null)
  assertEquals(serviceDateFromFilename('x_in_house_20261301.csv'), null)
  assertEquals(serviceDateFromFilename('x_in_house_20250229.csv'), null)
  assertEquals(serviceDateFromFilename('x_in_house.csv'), null)
})

Deno.test('serviceDateFromFilename : 29/02 d une année bissextile accepté', () => {
  assertEquals(serviceDateFromFilename('x_in_house_20280229.csv'), '2028-02-29')
})

const COMPARISON = (date: string) =>
  `SECTION,TODAY,MTD,LAST YEAR MTD,REPORT DATE\n Occupied Rooms,60.00,1600.00,1500.00,${date}\n`

Deno.test('REPORT DATE : vraie date inchangée', () => {
  assertEquals(extractReportDateFromCsv(COMPARISON('27-09-2026')), {
    dayOfMonth: 27,
    month: 9,
    year: 2026,
    daysInMonth: 30,
  })
})

Deno.test('REPORT DATE : date impossible ignorée (31-02, 00-10, 10-13)', () => {
  assertEquals(extractReportDateFromCsv(COMPARISON('31-02-2026')), null)
  assertEquals(extractReportDateFromCsv(COMPARISON('00-10-2026')), null)
  assertEquals(extractReportDateFromCsv(COMPARISON('10-13-2026')), null)
})

// --- Compteurs de l'Addon ----------------------------------------------------

const ADDON = (lignes: string[]) =>
  [
    'Hotel Code,Hotel Name,Generated Date,Generated Time,Report Name',
    '9999DEMO,Hotel de Demonstration (fictif),14-10-2026,12:05:02,Addon Production',
    '"",Total Count,Total Revenue,Average revenue,2026-10-13,""',
    ...lignes,
  ].join('\n')

Deno.test('Addon : lignes valides inchangées', () => {
  const p = parseAddonProduction(ADDON(['PDJ,14,532.00,38.00', 'PDJBB,4,80.00,20.00', 'PDJ0,0,0.00,0']))
  assertEquals(p.businessDate, '2026-10-13')
  assertEquals(
    p.rows.map((r) => [r.code, r.count, r.revenue]),
    [
      ['PDJ', 14, 532],
      ['PDJBB', 4, 80],
      ['PDJ0', 0, 0],
    ],
  )
})

Deno.test('Addon : compteur hors bornes ou non entier → ligne sautée', () => {
  const p = parseAddonProduction(
    ADDON([
      'PDJA,-1,10.00,1',
      'PDJB,1001,10.00,1',
      'PDJC,1.5,10.00,1',
      'PDJD,abc,10.00,1',
      'PDJE,1e3,10.00,1',
      'PDJF,1000,10.00,1',
    ]),
  )
  assertEquals(
    p.rows.map((r) => r.code),
    ['PDJF'],
  )
})

Deno.test('Addon : recette négative, infinie ou illisible → ligne sautée', () => {
  const p = parseAddonProduction(
    ADDON([
      'PDJA,2,-5.00,1',
      'PDJB,2,Infinity,1',
      'PDJC,2,abc,1',
      'PDJD,2,1e400,1',
      'PDJE,2,"12,50",1',
    ]),
  )
  assertEquals(
    p.rows.map((r) => [r.code, r.revenue]),
    [['PDJE', 12.5]],
  )
})

Deno.test({
  name: 'Addon : vrai fichier de fixture lu en entier',
  ignore: !fixturesLisibles,
  fn: async () => {
    const eml = await Deno.readTextFile(new URL('addon-production.eml', FIXTURES))
    const debut = eml.indexOf('Hotel Code,')
    const fin = eml.indexOf('--=_fixture_addon_9999DEMO--')
    const p = parseAddonProduction(eml.slice(debut, fin))
    assertEquals(
      p.rows.map((r) => [r.code, r.count, r.revenue]),
      [
        ['PDJ', 14, 532],
        ['PDJBB', 4, 80],
      ],
    )
  },
})

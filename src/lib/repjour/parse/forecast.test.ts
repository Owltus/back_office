import { readFileSync } from 'node:fs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { VAT_FACTOR } from '#/lib/repjour/constants.ts'
import {
  lireMontant,
  parseForecast,
  parseForecastAll,
} from '#/lib/repjour/parse/forecast.ts'
import type { ForecastRow } from '#/lib/repjour/types.ts'

/*
 * Oracles utilisés dans ce fichier (jamais une valeur relevée en sortie) :
 * - FORMAT SOURCE : export StayNTouch « Forecast By Date Range », colonnes
 *   DATE (jj-mm-aaaa), OCC (entier), OCC %, ADR, REV (TTC, point décimal),
 *   dernière ligne TOTALS ; l'export planifié ajoute un préambule de deux
 *   lignes (Hotel Code…). Voir supabase/tests/fixtures/forecast.eml.
 * - RÈGLE MÉTIER : REV est TTC, la TVA hébergement est de 10 %
 *   (VAT_FACTOR = 1,10, constants.ts) → revHT × 1,10 = revTTC.
 * - CONTRAT DE SORTIE : date ISO aaaa-mm-jj (clé `onConflict: 'date'` de
 *   l'upsert forecast_days), month/year numériques du jour.
 * - MESSAGES D'ERREUR : les trois seules erreurs que l'app sait afficher
 *   (vide, format, jour en double).
 */

const ERR_VIDE = 'vide ou incomplet'
const ERR_FORMAT = "n'a pas le bon format"
const ERR_DOUBLON = 'contient deux fois le jour'

const EN_TETE = 'DATE,OCC,OCC %,ADR,REV'

function csv(lignes: string[], eol = '\n'): string {
  return lignes.join(eol) + eol
}

/** Extrait la pièce jointe CSV de l'e-mail fictif du dépôt. */
function csvDeLaFixture(): string {
  const eml = readFileSync('supabase/tests/fixtures/forecast.eml', 'utf-8')
  const debut = eml.indexOf('Hotel Code,')
  const fin = eml.indexOf('\n--=_fixture_forecast', debut)
  return eml.slice(debut, fin)
}

describe('parseForecastAll — fixture du dépôt (export planifié réel, fictif)', () => {
  const texte = csvDeLaFixture()
  const lignes = parseForecastAll(texte)

  it('lit toutes les lignes datées, sans le préambule ni TOTALS', () => {
    // Oracle : la fixture couvre octobre (31 j) et novembre (30 j) 2026.
    expect(lignes).toHaveLength(31 + 30)
    expect(lignes[0].date).toBe('2026-10-01')
    expect(lignes.at(-1)?.date).toBe('2026-11-30')
  })

  it('la somme des lignes égale la ligne TOTALS du fichier', () => {
    // Oracle : invariant du format source, TOTALS = somme des jours.
    const totals = texte
      .split('\n')
      .find((l) => l.startsWith('TOTALS'))!
      .split(',')
    const occ = lignes.reduce((s, r) => s + r.occ, 0)
    const rev = lignes.reduce((s, r) => s + r.revTTC, 0)
    expect(occ).toBe(Number(totals[1]))
    expect(rev).toBeCloseTo(Number(totals[4]), 2)
  })

  it('aucune ligne ne dépasse les 80 chambres de l hôtel', () => {
    // Oracle : hôtel unique de 80 chambres (CLAUDE.md, constants.ts).
    for (const r of lignes) expect(r.occ).toBeLessThanOrEqual(80)
  })
})

describe('parseForecastAll — cas nominaux', () => {
  it('convertit jj-mm-aaaa en aaaa-mm-jj et lit OCC et REV', () => {
    // Oracle : format source (DATE jj-mm-aaaa) → contrat de sortie ISO.
    const r = parseForecastAll(
      csv([EN_TETE, '05-03-2026,42,52.50%,120.00,5040.00']),
    )
    expect(r).toEqual([
      expect.objectContaining({
        date: '2026-03-05',
        month: 3,
        year: 2026,
        occ: 42,
        revTTC: 5040,
      }),
    ])
  })

  it('REV est TTC : revHT × 1,10 = revTTC', () => {
    // Oracle : règle métier TVA 10 %, REV du forecast déjà TTC.
    const [r] = parseForecastAll(
      csv([EN_TETE, '01-01-2026,10,,110.00,1100.00']),
    )
    expect(r.revTTC).toBe(1100)
    expect(r.revHT).toBeCloseTo(1000, 9)
    expect(r.revHT).toBeLessThan(r.revTTC)
  })

  it('trouve les colonnes par leur NOM, dans n importe quel ordre', () => {
    // Oracle : commentaire du code « localiser les colonnes PAR NOM ».
    const r = parseForecastAll(
      csv(['REV,ADR,OCC,DATE', '2200.00,110,20,15-06-2026']),
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ date: '2026-06-15', occ: 20, revTTC: 2200 })
  })

  it('en-têtes en minuscules ou entourés d espaces acceptés', () => {
    // Oracle : comparaison des en-têtes après trim + majuscules.
    const r = parseForecastAll(
      csv([' date , occ ,adr, rev ', '02-02-2026,3,1,300']),
    )
    expect(r[0]).toMatchObject({ date: '2026-02-02', occ: 3, revTTC: 300 })
  })

  it('ignore la ligne TOTALS quelle que soit sa casse', () => {
    // Oracle : format source, TOTALS n'est pas un jour.
    const r = parseForecastAll(
      csv([
        EN_TETE,
        '01-01-2026,1,,1,100',
        'Totals,1,,1,100',
        'TOTALS,1,,1,100',
      ]),
    )
    expect(r.map((x) => x.date)).toEqual(['2026-01-01'])
  })

  it('jour et mois sur un chiffre sont complétés à deux', () => {
    // Oracle : contrat ISO aaaa-mm-jj (clé de date de la base).
    const r = parseForecastAll(csv([EN_TETE, '1-2-2026,1,,1,1']))
    expect(r[0].date).toBe('2026-02-01')
  })
})

describe('parseForecastAll — entrées hostiles', () => {
  it('texte vide ou une seule ligne → erreur « vide »', () => {
    // Oracle : message d'erreur « vide ou incomplet » (moins de 2 lignes).
    expect(() => parseForecastAll('')).toThrow(ERR_VIDE)
    expect(() => parseForecastAll('\n\n\r\n')).toThrow(ERR_VIDE)
    expect(() => parseForecastAll(EN_TETE)).toThrow(ERR_VIDE)
  })

  it('aucune ligne DATE+OCC+REV → erreur « format »', () => {
    // Oracle : en-tête obligatoire, sinon ce n'est pas un Forecast.
    expect(() => parseForecastAll(csv(['A,B,C', '1,2,3']))).toThrow(ERR_FORMAT)
    // Il manque REV : un Comparison, par exemple, n'est pas accepté.
    expect(() =>
      parseForecastAll(csv(['DATE,OCC,ADR', '01-01-2026,1,1'])),
    ).toThrow(ERR_FORMAT)
  })

  it('en-tête seul (fichier sans aucun jour) → tableau vide, pas d erreur', () => {
    // Oracle : l'orchestrateur traite lui-même `length === 0` (preValidateForecast).
    expect(parseForecastAll(csv(['préambule', EN_TETE]))).toEqual([])
  })

  it('CRLF et LF donnent le même résultat', () => {
    // Oracle : un export Windows ne change pas les données.
    const l = ['x,y', EN_TETE, '03-04-2026,5,,1,555.5', 'TOTALS,5,,1,555.5']
    expect(parseForecastAll(csv(l, '\r\n'))).toEqual(
      parseForecastAll(csv(l, '\n')),
    )
  })

  it('BOM UTF-8 en tête de fichier sans préambule toléré', () => {
    // Oracle : export manuel ouvert/enregistré sous Excel, l'en-tête DATE
    // est la 1re ligne et porte le BOM.
    const r = parseForecastAll('﻿' + csv([EN_TETE, '03-04-2026,5,,1,10']))
    expect(r).toHaveLength(1)
    expect(r[0].date).toBe('2026-04-03')
  })

  it('cellules OCC / REV vides ou non numériques → 0, la ligne est gardée', () => {
    // Oracle : comportement documenté par `|| 0` — un jour sans prévision
    // vaut 0, il ne disparaît pas.
    const r = parseForecastAll(
      csv([EN_TETE, '01-01-2026,,,,', '02-01-2026,abc,,,n/a']),
    )
    expect(r.map((x) => [x.date, x.occ, x.revTTC, x.revHT])).toEqual([
      ['2026-01-01', 0, 0, 0],
      ['2026-01-02', 0, 0, 0],
    ])
  })

  it('ligne trop courte (colonnes manquantes) ne plante pas', () => {
    // Oracle : invariant « ne jette que les erreurs attendues ».
    const r = parseForecastAll(csv([EN_TETE, '01-01-2026']))
    expect(r).toEqual([
      expect.objectContaining({ date: '2026-01-01', occ: 0, revTTC: 0 }),
    ])
  })

  it('lignes vides, dates mal formées et lignes en trop sont ignorées', () => {
    // Oracle : seule une DATE en trois parties numériques est un jour.
    const r = parseForecastAll(
      csv([
        EN_TETE,
        '',
        '2026/01/01,1,,1,1',
        '01-01,1,,1,1',
        'abc-def-ghi,1,,1,1',
        '01-01-2026-extra,1,,1,1',
        ',1,,1,1',
        '01-01-2026,7,,1,70',
        'Généré par StayNTouch',
      ]),
    )
    expect(r.map((x) => [x.date, x.occ])).toEqual([['2026-01-01', 7]])
  })

  it('le préambule avant l en-tête n est jamais lu comme des jours', () => {
    // Oracle : format de l'export planifié (préambule Hotel Code…). Une ligne
    // de préambule qui ressemble à une date reste hors des données.
    const r = parseForecastAll(
      csv([
        'Hotel Code,Generated Date',
        'X,14-10-2026',
        EN_TETE,
        '01-10-2026,1,,1,1',
      ]),
    )
    expect(r.map((x) => x.date)).toEqual(['2026-10-01'])
  })

  it('séparateur point-virgule (Excel FR) avec point décimal', () => {
    // Oracle : papaparse détecte le séparateur ; les données sont les mêmes.
    const r = parseForecastAll(
      csv(['DATE;OCC;OCC %;ADR;REV', '01-01-2026;8;10%;100;800.50']),
    )
    expect(r[0]).toMatchObject({ date: '2026-01-01', occ: 8, revTTC: 800.5 })
  })

  it('virgule décimale française « 7500,20 » lue en entier ou refusée, jamais tronquée', () => {
    // Ancien défaut : `parseFloat('7500,20')` rendait 7500, les centimes
    // disparaissaient EN SILENCE (« 1 234,56 » donnait même 1).
    // Oracle : REV est un montant ; une valeur mal lue doit être soit
    // correcte, soit refusée.
    let r: ForecastRow[] | null = null
    try {
      r = parseForecastAll(
        csv(['DATE;OCC;OCC %;ADR;REV', '01-01-2026;8;10%;100;7500,20']),
      )
    } catch {
      return // refus explicite : acceptable
    }
    expect(r[0].revTTC).toBe(7500.2)
  })

  it('une date impossible (31-02-2026) n est pas rendue comme une date', () => {
    // Ancien défaut : « 31-02-2026 » devenait « 2026-02-31 » : chaîne non
    // valide comme date Postgres, qui ferait échouer TOUT l'upsert du fichier
    // au lieu d'écarter la ligne.
    // Oracle : contrat de sortie, `date` est une date calendaire valide.
    const r = parseForecastAll(
      csv([EN_TETE, '31-02-2026,1,,1,1', '00-13-2026,1,,1,1']),
    )
    for (const x of r) {
      const d = new Date(`${x.date}T00:00:00Z`)
      expect(Number.isNaN(d.getTime())).toBe(false)
      expect(d.toISOString().slice(0, 10)).toBe(x.date)
    }
  })

  it('date impossible écartée comme les autres dates mal formées, le reste est lu', () => {
    // Oracle : même chemin que « 2026/01/01 » ou « abc-def-ghi » (ligne ignorée).
    const r = parseForecastAll(
      csv([
        EN_TETE,
        '31-02-2026,1,,1,1',
        '31-04-2026,1,,1,1',
        '00-01-2026,1,,1,1',
        '01-13-2026,1,,1,1',
        '01-01-2026,7,,1,70',
      ]),
    )
    expect(r.map((x) => x.date)).toEqual(['2026-01-01'])
  })

  it('29 février : accepté en 2024 (bissextile), refusé en 2026', () => {
    // Oracle : calendrier grégorien (2024 divisible par 4, 2026 non).
    const r = parseForecastAll(
      csv([EN_TETE, '29-02-2024,1,,1,10', '29-02-2026,2,,1,20']),
    )
    expect(r.map((x) => x.date)).toEqual(['2024-02-29'])
  })

  it('29 février : 2000 bissextile, 2100 non (règle des siècles)', () => {
    // Oracle : grégorien, siècle bissextile seulement s'il est divisible par 400.
    const r = parseForecastAll(
      csv([EN_TETE, '29-02-2000,1,,1,10', '29-02-2100,2,,1,20']),
    )
    expect(r.map((x) => x.date)).toEqual(['2000-02-29'])
  })

  it('Infinity, -Infinity, NaN et nombres non finis : valeur invalide → 0', () => {
    // Oracle : même traitement que « n/a » (valeur invalide → 0, ligne gardée).
    const r = parseForecastAll(
      csv([
        EN_TETE,
        '01-01-2026,1,,1,Infinity',
        '02-01-2026,1,,1,-Infinity',
        '03-01-2026,1,,1,NaN',
        '04-01-2026,1,,1,1e400',
        '05-01-2026,1,,1,' + '9'.repeat(400),
      ]),
    )
    expect(r.map((x) => [x.revTTC, x.revHT])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ])
    for (const x of r) {
      expect(Number.isFinite(x.revTTC)).toBe(true)
      expect(Number.isFinite(x.revHT)).toBe(true)
    }
  })

  it('un jour présent deux fois → le fichier est refusé (jamais d écrasement silencieux)', () => {
    // Oracle : l'appelant fait un upsert `onConflict: 'date'` ; deux lignes de
    // même date ne peuvent pas être écrites ensemble, et choisir l'une serait
    // deviner. Le message nomme le jour tel qu'écrit dans le fichier.
    const t = csv([EN_TETE, '01-01-2026,1,,1,100', '1-1-2026,2,,1,200'])
    expect(() => parseForecastAll(t)).toThrow(ERR_DOUBLON)
    expect(() => parseForecastAll(t)).toThrow('1-1-2026')
    // Même identiques, deux lignes du même jour sont refusées.
    expect(() =>
      parseForecastAll(
        csv([EN_TETE, '01-01-2026,1,,1,1', '01-01-2026,1,,1,1']),
      ),
    ).toThrow(ERR_DOUBLON)
    // Le filtre par mois ne masque pas le doublon d'un autre mois.
    expect(() =>
      parseForecast(
        csv([
          EN_TETE,
          '01-02-2026,1,,1,1',
          '01-02-2026,1,,1,1',
          '01-03-2026,1,,1,1',
        ]),
        3,
        2026,
      ),
    ).toThrow(ERR_DOUBLON)
  })
})

describe('lireMontant — formats acceptés', () => {
  it.each([
    // Format source (StayNTouch) : point décimal, aucun séparateur de milliers.
    ['7500.20', 7500.2],
    ['444711.13', 444711.13],
    ['1100', 1100],
    ['555.5', 555.5],
    ['-12.50', -12.5],
    // Excel français : virgule décimale, milliers en espace / insécable / fine.
    ['7500,20', 7500.2],
    ['7 500,20', 7500.2],
    ['7\u00A0500,20', 7500.2],
    ['444\u202F711,13', 444711.13],
    [' 1100,00 ', 1100],
    // Milliers explicites de l'autre signe.
    ['7.500,20', 7500.2],
    ['1.234.567', 1234567],
    ['1.234.567,5', 1234567.5],
    ['7,500.20', 7500.2],
    ['1,234,567', 1234567],
    // AMBIGUÏTÉ documentée : UN seul séparateur est toujours décimal.
    ['1,234', 1.234],
    ['1.234', 1.234],
    // Signe € toléré (l'ancien parseFloat le lisait).
    ['7500.20 €', 7500.2],
    ['7 500,20 €', 7500.2],
  ])('« %s » → %d', (cellule, attendu) => {
    expect(lireMontant(cellule)).toBeCloseTo(attendu, 9)
  })

  it.each([
    '',
    '   ',
    undefined,
    'n/a',
    'abc',
    '12abc',
    '1e3',
    'Infinity',
    '-Infinity',
    'NaN',
    '1,2,3',
    '1.23.4',
    '12,34.56',
    '1,234,56',
    '.5',
    '5.',
    '9'.repeat(400),
  ])('« %s » → invalide (null)', (cellule) => {
    expect(lireMontant(cellule)).toBeNull()
  })

  it('propriété : tout montant au centime relu à l identique, point ou virgule, avec ou sans milliers', () => {
    // Oracle : format source et ses écritures Excel FR décrivent le même nombre.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.constantFrom(' ', '\u00A0', '\u202F', ''),
        (centimes, milliers) => {
          const v = centimes / 100
          const [ent, dec] = v.toFixed(2).split('.')
          const groupe = ent.replace(/\B(?=(\d{3})+(?!\d))/g, milliers)
          expect(lireMontant(`${ent}.${dec}`)).toBeCloseTo(v, 9)
          expect(lireMontant(`${groupe},${dec}`)).toBeCloseTo(v, 9)
        },
      ),
    )
  })

  it('propriété : le résultat est toujours fini ou null', () => {
    // Oracle : aucun Infinity/NaN ne doit atteindre la base.
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (s) => {
        const n = lireMontant(s)
        expect(n === null || Number.isFinite(n)).toBe(true)
      }),
      { numRuns: 500 },
    )
  })
})

describe('parseForecast — filtre sur le mois du rapport', () => {
  const texte = csv([
    EN_TETE,
    '30-09-2026,1,,1,100',
    '01-10-2026,2,,1,200',
    '31-10-2026,3,,1,300',
    '01-10-2025,4,,1,400',
    '01-11-2026,5,,1,500',
  ])

  it('ne garde que les jours du mois ET de l année demandés', () => {
    // Oracle : signature (reportMonth, reportYear) — le rapport d'octobre
    // 2026 n'emporte ni septembre, ni novembre, ni octobre 2025.
    expect(parseForecast(texte, 10, 2026).map((r) => r.occ)).toEqual([2, 3])
  })

  it('mois absent du fichier → tableau vide', () => {
    // Oracle : filtre pur, pas d'erreur.
    expect(parseForecast(texte, 2, 2026)).toEqual([])
  })

  it('propage les erreurs de lecture', () => {
    // Oracle : parseForecast n'est qu'un filtre sur parseForecastAll.
    expect(() => parseForecast('', 1, 2026)).toThrow(ERR_VIDE)
  })
})

/* ───────────── Propriétés ───────────── */

const jourArb = fc.record({
  day: fc.integer({ min: 1, max: 28 }),
  month: fc.integer({ min: 1, max: 12 }),
  year: fc.integer({ min: 2000, max: 2099 }),
  occ: fc.integer({ min: 0, max: 80 }),
  centimes: fc.integer({ min: 0, max: 5_000_000 }),
})
// Jours DISTINCTS : un jour en double refuse le fichier (testé à part).
const joursArb = (c: { minLength?: number; maxLength: number }) =>
  fc.uniqueArray(jourArb, {
    ...c,
    selector: (j) => `${j.year}-${j.month}-${j.day}`,
  })
type Jour = typeof jourArb extends fc.Arbitrary<infer T> ? T : never

const p2 = (n: number) => String(n).padStart(2, '0')
const ligneJour = (j: Jour) =>
  `${p2(j.day)}-${p2(j.month)}-${j.year},${j.occ},,1,${(j.centimes / 100).toFixed(2)}`

describe('parseForecastAll — propriétés', () => {
  it('ne jette jamais autre chose que les trois erreurs attendues', () => {
    // Oracle : l'UI n'affiche que ces deux messages ; toute autre exception
    // serait un écran d'erreur brut.
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (s) => {
        try {
          parseForecastAll(s)
        } catch (e) {
          const m = (e as Error).message
          expect(
            m.includes(ERR_VIDE) ||
              m.includes(ERR_FORMAT) ||
              m.includes(ERR_DOUBLON),
          ).toBe(true)
        }
      }),
      { numRuns: 400 },
    )
  })

  it('aller-retour : chaque jour bien formé est relu à l identique, dans l ordre', () => {
    // Oracle : format source → contrat de sortie, TVA 10 %.
    fc.assert(
      fc.property(joursArb({ maxLength: 40 }), (jours) => {
        const r = parseForecastAll(
          csv([
            'Hotel Code,X',
            EN_TETE,
            ...jours.map(ligneJour),
            'TOTALS,0,,0,0',
          ]),
        )
        expect(r).toHaveLength(jours.length)
        r.forEach((x, i) => {
          const j = jours[i]
          expect(x.date).toBe(`${j.year}-${p2(j.month)}-${p2(j.day)}`)
          expect(x.month).toBe(j.month)
          expect(x.year).toBe(j.year)
          expect(x.occ).toBe(j.occ)
          expect(x.revTTC).toBeCloseTo(j.centimes / 100, 9)
          expect(x.revHT * VAT_FACTOR).toBeCloseTo(x.revTTC, 6)
          expect(x.revHT).toBeLessThanOrEqual(x.revTTC)
        })
      }),
    )
  })

  it('le préambule et les fins de ligne ne changent rien', () => {
    // Oracle : deux formats d'export (planifié avec préambule, manuel sans),
    // LF ou CRLF : mêmes données.
    fc.assert(
      fc.property(
        joursArb({ minLength: 1, maxLength: 20 }),
        fc.array(
          fc.constantFrom('Hotel Code,Hotel Name', 'X,Y,14-10-2026', 'Report'),
          {
            maxLength: 3,
          },
        ),
        (jours, preambule) => {
          const corps = jours.map(ligneJour)
          const nu = parseForecastAll(csv([EN_TETE, ...corps]))
          expect(
            parseForecastAll(csv([...preambule, EN_TETE, ...corps], '\r\n')),
          ).toEqual(nu)
        },
      ),
    )
  })

  it('partition : la réunion des filtres par mois redonne tout le fichier', () => {
    // Oracle : parseForecast = filtre (mois, année) ; chaque jour appartient
    // à exactement un mois.
    fc.assert(
      fc.property(joursArb({ minLength: 1, maxLength: 30 }), (jours) => {
        const texte = csv([EN_TETE, ...jours.map(ligneJour)])
        const tout = parseForecastAll(texte)
        const mois = new Set(tout.map((r) => `${r.year}-${r.month}`))
        let total = 0
        for (const k of mois) {
          const [y, m] = k.split('-').map(Number)
          const part = parseForecast(texte, m, y)
          expect(part.every((r) => r.month === m && r.year === y)).toBe(true)
          total += part.length
        }
        expect(total).toBe(tout.length)
      }),
    )
  })

  it('monotonie : plus de REV TTC donne plus de REV HT', () => {
    // Oracle : HT = TTC / 1,10, fonction strictement croissante.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (a, d) => {
          const [x, y] = parseForecastAll(
            csv([
              EN_TETE,
              `01-01-2026,1,,1,${a / 100}`,
              `02-01-2026,1,,1,${(a + d) / 100}`,
            ]),
          )
          expect(y.revHT).toBeGreaterThan(x.revHT)
        },
      ),
    )
  })
})

describe('parseForecastAll — propriétés des doublons et du calendrier', () => {
  it('un jour répété n importe où dans le fichier le fait refuser', () => {
    // Oracle : upsert sur la date, deux lignes du même jour = fichier refusé.
    fc.assert(
      fc.property(
        joursArb({ minLength: 1, maxLength: 20 }),
        fc.nat(),
        fc.nat(),
        (jours, i, pos) => {
          const corps = jours.map(ligneJour)
          const doublon = corps[i % corps.length]
          corps.splice(pos % (corps.length + 1), 0, doublon)
          expect(() => parseForecastAll(csv([EN_TETE, ...corps]))).toThrow(
            ERR_DOUBLON,
          )
        },
      ),
    )
  })

  it('toute date rendue est une vraie date du calendrier', () => {
    // Oracle : contrat de sortie, date ISO valide (jour 1..31 tiré au hasard,
    // tous mois, années bissextiles ou non).
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1999, max: 2101 }),
        (d, m, y) => {
          const r = parseForecastAll(csv([EN_TETE, `${d}-${m}-${y},1,,1,1`]))
          const attendu = new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d
          expect(r).toHaveLength(attendu ? 1 : 0)
          for (const x of r) {
            expect(
              new Date(`${x.date}T00:00:00Z`).toISOString().slice(0, 10),
            ).toBe(x.date)
          }
        },
      ),
    )
  })
})

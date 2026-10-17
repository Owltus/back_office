import fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'

import {
  formatDateEn,
  formatDateFr,
  formatDateStr,
  formatTimeEn,
  formatTimeFr,
  getDateString,
  getTimeString,
  parseDateStr,
} from '#/lib/poster/dateFormatter.ts'

/*
 * Oracles :
 *   - noms de mois : `Intl.DateTimeFormat` (ICU), source INDÉPENDANTE du
 *     tableau écrit à la main dans le module ;
 *   - typographie française (Lexique de l'Imprimerie nationale) : jour sans
 *     zéro initial, mois en lettres et en MINUSCULES, « 1er » pour le premier
 *     jour du mois ;
 *   - anglais américain : « October 15, 2026 » (Intl `en-US`), horloge de
 *     12 h où minuit = 12 AM et midi = 12 PM ;
 *   - fuseau : une date de calendrier « AAAA-MM-JJ » ne dépend d'aucun
 *     fuseau ; `parseDateStr`/`formatDateStr` doivent faire l'aller-retour
 *     exact sous Europe/Paris (changements d'heure compris) ET sous des
 *     fuseaux où `new Date('AAAA-MM-JJ')` (lu en UTC) tombe la veille.
 */

const RUNS = 2000

const MOIS_FR = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, i, 15)),
  ),
)

// Dates de calendrier valides, années à 4 chiffres (ce que rend un input date).
const dateValide = fc
  .date({
    min: new Date(Date.UTC(1000, 0, 1)),
    max: new Date(Date.UTC(9999, 11, 31)),
    noInvalidDate: true,
  })
  .map((d) => ({
    a: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    j: d.getUTCDate(),
    iso: d.toISOString().slice(0, 10),
    utc: d,
  }))

const deux = (n: number) => String(n).padStart(2, '0')

describe('formatDateFr', () => {
  it('format « J mois AAAA » : jour sans zéro, mois Intl en minuscules, année intacte', () => {
    fc.assert(
      fc.property(dateValide, ({ a, m, j, iso }) => {
        fc.pre(j !== 1) // le 1er a sa propre règle, testée à part
        expect(formatDateFr(iso)).toBe(`${j} ${MOIS_FR[m - 1]} ${a}`)
      }),
      { numRuns: RUNS },
    )
  })

  it('les douze mois, accents compris (février, août, décembre)', () => {
    // Oracle : Intl fr-FR.
    for (let m = 1; m <= 12; m++) {
      expect(formatDateFr(`2026-${deux(m)}-15`)).toBe(
        `15 ${MOIS_FR[m - 1]} 2026`,
      )
    }
    expect(MOIS_FR).toContain('août')
    expect(MOIS_FR).toContain('février')
  })

  it('changement d’année : 31 décembre puis janvier de l’année suivante', () => {
    expect(formatDateFr('2026-12-31')).toBe(`31 ${MOIS_FR[11]} 2026`)
    expect(formatDateFr('2027-01-02')).toBe(`2 ${MOIS_FR[0]} 2027`)
  })

  it('année bissextile : 29 février 2028', () => {
    expect(formatDateFr('2028-02-29')).toBe('29 février 2028')
  })

  it('vide → vide ; texte non daté rendu tel quel', () => {
    expect(formatDateFr('')).toBe('')
    expect(formatDateFr('bientôt')).toBe('bientôt')
    expect(formatDateFr('15/10/2026')).toBe('15/10/2026')
  })

  /*
   * Ancien DÉFAUT (corrigé) : la typographie française écrit le premier jour
   * du mois « 1er » (Imprimerie nationale ; « le 1er janvier »). L'affiche
   * imprimait « Du 1 janvier 2027 ». Le « er » ne vaut QUE pour le 1 : pas
   * de « 11er », « 21er » ni « 31er ».
   */
  it('le premier du mois s’écrit « 1er » (« 1er janvier 2027 »)', () => {
    expect(formatDateFr('2027-01-01')).toBe('1er janvier 2027')
    fc.assert(
      fc.property(dateValide, ({ a, m, j, iso }) => {
        fc.pre(j === 1)
        expect(formatDateFr(iso)).toBe(`1er ${MOIS_FR[m - 1]} ${a}`)
      }),
      { numRuns: 200 },
    )
    for (const j of [10, 11, 21, 31]) {
      expect(formatDateFr(`2026-12-${deux(j)}`)).toBe(`${j} décembre 2026`)
    }
  })

  /*
   * Ancien DÉFAUT (corrigé) : un mois hors 01-12 (valeur venue d'un modèle en
   * base, pas d'un input natif) imprimait « undefined » sur l'affiche. Une
   * date impossible prend le chemin des textes non datés : rendue telle quelle.
   */
  it('mois hors 01-12 → texte d’origine, jamais « undefined »', () => {
    for (const v of ['2026-13-05', '2026-00-05', '2026-99-01']) {
      expect(formatDateFr(v)).toBe(v)
      expect(formatDateEn(v)).toBe(v)
    }
  })

  it('date impossible (30 février, 31 avril, 29 février non bissextile, jour 00) refusée', () => {
    // Oracle : calendrier grégorien.
    for (const v of [
      '2026-02-30',
      '2026-02-29',
      '1900-02-29',
      '2026-04-31',
      '2026-01-00',
      '2026-01-32',
    ]) {
      expect(formatDateFr(v)).toBe(v)
      expect(formatDateEn(v)).toBe(v)
    }
    // Bissextiles réelles toujours acceptées (dont 2000, divisible par 400).
    expect(formatDateFr('2000-02-29')).toBe('29 février 2000')
    expect(formatDateEn('2028-02-29')).toBe('February 29, 2028')
  })
})

describe('formatDateEn', () => {
  it('identique à Intl en-US « Month D, YYYY »', () => {
    const intl = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
    fc.assert(
      fc.property(dateValide, ({ iso, utc }) => {
        expect(formatDateEn(iso)).toBe(intl.format(utc))
      }),
      { numRuns: RUNS },
    )
  })

  it('vide → vide ; non daté rendu tel quel', () => {
    expect(formatDateEn('')).toBe('')
    expect(formatDateEn('soon')).toBe('soon')
  })
})

describe('formatTimeFr / formatTimeEn', () => {
  const heure = fc.record({
    h: fc.integer({ min: 0, max: 23 }),
    m: fc.integer({ min: 0, max: 59 }),
  })

  it('FR : « 9h05 » (heure sans zéro, minutes sur deux chiffres, h minuscule)', () => {
    fc.assert(
      fc.property(heure, ({ h, m }) => {
        expect(formatTimeFr(`${deux(h)}:${deux(m)}`)).toBe(`${h}h${deux(m)}`)
      }),
      { numRuns: RUNS },
    )
  })

  it('FR : une plage garde ses deux bornes dans l’ordre', () => {
    fc.assert(
      fc.property(heure, heure, (a, b) => {
        expect(
          formatTimeFr(`${deux(a.h)}:${deux(a.m)} - ${deux(b.h)}:${deux(b.m)}`),
        ).toBe(`${a.h}h${deux(a.m)} - ${b.h}h${deux(b.m)}`)
      }),
      { numRuns: RUNS },
    )
  })

  it('EN : horloge de 12 h identique à Intl en-US (minuit 12 AM, midi 12 PM)', () => {
    const intl = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    })
    // Intl sépare AM/PM par une espace insécable fine selon les versions d'ICU.
    const norm = (s: string) => s.replace(/[  ]/g, ' ')
    fc.assert(
      fc.property(heure, ({ h, m }) => {
        const attendu = norm(intl.format(new Date(Date.UTC(2026, 0, 1, h, m))))
        expect(formatTimeEn(`${deux(h)}:${deux(m)}`)).toBe(attendu)
      }),
      { numRuns: RUNS },
    )
  })

  it('EN : chaque borne d’une plage suit la même horloge que l’heure seule', () => {
    // Oracle : une plage « A - B » s'écrit « f(A) - f(B) ».
    fc.assert(
      fc.property(heure, heure, (a, b) => {
        const ha = `${deux(a.h)}:${deux(a.m)}`
        const hb = `${deux(b.h)}:${deux(b.m)}`
        expect(formatTimeEn(`${ha} - ${hb}`)).toBe(
          `${formatTimeEn(ha)} - ${formatTimeEn(hb)}`,
        )
      }),
      { numRuns: RUNS },
    )
  })

  it('EN : bornes explicites minuit / midi / 13 h', () => {
    expect(formatTimeEn('00:00')).toBe('12:00 AM')
    expect(formatTimeEn('12:00')).toBe('12:00 PM')
    expect(formatTimeEn('13:30')).toBe('1:30 PM')
    expect(formatTimeEn('09:00 - 17:00')).toBe('9:00 AM - 5:00 PM')
  })

  it('vide → vide ; texte libre rendu tel quel', () => {
    expect(formatTimeFr('')).toBe('')
    expect(formatTimeEn('')).toBe('')
    expect(formatTimeFr('midi')).toBe('midi')
    expect(formatTimeEn('noon')).toBe('noon')
  })
})

describe('getDateString / getTimeString', () => {
  it('début seul → pas de plage ; début + fin → plage ; rien → null', () => {
    expect(getDateString('2026-10-15', '')).toEqual({
      start: '2026-10-15',
      end: null,
      isRange: false,
    })
    expect(getDateString('2026-10-15', '2026-10-20')).toEqual({
      start: '2026-10-15',
      end: '2026-10-20',
      isRange: true,
    })
    // Oracle : une fin sans début n'a pas de sens sur l'affiche.
    expect(getDateString('', '2026-10-20')).toEqual({
      start: null,
      end: null,
      isRange: false,
    })
  })

  it('heures : plage jointe par « - », reconnue par formatTimeFr', () => {
    const t = getTimeString('09:00', '17:30')
    expect(t).toEqual({ full: '09:00 - 17:30', isRange: true })
    expect(formatTimeFr(t.full ?? '')).toBe('9h00 - 17h30')
    expect(getTimeString('09:00', '')).toEqual({
      full: '09:00',
      isRange: false,
    })
    expect(getTimeString('', '17:30')).toEqual({ full: null, isRange: false })
  })
})

describe('parseDateStr / formatDateStr — fuseaux', () => {
  const tzOrigine = process.env.TZ
  afterEach(() => {
    if (tzOrigine === undefined) delete process.env.TZ
    else process.env.TZ = tzOrigine
  })

  // Paris (heure d'été), New York (UTC−5 : `new Date('AAAA-MM-JJ')` y tombe
  // la veille), Kiritimati (UTC+14), São Paulo (changement d'heure historique
  // À MINUIT : le 2018-11-04 00:00 n'a pas existé).
  const FUSEAUX = [
    'Europe/Paris',
    'America/New_York',
    'Pacific/Kiritimati',
    'America/Sao_Paulo',
  ]

  it('le fuseau est bien pris en compte par le moteur (garde-fou du test lui-même)', () => {
    process.env.TZ = 'America/New_York'
    // Sans ce contrôle, un moteur qui ignore TZ rendrait le test vide.
    expect(new Date('2026-10-15').getDate()).toBe(14)
  })

  for (const tz of FUSEAUX) {
    it(`aller-retour exact sous ${tz}, sur 1900-2100`, () => {
      process.env.TZ = tz
      fc.assert(
        fc.property(
          // Kiritimati est passé de UTC−10 à UTC+14 en SAUTANT le 31/12/1994 :
          // ce jour n'existe pas en heure locale, aucun aller-retour possible.
          dateValide.filter(
            (d) =>
              d.a >= 1900 &&
              d.a <= 2100 &&
              !(tz === 'Pacific/Kiritimati' && d.iso === '1994-12-31'),
          ),
          ({ a, m, j, iso }) => {
            const d = parseDateStr(iso)
            expect(d).toBeDefined()
            // Oracle : la date LOCALE rendue est le jour de calendrier demandé.
            expect([d!.getFullYear(), d!.getMonth() + 1, d!.getDate()]).toEqual(
              [a, m, j],
            )
            expect(formatDateStr(d!)).toBe(iso)
          },
        ),
        { numRuns: 1000 },
      )
    })
  }

  it('Europe/Paris : jours du changement d’heure 2026 (29 mars, 25 octobre)', () => {
    process.env.TZ = 'Europe/Paris'
    for (const iso of [
      '2026-03-29',
      '2026-10-25',
      '2026-03-28',
      '2026-10-26',
    ]) {
      expect(formatDateStr(parseDateStr(iso)!)).toBe(iso)
    }
  })

  it('formatDateStr : zéros initiaux, et passage d’année par débordement de jour', () => {
    process.env.TZ = 'Europe/Paris'
    expect(formatDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
    // 32 décembre = 1er janvier de l'année suivante (arithmétique de Date).
    expect(formatDateStr(new Date(2026, 11, 32))).toBe('2027-01-01')
    // Oracle indépendant : format suédois = AAAA-MM-JJ local.
    fc.assert(
      fc.property(dateValide, ({ utc }) => {
        expect(formatDateStr(utc)).toBe(utc.toLocaleDateString('sv-SE'))
      }),
      { numRuns: 500 },
    )
  })

  it('formats refusés : vide, JJ/MM/AAAA, heure collée, espaces', () => {
    for (const v of [
      '',
      '15/10/2026',
      '2026-10-15T00:00',
      ' 2026-10-15',
      '2026-1-5',
      'abc',
    ]) {
      expect(parseDateStr(v)).toBeUndefined()
    }
  })

  /*
   * Ancien DÉFAUT (corrigé) : `new Date(2026, 1, 30)` déborde silencieusement
   * au 2 mars. Une valeur stockée impossible était affichée par le sélecteur
   * de date (`form/fields.tsx`) comme une AUTRE date réelle. Elle est
   * désormais refusée (`undefined` → « Choisir », comme un format inconnu).
   */
  it('« 2026-02-30 » et toute date impossible sont refusées', () => {
    for (const v of [
      '2026-02-30',
      '2026-02-29',
      '2026-13-05',
      '2026-04-31',
      '2026-01-00',
    ]) {
      expect(parseDateStr(v)).toBeUndefined()
    }
    expect(formatDateStr(parseDateStr('2028-02-29')!)).toBe('2028-02-29')
  })
})

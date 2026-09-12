import { describe, expect, it } from 'vitest'

import {
  breakfastCode,
  computePdjCA,
  isOffertBox,
  pdjRoomBreakdown,
  roomFinance,
} from '#/lib/pdj/breakdown.ts'

/*
 * Détail par chambre : dû (inclus) vs servi (réel), valorisés au TARIF DÉTECTÉ
 * (passé en argument, jamais dérivé par division). HT = tarif ÷ 1,10 par PDJ.
 */

const TARIFS = new Map([
  ['PDJ', 19],
  ['PDJBB', 10],
])

const ROWS = [
  { room: 105, addons: 'PDJ INCL', breakfasts_included: 2, breakfasts_served: 2, channel: 'Booking.com' },
  // no-show : 2 dûs, 1 seul servi.
  { room: 102, addons: 'PDJBB INCL', breakfasts_included: 2, breakfasts_served: 1, channel: 'Expedia' },
  // 1 inclus + 1 personne en plus servie.
  { room: 213, addons: 'PDJ INCL', breakfasts_included: 1, breakfasts_served: 2, channel: '' },
  // chambre sans PDJ au tarif, mais 2 servis = extras (valorisés PDJ).
  { room: 500, addons: 'TAXE', breakfasts_included: 0, breakfasts_served: 2, channel: null },
]

describe('breakfastCode', () => {
  it('GROUP puis PDJBB puis PDJ, sinon null', () => {
    expect(breakfastCode('PDJGROUP10 INCL')).toBe('PDJGROUP10')
    expect(breakfastCode('PDJBB INCL')).toBe('PDJBB')
    expect(breakfastCode('PDJ INCL')).toBe('PDJ')
    expect(breakfastCode('TAXE')).toBeNull()
  })
})

describe('pdjRoomBreakdown', () => {
  const addonDay = [
    { code: 'PDJ', revenue_ttc: 57 }, // 3 facturés = 3 dûs → cohérent
    { code: 'PDJBB', revenue_ttc: 20 }, // 2 facturés = 2 dûs → cohérent
  ]
  const bd = pdjRoomBreakdown(ROWS, TARIFS, addonDay)
  const room = (n: number) => bd.floors.flatMap((f) => f.rooms).find((r) => r.room === n)

  it('CA facturé par chambre : inclus (dû) + extras, au tarif détecté', () => {
    // htCa = inclus × tarif du code + extras × tarif PDJ (facturé, indépendant du servi).
    expect(room(105)).toMatchObject({ code: 'PDJ', included: 2, served: 2, htCa: 34.54 })
    expect(room(102)).toMatchObject({ code: 'PDJBB', included: 2, served: 1, htCa: 18.18 })
    expect(room(213)).toMatchObject({ code: 'PDJ', included: 1, served: 2, htCa: 34.54 }) // 17,27 inclus + 17,27 extra
    expect(room(500)).toMatchObject({ code: 'PDJ', included: 0, served: 2, htCa: 34.54 }) // walk-in : 2 extras
  })

  it('origine = OTA, Direct si vide/null', () => {
    expect(room(105)!.origin).toBe('Booking.com')
    expect(room(213)!.origin).toBe('Direct')
    expect(room(500)!.origin).toBe('Direct')
  })

  it('totaux dû / servi / extras / CA', () => {
    expect(bd.totalDuNb).toBe(5) // 2 + 2 + 1 + 0
    expect(bd.totalServiNb).toBe(7) // 2 + 1 + 2 + 2
    expect(bd.totalExtraNb).toBe(3) // 213 : 1 + 500 : 2
    expect(bd.totalCaHt).toBeCloseTo(121.8, 2) // = card CA PDJ
  })

  it('chambre occupée SANS PDJ = client potentiel (listée, htCa 0)', () => {
    const bd5 = pdjRoomBreakdown(
      [
        { room: 110, addons: 'PDJ INCL', breakfasts_included: 1, breakfasts_served: 0, channel: 'Direct' },
        { room: 111, addons: 'TAXE', breakfasts_included: 0, breakfasts_served: 0, channel: 'EXPEDIA' },
      ],
      TARIFS,
      [],
    )
    expect(bd5.sansPdj).toBe(1) // chambre 111
    const r111 = bd5.floors.flatMap((f) => f.rooms).find((r) => r.room === 111)
    expect(r111).toMatchObject({ code: null, included: 0, served: 0, htCa: 0 })
    // Chambre 110 : facturée (dû) même non cochée → htCa = 17,27.
    const r110 = bd5.floors.flatMap((f) => f.rooms).find((r) => r.room === 110)
    expect(r110!.htCa).toBeCloseTo(17.27, 2)
  })

  it('aligné → aucune alerte, aucun non-ventilé', () => {
    expect(bd.alerts).toEqual([])
    expect(bd.nonVentile).toEqual([])
  })

  it('facturé > en chambre (groupe posté en bloc) → ligne « non ventilé »', () => {
    const bd2 = pdjRoomBreakdown(ROWS, TARIFS, [{ code: 'PDJ', revenue_ttc: 190 }])
    // 190 / 19 = 10 facturés vs 3 en chambre → 7 non ventilés (pas une alerte).
    expect(bd2.nonVentile).toEqual([{ code: 'PDJ', nb: 7, ht: 120.91 }]) // round2(7 × 19 ÷ 1,1)
    expect(bd2.alerts).toEqual([])
    // Total facturé = dû chambres + non ventilé.
    expect(bd2.totalHtFacture).toBeCloseTo(bd2.totalHtDu + 120.91, 2)
  })

  it('en chambre > facturé (chambres sans facturation) → alerte', () => {
    const bd4 = pdjRoomBreakdown(
      [{ room: 101, addons: 'PDJ INCL', breakfasts_included: 5, breakfasts_served: 5, channel: null }],
      TARIFS,
      [{ code: 'PDJ', revenue_ttc: 19 }], // 1 facturé, 5 en chambre → écart 4
    )
    expect(bd4.alerts.some((a) => a.includes('sans facturation'))).toBe(true)
  })

  it('tarif manquant pour un code présent → alerte', () => {
    const bd3 = pdjRoomBreakdown(ROWS, new Map([['PDJBB', 10]]), [])
    expect(bd3.alerts.some((a) => a.includes('PDJ') && a.includes('non détecté'))).toBe(true)
  })
})

describe('roomFinance', () => {
  it('origine (OTA), code affiché et prix HT facturé (dû + extras)', () => {
    // 1 inclus + 1 extra au tarif PDJ → (17,27 + 17,27) = 34,54.
    expect(roomFinance(ROWS[2], TARIFS)).toEqual({ origin: 'Direct', code: 'PDJ', htCa: 34.54 })
    // PDJBB, 2 dûs facturés même si 1 seul servi → 2 × 9,09 = 18,18.
    expect(roomFinance(ROWS[1], TARIFS)).toEqual({ origin: 'Expedia', code: 'PDJBB', htCa: 18.18 })
    // Chambre sans PDJ mais 2 servis (walk-in) → code PDJ, 34,54.
    expect(roomFinance(ROWS[3], TARIFS)).toEqual({ origin: 'Direct', code: 'PDJ', htCa: 34.54 })
  })

  it('chambre occupée sans PDJ ni extra → code null, prix 0', () => {
    expect(
      roomFinance(
        { addons: 'TAXE', breakfasts_included: 0, breakfasts_served: 0, channel: 'EXPEDIA' },
        TARIFS,
      ),
    ).toEqual({ origin: 'EXPEDIA', code: null, htCa: 0 })
  })

  it('extra OFFERT (chambre sans PDJ) : servi mais 0€', () => {
    // 2 servis, walk-in, dont 1 offert (breakfasts_offert) → 1 seul facturé.
    expect(
      roomFinance(
        {
          addons: 'TAXE',
          breakfasts_included: 0,
          breakfasts_served: 2,
          breakfasts_offert: 1,
          channel: 'Direct',
        },
        TARIFS,
      ),
    ).toEqual({ origin: 'Direct', code: 'PDJ', htCa: 17.27 })
  })

  it('ligne manuelle « offert » : toute la ligne gratuite', () => {
    expect(
      roomFinance(
        {
          addons: null,
          breakfasts_included: 0,
          breakfasts_served: 2,
          manual_kind: 'offert',
          channel: null,
        },
        TARIFS,
      ),
    ).toEqual({ origin: 'Direct', code: 'PDJ', htCa: 0 })
  })
})

describe('computePdjCA', () => {
  it('CA = inclus + extra par chambre (groupe roomé compris, batch exclu)', () => {
    const ca = computePdjCA(ROWS, TARIFS)
    expect(ca.inclusNb).toBe(5) // 2 (105) + 2 (102) + 1 (213)
    expect(ca.extraNb).toBe(3) // 213: 1 + 500: 2
    expect(ca.includedHt).toBeCloseTo(69.99, 2) // 34,54 + 18,18 + 17,27
    expect(ca.extrasHt).toBeCloseTo(51.81, 2) // 3 × 17,27
    expect(ca.totalHt).toBeCloseTo(121.8, 2)
  })

  it('les externes s’ajoutent aux extras, au tarif PDJ standard', () => {
    const ca = computePdjCA(ROWS, TARIFS, 2)
    expect(ca.extraNb).toBe(5) // 3 (chambres) + 2 (externes)
    expect(ca.extrasHt).toBeCloseTo(86.35, 2) // 5 × 17,27
    expect(ca.totalHt).toBeCloseTo(156.34, 2)
  })

  it('un extra OFFERT reste compté (extraNb) mais sort du CA', () => {
    const rows = [
      // 500 : 2 extras dont 1 offert → extraNb inchangé (3), extrasHt réduit.
      { ...ROWS[3], breakfasts_offert: 1 },
      ROWS[2],
    ]
    const ca = computePdjCA(rows, TARIFS)
    expect(ca.extraNb).toBe(3) // 213: 1 + 500: 2 (inchangé, offert compris)
    expect(ca.extrasHt).toBeCloseTo(34.54, 2) // (3 − 1) × 17,27
  })

  it('une ligne manuelle « offert » sort entièrement du CA extra', () => {
    const rows = [
      { addons: null, breakfasts_included: 0, breakfasts_served: 2, manual_kind: 'offert' },
    ]
    const ca = computePdjCA(rows, TARIFS)
    expect(ca.extraNb).toBe(2)
    expect(ca.extrasHt).toBe(0)
    expect(ca.totalHt).toBe(0)
  })
})

/*
 * Cases violettes (écran + PDF) vs tuile « Gratuités » (footer du PDF, CA,
 * analytique) : les DEUX doivent toujours dire le même nombre.
 *
 * Le bug d'origine : le rendu prenait `breakfasts_offert` pour un curseur de
 * POSITION de case, le comptage pour un NOMBRE D'EXTRAS. Les deux ne coïncident
 * que si `breakfasts_included` vaut 0 — or cette colonne est RECALCULÉE à chaque
 * écriture d'une ligne d'import (trigger `pdj_breakfasts_clamp_included`, ou
 * réimport du jour), donc elle peut monter APRÈS la pose de la gratuité.
 */
/*
 * Nuits STAFF et couverts ENFANT — deux cas réels du 2026-09-12.
 *
 * STAFF : un membre du personnel logé occupe une chambre dont le plan tarifaire
 * porte « STAFF ». Aucune de ces lignes ne porte d'addon PDJ (vérifié sur les 37
 * nuits de l'historique), donc rien n'est dû — mais la case est cochée quand la
 * personne descend manger. Règle posée par l'utilisateur : 0 €, cochée ou non.
 *
 * ENFANT : rien de spécial à faire, et c'est le point à ne pas casser. Le plan
 * tarifaire dit combien de couverts sont inclus (« PDJ INCLUS 2 PAX »), le
 * trigger `pdj_breakfasts_clamp_included` le borne au nombre réel d'occupants,
 * et un enfant occupe une de ces places au MÊME prix qu'un adulte (vérifié :
 * sur 40 journées comportant un enfant, 31 s'expliquent exactement au tarif
 * plein, les autres portant par ailleurs un geste commercial).
 */
describe('nuit STAFF', () => {
  const staff = (served: number, rate_plan = 'GRATUITE - STAFF') => ({
    addons: null,
    rate_plan,
    breakfasts_included: 0,
    breakfasts_served: served,
  })

  it('ne facture rien, la case fût-elle cochée', () => {
    // Chambre 503 du 2026-09-12 : « TARIF STAFF – 1 PDJ », deux cases cochées.
    // Sans la règle, elles valaient 2 × 17,27 = 34,54 € HT d'extras.
    const ca = computePdjCA([staff(2, 'TARIF STAFF – 1 PDJ')], TARIFS)
    expect(ca.extrasHt).toBe(0)
    expect(ca.totalHt).toBe(0)
    // Les couverts restent COMPTÉS : le staff a bien mangé.
    expect(ca.extraNb).toBe(2)
    expect(ca.offertNb).toBe(2)
  })

  it('couvre les trois libellés du PMS', () => {
    for (const plan of [
      'GRATUITE - STAFF',
      'TARIF STAFF – 1 PDJ',
      'TARIF STAFF – CH SEULE',
    ]) {
      expect(computePdjCA([staff(1, plan)], TARIFS).totalHt, plan).toBe(0)
    }
  })

  it('reste à 0 € même si un import lui attachait un PDJ inclus par erreur', () => {
    const ca = computePdjCA(
      [{ ...staff(2), addons: 'PDJ INCL', breakfasts_included: 2 }],
      TARIFS,
    )
    expect(ca.inclusNb).toBe(0)
    expect(ca.totalHt).toBe(0)
  })

  it('la ligne du détail financier affiche 0,00 €', () => {
    expect(roomFinance(staff(2, 'TARIF STAFF – 1 PDJ'), TARIFS).htCa).toBe(0)
  })

  it('n affecte pas une chambre ordinaire', () => {
    const ca = computePdjCA(
      [{ addons: 'PDJ INCL', rate_plan: 'BOOKING - NR - PDJ INCLUS 2 PAX', breakfasts_included: 2, breakfasts_served: 2 }],
      TARIFS,
    )
    expect(ca.inclusNb).toBe(2)
    expect(ca.includedHt).toBeCloseTo(34.54, 2)
  })
})

describe('couvert ENFANT', () => {
  it('vaut le tarif plein, comme un adulte', () => {
    // Chambre 210 du 2026-09-12 : 1 adulte + 1 enfant, plan « PDJ INCLUS 2 PAX »
    // → 2 inclus, facturés 19 € pièce comme les autres chambres du jour.
    const ca = computePdjCA(
      [{ addons: 'PDJ INCL', rate_plan: 'BOOKING - NR - PDJ INCLUS 2 PAX', breakfasts_included: 2, breakfasts_served: 2 }],
      TARIFS,
    )
    expect(ca.inclusNb).toBe(2)
    expect(ca.rebuiltHt).toBeCloseTo(34.54, 2)
  })

  it('le total reste la recette facturée, geste commercial compris', () => {
    // Ce matin-là, l'enfant de la 210 a été facturé 11 € au lieu de 19 : la
    // journée a rapporté 296 € et non 304. C'est la recette qui fait foi.
    const rows = [
      ...Array.from({ length: 7 }, () => ({
        addons: 'PDJ INCL',
        breakfasts_included: 2,
        breakfasts_served: 2,
      })),
      { addons: 'PDJ 38.00', breakfasts_included: 2, breakfasts_served: 2 },
    ]
    const ca = computePdjCA(rows, TARIFS, 0, 296)
    expect(ca.inclusNb).toBe(16)
    expect(ca.includedHt).toBe(269.09) // 296 / 1,10
    expect(ca.rebuiltHt).toBeCloseTo(276.32, 2) // 16 × 17,27 au prix de la carte
  })
})

describe('isOffertBox ↔ offertNb (cases violettes = tuile « Gratuités »)', () => {
  /** Nombre de cases rendues en violet pour une ligne (miroir du board). */
  const violettes = (row: {
    breakfasts_included: number
    breakfasts_served: number
    breakfasts_offert?: number
    manual_kind?: string | null
    rate_plan?: string | null
  }): number => {
    const boxes = Math.max(2, row.breakfasts_included, row.breakfasts_served)
    let n = 0
    for (let i = 0; i < boxes; i++) if (isOffertBox(row, i)) n++
    return n
  }

  it('le nombre de cases violettes vaut TOUJOURS la gratuité comptée', () => {
    for (const rate_plan of [null, 'GRATUITE - STAFF']) {
      for (let included = 0; included <= 3; included++) {
        for (let served = 0; served <= 4; served++) {
          for (let offert = 0; offert <= 4; offert++) {
            const row = {
              addons: 'PDJ INCL',
              breakfasts_included: included,
              breakfasts_served: served,
              breakfasts_offert: offert,
              rate_plan,
            }
            expect(
              violettes(row),
              `plan=${rate_plan} included=${included} served=${served} offert=${offert}`,
            ).toBe(computePdjCA([row], TARIFS).offertNb)
          }
        }
      }
    }
  })

  it('le cas de la régression : 1 inclus, 2 servis, 1 offert → 1 case violette', () => {
    // Une gratuité posée sur une chambre SANS PDJ inclus, puis `included` remonté
    // à 1 par un réimport : la case ne doit pas perdre son violet pendant que la
    // tuile continue de compter 1.
    const row = { addons: 'PDJ INCL', breakfasts_included: 1, breakfasts_served: 2, breakfasts_offert: 1 }
    expect(violettes(row)).toBe(1)
    expect(computePdjCA([row], TARIFS).offertNb).toBe(1)
    // La 1re case reste le PDJ inclus (vert), la 2e est la gratuité.
    expect(isOffertBox(row, 0)).toBe(false)
    expect(isOffertBox(row, 1)).toBe(true)
  })

  it('une ligne manuelle est offerte en BLOC, `breakfasts_offert` ignoré', () => {
    const row = { addons: null, breakfasts_included: 0, breakfasts_served: 2, breakfasts_offert: 0, manual_kind: 'offert' }
    expect(violettes(row)).toBe(2)
    expect(computePdjCA([row], TARIFS).offertNb).toBe(2)
    // Basculée en 'extra', un `breakfasts_offert` résiduel ne doit RIEN colorer
    // (et `setManualServe` le remet à 0, cf. service.ts).
    expect(violettes({ ...row, manual_kind: 'extra', breakfasts_offert: 2 })).toBe(0)
  })

  it('aucune case violette hors du servi ni sur une chambre vide', () => {
    expect(violettes({ breakfasts_included: 0, breakfasts_served: 0, breakfasts_offert: 2 })).toBe(0)
    expect(isOffertBox(null, 0)).toBe(false)
    expect(isOffertBox(undefined, 1)).toBe(false)
  })
})

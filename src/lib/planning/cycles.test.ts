import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  cycleDe,
  plageDuJour,
  QUART_D_HEURE,
  trousDuJour,
} from '#/lib/planning/cycles.ts'
import type { PlageMinutes, PresencePoste } from '#/lib/planning/cycles.ts'
import { periodeLibre } from '#/lib/planning/presence.ts'
import { bornes } from '#/lib/planning/temps.ts'
import type { Periode } from '#/lib/planning/types.ts'

/*
 * Cycle d'un shift (plan planning-cycles-2026-10-30). Oracle : la famille du
 * code quand elle existe, sinon `periodeLibre` de l'heure de début.
 */

const FAMILLES: Periode[] = ['matin', 'middle', 'soir', 'nuit', 'court']

const heure = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(
    ([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  )

describe('cycleDe', () => {
  it('la famille du code passe avant l’heure de début', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FAMILLES), heure, (famille, debut) => {
        expect(cycleDe({ periode: famille }, debut)).toBe(famille)
      }),
    )
  })

  it('sans code, le cycle est celui de l’heure de début', () => {
    fc.assert(
      fc.property(heure, (debut) => {
        expect(cycleDe(undefined, debut)).toBe(periodeLibre(debut))
      }),
    )
  })

  it('un code sans famille se range par son heure de début', () => {
    fc.assert(
      fc.property(heure, (debut) => {
        expect(cycleDe({ periode: null }, debut)).toBe(periodeLibre(debut))
      }),
    )
  })

  it('exemples : un middle reste un middle, un horaire libre de 23 h est une nuit', () => {
    expect(cycleDe({ periode: 'middle' }, '07:00')).toBe('middle')
    expect(cycleDe(undefined, '23:00')).toBe('nuit')
    expect(cycleDe(undefined, '06:30')).toBe('matin')
    expect(cycleDe(undefined, '14:00')).toBe('soir')
  })
})

// ------------------------------------------------------------ trousDuJour

/*
 * Oracle des trous (contrat de la vague 1 §3) : exemples écrits à la main
 * (heures lues sur un planning), puis propriétés. Les heures des exemples
 * sont en minutes RÉELLES ; les cas de changement d'heure passent par
 * `bornes` (temps.ts) et sont recalculés à la main dans le commentaire.
 */

const H = 60
const J = 24 * H

const besoin = (debut: number, fin: number): PlageMinutes => ({ debut, fin })
const present = (
  debut: number,
  fin: number,
  autonome = true,
): PresencePoste => ({ debut, fin, autonome })

describe('trousDuJour : exemples', () => {
  it('deux équipes qui se touchent : aucun trou', () => {
    expect(
      trousDuJour(
        [besoin(7 * H, 15 * H), besoin(15 * H, 23 * H)],
        [present(7 * H, 15 * H), present(15 * H, 23 * H)],
      ),
    ).toEqual([])
  })

  it('une heure sans personne entre le matin et le soir : trou de 15 h à 16 h', () => {
    expect(
      trousDuJour(
        [besoin(7 * H, 15 * H), besoin(16 * H, 23 * H)],
        [present(7 * H, 15 * H), present(16 * H, 23 * H)],
      ),
    ).toEqual([{ debut: 15 * H, fin: 16 * H }])
  })

  it('le middle bouche le trou (D11 : il est quand même là)', () => {
    expect(
      trousDuJour(
        [besoin(7 * H, 15 * H), besoin(16 * H, 23 * H)],
        [
          present(7 * H, 15 * H),
          present(12 * H, 20 * H),
          present(16 * H, 23 * H),
        ],
      ),
    ).toEqual([])
  })

  it('un soutien ne bouche pas le trou', () => {
    expect(
      trousDuJour(
        [besoin(7 * H, 15 * H), besoin(16 * H, 23 * H)],
        [
          present(7 * H, 15 * H),
          present(14 * H, 17 * H, false),
          present(16 * H, 23 * H),
        ],
      ),
    ).toEqual([{ debut: 15 * H, fin: 16 * H }])
  })

  it('rien avant le premier besoin ni après le dernier', () => {
    expect(
      trousDuJour([besoin(7 * H, 15 * H)], [present(7 * H, 15 * H)]),
    ).toEqual([])
    expect(trousDuJour([], [present(7 * H, 15 * H)])).toEqual([])
  })

  it('personne du tout : toute la plage est un seul trou', () => {
    expect(
      trousDuJour([besoin(7 * H, 15 * H), besoin(15 * H, 23 * H)], []),
    ).toEqual([{ debut: 7 * H, fin: 23 * H }])
  })

  it('la fin de la plage est la fin la plus tardive des besoins', () => {
    expect(
      trousDuJour(
        [besoin(7 * H, 20 * H), besoin(10 * H, 14 * H)],
        [present(7 * H, 18 * H)],
      ),
    ).toEqual([{ debut: 18 * H, fin: 20 * H }])
  })

  it('un départ à 15 h 10 laisse le quart d’heure de 15 h sans personne en entier', () => {
    expect(
      trousDuJour(
        [besoin(7 * H, 23 * H)],
        [present(7 * H, 15 * H + 10), present(15 * H + 15, 23 * H)],
      ),
    ).toEqual([{ debut: 15 * H, fin: 15 * H + 15 }])
  })

  it('une plage hors quart d’heure est coupée à ses bords', () => {
    expect(
      trousDuJour(
        [besoin(7 * H + 10, 8 * H + 5)],
        [present(7 * H + 40, 9 * H)],
      ),
    ).toEqual([{ debut: 7 * H + 10, fin: 7 * H + 45 }])
  })

  it('un shift court (fin avancée) ouvre un trou', () => {
    expect(
      trousDuJour(
        [besoin(7 * H, 15 * H), besoin(15 * H, 23 * H)],
        [present(7 * H, 14 * H), present(15 * H, 23 * H)],
      ),
    ).toEqual([{ debut: 14 * H, fin: 15 * H }])
  })

  it('une nuit de la veille couvre le petit matin', () => {
    // Mardi : besoin 06:00 → 14:00 ; la nuit du lundi va jusqu'à 07:00.
    expect(
      trousDuJour(
        [besoin(J + 6 * H, J + 14 * H)],
        [present(22 * H, J + 7 * H), present(J + 7 * H, J + 14 * H)],
      ),
    ).toEqual([])
  })

  it('nuit du dimanche vers le lundi : la plage déborde sur le lundi', () => {
    // Dimanche (jour 6) : soir 15:00 → 23:00, nuit 23:00 → lundi 07:00.
    const besoins = [
      besoin(6 * J + 15 * H, 6 * J + 23 * H),
      besoin(6 * J + 23 * H, 7 * J + 7 * H),
    ]
    const soir = present(6 * J + 15 * H, 6 * J + 23 * H)
    expect(trousDuJour(besoins, [soir])).toEqual([
      { debut: 6 * J + 23 * H, fin: 7 * J + 7 * H },
    ])
    expect(
      trousDuJour(besoins, [soir, present(6 * J + 23 * H, 7 * J + 7 * H)]),
    ).toEqual([])
  })

  it('passage à l’heure d’hiver : nuit de 9 h réelles, trou mesuré en temps réel', () => {
    // Semaine du lundi 2026-10-19, changement le dimanche 25 (jour 6).
    // Besoin du samedi (jour 5) 23:00 → 07:00 : 9 h réelles.
    const lundi = '2026-10-19'
    const [d, f] = bornes(lundi, 5, '23:00', '07:00')
    expect(f - d).toBe(9 * H)
    // 23:00 → 02:00 (première fois, heure d'été) puis 03:00 → 07:00 :
    // de 02:00 CEST à 03:00 CET, 2 h réelles sans personne.
    const [a1, a2] = bornes(lundi, 5, '23:00', '02:00')
    expect(a2 - a1).toBe(3 * H)
    const [b1, b2] = bornes(lundi, 6, '03:00', '07:00')
    expect(
      trousDuJour([besoin(d, f)], [present(a1, a2), present(b1, b2)]),
    ).toEqual([{ debut: a2, fin: a2 + 2 * H }])
    // 23:00 → 03:00 puis 03:00 → 07:00 : les deux se touchent.
    const [c1, c2] = bornes(lundi, 5, '23:00', '03:00')
    expect(
      trousDuJour([besoin(d, f)], [present(c1, c2), present(b1, b2)]),
    ).toEqual([])
  })

  it('passage à l’heure d’été : nuit de 7 h réelles, pas de faux trou', () => {
    // Semaine du lundi 2026-03-23, changement le dimanche 29 (jour 6).
    const lundi = '2026-03-23'
    const [d, f] = bornes(lundi, 5, '23:00', '07:00')
    expect(f - d).toBe(7 * H)
    // 02:00 n'existe pas : lu 03:00 heure d'été (fold=0). 23:00 → 02:00 et
    // 03:00 → 07:00 se touchent donc en temps réel.
    const [a1, a2] = bornes(lundi, 5, '23:00', '02:00')
    const [b1, b2] = bornes(lundi, 6, '03:00', '07:00')
    expect(b1).toBe(a2)
    expect(
      trousDuJour([besoin(d, f)], [present(a1, a2), present(b1, b2)]),
    ).toEqual([])
    // Départ à 01:00 : de 01:00 à 03:00 heure d'été, une heure réelle.
    const [, e2] = bornes(lundi, 5, '23:00', '01:00')
    expect(
      trousDuJour([besoin(d, f)], [present(a1, e2), present(b1, b2)]),
    ).toEqual([{ debut: e2, fin: e2 + H }])
  })
})

// ------------------------------------------- trousDuJour : propriétés

const minuteArb = fc.integer({ min: 0, max: (2 * J) / 5 }).map((x) => x * 5)
const plageArb = fc
  .tuple(minuteArb, fc.integer({ min: 1, max: 16 * 12 }))
  .map(([debut, n]) => ({ debut, fin: debut + n * 5 }))
const presenceArb = fc
  .tuple(plageArb, fc.boolean())
  .map(([x, autonome]) => ({ ...x, autonome }))
const casArb = fc.record({
  besoins: fc.array(plageArb, { minLength: 1, maxLength: 5 }),
  presences: fc.array(presenceArb, { maxLength: 8 }),
})

/** Minutes couvertes par une liste de plages. */
function minutesDe(plages: ReadonlyArray<PlageMinutes>): Set<number> {
  const r = new Set<number>()
  for (const x of plages) for (let m = x.debut; m < x.fin; m++) r.add(m)
  return r
}

describe('trousDuJour : propriétés', () => {
  it('une personne autonome de plus ne crée jamais de trou', () => {
    fc.assert(
      fc.property(casArb, plageArb, ({ besoins, presences }, ajout) => {
        const avant = minutesDe(trousDuJour(besoins, presences))
        const apres = trousDuJour(besoins, [
          ...presences,
          { ...ajout, autonome: true },
        ])
        for (const m of minutesDe(apres)) expect(avant.has(m)).toBe(true)
      }),
    )
  })

  it('un soutien ne bouche jamais un trou (et n’en crée pas)', () => {
    fc.assert(
      fc.property(casArb, plageArb, ({ besoins, presences }, ajout) => {
        expect(
          trousDuJour(besoins, [...presences, { ...ajout, autonome: false }]),
        ).toEqual(trousDuJour(besoins, presences))
      }),
    )
  })

  it('un trou est toujours dans la plage, trié, sans recouvrement ni contact', () => {
    fc.assert(
      fc.property(casArb, ({ besoins, presences }) => {
        const p = plageDuJour(besoins)!
        const t = trousDuJour(besoins, presences)
        t.forEach((x, i) => {
          expect(x.debut).toBeGreaterThanOrEqual(p.debut)
          expect(x.fin).toBeLessThanOrEqual(p.fin)
          expect(x.fin).toBeGreaterThan(x.debut)
          if (i > 0) expect(x.debut).toBeGreaterThan(t[i - 1].fin)
          for (const b of [x.debut, x.fin]) {
            expect(
              b % QUART_D_HEURE === 0 || b === p.debut || b === p.fin,
            ).toBe(true)
          }
        })
      }),
    )
  })

  it('l’ordre des besoins et des présences ne change rien', () => {
    fc.assert(
      fc.property(casArb, fc.nat(), ({ besoins, presences }, graine) => {
        const melange = <T>(xs: T[]): T[] =>
          xs
            .map((x, i) => [x, (i * 7919 + graine) % 101] as const)
            .sort((a, b) => a[1] - b[1])
            .map(([x]) => x)
        expect(trousDuJour(melange(besoins), melange(presences))).toEqual(
          trousDuJour(besoins, presences),
        )
        expect(
          trousDuJour([...besoins].reverse(), [...presences].reverse()),
        ).toEqual(trousDuJour(besoins, presences))
      }),
    )
  })

  it('hors des trous, chaque minute de la plage a une personne autonome', () => {
    fc.assert(
      fc.property(casArb, ({ besoins, presences }) => {
        const p = plageDuJour(besoins)!
        const t = minutesDe(trousDuJour(besoins, presences))
        const couvertes = minutesDe(presences.filter((x) => x.autonome))
        for (let m = p.debut; m < p.fin; m++) {
          if (!t.has(m)) expect(couvertes.has(m)).toBe(true)
        }
      }),
    )
  })

  it('les minutes d’un quart d’heure tenu en entier ne sont jamais un trou', () => {
    fc.assert(
      fc.property(casArb, ({ besoins, presences }) => {
        const p = plageDuJour(besoins)!
        const t = minutesDe(trousDuJour(besoins, presences))
        const autonomes = presences.filter((x) => x.autonome)
        for (let m = p.debut; m < p.fin; m++) {
          const q = Math.floor(m / QUART_D_HEURE) * QUART_D_HEURE
          const lo = Math.max(q, p.debut)
          const hi = Math.min(q + QUART_D_HEURE, p.fin)
          const tenu = autonomes.some((x) => x.debut <= lo && x.fin >= hi)
          expect(t.has(m)).toBe(!tenu)
        }
      }),
    )
  })
})

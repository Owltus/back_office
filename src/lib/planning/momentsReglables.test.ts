/*
 * Les moments de l'établissement (2026-11-06, lot 2, A6) : une liste en
 * base, plus quatre moments écrits dans le code. Les défauts redonnent
 * EXACTEMENT les moments d'avant ; un moment créé compte comme les autres.
 */

import { describe, expect, it } from 'vitest'

import { plageAccueil } from '#/lib/planning/cycles.ts'
import {
  lireMoments,
  MOMENTS_HOTEL,
  momentDuDebut,
  momentPropose,
  momentsDeJour,
  momentsDuTableau,
  pairesDeJour,
  tailleTableau,
} from '#/lib/planning/moment.ts'
import {
  bilanPresence,
  momentsAccueil,
  periodePresence,
  periodeShift,
} from '#/lib/planning/presence.ts'
import { idPlaceAccueil } from '#/lib/planning/semaine.ts'
import { hhmm, minutes } from '#/lib/planning/temps.ts'
import { lusAvec, momentsAvec } from '#/lib/planning/test/momentsTest.ts'
import type { Moment } from '#/lib/planning/types.ts'

const H = 60

function ancienLibre(debut: string): string {
  const m = minutes(debut)
  if (m >= 21 * H || m < 5 * H) return 'nuit'
  return m < 12 * H + 30 ? 'matin' : 'soir'
}

/** Les 37 horaires de la base locale (heures et moment rangé, 2026-11-06). */
const HORAIRES_BASE =
  `00:00,07:00,0,nuit 07:00,10:00,0,matin 07:00,11:45,45,matin
07:00,12:45,45,matin 07:00,14:45,45,matin 07:00,15:45,45,matin 07:00,16:45,45,matin
07:00,17:45,45,matin 07:30,15:15,45,matin 07:30,16:15,45,matin 08:00,13:45,45,matin
08:00,15:45,45,matin 08:00,16:45,45,matin 08:00,18:00,45,middle 09:00,16:45,45,middle
09:00,17:45,45,middle 09:30,18:15,45,middle 10:00,18:45,45,middle 11:00,19:45,45,middle
12:00,19:45,45,middle 12:00,20:45,45,middle 12:00,22:45,45,soir 13:00,20:45,45,middle
13:00,21:45,45,soir 13:00,22:45,45,soir 14:00,21:45,45,soir 14:00,22:45,45,soir
14:15,22:00,45,soir 14:30,22:15,45,soir 14:30,23:15,45,soir 14:45,23:30,45,soir
15:00,22:45,45,soir 15:15,00:00,45,soir 16:15,00:00,45,soir 17:00,22:00,45,soir
19:00,22:00,0,soir 23:00,07:00,0,nuit`
    .split(/\s+/)
    .map((l) => l.split(','))

describe('les moments de l’hôtel : exactement ceux d’avant', () => {
  it('les 37 horaires de la base : la règle en dur ne change que 08:00-18:00', () => {
    // Oracle : décision utilisateur du 2026-11-11 (`momentFixe`) ; le seul
    // horaire qui change, celui de la Direction, passe du middle au matin.
    const changes = HORAIRES_BASE.filter(
      ([debut, fin, pause, moment]) =>
        momentPropose({ debut, fin, pause: Number(pause) }) !== moment,
    ).map(([debut, fin]) => `${debut}-${fin}`)
    expect(changes).toEqual(['08:00-18:00'])
  })

  it('un horaire libre sans fin : le même moment', () => {
    for (let d = 0; d < 1440; d += 5)
      expect(momentDuDebut(hhmm(d))).toBe(ancienLibre(hhmm(d)))
  })

  it('le tableau : matin, soir, nuit ; le middle hors du tableau', () => {
    expect(momentsDuTableau(MOMENTS_HOTEL)).toEqual(['matin', 'soir', 'nuit'])
    expect(momentsDeJour(MOMENTS_HOTEL)).toEqual(['matin', 'soir'])
    expect(pairesDeJour(MOMENTS_HOTEL)).toEqual([['matin', 'soir']])
    // Les places de l'accueil gardent leur identifiant (jour × 3 + rang).
    expect(idPlaceAccueil(1, 'matin')).toBe(-(1 + 3))
    expect(idPlaceAccueil(2, 'nuit')).toBe(-(1 + 6 + 2))
  })
})

describe('un moment « Midi » créé par l’établissement', () => {
  const midi: Moment = {
    id: 'midi',
    nom: 'Midi',
    ordre: 2,
    priorite: 0,
    debut_de: 10 * H,
    debut_a: 13 * H,
    fin_de: null,
    fin_a: 17 * H,
    toutes: true,
    libre_avant: 14 * H,
    compte_dans_tableau: true,
    est_nuit: false,
    couleur: null,
  }
  const l = lusAvec({ middle: { ordre: 2.5 } }, [midi])
  const poste = { zone_id: 1, ferme: false }

  it('reçoit ses horaires, le reste ne bouge pas', () => {
    expect(momentPropose({ debut: '11:00', fin: '16:00', pause: 0 }, l)).toBe(
      'midi',
    )
    expect(momentPropose({ debut: '11:00', fin: '19:45', pause: 0 }, l)).toBe(
      'middle',
    )
    expect(momentPropose({ debut: '07:00', fin: '15:45', pause: 0 }, l)).toBe(
      'matin',
    )
    // Libre sans fin : midi entre 12 h 30 et 14 h.
    expect(momentDuDebut('13:00', l)).toBe('midi')
    expect(momentDuDebut('15:00', l)).toBe('soir')
  })

  it('a son chiffre au tableau, entre le matin et le soir', () => {
    expect(momentsDuTableau(l)).toEqual(['matin', 'midi', 'soir', 'nuit'])
    expect(tailleTableau(l)).toBe(4)
    expect(pairesDeJour(l)).toEqual([
      ['matin', 'midi'],
      ['midi', 'soir'],
    ])
    expect(
      momentsAccueil(poste, { periode: 'midi' }, '11:00', true, '16:00', l),
    ).toEqual(['midi'])
    expect(periodePresence(poste, { periode: 'midi' }, '11:00', false, l)).toBe(
      'midi',
    )
    expect(periodeShift({ periode: 'midi' }, '11:00', l)).toBe('midi')
    const bilan = bilanPresence(
      [
        { id: 1, jour: 0, periode: 'soir', minimum: 1, maximum: 1 },
        { id: 2, jour: 0, periode: 'midi', minimum: 2, maximum: 2 },
      ],
      [
        { jour: 0, periode: 'midi' },
        { jour: 0, periode: 'soir' },
      ],
      l,
    )
    expect(bilan.map((b) => [b.periode, b.compte, b.ecart])).toEqual([
      ['midi', 1, -1],
      ['soir', 1, 0],
    ])
    // Une place de midi a son propre identifiant, distinct de tous.
    const ids = new Set<number>()
    for (let j = 0; j < 7; j++)
      for (const m of momentsDuTableau(l)) ids.add(idPlaceAccueil(j, m, l))
    expect(ids.size).toBe(28)
  })

  it('la journée de l’accueil va du premier au dernier moment demandé', () => {
    const c = (debut: number, fin: number, m: string) => ({
      debut: debut * H,
      fin: fin * H,
      presence: [m],
    })
    const cands = [c(7, 15, 'matin'), c(11, 16, 'midi'), c(15, 23, 'soir')]
    expect(plageAccueil(cands, new Set(['midi']), [], l)).toEqual({
      debut: 11 * H,
      fin: 16 * H,
    })
    expect(plageAccueil(cands, new Set(['matin', 'midi']), [], l)).toEqual({
      debut: 7 * H,
      fin: 16 * H,
    })
  })

  it('refusé : sans moment de jour au tableau, aucune journée à tenir', () => {
    const seul = lireMoments(
      momentsAvec({
        matin: { compte_dans_tableau: false },
        soir: { compte_dans_tableau: false },
      }),
    )
    expect(momentsDeJour(seul)).toEqual([])
    expect(
      plageAccueil(
        [{ debut: 7 * H, fin: 15 * H, presence: ['matin'] }],
        new Set(['matin']),
        [],
        seul,
      ),
    ).toBeNull()
  })
})

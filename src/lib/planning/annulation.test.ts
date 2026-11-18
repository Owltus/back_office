import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Absence, Affectation } from '#/lib/planning/types.ts'
import type { DonneesShifts } from '#/lib/planning/service.ts'

/*
 * Annuler / rétablir (Ctrl+Z / Ctrl+Y, 2026-11-18). Oracle : la demande.
 * Annuler remet chaque case changée dans son état d'avant, rétablir dans son
 * état d'après ; ce qui n'a pas changé n'est jamais touché ; la base refuse
 * si une case n'est plus dans l'état attendu.
 */

const appels: unknown[][] = []
let etat: DonneesShifts = { affectations: [], absences: [] }
vi.mock('#/lib/planning/service.ts', () => ({
  fetchShifts: vi.fn(async () => structuredClone(etat)),
  restaurerCases: vi.fn(async (cases: unknown[]) => {
    appels.push(cases)
    return cases.length
  }),
}))

const {
  annuler,
  avecHistorique,
  contenusParCase,
  demandeRestauration,
  difference,
  HISTORIQUE_MAX,
  peutAnnuler,
  peutRetablir,
  retablir,
  viderHistorique,
} = await import('#/lib/planning/annulation.ts')
const service = await import('#/lib/planning/service.ts')

const LUNDI = '2026-12-07'
const shift = (
  salarie: number,
  jour: number,
  champs: Partial<Affectation> = {},
): Affectation => ({
  id: salarie * 10 + jour,
  lundi: LUNDI,
  salarie_id: salarie,
  poste_id: 1,
  jour,
  horaire_id: 3,
  debut: '07:00',
  fin: '15:45',
  pause: 45,
  epinglee: false,
  ...champs,
})
const absence = (salarie: number, jour: string, motif = 9): Absence => ({
  id: salarie,
  salarie_id: salarie,
  jour,
  motif_id: motif,
  epinglee: true,
})

beforeEach(() => {
  viderHistorique()
  appels.length = 0
  etat = { affectations: [], absences: [] }
})
afterEach(() => vi.clearAllMocks())

describe('difference : seules les cases changées', () => {
  it('rien ne change : aucune case', () => {
    const e = { affectations: [shift(1, 0)], absences: [] }
    expect(difference(e, structuredClone(e), [LUNDI])).toEqual([])
  })

  it('un shift posé, un shift validé, une absence retirée', () => {
    const avant = {
      affectations: [shift(1, 0)],
      absences: [absence(2, '2026-12-09')],
    }
    const apres = {
      affectations: [shift(1, 0, { epinglee: true, id: 99 }), shift(3, 4)],
      absences: [],
    }
    const d = difference(avant, apres, [LUNDI])
    expect(d.map((c) => [c.salarie_id, c.jour])).toEqual([
      [1, 0],
      [2, 2],
      [3, 4],
    ])
    // L'identifiant d'un shift n'est pas un changement : la base en donne un
    // neuf à chaque nouvelle ligne.
    expect(d[0].avant.shift?.epinglee).toBe(false)
    expect(d[0].apres.shift?.epinglee).toBe(true)
    expect(d[1].apres).toEqual({ shift: null, absence: null })
    expect(d[2].avant).toEqual({ shift: null, absence: null })
  })

  it('une absence d’une semaine hors de la portée est ignorée', () => {
    const m = contenusParCase(
      { affectations: [], absences: [absence(1, '2026-12-14')] },
      [LUNDI],
    )
    expect(m.size).toBe(0)
  })

  it('annuler attend l’après et remet l’avant ; rétablir l’inverse', () => {
    const [c] = difference(
      { affectations: [], absences: [] },
      { affectations: [shift(1, 2)], absences: [] },
      [LUNDI],
    )
    const [a] = demandeRestauration([c], 'annuler')
    expect(a.attendu.shift?.debut).toBe('07:00')
    expect(a.voulu).toEqual({ shift: null, absence: null })
    const [r] = demandeRestauration([c], 'retablir')
    expect(r.attendu).toEqual({ shift: null, absence: null })
    expect(r.voulu.shift?.debut).toBe('07:00')
  })
})

describe('historique du poste', () => {
  const poser = (s: Affectation) =>
    avecHistorique([LUNDI], async () => {
      etat = { ...etat, affectations: [...etat.affectations, s] }
    })

  it('poser, annuler, rétablir', async () => {
    await poser(shift(1, 0))
    expect(peutAnnuler()).toBe(true)
    expect(await annuler()).toBe(1)
    expect(appels).toHaveLength(1)
    expect(peutAnnuler()).toBe(false)
    expect(peutRetablir()).toBe(true)
    expect(await retablir()).toBe(1)
    expect(peutRetablir()).toBe(false)
  })

  it('une action qui ne change rien n’est pas retenue', async () => {
    await avecHistorique([LUNDI], async () => undefined)
    expect(peutAnnuler()).toBe(false)
  })

  it('une nouvelle action efface ce qui pouvait être rétabli', async () => {
    await poser(shift(1, 0))
    await annuler()
    await poser(shift(2, 0))
    expect(peutRetablir()).toBe(false)
  })

  it('une action qui échoue à moitié reste annulable pour ce qui a changé', async () => {
    await expect(
      avecHistorique([LUNDI], async () => {
        etat = { ...etat, affectations: [shift(1, 0)] }
        throw new Error('arrêt')
      }),
    ).rejects.toThrow('arrêt')
    expect(peutAnnuler()).toBe(true)
  })

  it('refus de la base : l’action reste annulable', async () => {
    await poser(shift(1, 0))
    vi.mocked(service.restaurerCases).mockRejectedValueOnce(new Error('PL409'))
    await expect(annuler()).rejects.toThrow('PL409')
    expect(peutAnnuler()).toBe(true)
    expect(peutRetablir()).toBe(false)
  })

  it('une lecture impossible ne fait pas échouer l’action', async () => {
    vi.mocked(service.fetchShifts).mockRejectedValueOnce(new Error('réseau'))
    await expect(poser(shift(1, 0))).resolves.toBeUndefined()
    expect(peutAnnuler()).toBe(false)
  })

  it(`au plus ${HISTORIQUE_MAX} actions`, async () => {
    for (let i = 0; i < HISTORIQUE_MAX + 5; i++)
      await poser(shift(100 + i, i % 7))
    let n = 0
    while (peutAnnuler()) {
      await annuler()
      n++
    }
    expect(n).toBe(HISTORIQUE_MAX)
  })
})

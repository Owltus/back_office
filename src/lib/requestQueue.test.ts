import { describe, expect, it } from 'vitest'

import { createLimiteur } from '#/lib/requestQueue.ts'

/** Promesse que l'on résout à la main, pour piloter l'ordonnancement. */
function differee<T = void>() {
  let resoudre!: (v: T) => void
  let rejeter!: (e: unknown) => void
  const promesse = new Promise<T>((res, rej) => {
    resoudre = res
    rejeter = rej
  })
  return { promesse, resoudre, rejeter }
}

/** Laisse la file de microtâches se vider. */
const respirer = () => new Promise((r) => setTimeout(r, 0))

describe('createLimiteur', () => {
  it('refuse un plafond absurde', () => {
    expect(() => createLimiteur(0)).toThrow()
    expect(() => createLimiteur(-1)).toThrow()
    expect(() => createLimiteur(1.5)).toThrow()
  })

  it('ne dépasse JAMAIS le plafond, même sous cent tâches', async () => {
    const max = 6
    const l = createLimiteur(max)
    let sommet = 0
    let enVol = 0

    await Promise.all(
      Array.from({ length: 100 }, () =>
        l.run(async () => {
          enVol++
          sommet = Math.max(sommet, enVol)
          await respirer()
          enVol--
        }),
      ),
    )

    expect(sommet).toBe(max)
    expect(l.enCours).toBe(0)
    expect(l.enAttente).toBe(0)
  })

  it('ne dépasse pas le plafond quand un appel arrive entre la libération et la reprise du réveillé', async () => {
    /*
     * Course réelle : la tâche A se termine dans une microtâche M1 qui réveille
     * B (sa reprise, M2, part en fin de file). Une microtâche X, mise en file
     * APRÈS M1 mais AVANT M2 (ici par le même tick qui termine A), appelle
     * `run(C)`. Sans transfert du jeton, X voit un jeton libre et une file
     * vide, passe, puis B reprend : deux tâches en vol pour un plafond de un.
     */
    const l = createLimiteur(1)
    let enVol = 0
    let sommet = 0
    const suivie = async () => {
      enVol++
      sommet = Math.max(sommet, enVol)
      await respirer()
      enVol--
    }
    const a = differee()

    const pA = l.run(() => a.promesse)
    const pB = l.run(suivie)
    await respirer()
    expect(l.enAttente).toBe(1)

    let pC: Promise<void> | undefined
    a.resoudre()
    void Promise.resolve().then(() => {
      pC = l.run(suivie)
    })
    await respirer()
    await Promise.all([pA, pB, pC])

    expect(sommet).toBe(1)
    expect(l.enCours).toBe(0)
    expect(l.enAttente).toBe(0)
  })

  it('met bien les surnuméraires en attente', async () => {
    const l = createLimiteur(2)
    const a = differee()
    const b = differee()
    const c = differee()

    void l.run(() => a.promesse)
    void l.run(() => b.promesse)
    void l.run(() => c.promesse)
    await respirer()

    expect(l.enCours).toBe(2)
    expect(l.enAttente).toBe(1)

    a.resoudre()
    await respirer()
    expect(l.enCours).toBe(2)
    expect(l.enAttente).toBe(0)

    b.resoudre()
    c.resoudre()
    await respirer()
    expect(l.enCours).toBe(0)
  })

  it('sert dans l’ordre d’arrivée', async () => {
    const l = createLimiteur(1)
    const ordre: number[] = []
    const portes = [differee(), differee(), differee()]

    const tout = Promise.all(
      portes.map((p, i) =>
        l.run(async () => {
          ordre.push(i)
          await p.promesse
        }),
      ),
    )

    await respirer()
    expect(ordre).toEqual([0])
    portes[0].resoudre()
    await respirer()
    expect(ordre).toEqual([0, 1])
    portes[1].resoudre()
    await respirer()
    expect(ordre).toEqual([0, 1, 2])
    portes[2].resoudre()
    await tout
  })

  it('rend son jeton même quand la tâche échoue', async () => {
    const l = createLimiteur(1)

    await expect(
      l.run(async () => {
        throw new Error('boum')
      }),
    ).rejects.toThrow('boum')

    expect(l.enCours).toBe(0)

    // La file n'est pas gelée : la suivante passe.
    await expect(l.run(async () => 'ok')).resolves.toBe('ok')
  })

  it('un échec ne bloque pas ceux qui patientent derrière', async () => {
    const l = createLimiteur(1)
    const resultats: string[] = []

    const premier = l
      .run(async () => {
        await respirer()
        throw new Error('boum')
      })
      .catch(() => resultats.push('echec'))
    const second = l.run(async () => 'ok').then((v) => resultats.push(v))

    await Promise.all([premier, second])
    expect(resultats).toEqual(['echec', 'ok'])
    expect(l.enCours).toBe(0)
    expect(l.enAttente).toBe(0)
  })

  it('remonte la valeur de la tâche telle quelle', async () => {
    const l = createLimiteur(3)
    const objet = { a: 1 }
    await expect(l.run(async () => objet)).resolves.toBe(objet)
  })
})

import { describe, expect, it } from 'vitest'

import { doitPersister, estSensible, survitAuJson } from '#/lib/queryPersist.ts'
import type { Query } from '@tanstack/react-query'

/*
 * Ce filtre décide ce qui est ÉCRIT SUR LE DISQUE d'un poste de réception
 * PARTAGÉ. Une erreur ici ne dégrade pas l'affichage : elle dépose des noms de
 * clients en clair dans le navigateur, sur une machine que tout le monde
 * utilise — et elle annulerait au passage la purge RGPD serveur des noms PDJ
 * (`lib/pdj/purgeGate.ts`).
 *
 * C'est donc le seul endroit du cache de secours qui mérite des tests, et ils
 * sont écrits pour ÉCHOUER si quelqu'un élargit la persistance sans y penser.
 */

/** Fabrique une `Query` minimale : seuls la clé et le statut sont lus. */
const requete = (
  queryKey: ReadonlyArray<unknown>,
  status: 'success' | 'error' | 'pending' = 'success',
  data: unknown = { ok: true },
) => ({ queryKey, state: { status, data } }) as unknown as Query

describe('estSensible — ce qui ne doit jamais toucher le disque', () => {
  it('refuse les noms des clients du petit-déjeuner', () => {
    expect(estSensible(['pdj', 'day', '2026-09-24'])).toBe(true)
  })

  it('refuse les noms des clients du parking', () => {
    // ⚠ Cette clé est construite par une FONCTION (`reservationsKey` dans
    // ParkingBoard) et n'apparaît pas dans une recherche de `queryKey:`.
    // Elle a failli être oubliée le 2026-09-24 : ce test est son filet.
    expect(estSensible(['parking', 'reservations', '2026-09-01', '2026-09-30'])).toBe(
      true,
    )
  })

  it('refuse les identités du personnel', () => {
    expect(estSensible(['comptes', 'profiles'])).toBe(true)
  })

  it('refuse la facturation entière', () => {
    expect(estSensible(['facturation', 'journal'])).toBe(true)
    expect(estSensible(['facturation', 'issuers'])).toBe(true)
  })

  it('refuse les cautions, lues en select(*) avec commentaire libre', () => {
    expect(estSensible(['caisse', 'cautions'])).toBe(true)
  })
})

describe('estSensible — ce qui a le droit d’être conservé', () => {
  it('accepte les agrégats et analytiques, qui n’ont aucun nom', () => {
    expect(estSensible(['pdj', 'analytics', 2026])).toBe(false)
    expect(estSensible(['pdj', 'agg-range', '2026-09-01', '2026-09-24'])).toBe(false)
    expect(estSensible(['rapro', 'daily-agg', 2026])).toBe(false)
    expect(estSensible(['parking', 'daily-occ', 2026, 9])).toBe(false)
    expect(estSensible(['repjour', 'dashboard', '2026-09-24'])).toBe(false)
  })

  it('accepte les états de chambres, qui ne portent pas de nom', () => {
    // `rapro_occupancy` est une vue SANS nom client (cf. CLAUDE.md) ; les
    // statuts de ménage n'en ont jamais eu.
    expect(estSensible(['rapro', 'occupancy', '2026-09-24'])).toBe(false)
    expect(estSensible(['rapro', 'day', '2026-09-24'])).toBe(false)
  })

  it('n’exclut pas une famille entière à cause d’un seul de ses membres', () => {
    // `caisse/cautions` est refusée, le reste de la caisse ne l'est PAS —
    // sinon la feuille de caisse disparaîtrait de l'écran en panne.
    expect(estSensible(['caisse', 'sheet', '2026-09-24', 'matin'])).toBe(false)
    expect(estSensible(['caisse', 'analytics'])).toBe(false)
    // Idem pour PDJ : seul `day` porte des noms.
    expect(estSensible(['pdj', 'externals', '2026-09-24'])).toBe(false)
  })

  it('ne se laisse pas tromper par un préfixe seulement partiel', () => {
    // `['pdj']` seul n'est pas `['pdj','day']` : la clé de purge globale ne
    // doit pas entraîner l'exclusion de toute la famille.
    expect(estSensible(['pdj'])).toBe(false)
    expect(estSensible(['parking'])).toBe(false)
  })
})

describe('doitPersister', () => {
  it('ne conserve que des lectures RÉUSSIES', () => {
    // Persister une erreur reviendrait à restaurer une panne au démarrage
    // suivant.
    expect(doitPersister(requete(['repjour', 'dashboard', '2026-09-24']))).toBe(true)
    expect(
      doitPersister(requete(['repjour', 'dashboard', '2026-09-24'], 'error')),
    ).toBe(false)
    expect(
      doitPersister(requete(['repjour', 'dashboard', '2026-09-24'], 'pending')),
    ).toBe(false)
  })

  it('refuse une clé sensible même quand la lecture a réussi', () => {
    expect(doitPersister(requete(['pdj', 'day', '2026-09-24']))).toBe(false)
  })

  it('refuse une donnée qui ne survivrait pas au JSON — le bug du 2026-09-25', () => {
    // `RaproDay` tel que le rend `fetchRaproDay` : restauré depuis le disque,
    // `carriedManual` valait `{}` et `/repjour` plantait au premier rendu.
    const raproDay = {
      reportDate: '2026-09-24',
      statuses: new Map([[101, 'refus']]),
      carriedManual: new Set([102]),
      materialized: new Set<number>(),
    }
    expect(
      doitPersister(requete(['rapro', 'day', '2026-09-24'], 'success', raproDay)),
    ).toBe(false)
  })
})

describe('survitAuJson — ce que le disque sait rendre intact', () => {
  it('accepte primitives, tableaux et objets nus, à toute profondeur', () => {
    expect(survitAuJson(null)).toBe(true)
    expect(survitAuJson('x')).toBe(true)
    expect(survitAuJson(0)).toBe(true)
    expect(survitAuJson(false)).toBe(true)
    expect(survitAuJson([])).toBe(true)
    expect(survitAuJson({})).toBe(true)
    expect(survitAuJson({ a: [{ b: [1, 'deux', null, { c: true }] }] })).toBe(true)
    expect(survitAuJson(Object.create(null))).toBe(true)
  })

  it('refuse Set, Map, Date et instances de classe, même enfouis', () => {
    expect(survitAuJson(new Set([1]))).toBe(false)
    expect(survitAuJson(new Map())).toBe(false)
    expect(survitAuJson(new Date())).toBe(false)
    class Ligne {}
    expect(survitAuJson(new Ligne())).toBe(false)
    expect(survitAuJson({ ok: [1, { profond: new Set() }] })).toBe(false)
    expect(survitAuJson([[[new Map()]]])).toBe(false)
  })

  it('refuse ce que JSON remplace par null ou omet', () => {
    expect(survitAuJson(Number.NaN)).toBe(false)
    expect(survitAuJson(Number.POSITIVE_INFINITY)).toBe(false)
    expect(survitAuJson(() => 1)).toBe(false)
    expect(survitAuJson(10n)).toBe(false)
  })

  it('tout ce qu il accepte ressort du round-trip JSON identique', () => {
    // Oracle indépendant : la définition même de la fonction.
    const acceptes: unknown[] = [
      { caJour: 4242, lignes: [{ room: 101, ok: true, note: null }] },
      [1, [2, [3, 'quatre']]],
      { vide: {}, liste: [] },
    ]
    for (const v of acceptes) {
      expect(survitAuJson(v)).toBe(true)
      expect(JSON.parse(JSON.stringify(v))).toEqual(v)
    }
  })
})

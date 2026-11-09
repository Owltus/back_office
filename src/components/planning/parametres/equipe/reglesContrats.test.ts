import { describe, expect, it } from 'vitest'

import {
  avertissementsSaisie,
  erreursSaisie,
  ligneNeuve,
  modelesChanges,
  phraseLigne,
  reglagesDepuis,
  saisieDepuis,
} from '#/components/planning/parametres/equipe/reglesContrats.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import type { Reglages } from '#/lib/planning/types.ts'

/*
 * Règles des contrats (étape 5) : la saisie relue puis renvoyée telle quelle
 * redonne EXACTEMENT les règles de la base (rien ne change sans geste), et
 * les erreurs de saisie reprennent la loi et les CHECK.
 */

const H = 60
const vide = { reglages: {} as Reglages }

describe('aller-retour', () => {
  it('sans geste, les règles écrites sont celles lues', () => {
    const s = saisieDepuis(vide)
    const r = reglagesDepuis(s)
    expect(r.journees_contrats).toEqual([
      { minutes_hebdo: 35 * H, durees: [7 * H], courtes_max: 0 },
      { minutes_hebdo: 39 * H, durees: [8 * H, 7 * H], courtes_max: 1 },
    ])
    const relu = lireRegles({ reglages: { ...r } })
    expect(relu).toEqual(lireRegles(vide))
    expect(erreursSaisie(s)).toEqual([])
    expect(avertissementsSaisie(s)).toEqual([])
    expect(modelesChanges(s, s)).toEqual([])
  })

  it('la clé des lignes ne change pas d’une lecture à l’autre', () => {
    expect(saisieDepuis(vide).journees.map((l) => l.cle)).toEqual(
      saisieDepuis(vide).journees.map((l) => l.cle),
    )
  })

  it('un type de contrat changé est le seul envoyé', () => {
    const s = saisieDepuis(vide)
    const t = {
      ...s,
      modeles: s.modeles.map((m) =>
        m.type_contrat === 'cdd' ? { ...m, journee_etoile: false } : m,
      ),
    }
    expect(modelesChanges(s, t).map((m) => m.type_contrat)).toEqual(['cdd'])
  })
})

describe('erreurs de saisie', () => {
  it('accepté : une ligne neuve sur une durée libre', () => {
    const s = saisieDepuis(vide)
    const l = ligneNeuve(s)
    expect([35 * H, 39 * H]).not.toContain(l.minutes)
    expect(erreursSaisie({ ...s, journees: [...s.journees, l] })).toEqual([])
  })

  it('refusé : deux fois le même contrat', () => {
    const s = saisieDepuis(vide)
    const double = { ...s.journees[0], cle: 'x' }
    expect(erreursSaisie({ ...s, journees: [...s.journees, double] })).toEqual([
      'Contrat de 35 h : il est déjà dans la liste.',
    ])
  })

  it('refusé : une journée étoile à 35 h ou moins', () => {
    const s = saisieDepuis(vide)
    const journees = s.journees.map((l, i) =>
      i === 0 ? { ...l, mode: 'etoile' as const, courte: 7 * H } : l,
    )
    expect(erreursSaisie({ ...s, journees })).toContain(
      "Contrat de 35 h : la journée étoile ne vaut qu'au-delà de 35 h par semaine.",
    )
  })

  it('refusé : plus de 6 jours de travail par semaine (la loi)', () => {
    const s = saisieDepuis(vide)
    const journees = s.journees.map((l, i) =>
      i === 1 ? { ...l, mode: 'egales' as const, duree: 5 * H } : l,
    )
    expect(erreursSaisie({ ...s, journees }).join(' ')).toMatch(
      /8 jours par semaine, plus que les 6/,
    )
  })

  it('refusé : journée étoile pas plus courte que la journée pleine', () => {
    const s = saisieDepuis(vide)
    expect(erreursSaisie({ ...s, journee_etoile_min: 8 * H })).toContain(
      'La journée étoile doit être plus courte que la journée pleine (8 h).',
    )
  })

  it('refusé : conseillé au-delà du plafond, fériés rattrapés et pris', () => {
    const s = saisieDepuis(vide)
    expect(
      erreursSaisie({
        ...s,
        jours_affiles_conseilles: 6,
        jours_affiles_max: 5,
      }),
    ).toHaveLength(1)
    const m = s.modeles.map((x) => ({ ...x, feries_jour_meme: true }))
    expect(erreursSaisie({ ...s, modeles: m }).join(' ')).toMatch(
      /jour même ou les rattrape/,
    )
  })

  it('averti sans bloquer : des journées qui ne tombent pas juste', () => {
    const s = saisieDepuis(vide)
    const journees = s.journees.map((l, i) =>
      i === 1 ? { ...l, minutes: 37 * H } : l,
    )
    expect(erreursSaisie({ ...s, journees })).toEqual([])
    expect(avertissementsSaisie({ ...s, journees })).toHaveLength(1)
  })
})

describe('phrases', () => {
  it('le 39 h : journées de 8 h et une journée étoile de 7 h, 5 jours', () => {
    const s = saisieDepuis(vide)
    expect(phraseLigne(s.journees[1], s.journee_pleine)).toBe(
      'Le planning pose des journées de 8 h et une journée étoile de 7 h. Soit 5 jours de travail par semaine.',
    )
    expect(phraseLigne(s.journees[0], s.journee_pleine)).toBe(
      'Le planning ne pose que des journées de 7 h. Soit 5 jours de travail par semaine.',
    )
  })
})

describe('relecture adverse du 2026-11-05', () => {
  it('3. journée pleine de 6 h : la journée courte suit, la base l’accepte', () => {
    const s = { ...saisieDepuis(vide), journee_pleine: 6 * H }
    s.journee_etoile_min = 5 * H
    const r = reglagesDepuis(s)
    // CHECK de la base : journee_courte <= journee_pleine.
    expect(r.journee_courte).toBeDefined()
    expect(r.journee_courte!).toBeLessThanOrEqual(r.journee_pleine!)
    // Sans geste, la journée courte lue est renvoyée telle quelle.
    expect(reglagesDepuis(saisieDepuis(vide)).journee_courte).toBe(7 * H)
  })

  it('4. un seul jour d’affilée conseillé avec le jour seul interdit : refusé', () => {
    // Sans le rythme 5 et 2 strict, qui demande 5 jours d'affilée (plus bas).
    const s = {
      ...saisieDepuis(vide),
      jours_affiles_conseilles: 1,
      rythme_strict: false,
    }
    expect(erreursSaisie(s).join(' ')).toMatch(/au moins 2 jours d'affilée/)
    expect(erreursSaisie({ ...s, jour_isole: 'a_eviter' })).toEqual([])
  })
})

describe('rythme 5 jours puis 2 jours strict (2026-11-09)', () => {
  it('lu en base, oui par défaut, et renvoyé tel quel', () => {
    expect(saisieDepuis(vide).rythme_strict).toBe(true)
    expect(reglagesDepuis(saisieDepuis(vide)).rythme_strict).toBe(true)
    const non = saisieDepuis({ ...vide, reglages: { rythme_strict: false } })
    expect(non.rythme_strict).toBe(false)
    expect(reglagesDepuis(non).rythme_strict).toBe(false)
  })
  it('accepté avec 5 jours d’affilée conseillés, refusé en dessous', () => {
    expect(erreursSaisie(saisieDepuis(vide))).toEqual([])
    const s = { ...saisieDepuis(vide), jours_affiles_conseilles: 4 }
    expect(erreursSaisie(s).join(' ')).toMatch(/au moins 5 jours d'affilée/)
    expect(erreursSaisie({ ...s, rythme_strict: false })).toEqual([])
  })
})
